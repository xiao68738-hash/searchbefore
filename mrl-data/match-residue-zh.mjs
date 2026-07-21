/* 以「中文藥名」補比對 MRL 殘留容許量。

   現行的待人工清單分類為「英文有效成分未對到」—— 比對走的是
   許可證的英文名稱 → MRL 的國際普通名稱。但兩邊的英文寫法常有落差
   (異構物前綴、鹽類、大小寫、連字號),導致明明兩邊都有的藥對不起來。

   例:賽洛寧影響 1,042 處用途,被列為「未對到」,
       但 MRL 的「普通名稱」欄裡就有「賽洛寧」→ Cyhalothrin。

   中文藥名是台灣官方統一的通用名,比英文穩定。這支腳本用中文名補一輪。

   ⚠️ 僅產生建議,需人工確認。中文名相同不代表殘留物定義相同 ——
      MRL 的檢驗標的可能是代謝物或群組總量,那仍需逐一核對。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

const mrl = read("latest.json").rows || [];
const review = read("待人工確認.json");
const targets = review.rows.filter(r => r.type !== "作物尚未分類");

/* MRL 的中文名 → 國際普通名稱 + 出現的作物類別 */
const zhName = new Map();
for (const r of mrl) {
  const zh = String(r["普通名稱"] || "").trim();
  if (!zh) continue;
  if (!zhName.has(zh)) zhName.set(zh, { en: String(r["國際普通名稱"] || "").trim(), cats: new Set() });
  zhName.get(zh).cats.add(String(r["作物類別"] || "").trim());
}

const hit = [], miss = [];
for (const t of targets) {
  const name = String(t.appName || "").trim();
  const e = zhName.get(name);
  if (e) {
    hit.push({ appName: name, uses: t.uses, type: t.type, en: e.en, cats: e.cats.size });
    continue;
  }
  /* 部分相符只當線索,不算命中 —— 藥名一字之差常是完全不同的藥
     (例如 賽洛寧 / 賽滅寧 / 賽扶寧)。 */
  const near = [...zhName.keys()].filter(n => n.includes(name) || name.includes(n)).slice(0, 3);
  miss.push({ appName: name, uses: t.uses, type: t.type, near });
}

hit.sort((a, b) => b.uses - a.uses);
miss.sort((a, b) => b.uses - a.uses);

const hitUses = hit.reduce((n, r) => n + (r.uses || 0), 0);
const missUses = miss.reduce((n, r) => n + (r.uses || 0), 0);

console.log(`待確認藥名 ${targets.length} 筆`);
console.log(`  中文名完全相符:${hit.length} 筆(影響 ${hitUses} 處用途)`);
console.log(`  仍未對到    :${miss.length} 筆(影響 ${missUses} 處用途)`);

console.log(`\n=== 中文名對到的前 25 筆 ===`);
for (const r of hit.slice(0, 25)) {
  console.log(`  ${String(r.uses).padStart(4)} 處  ${r.appName.padEnd(14)} → ${r.en}(${r.cats} 個作物類別有訂容許量)`);
}

/* ── 把「未對到」分類到原因,而不是丟一堆未知給人工 ──
   每一類的後續處理方式不同,先分好類才知道該查什麼。 */
let exemptNames = new Set();
try {
  const ex = read("免訂容許量比對.json");
  exemptNames = new Set((ex.rows || []).map(r => r.appName));
} catch (e) { /* 尚未產生免訂比對時略過 */ }

const BIO = /桿菌|芽孢|殭菌|木黴|鏈黴|病毒|費洛蒙|苦參|印楝|除蟲菊|光桿菌|酵母|放線菌|蘇力菌|黴素/;
const DITHIO = /^(錳乃浦|鋅乃浦|鋅錳乃浦|福美鋅|福美鐵|福美雙|得恩地)$/;

function reasonOf(r) {
  const n = r.appName;
  if (exemptNames.has(n)) return { tag: "已列免訂容許量", act: "不需對照,確認免訂比對表即可" };
  if (DITHIO.test(n)) return { tag: "二硫代胺基甲酸鹽類", act: "MRL 以群組總量訂定,須確認併入哪個群組計算" };
  if (BIO.test(n)) return { tag: "生物製劑", act: "多數屬免訂容許量,確認是否在清單內(注意菌株層級)" };
  if (r.near.length) {
    /* 名稱包含某個已知藥名 —— 可能是鹽類、異構物或混合劑 */
    if (/鹽$/.test(n)) return { tag: "鹽類", act: `殘留物定義通常以母體計,確認是否等同「${r.near[0]}」` };
    if (/^(貝他|阿爾發|甲基|乙基|順式|反式)-?/.test(n)) return { tag: "異構物", act: `確認 MRL 的「${r.near[0]}」是否涵蓋本異構物` };
    return { tag: "疑似混合劑或衍生物", act: `含已知成分「${r.near.join("、")}」,須逐一拆解` };
  }
  if (/^(銅|鋅錳|鋅|錳)/.test(n)) return { tag: "疑似混合劑", act: "名稱由多個成分組合而成,須逐一拆解後分別對照" };
  return { tag: "無線索", act: "須查官方農藥名稱手冊確認學名" };
}

const buckets = new Map();
for (const r of miss) {
  const info = reasonOf(r);
  r.tag = info.tag; r.act = info.act;
  if (!buckets.has(info.tag)) buckets.set(info.tag, []);
  buckets.get(info.tag).push(r);
}

console.log(`\n=== 未對到的 ${miss.length} 筆,依原因分類 ===`);
const sorted = [...buckets.entries()].sort((a, b) =>
  b[1].reduce((n, r) => n + r.uses, 0) - a[1].reduce((n, r) => n + r.uses, 0));
for (const [tag, list] of sorted) {
  const u = list.reduce((n, r) => n + r.uses, 0);
  console.log(`\n  【${tag}】${list.length} 筆,影響 ${u} 處`);
  console.log(`     處理方式:${list[0].act.replace(/「[^」]*」/, "…")}`);
  console.log(`     ${list.slice(0, 8).map(r => `${r.appName}(${r.uses})`).join("、")}${list.length > 8 ? " …" : ""}`);
}

fs.writeFileSync(path.join(DIR, "中文名補比對.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "中文名相同僅代表同一有效成分,不代表殘留物定義相同。MRL 的檢驗標的可能是代謝物或群組總量,仍需人工核對。",
  matched: hit.length, matchedUses: hitUses, unmatched: miss.length, unmatchedUses: missUses,
  buckets: Object.fromEntries([...buckets].map(([k,v])=>[k,{count:v.length,uses:v.reduce((n,r)=>n+r.uses,0)}])),
  hit, miss
}, null, 2), "utf8");

const csv = ["藥劑名稱,影響用途數,原分類,MRL國際普通名稱,有訂容許量的作物類別數,人工確認(是/否)"]
  .concat(hit.map(r => `"${r.appName}",${r.uses},"${r.type}","${r.en}",${r.cats},`))
  .concat(miss.map(r => `"${r.appName}",${r.uses},"${r.type}","(未對到:${r.tag})","${r.act}",`))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "中文名補比對.csv"), "﻿" + csv, "utf8");
console.log("\n已產出 中文名補比對.json / .csv");
