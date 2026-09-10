import importlib.util
import pathlib
import unittest
import numpy as np

spec=importlib.util.spec_from_file_location('edge',pathlib.Path(__file__).resolve().parents[1]/'scripts/ocr-cell-edge-support.py')
edge=importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)


class EdgeTests(unittest.TestCase):
    def test_blank(self):
        self.assertEqual(edge.cell_support(np.zeros((100,100)),[[10,10],[90,10],[90,90],[10,90]],1),[0]*4)

    def test_rectangle(self):
        a=np.zeros((100,100));a[10,10:91]=30;a[90,10:91]=30;a[10:91,10]=30;a[10:91,90]=30
        self.assertEqual(edge.cell_support(a,[[10,10],[90,10],[90,90],[10,90]],1),[1]*4)

    def test_outside_not_clamped_to_border(self):
        self.assertEqual(edge.cell_support(np.ones((100,100))*30,[[-100,-100],[-90,-100],[-90,-90],[-100,-90]],1),[0]*4)

    def test_degenerate_and_invalid(self):
        for polygon in ([[1,1]]*4,[[float('nan'),0]]*4,[]):
            self.assertEqual(edge.cell_support(np.ones((100,100))*30,polygon,1),[0]*4)

    def test_rotated_edges(self):
        a=np.zeros((101,101))
        for x in range(10,91):
            a[10+abs(x-50),x]=30;a[90-abs(x-50),x]=30
        self.assertEqual(edge.cell_support(a,[[50,10],[90,50],[50,90],[10,50]],1),[1]*4)


if __name__=='__main__': unittest.main()
