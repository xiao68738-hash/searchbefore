/* 解析「英文名稱為空」的許可證。

   待人工清單裡的「官方許可證名稱查無」其實是誤導 —— 那些藥在許可證
   清單裡都找得到,只是官方資料的「英文名稱」欄位是空的,所以走英文的
   比對流程對不到。

   但同一筆資料的「化學成分」欄位是完整的,可以據此識別有效成分,
   再回頭比對免訂容許量清單或 MRL。

   ⚠️ 僅產生識別線索,不自動判定法規狀態。混合劑的每個成分都要分別確認,
      只要有一個成分未涵蓋,整筆就不能視為免訂。 */

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
const exempt = read("mrl-exempt-latest.json").rows || [];
const mrl = read("latest.json").rows || [];

const text = v => String(v ?? "").trim();
const isActive = p => !text(p["撤銷類別"]) && !/\d/.test(text(p["撤銷日期"]));

/* 免訂清單:中英文都收,供成分比對 */
const exemptZh = new Set(exempt.map(r => text(r["農藥名稱"])).filter(Boolean));
const exemptEn = new Set(exempt.map(r => text(r["英文名稱"]).toUpperCase()).filter(Boolean));
const mrlEn = new Set(mrl.map(r => text(r["國際普通名稱"]).toUpperCase()).filter(Boolean));

/* 從化學成分欄拆出成分名(去掉編號、百分比、換行) */
function components(raw) {
  return text(raw)
    .split(/\r?\n|;/)
    .map(s => s.replace(/^\(\d+\)\s*/, "").replace(/\.{2,}.*$/, "").replace(/[\d.]+\s*%.*$/, "").trim())
    .filter(s => s.length >= 2);
}

/* 英文名稱為空的許可證,依中文名彙整 */
const groups = new Map();
for (const p of permits) {
  if (text(p["英文名稱"])) continue;
  const zh = text(p["中文名稱"]) || "(中文名亦空白)";
  if (!groups.has(zh)) groups.set(zh, { permits: [], active: 0 });
  const g = groups.get(zh);
  g.permits.push(p);
  if (isActive(p)) g.active++;
}

const rows = [];
for (const [zh, g] of groups) {
  const p = g.permits.find(isActive) || g.permits[0];
  const comps = components(p["化學成分"]);
  const checked = comps.map(c => {
    const up = c.toUpperCase();
    const inExempt = [...exemptEn].some(e => up.includes(e) || e.includes(up));
    const inMrl = [...mrlEn].some(e => up === e);
    return { name: c, inExempt, inMrl };
  });
  rows.push({
    zh,
    code: text(p["農藥代號"]),
    kind: text(p["農藥分類中文意義"]),
    type: text(p["農藥類別中文意義"]),
    permits: g.permits.length,
    active: g.active,
    components: checked,
    /* 混合劑只要有一個成分沒涵蓋,整筆就不能視為免訂 */
    allExempt: checked.length > 0 && checked.every(c => c.inExempt)
  });
}

rows.sort((a, b) => b.active - a.active);

/* 全部撤銷的不會進入 DATA(build-data.mjs 會濾掉),不必人工處理。
   把真正要處理的範圍縮到有效許可證。 */
const live = rows.filter(r => r.active > 0);
const dead = rows.filter(r => r.active === 0);

console.log(`許可證 ${permits.length} 張,其中英文名稱為空的 ${[...groups.values()].reduce((n, g) => n + g.permits.length, 0)} 張`);
console.log(`涵蓋 ${groups.size} 種中文名:有效 ${live.length} 種、已全數撤銷 ${dead.length} 種\n`);
console.log(`已全數撤銷的不會進入 App 的 DATA,不需人工處理:`);
console.log(`  ${dead.map(r => r.zh).join("、")}\n`);
console.log(`=== 真正需要處理的 ${live.length} 種 ===\n`);

for (const r of live) {
  console.log(`【${r.zh}】${r.kind}／${r.type}｜代號 ${r.code}｜${r.permits} 張(有效 ${r.active})`);
  if (!r.components.length) { console.log(`   化學成分欄亦為空,無從識別`); continue; }
  for (const c of r.components) {
    const marks = [c.inExempt ? "免訂清單有" : "", c.inMrl ? "MRL 有訂容許量" : ""].filter(Boolean);
    console.log(`   成分:${c.name.slice(0, 60)}${marks.length ? "  ← " + marks.join("、") : "  ← 兩邊皆查無"}`);
  }
  if (r.allExempt) console.log(`   → 所有成分都在免訂清單,但仍須人工確認名稱確為同一物質`);
  console.log("");
}

fs.writeFileSync(path.join(DIR, "無英文名解析.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "僅為識別線索。混合劑的每個成分都要分別確認,只要一個成分未涵蓋,整筆不得視為免訂。",
  groups: groups.size, rows
}, null, 2), "utf8");

const csv = ["中文名,農藥代號,分類,類別,許可證張數,有效張數,化學成分,免訂清單有,MRL有,人工判定"]
  .concat(rows.flatMap(r => r.components.length
    ? r.components.map(c => `"${r.zh}","${r.code}","${r.kind}","${r.type}",${r.permits},${r.active},"${c.name.replace(/"/g, "'").slice(0, 80)}","${c.inExempt ? "是" : ""}","${c.inMrl ? "是" : ""}",`)
    : [`"${r.zh}","${r.code}","${r.kind}","${r.type}",${r.permits},${r.active},"(化學成分亦為空)","","",`]))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "無英文名解析.csv"), "﻿" + csv, "utf8");
console.log("已產出 無英文名解析.json / .csv");
