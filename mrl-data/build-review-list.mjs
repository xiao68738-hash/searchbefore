/* 產出 MRL「尚未解析／需人工確認」清單。
   只做資料對照稽核，不產生使用者可見的合法性或採收判定。
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEnglishSet,
  buildPesticideNameIndex,
  canonicalEnglish,
  classifyComponents,
  parseCropCategoryMembers,
  resolvePesticideName,
  text
} from "./lib.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");

function loadJson(...names) {
  const file = names.map(name => path.join(DIR, name)).find(fs.existsSync);
  if (!file) throw new Error(`缺少 ${names.join(" 或 ")}，請先執行下載腳本`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function extractAppData(html) {
  const start = html.indexOf("const DATA=");
  if (start === -1) throw new Error("index.html 找不到 const DATA=");
  const firstBrace = html.indexOf("{", start);
  let depth = 0, end = -1, quoted = false, escaped = false;
  for (let index = firstBrace; index < html.length; index++) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) { end = index; break; }
  }
  if (end === -1) throw new Error("index.html 的 DATA 結構不完整");
  return JSON.parse(html.slice(firstBrace, end + 1));
}

const mrl = loadJson("latest.json", "mrl-latest.json");
const pesticideMaster = loadJson("pesticides-latest.json");
const cropCategories = loadJson("crop-categories-latest.json");
const exempt = loadJson("mrl-exempt-latest.json");
const DATA = extractAppData(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));

const agentUse = new Map();
for (const crop of Object.keys(DATA)) {
  for (const pest of Object.keys(DATA[crop])) {
    for (const agent of DATA[crop][pest]) {
      const name = text(agent.name);
      agentUse.set(name, (agentUse.get(name) || 0) + 1);
    }
  }
}

const appAgents = [...agentUse.keys()].sort((a, b) => agentUse.get(b) - agentUse.get(a));
const pesticideIndex = buildPesticideNameIndex(pesticideMaster.rows);
const mrlEnglish = buildEnglishSet(mrl.rows, ["國際普通名稱"]);
const exemptEnglish = buildEnglishSet(exempt.rows, ["英文名稱", "English name"]);

const resolutions = appAgents.map(name => {
  const resolution = resolvePesticideName(name, pesticideIndex);
  const componentStatus = classifyComponents(resolution.components, mrlEnglish, exemptEnglish);
  return { name, uses: agentUse.get(name), ...resolution, componentStatus };
});

const resolved = resolutions.filter(item => item.status === "resolved");
const ambiguous = resolutions.filter(item => item.status === "ambiguous");
const unresolved = resolutions.filter(item => item.status === "unresolved");
const unresolvedComponents = resolved.filter(item => item.componentStatus.some(part => part.status === "unresolved"));

const statusSummary = { "mrl-listed": 0, exempt: 0, unresolved: 0 };
for (const item of resolved) for (const part of item.componentStatus) statusSummary[part.status]++;

const mrlChineseNames = [...new Set(mrl.rows.map(row => text(row["普通名稱"])).filter(Boolean))];
const garbledNames = mrlChineseNames.filter(name => name.includes("?"));
const garbledRows = mrl.rows.filter(row =>
  [row["普通名稱"], row["作物類別"], row["備註"]].some(value => text(value).includes("?"))
);

const categoryMembership = new Map();
for (const row of cropCategories.rows) {
  const category = text(row["類別"] ?? row.category);
  const members = parseCropCategoryMembers(row["農作物類農產品"] ?? row.products);
  for (const member of members) {
    if (!categoryMembership.has(member)) categoryMembership.set(member, new Set());
    categoryMembership.get(member).add(category);
  }
}

const mrlCropSet = new Set(mrl.rows.map(row => text(row["作物類別"])).filter(Boolean));
const appCrops = Object.keys(DATA);
const exactMrlCrops = appCrops.filter(crop => mrlCropSet.has(crop));
const categoryMemberCrops = appCrops.filter(crop => !mrlCropSet.has(crop) && categoryMembership.has(crop));
const unresolvedCrops = appCrops.filter(crop => !mrlCropSet.has(crop) && !categoryMembership.has(crop));
const catchAllCrops = [...mrlCropSet].filter(crop => /^其他/.test(crop) || crop.includes("*")).sort();

const md = [];
md.push("# MRL 對照：階段 0 稽核報告");
md.push("");
md.push(`產出時間：${new Date().toISOString()}`);
md.push(`MRL 快照：${mrl.snapshotId || mrl.version || mrl.retrievedAt}（${mrl.count} 筆）`);
md.push(`農藥許可證參考：${pesticideMaster.snapshotId}（${pesticideMaster.count} 筆）`);
md.push(`官方作物分類：${cropCategories.snapshotId}（${cropCategories.count} 筆）`);
md.push(`免訂容許量清單：${exempt.snapshotId}（${exempt.count} 筆）`);
md.push("");
md.push("> 本報告只說明資料能否可靠對照，不是合法性、是否可採收或是否不得檢出的判定結果。");
md.push("> 任何「尚未解析」均不得轉成綠色安全標示，也不得自動解讀為「不得檢出」。");
md.push("");

md.push("## 1. 對照摘要");
md.push("");
md.push(`- App 農藥普通名稱：**${appAgents.length}** 種`);
md.push(`- 經官方許可證名稱找到唯一有效成分組合：**${resolved.length}** 種`);
md.push(`- 同名但存在多組成分，必須人工確認：**${ambiguous.length}** 種`);
md.push(`- 官方許可證名稱仍查無：**${unresolved.length}** 種`);
md.push(`- 已解析成分中，MRL 有列：**${statusSummary["mrl-listed"]}**；免訂容許量：**${statusSummary.exempt}**；仍未解析：**${statusSummary.unresolved}**`);
for (const warning of pesticideMaster.warnings || []) md.push(`- ⚠ ${warning}`);
md.push("");

md.push("## 2. 同名但成分組合不一致（必須人工確認）");
md.push("");
if (!ambiguous.length) md.push("（無）");
else {
  md.push("| App 名稱 | 使用筆數 | 官方資料中的成分組合 |");
  md.push("|---|---:|---|");
  for (const item of ambiguous) md.push(`| ${item.name} | ${item.uses} | ${item.variants.join("<br>")} |`);
}
md.push("");

md.push("## 3. 尚未在官方許可證名稱找到");
md.push("");
md.push("完整名單同時輸出至 `待人工確認.csv` 與 `待人工確認.json`，不再只顯示前 40 筆。");
md.push("");
if (!unresolved.length) md.push("（無）");
else {
  md.push("| App 名稱 | 使用筆數 | 狀態 |");
  md.push("|---|---:|---|");
  for (const item of unresolved) md.push(`| ${item.name} | ${item.uses} | 尚未解析（不可推論法規狀態） |`);
}
md.push("");

md.push("## 4. 已找到農藥名稱，但部分英文成分仍無法對到 MRL／免訂清單");
md.push("");
if (!unresolvedComponents.length) md.push("（無）");
else {
  md.push("| App 名稱 | 使用筆數 | 官方英文成分 | 尚未解析成分 |");
  md.push("|---|---:|---|---|");
  for (const item of unresolvedComponents) {
    const missing = item.componentStatus.filter(part => part.status === "unresolved").map(part => part.component);
    md.push(`| ${item.name} | ${item.uses} | ${item.components.join(" + ")} | ${missing.join(" + ")} |`);
  }
}
md.push("");

md.push("## 5. 作物名稱稽核");
md.push("");
md.push(`- App 作物：**${appCrops.length}** 種`);
md.push(`- 與 MRL 作物欄位完全同名：**${exactMrlCrops.length}** 種`);
md.push(`- 可在官方作物分類表找到完全同名成員：**${categoryMemberCrops.length}** 種`);
md.push(`- 仍需人工分類／可能非食用作物：**${unresolvedCrops.length}** 種`);
md.push(`- MRL 中「其他⋯類」或星號通用列：**${catchAllCrops.length}** 種`);
md.push("");
md.push("即使作物沒有完全同名列，也必須先檢查官方分類及可能適用的通用列，不能直接判定為未訂容許量。");
md.push("");
md.push("<details><summary>仍需人工分類的作物</summary>");
md.push("");
md.push(unresolvedCrops.join("、") || "（無）");
md.push("");
md.push("</details>");
md.push("");
md.push("<details><summary>MRL 通用／其他類別列</summary>");
md.push("");
for (const crop of catchAllCrops) md.push(`- ${crop}`);
md.push("");
md.push("</details>");
md.push("");

md.push("## 6. 官方 MRL 資料品質");
md.push("");
md.push(`- 含問號亂碼的中文農藥名稱：**${garbledNames.length}** 種`);
md.push(`- 農藥名稱、作物或備註任一欄含問號的資料列：**${garbledRows.length}** 筆`);
md.push("- 對照時以官方英文普通名稱為主要鍵；中文缺字萬用比對只保留作為人工稽核提示。");
md.push("");

md.push("## 7. 下一階段才能實作的判斷順序");
md.push("");
md.push("1. 許可證名稱 → 個別英文有效成分。");
md.push("2. 特定作物完全相符。");
md.push("3. 官方作物分類相符。");
md.push("4. 檢查「其他蔬果類／穀類」等通用列。");
md.push("5. 檢查免訂容許量清單。");
md.push("6. 仍有歧義時只顯示「無法確認」，不得顯示安全或違規結論。");

const reviewRows = [
  ...ambiguous.map(item => ({
    type: "農藥名稱多組成分",
    appName: item.name,
    uses: item.uses,
    detail: item.variants.join(" | ")
  })),
  ...unresolved.map(item => ({
    type: "官方許可證名稱查無",
    appName: item.name,
    uses: item.uses,
    detail: "尚未解析，不可推論法規狀態"
  })),
  ...unresolvedComponents.map(item => ({
    type: "英文有效成分未對到",
    appName: item.name,
    uses: item.uses,
    detail: item.componentStatus.filter(part => part.status === "unresolved").map(part => part.component).join(" + ")
  })),
  ...unresolvedCrops.map(crop => ({
    type: "作物尚未分類",
    appName: crop,
    uses: "",
    detail: "可能需對到官方分類，或屬非食用／非作物項目"
  }))
];

const csvCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
const csv = [
  ["類型", "App 名稱", "使用筆數", "詳細資料"].map(csvCell).join(","),
  ...reviewRows.map(row => [row.type, row.appName, row.uses, row.detail].map(csvCell).join(","))
].join("\r\n");

fs.writeFileSync(path.join(DIR, "待人工確認.md"), md.join("\n"), "utf8");
fs.writeFileSync(path.join(DIR, "待人工確認.csv"), "\uFEFF" + csv, "utf8");
fs.writeFileSync(path.join(DIR, "待人工確認.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceSnapshots: {
    mrl: mrl.snapshotId || mrl.version,
    pesticides: pesticideMaster.snapshotId,
    cropCategories: cropCategories.snapshotId,
    exempt: exempt.snapshotId
  },
  rows: reviewRows
}, null, 2), "utf8");

console.log("已產出 待人工確認.md / .csv / .json");
console.log(`農藥：已解析 ${resolved.length}｜多組成分 ${ambiguous.length}｜名稱查無 ${unresolved.length}｜成分未對到 ${unresolvedComponents.length}`);
console.log(`作物：MRL 同名 ${exactMrlCrops.length}｜分類成員 ${categoryMemberCrops.length}｜尚未分類 ${unresolvedCrops.length}`);
