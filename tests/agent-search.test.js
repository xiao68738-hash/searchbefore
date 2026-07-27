/* 藥劑本位查詢 — 釋出前全量稽核(#33)

   這支測試守的是三件會「靜默出錯」的事:
   1. 採收期方向 —— 藥劑本位若直接用 a.phi,會比作物本位短(全庫數百列),
      且會經由「帶入計算/記施藥」污染採收倒數,農友可能提早採收。
      這類錯誤不會拋例外、畫面也看不出來,只能靠測試擋。
   2. 索引與 DATA 脫鉤 —— 索引一旦改成「複製資料」而非「存參照」,
      倍數/採收期就可能與 DATA 不一致而無人察覺。
   3. 合法性外推 —— 只能列該藥劑實際登記的作物,不得由上位類別推得。
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../query-aids.js");
const S = require("../safety.js");

/* 取出與 App 相同的 DATA */
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("const DATA=");
let i = html.indexOf("{", start), depth = 0, end = -1, inStr = false, esc = false;
for (let p = i; p < html.length; p++) {
  const c = html[p];
  if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
  if (c === '"') { inStr = true; continue; }
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { end = p; break; } }
}
const DATA = JSON.parse(html.slice(i, end + 1));

const t0 = Date.now();
const idx = A.buildAgentIndex(DATA);
const buildMs = Date.now() - t0;

/* ── 1. 採收期:方向必須保守,且與作物本位同一套規則 ── */
{
  let rows = 0, adjusted = 0, shorter = 0, nullFilled = 0;
  const worst = [];
  for (const rec of idx.byName.values()) {
    for (const r of rec.rows) {
      rows++;
      const ep = S.effectivePhi(r.a);
      const raw = typeof r.a.phi === "number" ? r.a.phi : null;
      if (ep.adjusted) {
        adjusted++;
        if (raw === null && ep.phi !== null) nullFilled++;
        else if (raw !== null && ep.phi > raw) { shorter++; if (worst.length < 3) worst.push(`${r.a.name}×${r.crop} ${raw}→${ep.phi}天`); }
      }
      /* 核心不變式:採用值不得短於原始值(短了就是叫農友提早採收) */
      if (raw !== null && ep.phi !== null) {
        assert.ok(ep.phi >= raw,
          `採收期不得比原始登記短:${r.a.name}×${r.crop} 原始 ${raw} 天,採用 ${ep.phi} 天`);
      }
      /* 備註寫了天數就不得顯示為「見標示」 */
      if (ep.notePhi !== null) {
        assert.ok(ep.phi !== null,
          `備註有明確天數就不得留白:${r.a.name}×${r.crop} 備註 ${ep.notePhi} 天`);
      }
    }
  }
  assert.ok(adjusted > 0, "全庫應存在需依備註調整採收期的列(否則此測試失去意義)");
  console.log(`  ↳ 採收期依備註調整 ${adjusted} / ${rows} 列(其中 ${shorter} 列若用原始值會過短、${nullFilled} 列會誤顯示「見標示」)`);
  if (worst.length) console.log(`  ↳ 例:${worst.join("、")}`);
}

/* ── 2. 索引必須「存參照」,不得複製資料 ── */
{
  let rows = 0, sameObject = 0, total = 0;
  for (const c of Object.keys(DATA)) for (const p of Object.keys(DATA[c])) total += DATA[c][p].length;
  for (const rec of idx.byName.values()) {
    for (const r of rec.rows) {
      rows++;
      if (((DATA[r.crop] || {})[r.pest] || []).indexOf(r.a) >= 0) sameObject++;
    }
  }
  assert.equal(rows, total, `索引應涵蓋全部 ${total} 筆藥劑列,實際 ${rows}`);
  assert.equal(sameObject, rows,
    "索引每一列都必須是 DATA 內的同一物件 —— 一旦改成複製資料,倍數/採收期就可能與 DATA 不一致");
}

/* ── 3. 不得外推:分組只列實際登記 ── */
{
  for (const name of ["納乃得", "賽洛寧"]) {
    if (!idx.byName.has(name)) continue;
    const groups = A.agentRegistrations(name, idx);
    const rec = idx.byName.get(name);
    assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), rec.rows.length, "分組不得遺漏或重複");
    assert.equal(groups.length, rec.crops.size, "分組數應等於登記作物數");
    for (const g of groups) {
      assert.ok(DATA[g.crop], `分組作物必須真的存在於 DATA:${g.crop}`);
      for (const r of g.rows) {
        assert.equal(r.crop, g.crop);
        const list = (DATA[g.crop] || {})[r.pest];
        assert.ok(list && list.indexOf(r.a) >= 0,
          `${name} 於 ${g.crop}/${r.pest} 必須是實際登記,不得由分類外推`);
      }
    }
  }
}

/* ── 4. 商品名入口:歧義必須全部列出 ── */
{
  let ambiguous = 0;
  for (const [brand, names] of idx.byBrand) {
    if (names.size < 2) continue;
    ambiguous++;
    const hits = A.agentSuggestions(brand, idx, 24).map(h => h.name);
    for (const n of names) {
      assert.ok(hits.indexOf(n) >= 0,
        `歧義商品名「${brand}」必須列出全部候選(缺 ${n}),不得自動挑一個`);
    }
  }
  console.log(`  ↳ 商品名 ${idx.byBrand.size} 個,其中 ${ambiguous} 個對到多個普通名稱,皆已列出全部候選`);
}

/* ── 5. 效能預算:索引建立不得失控 ── */
{
  assert.ok(buildMs < 500, `索引建立 ${buildMs}ms,超出預算(瀏覽器實測約 11.5ms,留大幅餘裕)`);
  const q0 = Date.now();
  for (let n = 0; n < 200; n++) A.agentSuggestions("松", idx, 24);
  const qMs = Date.now() - q0;
  assert.ok(qMs < 2000, `200 次查詢 ${qMs}ms,超出預算`);
  console.log(`  ↳ 索引建立 ${buildMs}ms(${idx.byName.size} 普通名稱 / ${idx.byBrand.size} 商品名)、200 次查詢 ${qMs}ms`);
}

console.log("✓ 藥劑本位:採收期方向保守且不留白、索引存參照、不外推、歧義商品名全列、效能在預算內");
