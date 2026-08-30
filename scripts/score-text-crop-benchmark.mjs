import fs from "node:fs";
import path from "node:path";

const [manifestArg, predictionsArg, outputArg, suffixArg = ".windows-ocr.json", engineArg = "Windows.Media.Ocr comparison baseline", languageArg = "en-US"] = process.argv.slice(2);
if (!manifestArg || !predictionsArg) {
  throw new Error("Usage: node scripts/score-text-crop-benchmark.mjs <crop-manifest.json> <prediction-output> [report.json] [prediction-suffix] [engine] [language]");
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestArg), "utf8"));
const predictionsRoot = path.resolve(predictionsArg);

function normalize(value) {
  return String(value ?? "").normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function editDistance(reference, hypothesis) {
  let previous = Array.from({ length: hypothesis.length + 1 }, (_, index) => index);
  for (let row = 1; row <= reference.length; row++) {
    const current = [row];
    for (let column = 1; column <= hypothesis.length; column++) {
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + (reference[row - 1] === hypothesis[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[hypothesis.length];
}

let evaluated = 0, exact = 0, missingPredictions = 0, failedFields = 0, referenceCharacters = 0, characterErrors = 0, referenceWords = 0, wordErrors = 0, latencyMs = 0;
const documents = new Map();
for (const entry of manifest.entries || []) {
  const file = path.join(predictionsRoot, `${entry.id}${suffixArg}`);
  const prediction = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  if (!prediction) missingPredictions++;
  if (prediction?.error) failedFields++;
  const reference = normalize(entry.textGroundTruth);
  const hypothesis = normalize(prediction?.text);
  const referenceChars = [...reference], hypothesisChars = [...hypothesis];
  const referenceWordTokens = reference ? reference.split(" ") : [], hypothesisWordTokens = hypothesis ? hypothesis.split(" ") : [];
  evaluated++;
  if (reference === hypothesis) exact++;
  referenceCharacters += referenceChars.length;
  characterErrors += editDistance(referenceChars, hypothesisChars);
  referenceWords += referenceWordTokens.length;
  wordErrors += editDistance(referenceWordTokens, hypothesisWordTokens);
  latencyMs += Number(prediction?.elapsedMs) || 0;
  const aggregate = documents.get(entry.documentId) || { fieldCount: 0, recognizedFieldCount: 0 };
  aggregate.fieldCount++;
  if (hypothesis) aggregate.recognizedFieldCount++;
  documents.set(entry.documentId, aggregate);
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  engine: engineArg,
  language: languageArg,
  corpus: { documentCount: manifest.documentCount, fieldCount: manifest.cropCount, evaluatedFieldCount: evaluated, missingPredictionCount: missingPredictions, failedFieldCount: failedFields },
  text: {
    exactFieldRate: exact / Math.max(1, evaluated),
    referenceCharacters,
    characterErrors,
    characterErrorRate: characterErrors / Math.max(1, referenceCharacters),
    referenceWords,
    wordErrors,
    wordErrorRate: wordErrors / Math.max(1, referenceWords),
    recognizedFieldRate: [...documents.values()].reduce((sum, item) => sum + item.recognizedFieldCount, 0) / Math.max(1, evaluated),
    normalization: "Unicode NFC, lowercase, collapsed whitespace",
  },
  latencyMs: { total: latencyMs, meanPerField: latencyMs / Math.max(1, evaluated) },
  documents: Object.fromEntries(documents),
};

const serialized = JSON.stringify(report, null, 2) + "\n";
if (outputArg) {
  fs.mkdirSync(path.dirname(path.resolve(outputArg)), { recursive: true });
  fs.writeFileSync(path.resolve(outputArg), serialized, "utf8");
}
console.log(serialized.trim());
