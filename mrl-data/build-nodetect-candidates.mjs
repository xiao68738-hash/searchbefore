/* 產出「登記使用但查無殘留容許量(不得檢出候選)」的人工複核清單。

   ── 這份清單是什麼 ──
   對 App 內每個登記的(作物 × 藥劑),判斷其有效成分在《農藥殘留容許量標準》
   對該作物是否訂有容許量。若成分「在標準內有列,但特定作物、所屬官方分類、
   可能適用的通用列都查無」,即為「不得檢出候選」——農友合法買得到、能噴,
   但殘留驗出即違規,是最需要警示的組合。

   ── 安全原則(不可退讓)──
   1. 寧可漏列、不可誤列:任何看不準的組合一律歸入「無法判定」,
      不判安全、也不判不得檢出。
   2. 「其他⋯類」與星號通用列可能涵蓋 → 降級為「需確認通用列」,不列候選。
   3. 成分完全不在標準內且非免訂 → 「查無對應」(法規狀態未定,
      已去函食藥署詢問,見 詢問函-食藥署.txt 問題五),不列候選。
   4. 本清單僅供人工複核,未經逐筆確認不得直接餵給 App 顯示。

   ── 判定順序(同 待人工確認.md §7)──
   藥名→英文成分 → 特定作物同名 → 官方作物分類 → 通用列 → 免訂 → 無法確認 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPesticideNameIndex, canonicalEnglish, parseCropCategoryMembers,
  resolvePesticideName, text
} from "./lib.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const readFirst = (...names) => {
  const file = names.map(n => path.join(DIR, n)).find(fs.existsSync);
  if (!file) throw new Error(`缺少 ${names.join(" 或 ")}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

/* ── 載入 ── */
const mrl = readFirst("latest.json", "mrl-latest.json");
const pesticides = read("pesticides-latest.json");
const cropCategories = read("crop-categories-latest.json");
const exempt = read("mrl-exempt-latest.json");
const master = read("殘留物對照總表.json"); // 疑難藥名的人工/法規解析結果

function extractAppData(html) {
  const start = html.indexOf("const DATA=");
  if (start === -1) throw new Error("index.html 找不到 const DATA=");
  const firstBrace = html.indexOf("{", start);
  let depth = 0, end = -1, quoted = false, escaped = false;
  for (let i = firstBrace; i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { end = i; break; }
  }
  return JSON.parse(html.slice(firstBrace, end + 1));
}
const DATA = extractAppData(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));

/* ── 索引 ── */
const pesticideIndex = buildPesticideNameIndex(pesticides.rows);

/* MRL 依英文名與中文名分組;通用列另記 */
const mrlByEn = new Map(); // canonical 國際普通名稱 → rows
const mrlByZh = new Map(); // 普通名稱 → rows
for (const row of mrl.rows) {
  const en = canonicalEnglish(row["國際普通名稱"]);
  const zh = text(row["普通名稱"]);
  if (en) { if (!mrlByEn.has(en)) mrlByEn.set(en, []); mrlByEn.get(en).push(row); }
  if (zh) { if (!mrlByZh.has(zh)) mrlByZh.set(zh, []); mrlByZh.get(zh).push(row); }
}
const isCatchAll = cat => /^其他/.test(cat) || cat.includes("*");

/* 免訂成分(英文 canonical) */
const exemptEn = new Set();
for (const row of exempt.rows) {
  for (const f of ["英文名稱", "English name"]) {
    const v = canonicalEnglish(row[f]);
    if (v) exemptEn.add(v);
  }
}

/* 疑難藥名 → 對照總表(層級 1-3 才可信) */
const masterByName = new Map(master.rows.map(r => [r.appName, r]));

/* 作物 → 官方分類:用 作物分類對照.json(#8 的精緻版,含排除式解析與人工層級)
   - 直接命中/名稱對應/分組對應:採用其 category
   - 跨類別(豆類):兩類都當涵蓋鍵——任一類有容許量即不列候選(寧可漏列)
   - 非農產品/觀賞花卉:非食用,MRL 不適用 → 單獨排除
   - 需人工:無法判定 → 排除 */
const cropMapping = read("作物分類對照.json");
const cropCats = new Map();      // crop → Set(categories)
const nonFoodCrops = new Set();  // 非食用
const manualCrops = new Set();   // 需人工
for (const r of cropMapping.rows) {
  if (r.tier === "非農產品" || r.tier === "觀賞花卉") { nonFoodCrops.add(r.crop); continue; }
  if (r.tier === "需人工") { manualCrops.add(r.crop); continue; }
  const cats = String(r.category || "").split("/").map(s => s.trim()).filter(Boolean);
  if (cats.length) cropCats.set(r.crop, new Set(cats));
}
/* 保底:官方分類表的原始成員解析,補精緻版沒涵蓋到的 */
for (const row of cropCategories.rows) {
  const cat = text(row["類別"] ?? row.category);
  for (const m of parseCropCategoryMembers(row["農作物類農產品"] ?? row.products)) {
    if (nonFoodCrops.has(m) || manualCrops.has(m)) continue;
    if (!cropCats.has(m)) cropCats.set(m, new Set());
    cropCats.get(m).add(cat);
  }
}
const mrlCropSet = new Set(mrl.rows.map(r => text(r["作物類別"])).filter(Boolean));

