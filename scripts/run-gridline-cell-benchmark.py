import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image


MAX_ANALYSIS_EDGE = 1800
PIXEL_THRESHOLD = 190
LINE_DENSITY = 0.72


def contiguous_ranges(values):
    indexes = np.flatnonzero(values)
    if not len(indexes):
        return []
    breaks = np.flatnonzero(np.diff(indexes) > 1)
    starts = np.r_[indexes[0], indexes[breaks + 1]]
    ends = np.r_[indexes[breaks], indexes[-1]]
    return [(int(start), int(end)) for start, end in zip(starts, ends)]


def rolling_density(binary, window, axis):
    cumulative = np.cumsum(binary, axis=axis, dtype=np.int32)
    padding_shape = list(binary.shape)
    padding_shape[axis] = 1
    cumulative = np.concatenate([np.zeros(padding_shape, dtype=np.int32), cumulative], axis=axis)
    if axis == 1:
        return (cumulative[:, window:] - cumulative[:, :-window]) / window
    return (cumulative[window:, :] - cumulative[:-window, :]) / window


def merge_segments(segments, coordinate_key, start_key, end_key):
    if not segments:
        return []
    segments.sort(key=lambda item: (item[coordinate_key], item[start_key]))
    groups = []
    for item in segments:
        best = None
        best_overlap = 0
        for group in reversed(groups[-12:]):
            if item[coordinate_key] - group["lastCoordinate"] > 2:
                break
            overlap = min(item[end_key], group["end"]) - max(item[start_key], group["start"])
            shorter = max(1, min(item[end_key] - item[start_key], group["end"] - group["start"]))
            if overlap / shorter >= 0.55 and overlap > best_overlap:
                best = group
                best_overlap = overlap
        if best is None:
            groups.append({
                "coordinates": [item[coordinate_key]],
                "lastCoordinate": item[coordinate_key],
                "start": item[start_key],
                "end": item[end_key],
            })
        else:
            best["coordinates"].append(item[coordinate_key])
            best["lastCoordinate"] = item[coordinate_key]
            best["start"] = min(best["start"], item[start_key])
            best["end"] = max(best["end"], item[end_key])
    return [{
        "coordinate": float(np.median(group["coordinates"])),
        "start": float(group["start"]),
        "end": float(group["end"]),
        "thickness": len(set(group["coordinates"])),
    } for group in groups]


def merge_axis_bands(segments, coordinate_key, start_key, end_key):
    """Merge all long-line evidence on adjacent scan lines into one boundary."""
    if not segments:
        return []
    by_coordinate = {}
    for item in segments:
        coordinate = item[coordinate_key]
        band = by_coordinate.setdefault(coordinate, {"start": item[start_key], "end": item[end_key]})
        band["start"] = min(band["start"], item[start_key])
        band["end"] = max(band["end"], item[end_key])
    groups = []
    for coordinate, band in sorted(by_coordinate.items()):
        if groups and coordinate - groups[-1]["coordinates"][-1] <= 2:
            groups[-1]["coordinates"].append(coordinate)
            groups[-1]["start"] = min(groups[-1]["start"], band["start"])
            groups[-1]["end"] = max(groups[-1]["end"], band["end"])
        else:
            groups.append({"coordinates": [coordinate], "start": band["start"], "end": band["end"]})
    return [{
        "coordinate": float(np.median(group["coordinates"])),
        "start": float(group["start"]),
        "end": float(group["end"]),
        "thickness": len(group["coordinates"]),
    } for group in groups]


def detect_horizontal_lines(binary, density=LINE_DENSITY):
    height, width = binary.shape
    window = max(45, width // 28)
    dense = rolling_density(binary, window, axis=1) >= density
    segments = []
    for y in range(height):
        for start, end in contiguous_ranges(dense[y]):
            # Rolling-window centers are offset by half the kernel.
            x1 = start + window / 2
            x2 = end + window / 2
            if x2 - x1 >= max(12, width * 0.015):
                segments.append({"y": y, "x1": x1, "x2": x2})
    return merge_axis_bands(segments, "y", "x1", "x2")


def detect_vertical_lines(binary, density=LINE_DENSITY):
    height, width = binary.shape
    window = max(32, height // 42)
    dense = rolling_density(binary, window, axis=0) >= density
    segments = []
    for x in range(width):
        for start, end in contiguous_ranges(dense[:, x]):
            y1 = start + window / 2
            y2 = end + window / 2
            if y2 - y1 >= max(10, height * 0.012):
                segments.append({"x": x, "y1": y1, "y2": y2})
    return merge_axis_bands(segments, "x", "y1", "y2")


def covers(line, start, end, tolerance=5):
    return line["start"] <= start + tolerance and line["end"] >= end - tolerance


def build_cells(horizontal, vertical, width, height):
    horizontal = sorted(horizontal, key=lambda item: item["coordinate"])
    vertical = sorted(vertical, key=lambda item: item["coordinate"])
    cells = []
    min_height = max(5, height * 0.003)
    max_height = height * 0.18
    min_width = max(6, width * 0.003)
    max_width = width * 0.28

    # Adjacent detected horizontal boundaries define a candidate row. Vertical
    # segments must span that row, which removes handwriting and page borders.
    for row_index, (top, bottom) in enumerate(zip(horizontal, horizontal[1:])):
        y1, y2 = top["coordinate"], bottom["coordinate"]
        if not min_height <= y2 - y1 <= max_height:
            continue
        overlap_start = max(top["start"], bottom["start"])
        overlap_end = min(top["end"], bottom["end"])
        boundaries = [line for line in vertical
                      if overlap_start - 5 <= line["coordinate"] <= overlap_end + 5
                      and covers(line, y1, y2)]
        for column_index, (left, right) in enumerate(zip(boundaries, boundaries[1:])):
            x1, x2 = left["coordinate"], right["coordinate"]
            if not min_width <= x2 - x1 <= max_width:
                continue
            if not covers(top, x1, x2) or not covers(bottom, x1, x2):
                continue
            cells.append({
                "rowIndex": row_index,
                "columnIndex": column_index,
                "rowSpan": 1,
                "columnSpan": 1,
                "polygon": [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
                "text": "",
                "confidence": None,
            })
    return cells


def analyze(image):
    scale = min(1.0, MAX_ANALYSIS_EDGE / max(image.width, image.height))
    analyzed = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS).convert("L")
    pixels = np.asarray(analyzed)
    # A fixed conservative threshold keeps faint ruling lines while the long-run
    # tests reject isolated handwriting strokes.
    binary = pixels <= PIXEL_THRESHOLD
    horizontal = detect_horizontal_lines(binary)
    vertical = detect_vertical_lines(binary)
    cells = build_cells(horizontal, vertical, analyzed.width, analyzed.height)
    inverse = 1 / scale
    for cell in cells:
        cell["polygon"] = [[round(x * inverse, 3), round(y * inverse, 3)] for x, y in cell["polygon"]]
    return cells, {
        "analysisScale": scale,
        "horizontalLineCount": len(horizontal),
        "verticalLineCount": len(vertical),
        "pixelThreshold": PIXEL_THRESHOLD,
        "lineDensity": LINE_DENSITY,
    }


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/run-gridline-cell-benchmark.py <ground-truth-root> <private-output> [limit]")
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
            "model": "naf-gridline-v2",
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
            **diagnostics,
        }))


if __name__ == "__main__":
    main()
