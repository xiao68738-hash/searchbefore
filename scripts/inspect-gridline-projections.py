import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


if len(sys.argv) != 3:
    raise SystemExit("Usage: python scripts/inspect-gridline-projections.py <ground-truth-root> <document-id>")

script_dir = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("gridline_v5", script_dir / "run-gridline-cell-benchmark-v5.py")
gridline_v5 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gridline_v5)

root = Path(sys.argv[1]).resolve()
document_id = sys.argv[2]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
entry = next(item for item in manifest["documents"] if item["id"] == document_id)
ground_truth = json.loads((root / entry["groundTruth"]).read_text(encoding="utf-8"))
image = Image.open(ground_truth["image"]["privatePath"]).convert("RGB")
scale = min(1.0, gridline_v5.MAX_ANALYSIS_EDGE / max(image.width, image.height))
gray = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS).convert("L")
angle, _, _ = gridline_v5.gridline_v3.estimate_skew(gray)
deskewed = gray.rotate(angle, Image.Resampling.BICUBIC, expand=False, fillcolor=255) if angle else gray

for region_index, (x1, y1, x2, y2) in enumerate(gridline_v5.gridline_v4.page_regions(deskewed)):
    crop = deskewed.crop((x1, y1, x2, y2))
    mask = gridline_v5.gridline_v4.local_contrast_mask(crop, 5)
    pixels = np.asarray(crop).astype(np.int16)
    background = np.asarray(crop.filter(gridline_v5.gridline_v4.ImageFilter.BoxBlur(radius=18))).astype(np.int16)
    contrast = background - pixels
    horizontal = gridline_v5.gridline_v2.detect_horizontal_lines(mask, density=0.42)
    vertical = gridline_v5.gridline_v2.detect_vertical_lines(mask, density=0.42)
    horizontal = [line for line in horizontal if line["end"] - line["start"] >= crop.width * 0.22]
    vertical = [line for line in vertical if line["end"] - line["start"] >= crop.height * 0.22]
    def encode(line, size, axis):
        coordinate = round(line["coordinate"])
        if axis == "horizontal":
            strip = contrast[max(0, coordinate - 1):coordinate + 2, :]
        else:
            strip = contrast[:, max(0, coordinate - 1):coordinate + 2]
        return {
            "coordinate": round(line["coordinate"], 2),
            "coverage": round((line["end"] - line["start"]) / size, 3),
            "contrastMean": round(float(np.mean(np.max(strip, axis=0 if axis == "horizontal" else 1))), 3),
            "contrastP75": round(float(np.percentile(strip, 75)), 3),
            "start": round(line["start"], 1),
            "end": round(line["end"], 1),
        }
    print(json.dumps({
        "documentId": document_id,
        "regionIndex": region_index,
        "bounds": [x1, y1, x2, y2],
        "horizontal": [encode(line, crop.width, "horizontal") for line in horizontal],
        "vertical": [encode(line, crop.height, "vertical") for line in vertical],
    }))
