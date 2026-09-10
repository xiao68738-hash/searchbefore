import fs from "node:fs";
import path from "node:path";

const [rootArg] = process.argv.slice(2);
if (!rootArg) throw new Error("Usage: node scripts/validate-naf-cell-ground-truth.mjs <ground-truth-root>");

const root = path.resolve(rootArg);
const privateRoot = path.resolve("D:/SearchBefore/private");
if (!root.toLowerCase().startsWith(`${privateRoot.toLowerCase()}${path.sep}`)) {
  throw new Error(`NAF ground truth must stay under ${privateRoot}`);
}

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const manifest = readJson(path.join(root, "manifest.json"));
const errors = [];
const warnings = [];
const seenDocuments = new Set();
let totalCells = 0;
let totalTextCells = 0;
let totalTextFields = 0;
let linkedTextFields = 0;
const allowedSplits = manifest.purpose === "development-only"
  ? new Set(["train"])
  : new Set(["test", "valid"]);

function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Number(point[0]) * Number(next[1]) - Number(next[0]) * Number(point[1]);
  }, 0) / 2);
}

function checkPolygon(points, width, height, label) {
  if (!Array.isArray(points) || points.length < 3) {
    errors.push(`${label}: polygon requires at least three points`);
    return;
  }
  for (const [index, point] of points.entries()) {
    const [x, y] = point.map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) errors.push(`${label}: point ${index} is not finite`);
    if (x < -0.5 || y < -0.5 || x > width + 0.5 || y > height + 0.5) {
      errors.push(`${label}: point ${index} (${x}, ${y}) is outside ${width}x${height}`);
    }
  }
  if (polygonArea(points) <= 0) errors.push(`${label}: polygon has zero area`);
}

const minimumSelectedCount = manifest.excludedDocumentCount > 0 ? 1 : 30;
if (manifest.selectedCount < minimumSelectedCount || manifest.selectedCount > 50) {
  errors.push(`selectedCount must be ${minimumSelectedCount}-50, got ${manifest.selectedCount}`);
}
if (manifest.textGroundTruthAvailable !== true) errors.push("NAF v1 must expose available field transcription ground truth");
if (!Array.isArray(manifest.documents) || manifest.documents.length !== manifest.selectedCount) {
  errors.push("manifest document count does not match selectedCount");
}

for (const entry of manifest.documents || []) {
  if (seenDocuments.has(entry.id)) errors.push(`duplicate document id: ${entry.id}`);
  seenDocuments.add(entry.id);
  if (!allowedSplits.has(entry.split)) errors.push(`${entry.id}: forbidden split ${entry.split}`);
  const file = path.resolve(root, entry.groundTruth);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
    errors.push(`${entry.id}: missing or unsafe ground-truth path`);
    continue;
  }
  const doc = readJson(file);
  const width = Number(doc.image?.width);
  const height = Number(doc.image?.height);
  if (!(width > 0 && height > 0)) errors.push(`${entry.id}: invalid image dimensions`);
  if (doc.id !== entry.id || doc.split !== entry.split) errors.push(`${entry.id}: manifest/document identity mismatch`);
  if (doc.review?.status !== "structure-and-text-derived-from-naf-reviewed-annotations") {
    errors.push(`${entry.id}: unexpected review status`);
  }
  const rowIds = new Set((doc.rows || []).map(row => row.id));
  const columnIds = new Set((doc.columns || []).map(column => column.id));
  if (rowIds.size !== (doc.rows || []).length) errors.push(`${entry.id}: duplicate row annotation id`);
  if (columnIds.size !== (doc.columns || []).length) errors.push(`${entry.id}: duplicate column annotation id`);
  const cellIds = new Set();
  for (const cell of doc.cells || []) {
    const label = `${entry.id}/${cell.id}`;
    if (cellIds.has(cell.id)) errors.push(`${label}: duplicate cell id`);
    cellIds.add(cell.id);
    if (!Number.isInteger(cell.rowIndex) || cell.rowIndex < 0 || cell.rowIndex >= doc.rows.length) errors.push(`${label}: invalid rowIndex`);
    if (!Number.isInteger(cell.columnIndex) || cell.columnIndex < 0 || cell.columnIndex >= doc.columns.length) errors.push(`${label}: invalid columnIndex`);
    if (!rowIds.has(cell.rowAnnotationId)) errors.push(`${label}: unknown row annotation`);
    if (!columnIds.has(cell.columnAnnotationId)) errors.push(`${label}: unknown column annotation`);
    const hasText = typeof cell.textGroundTruth === "string" && cell.textGroundTruth.length > 0;
    if (hasText !== (cell.textGroundTruthStatus === "provided-by-naf-field-transcriptions")) {
      errors.push(`${label}: transcription value/status mismatch`);
    }
    if (!hasText && cell.textGroundTruth !== null) errors.push(`${label}: empty transcription must be null`);
    if (!Array.isArray(cell.textRegions)) errors.push(`${label}: textRegions must be an array`);
    for (const region of cell.textRegions || []) {
      if (typeof region.id !== "string" || typeof region.text !== "string" || !region.text) errors.push(`${label}: invalid text region`);
      checkPolygon(region.polygon, width, height, `${label}/${region.id}`);
    }
    if (hasText) totalTextCells++;
    checkPolygon(cell.polygon, width, height, label);
  }
  const textFieldIds = new Set();
  for (const field of doc.textFields || []) {
    const label = `${entry.id}/text-field/${field.id}`;
    if (textFieldIds.has(field.id)) errors.push(`${label}: duplicate text field id`);
    textFieldIds.add(field.id);
    if (typeof field.text !== "string" || !field.text) errors.push(`${label}: missing transcription`);
    checkPolygon(field.polygon, width, height, label);
    if (field.linkedCellId !== undefined) {
      linkedTextFields++;
      if (!cellIds.has(field.linkedCellId)) errors.push(`${label}: unknown linked cell`);
    }
    totalTextFields++;
  }
  if ((doc.textFields || []).length !== entry.textFieldCount) errors.push(`${entry.id}: text field count mismatch`);
  if ((doc.cells || []).length !== entry.cellCount) errors.push(`${entry.id}: cell count mismatch`);
  if ((doc.rows || []).length !== entry.rowCount) errors.push(`${entry.id}: row count mismatch`);
  if ((doc.columns || []).length !== entry.columnCount) errors.push(`${entry.id}: column count mismatch`);
  if (!(doc.cells || []).length) warnings.push(`${entry.id}: no cells`);
  totalCells += (doc.cells || []).length;
}

if (totalCells !== manifest.totalCells) errors.push(`totalCells mismatch: manifest=${manifest.totalCells}, actual=${totalCells}`);
if (totalTextCells !== manifest.totalTextCells) errors.push(`totalTextCells mismatch: manifest=${manifest.totalTextCells}, actual=${totalTextCells}`);
if (totalTextFields !== manifest.totalTextFields) errors.push(`totalTextFields mismatch: manifest=${manifest.totalTextFields}, actual=${totalTextFields}`);
if (linkedTextFields + Number(manifest.unmatchedTranscribedFields || 0) !== totalTextFields) errors.push("text field link accounting mismatch");
const result = {
  valid: errors.length === 0,
  documentCount: seenDocuments.size,
  totalCells,
  splitCounts: manifest.splitCounts,
  groupCount: manifest.groupCount,
  totalTextCells,
  totalTextFields,
  linkedTextFields,
  textMetricsAvailable: totalTextCells > 0,
  warningCount: warnings.length,
  errorCount: errors.length,
  warnings,
  errors
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
