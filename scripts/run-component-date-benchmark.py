r"""Recognize a private handwritten month/day crop from isolated components.

The slash is selected from geometry only. Remaining components are classified
with an MNIST-only model. Results are research candidates and always require
human review; this script cannot enable automatic form submission.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps
from torch import nn


PRIVATE_ROOT = Path(r"D:\SearchBefore\private").resolve()
TOOLS_ROOT = Path(r"D:\SearchBefore\tools").resolve()


def restricted_path(path: Path, root: Path, *, create_parent: bool = False) -> Path:
    resolved = path.resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"Path must stay under {root}")
    if create_parent:
        resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


class DigitCnn(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 7 * 7, 128),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(128, 10),
        )

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(images))


def normalize_glyph(path: Path) -> tuple[torch.Tensor, Image.Image]:
    with Image.open(path) as opened:
        gray = ImageOps.grayscale(opened)
    ink = 255 - np.asarray(gray, dtype=np.uint8)
    ys, xs = np.nonzero(ink > 0)
    if not len(xs):
        raise ValueError(f"No ink in {path}")
    cropped = ink[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    height, width = cropped.shape
    scale = min(20 / max(1, width), 20 / max(1, height))
    resized_width = max(1, round(width * scale))
    resized_height = max(1, round(height * scale))
    resized = Image.fromarray(cropped, mode="L").resize(
        (resized_width, resized_height), Image.Resampling.LANCZOS
    )
    canvas = Image.new("L", (28, 28), color=0)
    canvas.paste(resized, ((28 - resized_width) // 2, (28 - resized_height) // 2))
    values = np.asarray(canvas, dtype=np.float32) / 255.0
    tensor = torch.from_numpy((values - 0.1307) / 0.3081).unsqueeze(0).unsqueeze(0)
    return tensor, canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--components", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path, action="append")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    components_path = restricted_path(args.components, PRIVATE_ROOT)
    output_path = restricted_path(args.output, PRIVATE_ROOT, create_parent=True)
    report = json.loads(components_path.read_text(encoding="utf-8"))
    components = report.get("kept", [])
    if not 3 <= len(components) <= 5:
        raise ValueError("Expected 3-5 isolated date components")

    enriched: list[dict[str, object]] = []
    for component in components:
        width = component["right"] - component["left"]
        height = component["bottom"] - component["top"]
        enriched.append(
            {
                **component,
                "width": width,
                "height": height,
                "centerX": (component["left"] + component["right"]) / 2,
                "fillRatio": component["area"] / max(1, width * height),
            }
        )
    heights = sorted(float(item["height"]) for item in enriched)
    median_height = heights[len(heights) // 2]
    slash_candidates = [
        item for item in enriched
        if float(item["fillRatio"]) < 0.18 and float(item["height"]) >= median_height
    ]
    if len(slash_candidates) != 1:
        raise ValueError(f"Ambiguous slash geometry: {len(slash_candidates)} candidates")
    slash = slash_candidates[0]
    digits = [item for item in enriched if item is not slash]
    month_digits = sorted(
        [item for item in digits if float(item["centerX"]) < float(slash["centerX"])],
        key=lambda item: float(item["centerX"]),
    )
    day_digits = sorted(
        [item for item in digits if float(item["centerX"]) > float(slash["centerX"])],
        key=lambda item: float(item["centerX"]),
    )
    structure_valid = 1 <= len(month_digits) <= 2 and 1 <= len(day_digits) <= 2

    model_entries: list[tuple[Path, dict[str, object], DigitCnn]] = []
    for requested_model_path in args.model:
        model_path = restricted_path(requested_model_path, TOOLS_ROOT)
        checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
        model = DigitCnn()
        model.load_state_dict(checkpoint["stateDict"])
        model.eval()
        model_entries.append((model_path, checkpoint, model))
    predictions: list[dict[str, object]] = []
    for index, component in enumerate(month_digits + day_digits, start=1):
        glyph_path = restricted_path(components_path.parent / str(component["glyphImage"]), PRIVATE_ROOT)
        tensor, normalized = normalize_glyph(glyph_path)
        normalized_name = f"normalized-digit-{index:02d}.png"
        normalized.save(output_path.parent / normalized_name, "PNG")
        model_predictions: list[dict[str, object]] = []
        for model_path, _checkpoint, model in model_entries:
            with torch.no_grad():
                probabilities = torch.softmax(model(tensor), dim=1)[0]
            values, classes = torch.topk(probabilities, k=3)
            model_predictions.append(
                {
                    "model": model_path.parent.name,
                    "digit": int(classes[0].item()),
                    "confidence": float(values[0].item()),
                    "top3": [
                        {"digit": int(label), "confidence": float(value)}
                        for label, value in zip(classes.tolist(), values.tolist())
                    ],
                }
            )
        top_digits = {int(item["digit"]) for item in model_predictions}
        agreement = len(top_digits) == 1
        predictions.append(
            {
                "glyphImage": component["glyphImage"],
                "normalizedImage": normalized_name,
                "side": "month" if component in month_digits else "day",
                "digit": next(iter(top_digits)) if agreement else None,
                "agreement": agreement,
                "confidenceFloor": min(float(item["confidence"]) for item in model_predictions),
                "models": model_predictions,
            }
        )

    month_count = len(month_digits)
    ensemble_agrees = all(bool(item["agreement"]) for item in predictions)
    month_text = "".join(str(item["digit"]) for item in predictions[:month_count])
    day_text = "".join(str(item["digit"]) for item in predictions[month_count:])
    candidate = f"{month_text}/{day_text}" if structure_valid and ensemble_agrees else ""
    numeric_valid = False
    if structure_valid and ensemble_agrees:
        month = int(month_text)
        day = int(day_text)
        numeric_valid = 1 <= month <= 12 and 1 <= day <= 31
    result = {
        "schemaVersion": 1,
        "candidate": candidate,
        "structureValid": structure_valid,
        "ensembleAgrees": ensemble_agrees,
        "calendarRangeValid": numeric_valid,
        "slash": {
            "glyphImage": slash["glyphImage"],
            "selectionMethod": "single low-fill tall connected component",
            "fillRatio": slash["fillRatio"],
        },
        "digits": predictions,
        "modelEvidence": [
            {
                "model": model_path.parent.name,
                "trainingSource": checkpoint["training"]["source"],
                "usesPrivateGroundTruth": checkpoint["training"]["usesPrivateGroundTruth"],
                "augmentation": checkpoint["training"].get("augmentation", "unspecified"),
            }
            for model_path, checkpoint, _model in model_entries
        ],
        "requiresHumanReview": True,
        "autoCommitAllowed": False,
    }
    output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidate": candidate, "calendarRangeValid": numeric_valid}))


if __name__ == "__main__":
    main()
