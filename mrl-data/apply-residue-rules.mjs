/* 以《農藥殘留容許量標準》附表一備註的原文規則,解決待人工清單。

   規則來源:殘留物定義規則.json(法規原文逐字轉錄,2026-07-21 查核)

   這些備註本身就是官方的「殘留物定義」—— 明文規定哪些藥的殘留要併入
   哪個目標計算。有原文依據的部分不需要再人工判斷。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

const spec = read("殘留物定義規則.json");
const review = read("待人工確認.json");
const targets = review.rows.filter(r => r.type !== "作物尚未分類");

/* 名稱正規化:許可證與法規的寫法有連字號、全半形括號、空白的差異。
   例:許可證「貝他-賽扶寧」vs 法規「貝他賽扶寧」,只差一個連字號。
   不正規化的話這種會漏掉,而且漏掉不會有任何跡象。 */
function norm(s) {
  return String(s || "").trim()
    .replace(/[-‐‑–—\s]/g, "")
    .replace(/[（]/g, "(").replace(/[）]/g, ")");
}

/* 建立 中文名 → 規則 的索引 */
const byZh = new Map();
for (const rule of spec.rules) {
  const target = rule.target || rule.group;
  for (const m of rule.members) {
    if (m.zh) byZh.set(norm(m.zh), { rule, member: m, target });
  }
  /* 群組型的規則,目標本身也可能出現在待確認清單 */
  if (rule.group) byZh.set(norm(rule.group), { rule, member: null, target });
}

const resolved = [], remaining = [];
for (const t of targets) {
  const name = String(t.appName || "").trim();
  const hit = byZh.get(norm(name));
  if (hit) {
    resolved.push({
      appName: name, uses: t.uses,
      target: hit.target, kind: hit.rule.kind, note: hit.rule.note,
      caution: hit.rule.caution || ""
    });
  } else {
    remaining.push({ appName: name, uses: t.uses });
  }
}

resolved.sort((a, b) => b.uses - a.uses);
const rUses = resolved.reduce((n, x) => n + x.uses, 0);
const mUses = remaining.reduce((n, x) => n + x.uses, 0);

console.log(`規則來源:${spec.source}(${spec.amendedOn})`);
console.log(`待確認藥名 ${targets.length} 筆\n`);
console.log(`  有法規原文依據:${resolved.length} 筆(影響 ${rUses} 處用途)`);
console.log(`  仍需人工      :${remaining.length} 筆(影響 ${mUses} 處用途)\n`);

console.log("=== 有法規原文依據 ===");
for (const r of resolved) {
  console.log(`  ${String(r.uses).padStart(4)} 處  ${r.appName.padEnd(12)} → ${r.target}(${r.kind}／${r.note})`);
  if (r.caution) console.log(`             ⚠️ ${r.caution}`);
}

console.log(`\n=== 仍需人工的前 25 筆 ===`);
for (const r of remaining.sort((a, b) => b.uses - a.uses).slice(0, 25)) {
  console.log(`  ${String(r.uses).padStart(4)} 處  ${r.appName}`);
}

fs.writeFileSync(path.join(DIR, "法規依據對照.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  ruleSource: spec.source, amendedOn: spec.amendedOn, sourceUrl: spec.sourceUrl,
  resolved: resolved.length, resolvedUses: rUses,
  remaining: remaining.length, remainingUses: mUses,
  rows: resolved, pending: remaining
}, null, 2), "utf8");

const csv = ["藥劑名稱,影響用途數,併入目標,規則類型,法規依據,注意事項"]
  .concat(resolved.map(r => `"${r.appName}",${r.uses},"${r.target}","${r.kind}","${r.note}","${r.caution}"`))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "法規依據對照.csv"), "﻿" + csv, "utf8");
console.log("\n已產出 法規依據對照.json / .csv");
