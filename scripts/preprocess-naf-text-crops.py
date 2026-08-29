import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


if len(sys.argv) != 4:
    raise SystemExit("Usage: python scripts/preprocess-naf-text-crops.py <crop-root> <private-output> <upscale|contrast|threshold>")

source_root = Path(sys.argv[1]).resolve()
output_root = Path(sys.argv[2]).resolve()
mode = sys.argv[3]
if mode not in {"upscale", "contrast", "threshold"}:
    raise SystemExit(f"Unsupported mode: {mode}")
private_root = Path("D:/SearchBefore/private").resolve()
if private_root not in output_root.parents:
    raise SystemExit(f"Processed crops must stay under {private_root}")

manifest = json.loads((source_root / "manifest.json").read_text(encoding="utf-8"))
output_root.mkdir(parents=True, exist_ok=True)

for entry in manifest.get("entries", []):
    source = Image.open(source_root / entry["image"]).convert("RGB")
    scale = max(2, min(6, math.ceil(120 / max(1, source.height))))
    resized = source.resize((source.width * scale, source.height * scale), Image.Resampling.LANCZOS)
    if mode == "upscale":
        processed = resized
    else:
        gray = ImageOps.autocontrast(ImageOps.grayscale(resized), cutoff=1)
        gray = ImageEnhance.Contrast(gray).enhance(1.35)
        gray = gray.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=3))
        processed = gray if mode == "contrast" else gray.point(lambda value: 255 if value >= 170 else 0)
    canvas = Image.new(processed.mode, (processed.width + 32, processed.height + 32), 255)
    canvas.paste(processed, (16, 16))
    canvas.save(output_root / entry["image"], format="PNG")

manifest["preprocessing"] = {
    "mode": mode,
    "minimumTargetHeight": 120,
    "scaleRange": [2, 6],
    "paddingPixels": 16,
}
(output_root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"mode": mode, "cropCount": manifest.get("cropCount", 0), "outputRoot": str(output_root)}, ensure_ascii=False))
