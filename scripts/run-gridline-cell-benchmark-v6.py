import importlib.util
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SCRIPT_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("gridline_v5", SCRIPT_DIR / "run-gridline-cell-benchmark-v5.py")
gridline_v5 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gridline_v5)
gridline_v4 = gridline_v5.gridline_v4
gridline_v3 = gridline_v5.gridline_v3
gridline_v2 = gridline_v5.gridline_v2

MAX_ANALYSIS_EDGE = 1800


def longest_regular_run(lines, minimum_gap=20, maximum_gap=42):
    ordered = sorted(lines, key=lambda item: item["coordinate"])
    if not ordered:
        return []
    lengths = [1] * len(ordered)
    previous = [-1] * len(ordered)
    for index, current in enumerate(ordered):
        for candidate in range(index):
            gap = current["coordinate"] - ordered[candidate]["coordinate"]
            if minimum_gap <= gap <= maximum_gap and lengths[candidate] + 1 > lengths[index]:
                lengths[index] = lengths[candidate] + 1
                previous[index] = candidate
    cursor = max(range(len(ordered)), key=lambda index: lengths[index])
    result = []
    while cursor >= 0:
        result.append(ordered[cursor])
        cursor = previous[cursor]
    return list(reversed(result))


def line_strength(contrast, line):
    coordinate = round(line["coordinate"])
    strip = contrast[:, max(0, coordinate - 1):coordinate + 2]
    return float(np.percentile(strip, 75)) if strip.size else 0.0


def cluster_matches(matches, gap=0.025):
    groups = []
    for match in sorted(matches, key=lambda item: item["fraction"]):
        if groups and match["fraction"] - groups[-1][-1]["fraction"] <= gap:
            groups[-1].append(match)
        else:
            groups.append([match])
    return [max(group, key=lambda item: item["strength"]) for group in groups]


def two_page_consensus_cells(gray):
    regions = gridline_v4.page_regions(gray)
    if len(regions) != 2:
        return [], {"reason": "not-two-page"}

    detected = []
    for region_index, (x1, y1, x2, y2) in enumerate(regions):
        crop = gray.crop((x1, y1, x2, y2))
        mask = gridline_v4.local_contrast_mask(crop, 5)
        pixels = np.asarray(crop).astype(np.int16)
        background = np.asarray(crop.filter(ImageFilter.BoxBlur(radius=18))).astype(np.int16)
        contrast = background - pixels
        horizontal = gridline_v2.detect_horizontal_lines(mask, density=0.42)
        vertical = gridline_v2.detect_vertical_lines(mask, density=0.42)
        horizontal = [
            line for line in horizontal
            if (line["end"] - line["start"]) / crop.width >= 0.90
        ]
        vertical = [
            {**line, "strength": line_strength(contrast, line)}
            for line in vertical
            if (line["end"] - line["start"]) / crop.height >= 0.85
        ]
        horizontal = longest_regular_run(horizontal)
        detected.append({
            "regionIndex": region_index,
            "bounds": [x1, y1, x2, y2],
            "width": crop.width,
            "height": crop.height,
            "horizontal": horizontal,
            "vertical": vertical,
        })

    if min(len(item["horizontal"]) for item in detected) < 20:
        return [], {"reason": "insufficient-regular-rows", "regions": detected}

    matches = []
    for left in detected[0]["vertical"]:
        left_fraction = left["coordinate"] / detected[0]["width"]
        for right in detected[1]["vertical"]:
            right_fraction = right["coordinate"] / detected[1]["width"]
            if abs(left_fraction - right_fraction) <= 0.035:
                strength = left["strength"] + right["strength"]
                if strength >= 12:
                    matches.append({
                        "fraction": (left_fraction + right_fraction) / 2,
                        "strength": strength,
                        "left": left,
                        "right": right,
                    })
    consensus = [item for item in cluster_matches(matches) if 0.08 <= item["fraction"] <= 0.92]
    if not 4 <= len(consensus) <= 8:
        return [], {
            "reason": "implausible-consensus-columns",
            "consensusColumnCount": len(consensus),
            "regions": detected,
        }

    all_cells = []
    region_diagnostics = []
    for region_index, item in enumerate(detected):
        x1, y1, x2, y2 = item["bounds"]
        horizontal = item["horizontal"]
        outer_start = float(np.median([line["start"] for line in horizontal]))
        outer_end = float(np.median([line["end"] for line in horizontal]))
        top = horizontal[0]["coordinate"]
        bottom = horizontal[-1]["coordinate"]
        vertical = [
            {"coordinate": outer_start, "start": top, "end": bottom, "thickness": 1},
            *[
                {
                    "coordinate": match["left" if region_index == 0 else "right"]["coordinate"],
                    "start": top,
                    "end": bottom,
                    "thickness": match["left" if region_index == 0 else "right"].get("thickness", 1),
                }
                for match in consensus
            ],
            {"coordinate": outer_end, "start": top, "end": bottom, "thickness": 1},
        ]
        horizontal = [
            {**line, "start": outer_start, "end": outer_end}
            for line in horizontal
        ]
        cells = gridline_v2.build_cells(horizontal, vertical, item["width"], item["height"])
        for cell in cells:
            cell["polygon"] = [[point[0] + x1, point[1] + y1] for point in cell["polygon"]]
            cell["regionIndex"] = region_index
        all_cells.extend(cells)
        region_diagnostics.append({
            "regionIndex": region_index,
            "regularRowBoundaryCount": len(horizontal),
            "consensusColumnBoundaryCount": len(vertical),
            "cellCount": len(cells),
        })

    plausible = 200 <= len(all_cells) <= 600
    return (all_cells if plausible else []), {
        "reason": "accepted" if plausible else "implausible-cell-count",
        "consensusInteriorColumns": [round(item["fraction"], 4) for item in consensus],
        "regions": region_diagnostics,
        "candidateCellCount": len(all_cells),
    }


def analyze(image):
    baseline_cells, baseline_diagnostics = gridline_v5.analyze(image)
    if baseline_cells:
        return baseline_cells, {**baseline_diagnostics, "selectedLane": "v5-preserved"}

    scale = min(1.0, MAX_ANALYSIS_EDGE / max(image.width, image.height))
    gray = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS).convert("L")
    angle, _, _ = gridline_v3.estimate_skew(gray)
    deskewed = gray.rotate(angle, Image.Resampling.BICUBIC, expand=False, fillcolor=255) if angle else gray
    cells, consensus_diagnostics = two_page_consensus_cells(deskewed)
    inverse_scale = 1 / scale
    for cell in cells:
        restored = [gridline_v3.rotate_point_back(point, angle, gray.width, gray.height) for point in cell["polygon"]]
        cell["polygon"] = [[
            round(max(0, min(image.width, x * inverse_scale)), 3),
            round(max(0, min(image.height, y * inverse_scale)), 3),
        ] for x, y in restored]
    return cells, {
        **baseline_diagnostics,
        "selectedLane": "two-page-grid-consensus" if cells else "v5-empty",
        "twoPageConsensus": consensus_diagnostics,
    }


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/run-gridline-cell-benchmark-v6.py <ground-truth-root> <private-output> [limit]")
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
        ground_truth = json.loads((gt_root / entry["groundTruth"]).read_text(encoding="utf-8"))
        image = Image.open(ground_truth["image"]["privatePath"]).convert("RGB")
        started = time.perf_counter()
        cells, diagnostics = analyze(image)
        normalized = {
            "schemaVersion": 1,
            "provider": "local-gridline-detector",
            "model": "naf-gridline-v6-two-page-consensus",
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
