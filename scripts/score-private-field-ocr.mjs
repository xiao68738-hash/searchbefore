import fs from "node:fs";
import path from "node:path";

const [groundTruthArg, predictionArg, reportArg] = process.argv.slice(2);
if (!groundTruthArg || !predictionArg || !reportArg) {
  throw new Error("用法：node scripts/score-private-field-ocr.mjs <ground-truth.json> <predictions.json> <report.json>");
}

const privateRoot = path.resolve("D:/SearchBefore/private");
const groundTruthPath = path.resolve(groundTruthArg);
const predictionPath = path.resolve(predictionArg);
const reportPath = path.resolve(reportArg);
for (const target of [groundTruthPath, predictionPath, reportPath]) {
  if (target !== privateRoot && !target.toLowerCase().startsWith(privateRoot.toLowerCase() + path.sep)) {
    throw new Error(`真實表單內容與評分報告必須保留在 ${privateRoot}`);
  }
}

const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, "utf8"));
const predictions = JSON.parse(fs.readFileSync(predictionPath, "utf8"));
if (!Array.isArray(groundTruth.fields) || !Array.isArray(predictions.fields)) {
  throw new Error("ground truth 與 prediction 都必須包含 fields 陣列");
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
}

function editDistance(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[right.length];
}

const predictionById = new Map(predictions.fields.map(field => [field.id, field]));
let exactFields = 0;
let nonEmptyFields = 0;
let referenceChars = 0;
let charErrors = 0;
const fields = groundTruth.fields.map(field => {
  const expected = normalize(field.value);
  const prediction = predictionById.get(field.id);
  const actual = normalize(prediction?.value);
  const errors = editDistance(expected, actual);
  const exact = expected === actual;
  if (exact) exactFields += 1;
  if (actual) nonEmptyFields += 1;
  referenceChars += Array.from(expected).length;
  charErrors += errors;
  return {
    id: field.id,
    label: field.label,
    kind: field.kind,
    expected,
    actual,
    exact,
    charErrors: errors,
    referenceChars: Array.from(expected).length
  };
});

const fieldCount = fields.length;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  dataset: groundTruth.dataset,
  documentId: groundTruth.documentId,
  engine: predictions.engine,
  metrics: {
    fieldCount,
    exactFields,
    exactFieldRate: fieldCount ? exactFields / fieldCount : 0,
    nonEmptyFields,
    recognitionCoverage: fieldCount ? nonEmptyFields / fieldCount : 0,
    referenceChars,
    charErrors,
    cer: referenceChars ? charErrors / referenceChars : 0
  },
  fields
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
