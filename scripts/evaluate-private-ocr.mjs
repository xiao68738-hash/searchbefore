import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OCR = require("../form-ocr.js");

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  throw new Error("用法：node scripts/evaluate-private-ocr.mjs <Windows OCR 輸出目錄> <private 評估輸出目錄>");
}

const inputDir = path.resolve(inputArg);
const outputDir = path.resolve(outputArg);
const privateRoot = path.resolve("D:/SearchBefore/private");
if (!outputDir.toLowerCase().startsWith(privateRoot.toLowerCase() + path.sep.toLowerCase())) {
  throw new Error(`OCR 原文與草稿可能含個資，輸出必須位於 ${privateRoot}`);
}
fs.mkdirSync(outputDir, { recursive: true });

function blockFromLine(line, lineIndex, width = 1680, height = 2370) {
  const words = Array.isArray(line.words) ? line.words : [];
  const boxes = words.map(word => word.box).filter(Boolean);
  const left = boxes.length ? Math.min(...boxes.map(box => box.x)) / width : 0;
  const top = boxes.length ? Math.min(...boxes.map(box => box.y)) / height : lineIndex / 100;
  const right = boxes.length ? Math.max(...boxes.map(box => box.x + box.width)) / width : 1;
  const bottom = boxes.length ? Math.max(...boxes.map(box => box.y + box.height)) / height : top + 0.01;
  return {
    id: `line-${lineIndex + 1}`,
    text: String(line.text || "").slice(0, 2000),
    confidence: 0.5,
    box: { left, top, right, bottom },
    source: { pageIndex: 0, blockIndex: lineIndex, paragraphIndex: 0 },
    words: words.slice(0, 200).map((word, wordIndex) => ({
      id: `line-${lineIndex + 1}-word-${wordIndex + 1}`,
      text: String(word.text || "").slice(0, 200),
      confidence: 0.5,
      box: {
        left: word.box.x / width,
        top: word.box.y / height,
        right: (word.box.x + word.box.width) / width,
        bottom: (word.box.y + word.box.height) / height
      }
    }))
  };
}

const summaries = [];
const files = fs.readdirSync(inputDir).filter(name => name.endsWith(".windows-ocr.json")).sort();
for (const name of files) {
  const source = JSON.parse(fs.readFileSync(path.join(inputDir, name), "utf8"));
  const blocks = (source.lines || []).map((line, index) => blockFromLine(line, index));
  const scanResult = {
    type: "PQC_OCR_SCAN_RESULT",
    protocolVersion: 1,
    requestId: `private-eval-${path.basename(name, ".windows-ocr.json")}`,
    source: "android-on-device-ocr",
    quality: {
      width: 1680,
      height: 2370,
      cornersDetected: false,
      cornersConfirmedByUser: true,
      blurScore: 1,
      glareScore: 0
    },
    blocks,
    sourceImage: { id: path.basename(name, ".windows-ocr.json"), order: 0, name: source.sourceImage }
  };
  const draft = OCR.createDraft(scanResult, {}, scanResult.sourceImage);
  const privateResult = {
    schemaVersion: 1,
    sourceImage: source.sourceImage,
    ocr: source,
    scanResult,
    draft
  };
  const target = path.join(outputDir, path.basename(name, ".windows-ocr.json") + ".evaluation.json");
  fs.writeFileSync(target, `${JSON.stringify(privateResult, null, 2)}\n`, "utf8");
  summaries.push({
    sourceImage: source.sourceImage,
    lineCount: source.lines?.length || 0,
    charCount: source.text?.length || 0,
    textAngle: source.textAngle,
    routeStatus: draft.routeDecision.status,
    routeType: draft.routeDecision.type || null,
    route: draft.route.route,
    recordGroupCount: draft.recordGroups?.length || 0,
    activityCount: draft.activities?.length || 0,
    candidateCounts: Object.fromEntries(Object.entries(draft.fields || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])),
    output: path.basename(target)
  });
}

const summary = { schemaVersion: 1, generatedAt: new Date().toISOString(), files: summaries };
fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
