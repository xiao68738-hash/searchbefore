import fs from "node:fs";
import path from "node:path";

const [groundTruthArg, predictionsArg, outputArg] = process.argv.slice(2);
if (!groundTruthArg || !predictionsArg) {
  throw new Error("Usage: node scripts/score-ocr-cell-benchmark.mjs <ground-truth-root> <predictions-root> [report.json]");
}

const gtRoot = path.resolve(groundTruthArg);
const predictionsRoot = path.resolve(predictionsArg);
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const manifest = readJson(path.join(gtRoot, "manifest.json"));
const threshold = 0.5;

function area(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return 0;
  return Math.abs(polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
}

function signedArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function ccw(points) {
  const clean = (points || []).map(point => [Number(point[0]), Number(point[1])]);
  return signedArea(clean) < 0 ? clean.reverse() : clean;
}

function lineIntersection(a, b, c, d) {
  const denominator = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(denominator) < 1e-9) return b;
  const cross1 = a[0] * b[1] - a[1] * b[0];
  const cross2 = c[0] * d[1] - c[1] * d[0];
  return [
    (cross1 * (c[0] - d[0]) - (a[0] - b[0]) * cross2) / denominator,
    (cross1 * (c[1] - d[1]) - (a[1] - b[1]) * cross2) / denominator
  ];
}

function intersection(subject, clipPolygon) {
  let output = ccw(subject);
  const clip = ccw(clipPolygon);
  for (let i = 0; i < clip.length; i++) {
    const c = clip[i], d = clip[(i + 1) % clip.length], input = output;
    output = [];
    if (!input.length) break;
    let a = input[input.length - 1];
    const inside = point => (d[0] - c[0]) * (point[1] - c[1]) - (d[1] - c[1]) * (point[0] - c[0]) >= -1e-6;
    for (const b of input) {
      if (inside(b)) {
        if (!inside(a)) output.push(lineIntersection(a, b, c, d));
        output.push(b);
      } else if (inside(a)) output.push(lineIntersection(a, b, c, d));
      a = b;
    }
  }
  return output;
}

function iou(a, b) {
  const intersectionArea = area(intersection(a, b));
  const union = area(a) + area(b) - intersectionArea;
  return union > 0 ? intersectionArea / union : 0;
}

