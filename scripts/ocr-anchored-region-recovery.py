"""Research-only missing-cell completion with multiple consistent geometry anchors."""
import copy
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('runner', Path(__file__).with_name('ocr-disjoint-region-recovery.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def overlap(a, b):
    return max(0, min(a[2], b[2])-max(a[0], b[0])) * max(0, min(a[3], b[3])-max(a[1], b[1]))


def area(b):
    return (b[2]-b[0]) * (b[3]-b[1])


def merge_anchored(existing, candidates, width, height):
    result = copy.deepcopy(existing)
    added = 0
    for candidate in candidates:
        cells = candidate.get('cells', [])
        if not 6 <= len(cells) <= 1000:
            continue
        old = [(ti, c, runner.bounds(c)) for ti, table in enumerate(result) for c in table.get('cells', [])]
        anchors, new = [], []
        for c in cells:
            box = runner.bounds(c)
            if box[0] < 0 or box[1] < 0 or box[2] > width or box[3] > height:
                continue
            matches = [(overlap(box, b)/(area(box)+area(b)-overlap(box, b)), ti, cell) for ti, cell, b in old]
            best = max(matches, key=lambda x: x[0], default=(0, None, None))
            if best[0] >= .8:
                anchors.append((c, best[1], best[2]))
            elif all(overlap(box, b) / min(area(box), area(b)) <= .05 for _, _, b in old):
                new.append(c)
        if len(anchors) < 4 or not new or len(new) > 2 * len(anchors):
            continue
        # Do not bridge unrelated tables or assume a different row/column topology.
        if len({ti for _, ti, _ in anchors}) != 1:
            continue
        if any(c.get('rowSpan', 1) != 1 or c.get('columnSpan', 1) != 1 for pair in anchors for c in [pair[0], pair[2]]):
            continue
        if any(not isinstance(c.get(k), int) for pair in anchors for c in [pair[0], pair[2]] for k in ['rowIndex', 'columnIndex']):
            continue
        offsets = {(b['rowIndex']-a['rowIndex'], b['columnIndex']-a['columnIndex']) for a, _, b in anchors}
        if len(offsets) != 1 or len({a['rowIndex'] for a, _, _ in anchors}) < 2 or len({a['columnIndex'] for a, _, _ in anchors}) < 2:
            continue
        ti = anchors[0][1]
        dr, dc = next(iter(offsets))
        occupied = {(c['rowIndex']+r, c['columnIndex']+col)
                    for c in result[ti]['cells'] for r in range(c.get('rowSpan', 1)) for col in range(c.get('columnSpan', 1))}
        for cell in new:
            if any(not isinstance(cell.get(k), int) for k in ['rowIndex', 'columnIndex']):
                continue
            r, c = cell['rowIndex']+dr, cell['columnIndex']+dc
            if r < 0 or c < 0 or (r, c) in occupied or cell.get('rowSpan', 1) != 1 or cell.get('columnSpan', 1) != 1:
                continue
            item = copy.deepcopy(cell)
            item.update(rowIndex=r, columnIndex=c, text='', confidence=None)
            result[ti]['cells'].append(item)
            occupied.add((r, c))
            added += 1
    return result, added


if __name__ == '__main__':
    runner.add_disjoint = merge_anchored
    runner.MODEL = 'anchored-region-completion-research'
    runner.main()
