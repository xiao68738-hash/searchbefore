"""Research fallback: spatial line components, applied only to empty v11 pages."""
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

spec=importlib.util.spec_from_file_location('base_grid',Path(__file__).with_name('run-gridline-cell-benchmark.py'))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def lines(binary, horizontal):
    mask=binary if horizontal else binary.T
    h,w=mask.shape
    window=max(24,w//35)
    if w<window: return []
    dense=base.rolling_density(mask,window,axis=1)>=0.60
    segments=[]
    for y in range(h):
        for start,end in base.contiguous_ranges(dense[y]):
            if end-start>=max(14,w*.018):
                segments.append({'c':y,'s':start+window/2,'e':end+window/2})
    return base.merge_segments(segments,'c','s','e')


def components(horizontal,vertical,tolerance=12):
    # Independent tables must not acquire edges from an unrelated table.
    n=len(horizontal)
    parent=list(range(n+len(vertical)))
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]];i=parent[i]
        return i
    for hi,h in enumerate(horizontal):
        for vi,v in enumerate(vertical):
            if h['start']-tolerance<=v['coordinate']<=h['end']+tolerance and v['start']-tolerance<=h['coordinate']<=v['end']+tolerance:
                parent[find(hi)]=find(n+vi)
    groups={}
    for i in range(len(parent)):
        group=groups.setdefault(find(i),[[],[]])
        group[0 if i<n else 1].append(horizontal[i] if i<n else vertical[i-n])
    return list(groups.values())


def region_cells(horizontal,vertical):
    def bands(items):
        return base.merge_axis_bands([{'c':round(l['coordinate']),'s':l['start'],'e':l['end']} for l in items],'c','s','e')
    hs=bands(horizontal);vs=bands(vertical)
    if len(hs)<4 or len(vs)<3 or len(hs)>80 or len(vs)>30:return []
    width=vs[-1]['coordinate']-vs[0]['coordinate'];height=hs[-1]['coordinate']-hs[0]['coordinate']
    if width<50 or height<45:return []
    cells=[]
    for row,(top,bottom) in enumerate(zip(hs,hs[1:])):
        y1,y2=top['coordinate'],bottom['coordinate']
        if not 6<=y2-y1<=height*.5:continue
        for col,(left,right) in enumerate(zip(vs,vs[1:])):
            x1,x2=left['coordinate'],right['coordinate']
            if not 6<=x2-x1<=width*.9:continue
            if not all([base.covers(top,x1,x2,12),base.covers(bottom,x1,x2,12),base.covers(left,y1,y2,12),base.covers(right,y1,y2,12)]):continue
            cells.append({'rowIndex':row,'columnIndex':col,'rowSpan':1,'columnSpan':1,'polygon':[[x1,y1],[x2,y1],[x2,y2],[x1,y2]],'text':'','confidence':None})
    occupancy=len(cells)/((len(hs)-1)*(len(vs)-1))
    return cells if len(cells)>=6 and occupancy>=.5 else []


def analyze(image):
    scale=min(1.,1200/max(image.size))
    gray=image.convert('L').resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.LANCZOS)
    pixels=np.asarray(gray).astype(np.int16)
    contrast=np.asarray(gray.filter(ImageFilter.BoxBlur(12))).astype(np.int16)-pixels
    binary=(contrast>=8)&(pixels<220)
    horizontal=[l for l in lines(binary,True) if l['end']-l['start']>=gray.width*.12]
    vertical=[l for l in lines(binary,False) if l['end']-l['start']>=gray.height*.12]
    tables=[]
    for hs,vs in components(horizontal,vertical):
        cells=region_cells(hs,vs)
        if not cells:continue
        for c in cells:c['polygon']=[[round(x/scale,3),round(y/scale,3)] for x,y in c['polygon']]
        tables.append({'tableIndex':len(tables),'cells':cells})
    return tables


def main():
    if len(sys.argv)!=4:raise SystemExit('GT_ROOT BASE_PRED NEW_PRIVATE_OUTPUT')
    gtroot,predroot,out=map(lambda s:Path(s).resolve(),sys.argv[1:])
    if Path('D:/SearchBefore/private').resolve() not in out.parents or out.exists():raise SystemExit('New private output directory required')
    manifest=json.loads((gtroot/'manifest.json').read_text(encoding='utf-8'))
    out.mkdir(parents=True)
    recovered=0
    for i,e in enumerate(manifest['documents']):
        p=json.loads((predroot/(e['id']+'.json')).read_text(encoding='utf-8'))
        # This is a cached-prediction recovery run, not an end-to-end timing run.
        p['processingMs']=None
        if not any(t.get('cells') for t in p.get('tables',[])):
            meta=json.loads((gtroot/e['groundTruth']).read_text(encoding='utf-8'))['image']
            with Image.open(meta['privatePath']) as image:tables=analyze(image)
            if tables:
                p['tables']=tables;p['model']='local-spatial-components-research';p['processingMs']=None;recovered+=1
        (out/(e['id']+'.json')).write_text(json.dumps(p)+'\n',encoding='utf-8')
        print(json.dumps({'completed':i+1,'total':len(manifest['documents']),'recoveredPages':recovered}),flush=True)


if __name__=='__main__':main()
