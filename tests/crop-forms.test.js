const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CF = require("../crop-forms.js");

/* ── 從 index.html 取出真實 DATA(與 App 相同資料來源)── */
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("const DATA=");
assert.ok(start > 0, "index.html 應包含 DATA");
let i = html.indexOf("{", start), depth = 0, end = -1, inStr = false, esc = false;
for (let p = i; p < html.length; p++) {
  const c = html[p];
  if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
  if (c === '"') { inStr = true; continue; }
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { end = p; break; } }
}
const DATA = JSON.parse(html.slice(i, end + 1));

function agentsOf(crop) {
  const out = [];
  for (const pest of Object.keys(DATA[crop] || {})) for (const a of DATA[crop][pest]) out.push(a);
  return out;
}

/* ── 1. 表格完整性:每個型態作物都存在於資料庫,規則文字真的出現在備註 ── */
for (const [crop, def] of Object.entries(CF.FORMS)) {
  assert.ok(DATA[crop], "FORMS 作物必須存在於資料庫:" + crop);
  const notes = agentsOf(crop).map(a => String(a.note || "")).join("\n");
  const ids = def.forms.map(f => f.id);
  assert.equal(new Set(ids).size, ids.length, crop + " 型態 id 不得重複");
  for (const f of def.forms) {
    for (const s of (f.match || []).concat(f.prohibit || [])) {
      assert.ok(notes.indexOf(s) >= 0, `規則文字必須實際存在於「${crop}」備註:「${s}」`);
    }
  }
}

/* ── 2. 分組不變量:對每個型態作物×每個型態,matched+unspecified+excluded = 全部,無重複 ── */
for (const [crop, def] of Object.entries(CF.FORMS)) {
  const agents = agentsOf(crop);
  for (const f of def.forms) {
    const r = CF.splitIndices(crop, f.id, agents);
    const all = r.matched.concat(r.unspecified, r.excluded.map(e => e.index)).sort((a, b) => a - b);
    assert.equal(all.length, agents.length, `${crop}/${f.id} 分組後總數必須不變`);
    assert.equal(new Set(all).size, all.length, `${crop}/${f.id} 不得有重複索引`);
    for (let k = 0; k < all.length; k++) assert.equal(all[k], k, `${crop}/${f.id} 索引必須完整涵蓋 0..n-1`);
    for (const e of r.excluded) assert.ok(e.reason, `${crop}/${f.id} 排除必須附理由`);
  }
  /* 未選型態=全部維持原狀(與現行行為相同) */
  const r0 = CF.splitIndices(crop, "", agents);
  assert.equal(r0.unspecified.length, agents.length, crop + " 未選型態時不得改變任何顯示");
  assert.equal(r0.matched.length + r0.excluded.length, 0);
}

/* ── 3. 實際案例抽驗(回饋來源的案例必須正確) ── */
const c1 = CF.classify("蒜", "適用於蒜頭。");
assert.deepEqual(c1.tags, ["蒜頭"], "蒜頭備註應命中蒜頭");
const c2 = CF.classify("蒜", "僅限苗期使用。適用於蒜葉。");
assert.deepEqual(c2.tags, ["蒜葉"], "蒜葉備註應命中蒜葉");
const c3 = CF.classify("蒜", "1.避免於開花期使用。");
assert.deepEqual(c3.tags, [], "無型態文字不得自動歸類");
const c4 = CF.classify("大豆", "1.使用本藥劑後不可與根菜類作物輪作，以免蓄積殘留。2.限採收乾大豆者使用");
assert.deepEqual(c4.tags, ["乾大豆"]);
const c5 = CF.classify("豌豆", "1.豆莢採收前3天停止施藥。2.豆苗採收前9天停止施藥。");
assert.deepEqual(c5.tags.sort(), ["葉用豌豆", "鮮豆莢"], "同時標兩型態天數者應同時命中");
const c6 = CF.classify("韭", "不得使用於韭黃及韭菜花。");
assert.deepEqual(c6.prohibited.sort(), ["韭菜花", "韭黃"], "禁用備註應標記兩型態");
assert.deepEqual(c6.tags, []);
const c7 = CF.classify("蓮", "禁止使用於蓮子。");
assert.deepEqual(c7.prohibited, ["蓮子"]);

/* ── 4. 蒜的實資料分佈抽驗(與盤查報告一致才可信) ── */
{
  const agents = agentsOf("蒜");
  const rHead = CF.splitIndices("蒜", "蒜頭", agents);
  const rLeaf = CF.splitIndices("蒜", "蒜葉", agents);
  assert.ok(rHead.matched.length >= 20, "蒜頭應有明確標註藥劑(盤查:23)");
  assert.ok(rLeaf.matched.length >= 18, "蒜葉應有明確標註藥劑(盤查:20)");
  /* 蒜葉為 strict:未註明者必須進待確認區,不得留在主清單 */
  assert.equal(rLeaf.unspecified.length, 0, "蒜葉(strict)未註明者應移入待確認");
  /* 蒜頭為非 strict:未註明者留在主清單 */
  assert.ok(rHead.unspecified.length > 0, "蒜頭(非strict)未註明者應保留於主清單");
}

/* ── 5. 別名:目標作物必存在;帶型態者其型態必存在 ── */
for (const [alias, t] of Object.entries(CF.FORM_ALIAS)) {
  assert.ok(DATA[t.crop], `別名「${alias}」的目標作物必須存在:${t.crop}`);
  if (t.form) {
    assert.ok(CF.hasForms(t.crop), `別名「${alias}」帶型態時,${t.crop} 必須有型態定義`);
    assert.ok(CF.FORMS[t.crop].forms.some(f => f.id === t.form), `別名「${alias}」的型態必須存在:${t.form}`);
  }
  assert.ok(!DATA[alias], `「${alias}」若已是獨立作物就不該做成別名`);
}

/* ── 6. splitIndices 絕不修改輸入陣列 ── */
{
  const agents = agentsOf("大豆");
  const snapshot = JSON.stringify(agents);
  CF.splitIndices("大豆", "毛豆", agents);
  assert.equal(JSON.stringify(agents), snapshot, "splitIndices 不得修改原陣列(索引安全)");
}

console.log("✓ 型態規則全部可溯源至實際備註文字");
console.log("✓ 型態分組不遺漏、不重複、不重排,未選型態時行為不變");
console.log("✓ 蒜/大豆/豌豆/韭/蓮 實案例與別名對照正確");
