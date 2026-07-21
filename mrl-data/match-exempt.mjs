/* 把「待人工確認」中屬於「得免訂定容許量」的藥劑挑出來。

   這類藥劑法規上不需要訂容許量,自然也不必做 MRL 對照 —— 留在待確認
   清單裡只是浪費人工。

   ⚠️ 這支腳本只產生「建議」,不自動套用。生物製劑的命名差異(菌株代號、
      蟲名異稱)需要人眼確認,誤判會讓不該免訂的藥被當成免訂。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

const exempt = read("mrl-exempt-latest.json").rows || [];
const review = read("待人工確認.json");
const targets = review.rows.filter(r => r.type !== "作物尚未分類");

/* 蟲名異稱:官方兩份清單用字不一致,但指同一種蟲 */
const ALIAS = [["夜盜蛾", "夜蛾"], ["葉蛾", "夜蛾"]];

function norm(s) {
  let t = String(s || "").trim().replace(/\s+/g, "");
  for (const [a, b] of ALIAS) t = t.split(a).join(b);
  return t;
}
/* 去掉菌株代號:結尾的英數字/連字號串,例如「枯草桿菌KHY8」→「枯草桿菌」 */
function stripStrain(s) {
  return norm(s).replace(/[A-Za-z0-9][A-Za-z0-9\-\/]*$/, "");
}

const exemptNames = exempt.map(r => ({
  raw: String(r["農藥名稱"] || "").trim(),
  n: norm(r["農藥名稱"]),
  base: stripStrain(r["農藥名稱"])
})).filter(x => x.n);

/* 關鍵區別:免訂清單對某些菌種是「逐菌株列舉」的
     液化澱粉芽孢桿菌D747 / CL3 / PMB01 / QST713 / Tcba05 / YCMA1
     貝萊斯芽孢桿菌BF / N17
   對另一些則是「種層級」,清單只寫種名沒有菌株
     蘇力菌、枯草桿菌、鏈黴素

   對逐菌株列舉的菌種,去掉菌株代號再比對會把「這個菌種的某些菌株免訂」
   誤讀成「整個菌種免訂」,方向剛好相反 —— 不在清單上的菌株其實是
   「需要對照」,反而更該人工檢視。 */
const speciesLevel = new Set();     /* 清單中以種名單獨出現者 */
const strainListed = new Map();     /* 種名 → 已列舉的完整名稱 */
for (const e of exemptNames) {
  const base = stripStrain(e.raw);
  if (base && base !== e.n) {
    if (!strainListed.has(base)) strainListed.set(base, []);
    strainListed.get(base).push(e.raw);
  } else {
    speciesLevel.add(e.n);
  }
}

const results = [], excluded = [];
for (const r of targets) {
  const n = norm(r.appName);
  const base = stripStrain(r.appName);

  let hit = exemptNames.find(e => e.n === n);
  let how = hit ? "完全相同" : "", confidence = hit ? "高" : "";

  if (!hit) {
    /* 只在「種層級免訂」時才允許用種名比對 */
    hit = exemptNames.find(e => e.n && speciesLevel.has(e.n) && n.includes(e.n));
    if (hit) { how = `種層級免訂(清單未列舉菌株)`; confidence = "中"; }
  }

  if (!hit && base && strainListed.has(base)) {
    /* 該菌種是逐菌株列舉,而本菌株不在其中 → 明確不可視為免訂 */
    excluded.push({
      appName: r.appName, uses: r.uses, type: r.type,
      species: base, listed: strainListed.get(base).join("、")
    });
    continue;
  }

  if (hit) results.push({ appName: r.appName, uses: r.uses, type: r.type, exempt: hit.raw, how, confidence });
}

results.sort((a, b) => b.uses - a.uses);
const uses = results.reduce((n, r) => n + (r.uses || 0), 0);

const byHow = {};
results.forEach(r => byHow[r.how] = (byHow[r.how] || 0) + 1);

console.log(`待確認藥名 ${targets.length} 筆,其中 ${results.length} 筆疑似屬於免訂容許量`);
console.log(`合計影響 ${uses} 處用途\n`);
console.log("比對方式分布:");
Object.entries(byHow).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k}`));

console.log("\n逐筆(依影響用途數排序):");
for (const r of results) {
  console.log(`  ${String(r.uses).padStart(4)} 處  ${r.appName}  →  ${r.exempt}  [信心${r.confidence}/${r.how}]`);
}

if (excluded.length) {
  console.log(`\n⚠️ 以下 ${excluded.length} 筆「不可」視為免訂 —— 該菌種在清單中是逐菌株列舉,本菌株不在其中:`);
  for (const r of excluded) {
    console.log(`  ${String(r.uses).padStart(4)} 處  ${r.appName}`);
    console.log(`             清單只列:${r.listed}`);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  note: "本清單為建議,需人工確認後才可視為免訂容許量。蟲名異稱與菌株層級的判定可能誤判。",
  exemptListSize: exemptNames.length,
  reviewedNames: targets.length,
  matched: results.length,
  affectedUses: uses,
  rows: results,
  excludedNote: "以下菌種在免訂清單中是逐菌株列舉,本菌株不在其中,不可視為免訂",
  excluded
};
fs.writeFileSync(path.join(DIR, "免訂容許量比對.json"), JSON.stringify(out, null, 2), "utf8");

const csv = ["藥劑名稱,影響用途數,原分類,對應免訂清單項目,信心,比對方式,人工確認(是/否)"]
  .concat(results.map(r => `"${r.appName}",${r.uses},"${r.type}","${r.exempt}","${r.confidence}","${r.how}",`))
  .concat(excluded.map(r => `"${r.appName}",${r.uses},"${r.type}","(不可視為免訂)","-","該菌種逐菌株列舉,本菌株不在清單:${r.listed}",`))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "免訂容許量比對.csv"), "﻿" + csv, "utf8");

console.log("\n已產出 免訂容許量比對.json / .csv");
