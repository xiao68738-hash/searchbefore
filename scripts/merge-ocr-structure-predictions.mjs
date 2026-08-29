import fs from "node:fs";
import path from "node:path";

const [primaryArg, fallbackArg, outputArg] = process.argv.slice(2);
if (!primaryArg || !fallbackArg || !outputArg) {
  throw new Error("Usage: node scripts/merge-ocr-structure-predictions.mjs <primary-predictions> <fallback-predictions> <private-output>");
}

const primaryRoot = path.resolve(primaryArg);
const fallbackRoot = path.resolve(fallbackArg);
const outputRoot = path.resolve(outputArg);
const privateRoot = path.resolve("D:/SearchBefore/private");
if (!outputRoot.toLowerCase().startsWith(`${privateRoot.toLowerCase()}${path.sep}`)) {
  throw new Error("Merged predictions must stay under D:/SearchBefore/private");
}
fs.mkdirSync(outputRoot, { recursive: true });

const files = [...new Set([
  ...fs.readdirSync(primaryRoot).filter(file => file.endsWith(".json")),
  ...fs.readdirSync(fallbackRoot).filter(file => file.endsWith(".json"))
])].sort();

const read = (root, file) => {
  const target = path.join(root, file);
  return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : null;
};
const cellCount = prediction => (prediction?.tables || []).reduce((sum, table) => sum + (table.cells || []).length, 0);

let primarySelections = 0;
let fallbackSelections = 0;
for (const file of files) {
  const primary = read(primaryRoot, file);
  const fallback = read(fallbackRoot, file);
  const usePrimary = cellCount(primary) > 0 || !fallback;
  const selected = usePrimary ? primary : fallback;
  if (!selected) continue;
  if (usePrimary) primarySelections += 1;
  else fallbackSelections += 1;
  const merged = {
    ...selected,
    provider: "local-naf-structure-hybrid",
    model: `${primary?.model || "gridline"}-with-${fallback?.model || "fallback"}`,
    processingMs: Number(primary?.processingMs || 0) + (usePrimary ? 0 : Number(fallback?.processingMs || 0)),
    selection: {
      lane: usePrimary ? "gridline-v2" : "tatr-v1-fallback",
      reason: usePrimary ? "gridline cells detected" : "gridline returned no cells"
    }
  };
  fs.writeFileSync(path.join(outputRoot, file), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ documents: files.length, primarySelections, fallbackSelections, outputRoot }));
