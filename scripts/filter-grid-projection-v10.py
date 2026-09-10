import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


if len(sys.argv) != 4:
    raise SystemExit(
        "Usage: python scripts/filter-grid-projection-v10.py "
        "<ground-truth-root> <source-predictions> <private-output>"
    )

gt_root = Path(sys.argv[1]).resolve()
source_root = Path(sys.argv[2]).resolve()
output_root = Path(sys.argv[3]).resolve()
private_root = Path("D:/SearchBefore/private").resolve()
if private_root not in output_root.parents:
    raise SystemExit(f"Predictions must stay under {private_root}")
output_root.mkdir(parents=True, exist_ok=True)


def strong_edge_fraction(image_path, cells):
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
    return round(float(np.mean(np.asarray(supports) >= 0.5)), 4) if supports else 0


manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
accepted = []
rejected = []
for entry in manifest["documents"]:
    ground_truth = json.loads(
        (gt_root / entry["groundTruth"]).read_text(encoding="utf-8")
    )
    prediction = json.loads(
        (source_root / f'{entry["id"]}.json').read_text(encoding="utf-8")
    )
    tables = prediction.get("tables", [])
    diagnostics = tables[0].get("diagnostics", {}) if tables else {}
    projection_regions = [
        region for region in diagnostics.get("projectionRegions", [])
        if region.get("accepted")
    ]
    is_projection_lane = (
        diagnostics.get("selectedLane") == "v5-preserved"
        and bool(projection_regions)
    )
    if is_projection_lane:
        cells = [cell for table in tables for cell in table.get("cells", [])]
        width_cvs = [
            float(region["cellWidthCv"])
            for region in projection_regions
            if region.get("cellWidthCv") is not None
        ]
        line_support = strong_edge_fraction(
            ground_truth["image"]["privatePath"], cells
        )
        aspect_ratio = (
            ground_truth["image"]["width"] / ground_truth["image"]["height"]
        )
        narrow_regular_grid = bool(width_cvs) and min(width_cvs) < 0.55
        corroborated_irregular_grid = (
            bool(width_cvs)
            and max(width_cvs) >= 0.80
            and line_support >= 0.45
            and aspect_ratio <= 1.25
        )
        gate = {
            "minimumCellWidthCv": round(min(width_cvs), 4) if width_cvs else None,
            "maximumCellWidthCv": round(max(width_cvs), 4) if width_cvs else None,
            "strongEdgeFraction": line_support,
            "imageAspectRatio": round(aspect_ratio, 4),
            "accepted": narrow_regular_grid or corroborated_irregular_grid,
        }
        if gate["accepted"]:
            diagnostics["projectionConfidenceGateV10"] = gate
            accepted.append(entry["id"])
        else:
            prediction = {
                **prediction,
                "model": "naf-gridline-v10-projection-confidence-gate",
                "tables": [],
                "selection": {
                    "lane": "projection-confidence-rejected",
                    "projectionConfidenceGateV10": gate,
                },
            }
            rejected.append(entry["id"])

    (output_root / f'{entry["id"]}.json').write_text(
        json.dumps(prediction, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

print(json.dumps({
    "documents": len(manifest["documents"]),
    "acceptedProjectionDocuments": accepted,
    "rejectedProjectionDocuments": rejected,
    "outputRoot": str(output_root),
}))
