import copy
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('anchored', Path(__file__).resolve().parents[1]/'scripts/ocr-anchored-region-recovery.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

def grid():
    return {'tableIndex': 0, 'cells': [{'rowIndex':r, 'columnIndex':c, 'rowSpan':1, 'columnSpan':1, 'polygon':[[20+c*30,20+r*20],[50+c*30,20+r*20],[50+c*30,40+r*20],[20+c*30,40+r*20]], 'text':'original'} for r in range(4) for c in range(3)]}

class Tests(unittest.TestCase):
    def test_complete_missing_cells(self):
        full=grid(); partial=copy.deepcopy(full);partial['cells']=partial['cells'][:9]
        before=copy.deepcopy(partial)
        result, added=mod.merge_anchored([partial],[full],500,500)
        self.assertEqual(added,3);self.assertEqual(result[0]['cells'][:9],before['cells']);self.assertEqual(partial,before)
        self.assertTrue(all(c['text']=='' for c in result[0]['cells'][9:]))
    def test_duplicate(self):
        self.assertEqual(mod.merge_anchored([grid()],[grid()],500,500)[1],0)
    def test_conflicting_indices(self):
        a=grid();a['cells']=a['cells'][:9];a['cells'][0]['rowIndex']=7
        self.assertEqual(mod.merge_anchored([a],[grid()],500,500)[1],0)
    def test_insufficient_anchors(self):
        a=grid();a['cells']=a['cells'][:3]
        self.assertEqual(mod.merge_anchored([a],[grid()],500,500)[1],0)
    def test_span_rejected(self):
        a=grid();a['cells']=a['cells'][:9];a['cells'][0]['columnSpan']=2
        self.assertEqual(mod.merge_anchored([a],[grid()],500,500)[1],0)
    def test_unrelated_tables(self):
        a=grid();b=grid();a['cells']=a['cells'][:3];b['cells']=b['cells'][3:9]
        self.assertEqual(mod.merge_anchored([a,b],[grid()],500,500)[1],0)
    def test_empty(self):
        self.assertEqual(mod.merge_anchored([],[grid()],500,500),([],0))
    def test_index_offset(self):
        a=grid();a['cells']=a['cells'][:9]
        for c in a['cells']:c['rowIndex']+=5;c['columnIndex']+=2
        result,added=mod.merge_anchored([a],[grid()],500,500)
        self.assertEqual(added,3);self.assertEqual(result[0]['cells'][-1]['rowIndex'],8)

if __name__=='__main__':unittest.main()
