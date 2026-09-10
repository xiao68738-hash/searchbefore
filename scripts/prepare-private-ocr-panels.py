r"""Split private 3x3 OCR contact sheets into local-only panel variants.

This script deliberately refuses to write outside D:\SearchBefore\private.
The generated images may still contain personal data and must never be committed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps


PRIVATE_ROOT = Path(r"D:\SearchBefore\private").resolve()
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


def ensure_private_output(path: Path) -> Path:
    resolved = path.resolve()
    if resolved != PRIVATE_ROOT and PRIVATE_ROOT not in resolved.parents:
        raise ValueError(f"Output must stay under {PRIVATE_ROOT}")
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def active_bounds(cell: Image.Image) -> tuple[int, int, int, int] | None:
    """Find the photographed page while ignoring the pale contact-sheet canvas."""
    gray = ImageOps.grayscale(cell)
    width, height = gray.size
    pixels = gray.load()

    row_hits = [sum(pixels[x, y] < 225 for x in range(width)) for y in range(height)]
    col_hits = [sum(pixels[x, y] < 225 for y in range(height)) for x in range(width)]
    active_rows = [index for index, count in enumerate(row_hits) if count >= max(8, width // 50)]
    active_cols = [index for index, count in enumerate(col_hits) if count >= max(8, height // 70)]
    dark_pixels = sum(row_hits)

    if not active_rows or not active_cols or dark_pixels < width * height * 0.004:
        return None

    padding = 12
    left = max(0, min(active_cols) - padding)
    top = max(0, min(active_rows) - padding)
    right = min(width, max(active_cols) + padding + 1)
    bottom = min(height, max(active_rows) + padding + 1)
    if right - left < 120 or bottom - top < 120:
        return None
    return left, top, right, bottom


def prepare_panel(panel: Image.Image, scale: int) -> Image.Image:
    panel = ImageOps.exif_transpose(panel).convert("RGB")
    panel = ImageOps.autocontrast(panel, cutoff=1)
    panel = ImageEnhance.Contrast(panel).enhance(1.12)
    return panel.resize((panel.width * scale, panel.height * scale), Image.Resampling.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--columns", type=int, default=3)
    parser.add_argument("--rows", type=int, default=3)
    parser.add_argument("--header-height", type=int, default=38)
    parser.add_argument("--scale", type=int, default=3)
    args = parser.parse_args()

    output = ensure_private_output(args.output)
    source_files = sorted(
        path for path in args.input.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )
    manifest: list[dict[str, object]] = []

    for source in source_files:
        with Image.open(source) as opened:
            sheet = ImageOps.exif_transpose(opened).convert("RGB")
        cell_width = sheet.width // args.columns
        cell_height = sheet.height // args.rows

        for row in range(args.rows):
            for column in range(args.columns):
                index = row * args.columns + column + 1
                left = column * cell_width
                top = row * cell_height + args.header_height
                right = sheet.width if column == args.columns - 1 else (column + 1) * cell_width
                bottom = sheet.height if row == args.rows - 1 else (row + 1) * cell_height
                cell = sheet.crop((left, top, right, bottom))
                bounds = active_bounds(cell)
                if bounds is None:
                    continue
                panel = prepare_panel(cell.crop(bounds), args.scale)
                base_name = f"{source.stem}-panel-{index:02d}"
                variants: list[str] = []
                for angle in (0, 90, 180, 270):
                    variant = panel if angle == 0 else panel.rotate(angle, expand=True, fillcolor="white")
                    filename = f"{base_name}-rot{angle}.jpg"
                    variant.save(output / filename, "JPEG", quality=94, optimize=True)
                    variants.append(filename)
                manifest.append(
                    {
                        "sourceSheet": source.name,
                        "panelIndex": index,
                        "cell": {"row": row + 1, "column": column + 1},
                        "cropBoundsInCell": list(bounds),
                        "preparedSize": list(panel.size),
                        "variants": variants,
                    }
                )

    payload = {
        "schemaVersion": 1,
        "privacy": "Contains controlled OCR test images. Do not upload or commit.",
        "panelCount": len(manifest),
        "variantCount": sum(len(item["variants"]) for item in manifest),
        "panels": manifest,
    }
    (output / "manifest.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"panelCount": payload["panelCount"], "variantCount": payload["variantCount"]}))


if __name__ == "__main__":
    main()
