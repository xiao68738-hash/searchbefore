import json
import os
import sys
import time
from pathlib import Path


def vertices(layout, width, height):
    poly = layout.bounding_poly
    if poly.normalized_vertices:
        return [[point.x * width, point.y * height] for point in poly.normalized_vertices]
    return [[point.x, point.y] for point in poly.vertices]


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/run-document-ai-cell-benchmark.py <ground-truth-root> <private-output>")
    try:
        from google.cloud import documentai
    except ImportError as error:
        raise SystemExit("Install google-cloud-documentai before running this benchmark") from error
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION")
    processor = os.environ.get("GOOGLE_DOCUMENT_AI_PROCESSOR_ID")
    if not all((project, location, processor, os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))):
        raise SystemExit("Google credentials, project, location, and Form Parser processor ID are required")
    gt_root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    private_root = Path("D:/SearchBefore/private").resolve()
    if private_root not in output.parents:
        raise SystemExit(f"Predictions must stay under {private_root}")
    output.mkdir(parents=True, exist_ok=True)
    (output / "raw").mkdir(exist_ok=True)
    manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
    client = documentai.DocumentProcessorServiceClient(
        client_options={"api_endpoint": f"{location}-documentai.googleapis.com"}
    )
    name = client.processor_path(project, location, processor)
    for index, entry in enumerate(manifest["documents"], start=1):
        gt = json.loads((gt_root / entry["groundTruth"]).read_text(encoding="utf-8"))
        image_path = Path(gt["image"]["privatePath"])
        started = time.perf_counter()
        request = documentai.ProcessRequest(
            name=name,
            raw_document=documentai.RawDocument(content=image_path.read_bytes(), mime_type="image/jpeg"),
        )
        document = client.process_document(request=request).document
        raw_json = documentai.Document.to_json(document)
        (output / "raw" / f'{entry["id"]}.json').write_text(raw_json + "\n", encoding="utf-8")
        tables = []
        for page in document.pages:
            for table_index, table in enumerate(page.tables):
                cells = []
                rows = list(table.header_rows) + list(table.body_rows)
                for row_index, row in enumerate(rows):
                    for column_index, cell in enumerate(row.cells):
                        anchor = cell.layout.text_anchor
                        text = "".join(
                            document.text[segment.start_index or 0:segment.end_index]
                            for segment in anchor.text_segments
                        ).strip()
                        cells.append({
                            "rowIndex": row_index,
                            "columnIndex": column_index,
                            "rowSpan": 1,
                            "columnSpan": 1,
                            "polygon": vertices(cell.layout, gt["image"]["width"], gt["image"]["height"]),
                            "text": text,
                            "confidence": cell.layout.confidence,
                        })
                tables.append({"tableIndex": table_index, "cells": cells})
        normalized = {
            "schemaVersion": 1,
            "provider": "google-document-ai",
            "model": "form-parser",
            "documentId": entry["id"],
            "processingMs": round((time.perf_counter() - started) * 1000),
            "tables": tables,
        }
        (output / f'{entry["id"]}.json').write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"completed": index, "total": manifest["selectedCount"], "documentId": entry["id"], "tableCount": len(tables), "processingMs": normalized["processingMs"]}))


if __name__ == "__main__":
    main()
