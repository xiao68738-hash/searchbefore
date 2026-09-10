import importlib.util
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("gridline_v4", SCRIPT_DIR / "run-gridline-cell-benchmark-v4.py")
gridline_v4 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gridline_v4)
gridline_v3 = gridline_v4.gridline_v3
gridline_v2 = gridline_v4.gridline_v2

MAX_ANALYSIS_EDGE = 1800


def projection_cells(gray, threshold=5, density=0.42):
    all_cells = []
    diagnostics = []
    for region_index, (x1, y1, x2, y2) in enumerate(gridline_v4.page_regions(gray)):
        if x2 - x1 < 80 or y2 - y1 < 80:
            continue
        crop = gray.crop((x1, y1, x2, y2))
        mask = gridline_v4.local_contrast_mask(crop, threshold)
        horizontal = gridline_v2.detect_horizontal_lines(mask, density=density)
        vertical = gridline_v2.detect_vertical_lines(mask, density=density)
        horizontal = [line for line in horizontal if line["end"] - line["start"] >= crop.width * 0.22]
        vertical = [line for line in vertical if line["end"] - line["start"] >= crop.height * 0.22]
        cells = gridline_v2.build_cells(horizontal, vertical, crop.width, crop.height)
        horizontal_coverage = [
            (line["end"] - line["start"]) / crop.width for line in horizontal
        ]
        vertical_coverage = [
            (line["end"] - line["start"]) / crop.height for line in vertical
        ]
        max_column = max((cell["columnIndex"] for cell in cells), default=-1) + 1
        max_row = max((cell["rowIndex"] for cell in cells), default=-1) + 1
        widths = [cell["polygon"][1][0] - cell["polygon"][0][0] for cell in cells]
        width_cv = float(np.std(widths) / np.mean(widths)) if widths and np.mean(widths) else float("inf")
        plausible = (
            100 <= len(cells) <= 900
            and max_column <= 40
            and max_row <= 120
            and width_cv <= 1.25
            and (not horizontal_coverage or float(np.median(horizontal_coverage)) >= 0.70)
        )
        if plausible:
            for cell in cells:
                cell["polygon"] = [[point[0] + x1, point[1] + y1] for point in cell["polygon"]]
                cell["regionIndex"] = region_index
            all_cells.extend(cells)
        diagnostics.append({
            "regionIndex": region_index,
            "bounds": [x1, y1, x2, y2],
            "horizontalLineCount": len(horizontal),
            "verticalLineCount": len(vertical),
            "candidateCellCount": len(cells),
            "horizontalCoverageMedian": round(float(np.median(horizontal_coverage)), 4) if horizontal_coverage else 0,
            "verticalCoverageMedian": round(float(np.median(vertical_coverage)), 4) if vertical_coverage else 0,
            "cellWidthCv": round(width_cv, 4) if np.isfinite(width_cv) else None,
            "accepted": plausible,
        })
    # A two-page spread can pass each page-level gate while producing an
    # implausibly dense combined lattice. Keep the fallback conservative.
    if len(all_cells) > 900:
        for item in diagnostics:
            item["accepted"] = False
            item["rejectedByCombinedCellLimit"] = True
        return [], diagnostics
    return all_cells, diagnostics


def analyze(image, threshold=5, density=0.42):
    baseline_cells, baseline_diagnostics = gridline_v4.analyze(image)
    if baseline_cells:
        return baseline_cells, {**baseline_diagnostics, "selectedLane": "v4-preserved", "projectionRegions": []}

    scale = min(1.0, MAX_ANALYSIS_EDGE / max(image.width, image.height))
    gray = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS).convert("L")
    angle, _, _ = gridline_v3.estimate_skew(gray)
    deskewed = gray.rotate(angle, Image.Resampling.BICUBIC, expand=False, fillcolor=255) if angle else gray
    cells, regions = projection_cells(deskewed, threshold=threshold, density=density)
    inverse_scale = 1 / scale
    for cell in cells:
        restored = [gridline_v3.rotate_point_back(point, angle, gray.width, gray.height) for point in cell["polygon"]]
        cell["polygon"] = [[
            round(max(0, min(image.width, x * inverse_scale)), 3),
            round(max(0, min(image.height, y * inverse_scale)), 3),
        ] for x, y in restored]
    return cells, {
        **baseline_diagnostics,
        "selectedLane": "regional-grid-projection" if cells else "v4-empty",
        "projectionThreshold": threshold,
        "projectionDensity": density,
        "projectionRegions": regions,
    }


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/run-gridline-cell-benchmark-v5.py <ground-truth-root> <private-output> [limit] [threshold] [density]")
    gt_root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    private_root = Path("D:/SearchBefore/private").resolve()
    if private_root not in output.parents:
        raise SystemExit(f"Predictions must stay under {private_root}")
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    threshold = int(sys.argv[4]) if len(sys.argv) > 4 else 5
    density = float(sys.argv[5]) if len(sys.argv) > 5 else 0.42
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
            "model": "naf-gridline-v5-regional-projection",
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
