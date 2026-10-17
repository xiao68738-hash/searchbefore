"""Offline research: add supported, spatially disjoint tables to nonempty pages.

No text inference or ground-truth geometry is used. Existing tables are retained.
This is a cached prediction experiment, not end-to-end latency measurement.
"""
import copy
import importlib.util
import json
import math
import sys
from pathlib import Path
from PIL import Image

spec = importlib.util.spec_from_file_location('local_grid', Path(__file__).with_name('ocr-local-grid-recovery.py'))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)
MODEL = 'disjoint-region-recovery-research'


def bounds(cell):
    points = cell.get('polygon', [])
    if len(points) < 3 or any(len(p) != 2 or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in p) for p in points):
        raise ValueError('Invalid cell polygon')
    xs, ys = zip(*points)
    box = min(xs), min(ys), max(xs), max(ys)
    if box[0] >= box[2] or box[1] >= box[3]:
        raise ValueError('Degenerate cell polygon')
    return box


def separated(a, b, margin):
    return a[2] + margin < b[0] or b[2] + margin < a[0] or a[3] + margin < b[1] or b[3] + margin < a[1]


def add_disjoint(existing, candidates, width, height):
    """Accept whole regions only; no slicing or invented row/column alignment."""
    result = copy.deepcopy(existing)
    occupied = [bounds(c) for t in existing for c in t.get('cells', [])]
    if not occupied:
        return result, 0  # Leave empty-page recovery to the frozen baseline.
    margin = max(2, min(width, height) * .003)
    next_index = max((t.get('tableIndex', -1) for t in existing if isinstance(t.get('tableIndex'), int)), default=-1) + 1
    added = 0
    for candidate in candidates:
        cells = candidate.get('cells', [])
        if not 6 <= len(cells) <= 1000:
            continue
        boxes = [bounds(c) for c in cells]
        region = min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)
        if region[0] < 0 or region[1] < 0 or region[2] > width or region[3] > height:
            continue
        if not all(separated(region, old, margin) for old in occupied):
            continue
        # Existing text is untouched; this structure-only candidate must have no guessed text.
        new_table = copy.deepcopy(candidate)
        new_table['tableIndex'] = next_index
        for cell in new_table['cells']:
            cell['text'] = ''
            cell['confidence'] = None
        result.append(new_table)
        next_index += 1
        added += len(cells)
        occupied.extend(boxes)
    return result, added


def main():
    if len(sys.argv) != 4:
        raise SystemExit('GT_ROOT BASE_PRED NEW_PRIVATE_OUTPUT')
    gtroot, predroot, out = (Path(p).resolve() for p in sys.argv[1:])
    private = Path('D:/SearchBefore/private').resolve()
    if private not in out.parents or out.exists():
        raise SystemExit('A new private output directory is required')
    manifest = json.loads((gtroot / 'manifest.json').read_text(encoding='utf-8'))
    out.mkdir(parents=True)
    added_pages = added_cells = 0
    for i, entry in enumerate(manifest['documents']):
        doc_id = entry['id']
        if not isinstance(doc_id, str) or Path(doc_id).name != doc_id or '/' in doc_id or '\\' in doc_id:
            raise ValueError('Unsafe document id')
        prediction = json.loads((predroot / (doc_id + '.json')).read_text(encoding='utf-8'))
        if prediction.get('documentId') != doc_id:
            raise ValueError('Prediction identity mismatch')
        existing = prediction.get('tables', [])
        prediction['processingMs'] = None
        if any(t.get('cells') for t in existing):
            # Read only the image metadata, never annotations or correct cell/text values.
            meta = json.loads((gtroot / entry['groundTruth']).read_text(encoding='utf-8'))['image']
            image_path = Path(meta['privatePath']).resolve()
            if private not in image_path.parents:
                raise ValueError('Research image must remain in private storage')
            with Image.open(image_path) as image:
                tables, added = add_disjoint(existing, local.analyze(image), *image.size)
            if added:
                prediction['tables'] = tables
                prediction['model'] = MODEL
                added_pages += 1
                added_cells += added
        (out / (doc_id + '.json')).write_text(json.dumps(prediction) + '\n', encoding='utf-8')
        print(json.dumps({'completed': i + 1, 'total': len(manifest['documents']), 'addedPages': added_pages, 'addedCells': added_cells}), flush=True)


if __name__ == '__main__':
    main()
