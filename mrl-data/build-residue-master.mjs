/* 把各層比對結果合併成單一的殘留物對照總表。

   前面幾支腳本各解決一部分,但分散在五個檔案裡,人工校對時要開五個檔
   互相對照。這支把它們依「證據強度」合併成一份,每筆只出現一次。

   證據層級(由強到弱):
     1 法規原文    《農藥殘留容許量標準》附表一備註明文規定
     2 中文通用名   許可證與 MRL 使用同一個主管機關指定的中文名
     3 免訂容許量   列於「得免訂定容許量之農藥一覽表」
     4 已分類原因   知道為什麼對不到,但還沒有結論
     5 無線索      須查官方農藥名稱手冊

   同一支藥若同時符合多層,取最強的那層。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = f => {
  const p = path.join(DIR, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

const review = read("待人工確認.json");
const targets = review.rows.filter(r => r.type !== "作物尚未分類");
const usesOf = new Map(targets.map(r => [String(r.appName).trim(), r.uses || 0]));

const master = new Map();   /* 藥名 → 最強的一筆 */
function put(name, tier, level, target, basis, caution) {
  const key = String(name).trim();
  if (!key) return;
  const prev = master.get(key);
  if (prev && prev.level <= level) return;   /* 已有更強的證據 */
  master.set(key, {
    appName: key,
    uses: usesOf.get(key) ?? 0,
    tier, level, target: target || "", basis: basis || "", caution: caution || ""
  });
}

/* 層 1:法規原文 */
const law = read("法規依據對照.json");
if (law) for (const r of law.rows) {
  put(r.appName, "法規原文", 1, r.target, `${r.note}(${r.kind})`, r.caution);
}

/* 層 2:中文通用名相同 */
const zh = read("中文名補比對.json");
if (zh) for (const r of zh.hit) {
  put(r.appName, "中文通用名", 2, r.en, `MRL 有 ${r.cats} 個作物類別訂定容許量`, "");
}

/* 層 3:免訂容許量 */
const ex = read("免訂容許量比對.json");
if (ex) {
  for (const r of ex.rows) {
    put(r.appName, "免訂容許量", 3, r.exempt, `信心${r.confidence}／${r.how}`, "");
  }
  /* 明確不可視為免訂者,不可被較弱的層蓋掉,單獨標記 */
  for (const r of (ex.excluded || [])) {
    master.set(r.appName, {
      appName: r.appName, uses: usesOf.get(r.appName) ?? 0,
      tier: "不可視為免訂", level: 3.5, target: "",
      basis: `該菌種逐菌株列舉,本菌株不在清單`, caution: `清單只列:${r.listed}`
    });
  }
}

/* 層 4/5:已分類原因 */
if (zh) for (const r of zh.miss) {
  const level = r.tag === "無線索" ? 5 : 4;
  put(r.appName, r.tag, level, "", r.act, "");
}

/* 補上英文寫法不同的資訊(不改變層級,只補說明) */
const ident = read("藥名同一性複核.json");
if (ident) {
  const byZh = new Map(ident.rows.map(r => [r.zh, r]));
  for (const m of master.values()) {
    const r = byZh.get(m.appName);
    if (!r) continue;
    if (r.risk && !m.caution) m.caution = r.note.replace("⚠️ ", "");
    if (!r.identical && !m.basis.includes("英文")) {
      m.basis += `｜英文寫法不同(許可證 ${r.permitEn} / MRL ${r.mrlEn})`;
    }
  }
}

const rows = [...master.values()].sort((a, b) => a.level - b.level || b.uses - a.uses);

/* ── 報告 ── */
const byTier = new Map();
for (const r of rows) {
  if (!byTier.has(r.tier)) byTier.set(r.tier, []);
  byTier.get(r.tier).push(r);
}

console.log(`殘留物對照總表:${rows.length} 種藥劑\n`);
console.log("層級             筆數   影響用途數");
for (const [tier, list] of [...byTier].sort((a, b) => a[1][0].level - b[1][0].level)) {
  const u = list.reduce((n, r) => n + r.uses, 0);
  console.log(`  ${tier.padEnd(14)} ${String(list.length).padStart(4)}   ${String(u).padStart(6)}`);
}

const settled = rows.filter(r => r.level <= 3);
const settledUses = settled.reduce((n, r) => n + r.uses, 0);
const totalUses = rows.reduce((n, r) => n + r.uses, 0);
console.log(`\n有明確依據:${settled.length} 種,涵蓋 ${settledUses}/${totalUses} 處用途(${(settledUses / totalUses * 100).toFixed(1)}%)`);

console.log("\n=== 影響最大的 20 種 ===");
for (const r of [...rows].sort((a, b) => b.uses - a.uses).slice(0, 20)) {
  console.log(`  ${String(r.uses).padStart(4)} 處  [${r.tier}] ${r.appName}${r.target ? " → " + r.target : ""}`);
}

/* ── 輸出 ── */
fs.writeFileSync(path.join(DIR, "殘留物對照總表.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "依證據強度合併。層級 1-3 有明確依據,4-5 仍需人工。所有結論在納入 App 前都應經人工確認。",
  total: rows.length, settled: settled.length, settledUses, totalUses, rows
}, null, 2), "utf8");

const csv = ["藥劑名稱,影響用途數,證據層級,對應目標,依據,注意事項,人工確認(是/否),修正為"]
  .concat(rows.map(r => `"${r.appName}",${r.uses},"${r.tier}","${r.target}","${r.basis}","${r.caution}",,`))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "殘留物對照總表.csv"), "﻿" + csv, "utf8");
console.log("\n已產出 殘留物對照總表.json / .csv");