/* ── 單一成分 × 單一作物的判定 ──
   回傳 {cls, why}
   cls: 有容許量 | 免訂 | 通用列待確認 | 不得檢出候選 | 查無對應 | 尚未解析 */
/* App 作物名與標準作物名的已證實同物異名(逐一對標準查證過才收錄;
   異體字或官方改名,兩邊指同一作物,可直接視為涵蓋)。 */
const CROP_ALIAS = {
  "檬果": ["芒果"],
  "木虌果": ["木鱉果"],
  "紅龍果": ["火龍果"],
  "獼猴桃": ["奇異果"],
  "菠蘿蜜": ["波羅蜜"],
  "蔥": ["青蔥"]
};

/* 標準的作物欄同一群組有「米」「米類」兩種寫法,涵蓋比對須做「類」字尾雙向正規化,
   否則會把實際有容許量的組合誤判成不得檢出(抽驗時在 水稻×丁基賽伏草 實際踩到)。 */
function coversCrop(rowCat, crop, cats, aliases) {
  if (rowCat === crop || cats.has(rowCat) || aliases.includes(rowCat)) return true;
  if (cats.has(rowCat + "類") || rowCat + "類" === crop) return true;
  if (rowCat.endsWith("類")) {
    const bare = rowCat.slice(0, -1);
    if (bare === crop || cats.has(bare)) return true;
  }
  return false;
}
/* 近似而未證實的名稱(如 韭⊂韭菜):不可直接視為涵蓋,也不可判不得檢出 → 待確認 */
function nearName(rowCat, crop) {
  return rowCat !== crop && (rowCat.includes(crop) || crop.includes(rowCat));
}
function judgeKeyOnCrop(rows, crop, cats) {
  const aliases = CROP_ALIAS[crop] || [];
  const covered = rows.filter(r => coversCrop(text(r["作物類別"]), crop, cats, aliases));
  if (covered.length) {
    const hit = covered[0];
    return { cls: "有容許量", why: `${text(hit["作物類別"])} ${text(hit["容許量ppm"])}ppm` };
  }
  const near = rows.filter(r => nearName(text(r["作物類別"]), crop));
  if (near.length) {
    return { cls: "近似作物名待確認", why: `標準有近似名:${[...new Set(near.map(r => text(r["作物類別"])))].slice(0, 5).join("、")}` };
  }
  const generic = rows.filter(r => isCatchAll(text(r["作物類別"])));
  if (generic.length) {
    return { cls: "通用列待確認", why: `標準有通用列:${[...new Set(generic.map(r => text(r["作物類別"])))].join("、")}` };
  }
  return { cls: "不得檢出候選", why: `標準有此成分(${rows.length} 列),但本作物/分類/通用列皆查無` };
}

function judgeComponent(en, agentName, crop, cats) {
  if (exemptEn.has(en)) return { cls: "免訂", why: "列於免訂容許量清單" };
  if (mrlByEn.has(en)) return judgeKeyOnCrop(mrlByEn.get(en), crop, cats);

  /* 英文直接對不到 → 查對照總表(針對整支藥名的解析) */
  const m = masterByName.get(agentName);
  if (m && m.level <= 3) {
    if (m.tier === "免訂容許量") return { cls: "免訂", why: `對照總表:${m.basis}` };
    const rows = mrlByZh.get(m.target) || mrlByEn.get(canonicalEnglish(m.target));
    if (rows) {
      const r = judgeKeyOnCrop(rows, crop, cats);
      r.why = `經對照總表(${m.tier}→${m.target})${r.why ? ";" + r.why : ""}`;
      return r;
    }
  }
  if (!exemptEn.has(en) && !mrlByEn.has(en)) return { cls: "查無對應", why: "標準與免訂清單皆無此成分(法規狀態未定,已去函食藥署)" };
  return { cls: "尚未解析", why: "" };
}

/* ── 主迴圈:彙整到 (作物×藥劑) ── */
const combos = new Map(); // crop|agent → {crop, agent, pests:Set}
for (const crop of Object.keys(DATA)) {
  for (const pest of Object.keys(DATA[crop])) {
    for (const a of DATA[crop][pest]) {
      const name = text(a.name);
      if (!name) continue;
      const key = crop + "|" + name;
      if (!combos.has(key)) combos.set(key, { crop, agent: name, pests: new Set() });
      combos.get(key).pests.add(pest);
    }
  }
}

