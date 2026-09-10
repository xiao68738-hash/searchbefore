import fs from "node:fs";
import path from "node:path";

const [inputArg] = process.argv.slice(2);
if (!inputArg) throw new Error("Usage: node scripts/analyze-naf-annotations.mjs <NAF dataset metadata directory>");

const root = path.resolve(inputArg);
const privateRoot = path.resolve("D:/SearchBefore/private");
if (root !== privateRoot && !root.toLowerCase().startsWith(`${privateRoot.toLowerCase()}${path.sep}`)) {
  throw new Error(`NAF metadata must be read from ${privateRoot}`);
}

function collectJson(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJson(fullPath, output);
    else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("template")) output.push(fullPath);
  }
  return output;
}

const files = collectJson(path.join(root, "groups"));
const countsByType = {};
const countsByContent = { text: 0, handwriting: 0, printOrStamp: 0, blank: 0, signature: 0, unspecified: 0 };
const documents = [];

for (const file of files) {
  let annotation;
  try {
    annotation = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(annotation.fieldBBs) && !Array.isArray(annotation.textBBs)) continue;
  const boxes = [...(annotation.fieldBBs || []), ...(annotation.textBBs || [])];
  const types = new Set();
  let handwriting = 0;
  let rows = 0;
  let columns = 0;
  let regions = 0;

  for (const box of boxes) {
    const type = String(box.type || "unknown");
    countsByType[type] = (countsByType[type] || 0) + 1;
    types.add(type);
    if (type === "fieldRow") rows++;
    if (type === "fieldCol") columns++;
    if (type === "fieldRegion") regions++;
    const contentKey = ({ 0: "text", 1: "handwriting", 2: "printOrStamp", 3: "blank", 4: "signature" })[box.isBlank];
    if (contentKey) {
      countsByContent[contentKey]++;
      if (contentKey === "handwriting") handwriting++;
    } else countsByContent.unspecified++;
  }

  documents.push({
    hasHandwriting: handwriting > 0,
    hasRows: rows > 0,
    hasColumns: columns > 0,
    hasMultipleRegions: regions > 1,
    hasTableAndHandwriting: handwriting > 0 && (rows > 0 || columns > 0),
    pairCount: Array.isArray(annotation.pairs) ? annotation.pairs.length : 0,
    types
  });
}

const summary = {
  schemaVersion: 1,
  dataset: "NAF Dataset metadata",
  documentCount: documents.length,
  documentsWithHandwriting: documents.filter(item => item.hasHandwriting).length,
  documentsWithRows: documents.filter(item => item.hasRows).length,
  documentsWithColumns: documents.filter(item => item.hasColumns).length,
  documentsWithTableAndHandwriting: documents.filter(item => item.hasTableAndHandwriting).length,
  documentsWithMultipleRegions: documents.filter(item => item.hasMultipleRegions).length,
  relationshipCount: documents.reduce((total, item) => total + item.pairCount, 0),
  countsByType: Object.fromEntries(Object.entries(countsByType).sort(([a], [b]) => a.localeCompare(b))),
  countsByContent
};

console.log(JSON.stringify(summary, null, 2));
