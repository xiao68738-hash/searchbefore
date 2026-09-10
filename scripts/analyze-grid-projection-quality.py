import json
import sys
from pathlib import Path

import numpy as np


if len(sys.argv) != 2:
    raise SystemExit("Usage: python scripts/analyze-grid-projection-quality.py <predictions-root>")

root = Path(sys.argv[1])
for target in sorted(root.glob("*.json")):
    prediction = json.loads(target.read_text(encoding="utf-8"))
    tables = prediction.get("tables", [])
    diagnostics = tables[0].get("diagnostics", {}) if tables else {}
    if diagnostics.get("selectedLane") != "regional-grid-projection":
        continue
    cells = [cell for table in tables for cell in table.get("cells", [])]
    widths = [cell["polygon"][1][0] - cell["polygon"][0][0] for cell in cells]
    heights = [cell["polygon"][2][1] - cell["polygon"][1][1] for cell in cells]
    coefficient = lambda values: float(np.std(values) / np.mean(values)) if values and np.mean(values) else None
    print(json.dumps({
        "documentId": prediction["documentId"],
        "cells": len(cells),
        "widthCv": round(coefficient(widths), 4) if widths else None,
        "heightCv": round(coefficient(heights), 4) if heights else None,
        "regions": diagnostics.get("projectionRegions", []),
    }))
