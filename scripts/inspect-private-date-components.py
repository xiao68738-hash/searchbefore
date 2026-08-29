r"""Inspect connected ink components in private handwritten date crops.

This is a diagnostic tool: it writes an annotated image and JSON report only
under D:\SearchBefore\private and performs no recognition or answer forcing.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageOps


PRIVATE_ROOT = Path(r"D:\SearchBefore\private").resolve()


def private_path(path: Path, *, create_parent: bool = False) -> Path:
    resolved = path.resolve()
    if resolved != PRIVATE_ROOT and PRIVATE_ROOT not in resolved.parents:
        raise ValueError(f"Path must stay under {PRIVATE_ROOT}")
    if create_parent:
        resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def connected_components(mask: np.ndarray) -> list[dict[str, Any]]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components: list[dict[str, Any]] = []
    for start_y, start_x in zip(*np.nonzero(mask & ~visited)):
        if visited[start_y, start_x]:
            continue
        queue = deque([(int(start_x), int(start_y))])
        visited[start_y, start_x] = True
        xs: list[int] = []
        ys: list[int] = []
        while queue:
            x, y = queue.popleft()
            xs.append(x)
            ys.append(y)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    next_x = x + dx
                    next_y = y + dy
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    if mask[next_y, next_x] and not visited[next_y, next_x]:
                        visited[next_y, next_x] = True
                        queue.append((next_x, next_y))
        components.append(
            {
                "left": min(xs),
                "top": min(ys),
                "right": max(xs) + 1,
                "bottom": max(ys) + 1,
                "area": len(xs),
                "pixels": list(zip(xs, ys)),
            }
        )
    return components


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-image", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--threshold", type=int, default=125)
    args = parser.parse_args()

    input_path = private_path(args.input)
    output_image = private_path(args.output_image, create_parent=True)
    output_json = private_path(args.output_json, create_parent=True)
    with Image.open(input_path) as opened:
        gray = ImageOps.grayscale(opened)
    pixels = np.asarray(gray, dtype=np.uint8)
    components = connected_components(pixels < args.threshold)
    height, width = pixels.shape
    kept: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    minimum_area = max(12, round(width * height * 0.0003))
    for component in components:
        box_width = component["right"] - component["left"]
        box_height = component["bottom"] - component["top"]
        reason = ""
        if component["area"] < minimum_area:
            reason = "tiny-noise"
        elif box_width > width * 0.25 and box_height < height * 0.08:
            reason = "wide-ruling-line"
        elif component["top"] < height * 0.12 and box_width > width * 0.22:
            reason = "top-ruling-line"
        if reason:
            rejected.append({**component, "reason": reason})
        else:
            kept.append(component)

    annotated = gray.convert("RGB")
    draw = ImageDraw.Draw(annotated)
    for component in rejected:
        draw.rectangle(
            (component["left"], component["top"], component["right"], component["bottom"]),
            outline="orange",
            width=2,
        )
    ordered_kept = sorted(kept, key=lambda item: item["left"])
    for index, component in enumerate(ordered_kept, start=1):
        draw.rectangle(
            (component["left"], component["top"], component["right"], component["bottom"]),
            outline="red",
            width=2,
        )
        draw.text((component["left"], max(0, component["top"] - 10)), str(index), fill="red")
        glyph = Image.new(
            "L",
            (component["right"] - component["left"], component["bottom"] - component["top"]),
            color=255,
        )
        glyph_pixels = glyph.load()
        for x, y in component["pixels"]:
            glyph_pixels[x - component["left"], y - component["top"]] = 0
        glyph_name = f"component-{index:02d}.png"
        glyph.save(output_image.parent / glyph_name, "PNG")
        component["glyphImage"] = glyph_name
    annotated.save(output_image, "PNG")
    report = {
        "schemaVersion": 1,
        "sourceImage": input_path.name,
        "threshold": args.threshold,
        "imageSize": [width, height],
        "kept": [
            {key: value for key, value in component.items() if key != "pixels"}
            for component in ordered_kept
        ],
        "rejected": [
            {key: value for key, value in component.items() if key != "pixels"}
            for component in rejected
        ],
    }
    output_json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"kept": len(kept), "rejected": len(rejected)}))


if __name__ == "__main__":
    main()
