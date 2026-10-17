import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).resolve().parents[1] / 'scripts/ocr-disjoint-region-recovery.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def table(x=20, index=0):
    return {'tableIndex': index, 'cells': [
        {'rowIndex': r, 'columnIndex': c, 'polygon': [[x+c*30, 20+r*20], [x+(c+1)*30, 20+r*20], [x+(c+1)*30, 40+r*20], [x+c*30, 40+r*20]], 'text': 'existing'}
        for r in range(3) for c in range(2)]}


class Tests(unittest.TestCase):
    def test_disjoint(self):
        a = [table(index=5)]; saved = copy.deepcopy(a)
        result, count = mod.add_disjoint(a, [table(200)], 500, 500)
        self.assertEqual(count, 6); self.assertEqual(result[0], a[0]); self.assertEqual(a, saved)
        self.assertEqual(result[1]['tableIndex'], 6)
        self.assertTrue(all(c['text'] == '' and c['confidence'] is None for c in result[1]['cells']))

    def test_duplicate(self):
        self.assertEqual(mod.add_disjoint([table()], [table()], 500, 500)[1], 0)

    def test_partial_overlap_rejects_whole_table(self):
        self.assertEqual(mod.add_disjoint([table()], [table(60)], 500, 500)[1], 0)

    def test_nearby_margin(self):
        self.assertEqual(mod.add_disjoint([table()], [table(82)], 500, 500)[1], 0)

    def test_deduplicate_candidates(self):
        self.assertEqual(mod.add_disjoint([table()], [table(200), table(200)], 500, 500)[1], 6)

    def test_empty_unchanged(self):
        self.assertEqual(mod.add_disjoint([], [table()], 500, 500), ([], 0))

    def test_too_few(self):
        t = table(200); t['cells'] = t['cells'][:5]
        self.assertEqual(mod.add_disjoint([table()], [t], 500, 500)[1], 0)

    def test_outside_image(self):
        self.assertEqual(mod.add_disjoint([table()], [table(480)], 500, 500)[1], 0)

    def test_invalid_geometry(self):
        t = table(); t['cells'][0]['polygon'][0][0] = float('nan')
        with self.assertRaises(ValueError): mod.add_disjoint([t], [table(200)], 500, 500)

    def test_candidate_not_mutated(self):
        b = [table(200)]; saved = copy.deepcopy(b)
        mod.add_disjoint([table()], b, 500, 500)
        self.assertEqual(b, saved)


if __name__ == '__main__':
    unittest.main()
