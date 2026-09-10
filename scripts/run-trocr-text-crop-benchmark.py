r"""Run the cached Microsoft TrOCR handwritten baseline on NAF text crops.

This runner is intentionally a private, local benchmark.  It does not upload
images and it never writes outside ``D:\SearchBefore\private``.  The model was
trained for handwritten Latin text, so this is a comparison lane rather than a
claim that it understands Traditional Chinese.
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
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--max-new-tokens", type=int, default=32)
    args = parser.parse_args()
    if args.batch_size < 1 or args.batch_size > 32:
        raise ValueError("--batch-size must be between 1 and 32")
    if args.max_new_tokens < 1 or args.max_new_tokens > 128:
        raise ValueError("--max-new-tokens must be between 1 and 128")

    input_directory = private_path(args.input)
    output_directory = private_path(args.output, create=True)
    cache_directory = args.cache.resolve()
    cache_directory.mkdir(parents=True, exist_ok=True)

    # Keep the benchmark deterministic and offline once the model is cached.
    # ``local_files_only`` also prevents an accidental network request when
    # this runner is used with private farm records.
    processor = TrOCRProcessor.from_pretrained(
        MODEL_ID, cache_dir=cache_directory, local_files_only=True
    )
    model = VisionEncoderDecoderModel.from_pretrained(
        MODEL_ID, cache_dir=cache_directory, local_files_only=True
    )
    model.eval()

    images = sorted(input_directory.glob("*.png"))
    if not images:
        raise ValueError(f"No private PNG crops found in {input_directory}")

    total_started = time.perf_counter()
    count = 0
    for offset in range(0, len(images), args.batch_size):
        batch_paths = images[offset : offset + args.batch_size]
        opened = []
        try:
            for image_path in batch_paths:
                with Image.open(image_path) as source:
                    opened.append(source.convert("RGB"))
            pixel_values = processor(images=opened, return_tensors="pt").pixel_values
            generated_ids = model.generate(
                pixel_values,
                max_new_tokens=args.max_new_tokens,
                num_beams=4,
            )
            texts = processor.batch_decode(generated_ids, skip_special_tokens=True)
            for image_path, text in zip(batch_paths, texts):
                result = {
                    "schemaVersion": 1,
                    "sourceImage": image_path.name,
                    "engine": f"Microsoft TrOCR {MODEL_ID}",
                    "language": "handwritten Latin baseline",
                    "text": text.strip(),
                    "elapsedMs": None,
                    "privacy": "Local inference; image not uploaded.",
                }
                (output_directory / f"{image_path.stem}.trocr.json").write_text(
                    json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                count += 1
        finally:
            for image in opened:
                image.close()
        print(json.dumps({"completed": count, "total": len(images)}), flush=True)

    print(json.dumps({
        "model": MODEL_ID,
        "attemptCount": count,
        "elapsedMs": round((time.perf_counter() - total_started) * 1000),
        "output": str(output_directory),
    }))


if __name__ == "__main__":
    main()
