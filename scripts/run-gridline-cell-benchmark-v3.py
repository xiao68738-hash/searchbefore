import importlib.util
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("gridline_v2", SCRIPT_DIR / "run-gridline-cell-benchmark.py")
gridline_v2 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gridline_v2)

MAX_ANALYSIS_EDGE = 1800
MAX_SKEW_EDGE = 700


def projection_score(image):
    pixels = np.asarray(image)
    margin_y = max(1, pixels.shape[0] // 20)
    margin_x = max(1, pixels.shape[1] // 20)
    pixels = pixels[margin_y:-margin_y, margin_x:-margin_x]
    binary = pixels <= 190
    row_density = binary.mean(axis=1)
    column_density = binary.mean(axis=0)
    # Aligned ruling lines concentrate the same number of dark pixels into
    # fewer projections, increasing the squared-density energy.
    return float(np.mean(row_density ** 2) + np.mean(column_density ** 2))


def estimate_skew(image):
    scale = min(1.0, MAX_SKEW_EDGE / max(image.width, image.height))
    thumbnail = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.BILINEAR).convert("L")
    coarse = np.arange(-2.0, 2.01, 0.5)
    coarse_scores = [(float(angle), projection_score(thumbnail.rotate(float(angle), Image.Resampling.BILINEAR, expand=False, fillcolor=255))) for angle in coarse]
    coarse_best = max(coarse_scores, key=lambda item: item[1])[0]
    fine = np.arange(max(-2.5, coarse_best - 0.5), min(2.5, coarse_best + 0.5) + 0.001, 0.1)
    fine_scores = [(float(angle), projection_score(thumbnail.rotate(float(angle), Image.Resampling.BILINEAR, expand=False, fillcolor=255))) for angle in fine]
    best_angle, best_score = max(fine_scores, key=lambda item: item[1])
    zero_score = projection_score(thumbnail)
    # Ignore negligible gains so clean pages are not needlessly resampled.
    if best_score < zero_score * 1.015:
        return 0.0, zero_score, best_score
    return round(best_angle, 3), zero_score, best_score


def adaptive_binary(gray):
    pixels = np.asarray(gray).astype(np.int16)
    background = np.asarray(gray.filter(ImageFilter.BoxBlur(radius=18))).astype(np.int16)
    return (pixels <= 145) | (pixels <= background - 13)


def rotate_point_back(point, angle, width, height):
    if not angle:
        return point
    x, y = point
    center_x, center_y = width / 2, height / 2
    radians = math.radians(-angle)
    cosine, sine = math.cos(radians), math.sin(radians)
    offset_x, offset_y = x - center_x, y - center_y
    return [
        offset_x * cosine - offset_y * sine + center_x,
        offset_x * sine + offset_y * cosine + center_y,
    ]


def detect_cells(binary, density):
    horizontal = gridline_v2.detect_horizontal_lines(binary, density=density)
    vertical = gridline_v2.detect_vertical_lines(binary, density=density)
    cells = gridline_v2.build_cells(horizontal, vertical, binary.shape[1], binary.shape[0])
    return cells, horizontal, vertical


def analyze(image):
    scale = min(1.0, MAX_ANALYSIS_EDGE / max(image.width, image.height))
    gray = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS).convert("L")
    fixed = np.asarray(gray) <= gridline_v2.PIXEL_THRESHOLD
    cells, horizontal, vertical = detect_cells(fixed, density=gridline_v2.LINE_DENSITY)
    selected_lane = "v2-fixed-preserved"
    angle = 0.0
    zero_score = best_score = projection_score(gray.resize((min(MAX_SKEW_EDGE, gray.width), round(gray.height * min(1.0, MAX_SKEW_EDGE / gray.width))), Image.Resampling.BILINEAR))

    # Preserve v2 whenever it finds a plausible grid. Deskewing and adaptive
    # thresholding are limited to documents where v2 returned fewer than 20
    # cells, avoiding regressions on already clean tables.
    if len(cells) < 20:
        angle, zero_score, best_score = estimate_skew(gray)
        deskewed = gray.rotate(angle, Image.Resampling.BICUBIC, expand=False, fillcolor=255) if angle else gray
        deskewed_fixed = np.asarray(deskewed) <= gridline_v2.PIXEL_THRESHOLD
        candidate_cells, candidate_horizontal, candidate_vertical = detect_cells(deskewed_fixed, density=gridline_v2.LINE_DENSITY)
        candidate_lane = "deskewed-fixed-fallback"
        if len(candidate_cells) < 20:
            candidate_cells, candidate_horizontal, candidate_vertical = detect_cells(adaptive_binary(deskewed), density=0.42)
            candidate_lane = "deskewed-adaptive-fallback"
        if 0 < len(candidate_cells) <= 3000:
            cells = candidate_cells
            horizontal = candidate_horizontal
            vertical = candidate_vertical
            selected_lane = candidate_lane

    inverse_scale = 1 / scale
    for cell in cells:
        restored = [rotate_point_back(point, angle, gray.width, gray.height) for point in cell["polygon"]]
        cell["polygon"] = [[round(max(0, min(image.width, x * inverse_scale)), 3),
                            round(max(0, min(image.height, y * inverse_scale)), 3)] for x, y in restored]
    return cells, {
        "analysisScale": scale,
        "deskewAngleDegrees": angle,
        "deskewZeroScore": zero_score,
        "deskewBestScore": best_score,
        "selectedLane": selected_lane,
        "horizontalLineCount": len(horizontal),
        "verticalLineCount": len(vertical),
    }


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/run-gridline-cell-benchmark-v3.py <ground-truth-root> <private-output> [limit]")
    gt_root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    private_root = Path("D:/SearchBefore/private").resolve()
    if private_root not in output.parents:
        raise SystemExit(f"Predictions must stay under {private_root}")
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
    documents = manifest["documents"][:limit] if limit else manifest["documents"]
    for index, entry in enumerate(documents, start=1):
        gt = json.loads((gt_root / entry["groundTruth"]).read_text(encoding="utf-8"))
        image = Image.open(gt["image"]["privatePath"]).convert("RGB")
        started = time.perf_counter()
        cells, diagnostics = analyze(image)
        normalized = {
            "schemaVersion": 1,
            "provider": "local-gridline-detector",
            "model": "naf-gridline-v3-deskew-adaptive",
            "documentId": entry["id"],
            "processingMs": round((time.perf_counter() - started) * 1000),
            "textRecognition": {"status": "not-applicable-structure-only"},
            "tables": [{"tableIndex": 0, "cells": cells, "diagnostics": diagnostics}] if cells else [],
        }
        (output / f'{entry["id"]}.json').write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"completed": index, "total": len(documents), "documentId": entry["id"], "cellCount": len(cells), "processingMs": normalized["processingMs"], **diagnostics}))


if __name__ == "__main__":
    main()
