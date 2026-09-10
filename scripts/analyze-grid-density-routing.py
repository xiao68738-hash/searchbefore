import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


if len(sys.argv) != 5:
    raise SystemExit(
        "Usage: python scripts/analyze-grid-density-routing.py "
        "<ground-truth-root> <predictions-root> <score-report> <private-output.json>"
    )

gt_root = Path(sys.argv[1]).resolve()
predictions_root = Path(sys.argv[2]).resolve()
report_path = Path(sys.argv[3]).resolve()
output_path = Path(sys.argv[4]).resolve()
private_root = Path("D:/SearchBefore/private").resolve()
if private_root not in output_path.parents:
    raise SystemExit(f"Analysis must stay under {private_root}")


def line_support(image_path, cells):
    image = Image.open(image_path).convert("L")
    scale = min(1.0, 1800 / max(image.size))
    image = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    pixels = np.asarray(image).astype(np.int16)
    background = np.asarray(image.filter(ImageFilter.BoxBlur(radius=8))).astype(np.int16)
    contrast = background - pixels
    supports = []
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
                supports.append(float(np.mean(profile >= 12)))
    if not supports:
        return {"mean": 0, "median": 0, "strongFraction": 0, "edgeCount": 0}
    values = np.asarray(supports)
    return {
        "mean": round(float(values.mean()), 4),
        "median": round(float(np.median(values)), 4),
        "strongFraction": round(float(np.mean(values >= 0.5)), 4),
        "edgeCount": len(supports),
    }


manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
report = json.loads(report_path.read_text(encoding="utf-8"))
scores = {item["id"]: item for item in report["documents"]}
documents = []
for entry in manifest["documents"]:
    ground_truth = json.loads(
        (gt_root / entry["groundTruth"]).read_text(encoding="utf-8")
    )
    prediction = json.loads(
        (predictions_root / f'{entry["id"]}.json').read_text(encoding="utf-8")
    )
    cells = [
        cell for table in prediction.get("tables", []) for cell in table.get("cells", [])
    ]
    widths = [cell["polygon"][1][0] - cell["polygon"][0][0] for cell in cells]
    heights = [cell["polygon"][2][1] - cell["polygon"][1][1] for cell in cells]
    all_x = [point[0] for cell in cells for point in cell["polygon"]]
    all_y = [point[1] for cell in cells for point in cell["polygon"]]
    rows = {round(cell["polygon"][0][1], 1) for cell in cells}
    columns = {round(cell["polygon"][0][0], 1) for cell in cells}
    score = scores[entry["id"]]
    predicted = score["predictedCells"]
    matched = score["matchedCells"]
    documents.append({
        "id": entry["id"],
        "predictedCells": predicted,
        "matchedCells": matched,
        "documentPrecision": round(matched / predicted, 4) if predicted else None,
        "groundTruthCells": score["gtCells"],
        "sourceGroup": entry["id"].rsplit("_", 1)[0],
        "imageAspectRatio": round(
            ground_truth["image"]["width"] / ground_truth["image"]["height"], 4
        ),
        "rowCount": len(rows),
        "columnCount": len(columns),
        "candidateWidthFraction": round((max(all_x) - min(all_x)) / ground_truth["image"]["width"], 4) if all_x else None,
        "candidateHeightFraction": round((max(all_y) - min(all_y)) / ground_truth["image"]["height"], 4) if all_y else None,
        "medianCellWidthFraction": round(float(np.median(widths)) / ground_truth["image"]["width"], 5) if widths else None,
        "medianCellHeightFraction": round(float(np.median(heights)) / ground_truth["image"]["height"], 5) if heights else None,
        "lineSupport": line_support(ground_truth["image"]["privatePath"], cells),
    })

output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(
    json.dumps({"documents": documents}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps({"documents": len(documents), "output": str(output_path)}))
