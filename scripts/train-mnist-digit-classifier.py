r"""Train a local single-digit classifier for segmented handwritten dates.

The model is trained only from MNIST and never sees the private TGAP photo or
its confirmed answer. It is a research aid: downstream OCR must keep human
review enabled and must never auto-commit a prediction.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Subset
from torchvision import transforms
from torchvision.datasets import MNIST


TOOLS_ROOT = Path(r"D:\SearchBefore\tools").resolve()
MEAN = 0.1307
STD = 0.3081


def tools_path(path: Path, *, create: bool = False) -> Path:
    resolved = path.resolve()
    if resolved != TOOLS_ROOT and TOOLS_ROOT not in resolved.parents:
        raise ValueError(f"Path must stay under {TOOLS_ROOT}")
    if create:
        resolved.mkdir(parents=True, exist_ok=True)
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


def evaluate(model: DigitCnn, loader: DataLoader) -> dict[str, float | int]:
    model.eval()
    correct = 0
    count = 0
    with torch.no_grad():
        for images, labels in loader:
            predictions = model(images).argmax(dim=1)
            correct += int((predictions == labels).sum().item())
            count += int(labels.numel())
    return {
        "sampleCount": count,
        "correctCount": correct,
        "accuracy": correct / count if count else 0.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--train-samples", type=int, default=60000)
    parser.add_argument("--augment", action="store_true")
    parser.add_argument("--seed", type=int, default=20260828)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.set_num_threads(max(1, min(8, torch.get_num_threads())))
    data_root = tools_path(args.data, create=True)
    output = tools_path(args.output, create=True)
    base_transforms: list[object] = []
    if args.augment:
        base_transforms.append(
            transforms.RandomAffine(
                degrees=12,
                translate=(0.1, 0.1),
                scale=(0.82, 1.15),
                shear=5,
                fill=0,
            )
        )
    base_transforms.extend([transforms.ToTensor(), transforms.Normalize((MEAN,), (STD,))])
    train_transform = transforms.Compose(base_transforms)
    test_transform = transforms.Compose(
        [transforms.ToTensor(), transforms.Normalize((MEAN,), (STD,))]
    )
    train_full = MNIST(root=data_root, train=True, download=False, transform=train_transform)
    test_set = MNIST(root=data_root, train=False, download=False, transform=test_transform)
    sample_count = min(args.train_samples, len(train_full))
    generator = torch.Generator().manual_seed(args.seed)
    indices = torch.randperm(len(train_full), generator=generator)[:sample_count].tolist()
    train_set = Subset(train_full, indices)
    train_loader = DataLoader(train_set, batch_size=256, shuffle=True, num_workers=0)
    test_loader = DataLoader(test_set, batch_size=512, shuffle=False, num_workers=0)

    model = DigitCnn()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    criterion = nn.CrossEntropyLoss()
    history: list[dict[str, float | int]] = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        batches = 0
        for images, labels in train_loader:
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(images), labels)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.item())
            batches += 1
        metrics = evaluate(model, test_loader)
        metrics.update({"epoch": epoch, "trainLoss": total_loss / max(1, batches)})
        history.append(metrics)
        print(json.dumps(metrics))

    checkpoint = {
        "schemaVersion": 1,
        "model": "DigitCnn",
        "stateDict": model.state_dict(),
        "normalization": {"mean": MEAN, "std": STD},
        "training": {
            "source": "MNIST",
            "usesPrivateGroundTruth": False,
            "seed": args.seed,
            "epochs": args.epochs,
            "trainSamples": sample_count,
            "augmentation": "affine" if args.augment else "none",
        },
    }
    torch.save(checkpoint, output / "digit-cnn.pt")
    (output / "metrics.json").write_text(
        json.dumps({"history": history, "final": history[-1]}, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
