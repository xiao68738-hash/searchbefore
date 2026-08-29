import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPesticide, loadClassificationCatalog, summarizeClassificationCoverage } from "./pesticide-classification.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const match = html.match(/const DATA=(\{.*?\});\r?\n/s);
if (!match) throw new Error("index.html 找不到 const DATA");

const data = JSON.parse(match[1]);
const rows = [];
for (const pests of Object.values(data)) for (const entries of Object.values(pests)) rows.push(...entries);

const catalog = loadClassificationCatalog();
const summary = summarizeClassificationCoverage(rows, catalog);
const unknown = new Map();
for (const entry of rows) {
  const result = classifyPesticide(entry, catalog);
  if (result.movement.isSystemic === null) unknown.set(entry.name, (unknown.get(entry.name) || 0) + 1);
}

console.log(JSON.stringify({
  ...summary,
  resistanceCoverage: summary.total ? summary.resistanceClassified / summary.total : 0,
  movementCoverage: summary.total ? summary.movementClassified / summary.total : 0,
  topUnknownMovement: [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count }))
}, null, 2));