function polygonCenter(polygon) {
  const xs = polygon.map(point => Number(point[0]));
  const ys = polygon.map(point => Number(point[1]));
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function pointInPolygon(point, polygon) {
  let isInside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    if ((yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi) isInside = !isInside;
  }
  return isInside;
}

function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function editDistance(reference, hypothesis) {
  const previous = Array.from({ length: hypothesis.length + 1 }, (_, index) => index);
  for (let row = 1; row <= reference.length; row++) {
    const current = [row];
    for (let column = 1; column <= hypothesis.length; column++) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (reference[row - 1] === hypothesis[column - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[hypothesis.length];
}

const documents = [];
let truePositive = 0, falsePositive = 0, falseNegative = 0;
const matchedIous = [], latencies = [], rowErrors = [], columnErrors = [];
let rowExact = 0, columnExact = 0, detectedDocuments = 0;
let evaluatedDocuments = 0, evaluatedGroundTruthCells = 0;
let textCellCount = 0, textExactCount = 0, referenceCharacters = 0, characterErrors = 0, referenceWords = 0, wordErrors = 0;

for (const entry of manifest.documents) {
  const gt = readJson(path.join(gtRoot, entry.groundTruth));
  const predictionFile = path.join(predictionsRoot, `${entry.id}.json`);
  const prediction = fs.existsSync(predictionFile) ? readJson(predictionFile) : null;
  if (!prediction) {
    documents.push({ id: entry.id, status: "missing-prediction", gtCells: gt.cells.length, predictedCells: null, matchedCells: null, rowError: null, columnError: null, processingMs: null });
    continue;
  }
  evaluatedDocuments++;
  evaluatedGroundTruthCells += gt.cells.length;
  const predictedCells = (prediction?.tables || []).flatMap(table => table.cells || []).filter(cell => Array.isArray(cell.polygon));
  if (predictedCells.length) detectedDocuments++;
  if (Number.isFinite(prediction?.processingMs)) latencies.push(prediction.processingMs);
  const candidates = [];
  for (let gi = 0; gi < gt.cells.length; gi++) {
    for (let pi = 0; pi < predictedCells.length; pi++) {
      const score = iou(gt.cells[gi].polygon, predictedCells[pi].polygon);
      if (score >= threshold) candidates.push({ gi, pi, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedGt = new Set(), usedPred = new Set(), matches = [];
  for (const candidate of candidates) {
    if (usedGt.has(candidate.gi) || usedPred.has(candidate.pi)) continue;
    usedGt.add(candidate.gi); usedPred.add(candidate.pi); matches.push(candidate);
  }
  let documentTextCells = 0, documentCharacterErrors = 0, documentReferenceCharacters = 0;
  for (const textField of gt.textFields || []) {
    const referenceRaw = textField.text;
    const reference = normalizeText(referenceRaw);
    const fieldArea = area(textField.polygon);
    const fieldCenter = polygonCenter(textField.polygon);
    const predictionMatch = predictedCells
      .map((cell, index) => {
        const overlap = area(intersection(textField.polygon, cell.polygon));
        const containsCenter = pointInPolygon(fieldCenter, cell.polygon);
        return { index, score: overlap / Math.max(1, fieldArea), containsCenter };
      })
      .filter(candidate => candidate.containsCenter || candidate.score >= 0.25)
      .sort((a, b) => Number(b.containsCenter) - Number(a.containsCenter) || b.score - a.score)[0];
    const hypothesis = normalizeText(predictionMatch ? predictedCells[predictionMatch.index]?.text : "");
    const referenceChars = [...reference];
    const hypothesisChars = [...hypothesis];
    const referenceWordTokens = reference ? reference.split(" ") : [];
    const hypothesisWordTokens = hypothesis ? hypothesis.split(" ") : [];
    const charDistance = editDistance(referenceChars, hypothesisChars);
    const wordDistance = editDistance(referenceWordTokens, hypothesisWordTokens);
    textCellCount++;
    documentTextCells++;
    referenceCharacters += referenceChars.length;
    documentReferenceCharacters += referenceChars.length;
    characterErrors += charDistance;
    documentCharacterErrors += charDistance;
    referenceWords += referenceWordTokens.length;
    wordErrors += wordDistance;
    if (reference === hypothesis) textExactCount++;
  }
  truePositive += matches.length;
  falsePositive += predictedCells.length - matches.length;
  falseNegative += gt.cells.length - matches.length;
  matchedIous.push(...matches.map(match => match.score));
  const predictedRowCount = predictedCells.length ? Math.max(...predictedCells.map(cell => Number(cell.rowIndex) || 0)) + 1 : 0;
  const predictedColumnCount = predictedCells.length ? Math.max(...predictedCells.map(cell => Number(cell.columnIndex) || 0)) + 1 : 0;
  const rowError = Math.abs(gt.rows.length - predictedRowCount);
  const columnError = Math.abs(gt.columns.length - predictedColumnCount);
  rowErrors.push(rowError); columnErrors.push(columnError);
  if (rowError === 0) rowExact++;
  if (columnError === 0) columnExact++;
  documents.push({ id: entry.id, status: "scored", gtCells: gt.cells.length, predictedCells: predictedCells.length, matchedCells: matches.length, rowError, columnError, processingMs: prediction.processingMs ?? null, textCells: documentTextCells, characterErrorRate: documentReferenceCharacters ? documentCharacterErrors / documentReferenceCharacters : null });
}

const precision = truePositive / Math.max(1, truePositive + falsePositive);
const recall = truePositive / Math.max(1, truePositive + falseNegative);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  matching: { method: "global greedy polygon-IoU matching", iouThreshold: threshold },
  corpus: { documentCount: manifest.selectedCount, evaluatedDocumentCount: evaluatedDocuments, missingPredictionCount: manifest.selectedCount - evaluatedDocuments, groundTruthCells: manifest.totalCells, evaluatedGroundTruthCells, textGroundTruthAvailable: manifest.textGroundTruthAvailable === true, groundTruthTextFields: manifest.totalTextFields ?? 0, gridLinkedTextCells: manifest.totalTextCells ?? 0 },
  structure: {
    truePositive, falsePositive, falseNegative,
    cellPrecision: precision,
    cellRecall: recall,
    cellF1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    meanMatchedIoU: matchedIous.length ? matchedIous.reduce((a, b) => a + b, 0) / matchedIous.length : null,
    documentTableDetectionRate: evaluatedDocuments ? detectedDocuments / evaluatedDocuments : null,
    rowCountExactRate: evaluatedDocuments ? rowExact / evaluatedDocuments : null,
    rowCountMae: evaluatedDocuments ? rowErrors.reduce((a, b) => a + b, 0) / evaluatedDocuments : null,
    columnCountExactRate: evaluatedDocuments ? columnExact / evaluatedDocuments : null,
    columnCountMae: evaluatedDocuments ? columnErrors.reduce((a, b) => a + b, 0) / evaluatedDocuments : null
  },
  text: textCellCount ? {
    status: "available",
    evaluatedCellCount: textCellCount,
    exactCellRate: textExactCount / textCellCount,
    referenceCharacters,
    characterErrors,
    characterErrorRate: characterErrors / Math.max(1, referenceCharacters),
    referenceWords,
    wordErrors,
    wordErrorRate: wordErrors / Math.max(1, referenceWords),
    normalization: "Unicode NFC, lowercase, collapsed whitespace"
  } : { status: "not_available", reason: "No transcribed ground-truth cells were evaluated." },
  latencyMs: { samples: latencies.length, median: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
  documents
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputArg) {
  fs.mkdirSync(path.dirname(path.resolve(outputArg)), { recursive: true });
  fs.writeFileSync(path.resolve(outputArg), serialized, "utf8");
}
console.log(serialized.trim());
