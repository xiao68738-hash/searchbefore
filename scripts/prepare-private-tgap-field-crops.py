r"""Prepare local-only field crops from a photographed TGAP form.

The output is deliberately restricted to D:\SearchBefore\private because the
source image and crops may contain personal or farm-operation information.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageOps


PRIVATE_ROOT = Path(r"D:\SearchBefore\private").resolve()


def private_output(path: Path) -> Path:
    resolved = path.resolve()
    if resolved != PRIVATE_ROOT and PRIVATE_ROOT not in resolved.parents:
        raise ValueError(f"Output must stay under {PRIVATE_ROOT}")
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def parse_field(value: str) -> tuple[str, tuple[int, int, int, int]]:
    try:
        field_id, coordinates = value.split(":", 1)
        box = tuple(int(item) for item in coordinates.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("Use field-id:left,top,right,bottom") from error
    if not field_id or len(box) != 4 or box[2] <= box[0] or box[3] <= box[1]:
        raise argparse.ArgumentTypeError("Use field-id:left,top,right,bottom")
    return field_id, box


def add_white_padding(image: Image.Image, ratio: float = 0.12) -> Image.Image:
    padding = max(8, round(max(image.size) * ratio))
    return ImageOps.expand(image, border=padding, fill="white")


def handwriting_focus(crop: Image.Image, field_id: str) -> Image.Image | None:
    """Remove nearby printed labels and ruling lines without looking at field values.

    These ratios describe the stable fill-in area of TGAP table-13 fields. They are
    based on the printed template geometry, not on the confirmed handwritten answer.
    Unknown field types deliberately receive no focused variants.
    """

    width, height = crop.size
    if field_id.startswith("date-"):
        box = (
            round(width * 0.04),
            round(height * 0.43),
            round(width * 0.96),
            round(height * 0.93),
        )
    elif field_id.startswith("material-name-"):
        box = (
            round(width * 0.43),
            round(height * 0.08),
            round(width * 0.87),
            round(height * 0.94),
        )
    else:
        return None
    focused = crop.crop(box).convert("RGB")
    return add_white_padding(focused)


def suppress_horizontal_ruling_lines(image: Image.Image) -> Image.Image:
    """Remove near-horizontal table rules while preserving steep handwriting strokes.

    A small bounded Hough-style search is sufficient for these short field crops and
    avoids adding OpenCV or another native dependency to the private benchmark tool.
    Only lines spanning at least 58% of the crop are removed, so a handwritten slash
    or character stroke cannot qualify as a ruling line.
    """

    gray = np.asarray(ImageOps.grayscale(image), dtype=np.uint8)
    height, width = gray.shape
    dark = gray < 175
    x_values = np.arange(width)
    candidates: list[tuple[float, float, int]] = []
    for slope in np.linspace(-0.16, 0.16, 33):
        for intercept in range(-round(abs(slope) * width) - 2, height + 2):
            y_values = np.rint(slope * x_values + intercept).astype(int)
            valid = (y_values >= 1) & (y_values < height - 1)
            if valid.sum() < width * 0.8:
                continue
            xs = x_values[valid]
            ys = y_values[valid]
            hits = dark[ys - 1, xs] | dark[ys, xs] | dark[ys + 1, xs]
            coverage = float(hits.mean())
            if coverage >= 0.58:
                candidates.append((coverage, float(slope), intercept))

    selected: list[tuple[float, int]] = []
    for _coverage, slope, intercept in sorted(candidates, reverse=True):
        center_y = slope * (width / 2) + intercept
        if any(abs(center_y - (other_slope * (width / 2) + other_intercept)) < 5
               for other_slope, other_intercept in selected):
            continue
        selected.append((slope, intercept))
        if len(selected) == 4:
            break

    cleaned = gray.copy()
    for slope, intercept in selected:
        y_values = np.rint(slope * x_values + intercept).astype(int)
        for radius in range(-2, 3):
            ys = y_values + radius
            valid = (ys >= 0) & (ys < height)
            cleaned[ys[valid], x_values[valid]] = 255
    return Image.fromarray(cleaned, mode="L")


def focus_variants(crop: Image.Image, field_id: str) -> dict[str, Image.Image]:
    focused = handwriting_focus(crop, field_id)
    if focused is None:
        return {}
    enlarged = focused.resize(
        (focused.width * 4, focused.height * 4), Image.Resampling.LANCZOS
    )
    gray = ImageOps.grayscale(enlarged)
    contrasted = ImageEnhance.Contrast(ImageOps.autocontrast(gray, cutoff=1)).enhance(1.35)
    without_rules = suppress_horizontal_ruling_lines(focused)
    without_rules = add_white_padding(without_rules, ratio=0.06)
    without_rules = without_rules.resize(
        (without_rules.width * 4, without_rules.height * 4), Image.Resampling.LANCZOS
    )
    without_rules_gray = ImageOps.grayscale(without_rules)
    without_rules_contrast = ImageEnhance.Contrast(
        ImageOps.autocontrast(without_rules_gray, cutoff=1)
    ).enhance(1.35)
    return {
        "focus-raw": focused,
        "focus-upscale4": enlarged,
        "focus-autocontrast4": contrasted,
        "focus-threshold145": gray.point(
            lambda pixel: 255 if pixel >= 145 else 0, mode="1"
        ).convert("L"),
        "focus-threshold175": gray.point(
            lambda pixel: 255 if pixel >= 175 else 0, mode="1"
        ).convert("L"),
        "focus-threshold205": gray.point(
            lambda pixel: 255 if pixel >= 205 else 0, mode="1"
        ).convert("L"),
        "focus-no-rules-upscale4": without_rules,
        "focus-no-rules-autocontrast4": without_rules_contrast,
        "focus-no-rules-threshold175": without_rules_gray.point(
            lambda pixel: 255 if pixel >= 175 else 0, mode="1"
        ).convert("L"),
    }


def variants(crop: Image.Image, field_id: str) -> dict[str, Image.Image]:
    rgb = crop.convert("RGB")
    enlarged = rgb.resize((rgb.width * 3, rgb.height * 3), Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(enlarged)
    contrasted = ImageEnhance.Contrast(ImageOps.autocontrast(gray, cutoff=1)).enhance(1.2)
    threshold = gray.point(lambda pixel: 255 if pixel >= 175 else 0, mode="1").convert("L")
    prepared = {
        "raw": rgb,
        "upscale3": enlarged,
        "gray-autocontrast3": contrasted,
        "threshold175": threshold,
    }
    for angle in (-8, -4, 4, 8):
        prepared[f"rotate{angle:+d}-upscale3"] = enlarged.rotate(
            angle, expand=True, fillcolor="white", resample=Image.Resampling.BICUBIC
        )
    prepared.update(focus_variants(crop, field_id))
    return prepared


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--field", required=True, action="append", type=parse_field)
    args = parser.parse_args()

    output = private_output(args.output)
    with Image.open(args.input) as opened:
        source = ImageOps.exif_transpose(opened).convert("RGB")

    manifest_fields: list[dict[str, object]] = []
    for field_id, box in args.field:
        crop = source.crop(box)
        output_files: list[str] = []
        for variant_name, image in variants(crop, field_id).items():
            filename = f"{field_id}--{variant_name}.png"
            image.save(output / filename, "PNG", optimize=True)
            output_files.append(filename)
        manifest_fields.append({"id": field_id, "box": list(box), "variants": output_files})

    manifest = {
        "schemaVersion": 1,
        "sourceImage": args.input.name,
        "sourceSize": list(source.size),
        "privacy": "Local evaluation data. Do not upload or commit.",
        "fields": manifest_fields,
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"fieldCount": len(manifest_fields), "output": str(output)}))


if __name__ == "__main__":
    main()
