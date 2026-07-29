import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(here, "登記但不得檢出-候選.json");
const outputPath = path.join(here, "登記但不得檢出-複核工作表_第1-95筆.md");

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const candidates = data.candidates || [];

if (candidates.length !== 95) {
  throw new Error(`預期95筆候選，實際為${candidates.length}筆`);
}

const escapeTable = value =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");

const statusCounts = new Map();
const verdictCounts = new Map();
for (const candidate of candidates) {
  const review = candidate["複核"] || {};
  statusCounts.set(review["狀態"], (statusCounts.get(review["狀態"]) || 0) + 1);
  verdictCounts.set(review["判定"], (verdictCounts.get(review["判定"]) || 0) + 1);
}

const lines = [
  "# 「登記但不得檢出」複核工作表（第 1–95 筆）",
  "",
  "> 本檔為第 1–95 筆的單一、連續版本，取代舊有分段工作表。內容屬後端研究與人工複核資料，不得直接顯示於 App。",
  "> 只有「判定＝確認」且「狀態＝檢核完成」者，才可進入後端白名單；其他結果一律維持封鎖。",
  "",
  "## 整體進度",
  "",
  `- 總筆數：${candidates.length}`,
  `- 狀態：${[...statusCounts].map(([key, value]) => `${key} ${value}`).join("｜")}`,
  `- 判定：${[...verdictCounts].map(([key, value]) => `${key} ${value}`).join("｜")}`,
  "- 詳細稽核與尚缺資料：`人工複核稽核報告_第1-95筆.md`",
  "- 後端可用白名單：`複核-已確認登記但不得檢出名單.csv`",
  "",
  "## 逐筆總表",
  "",
  "| 筆次 | 作物 | 藥劑 | 判定 | 狀態 |",
  "|---:|---|---|---|---|"
];

candidates.forEach((candidate, index) => {
  const review = candidate["複核"] || {};
  lines.push(
    `| ${index + 1} | ${escapeTable(candidate["作物"])} | ${escapeTable(candidate["藥劑"])} | ${escapeTable(review["判定"])} | ${escapeTable(review["狀態"])} |`
  );
});

lines.push("", "## 逐筆複核內容", "");

candidates.forEach((candidate, index) => {
  const review = candidate["複核"] || {};
  lines.push(
    `### 第 ${index + 1} 筆｜${candidate["作物"]} × ${candidate["藥劑"]}`,
    "",
    `- 防治對象數：${candidate["防治對象數"] ?? ""}`,
    `- 作物歸類：${candidate["作物歸類"] || ""}`,
    `- 原始成分判定：${candidate["成分判定"] || ""}`,
    `- 複核判定：${review["判定"] || ""}`,
    `- 複核狀態：${review["狀態"] || ""}`,
    `- 複核依據：${review["依據"] || ""}`,
    `- 複核日期：${review["複核日"] || ""}`,
    `- 資料來源：${review["來源"] || ""}`,
    ""
  );
});

fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`已產生 ${path.basename(outputPath)}（${candidates.length}筆）`);
