import fs from "node:fs";
import path from "node:path";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  throw new Error("Usage: node scripts/select-private-ocr-variants.mjs <variant OCR dir> <private selected dir>");
}

const inputDir = path.resolve(inputArg);
const outputDir = path.resolve(outputArg);
const privateRoot = path.resolve("D:/SearchBefore/private");
if (outputDir !== privateRoot && !outputDir.toLowerCase().startsWith(`${privateRoot.toLowerCase()}${path.sep}`)) {
  throw new Error(`Selected OCR may contain personal data; output must stay under ${privateRoot}`);
}
fs.mkdirSync(outputDir, { recursive: true });

const keywords = [
  "紀錄", "記錄", "查核", "檢查", "管理", "作業", "農場", "農產品", "產銷履歷",
  "日期", "資材", "肥料", "農藥", "設備", "機械", "採收", "包裝", "姓名", "簽章", "表"
];

function score(payload) {
  const text = String(payload.text || "");
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const usefulCount = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  const keywordHits = keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);
  const lineCount = Array.isArray(payload.lines) ? payload.lines.length : 0;
  return cjkCount * 3 + usefulCount + keywordHits * 40 + Math.min(lineCount, 40) * 2;
}

const groups = new Map();
for (const filename of fs.readdirSync(inputDir).filter(name => name.endsWith(".windows-ocr.json"))) {
  const match = filename.match(/^(.*)-rot(0|90|180|270)\.windows-ocr\.json$/);
  if (!match) continue;
  const payload = JSON.parse(fs.readFileSync(path.join(inputDir, filename), "utf8"));
  const candidate = { filename, rotation: Number(match[2]), payload, score: score(payload) };
  const current = groups.get(match[1]);
  if (!current || candidate.score > current.score) groups.set(match[1], candidate);
}

const selections = [];
for (const [panel, selected] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const outputName = `${panel}.windows-ocr.json`;
  const payload = {
    ...selected.payload,
    sourceImage: `${panel}.jpg`,
    selectedRotation: selected.rotation,
    selectionScore: selected.score
  };
  fs.writeFileSync(path.join(outputDir, outputName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  selections.push({
    panel,
    rotation: selected.rotation,
    lineCount: selected.payload.lines?.length || 0,
    charCount: selected.payload.text?.length || 0,
    score: selected.score
  });
}

const summary = {
  schemaVersion: 1,
  panelCount: selections.length,
  rotationCounts: Object.fromEntries(
    [0, 90, 180, 270].map(rotation => [rotation, selections.filter(item => item.rotation === rotation).length])
  ),
  emptyTextCount: selections.filter(item => item.charCount === 0).length,
  selections
};
fs.writeFileSync(path.join(outputDir, "selection-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  panelCount: summary.panelCount,
  rotationCounts: summary.rotationCounts,
  emptyTextCount: summary.emptyTextCount
}));
