import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [datasetArg, outputArg, requestedArg = "40", excludeManifestArg, splitArg = "test,valid", selectionMode = "spread"] = process.argv.slice(2);
if (!datasetArg || !outputArg) {
  throw new Error("Usage: node scripts/build-naf-cell-ground-truth.mjs <NAF root> <private output> [count] [exclude-manifest] [splits] [spread|low-complexity]");
}

const datasetRoot = path.resolve(datasetArg);
const outputRoot = path.resolve(outputArg);
const privateRoot = path.resolve("D:/SearchBefore/private");
if (!outputRoot.toLowerCase().startsWith(`${privateRoot.toLowerCase()}${path.sep}`)) {
  throw new Error(`Ground truth containing transcriptions must stay under ${privateRoot}`);
}
const hasExcludeManifest = Boolean(excludeManifestArg && excludeManifestArg !== "-");
const requested = Math.max(hasExcludeManifest ? 1 : 30, Math.min(50, Number(requestedArg) || 40));
const groupsRoot = path.join(datasetRoot, "groups");
const imagesRoot = path.join(datasetRoot, "labeled_images");
const split = JSON.parse(fs.readFileSync(path.join(groupsRoot, "train_valid_test_split.json"), "utf8"));
const includedSplits = new Set(splitArg.split(",").map(value => value.trim()).filter(Boolean));
if (![...includedSplits].every(value => ["train", "valid", "test"].includes(value))) {
  throw new Error(`Unsupported split list: ${splitArg}`);
}
if (!["spread", "low-complexity"].includes(selectionMode)) {
  throw new Error(`Unsupported selection mode: ${selectionMode}`);
}
const excludedIds = new Set();
if (hasExcludeManifest) {
  const excludedManifest = JSON.parse(fs.readFileSync(path.resolve(excludeManifestArg), "utf8"));
  for (const document of excludedManifest.documents || []) excludedIds.add(document.id);
}

function bounds(box) {
  const points = Array.isArray(box?.poly_points) ? box.poly_points : [];
  if (!points.length) return null;
  const xs = points.map(point => Number(point[0])).filter(Number.isFinite);
  const ys = points.map(point => Number(point[1])).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function center(box) {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

function polygonArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function ccw(points) {
  const clean = points.map(point => [Number(point[0]), Number(point[1])]);
  return polygonArea(clean) < 0 ? clean.reverse() : clean;
}

function lineIntersection(start, end, edgeStart, edgeEnd) {
  const x1 = start[0], y1 = start[1], x2 = end[0], y2 = end[1];
  const x3 = edgeStart[0], y3 = edgeStart[1], x4 = edgeEnd[0], y4 = edgeEnd[1];
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < 1e-9) return end;
  const cross1 = x1 * y2 - y1 * x2;
  const cross2 = x3 * y4 - y3 * x4;
  return [
    (cross1 * (x3 - x4) - (x1 - x2) * cross2) / denominator,
    (cross1 * (y3 - y4) - (y1 - y2) * cross2) / denominator
  ];
}

function inside(point, edgeStart, edgeEnd) {
  return (edgeEnd[0] - edgeStart[0]) * (point[1] - edgeStart[1])
    - (edgeEnd[1] - edgeStart[1]) * (point[0] - edgeStart[0]) >= -1e-6;
}

function intersectConvex(subjectPolygon, clipPolygon) {
  let output = ccw(subjectPolygon);
  const clip = ccw(clipPolygon);
  for (let index = 0; index < clip.length; index++) {
    const edgeStart = clip[index];
    const edgeEnd = clip[(index + 1) % clip.length];
    const input = output;
    output = [];
    if (!input.length) break;
    let start = input[input.length - 1];
    for (const end of input) {
      if (inside(end, edgeStart, edgeEnd)) {
        if (!inside(start, edgeStart, edgeEnd)) output.push(lineIntersection(start, end, edgeStart, edgeEnd));
        output.push(end);
      } else if (inside(start, edgeStart, edgeEnd)) {
        output.push(lineIntersection(start, end, edgeStart, edgeEnd));
      }
      start = end;
    }
  }
  return Math.abs(polygonArea(output)) >= 4 ? output : null;
}

function contains(box, point, margin = 0) {
  return point.x >= box.left - margin && point.x <= box.right + margin
    && point.y >= box.top - margin && point.y <= box.bottom + margin;
}

function pointInPolygon(point, polygon) {
  let insidePolygon = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    const crosses = (yi > point.y) !== (yj > point.y)
      && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (crosses) insidePolygon = !insidePolygon;
  }
  return insidePolygon;
}

function collectAnnotationPaths(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectAnnotationPaths(fullPath, output);
    else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("template")) output.push(fullPath);
  }
  return output;
}

const splitIndex = new Map();
for (const splitName of ["test", "valid", "train"]) {
  for (const [group, names] of Object.entries(split[splitName] || {})) {
    for (const name of names) splitIndex.set(`${group}/${name}`, splitName);
  }
}

