r"""Run the private date component benchmark across several ink thresholds.

This wrapper does not use ground truth. A stable candidate is exposed only when
every threshold completes and produces the same dual-model month/day result.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


PRIVATE_ROOT = Path(r"D:\SearchBefore\private").resolve()
TOOLS_ROOT = Path(r"D:\SearchBefore\tools").resolve()
SCRIPT_ROOT = Path(__file__).resolve().parent


def restricted(path: Path, root: Path, *, create: bool = False) -> Path:
    resolved = path.resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"Path must stay under {root}")
    if create:
        resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path, action="append")
    parser.add_argument("--thresholds", default="100,115,125,140,155")
    args = parser.parse_args()

    input_path = restricted(args.input, PRIVATE_ROOT)
    output_dir = restricted(args.output_dir, PRIVATE_ROOT, create=True)
    model_paths = [restricted(path, TOOLS_ROOT) for path in args.model]
    thresholds = [int(value.strip()) for value in args.thresholds.split(",") if value.strip()]
    if not thresholds or any(value < 1 or value > 254 for value in thresholds):
        raise ValueError("Thresholds must be integers from 1 to 254")

    runs: list[dict[str, object]] = []
    for threshold in thresholds:
        run_dir = output_dir / f"threshold-{threshold}"
        run_dir.mkdir(parents=True, exist_ok=True)
        components = run_dir / "components.json"
        prediction = run_dir / "prediction.json"
        inspect_command = [
            sys.executable,
            str(SCRIPT_ROOT / "inspect-private-date-components.py"),
            "--input", str(input_path),
            "--output-image", str(run_dir / "annotated.png"),
            "--output-json", str(components),
            "--threshold", str(threshold),
        ]
        recognize_command = [
            sys.executable,
            str(SCRIPT_ROOT / "run-component-date-benchmark.py"),
            "--components", str(components),
        ]
        for model_path in model_paths:
            recognize_command.extend(["--model", str(model_path)])
        recognize_command.extend(["--output", str(prediction)])
        try:
            subprocess.run(inspect_command, check=True, capture_output=True, text=True)
            subprocess.run(recognize_command, check=True, capture_output=True, text=True)
            result = json.loads(prediction.read_text(encoding="utf-8"))
            runs.append(
                {
                    "threshold": threshold,
                    "candidate": result.get("candidate", ""),
                    "ensembleAgrees": result.get("ensembleAgrees", False),
                    "calendarRangeValid": result.get("calendarRangeValid", False),
                    "status": "completed",
                }
            )
        except subprocess.CalledProcessError as error:
            runs.append(
                {
                    "threshold": threshold,
                    "candidate": "",
                    "status": "rejected",
                    "reason": (error.stderr or error.stdout or "benchmark failed").strip()[-500:],
                }
            )

    candidates = {str(run["candidate"]) for run in runs if run.get("candidate")}
    every_run_valid = all(
        run.get("status") == "completed"
        and run.get("ensembleAgrees") is True
        and run.get("calendarRangeValid") is True
        and bool(run.get("candidate"))
        for run in runs
    )
    stable_candidate = next(iter(candidates)) if every_run_valid and len(candidates) == 1 else ""
    summary = {
        "schemaVersion": 1,
        "stableCandidate": stable_candidate,
        "allThresholdsAgree": bool(stable_candidate),
        "thresholds": thresholds,
        "runs": runs,
        "usesGroundTruth": False,
        "requiresHumanReview": True,
        "autoCommitAllowed": False,
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"stableCandidate": stable_candidate, "runCount": len(runs)}))


if __name__ == "__main__":
    main()
