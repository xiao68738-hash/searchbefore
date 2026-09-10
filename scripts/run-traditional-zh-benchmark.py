r"""Run an optional local Traditional-Chinese OCR research model.

This runner is deliberately separate from the production OCR path. It uses
the ZihCiLin TrOCR Traditional Chinese baseline when the user has obtained the
model and accepted its terms. The model is trained on synthetic/historical
text and is not expected to solve filled NAF handwriting by itself. Images and
outputs must stay under ``D:\\SearchBefore\\private``; no image is uploaded.

The runner never downloads weights unless ``--allow-download`` is supplied.
The model is about 1.24 GB (metadata checked 2026-09-09), so an accidental
download should not happen during a normal test run.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from PIL import Image


PRIVATE_ROOT = Path(r"D:\SearchBefore\private").resolve()
DEFAULT_MODEL = "ZihCiLin/trocr-traditional-chinese-baseline"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def private_path(path: Path, *, create: bool = False) -> Path:
    resolved = path.resolve()
    if resolved != PRIVATE_ROOT and PRIVATE_ROOT not in resolved.parents:
        raise ValueError(f"Path must stay under {PRIVATE_ROOT}")
    if create:
        resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def image_paths(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path] if input_path.suffix.lower() in SUPPORTED_EXTENSIONS else []
    return sorted(
        path
        for path in input_path.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )


def has_cached_model(cache_path: Path, model_name: str) -> bool:
    """Return whether a Hugging Face snapshot looks complete enough to load."""
    cache_model_dir = cache_path / f"models--{model_name.replace('/', '--')}"
    return any(
        (snapshot / "config.json").is_file()
        for snapshot in (cache_model_dir / "snapshots").glob("*")
        if snapshot.is_dir()
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Local Traditional Chinese OCR research benchmark")
    parser.add_argument("--input", required=True, type=Path, help="one image or a directory under private/")
    parser.add_argument("--output", required=True, type=Path, help="output directory under private/")
    parser.add_argument("--cache", required=True, type=Path, help="Hugging Face cache directory")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--max-new-tokens", type=int, default=128)
    parser.add_argument("--num-beams", type=int, default=2)
    parser.add_argument("--allow-download", action="store_true", help="explicitly permit downloading model weights")
    args = parser.parse_args()

    input_path = private_path(args.input)
    output_path = private_path(args.output, create=True)
    cache_path = args.cache.resolve()
    cache_path.mkdir(parents=True, exist_ok=True)
    images = image_paths(input_path)
    if not images:
        raise ValueError(f"No supported images found under {input_path}")

    local_only = not args.allow_download
    if local_only and not has_cached_model(cache_path, args.model):
        raise SystemExit(
            "研究模型尚未存在於本機快取；為避免未授權或意外下載，這次未執行推論。"
            "確認模型授權後，才可重新執行並加上 --allow-download。"
        )

    from transformers import TrOCRProcessor, VisionEncoderDecoderModel

    try:
        processor = TrOCRProcessor.from_pretrained(
            args.model, cache_dir=cache_path, local_files_only=local_only
        )
        model = VisionEncoderDecoderModel.from_pretrained(
            args.model, cache_dir=cache_path, local_files_only=local_only
        )
    except OSError as exc:
        if local_only:
            raise SystemExit(
                "研究模型尚未存在於本機快取；為避免未授權或意外下載，這次未執行推論。"
                "確認模型授權後，才可重新執行並加上 --allow-download。"
            ) from exc
        raise SystemExit(f"研究模型載入失敗：{exc}") from exc
    model.eval()

    results: list[dict[str, object]] = []
    for image_path in images:
        started_at = time.perf_counter()
        with Image.open(image_path) as opened:
            image = opened.convert("RGB")
        pixel_values = processor(images=image, return_tensors="pt").pixel_values
        generated_ids = model.generate(
            pixel_values,
            max_new_tokens=max(1, min(args.max_new_tokens, 512)),
            num_beams=max(1, min(args.num_beams, 8)),
        )
        text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()
        result = {
            "schemaVersion": 1,
            "sourceImage": image_path.name,
            "engine": f"TrOCR {args.model}",
            "text": text,
            "elapsedMs": round((time.perf_counter() - started_at) * 1000),
            "privacy": "Local inference; image not uploaded.",
            "requiresHumanReview": True,
            "productionEligible": False,
        }
        results.append(result)
        (output_path / f"{image_path.stem}.traditional-zh.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    summary = {
        "schemaVersion": 1,
        "model": args.model,
        "localOnly": local_only,
        "imageCount": len(results),
        "output": str(output_path),
        "results": [
            {
                "sourceImage": item["sourceImage"],
                "elapsedMs": item["elapsedMs"],
                "textLength": len(str(item["text"])),
            }
            for item in results
        ],
    }
    (output_path / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
