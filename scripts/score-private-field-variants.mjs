import fs from "node:fs";
import path from "node:path";

const [groundTruthArg, resultsArg, reportArg] = process.argv.slice(2);
if (!groundTruthArg || !resultsArg || !reportArg) {
  throw new Error("用法：node scripts/score-private-field-variants.mjs <ground-truth.json> <results-dir> <report.json>");
}

const privateRoot = path.resolve("D:/SearchBefore/private");
const groundTruthPath = path.resolve(groundTruthArg);
const resultsDirectory = path.resolve(resultsArg);
const reportPath = path.resolve(reportArg);
for (const target of [groundTruthPath, resultsDirectory, reportPath]) {
  if (target !== privateRoot && !target.toLowerCase().startsWith(privateRoot.toLowerCase() + path.sep)) {
    throw new Error(`真實表單內容與評分報告必須保留在 ${privateRoot}`);
  }
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
}

function editDistance(leftValue, rightValue) {
  const left = Array.from(leftValue);
  const right = Array.from(rightValue);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, "utf8"));
const expectedById = new Map(groundTruth.fields.map((field) => [field.id, normalize(field.value)]));
const attempts = [];
for (const filename of fs.readdirSync(resultsDirectory).sort()) {
  if (!filename.endsWith(".json") || !filename.includes("--")) continue;
  const fieldId = filename.split("--", 1)[0];
  if (!expectedById.has(fieldId)) continue;
  const result = JSON.parse(fs.readFileSync(path.join(resultsDirectory, filename), "utf8"));
  const expected = expectedById.get(fieldId);
  const actual = normalize(result.text);
  const charErrors = editDistance(expected, actual);
  attempts.push({
    fieldId,
    filename,
    engine: result.engine || "unknown",
    expected,
    actual,
    exact: actual === expected,
    charErrors,
    referenceChars: Array.from(expected).length,
    cer: expected ? charErrors / Array.from(expected).length : 0,
    elapsedMs: result.elapsedMs ?? null,
  });
}

const fields = groundTruth.fields.map((field) => {
  const fieldAttempts = attempts.filter((attempt) => attempt.fieldId === field.id);
  const best = fieldAttempts.slice().sort((left, right) =>
    left.charErrors - right.charErrors || Number(Boolean(right.actual)) - Number(Boolean(left.actual))
  )[0] || null;
  return {
    id: field.id,
    expected: normalize(field.value),
    attemptCount: fieldAttempts.length,
    exactAttemptCount: fieldAttempts.filter((attempt) => attempt.exact).length,
    bestAttempt: best,
  };
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  dataset: groundTruth.dataset,
  documentId: groundTruth.documentId,
  selectionPolicy: "oracle-for-development-only; never auto-select a variant using ground truth in production",
  metrics: {
    fieldCount: fields.length,
    attemptCount: attempts.length,
    fieldsWithAnyExactAttempt: fields.filter((field) => field.exactAttemptCount > 0).length,
  },
  fields,
  attempts,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.metrics));
