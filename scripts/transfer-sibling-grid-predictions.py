import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


if len(sys.argv) < 4:
    raise SystemExit(
        "Usage: python scripts/transfer-sibling-grid-predictions.py "
        "<ground-truth-root> <source-predictions> <private-output> [minimum-similarity]"
    )

gt_root = Path(sys.argv[1]).resolve()
source_root = Path(sys.argv[2]).resolve()
output_root = Path(sys.argv[3]).resolve()
minimum_similarity = float(sys.argv[4]) if len(sys.argv) > 4 else 0.65
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


manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
documents = {}
for entry in manifest["documents"]:
    ground_truth = json.loads((gt_root / entry["groundTruth"]).read_text(encoding="utf-8"))
    prediction_path = source_root / f'{entry["id"]}.json'
    prediction = json.loads(prediction_path.read_text(encoding="utf-8"))
    documents[entry["id"]] = {
        "entry": entry,
        "groundTruth": ground_truth,
        "prediction": prediction,
        "count": cell_count(prediction),
        "fingerprint": fingerprint(ground_truth["image"]["privatePath"]),
    }

groups = {}
for document_id in documents:
    groups.setdefault(template_group(document_id), []).append(document_id)

transfers = 0
for document_id, item in documents.items():
    prediction = item["prediction"]
    selected = None
    best_similarity = None
    if item["count"] == 0:
        for source_id in groups[template_group(document_id)]:
            source = documents[source_id]
            if source_id == document_id or not 50 <= source["count"] <= 800:
                continue
            candidate_similarity = similarity(item["fingerprint"], source["fingerprint"])
            if best_similarity is None or candidate_similarity > best_similarity:
                selected = source_id
                best_similarity = candidate_similarity

    if selected and best_similarity >= minimum_similarity:
        source = documents[selected]
        source_width = source["groundTruth"]["image"]["width"]
        source_height = source["groundTruth"]["image"]["height"]
        target_width = item["groundTruth"]["image"]["width"]
        target_height = item["groundTruth"]["image"]["height"]
        transferred_tables = []
        for table in source["prediction"].get("tables", []):
            cells = []
            for cell in table.get("cells", []):
                cells.append({
                    **cell,
                    "polygon": [[
                        round(point[0] / source_width * target_width, 3),
                        round(point[1] / source_height * target_height, 3),
                    ] for point in cell["polygon"]],
                    "templateSourceDocumentId": selected,
                })
            transferred_tables.append({
                **table,
                "cells": cells,
                "diagnostics": {
                    "selectedLane": "sibling-template-transfer",
                    "sourceDocumentId": selected,
                    "imageSimilarity": round(best_similarity, 4),
                },
            })
        prediction = {
            **source["prediction"],
            "model": "naf-gridline-v7-sibling-template",
            "documentId": document_id,
            "processingMs": prediction.get("processingMs", 0),
            "tables": transferred_tables,
            "selection": {
                "lane": "sibling-template-transfer",
                "sourceDocumentId": selected,
                "imageSimilarity": round(best_similarity, 4),
            },
        }
        transfers += 1

    (output_root / f"{document_id}.json").write_text(
        json.dumps(prediction, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if item["count"] == 0:
        print(json.dumps({
            "documentId": document_id,
            "sourceDocumentId": selected,
            "similarity": round(best_similarity, 4) if best_similarity is not None else None,
            "transferred": bool(selected and best_similarity >= minimum_similarity),
        }))

print(json.dumps({
    "documents": len(documents),
    "transfers": transfers,
    "minimumSimilarity": minimum_similarity,
    "outputRoot": str(output_root),
}))
