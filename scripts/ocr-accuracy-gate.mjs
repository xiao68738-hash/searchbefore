import fs from "node:fs";
import path from "node:path";
import { accuracyGate } from './ocr-accuracy-policy.mjs';

// This report aggregates historical diagnostics, never certifies a new blind test.
// Merely adding an evidence-metadata file cannot turn reused scores into unseen data.
const [privateRootArg, outputArg] = process.argv.slice(2);
if (!privateRootArg || !outputArg) {
  throw new Error("Usage: node scripts/ocr-accuracy-gate.mjs <private-root> <output.json>");
}

const privateRoot = path.resolve(privateRootArg);
const output = path.resolve(outputArg);
const isInside = target => target === privateRoot || target.toLowerCase().startsWith(`${privateRoot.toLowerCase()}${path.sep}`);
if (!isInside(output)) throw new Error(`Output must stay under ${privateRoot}`);

const reportsRoot = path.join(privateRoot, "ocr-benchmark", "reports");
const read = name => {
  const file = path.join(reportsRoot, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
};
const metric = (report, section, key) => {
  const value = report?.[section]?.[key];
  return Number.isFinite(value) ? value : null;
};
const lane = (name, report, section, key, countSection, countKey) => ({
  name,
  available: Boolean(report),
  sampleCount: report?.[countSection]?.[countKey] ?? null,
  metric: metric(report, section, key),
});

const lanes = {
  text: [
    lane("Google ML Kit Latin", read("ml-kit-naf-text-crops-v1.json"), "text", "exactFieldRate", "corpus", "evaluatedFieldCount"),
    lane("Windows.Media.Ocr", read("windows-ocr-naf-text-crops-v1.json"), "text", "exactFieldRate", "corpus", "evaluatedFieldCount"),
    lane("Microsoft TrOCR handwritten baseline", read("trocr-naf-text-crops-v1.json"), "text", "exactFieldRate", "corpus", "evaluatedFieldCount"),
  ],
  structure: [
    lane("Historical validation local recovery (reused)", read("holdout-local-recovery-b-2026-09-09.json"), "structure", "cellF1", "corpus", "evaluatedDocumentCount"),
    lane("Historical validation edge v12 (reused)", read("holdout-edge-v12-official-score-2026-09-09.json"), "structure", "cellF1", "corpus", "evaluatedDocumentCount"),
  ],
};

const realForm = read("../zh-tw-real-photos-v1/5df0f5c0/postprocess-report-2026-09-09.json");
const realFieldRate = metric(realForm, "metrics", "exactFieldRate") ?? metric(realForm, "text", "exactFieldRate");
const realFormSampleCount = realForm?.metrics?.fieldCount ?? realForm?.corpus?.evaluatedFieldCount ?? null;

const independentText = lanes.text.find(item => item.name === "Microsoft TrOCR handwritten baseline");
const independentStructure = lanes.structure[0];
// Historical scores are diagnostic only. No independence/language/count inferred from filenames.
const evidence = read('independent-traditional-chinese-evidence.json');
const gate = {
  ...accuracyGate({textRate:independentText.metric, structureRate:independentStructure.metric, realRate:realFieldRate, evidence}),
  historicalScoresOnly: true,
  overallPass: false
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: "Research-only OCR accuracy gate; not a production claim.",
  definition: "Research gate only: rates >=50% plus explicit unseen/frozen-split evidence and at least 30 distinct reviewed real zh-Hant handwritten forms; fields are not forms. Historical repeatedly viewed validation is not a blind holdout. Not permission to release.",
  lanes,
  realReviewed: { available: Boolean(realForm), sampleCount: realFormSampleCount, exactFieldRate: realFieldRate },
  gate,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, overallPass: gate.overallPass, gate }));
