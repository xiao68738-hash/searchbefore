"""Tests for the conservative threshold-consensus selector."""

import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run-private-date-threshold-ensemble.py"
SPEC = importlib.util.spec_from_file_location("private_date_threshold_ensemble", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ThresholdConsensusTests(unittest.TestCase):
    def test_majority_consensus_can_be_used_without_unanimity(self):
        runs = [
            {"status": "completed", "ensembleAgrees": True, "calendarRangeValid": True, "candidate": "7/14"},
            {"status": "completed", "ensembleAgrees": True, "calendarRangeValid": True, "candidate": "7/14"},
            {"status": "completed", "ensembleAgrees": True, "calendarRangeValid": True, "candidate": "7/14"},
            {"status": "completed", "ensembleAgrees": True, "calendarRangeValid": True, "candidate": "7/14"},
            {"status": "completed", "ensembleAgrees": False, "calendarRangeValid": False, "candidate": ""},
        ]
        self.assertEqual(MODULE.select_stable_candidate(runs, 4), ("7/14", 4))

    def test_invalid_or_tied_runs_do_not_become_candidates(self):
        runs = [
            {"status": "completed", "ensembleAgrees": True, "calendarRangeValid": True, "candidate": "7/14"},
            {"status": "completed", "ensembleAgrees": True, "calendarRangeValid": True, "candidate": "7/15"},
            {"status": "rejected", "ensembleAgrees": True, "calendarRangeValid": True, "candidate": "7/14"},
        ]
        self.assertEqual(MODULE.select_stable_candidate(runs, 2), ("", 1))


if __name__ == "__main__":
    unittest.main()
