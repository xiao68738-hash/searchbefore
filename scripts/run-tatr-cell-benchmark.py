import json
import sys
import time
from pathlib import Path

from PIL import Image
import torch
from transformers import AutoImageProcessor, TableTransformerForObjectDetection


DETECTION_MODEL = "microsoft/table-transformer-detection"
STRUCTURE_MODEL = "microsoft/table-transformer-structure-recognition-v1.1-all"


def clamp_box(box, width, height, padding=0):
    left, top, right, bottom = [float(value) for value in box]
    return [
        max(0.0, left - padding),
        max(0.0, top - padding),
        min(float(width), right + padding),
        min(float(height), bottom + padding),
    ]


def intersection(row, column):
    left = max(row[0], column[0])
    top = max(row[1], column[1])
    right = min(row[2], column[2])
    bottom = min(row[3], column[3])
    return None if right - left < 2 or bottom - top < 2 else [left, top, right, bottom]


def polygon(box, offset_x=0, offset_y=0):
    left, top, right, bottom = box
    return [
        [left + offset_x, top + offset_y],
        [right + offset_x, top + offset_y],
        [right + offset_x, bottom + offset_y],
        [left + offset_x, bottom + offset_y],
    ]


def detect(processor, model, image, threshold):
    inputs = processor(images=image, return_tensors="pt")
    with torch.inference_mode():
        outputs = model(**inputs)
    result = processor.post_process_object_detection(
        outputs,
        threshold=threshold,
        target_sizes=torch.tensor([[image.height, image.width]]),
    )[0]
    detections = []
    for score, label, box in zip(result["scores"], result["labels"], result["boxes"]):
        detections.append({
            "label": model.config.id2label[int(label)],
            "confidence": float(score),
            "box": [float(value) for value in box],
        })
    return detections


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/run-tatr-cell-benchmark.py <ground-truth-root> <private-output> [limit]")
    gt_root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    private_root = Path("D:/SearchBefore/private").resolve()
    if private_root not in output.parents:
        raise SystemExit(f"Predictions must stay under {private_root}")
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
    detection_processor = AutoImageProcessor.from_pretrained(DETECTION_MODEL, local_files_only=True)
    detection_model = TableTransformerForObjectDetection.from_pretrained(DETECTION_MODEL, local_files_only=True).eval()
    structure_processor = AutoImageProcessor.from_pretrained(STRUCTURE_MODEL, local_files_only=True)
    # The v1.1 model retains the legacy max_size-only processor config. Modern
    # Transformers requires both edges to be explicit at preprocessing time.
    structure_processor.size = {"shortest_edge": 800, "longest_edge": 1000}
    structure_model = TableTransformerForObjectDetection.from_pretrained(STRUCTURE_MODEL, local_files_only=True).eval()
    documents = manifest["documents"][:limit] if limit else manifest["documents"]
    for document_index, entry in enumerate(documents, start=1):
        gt = json.loads((gt_root / entry["groundTruth"]).read_text(encoding="utf-8"))
        image = Image.open(gt["image"]["privatePath"]).convert("RGB")
        started = time.perf_counter()
        table_detections = [item for item in detect(detection_processor, detection_model, image, 0.50) if item["label"] in {"table", "table rotated"}]
        tables = []
        for table_index, detected_table in enumerate(table_detections):
            table_box = clamp_box(detected_table["box"], image.width, image.height, padding=20)
            crop = image.crop(tuple(round(value) for value in table_box))
            objects = detect(structure_processor, structure_model, crop, 0.45)
            rows = sorted((item for item in objects if item["label"] == "table row"), key=lambda item: (item["box"][1] + item["box"][3]) / 2)
            columns = sorted((item for item in objects if item["label"] == "table column"), key=lambda item: (item["box"][0] + item["box"][2]) / 2)
            cells = []
            for row_index, row in enumerate(rows):
                for column_index, column in enumerate(columns):
                    cell_box = intersection(row["box"], column["box"])
                    if not cell_box:
                        continue
                    cells.append({
                        "rowIndex": row_index,
                        "columnIndex": column_index,
                        "rowSpan": 1,
                        "columnSpan": 1,
                        "polygon": polygon(cell_box, table_box[0], table_box[1]),
                        "text": "",
                        "confidence": min(row["confidence"], column["confidence"]),
                    })
            tables.append({
                "tableIndex": table_index,
                "confidence": detected_table["confidence"],
                "polygon": polygon(table_box),
                "cells": cells,
                "diagnostics": {"detectedRows": len(rows), "detectedColumns": len(columns)},
            })
        normalized = {
            "schemaVersion": 1,
            "provider": "microsoft-table-transformer",
            "model": f"{DETECTION_MODEL}+{STRUCTURE_MODEL}",
            "documentId": entry["id"],
            "processingMs": round((time.perf_counter() - started) * 1000),
            "textRecognition": {"status": "pending-ml-kit-device-run"},
            "tables": tables,
        }
        (output / f'{entry["id"]}.json').write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "completed": document_index,
            "total": len(documents),
            "documentId": entry["id"],
            "tableCount": len(tables),
            "cellCount": sum(len(table["cells"]) for table in tables),
            "processingMs": normalized["processingMs"],
        }))


if __name__ == "__main__":
    main()
