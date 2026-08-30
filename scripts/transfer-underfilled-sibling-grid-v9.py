import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


if len(sys.argv) < 4:
    raise SystemExit(
        "Usage: python scripts/transfer-underfilled-sibling-grid-v9.py "
        "<ground-truth-root> <source-predictions> <private-output> "
        "[minimum-similarity] [minimum-count-ratio]"
    )

gt_root = Path(sys.argv[1]).resolve()
source_root = Path(sys.argv[2]).resolve()
output_root = Path(sys.argv[3]).resolve()
minimum_similarity = float(sys.argv[4]) if len(sys.argv) > 4 else 0.84
minimum_count_ratio = float(sys.argv[5]) if len(sys.argv) > 5 else 4.0
private_root = Path("D:/SearchBefore/private").resolve()
if private_root not in output_root.parents:
    raise SystemExit(f"Predictions must stay under {private_root}")
output_root.mkdir(parents=True, exist_ok=True)


def cell_count(prediction):
    return sum(len(table.get("cells", [])) for table in prediction.get("tables", []))


def template_group(document_id):
    return document_id.rsplit("_", 1)[0]


def fingerprint(path):
    image = Image.open(path).convert("L").resize((128, 128), Image.Resampling.BILINEAR)
    image = image.filter(ImageFilter.GaussianBlur(radius=1))
    pixels = np.asarray(image).astype(np.float32)
    gradient_x = np.abs(np.diff(pixels, axis=1, prepend=pixels[:, :1]))
    gradient_y = np.abs(np.diff(pixels, axis=0, prepend=pixels[:1, :]))
    vector = (gradient_x + gradient_y).reshape(-1)
    standard_deviation = float(vector.std())
    return (vector - vector.mean()) / standard_deviation if standard_deviation else vector * 0


def similarity(left, right):
    return float(np.mean(left * right))


def grid_line_support(image_path, cells):
    image = Image.open(image_path).convert("L")
    scale = min(1.0, 1800 / max(image.size))
    image = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    pixels = np.asarray(image).astype(np.int16)
    background = np.asarray(image.filter(ImageFilter.BoxBlur(radius=8))).astype(np.int16)
    contrast = background - pixels
    support = []
    seen = set()
    for cell in cells:
        polygon = cell["polygon"]
        segments = (
            ("h", polygon[0][1], polygon[0][0], polygon[1][0]),
            ("h", polygon[2][1], polygon[3][0], polygon[2][0]),
            ("v", polygon[0][0], polygon[0][1], polygon[3][1]),
            ("v", polygon[1][0], polygon[1][1], polygon[2][1]),
        )
        for orientation, coordinate, start, end in segments:
            coordinate = round(coordinate * scale)
            start = round(start * scale)
            end = round(end * scale)
            key = (orientation, coordinate, start, end)
            if key in seen:
                continue
            seen.add(key)
            if orientation == "h":
                strip = contrast[
                    max(0, coordinate - 2):coordinate + 3,
                    max(0, start):min(contrast.shape[1], end + 1),
                ]
                profile = strip.max(axis=0) if strip.size else np.array([])
            else:
                strip = contrast[
                    max(0, start):min(contrast.shape[0], end + 1),
                    max(0, coordinate - 2):coordinate + 3,
                ]
                profile = strip.max(axis=1) if strip.size else np.array([])
            if profile.size >= 4:
                support.append(float(np.mean(profile >= 12)))
    if not support:
        return {"edgeCount": 0, "meanSupport": 0, "strongEdgeFraction": 0}
    values = np.asarray(support)
    return {
        "edgeCount": len(support),
        "meanSupport": round(float(values.mean()), 4),
        "strongEdgeFraction": round(float(np.mean(values >= 0.5)), 4),
    }


manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
documents = {}
for entry in manifest["documents"]:
    ground_truth = json.loads((gt_root / entry["groundTruth"]).read_text(encoding="utf-8"))
    prediction = json.loads(
        (source_root / f'{entry["id"]}.json').read_text(encoding="utf-8")
    )
    documents[entry["id"]] = {
        "groundTruth": ground_truth,
        "prediction": prediction,
        "count": cell_count(prediction),
        "fingerprint": fingerprint(ground_truth["image"]["privatePath"]),
    }

groups = {}
for document_id in documents:
    groups.setdefault(template_group(document_id), []).append(document_id)

transfers = []
rejections = []
for document_id, target in documents.items():
    selected = None
    selected_similarity = None
    for source_id in groups[template_group(document_id)]:
        source = documents[source_id]
        if (
            source_id == document_id
            or not 50 <= source["count"] <= 800
            or source["count"] < max(1, target["count"]) * minimum_count_ratio
        ):
            continue
        candidate_similarity = similarity(target["fingerprint"], source["fingerprint"])
        if candidate_similarity < minimum_similarity:
            continue
        if selected is None or candidate_similarity > selected_similarity:
            selected = source_id
            selected_similarity = candidate_similarity

    prediction = target["prediction"]
    if selected:
        source = documents[selected]
        source_width = source["groundTruth"]["image"]["width"]
        source_height = source["groundTruth"]["image"]["height"]
        target_width = target["groundTruth"]["image"]["width"]
        target_height = target["groundTruth"]["image"]["height"]
        transferred_tables = []
        for table in source["prediction"].get("tables", []):
            cells = [{
                **cell,
                "polygon": [[
                    round(point[0] / source_width * target_width, 3),
                    round(point[1] / source_height * target_height, 3),
                ] for point in cell["polygon"]],
                "templateSourceDocumentId": selected,
            } for cell in table.get("cells", [])]
            transferred_tables.append({
                **table,
                "cells": cells,
                "diagnostics": {
                    "selectedLane": "underfilled-sibling-template-transfer",
                    "sourceDocumentId": selected,
                    "imageSimilarity": round(selected_similarity, 4),
                    "sourceCellCount": source["count"],
                    "replacedCellCount": target["count"],
                },
            })
        transferred_cells = [
            cell for table in transferred_tables for cell in table.get("cells", [])
        ]
        line_support = grid_line_support(
            target["groundTruth"]["image"]["privatePath"], transferred_cells
        )
        if line_support["meanSupport"] >= 0.30 and line_support["strongEdgeFraction"] >= 0.25:
            for table in transferred_tables:
                table["diagnostics"]["targetGridLineSupport"] = line_support
            prediction = {
                **source["prediction"],
                "model": "naf-gridline-v9-underfilled-sibling-template",
                "documentId": document_id,
                "processingMs": target["prediction"].get("processingMs", 0),
                "tables": transferred_tables,
                "selection": {
                    "lane": "underfilled-sibling-template-transfer",
                    "sourceDocumentId": selected,
                    "imageSimilarity": round(selected_similarity, 4),
                    "targetGridLineSupport": line_support,
                },
            }
            transfers.append(document_id)
        else:
            rejections.append({
                "documentId": document_id,
                "sourceDocumentId": selected,
                "reason": "insufficient-target-grid-line-support",
                **line_support,
            })

    (output_root / f"{document_id}.json").write_text(
        json.dumps(prediction, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

print(json.dumps({
    "documents": len(documents),
    "transfers": transfers,
    "rejections": rejections,
    "minimumSimilarity": minimum_similarity,
    "minimumCountRatio": minimum_count_ratio,
    "outputRoot": str(output_root),
}))
