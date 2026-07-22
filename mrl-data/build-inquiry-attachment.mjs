/* 產生詢問函的附件:待釐清品項與其完整英文有效成分。

   ── 為什麼要拆成英文成分再寄 ──
   若只列中文普通名稱，承辦人會先卡在「這是什麼藥」的名稱解析，
   真正要問的「官方映射規則」反而被蓋過去。附上完整英文有效成分，
   對方一眼就能判斷，回覆才會實質。

   ── 資料來源的關鍵 ──
   許可證的「英文名稱」欄位本身就已拆好混合劑，例如
     賽速洛寧   → LAMBDA-CYHALOTHRIN + THIAMETHOXAM
     鋅錳座賽胺 → MANCOZEB + ZOXAMIDE
   以「+」切分即可，不需要從中文名或 IUPAC 化學名反推。

   輸出 xlsx 使用專案自己的 export-formats.js，不依賴第三方套件。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

const permitsPath = path.join(DIR, "source-cache", "permits.json");
if (!fs.existsSync(permitsPath)) {
  console.error("缺少 source-cache/permits.json，請先執行 node scripts/fetch-pesticide-source.mjs");
  process.exit(1);
}
const permits = JSON.parse(fs.readFileSync(permitsPath, "utf8"));
const mrl = read("latest.json").rows || [];
const exempt = read("mrl-exempt-latest.json").rows || [];
const master = read("殘留物對照總表.json");
const spec = read("殘留物定義規則.json");

const text = v => String(v ?? "").trim();
const key = s => text(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

/* 索引 */
const mrlByEn = new Map();
for (const r of mrl) {
  const en = text(r["國際普通名稱"]);
  if (en && !mrlByEn.has(key(en))) mrlByEn.set(key(en), { en, zh: text(r["普通名稱"]) });
}
const exByEn = new Map();
for (const r of exempt) {
  const en = text(r["英文名稱"]);
  if (en) exByEn.set(key(en), text(r["農藥名稱"]));
}
/* 法規備註涵蓋的成分 */
const ruleByEn = new Map();
for (const rule of spec.rules) {
  const target = rule.target || rule.group;
  for (const m of rule.members) if (m.en) ruleByEn.set(key(m.en), { target, note: rule.note });
}

/* 許可證：中文名 → 英文名 + 用途數 */
const info = new Map();
for (const p of permits) {
  const zh = text(p["中文名稱"]);
  const en = text(p["英文名稱"]);
  if (!zh || info.has(zh)) continue;
  info.set(zh, { en, chem: text(p["化學成分"]).replace(/\r?\n/g, " ") });
}

/* 英文成分 → 該成分在許可證上的中文名（供中文路徑比對） */
const enToZh = new Map();
for (const p of permits) {
  const en = key(p["英文名稱"]);
  const zh = text(p["中文名稱"]);
  if (en && zh && !enToZh.has(en)) enToZh.set(en, zh);
}
const mrlByZh = new Map();
for (const r of mrl) {
  const zh = text(r["普通名稱"]);
  if (zh && !mrlByZh.has(zh)) mrlByZh.set(zh, text(r["國際普通名稱"]));
}

/* 逐一判定單一成分 */
function judge(en) {
  const k = key(en);
  if (ruleByEn.has(k)) {
    const r = ruleByEn.get(k);
    return { status: "法規備註已涵蓋", target: r.target, basis: r.note };
  }
  if (mrlByEn.has(k)) {
    const m = mrlByEn.get(k);
    return { status: "附表一有訂容許量", target: `${m.zh}（${m.en}）`, basis: "" };
  }
  if (exByEn.has(k)) return { status: "得免訂定容許量", target: exByEn.get(k), basis: "" };

  /* 英文對不上,但中文通用名兩邊相同 ——
     例如 LAMBDA-CYHALOTHRIN 在附表一寫作 Cyhalothrin,
     但許可證與附表一的中文名同為「賽洛寧」。
     這是最常見的落差型態,附件中要標出來,對方才知道我們問的
     不是「這是什麼藥」,而是「英文寫法不同時該以何者為準」。 */
  const zh = enToZh.get(k);
  if (zh && mrlByZh.has(zh)) {
    return {
      status: "英文不同但中文通用名相同",
      target: `${zh}（附表一作 ${mrlByZh.get(zh)}）`,
      basis: "待釐清：應以中文通用名或英文名為準"
    };
  }
  return { status: "查無對應", target: "", basis: "" };
}