const eligible = [];
for (const annotationPath of collectAnnotationPaths(groupsRoot)) {
  let annotation;
  try { annotation = JSON.parse(fs.readFileSync(annotationPath, "utf8")); } catch { continue; }
  const group = path.basename(path.dirname(annotationPath));
  const imageName = annotation.imageFilename || `${path.basename(annotationPath, ".json")}.jpg`;
  const id = `${group}-${path.basename(imageName, path.extname(imageName))}`;
  if (excludedIds.has(id)) continue;
  const splitName = splitIndex.get(`${group}/${imageName}`);
  if (!splitName || !includedSplits.has(splitName)) continue;
  const fields = Array.isArray(annotation.fieldBBs) ? annotation.fieldBBs : [];
  const rows = fields.filter(item => item.type === "fieldRow" && bounds(item));
  const columns = fields.filter(item => item.type === "fieldCol" && bounds(item));
  const handwritingCount = fields.filter(item => item.isBlank === 1).length;
  const imagePath = path.join(imagesRoot, imageName);
  if (!rows.length || !columns.length || !handwritingCount || !fs.existsSync(imagePath)) continue;
  const regions = fields.filter(item => item.type === "fieldRegion").length;
  eligible.push({ id, annotationPath, annotation, group, imageName, imagePath, splitName, rows, columns, handwritingCount, regions });
}

eligible.sort((a, b) => {
  const splitOrder = { test: 0, valid: 1, train: 2 };
  if (a.splitName !== b.splitName) return splitOrder[a.splitName] - splitOrder[b.splitName];
  if ((b.regions > 1) !== (a.regions > 1)) return Number(b.regions > 1) - Number(a.regions > 1);
  const complexityA = a.rows.length * a.columns.length;
  const complexityB = b.rows.length * b.columns.length;
  if (complexityA !== complexityB) {
    return selectionMode === "low-complexity"
      ? complexityA - complexityB
      : complexityB - complexityA;
  }
  return `${a.group}/${a.imageName}`.localeCompare(`${b.group}/${b.imageName}`);
});

// Deterministic spread across the full eligible list instead of taking only one template family.
const selected = [];
const usedGroups = new Map();
while (selected.length < requested) {
  let progressed = false;
  for (const candidate of eligible) {
    if (selected.includes(candidate)) continue;
    const limit = 1 + Math.floor(selected.length / Math.max(1, new Set(eligible.map(item => item.group)).size));
    if ((usedGroups.get(candidate.group) || 0) >= Math.max(2, limit)) continue;
    selected.push(candidate);
    usedGroups.set(candidate.group, (usedGroups.get(candidate.group) || 0) + 1);
    progressed = true;
    if (selected.length >= requested) break;
  }
  if (!progressed) {
    const candidate = eligible.find(item => !selected.includes(item));
    if (!candidate) break;
    selected.push(candidate);
    usedGroups.set(candidate.group, (usedGroups.get(candidate.group) || 0) + 1);
  }
}

