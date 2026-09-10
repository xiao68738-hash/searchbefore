import fs from "node:fs";
import path from "node:path";

// This gate deliberately treats the independent holdout as authoritative. It
// prevents a train-set score, a single corrected photo, or a template-transfer
// experiment from being reported as the product's overall accuracy.
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
    lane("Independent holdout local recovery", read("holdout-local-recovery-b-2026-09-09.json"), "structure", "cellF1", "corpus", "evaluatedDocumentCount"),
    lane("Independent holdout edge v12", read("holdout-edge-v12-official-score-2026-09-09.json"), "structure", "cellF1", "corpus", "evaluatedDocumentCount"),
  ],
};

const realForm = read("../zh-tw-real-photos-v1/5df0f5c0/postprocess-report-2026-09-09.json");
const realFieldRate = metric(realForm, "metrics", "exactFieldRate") ?? metric(realForm, "text", "exactFieldRate");
const realFormSampleCount = realForm?.metrics?.fieldCount ?? realForm?.corpus?.evaluatedFieldCount ?? null;

const independentText = lanes.text.find(item => item.name === "Microsoft TrOCR handwritten baseline");
const independentStructure = lanes.structure[0];
const gate = {
  target: 0.5,
  independentTextExactFieldRateAtLeast50: independentText.metric !== null && independentText.metric >= 0.5,
  independentStructureCellF1AtLeast50: independentStructure.metric !== null && independentStructure.metric >= 0.5,
  realFormExactFieldRateAtLeast50: realFieldRate !== null && realFieldRate >= 0.5,
  minimumRealFieldSampleCountMet: realFormSampleCount !== null && realFormSampleCount >= 30,
};
gate.overallPass = Object.values(gate).every(value => value === true || typeof value === "number");

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: "Research-only OCR accuracy gate; not a production claim.",
  definition: "Pass requires independent text exact-field rate and independent holdout structure Cell F1 >= 50%, plus >=30 real reviewed fields/forms meeting the same threshold.",
  lanes,
  realReviewed: { available: Boolean(realForm), sampleCount: realFormSampleCount, exactFieldRate: realFieldRate },
  gate,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, overallPass: gate.overallPass, gate }));
