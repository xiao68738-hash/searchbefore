import importlib.util
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "gridline_v4", SCRIPT_DIR / "run-gridline-cell-benchmark-v4.py"
)
gridline_v4 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gridline_v4)
gridline_v3 = gridline_v4.gridline_v3
gridline_v2 = gridline_v4.gridline_v2

MAX_ANALYSIS_EDGE = 1800
ORIENTATIONS = (0, 90, 270)
PARAMETERS = (
    (5, 0.42),
    (7, 0.50),
    (9, 0.58),
)


def cell_count(prediction):
    return sum(len(table.get("cells", [])) for table in prediction.get("tables", []))


def oriented_image(image, degrees):
    if degrees == 90:
        return image.transpose(Image.Transpose.ROTATE_90)
    if degrees == 270:
        return image.transpose(Image.Transpose.ROTATE_270)
    return image


def point_to_original(point, degrees, original_width, original_height):
    x, y = point
    if degrees == 90:
        return [original_width - y, x]
    if degrees == 270:
        return [y, original_height - x]
    return [x, y]


def coefficient_of_variation(values):
    if not values:
        return float("inf")
    mean = float(np.mean(values))
    return float(np.std(values) / mean) if mean else float("inf")


def candidate_quality(cells, horizontal, vertical, width, height):
    if not 12 <= len(cells) <= 900:
        return None

    rows = sorted({round(cell["polygon"][0][1], 1) for cell in cells})
    columns = sorted({round(cell["polygon"][0][0], 1) for cell in cells})
    if not 3 <= len(rows) <= 120 or not 3 <= len(columns) <= 40:
        return None

    widths = [cell["polygon"][1][0] - cell["polygon"][0][0] for cell in cells]
    heights = [cell["polygon"][2][1] - cell["polygon"][1][1] for cell in cells]
    width_cv = coefficient_of_variation(widths)
    height_cv = coefficient_of_variation(heights)
    occupancy = len(cells) / max(1, len(rows) * len(columns))
    horizontal_coverage = [
        (line["end"] - line["start"]) / width for line in horizontal
    ]
    vertical_coverage = [
        (line["end"] - line["start"]) / height for line in vertical
    ]
    horizontal_median = float(np.median(horizontal_coverage)) if horizontal_coverage else 0
    vertical_median = float(np.median(vertical_coverage)) if vertical_coverage else 0

    plausible = (
        occupancy >= 0.45
        and width_cv <= 1.35
        and height_cv <= 0.85
        and horizontal_median >= 0.35
        and vertical_median >= 0.22
    )
    if not plausible:
        return None

    regularity = 1 / (1 + width_cv + height_cv)
    score = len(cells) * occupancy * regularity * (
        0.5 + horizontal_median + vertical_median
    )
    return {
        "score": score,
        "rowCount": len(rows),
        "columnCount": len(columns),
        "occupancy": occupancy,
        "cellWidthCv": width_cv,
        "cellHeightCv": height_cv,
        "horizontalCoverageMedian": horizontal_median,
        "verticalCoverageMedian": vertical_median,
    }


def stable_lower_table_cells(cells, image_height):
    """Trim dense body-text grids to a coherent lower-page table when obvious.

    This is deliberately limited to extreme (>500-cell) candidates.  It uses
    only layout continuity and row cardinality, never benchmark annotations.
    """
    if len(cells) <= 500:
        return cells, None

    grouped = {}
    for cell in cells:
        top = round(cell["polygon"][0][1], 1)
        grouped.setdefault(top, []).append(cell)
    rows = sorted(grouped.items())
    best = None
    for start in range(len(rows)):
        suffix = rows[start:]
        if len(suffix) < 7 or suffix[0][0] < image_height * 0.55:
            continue
        counts = [len(row_cells) for _, row_cells in suffix]
        gaps = [suffix[index + 1][0] - suffix[index][0] for index in range(len(suffix) - 1)]
        median_count = float(np.median(counts))
        if median_count < 8:
            continue
        stable_count_fraction = sum(
            median_count * 0.72 <= count <= median_count * 1.28
            for count in counts
        ) / len(counts)
        count_cv = coefficient_of_variation(counts)
        gap_cv = coefficient_of_variation(gaps)
        if stable_count_fraction < 0.85 or count_cv > 0.22 or gap_cv > 0.42:
            continue
        selected = [cell for _, row_cells in suffix for cell in row_cells]
        if not 80 <= len(selected) <= len(cells) * 0.65:
            continue
        score = len(selected) * stable_count_fraction / (1 + count_cv + gap_cv)
        if best is None or score > best[0]:
            best = (score, selected, {
                "originalCellCount": len(cells),
                "retainedCellCount": len(selected),
                "retainedRowCount": len(suffix),
                "startY": round(suffix[0][0], 1),
                "medianCellsPerRow": round(median_count, 2),
                "rowCountCv": round(count_cv, 4),
                "rowGapCv": round(gap_cv, 4),
            })
    if best is None:
        return cells, None
    return best[1], best[2]


