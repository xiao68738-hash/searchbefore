import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


if len(sys.argv) != 5:
    raise SystemExit(
        "Usage: python scripts/filter-orientation-recovery-v11.py "
        "<ground-truth-root> <base-predictions> <recovery-predictions> <private-output>"
    )

gt_root = Path(sys.argv[1]).resolve()
base_root = Path(sys.argv[2]).resolve()
recovery_root = Path(sys.argv[3]).resolve()
output_root = Path(sys.argv[4]).resolve()
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
        xs = [point[0] for point in cell["polygon"]]
        ys = [point[1] for point in cell["polygon"]]
        left, right = min(xs), max(xs)
        top, bottom = min(ys), max(ys)
        segments = (
            ("h", top, left, right),
            ("h", bottom, left, right),
            ("v", left, top, bottom),
            ("v", right, top, bottom),
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


def cell_count(prediction):
    return sum(len(table.get("cells", [])) for table in prediction.get("tables", []))


manifest = json.loads((gt_root / "manifest.json").read_text(encoding="utf-8"))
accepted = []
rejected = []
for entry in manifest["documents"]:
    base = json.loads((base_root / f'{entry["id"]}.json').read_text(encoding="utf-8"))
    recovery = json.loads(
        (recovery_root / f'{entry["id"]}.json').read_text(encoding="utf-8")
    )
    prediction = base
    if cell_count(base) == 0 and cell_count(recovery) > 0:
        ground_truth = json.loads(
            (gt_root / entry["groundTruth"]).read_text(encoding="utf-8")
        )
        table = recovery["tables"][0]
        diagnostics = table.get("diagnostics", {})
        selected = diagnostics.get("orientationFallback", {}).get("selected", {})
        cells = table.get("cells", [])
        orientation = selected.get("orientationDegrees")
        width_cv = float(selected.get("cellWidthCv", 99))
        height_cv = float(selected.get("cellHeightCv", 99))
        horizontal_coverage = float(selected.get("horizontalCoverageMedian", 0))
        line_support = strong_edge_fraction(
            ground_truth["image"]["privatePath"], cells
        )
        stable_lower_table = bool(selected.get("stableLowerTableFilter"))
        strong_unrotated_grid = (
            orientation == 0 and len(cells) <= 250 and line_support >= 0.75
        )
        compact_rotated_grid = (
            orientation in (90, 270) and width_cv <= 0.30 and height_cv <= 0.35
        )
        corroborated_rotated_grid = (
            orientation in (90, 270)
            and 200 <= len(cells) <= 300
            and width_cv >= 0.75
            and height_cv <= 0.50
            and horizontal_coverage <= 0.80
        )
        gate = {
            "cellCount": len(cells),
            "orientationDegrees": orientation,
            "cellWidthCv": width_cv,
            "cellHeightCv": height_cv,
            "horizontalCoverageMedian": horizontal_coverage,
            "strongEdgeFraction": line_support,
            "stableLowerTable": stable_lower_table,
            "accepted": (
                stable_lower_table
                or strong_unrotated_grid
                or compact_rotated_grid
                or corroborated_rotated_grid
            ),
        }
        if gate["accepted"]:
            diagnostics["orientationRecoveryGateV11"] = gate
            prediction = recovery
            accepted.append(entry["id"])
        else:
            rejected.append(entry["id"])

    (output_root / f'{entry["id"]}.json').write_text(
        json.dumps(prediction, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

print(json.dumps({
    "documents": len(manifest["documents"]),
    "acceptedRecoveryDocuments": accepted,
    "rejectedRecoveryDocuments": rejected,
    "outputRoot": str(output_root),
}))
