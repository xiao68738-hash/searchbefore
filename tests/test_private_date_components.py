"""Regression tests for the local handwritten-date component preprocessor."""

import importlib.util
from pathlib import Path
import unittest

import numpy as np


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "inspect-private-date-components.py"
SPEC = importlib.util.spec_from_file_location("private_date_components", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class DateComponentTests(unittest.TestCase):
    def test_long_shallow_rule_is_removed_but_short_stroke_is_not(self):
        mask = np.zeros((80, 160), dtype=bool)
        for x in range(18, 145):
            y = round(0.06 * x + 46)
            mask[max(0, y - 1):min(mask.shape[0], y + 2), x] = True
        mask[20:36, 70:73] = True  # a short vertical handwritten stroke

        cleaned, diagnostics = MODULE.remove_ruling_line(mask)

        self.assertTrue(diagnostics["removed"])
        self.assertGreaterEqual(diagnostics["support"], 70)
        self.assertLess(int(cleaned.sum()), int(mask.sum()))
        self.assertGreater(int(cleaned[20:36, 70:73].sum()), 0)

    def test_short_or_steep_stroke_does_not_trigger_rule_removal(self):
        mask = np.zeros((80, 160), dtype=bool)
        mask[20:58, 72:75] = True

        cleaned, diagnostics = MODULE.remove_ruling_line(mask)

        self.assertFalse(diagnostics["removed"])
        self.assertTrue(np.array_equal(cleaned, mask))
