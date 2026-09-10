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


def select_stable_candidate(runs: list[dict[str, object]], minimum_consensus: int) -> tuple[str, int]:
    """Select a valid candidate only after independent threshold agreement."""
    valid_runs = [
        run for run in runs
        if run.get("status") == "completed"
        and run.get("ensembleAgrees") is True
        and run.get("calendarRangeValid") is True
        and bool(run.get("candidate"))
    ]
    counts: dict[str, int] = {}
    for run in valid_runs:
        candidate = str(run["candidate"])
        counts[candidate] = counts.get(candidate, 0) + 1
    if not counts:
        return "", 0
    candidate, count = max(counts.items(), key=lambda item: item[1])
    return (candidate, count) if count >= minimum_consensus else ("", count)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path, action="append")
    parser.add_argument("--thresholds", default="100,115,125,140,155")
    parser.add_argument(
        "--min-consensus",
        type=int,
        default=0,
        help="minimum agreeing thresholds; 0 means strict unanimity",
    )
    args = parser.parse_args()

    input_path = restricted(args.input, PRIVATE_ROOT)
    output_dir = restricted(args.output_dir, PRIVATE_ROOT, create=True)
    model_paths = [restricted(path, TOOLS_ROOT) for path in args.model]
    thresholds = [int(value.strip()) for value in args.thresholds.split(",") if value.strip()]
    if not thresholds or any(value < 1 or value > 254 for value in thresholds):
        raise ValueError("Thresholds must be integers from 1 to 254")
    minimum_consensus = args.min_consensus or len(thresholds)
    if minimum_consensus < 2 or minimum_consensus > len(thresholds):
        raise ValueError("min-consensus must be between 2 and the threshold count")

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

    stable_candidate, stable_count = select_stable_candidate(runs, minimum_consensus)
    summary = {
        "schemaVersion": 1,
        "stableCandidate": stable_candidate,
        "allThresholdsAgree": bool(stable_candidate) and stable_count == len(thresholds),
        "consensusCount": stable_count,
        "minimumConsensus": minimum_consensus,
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
