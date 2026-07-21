/* 複核:許可證與 MRL 是否指同一個有效成分。

   ── 為什麼要用中文名 ──
   許可證與 MRL 的英文名常有落差(異構物前綴、鹽類後綴、拼寫),
   例如 LAMBDA-CYHALOTHRIN vs CYHALOTHRIN。以英文比對會判定「未對到」,
   然後被列為需人工查證的疑難案件。

   但台灣的中文通用名是主管機關統一指定的。兩邊用同一個中文名,
   代表主管機關把它們視為同一個有效成分 —— 這比從英文推論異構物關係
   更直接:農友手上標示「賽洛寧」的產品,適用的就是 MRL 表中「賽洛寧」
   那一列,不需要先證明 lambda 異構物與母體的關係。

   前提是中文↔英文必須是一對一,否則同名不同物會造成誤判。
   本腳本會先驗證這個前提。

   ⚠️ 名稱同一 ≠ 殘留物定義同一。MRL 的檢驗標的仍可能是代謝物或
      群組總量,那需要另外查附表的註記。本腳本只解決「是不是同一支藥」。 */

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

/* 許可證:中文名 → 英文名集合 */
const permitZh = new Map();
for (const p of permits) {
  const zh = String(p["中文名稱"] || "").trim();
  const en = String(p["英文名稱"] || "").trim().toUpperCase();
  if (!zh || !en) continue;
  if (!permitZh.has(zh)) permitZh.set(zh, new Set());
  permitZh.get(zh).add(en);
}

/* MRL:中文名 ↔ 英文名 */
const mrlZh = new Map(), mrlEnToZh = new Map();
for (const r of mrl) {
  const zh = String(r["普通名稱"] || "").trim();
  const en = String(r["國際普通名稱"] || "").trim().toUpperCase();
  if (!zh || !en) continue;
  if (!mrlZh.has(zh)) mrlZh.set(zh, en);
  if (!mrlEnToZh.has(en)) mrlEnToZh.set(en, new Set());
  mrlEnToZh.get(en).add(zh);
}

/* ── 前提驗證:中文↔英文是否一對一 ── */
const ambiguous = [...mrlEnToZh.entries()].filter(([, s]) => s.size > 1);
console.log(`MRL 藥名 ${mrlZh.size} 種`);
console.log(`一個英文名對到多個中文名:${ambiguous.length} 組`);
if (ambiguous.length) {
  console.log("⚠️ 存在同名不同物的風險,以下以中文名比對的結論需個別確認:");
  ambiguous.slice(0, 10).forEach(([en, s]) => console.log(`    ${en} → ${[...s].join("、")}`));
} else {
  console.log("✓ 一對一,可安全以中文名比對");
}

/* ── 這個方法的兩個失敗模式,必須偵測出來 ── */

/* 失敗模式 1:MRL 有另一筆中文名以本名為前綴,是不同的物質。
   實例:MRL 同時有「克熱淨」(GUAZATINE)與
        「克熱淨(醋酸鹽或烷苯磺酸鹽)」(IMINOCTADINE)。
   許可證的克熱淨是 IMINOCTADINE TRIACETATE,若直接對到「克熱淨」
   會對到 GUAZATINE —— 完全不同的藥,容許量標準也不同。 */
function siblings(zh) {
  return [...mrlZh.keys()].filter(n => n !== zh && n.startsWith(zh));
}

/* 失敗模式 2:許可證是混合劑,MRL 只列其中一個成分。
   實例:撲多草 = METOBROMURON + METOLACHLOR,MRL 只有 METOBROMURON。
   只對到一個成分等於漏掉另一個成分的殘留管制。 */
function isMixture(ens) {
  return ens.some(e => /[+＋]|\band\b/.test(e));
}

/* ── 逐一比對:兩邊都有的中文名 ── */
const rows = [];
for (const [zh, ens] of permitZh) {
  const mrlEn = mrlZh.get(zh);
  if (!mrlEn) continue;
  const permitEn = [...ens];
  const identical = permitEn.some(e => e === mrlEn);
  const sib = siblings(zh);
  const mixture = isMixture(permitEn);

  let risk = "", note = identical ? "英文亦相同" : "英文不同,但主管機關以同一中文通用名指稱";
  if (sib.length) {
    risk = "同名前綴";
    note = `⚠️ MRL 另有「${sib.join("、")}」,兩者是不同物質,不可只憑中文名對應`;
  } else if (mixture) {
    risk = "混合劑";
    note = `⚠️ 許可證為混合劑(${permitEn[0]}),MRL 只列其中一個成分,另一成分未涵蓋`;
  }
  rows.push({ zh, permitEn: permitEn.join(" / "), mrlEn, identical, risk, note });
}

const differ = rows.filter(r => !r.identical);
console.log(`\n許可證與 MRL 共用的中文藥名:${rows.length} 種`);
console.log(`  其中英文寫法不同:${differ.length} 種 ← 以英文比對會全部漏掉\n`);

const risky = rows.filter(r => r.risk);
console.log(`⚠️ 不可只憑中文名對應:${risky.length} 種\n`);
for (const r of risky) {
  console.log(`  【${r.risk}】${r.zh}`);
  console.log(`      許可證 ${r.permitEn}｜MRL ${r.mrlEn}`);
  console.log(`      ${r.note.replace("⚠️ ", "")}`);
}

console.log("\n=== 英文不同但中文相同,且無風險標記(前 25)===");
for (const r of differ.filter(x => !x.risk).slice(0, 25)) {
  console.log(`  ${r.zh.padEnd(14)} 許可證 ${r.permitEn.padEnd(26)} MRL ${r.mrlEn}`);
}

fs.writeFileSync(path.join(DIR, "藥名同一性複核.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "名稱同一不代表殘留物定義同一。MRL 的檢驗標的仍可能是代謝物或群組總量。",
  mrlNames: mrlZh.size,
  ambiguousEnToZh: ambiguous.map(([en, s]) => ({ en, zh: [...s] })),
  shared: rows.length,
  englishDiffers: differ.length,
  risky: rows.filter(r => r.risk).length,
  rows
}, null, 2), "utf8");

const csv = ["中文通用名,許可證英文名,MRL英文名,英文是否相同,風險,說明,人工確認(是/否)"]
  .concat(rows.map(r => `"${r.zh}","${r.permitEn}","${r.mrlEn}","${r.identical ? "是" : "否"}","${r.risk}","${r.note}",`))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "藥名同一性複核.csv"), "﻿" + csv, "utf8");
console.log("\n已產出 藥名同一性複核.json / .csv");