/* 只取尚無明確依據者 */
const pending = master.rows.filter(r => r.level >= 4);

const rows = [];
for (const r of pending) {
  const meta = info.get(r.appName) || { en: "", chem: "" };
  /* 英文名以 + 切分即可得各有效成分 */
  const parts = meta.en ? meta.en.split(/\s*[+＋]\s*/).map(s => s.trim()).filter(Boolean) : [];
  const judged = parts.map(p => ({ en: p, ...judge(p) }));
  const allCovered = judged.length > 0 && judged.every(j => j.status !== "查無對應");

  rows.push({
    zh: r.appName,
    uses: r.uses,
    en: meta.en,
    parts: judged,
    kind: parts.length > 1 ? "混合劑" : (parts.length === 1 ? "單一成分" : "英文名欄位為空"),
    allCovered,
    chem: meta.chem.slice(0, 200)
  });
}

/* ── 帶入使用者於植物保護資訊系統查證的英文名 ──
   開放資料 API 英文名欄為空的那幾支,使用者已逐一查回官方英文普通名稱。
   查證判定為「可視為免訂/對到免訂」者,直接標為 allCovered,移出詢問清單;
   仍需釐清者(如波爾多是否比照銅製劑)保留在詢問清單並附上查證到的英文名。 */
const verified = read("人工查證英文名.json");
if (verified) {
  const byZh = new Map(verified.rows.map(v => [v.zh, v]));
  for (const r of rows) {
    const v = byZh.get(r.zh);
    if (!v) continue;
    if (!r.en && v.en) r.en = v.en;          /* 補上查證到的英文名 */
    r.verifiedEn = v.en;
    r.verifiedNote = v.reason;
    if (v.verdict === "可視為免訂" || v.verdict === "對到免訂") {
      r.allCovered = true;                   /* 已釐清,不必再問 */
      r.resolvedBy = "植物保護系統查證 + " + v.reason;
      r.parts = [{ en: v.en, status: v.verdict, target: v.kind, from: "人工查證" }];
    }
  }
}

rows.sort((a, b) => b.uses - a.uses);

const mixtures = rows.filter(r => r.kind === "混合劑");
const singles = rows.filter(r => r.kind === "單一成分");
const noEn = rows.filter(r => r.kind === "英文名欄位為空");
const covered = rows.filter(r => r.allCovered);

console.log(`待釐清品項 ${rows.length} 種\n`);
console.log(`  混合劑        ${mixtures.length} 種`);
console.log(`  單一成分      ${singles.length} 種`);
console.log(`  英文名欄位為空 ${noEn.length} 種`);
console.log(`\n拆解後全部成分都能對應：${covered.length} 種（可自行結案，不必列入詢問）`);

console.log(`\n=== 拆解後仍有成分查無對應的前 20 種 ===`);
for (const r of rows.filter(x => !x.allCovered).slice(0, 20)) {
  console.log(`  ${String(r.uses).padStart(4)} 處  ${r.zh}  [${r.kind}]`);
  console.log(`        英文名：${r.en || "(空)"}`);
  for (const p of r.parts) {
    console.log(`        ├ ${p.en.padEnd(30)} ${p.status}${p.target ? " → " + p.target : ""}`);
  }
}

/* ── 輸出 ── */
fs.writeFileSync(path.join(DIR, "待釐清清單.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "英文有效成分取自許可證「英文名稱」欄位，混合劑以「+」切分。",
  total: rows.length, mixtures: mixtures.length, singles: singles.length,
  noEnglishName: noEn.length, fullyCovered: covered.length, rows
}, null, 2), "utf8");

/* CSV：一列一個成分，方便承辦逐項看 */
const csv = ["中文普通名稱,登記用途數,類型,許可證英文名稱,有效成分(英文),該成分比對結果,對應項目,法規依據,整筆是否全部可對應"]
  .concat(rows.flatMap(r => r.parts.length
    ? r.parts.map(p => `"${r.zh}",${r.uses},"${r.kind}","${r.en}","${p.en}","${p.status}","${p.target}","${p.basis}","${r.allCovered ? "是" : "否"}"`)
    : [`"${r.zh}",${r.uses},"${r.kind}","","","英文名欄位為空","","","否"`]))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "農藥普通名稱與殘留容許量項目待釐清清單.csv"), "﻿" + csv, "utf8");

console.log("\n已產出 待釐清清單.json 與 農藥普通名稱與殘留容許量項目待釐清清單.csv");