def unique_regions(gray):
    width, height = gray.size
    regions = [(0, 0, width, height), *gridline_v4.page_regions(gray)]
    result = []
    for region in regions:
        if region not in result and region[2] - region[0] >= 80 and region[3] - region[1] >= 80:
            result.append(region)
    return result


def orientation_candidates(image, sibling_reference=None):
    candidates = []
    diagnostics = []
    for degrees in ORIENTATIONS:
        rotated = oriented_image(image, degrees)
        scale = min(1.0, MAX_ANALYSIS_EDGE / max(rotated.width, rotated.height))
        gray = rotated.resize(
            (round(rotated.width * scale), round(rotated.height * scale)),
            Image.Resampling.LANCZOS,
        ).convert("L")
        for region_index, (x1, y1, x2, y2) in enumerate(unique_regions(gray)):
            crop = gray.crop((x1, y1, x2, y2))
            for threshold, density in PARAMETERS:
                mask = gridline_v4.local_contrast_mask(crop, threshold)
                horizontal = gridline_v2.detect_horizontal_lines(mask, density=density)
                vertical = gridline_v2.detect_vertical_lines(mask, density=density)
                horizontal = [
                    line for line in horizontal
                    if line["end"] - line["start"] >= crop.width * 0.15
                ]
                vertical = [
                    line for line in vertical
                    if line["end"] - line["start"] >= crop.height * 0.18
                ]
                cells = gridline_v2.build_cells(
                    horizontal, vertical, crop.width, crop.height
                )
                quality = candidate_quality(
                    cells, horizontal, vertical, crop.width, crop.height
                )
                record = {
                    "orientationDegrees": degrees,
                    "regionIndex": region_index,
                    "bounds": [x1, y1, x2, y2],
                    "threshold": threshold,
                    "density": density,
                    "horizontalLineCount": len(horizontal),
                    "verticalLineCount": len(vertical),
                    "candidateCellCount": len(cells),
                    "accepted": quality is not None,
                }
                if quality:
                    record.update({key: round(value, 4) for key, value in quality.items()})
                    inverse_scale = 1 / scale
                    restored = []
                    for cell in cells:
                        polygon = []
                        for px, py in cell["polygon"]:
                            rotated_point = [
                                (px + x1) * inverse_scale,
                                (py + y1) * inverse_scale,
                            ]
                            ox, oy = point_to_original(
                                rotated_point,
                                degrees,
                                image.width,
                                image.height,
                            )
                            polygon.append([
                                round(max(0, min(image.width, ox)), 3),
                                round(max(0, min(image.height, oy)), 3),
                            ])
                        restored.append({**cell, "polygon": polygon})
                    candidates.append((quality["score"], restored, record))
                diagnostics.append(record)

    if not candidates:
        return [], {"reason": "no-plausible-orientation-grid", "attempts": diagnostics}
    _, cells, selected = max(candidates, key=lambda item: item[0])
    if selected["orientationDegrees"] == 0:
        filtered_cells, lower_table_filter = stable_lower_table_cells(
            cells, image.height
        )
        if lower_table_filter:
            retained_ratio = None
            original_ratio = None
            if sibling_reference:
                retained_ratio = max(len(filtered_cells), sibling_reference) / max(
                    1, min(len(filtered_cells), sibling_reference)
                )
                original_ratio = max(len(cells), sibling_reference) / max(
                    1, min(len(cells), sibling_reference)
                )
            if retained_ratio and retained_ratio > 4 and original_ratio <= 4:
                selected["stableLowerTableFilterBypassed"] = {
                    "reason": "sibling-cell-count-consistency",
                    "referenceCellCount": round(sibling_reference, 2),
                    **lower_table_filter,
                }
            else:
                cells = filtered_cells
                selected["stableLowerTableFilter"] = lower_table_filter
    return cells, {
        "reason": "accepted",
        "selected": selected,
        "acceptedCandidateCount": len(candidates),
        "attempts": diagnostics,
    }


