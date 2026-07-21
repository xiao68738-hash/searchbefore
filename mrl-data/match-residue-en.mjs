/* 以正規化後的英文名補比對 MRL。

   原本的「英文有效成分未對到」是直接字串比對。但兩邊的寫法差異包括:
     大小寫、連字號、空白、括號、逗號、異構物前綴、鹽類後綴
   例:PIRMIPHOS-METHYL vs PIRIMIPHOS-METHYL(官方資料本身的拼寫差異)
       METHYL-PARATHION vs PARATHION-METHYL(前後顛倒)

   本腳本分階段放寬:
     完全相同 → 去符號後相同 → 詞序無關 → 去異構物/鹽類前後綴

   ⚠️ 放寬到第 4 階段時誤配風險升高,一律標為「需人工確認」。
      藥名一字之差常是完全不同的藥。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

const permitsPath = path.join(DIR, "source-cache", "permits.json");
if (!fs.existsSync(permitsPath)) {
  console.error("缺少 source-cache/permits.json,請先執行 node scripts/fetch-pesticide-source.mjs");
  process.exit(1);
}
const permits = JSON.parse(fs.readFileSync(permitsPath, "utf8"));
const mrl = read("latest.json").rows || [];
const master = read("殘留物對照總表.json");

/* 只處理總表裡還沒有明確依據的(層級 4 以上) */
const pending = master.rows.filter(r => r.level >= 4);

/* 許可證:中文名 → 英文名 */
const zh2en = new Map();
for (const p of permits) {
  const zh = String(p["中文名稱"] || "").trim();
  const en = String(p["英文名稱"] || "").trim();
  if (zh && en && !zh2en.has(zh)) zh2en.set(zh, en);
}

/* MRL 英文名 → 中文名 */
const mrlEn = new Map();
for (const r of mrl) {
  const en = String(r["國際普通名稱"] || "").trim();
  if (en && !mrlEn.has(en)) mrlEn.set(en, String(r["普通名稱"] || "").trim());
}

const strip = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const words = s => String(s || "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).sort().join("");
/* 常見的異構物與鹽類前後綴,去掉後看母體是否對得上 */
const PREFIX = /^(ALPHA|BETA|GAMMA|LAMBDA|ZETA|TAU|ESS?|S|R|D|L|CIS|TRANS|METHYL|ETHYL)[-\s]/i;
const SUFFIX = /[-\s](M|P|D|IPA|SODIUM|POTASSIUM|AMMONIUM|CHLORIDE|SULFATE|ACETATE|HYDROCHLORIDE|ISOPROPYLAMINE|SALT)$/i;
function core(s) {
  let t = String(s || "").trim();
  for (let i = 0; i < 3; i++) { t = t.replace(PREFIX, "").replace(SUFFIX, ""); }
  return strip(t);
}

const byStrip = new Map(), byWords = new Map(), byCore = new Map();
for (const [en, zh] of mrlEn) {
  if (!byStrip.has(strip(en))) byStrip.set(strip(en), { en, zh });
  if (!byWords.has(words(en))) byWords.set(words(en), { en, zh });
  if (!byCore.has(core(en))) byCore.set(core(en), { en, zh });
}

const hit = [], miss = [];
for (const r of pending) {
  const en = zh2en.get(r.appName);
  if (!en) { miss.push({ ...r, en: "", why: "許可證亦無英文名" }); continue; }

  let m = null, how = "", confidence = "";
  if (mrlEn.has(en)) { m = { en, zh: mrlEn.get(en) }; how = "完全相同"; confidence = "高"; }
  else if (byStrip.has(strip(en))) { m = byStrip.get(strip(en)); how = "忽略大小寫與符號後相同"; confidence = "高"; }
  else if (byWords.has(words(en))) { m = byWords.get(words(en)); how = "詞序不同但組成相同"; confidence = "中"; }
  else if (core(en) && byCore.has(core(en))) { m = byCore.get(core(en)); how = "去異構物/鹽類前後綴後相同"; confidence = "低"; }

  if (m) hit.push({ ...r, en, mrlEn: m.en, mrlZh: m.zh, how, confidence });
  else miss.push({ ...r, en, why: "MRL 查無對應英文名" });
}

/* ── 關鍵檢查:法規對異構物是「逐項列舉」的 ──
   註四明文寫出賽滅寧涵蓋亞滅寧(alpha)、賽扶寧涵蓋貝他賽扶寧(beta)…
   沒被列出的異構物就不在涵蓋範圍內。

   所以「去掉 ZETA- 前綴後對上 CYPERMETHRIN」不代表可以套用賽滅寧的
   容許量 —— 註四只列了 alpha,沒有 zeta。把它當成同一支藥會給出
   實際上不適用的容許量標準。 */
const spec = read("殘留物定義規則.json");
const listedIsomers = new Map();   /* 母體英文(大寫) → 已列舉的異構物英文 */
for (const rule of spec.rules) {
  if (!rule.targetEn) continue;
  const key = rule.targetEn.toUpperCase();
  if (!listedIsomers.has(key)) listedIsomers.set(key, []);
  for (const m of rule.members) if (m.en) listedIsomers.get(key).push(m.en.toUpperCase());
}

for (const r of hit) {
  const parent = String(r.mrlEn || "").toUpperCase();
  const listed = listedIsomers.get(parent);
  if (!listed) continue;
  const self = String(r.en || "").toUpperCase();
  const covered = listed.some(x => strip(x) === strip(self));
  if (!covered) {
    r.confidence = "不可採用";
    r.how = `法規對 ${r.mrlZh} 逐項列舉異構物,但未列本項(已列:${listed.join("、") || "無"})`;
  }
}

hit.sort((a, b) => b.uses - a.uses);
const hUses = hit.reduce((n, r) => n + r.uses, 0);

console.log(`總表中尚無明確依據的:${pending.length} 種\n`);
console.log(`  英文名可對上:${hit.length} 種(影響 ${hUses} 處用途)`);
console.log(`  仍對不上    :${miss.length} 種\n`);

const byConf = {};
hit.forEach(r => byConf[r.confidence] = (byConf[r.confidence] || 0) + 1);
console.log("信心分布:" + Object.entries(byConf).map(([k, v]) => `${k} ${v} 種`).join("、") + "\n");

for (const r of hit) {
  console.log(`  ${String(r.uses).padStart(4)} 處  [信心${r.confidence}] ${r.appName.padEnd(14)}`);
  console.log(`             許可證 ${r.en}`);
  console.log(`             MRL   ${r.mrlEn}(${r.mrlZh})  ← ${r.how}`);
}

fs.writeFileSync(path.join(DIR, "英文名補比對.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "信心低者為去除異構物/鹽類前後綴後的比對,誤配風險高,務必人工確認。",
  pending: pending.length, matched: hit.length, matchedUses: hUses, hit, miss
}, null, 2), "utf8");

const csv = ["藥劑名稱,影響用途數,許可證英文名,MRL英文名,MRL中文名,比對方式,信心,人工確認(是/否)"]
  .concat(hit.map(r => `"${r.appName}",${r.uses},"${r.en}","${r.mrlEn}","${r.mrlZh}","${r.how}","${r.confidence}",`))
  .concat(miss.map(r => `"${r.appName}",${r.uses},"${r.en}","","","${r.why}","",`))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "英文名補比對.csv"), "﻿" + csv, "utf8");
console.log("\n已產出 英文名補比對.json / .csv");
