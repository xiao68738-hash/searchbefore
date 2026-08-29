import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/render-naf-cell-ground-truth.py <ground-truth-root> <private-output> [count]")
    root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    private_root = Path("D:/SearchBefore/private").resolve()
    if private_root not in output.parents:
        raise SystemExit(f"Preview output must stay under {private_root}")
    count = max(1, min(12, int(sys.argv[3]) if len(sys.argv) > 3 else 8))
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    documents = manifest["documents"]
    # Deterministic spread across the sorted complexity range.
    ranked = sorted(documents, key=lambda item: item["cellCount"])
    indexes = sorted({round(i * (len(ranked) - 1) / max(1, count - 1)) for i in range(count)})
    output.mkdir(parents=True, exist_ok=True)
    rendered = []
    for index in indexes:
        entry = ranked[index]
        doc = json.loads((root / entry["groundTruth"]).read_text(encoding="utf-8"))
        image = Image.open(doc["image"]["privatePath"]).convert("RGB")
        max_side = 1800
        scale = min(1.0, max_side / max(image.size))
        if scale < 1:
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        draw = ImageDraw.Draw(image, "RGBA")
        line_width = max(1, round(2 * scale))
        for cell in doc["cells"]:
            polygon = [(round(x * scale), round(y * scale)) for x, y in cell["polygon"]]
            draw.line(polygon + [polygon[0]], fill=(0, 220, 120, 165), width=line_width)
        label = f'{doc["id"]} | {len(doc["rows"])} rows x {len(doc["columns"])} cols | {len(doc["cells"])} cells'
        label_box = draw.textbbox((10, 10), label, font=ImageFont.load_default())
        draw.rectangle((6, 6, label_box[2] + 14, label_box[3] + 14), fill=(0, 0, 0, 210))
        draw.text((10, 10), label, fill=(255, 255, 255, 255), font=ImageFont.load_default())
        target = output / f'{doc["id"]}.jpg'
        image.save(target, quality=88)
        rendered.append(str(target))
    print(json.dumps({"renderedCount": len(rendered), "files": rendered}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
