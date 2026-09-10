import fs from "node:fs";
import path from "node:path";

const [groundTruthArg, outputArg] = process.argv.slice(2);
if (!groundTruthArg || !outputArg) throw new Error("Usage: node scripts/run-azure-cell-benchmark.mjs <ground-truth-root> <private-output>");
const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.replace(/\/$/, "");
const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
if (!endpoint || !key) throw new Error("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY are required");
const gtRoot = path.resolve(groundTruthArg);
const outputRoot = path.resolve(outputArg);
const privateRoot = path.resolve("D:/SearchBefore/private");
if (!outputRoot.toLowerCase().startsWith(`${privateRoot.toLowerCase()}${path.sep}`)) throw new Error("Predictions must stay under D:/SearchBefore/private");
fs.mkdirSync(path.join(outputRoot, "raw"), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(gtRoot, "manifest.json"), "utf8"));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function polygon(value) {
  if (!Array.isArray(value)) return [];
  if (value.length && typeof value[0] === "number") {
    const points = [];
    for (let i = 0; i + 1 < value.length; i += 2) points.push([value[i], value[i + 1]]);
    return points;
  }
  return value.map(point => [Number(point.x), Number(point.y)]).filter(point => point.every(Number.isFinite));
}

function pixelPolygon(cell, pages, image) {
  const region = cell.boundingRegions?.[0];
  const page = pages.find(item => item.pageNumber === region?.pageNumber) || pages[0];
  const points = polygon(region?.polygon);
  if (!points.length) return [];
  const xScale = image.width / Number(page?.width || image.width);
  const yScale = image.height / Number(page?.height || image.height);
  return points.map(([x, y]) => [x * xScale, y * yScale]);
}

for (const [index, entry] of manifest.documents.entries()) {
  const gt = JSON.parse(fs.readFileSync(path.join(gtRoot, entry.groundTruth), "utf8"));
  const started = performance.now();
  const response = await fetch(`${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/octet-stream" },
    body: fs.readFileSync(gt.image.privatePath)
  });
  if (!response.ok) throw new Error(`${entry.id}: analyze failed (${response.status})`);
  const operation = response.headers.get("operation-location");
  if (!operation) throw new Error(`${entry.id}: no operation-location returned`);
  let raw;
  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(1000);
    const poll = await fetch(operation, { headers: { "Ocp-Apim-Subscription-Key": key } });
    if (!poll.ok) throw new Error(`${entry.id}: poll failed (${poll.status})`);
    raw = await poll.json();
    if (raw.status === "succeeded") break;
    if (raw.status === "failed") throw new Error(`${entry.id}: Azure analysis failed`);
  }
  if (raw?.status !== "succeeded") throw new Error(`${entry.id}: Azure analysis timed out`);
  fs.writeFileSync(path.join(outputRoot, "raw", `${entry.id}.json`), `${JSON.stringify(raw, null, 2)}\n`);
  const result = raw.analyzeResult || {};
  const normalized = {
    schemaVersion: 1,
    provider: "azure-document-intelligence",
    model: "prebuilt-layout@2024-11-30",
    documentId: entry.id,
    processingMs: Math.round(performance.now() - started),
    tables: (result.tables || []).map((table, tableIndex) => ({
      tableIndex,
      cells: (table.cells || []).map(cell => ({
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        rowSpan: cell.rowSpan || 1,
        columnSpan: cell.columnSpan || 1,
        polygon: pixelPolygon(cell, result.pages || [], gt.image),
        text: cell.content || "",
        confidence: cell.confidence ?? null
      }))
    }))
  };
  fs.writeFileSync(path.join(outputRoot, `${entry.id}.json`), `${JSON.stringify(normalized, null, 2)}\n`);
  console.log(JSON.stringify({ completed: index + 1, total: manifest.selectedCount, documentId: entry.id, tableCount: normalized.tables.length, processingMs: normalized.processingMs }));
}
