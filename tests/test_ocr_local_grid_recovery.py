import importlib.util
from pathlib import Path
import unittest
from PIL import Image, ImageDraw
spec=importlib.util.spec_from_file_location('local',Path(__file__).resolve().parents[1]/'scripts/ocr-local-grid-recovery.py')
local=importlib.util.module_from_spec(spec);spec.loader.exec_module(local)

def grid(offset=0):
    return ([{'coordinate':y,'start':offset,'end':offset+200} for y in [0,30,60,90]],
            [{'coordinate':offset+x,'start':0,'end':90} for x in [0,80,200]])

class Tests(unittest.TestCase):
    def test_two_wide_columns(self):
        self.assertEqual(len(local.region_cells(*grid())),6)
    def test_separate_tables(self):
        a,b=grid(),grid(400)
        groups=local.components(a[0]+b[0],a[1]+b[1])
        self.assertEqual(len(groups),2)
        self.assertEqual(sum(len(local.region_cells(*g)) for g in groups),12)
    def test_isolated_text(self):
        self.assertEqual(local.region_cells(grid()[0],[]),[])
    def test_missing_vertical_support(self):
        h,v=grid()
        for line in v:line['end']=5
        self.assertEqual(local.region_cells(h,v),[])
    def test_image_two_tables(self):
        im=Image.new('L',(1000,1000),255);draw=ImageDraw.Draw(im)
        for offset in [50,550]:
            for x in [offset,offset+100,offset+250]:draw.line((x,150,x,450),fill=0,width=2)
            for y in [150,250,350,450]:draw.line((offset,y,offset+250,y),fill=0,width=2)
        tables=local.analyze(im)
        self.assertEqual(len(tables),2)
        self.assertEqual(sum(len(t['cells']) for t in tables),12)
    def test_blank_image(self):
        self.assertEqual(local.analyze(Image.new('L',(1000,1000),255)),[])

if __name__=='__main__':unittest.main()
