/* 拆解混合劑,逐一比對每個成分。

   總表中「疑似混合劑」的藥名(如鋅錳座賽胺、銅右滅達樂)是多個有效成分
   的組合。許可證的「化學成分」欄有完整組成,可據以拆解。

   判定原則:混合劑只要有一個成分未涵蓋,整筆就不得視為已解決。
   這條不能放寬 —— 農友噴的是整瓶藥,每個成分都會殘留。 */

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
const exempt = read("mrl-exempt-latest.json").rows || [];
const master = read("殘留物對照總表.json");
const spec = read("殘留物定義規則.json");

const text = v => String(v ?? "").trim();
const strip = s => text(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

/* 比對用索引 */
const mrlEn = new Map(), mrlZh = new Map();
for (const r of mrl) {
  const en = text(r["國際普通名稱"]), zh = text(r["普通名稱"]);
  if (en && !mrlEn.has(strip(en))) mrlEn.set(strip(en), { en, zh });
  if (zh && !mrlZh.has(zh)) mrlZh.set(zh, en);
}
const exEn = new Map(), exZh = new Set();
for (const r of exempt) {
  const en = text(r["英文名稱"]), zh = text(r["農藥名稱"]);
  if (en) exEn.set(strip(en), zh);
  if (zh) exZh.add(zh);
}
/* 法規群組成員(如二硫代胺基甲酸鹽類) */
const groupOf = new Map();
for (const rule of spec.rules) {
  const target = rule.target || rule.group;
  for (const m of rule.members) {
    if (m.en) groupOf.set(strip(m.en), target);
    if (m.zh) groupOf.set(m.zh, target);
  }
}

/* 許可證:中文名 → 化學成分 */
const zh2chem = new Map();
for (const p of permits) {
  const zh = text(p["中文名稱"]);
  const chem = text(p["化學成分"]);
  if (zh && chem && !zh2chem.has(zh)) zh2chem.set(zh, chem);
}

function components(raw) {
  return text(raw)
    .split(/\r?\n|;|＋|\+/)
    .map(s => s.replace(/^\(\d+\)\s*/, "").replace(/\.{2,}.*$/, "").replace(/[\d.]+\s*%.*$/, "").trim())
    .filter(s => s.length >= 3);
}

function lookup(name) {
  const k = strip(name);
  if (groupOf.has(k)) return { where: "法規群組", target: groupOf.get(k) };
  if (mrlEn.has(k)) return { where: "MRL 有訂容許量", target: mrlEn.get(k).zh || mrlEn.get(k).en };
  if (exEn.has(k)) return { where: "免訂容許量", target: exEn.get(k) };
  /* 名稱包含關係:化學成分常寫全名,MRL 寫通用名 */
  for (const [ek, v] of mrlEn) if (ek.length >= 6 && (k.includes(ek) || ek.includes(k))) {
    return { where: "MRL(名稱包含,需確認)", target: v.zh || v.en };
  }
  for (const [ek, v] of exEn) if (ek.length >= 6 && (k.includes(ek) || ek.includes(k))) {
    return { where: "免訂(名稱包含,需確認)", target: v };
  }
  return null;
}

/* ── 中文名切分 ──
   化學成分欄寫的是 IUPAC 化學名(manganese ethylenebis(dithiocarbamate)),
   對不上 MRL 的通用名。但混合劑的中文名本身就是成分名的組合:
     鋅錳座賽胺 = 鋅錳(乃浦) + 座賽胺
     銅右滅達樂 = 銅 + 右滅達樂
   以已知的中文藥名做最長優先切分,比化學名比對可靠得多。 */
const knownZh = new Set([...mrlZh.keys()]);
for (const p of permits) {
  const zh = text(p["中文名稱"]);
  if (zh) knownZh.add(zh);
}
for (const rule of spec.rules) for (const m of rule.members) if (m.zh) knownZh.add(m.zh);
/* 長的優先,避免「錳乃浦」被切成「錳」 */
const zhSorted = [...knownZh].filter(n => n.length >= 2).sort((a, b) => b.length - a.length);

function segmentZh(name) {
  const parts = [];
  let rest = String(name || "").trim();
  let guard = 0;
  while (rest && guard++ < 12) {
    const hit = zhSorted.find(n => n !== name && rest.startsWith(n));
    if (hit) { parts.push({ zh: hit, matched: true }); rest = rest.slice(hit.length); continue; }
    /* 從後面找:成分可能不在開頭 */
    const tail = zhSorted.find(n => n !== name && rest.endsWith(n));
    if (tail) { parts.push({ zh: tail, matched: true }); rest = rest.slice(0, -tail.length); continue; }
    break;
  }
  if (rest) parts.push({ zh: rest, matched: false });
  return parts;
}

function lookupZh(zh) {
  if (groupOf.has(zh)) return { where: "法規群組", target: groupOf.get(zh) };
  if (mrlZh.has(zh)) return { where: "MRL 有訂容許量", target: zh };
  if (exZh.has(zh)) return { where: "免訂容許量", target: zh };
  return null;
}

/* 混合劑命名常把成分名截短:鋅錳乃浦 → 鋅錳、錳乃浦 → 錳、福賽得 → 福賽。
   以前綴找候選,但有多個候選時一律列出不猜 ——
   「本達」可能是本達樂也可能是本達隆,兩者是不同的藥。 */
function prefixCandidates(frag) {
  if (!frag || frag.length < 1) return [];
  const cands = [];
  for (const n of knownZh) {
    if (n.length > frag.length && n.startsWith(frag) && (mrlZh.has(n) || exZh.has(n) || groupOf.has(n))) {
      cands.push(n);
    }
  }
  return [...new Set(cands)].sort((a, b) => a.length - b.length).slice(0, 4);
}

/* 只處理總表中尚未有明確依據、且疑似混合劑者 */
const targets = master.rows.filter(r => r.level >= 4 && /混合劑/.test(r.tier));

const rows = [];
for (const r of targets) {
  /* 先用中文切分,查不到再退回化學成分 */
  const segs = segmentZh(r.appName);
  let checked = segs.map(s => {
    const hit = s.matched ? lookupZh(s.zh) : null;
    if (hit) return { name: s.zh, hit, from: "中文名切分" };
    /* 前綴候選一律只當建議,不自動視為已解決。

       第一版對單一候選就自動推定,結果把「銅右滅達樂」的「銅」推定成
       註一的「銅合浦」—— 但那個銅是銅劑,不是二硫代胺基甲酸鹽。
       「撲克拉錳」(prochloraz-manganese)更是錳的錯合物,
       不是撲克拉加錳乃浦。

       單字或雙字的碎片在中文農藥命名裡歧義太大,自動推定會給出
       完全錯誤的殘留物歸屬,而且看起來很合理,不易察覺。 */
    const cands = prefixCandidates(s.zh);
    return { name: s.zh, hit: null, cand: cands, from: cands.length ? "前綴候選" : "中文名切分" };
  });
  let allHit = checked.length > 0 && checked.every(c => c.hit);

  if (!checked.some(c => c.hit)) {
    const comps = components(zh2chem.get(r.appName));
    if (comps.length) {
      checked = comps.map(c => ({ name: c, hit: lookup(c), from: "化學成分" }));
      allHit = checked.length > 0 && checked.every(c => c.hit);
    }
  }
  rows.push({ ...r, chem: zh2chem.get(r.appName) || "", components: checked, allHit });
}

rows.sort((a, b) => b.uses - a.uses);
const done = rows.filter(r => r.allHit);
const partial = rows.filter(r => !r.allHit && r.components.some(c => c.hit));
const none = rows.filter(r => !r.components.some(c => c.hit));

console.log(`疑似混合劑 ${rows.length} 種\n`);
console.log(`  所有成分都查到:${done.length} 種(影響 ${done.reduce((n, r) => n + r.uses, 0)} 處)`);
console.log(`  部分成分查到  :${partial.length} 種(影響 ${partial.reduce((n, r) => n + r.uses, 0)} 處)`);
console.log(`  完全查不到    :${none.length} 種(影響 ${none.reduce((n, r) => n + r.uses, 0)} 處)\n`);

for (const r of rows) {
  const mark = r.allHit ? "✅" : (r.components.some(c => c.hit) ? "⚠️" : "❌");
  console.log(`${mark} ${String(r.uses).padStart(4)} 處  ${r.appName}`);
  if (!r.components.length) { console.log(`        (許可證無化學成分資料)`); continue; }
  for (const c of r.components) {
    const tail = c.hit ? `→ ${c.hit.target}(${c.hit.where})`
      : (c.cand && c.cand.length ? `→ 候選 ${c.cand.join(" / ")}(需人工擇一)` : "→ 查無");
    console.log(`        ${c.name.slice(0, 24).padEnd(26)} ${tail}`);
  }
  if (!r.allHit && r.components.some(c => c.hit)) {
    console.log(`        ⚠️ 有成分未涵蓋,整筆不得視為已解決`);
  }
}

fs.writeFileSync(path.join(DIR, "混合劑拆解.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "混合劑只要有一個成分未涵蓋,整筆不得視為已解決。農友噴的是整瓶藥,每個成分都會殘留。",
  total: rows.length, allHit: done.length, partial: partial.length, none: none.length, rows
}, null, 2), "utf8");

const csv = ["藥劑名稱,影響用途數,成分,對應目標,來源,整筆是否全數涵蓋,人工確認(是/否)"]
  .concat(rows.flatMap(r => r.components.length
    ? r.components.map(c => `"${r.appName}",${r.uses},"${c.name.replace(/"/g, "'").slice(0, 70)}","${c.hit ? c.hit.target : (c.cand || []).join(" / ")}","${c.hit ? c.hit.where : ((c.cand || []).length ? "前綴候選,需擇一" : "查無")}","${r.allHit ? "是" : "否"}",`)
    : [`"${r.appName}",${r.uses},"(無化學成分資料)","","","否",`]))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "混合劑拆解.csv"), "﻿" + csv, "utf8");
console.log("\n已產出 混合劑拆解.json / .csv");