fs.mkdirSync(path.join(outputRoot, "documents"), { recursive: true });
const manifest = [];
for (const item of selected) {
  const annotation = item.annotation;
  const fields = Array.isArray(annotation.fieldBBs) ? annotation.fieldBBs : [];
  const rowBoxes = item.rows.map(row => ({ id: row.id, polygon: ccw(row.poly_points), box: bounds(row) })).sort((a, b) => center(a.box).y - center(b.box).y);
  const columnBoxes = item.columns.map(column => ({ id: column.id, polygon: ccw(column.poly_points), box: bounds(column) })).sort((a, b) => center(a.box).x - center(b.box).x);
  const cells = [];
  for (let rowIndex = 0; rowIndex < rowBoxes.length; rowIndex++) {
    for (let columnIndex = 0; columnIndex < columnBoxes.length; columnIndex++) {
      const polygon = intersectConvex(rowBoxes[rowIndex].polygon, columnBoxes[columnIndex].polygon);
      if (!polygon) continue;
      const box = bounds({ poly_points: polygon });
      cells.push({
        id: `r${rowIndex + 1}c${columnIndex + 1}`,
        rowIndex,
        columnIndex,
        rowAnnotationId: rowBoxes[rowIndex].id,
        columnAnnotationId: columnBoxes[columnIndex].id,
        polygon,
        box,
        textGroundTruth: null,
        textGroundTruthStatus: "no-naf-field-transcription",
        textRegions: [],
        reviewStatus: "derived-from-naf-row-column-polygons"
      });
    }
  }
  const transcriptions = annotation.transcriptions && typeof annotation.transcriptions === "object"
    ? annotation.transcriptions
    : {};
  const pagePolygon = [[0, 0], [Number(annotation.width), 0], [Number(annotation.width), Number(annotation.height)], [0, Number(annotation.height)]];
  const transcribedFields = fields
    .filter(field => typeof transcriptions[field.id] === "string" && transcriptions[field.id].trim() && bounds(field))
    .map(field => {
      const polygon = intersectConvex(ccw(field.poly_points), pagePolygon);
      return polygon ? {
        id: field.id,
        polygon,
        box: bounds({ poly_points: polygon }),
        text: transcriptions[field.id].normalize("NFC").trim()
      } : null;
    })
    .filter(Boolean);
  const unmatchedTextRegions = [];
  for (const field of transcribedFields) {
    const fieldCenter = center(field.box);
    let cell = cells.find(candidate => contains(candidate.box, fieldCenter, 0.5) && pointInPolygon(fieldCenter, candidate.polygon));
    if (!cell) {
      const ranked = cells
        .map(candidate => {
          const overlap = intersectConvex(field.polygon, candidate.polygon);
          return { candidate, area: overlap ? Math.abs(polygonArea(overlap)) : 0 };
        })
        .sort((a, b) => b.area - a.area);
      if (ranked[0]?.area > 0) cell = ranked[0].candidate;
    }
    if (!cell) {
      unmatchedTextRegions.push(field.id);
      continue;
    }
    field.linkedCellId = cell.id;
    cell.textRegions.push({ id: field.id, polygon: field.polygon, box: field.box, text: field.text });
  }
  for (const cell of cells) {
    cell.textRegions.sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
    if (cell.textRegions.length) {
      cell.textGroundTruth = cell.textRegions.map(region => region.text).join("\n");
      cell.textGroundTruthStatus = "provided-by-naf-field-transcriptions";
    }
  }
  const id = item.id;
  const payload = {
    schemaVersion: 1,
    dataset: "NAF Dataset v3",
    license: "CDLA-Permissive-1.0",
    id,
    split: item.splitName,
    source: { group: item.group, imageName: item.imageName, annotationSha256: crypto.createHash("sha256").update(fs.readFileSync(item.annotationPath)).digest("hex") },
    image: { width: annotation.width, height: annotation.height, privatePath: item.imagePath },
    rows: rowBoxes,
    columns: columnBoxes,
    cells,
    textFields: transcribedFields,
    review: { status: "structure-and-text-derived-from-naf-reviewed-annotations", reviewedAt: null, reviewer: "NAF source annotations", notes: ["Cell polygons are convex intersections of NAF fieldRow and fieldCol polygons.", "NAF field transcriptions are assigned to the containing cell by field-center containment, with maximum polygon overlap as fallback.", `${unmatchedTextRegions.length} transcribed field regions could not be assigned to a derived cell.`] }
  };
  const target = path.join(outputRoot, "documents", `${id}.json`);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  manifest.push({ id, split: item.splitName, group: item.group, imageName: item.imageName, rowCount: rowBoxes.length, columnCount: columnBoxes.length, cellCount: cells.length, textCellCount: cells.filter(cell => cell.textGroundTruth !== null).length, textFieldCount: transcribedFields.length, unmatchedTranscribedFieldCount: unmatchedTextRegions.length, regionCount: item.regions, groundTruth: path.relative(outputRoot, target) });
}

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: includedSplits.has("train") ? "development-only" : (excludedIds.size ? "holdout-validation" : "benchmark"),
  includedSplits: [...includedSplits],
  selectionMode,
  selectionPolicy: `official ${[...includedSplits].join("/")} only; row+column+handwriting required; deterministic template-family ${selectionMode}${excludedIds.size ? "; excludes supplied manifest" : ""}`,
  excludedDocumentCount: excludedIds.size,
  requestedCount: requested,
  eligibleCount: eligible.length,
  selectedCount: manifest.length,
  splitCounts: Object.fromEntries([...includedSplits].map(name => [name, manifest.filter(item => item.split === name).length])),
  groupCount: new Set(manifest.map(item => item.group)).size,
  totalCells: manifest.reduce((sum, item) => sum + item.cellCount, 0),
  textGroundTruthAvailable: manifest.some(item => item.textFieldCount > 0),
  totalTextCells: manifest.reduce((sum, item) => sum + item.textCellCount, 0),
  totalTextFields: manifest.reduce((sum, item) => sum + item.textFieldCount, 0),
  unmatchedTranscribedFields: manifest.reduce((sum, item) => sum + item.unmatchedTranscribedFieldCount, 0),
  documents: manifest
};
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ selectedCount: summary.selectedCount, eligibleCount: summary.eligibleCount, groupCount: summary.groupCount, totalCells: summary.totalCells, totalTextCells: summary.totalTextCells, totalTextFields: summary.totalTextFields, unmatchedTranscribedFields: summary.unmatchedTranscribedFields, textGroundTruthAvailable: summary.textGroundTruthAvailable, splitCounts: summary.splitCounts }, null, 2));
