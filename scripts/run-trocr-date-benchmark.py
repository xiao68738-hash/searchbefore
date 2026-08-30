r"""Run Microsoft TrOCR locally on private handwritten date crops.

The model weights may be downloaded from Hugging Face, but input images never
leave this computer. Both input and output are restricted to D:\SearchBefore\private.
This is a development benchmark, not an Android production dependency.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel


PRIVATE_ROOT = Path(r"D:\SearchBefore\private").resolve()
MODEL_ID = "microsoft/trocr-small-handwritten"


def private_path(path: Path, *, create: bool = False) -> Path:
    resolved = path.resolve()
    if resolved != PRIVATE_ROOT and PRIVATE_ROOT not in resolved.parents:
        raise ValueError(f"Path must stay under {PRIVATE_ROOT}")
    if create:
        resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--cache", required=True, type=Path)
    args = parser.parse_args()

    input_directory = private_path(args.input)
    output_directory = private_path(args.output, create=True)
    cache_directory = args.cache.resolve()
    cache_directory.mkdir(parents=True, exist_ok=True)

    processor = TrOCRProcessor.from_pretrained(MODEL_ID, cache_dir=cache_directory)
    model = VisionEncoderDecoderModel.from_pretrained(MODEL_ID, cache_dir=cache_directory)
    model.eval()

    images = sorted(input_directory.glob("date-*.png"))
    if not images:
        raise ValueError(f"No private date crops found in {input_directory}")

    results: list[dict[str, object]] = []
    for image_path in images:
        started_at = time.perf_counter()
        with Image.open(image_path) as opened:
            image = opened.convert("RGB")
        pixel_values = processor(images=image, return_tensors="pt").pixel_values
        generated_ids = model.generate(pixel_values, max_new_tokens=12, num_beams=4)
        text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()
        result = {
            "schemaVersion": 1,
            "sourceImage": image_path.name,
            "engine": f"Microsoft TrOCR {MODEL_ID}",
            "text": text,
            "elapsedMs": round((time.perf_counter() - started_at) * 1000),
            "privacy": "Local inference; image not uploaded.",
        }
        results.append(result)
        destination = output_directory / f"{image_path.stem}.trocr.json"
        destination.write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    print(json.dumps({"model": MODEL_ID, "attemptCount": len(results)}))


if __name__ == "__main__":
    main()
