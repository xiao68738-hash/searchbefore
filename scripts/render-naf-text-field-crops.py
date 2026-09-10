import json
import sys
from pathlib import Path

from PIL import Image


if len(sys.argv) != 3:
    raise SystemExit("Usage: python scripts/render-naf-text-field-crops.py <ground-truth-root> <private-output>")

ground_truth_root = Path(sys.argv[1]).resolve()
output_root = Path(sys.argv[2]).resolve()
private_root = Path("D:/SearchBefore/private").resolve()
if private_root not in output_root.parents:
    raise SystemExit(f"Text crops must stay under {private_root}")

output_root.mkdir(parents=True, exist_ok=True)
manifest = json.loads((ground_truth_root / "manifest.json").read_text(encoding="utf-8"))
entries = []

for document_entry in manifest.get("documents", []):
    document = json.loads((ground_truth_root / document_entry["groundTruth"]).read_text(encoding="utf-8"))
    image = Image.open(document["image"]["privatePath"]).convert("RGB")
    width, height = image.size
    for field in document.get("textFields", []):
        xs = [float(point[0]) for point in field["polygon"]]
        ys = [float(point[1]) for point in field["polygon"]]
        field_width = max(xs) - min(xs)
        field_height = max(ys) - min(ys)
        padding_x = max(4, round(field_width * 0.04))
        padding_y = max(4, round(field_height * 0.12))
        left = max(0, int(min(xs)) - padding_x)
        top = max(0, int(min(ys)) - padding_y)
        right = min(width, int(max(xs) + 0.999) + padding_x)
        bottom = min(height, int(max(ys) + 0.999) + padding_y)
        if right <= left or bottom <= top:
            continue
        crop_id = f"{document['id']}--{field['id']}"
        crop_name = f"{crop_id}.png"
        image.crop((left, top, right, bottom)).save(output_root / crop_name, format="PNG")
        entries.append({
            "id": crop_id,
            "documentId": document["id"],
            "fieldId": field["id"],
            "split": document["split"],
            "image": crop_name,
            "sourceBox": {"left": left, "top": top, "right": right, "bottom": bottom},
            "textGroundTruth": field["text"],
        })

output_manifest = {
    "schemaVersion": 1,
    "dataset": "NAF Dataset v3 transcribed field crops",
    "sourceGroundTruth": str(ground_truth_root),
    "documentCount": manifest.get("selectedCount", 0),
    "cropCount": len(entries),
    "normalization": "Unicode NFC; scoring additionally lowercases and collapses whitespace",
    "entries": entries,
}
(output_root / "manifest.json").write_text(json.dumps(output_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"documentCount": output_manifest["documentCount"], "cropCount": len(entries), "outputRoot": str(output_root)}, ensure_ascii=False))
