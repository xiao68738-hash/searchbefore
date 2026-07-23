import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES_FILE = path.join(DIR, "登記但不得檢出-候選.json");
const MRL_FILE = path.join(DIR, "latest.json");
const OUTPUT_FILE = path.join(DIR, "登記但不得檢出-複核工作簿.md");

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const text = value => String(value ?? "").trim();
const key = value => text(value).replace(/\s+/g, " ").toLocaleUpperCase("en-US");
const markdownCell = value => text(value)
  .replace(/\\/g, "\\\\")
  .replace(/\|/g, "\\|")
  .replace(/\r?\n/g, "<br>");

function parseCandidateComponents(candidate) {
  const parts = text(candidate["成分判定"]).split(/\s+\|\s+/);
  const components = [];

  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator < 1) throw new Error(`無法解析成分判定：${part}`);

    const component = text(part.slice(0, separator));
    const judgement = text(part.slice(separator + 1));
    if (!judgement.startsWith("不得檢出候選")) continue;

    // 既有候選資料若經殘留物對照總表轉名，使用箭頭後的法規名稱查原文。
    const mapped = judgement.match(/→(.+?)\);標準/);
    components.push({
      component,
      lookupName: mapped ? text(mapped[1]) : component,
      judgement
    });
  }

  if (!components.length) {
    throw new Error(`候選「${candidate["作物"]}／${candidate["藥劑"]}」沒有不得檢出候選成分`);
  }
  return components;
}

const candidateData = readJson(CANDIDATES_FILE);
const mrlData = readJson(MRL_FILE);
const candidates = candidateData.candidates;
const mrlRows = mrlData.rows;

if (!Array.isArray(candidates)) throw new Error("候選 JSON 缺少 candidates 陣列");
if (!Array.isArray(mrlRows)) throw new Error("latest.json 缺少 rows 陣列");

const mrlByName = new Map();
for (const row of mrlRows) {
  for (const name of [row["國際普通名稱"], row["普通名稱"]]) {
    const normalized = key(name);
    if (!normalized) continue;
    if (!mrlByName.has(normalized)) mrlByName.set(normalized, []);
    const rows = mrlByName.get(normalized);
    if (!rows.includes(row)) rows.push(row);
  }
}

const grouped = new Map();
let reviewItemCount = 0;
for (const [index, candidate] of candidates.entries()) {
  const crop = text(candidate["作物"]);
  const agent = text(candidate["藥劑"]);
  if (!crop || !agent) throw new Error(`第 ${index + 1} 筆候選缺少作物或藥劑`);

  const components = parseCandidateComponents(candidate).map(component => {
    const rows = mrlByName.get(key(component.lookupName)) || [];
    if (!rows.length) {
      throw new Error(`查無「${component.lookupName}」的殘留標準原文（${crop}／${agent}）`);
    }
    return { ...component, rows };
  });

  reviewItemCount += components.length;
  if (!grouped.has(crop)) grouped.set(crop, []);
  grouped.get(crop).push({ number: index + 1, candidate, components });
}

if (reviewItemCount !== candidates.length) {
  throw new Error(`候選共 ${candidates.length} 筆，但需複核成分共 ${reviewItemCount} 筆`);
}

const lines = [];
lines.push("# 登記但不得檢出候選—複核工作簿");
lines.push("");
lines.push("> 本文件僅供人工複核，內容不是「不得檢出」的最終判定，也不得直接寫入 App。請逐筆對照證據並標記結果。");
lines.push("");
lines.push(`- 候選來源：\`登記但不得檢出-候選.json\`（產生時間：${text(candidateData.generatedAt) || "未記錄"}）`);
lines.push(`- 殘留標準來源：\`latest.json\`（快照：${text(mrlData.snapshotId) || "未記錄"}；擷取時間：${text(mrlData.retrievedAt) || "未記錄"}）`);
lines.push(`- 複核數量：${candidates.length} 筆候選，${grouped.size} 個作物分組`);
lines.push("");

for (const [crop, entries] of grouped) {
  lines.push(`## ${crop}（${entries.length} 筆）`);
  lines.push("");

  for (const entry of entries) {
    const candidate = entry.candidate;
    lines.push(`### ${entry.number}. ${text(candidate["藥劑"])}`);
    lines.push("");
    lines.push(`- 作物歸類：${text(candidate["作物歸類"]) || "未記錄"}`);
    lines.push(`- 防治對象數：${text(candidate["防治對象數"]) || "未記錄"}`);
    lines.push(`- 原候選判定：${text(candidate["成分判定"])}`);
    lines.push("- 人工複核：☐ 確認　☐ 誤判　☐ 存疑");
    lines.push("- 複核註記：");
    lines.push("");

    for (const component of entry.components) {
      const mapping = key(component.component) === key(component.lookupName)
        ? ""
        : `（依既有對照查「${component.lookupName}」）`;
      lines.push(`#### 成分：${component.component}${mapping}`);
      lines.push("");
      lines.push(`標準原文共 ${component.rows.length} 列：`);
      lines.push("");
      lines.push("| 國際普通名稱 | 普通名稱 | 作物類別 | 容許量 ppm | 備註 |");
      lines.push("|---|---|---|---:|---|");
      for (const row of component.rows) {
        lines.push(`| ${markdownCell(row["國際普通名稱"])} | ${markdownCell(row["普通名稱"])} | ${markdownCell(row["作物類別"])} | ${markdownCell(row["容許量ppm"])} | ${markdownCell(row["備註"])} |`);
      }
      lines.push("");
    }
  }
}

fs.writeFileSync(OUTPUT_FILE, lines.join("\n") + "\n", "utf8");
console.log(`已產生 ${path.basename(OUTPUT_FILE)}：${candidates.length} 筆候選、${grouped.size} 個作物分組、${reviewItemCount} 個待複核成分`);