const stats = { 總組合: combos.size, 非食用作物: 0, 作物未歸類: 0, 藥名未解析: 0, 全部有容許量或免訂: 0, 含近似作物名待確認: 0, 含通用列待確認: 0, 含查無對應: 0, 不得檢出候選: 0 };
const candidates = [];
const genericReview = [];

for (const { crop, agent, pests } of combos.values()) {
  /* 作物可用的涵蓋鍵:自身名 + 官方分類;非食用不適用;兩者皆無 → 無法判定 */
  if (nonFoodCrops.has(crop)) { stats.非食用作物++; continue; }
  const cats = cropCats.get(crop) || new Set();
  if (!mrlCropSet.has(crop) && cats.size === 0) { stats.作物未歸類++; continue; }

  const res = resolvePesticideName(agent, pesticideIndex);
  let componentJudgements;
  if (res.status !== "resolved") {
    /* 藥名解析不了 → 看對照總表能否整支判免訂,否則放棄 */
    const m = masterByName.get(agent);
    if (m && m.tier === "免訂容許量") componentJudgements = [{ en: "(整支)", ...{ cls: "免訂", why: m.basis } }];
    else { stats.藥名未解析++; continue; }
  } else {
    componentJudgements = res.components.map(en => ({ en, ...judgeComponent(en, agent, crop, cats) }));
  }

  const hasUnresolved = componentJudgements.some(j => j.cls === "尚未解析");
  if (hasUnresolved) { stats.藥名未解析++; continue; }

  const bad = componentJudgements.filter(j => j.cls === "不得檢出候選");
  const near = componentJudgements.filter(j => j.cls === "近似作物名待確認");
  const generic = componentJudgements.filter(j => j.cls === "通用列待確認");
  const noMap = componentJudgements.filter(j => j.cls === "查無對應");

  const rowOut = {
    作物: crop, 藥劑: agent, 防治對象數: pests.size,
    成分判定: componentJudgements.map(j => `${j.en}=${j.cls}${j.why ? "(" + j.why + ")" : ""}`).join(" | "),
    作物歸類: mrlCropSet.has(crop) ? "MRL 同名" + (cats.size ? "+" + [...cats].join("/") : "") : [...cats].join("/")
  };

  if (bad.length) { stats.不得檢出候選++; candidates.push(rowOut); }
  else if (near.length) { stats.含近似作物名待確認++; genericReview.push({ ...rowOut, 原因: "近似作物名" }); }
  else if (generic.length) { stats.含通用列待確認++; genericReview.push({ ...rowOut, 原因: "通用列" }); }
  else if (noMap.length) { stats.含查無對應++; }
  else { stats.全部有容許量或免訂++; }
}

/* ── 輸出 ── */
candidates.sort((a, b) => a.作物.localeCompare(b.作物, "zh-Hant") || a.藥劑.localeCompare(b.藥劑, "zh-Hant"));
genericReview.sort((a, b) => a.作物.localeCompare(b.作物, "zh-Hant") || a.藥劑.localeCompare(b.藥劑, "zh-Hant"));

const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
const head = ["作物", "藥劑", "防治對象數", "成分逐一判定", "作物歸類", "人工確認(是/否)", "備註"];
const toCsv = (rows, extraCol) => ["﻿" + (extraCol ? [extraCol, ...head] : head).map(cell).join(",")]
  .concat(rows.map(r => (extraCol ? [r.原因] : []).concat([r.作物, r.藥劑, r.防治對象數, r.成分判定, r.作物歸類, "", ""]).map(cell).join(",")))
  .join("\r\n");

fs.writeFileSync(path.join(DIR, "登記但不得檢出-候選.csv"), toCsv(candidates), "utf8");
fs.writeFileSync(path.join(DIR, "登記但待確認-通用列與近似名.csv"), toCsv(genericReview, "原因"), "utf8");
fs.writeFileSync(path.join(DIR, "登記但不得檢出-候選.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "人工複核用。判定僅涵蓋成分與作物皆已穩定解析者;未解析一律排除,不推論。未經逐筆人工確認不得顯示於 App。",
  stats, candidates, genericReview
}, null, 2), "utf8");

console.log("=== 登記(作物×藥劑)判定統計 ===");
for (const [k, v] of Object.entries(stats)) console.log(`  ${k}:${v}`);
console.log(`\n已產出:登記但不得檢出-候選.csv(${candidates.length} 筆)`);
console.log(`         登記但待確認-通用列與近似名.csv(${genericReview.length} 筆)`);
console.log(`         登記但不得檢出-候選.json`);
