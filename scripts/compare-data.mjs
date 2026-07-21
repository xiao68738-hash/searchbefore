/* 比對新產生的 DATA 與 index.html 目前使用的 DATA。

   為什麼一定要比對:DATA 有 16,000 多筆,轉換規則錯一個欄位不會有任何
   錯誤訊息,只會讓農友看到錯的稀釋倍數或安全採收期。

   ── 比對方式 ──
   同一個「作物/病蟲害/成分/劑型/含量」底下可能有多筆不同用法
   (不同稀釋倍數、不同採收期)。現行 DATA 有 299 筆、新版有 549 筆
   屬於這種情形。若只用這五個欄位當鍵,Map 會互相覆蓋,結果是拿
   毫不相干的兩筆互比,產生大量假差異。

   因此分兩層:
   1. 完整比對:以「除 bl 外的所有欄位」為鍵,得出真正消失/新增的筆數
   2. 欄位診斷:只在兩邊該群組都恰好一筆時才逐欄比較,避免配錯對

   用法:node scripts/compare-data.mjs [--full] */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const FULL = process.argv.includes("--full");

const builtPath = path.join(ROOT, "mrl-data", "source-cache", "DATA.built.json");
if (!fs.existsSync(builtPath)) {
  console.error("缺少 DATA.built.json,請先執行:node scripts/build-data.mjs");
  process.exit(1);
}
const next = JSON.parse(fs.readFileSync(builtPath, "utf8"));

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const i = html.indexOf("const DATA=") + "const DATA=".length;
const cur = JSON.parse(html.slice(i, html.indexOf("\n", i)).trim().replace(/;$/, ""));

const FIELDS = ["dilution", "phi", "dose", "times", "moa", "note"];
const fullKey = (c, p, e) =>
  [c, p, e.name, e.form, e.content, ...FIELDS.map(f => String(e[f] ?? ""))].join("|");
const groupKey = (c, p, e) => [c, p, e.name, e.form, e.content].join("|");

function walk(d, fn) {
  for (const c of Object.keys(d))
    for (const p of Object.keys(d[c]))
      for (const e of d[c][p]) fn(c, p, e);
}

const count = d => {
  let pairs = 0, entries = 0;
  for (const c of Object.keys(d)) {
    const ps = Object.keys(d[c]);
    pairs += ps.length;
    for (const p of ps) entries += d[c][p].length;
  }
  return { crops: Object.keys(d).length, pairs, entries };
};

const a = count(cur), b = count(next);
const delta = (x, y) => `${x} → ${y}(${y - x >= 0 ? "+" : ""}${y - x})`;
console.log("=== 規模 ===");
console.log("作物        ", delta(a.crops, b.crops));
console.log("作物×病蟲害 ", delta(a.pairs, b.pairs));
console.log("藥劑筆數    ", delta(a.entries, b.entries));

const curCrops = new Set(Object.keys(cur)), nextCrops = new Set(Object.keys(next));
console.log("\n=== 作物 ===");
console.log(`消失 ${[...curCrops].filter(c => !nextCrops.has(c)).length} 種:${[...curCrops].filter(c => !nextCrops.has(c)).join("、") || "(無)"}`);
console.log(`新增 ${[...nextCrops].filter(c => !curCrops.has(c)).length} 種:${[...nextCrops].filter(c => !curCrops.has(c)).join("、") || "(無)"}`);

/* ── 第 1 層:完整比對 ── */
const curFull = new Set(), nextFull = new Set();
walk(cur, (c, p, e) => curFull.add(fullKey(c, p, e)));
walk(next, (c, p, e) => nextFull.add(fullKey(c, p, e)));
const identical = [...curFull].filter(k => nextFull.has(k)).length;
const gone = [...curFull].filter(k => !nextFull.has(k));
const added = [...nextFull].filter(k => !curFull.has(k));

console.log("\n=== 完整比對(所有欄位一致才算相同) ===");
console.log(`完全相同 ${identical}｜現行有而新版沒有 ${gone.length}｜新版才有 ${added.length}`);

/* ── 第 2 層:欄位診斷(只比對兩邊都恰好一筆的群組) ── */
const curG = new Map(), nextG = new Map();
walk(cur, (c, p, e) => { const k = groupKey(c, p, e); (curG.get(k) || curG.set(k, []).get(k)).push(e); });
walk(next, (c, p, e) => { const k = groupKey(c, p, e); (nextG.get(k) || nextG.set(k, []).get(k)).push(e); });

const changed = [];
let ambiguous = 0;
for (const [k, list] of curG) {
  const other = nextG.get(k);
  if (!other) continue;
  if (list.length !== 1 || other.length !== 1) { ambiguous++; continue; }
  const x = list[0], y = other[0];
  const diff = FIELDS.filter(f => String(x[f] ?? "") !== String(y[f] ?? ""));
  const blDiff = (x.bl || []).slice().sort().join(",") !== (y.bl || []).slice().sort().join(",");
  if (diff.length || blDiff) changed.push({ k, diff, blDiff, x, y });
}

console.log(`\n=== 欄位診斷(可明確配對的群組) ===`);
console.log(`有差異 ${changed.length} 組｜無法明確配對而略過 ${ambiguous} 組(同群組多筆)`);

const byField = {};
changed.forEach(c => c.diff.forEach(f => byField[f] = (byField[f] || 0) + 1));
const blOnly = changed.filter(c => !c.diff.length && c.blDiff).length;
console.log("\n差異欄位分布:");
Object.entries(byField).sort((x, y) => y[1] - x[1])
  .forEach(([f, n]) => console.log(`  ${String(n).padStart(5)}  ${f}`));
console.log(`  ${String(blOnly).padStart(5)}  只有商品名(bl)不同`);

function report(field, label, limit) {
  const list = changed.filter(c => c.diff.includes(field));
  if (!list.length) return 0;
  console.log(`\n⚠️ ${label}有 ${list.length} 筆不同:`);
  for (const c of list.slice(0, FULL ? 1e9 : limit)) {
    console.log(`  ${c.k}`);
    console.log(`      ${JSON.stringify(c.x[field])} → ${JSON.stringify(c.y[field])}`);
  }
  if (!FULL && list.length > limit) console.log(`  ...(其餘 ${list.length - limit} 筆,加 --full 看完整清單)`);
  return list.length;
}

const nPhi = report("phi", "安全採收期(直接改變倒數結果)", 20);
const nDil = report("dilution", "稀釋倍數", 15);

const out = { generatedAt: new Date().toISOString(), scale: { cur: a, next: b }, identical, gone, added, ambiguous, changed };
fs.writeFileSync(path.join(ROOT, "mrl-data", "source-cache", "DATA.diff.json"), JSON.stringify(out, null, 1), "utf8");
console.log("\n完整報告:mrl-data/source-cache/DATA.diff.json");

console.log(nPhi + nDil
  ? `\n⚠️ 採收期 ${nPhi} 筆、稀釋倍數 ${nDil} 筆有變動,寫入前務必抽驗官方標示。`
  : "\n✓ 採收期與稀釋倍數皆無變動。");
