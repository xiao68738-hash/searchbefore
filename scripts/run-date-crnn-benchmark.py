r"""Evaluate the synthetic MNIST date CRNN on private TGAP date crops."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps


PRIVATE_ROOT = Path(r"D:\SearchBefore\private").resolve()
TOOLS_ROOT = Path(r"D:\SearchBefore\tools").resolve()
VALID_MONTH_DAY = re.compile(r"^(?:[1-9]|1[0-2])/(?:[1-9]|[12]\d|3[01])$")


def restricted(path: Path, root: Path, *, create: bool = False) -> Path:
    resolved = path.resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"Path must stay under {root}")
    if create:
        resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def load_model_module():
    source = Path(__file__).with_name("train-handwritten-date-crnn.py")
    spec = importlib.util.spec_from_file_location("date_crnn_training", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load model definition from {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def prepare_image(path: Path) -> torch.Tensor:
    with Image.open(path) as opened:
        gray = ImageOps.autocontrast(ImageOps.grayscale(opened), cutoff=1)
    scale = min(216 / gray.width, 56 / gray.height)
    resized = gray.resize(
        (max(1, round(gray.width * scale)), max(1, round(gray.height * scale))),
        Image.Resampling.BICUBIC,
    )
    canvas = Image.new("L", (224, 64), color=255)
    canvas.paste(resized, (4, (64 - resized.height) // 2))
    pixels = np.asarray(canvas, dtype=np.float32)
    return torch.from_numpy((255.0 - pixels) / 255.0).unsqueeze(0).unsqueeze(0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    model_path = restricted(args.model, TOOLS_ROOT)
    input_directory = restricted(args.input, PRIVATE_ROOT)
    output_directory = restricted(args.output, PRIVATE_ROOT, create=True)
    module = load_model_module()
    checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
    model = module.DateCrnn()
    model.load_state_dict(checkpoint["stateDict"])
    model.eval()

    attempts: list[dict[str, object]] = []
    with torch.no_grad():
        for image_path in sorted(input_directory.glob("date-*.png")):
            logits = model(prepare_image(image_path))
            token_ids = logits.argmax(dim=2)[:, 0].tolist()
            text = module.decode_ids(token_ids)
            mean_timestep_confidence = float(logits.exp().max(dim=2).values.mean().item())
            attempt = {
                "sourceImage": image_path.name,
                "text": text,
                "validMonthDay": bool(VALID_MONTH_DAY.fullmatch(text)),
                "meanTimestepConfidence": round(mean_timestep_confidence, 6),
                "autoCommitAllowed": False,
                "trainingUsesPrivateGroundTruth": False,
            }
            attempts.append(attempt)
            (output_directory / f"{image_path.stem}.date-crnn.json").write_text(
                json.dumps(attempt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )

    report = {
        "schemaVersion": 1,
        "engine": "local synthetic MNIST DateCrnn",
        "attemptCount": len(attempts),
        "validMonthDayCount": sum(bool(item["validMonthDay"]) for item in attempts),
        "autoCommitAllowed": False,
        "attempts": attempts,
    }
    (output_directory / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({key: report[key] for key in ("attemptCount", "validMonthDayCount")}))


if __name__ == "__main__":
    main()
