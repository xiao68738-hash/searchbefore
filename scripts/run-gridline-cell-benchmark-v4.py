import importlib.util
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("gridline_v3", SCRIPT_DIR / "run-gridline-cell-benchmark-v3.py")
gridline_v3 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gridline_v3)
gridline_v2 = gridline_v3.gridline_v2

MAX_ANALYSIS_EDGE = 1800


def longest_range(values, minimum_length):
    ranges = gridline_v2.contiguous_ranges(values)
    eligible = [item for item in ranges if item[1] - item[0] + 1 >= minimum_length]
    return max(eligible, key=lambda item: item[1] - item[0], default=None)


def paper_bounds(gray, x1, y1, x2, y2):
    pixels = np.asarray(gray)[y1:y2, x1:x2]
    if not pixels.size:
        return x1, y1, x2, y2
    column_range = longest_range(pixels.mean(axis=0) >= 70, max(20, pixels.shape[1] // 5))
    row_range = longest_range(pixels.mean(axis=1) >= 70, max(20, pixels.shape[0] // 5))
    if column_range:
        x1, x2 = x1 + column_range[0], x1 + column_range[1] + 1
    if row_range:
        y1, y2 = y1 + row_range[0], y1 + row_range[1] + 1
    inset_x = max(2, round((x2 - x1) * 0.008))
    inset_y = max(2, round((y2 - y1) * 0.008))
    return x1 + inset_x, y1 + inset_y, x2 - inset_x, y2 - inset_y


def page_regions(gray):
    width, height = gray.size
    if width / height < 1.20:
        return [paper_bounds(gray, 0, 0, width, height)]

    pixels = np.asarray(gray)
    low, high = round(width * 0.40), round(width * 0.60)
    # Bound volumes commonly contain a dark gutter near the centre. Splitting
    # there keeps the gutter from dominating local-background estimation.
    gutter = low + int(np.argmin(pixels[:, low:high].mean(axis=0)))
    gap = max(2, round(width * 0.004))
    return [
        paper_bounds(gray, 0, 0, max(1, gutter - gap), height),
        paper_bounds(gray, min(width - 1, gutter + gap), 0, width, height),
    ]


def local_contrast_mask(gray, threshold):
    pixels = np.asarray(gray).astype(np.int16)
    background = np.asarray(gray.filter(ImageFilter.BoxBlur(radius=18))).astype(np.int16)
    return (background - pixels) >= threshold


def detect_region_cells(gray, threshold=7, density=0.68):
    all_cells = []
    region_diagnostics = []
    for region_index, (x1, y1, x2, y2) in enumerate(page_regions(gray)):
        if x2 - x1 < 80 or y2 - y1 < 80:
            continue
        crop = gray.crop((x1, y1, x2, y2))
        contrast = local_contrast_mask(crop, threshold)
        fixed = np.asarray(crop) <= gridline_v2.PIXEL_THRESHOLD
        horizontal = gridline_v2.detect_horizontal_lines(fixed, density=0.62)
        vertical = gridline_v2.detect_vertical_lines(contrast, density=density)
        horizontal = [line for line in horizontal if line["end"] - line["start"] >= crop.width * 0.06]
        vertical = [line for line in vertical if line["end"] - line["start"] >= crop.height * 0.06]
        cells = gridline_v2.build_cells(horizontal, vertical, crop.width, crop.height)
        # Reject page-wide texture responses before they can displace the TATR
        # fallback. NAF ground-truth tables never exceed these broad limits.
        max_column = max((cell["columnIndex"] for cell in cells), default=-1) + 1
        max_row = max((cell["rowIndex"] for cell in cells), default=-1) + 1
        plausible = 10 <= len(cells) <= 1800 and max_column <= 40 and max_row <= 120
        if plausible:
            for cell in cells:
                cell["polygon"] = [[point[0] + x1, point[1] + y1] for point in cell["polygon"]]
                cell["regionIndex"] = region_index
            all_cells.extend(cells)
        region_diagnostics.append({
            "regionIndex": region_index,
            "bounds": [x1, y1, x2, y2],
            "horizontalLineCount": len(horizontal),
            "verticalLineCount": len(vertical),
            "candidateCellCount": len(cells),
            "accepted": plausible,
        })
    return all_cells, region_diagnostics


def analyze(image, threshold=7, density=0.68):
    baseline_cells, baseline_diagnostics = gridline_v3.analyze(image)
    if baseline_cells:
        return baseline_cells, {**baseline_diagnostics, "selectedLane": "v3-preserved", "regions": []}

    scale = min(1.0, MAX_ANALYSIS_EDGE / max(image.width, image.height))
    gray = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS).convert("L")
    angle, _, _ = gridline_v3.estimate_skew(gray)
    deskewed = gray.rotate(angle, Image.Resampling.BICUBIC, expand=False, fillcolor=255) if angle else gray
    cells, regions = detect_region_cells(deskewed, threshold=threshold, density=density)
    inverse_scale = 1 / scale
    for cell in cells:
        restored = [gridline_v3.rotate_point_back(point, angle, gray.width, gray.height) for point in cell["polygon"]]
        cell["polygon"] = [[
            round(max(0, min(image.width, x * inverse_scale)), 3),
            round(max(0, min(image.height, y * inverse_scale)), 3),
        ] for x, y in restored]
    return cells, {
        **baseline_diagnostics,
        "selectedLane": "page-region-local-contrast" if cells else "v3-empty",
        "regionThreshold": threshold,
        "regionLineDensity": density,
        "regions": regions,
    }


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/run-gridline-cell-benchmark-v4.py <ground-truth-root> <private-output> [limit] [threshold] [density]")
    gt_root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    private_root = Path("D:/SearchBefore/private").resolve()
    if private_root not in output.parents:
        raise SystemExit(f"Predictions must stay under {private_root}")
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    threshold = int(sys.argv[4]) if len(sys.argv) > 4 else 7
    density = float(sys.argv[5]) if len(sys.argv) > 5 else 0.68
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
    documents = manifest["documents"][:limit] if limit else manifest["documents"]
    for index, entry in enumerate(documents, start=1):
        ground_truth = json.loads((gt_root / entry["groundTruth"]).read_text(encoding="utf-8"))
        image = Image.open(ground_truth["image"]["privatePath"]).convert("RGB")
        started = time.perf_counter()
        cells, diagnostics = analyze(image, threshold=threshold, density=density)
        normalized = {
            "schemaVersion": 1,
            "provider": "local-gridline-detector",
            "model": "naf-gridline-v4-page-regions",
            "documentId": entry["id"],
            "processingMs": round((time.perf_counter() - started) * 1000),
            "textRecognition": {"status": "not-applicable-structure-only"},
            "tables": [{"tableIndex": 0, "cells": cells, "diagnostics": diagnostics}] if cells else [],
        }
        (output / f'{entry["id"]}.json').write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "completed": index,
            "total": len(documents),
            "documentId": entry["id"],
            "cellCount": len(cells),
            "processingMs": normalized["processingMs"],
            "selectedLane": diagnostics["selectedLane"],
        }))


if __name__ == "__main__":
    main()
