"""Research-only image evidence; never reads GT cell geometry or transcription."""
import argparse
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter


def cell_support(contrast, polygon, scale):
    if len(polygon) != 4 or not all(len(p) == 2 and all(math.isfinite(v) for v in p) for p in polygon):
        return [0.0] * 4
    h, w = contrast.shape
    result = []
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        a, b = np.array(a) * scale, np.array(b) * scale
        length = float(np.linalg.norm(b-a))
        if length < 4:
            result.append(0.0)
            continue
        normal = np.array([-(b-a)[1], (b-a)[0]]) / length
        points = a + np.linspace(0.05, 0.95, max(4, round(length)))[:, None] * (b-a)
        responses = []
        for offset in range(-2, 3):
            xy = np.rint(points + offset * normal).astype(int)
            valid = (xy[:, 0] >= 0) & (xy[:, 0] < w) & (xy[:, 1] >= 0) & (xy[:, 1] < h)
            values = np.zeros(len(xy), dtype=np.int16)
            values[valid] = contrast[xy[valid, 1], xy[valid, 0]]
            responses.append(values)
        result.append(round(float(np.mean(np.max(responses, axis=0) >= 12)), 6))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('ground_truth_root', type=Path)
    parser.add_argument('predictions', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    private = Path('D:/SearchBefore/private').resolve()
    if private not in args.output.resolve().parents or args.output.exists():
        raise SystemExit('Use a NEW output file under the private directory')
    manifest = json.loads((args.ground_truth_root/'manifest.json').read_text(encoding='utf-8'))
    docs = []
    for entry in manifest['documents']:
        prediction = json.loads((args.predictions/(entry['id']+'.json')).read_text(encoding='utf-8'))
        metadata = json.loads((args.ground_truth_root/entry['groundTruth']).read_text(encoding='utf-8'))['image']
        with Image.open(metadata['privatePath']) as source:
            image = source.convert('L')
        scale = min(1.0, 1800 / max(image.size))
        image = image.resize((round(image.width*scale),round(image.height*scale)),Image.Resampling.LANCZOS)
        contrast = np.asarray(image.filter(ImageFilter.BoxBlur(8))).astype(np.int16) - np.asarray(image).astype(np.int16)
        cells = [c for t in prediction.get('tables',[]) for c in t.get('cells',[])]
        docs.append({'id':entry['id'],'edges':[cell_support(contrast,c['polygon'],scale) for c in cells]})
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'version':1,'method':'four polygon edges, +/-2px, local contrast >=12, 1800px maximum','documents':docs},indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'documents':len(docs),'cells':sum(len(d['edges']) for d in docs)}))


if __name__ == '__main__':
    main()
