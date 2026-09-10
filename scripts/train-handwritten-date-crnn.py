r"""Train a small local date recognizer from MNIST-derived synthetic dates.

This research model is intentionally limited to month/day candidates such as
7/14. It never infers a year and must not auto-commit OCR results. Training data
comes from MNIST plus generated slash, ruling-line, rotation, and noise variants;
no private TGAP photo or confirmed answer is used for training.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageChops, ImageDraw
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision.datasets import MNIST


TOOLS_ROOT = Path(r"D:\SearchBefore\tools").resolve()
VOCAB_SIZE = 12  # CTC blank + digits 0-9 + slash


def tools_output(path: Path) -> Path:
    resolved = path.resolve()
    if resolved != TOOLS_ROOT and TOOLS_ROOT not in resolved.parents:
        raise ValueError(f"Output must stay under {TOOLS_ROOT}")
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def encode_date(value: str) -> list[int]:
    return [11 if char == "/" else int(char) + 1 for char in value]


def decode_ids(ids: list[int]) -> str:
    output: list[str] = []
    previous = -1
    for token in ids:
        if token != 0 and token != previous:
            output.append("/" if token == 11 else str(token - 1))
        previous = token
    return "".join(output)


class SyntheticDates(Dataset):
    def __init__(self, mnist: MNIST, size: int, seed: int) -> None:
        self.mnist = mnist
        self.size = size
        self.seed = seed
        self.by_digit: list[list[int]] = [[] for _ in range(10)]
        for index, target in enumerate(mnist.targets.tolist()):
            self.by_digit[int(target)].append(index)
        self.samples = [self._render(index) for index in range(size)]

    def __len__(self) -> int:
        return self.size

    def _glyph(self, digit: int, rng: random.Random) -> Image.Image:
        source, _target = self.mnist[rng.choice(self.by_digit[digit])]
        ink = Image.fromarray(255 - np.asarray(source, dtype=np.uint8), mode="L")
        height = rng.randint(26, 36)
        width = max(16, round(ink.width * height / ink.height))
        return ink.resize((width, height), Image.Resampling.BICUBIC)

    def _render(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        rng = random.Random(self.seed + index)
        month = rng.randint(1, 12)
        day = rng.randint(1, 31)
        label = f"{month}/{day}"

        canvas = Image.new("L", (224, 64), color=255)
        draw = ImageDraw.Draw(canvas)
        for _ in range(rng.randint(0, 2)):
            y = rng.randint(6, 58)
            drift = rng.randint(-5, 5)
            shade = rng.randint(70, 180)
            draw.line((0, y, 223, y + drift), fill=shade, width=rng.randint(1, 3))

        x = rng.randint(8, 22)
        baseline = rng.randint(48, 57)
        for char in label:
            if char == "/":
                slash_width = rng.randint(10, 17)
                slash_height = rng.randint(34, 52)
                draw.line(
                    (x, baseline, x + slash_width, baseline - slash_height),
                    fill=rng.randint(0, 35),
                    width=rng.randint(2, 4),
                )
                x += slash_width + rng.randint(4, 9)
                continue
            glyph = self._glyph(int(char), rng)
            y = max(1, baseline - glyph.height + rng.randint(-3, 3))
            region = canvas.crop((x, y, x + glyph.width, y + glyph.height))
            canvas.paste(ImageChops.darker(region, glyph), (x, y))
            x += glyph.width + rng.randint(1, 7)

        canvas = canvas.rotate(
            rng.uniform(-5.5, 5.5),
            resample=Image.Resampling.BICUBIC,
            expand=False,
            fillcolor=255,
        )
        pixels = np.asarray(canvas, dtype=np.float32)
        noise = np.random.default_rng(self.seed + index).normal(0, rng.uniform(0, 9), pixels.shape)
        pixels = np.clip(pixels + noise, 0, 255)
        tensor = torch.from_numpy((255.0 - pixels) / 255.0).unsqueeze(0).float()
        return tensor, torch.tensor(encode_date(label), dtype=torch.long)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self.samples[index]


class DateCrnn(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),
            nn.Conv2d(16, 32, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),
            nn.Conv2d(32, 64, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d((2, 1)),
            nn.Conv2d(64, 64, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d((2, 1)),
            nn.MaxPool2d((1, 2)),
        )
        self.sequence = nn.LSTM(64, 48, num_layers=1, bidirectional=True)
        self.classifier = nn.Linear(96, VOCAB_SIZE)
        with torch.no_grad():
            self.classifier.bias.zero_()
            self.classifier.bias[0] = -2.0

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        features = self.features(images).mean(dim=2)
        sequence = features.permute(2, 0, 1)
        sequence, _state = self.sequence(sequence)
        return self.classifier(sequence).log_softmax(dim=2)


def collate(batch: list[tuple[torch.Tensor, torch.Tensor]]) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    images, labels = zip(*batch)
    lengths = torch.tensor([label.numel() for label in labels], dtype=torch.long)
    return torch.stack(images), torch.cat(labels), lengths


def evaluate(model: DateCrnn, loader: DataLoader) -> dict[str, object]:
    model.eval()
    exact = 0
    count = 0
    non_empty = 0
    examples: list[dict[str, str]] = []
    with torch.no_grad():
        for images, targets, target_lengths in loader:
            logits = model(images)
            predictions = logits.argmax(dim=2).transpose(0, 1).tolist()
            offset = 0
            for predicted, length in zip(predictions, target_lengths.tolist()):
                expected_ids = targets[offset:offset + length].tolist()
                offset += length
                expected = "".join("/" if token == 11 else str(token - 1) for token in expected_ids)
                actual = decode_ids(predicted)
                exact += int(actual == expected)
                non_empty += int(bool(actual))
                if len(examples) < 5:
                    examples.append({"expected": expected, "actual": actual})
                count += 1
    return {
        "sampleCount": count,
        "exactCount": exact,
        "exactRate": exact / count if count else 0.0,
        "nonEmptyCount": non_empty,
        "examples": examples,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--train-samples", type=int, default=12000)
    parser.add_argument("--validation-samples", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=20260828)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    output = tools_output(args.output)
    data_root = args.data.resolve()
    data_root.mkdir(parents=True, exist_ok=True)
    mnist = MNIST(root=data_root, train=True, download=True)
    train_dataset = SyntheticDates(mnist, args.train_samples, args.seed)
    validation_dataset = SyntheticDates(mnist, args.validation_samples, args.seed + 1_000_000)
    train_loader = DataLoader(train_dataset, batch_size=128, shuffle=True, num_workers=0, collate_fn=collate)
    validation_loader = DataLoader(validation_dataset, batch_size=128, shuffle=False, num_workers=0, collate_fn=collate)

    model = DateCrnn()
    optimizer = torch.optim.AdamW(model.parameters(), lr=8e-4, weight_decay=1e-4)
    criterion = nn.CTCLoss(blank=0, zero_infinity=True)
    history: list[dict[str, object]] = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        batch_count = 0
        for images, targets, target_lengths in train_loader:
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            input_lengths = torch.full(
                (images.size(0),), logits.size(0), dtype=torch.long
            )
            loss = criterion(logits, targets, input_lengths, target_lengths)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()
            total_loss += float(loss.item())
            batch_count += 1
        metrics = evaluate(model, validation_loader)
        metrics.update({"epoch": epoch, "trainLoss": total_loss / max(1, batch_count)})
        history.append(metrics)
        print(json.dumps(metrics))

    checkpoint = {
        "schemaVersion": 1,
        "model": "DateCrnn",
        "stateDict": model.state_dict(),
        "canvas": [224, 64],
        "vocab": {"blank": 0, "digits": "1-10", "slash": 11},
        "training": {
            "source": "MNIST digits plus synthetic slash/table lines/rotation/noise",
            "usesPrivateGroundTruth": False,
            "seed": args.seed,
            "epochs": args.epochs,
            "trainSamples": args.train_samples,
        },
    }
    torch.save(checkpoint, output / "date-crnn.pt")
    (output / "metrics.json").write_text(
        json.dumps({"history": history, "final": history[-1]}, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