def main():
    if len(sys.argv) < 4:
        raise SystemExit(
            "Usage: python scripts/run-gridline-cell-benchmark-v8.py "
            "<ground-truth-root> <source-v7-predictions> <private-output> [limit]"
        )
    gt_root = Path(sys.argv[1]).resolve()
    source_root = Path(sys.argv[2]).resolve()
    output_root = Path(sys.argv[3]).resolve()
    private_root = Path("D:/SearchBefore/private").resolve()
    if private_root not in output_root.parents:
        raise SystemExit(f"Predictions must stay under {private_root}")
    limit = int(sys.argv[4]) if len(sys.argv) > 4 else None
    output_root.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
    documents = manifest["documents"][:limit] if limit else manifest["documents"]
    recovered = 0
    fallback_ids = set()
    original_predictions = {}
    for index, entry in enumerate(documents, start=1):
        source = json.loads(
            (source_root / f'{entry["id"]}.json').read_text(encoding="utf-8")
        )
        original_predictions[entry["id"]] = source
        prediction = source
        started = time.perf_counter()
        lane = "v7-preserved"
        if cell_count(source) == 0:
            ground_truth = json.loads(
                (gt_root / entry["groundTruth"]).read_text(encoding="utf-8")
            )
            image = Image.open(ground_truth["image"]["privatePath"]).convert("RGB")
            sibling_counts = []
            group_prefix = entry["id"].rsplit("_", 1)[0]
            for sibling in documents:
                if (
                    sibling["id"] != entry["id"]
                    and sibling["id"].rsplit("_", 1)[0] == group_prefix
                ):
                    sibling_source = json.loads(
                        (source_root / f'{sibling["id"]}.json').read_text(
                            encoding="utf-8"
                        )
                    )
                    sibling_count = cell_count(sibling_source)
                    if sibling_count > 0:
                        sibling_counts.append(sibling_count)
            sibling_reference = (
                float(np.median(sibling_counts)) if sibling_counts else None
            )
            cells, diagnostics = orientation_candidates(
                image, sibling_reference=sibling_reference
            )
            if cells:
                recovered += 1
                fallback_ids.add(entry["id"])
                lane = "orientation-low-cell-grid"
                prediction = {
                    "schemaVersion": 1,
                    "provider": "local-gridline-detector",
                    "model": "naf-gridline-v8-orientation-low-cell",
                    "documentId": entry["id"],
                    "processingMs": round((time.perf_counter() - started) * 1000),
                    "textRecognition": {"status": "not-applicable-structure-only"},
                    "tables": [{
                        "tableIndex": 0,
                        "cells": cells,
                        "diagnostics": {
                            "selectedLane": lane,
                            "orientationFallback": diagnostics,
                        },
                    }],
                }
        (output_root / f'{entry["id"]}.json').write_text(
            json.dumps(prediction, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps({
            "completed": index,
            "total": len(documents),
            "documentId": entry["id"],
            "cellCount": cell_count(prediction),
            "selectedLane": lane,
        }))

    groups = {}
    for entry in documents:
        groups.setdefault(entry["id"].rsplit("_", 1)[0], []).append(entry["id"])
    rejected_by_sibling_consistency = []
    for group_ids in groups.values():
        fallback_group = [item for item in group_ids if item in fallback_ids]
        if not fallback_group:
            continue
        preserved_counts = [
            cell_count(original_predictions[item])
            for item in group_ids
            if item not in fallback_ids and cell_count(original_predictions[item]) > 0
        ]
        fallback_counts = {
            item: cell_count(json.loads(
                (output_root / f"{item}.json").read_text(encoding="utf-8")
            ))
            for item in fallback_group
        }
        rejected = []
        if preserved_counts:
            reference = float(np.median(preserved_counts))
            rejected = [
                item for item, count in fallback_counts.items()
                if max(count, reference) / max(1, min(count, reference)) > 4
            ]
        elif len(fallback_counts) >= 2:
            minimum = min(fallback_counts.values())
            rejected = [
                item for item, count in fallback_counts.items()
                if count > minimum * 4
            ]
        for item in rejected:
            (output_root / f"{item}.json").write_text(
                json.dumps(original_predictions[item], ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            fallback_ids.remove(item)
            recovered -= 1
            rejected_by_sibling_consistency.append(item)

    if rejected_by_sibling_consistency:
        print(json.dumps({
            "siblingConsistencyRejected": rejected_by_sibling_consistency,
        }))

    print(json.dumps({
        "documents": len(documents),
        "recoveredDocuments": recovered,
        "siblingConsistencyRejected": len(rejected_by_sibling_consistency),
        "outputRoot": str(output_root),
    }))


if __name__ == "__main__":
    main()
