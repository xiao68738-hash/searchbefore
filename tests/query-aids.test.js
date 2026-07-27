const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../query-aids.js");

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

/* ── A. 害物從屬 ── */
assert.equal(A.groupStem("夜蛾類"), "夜蛾");
assert.equal(A.groupStem("斜紋夜蛾"), null, "非群組不得有字根");

/* strong 成立 */
assert.ok(A.isParentOf("夜蛾類", "斜紋夜蛾"));
assert.ok(A.isParentOf("介殼蟲類", "粉介殼蟲類"), "群組間階層也須成立");
assert.ok(A.isParentOf("潛蠅類", "斑潛蠅類"));

/* weak 誤判必須全部不成立(排查報告列出的實例) */
for (const [g, c] of [["毒蛾類", "斜紋夜蛾"], ["螟蛾類", "小菜蛾"], ["根蟎類", "二點葉蟎"],
                      ["蚜蟲類", "鱗翅目害蟲"], ["蚜蟲類", "根瘤線蟲"], ["細蟎類", "神澤氏葉蟎"]]) {
  assert.equal(A.isParentOf(g, c), false, `不得誤判從屬:${g} ⊅ ${c}`);
}
assert.equal(A.isParentOf("夜蛾類", "夜蛾類"), false, "自己不是自己的上位");

/* 實案例:十字花科小葉菜類 斜紋夜蛾 → 應提示夜蛾類,且藥劑不重疊 */
{
  const rel = A.relatedPests("十字花科小葉菜類", "斜紋夜蛾", DATA);
  const parent = rel.find(r => r.pest === "夜蛾類");
  assert.ok(parent, "斜紋夜蛾應提示上位的夜蛾類");
  assert.equal(parent.relation, "parent");
  assert.ok(parent.agentCount >= 30, "夜蛾類應有大量藥劑(排查:33)");
  /* 反向:夜蛾類應提示子項 */
  const back = A.relatedPests("十字花科小葉菜類", "夜蛾類", DATA);
  assert.ok(back.some(r => r.pest === "斜紋夜蛾" && r.relation === "child"), "夜蛾類應提示子項斜紋夜蛾");
  /* 確認排查結論:兩者藥劑完全不重疊 */
  const key = a => [a.name, a.content, a.dilution].join("|");
  const g = new Set(DATA["十字花科小葉菜類"]["夜蛾類"].map(key));
  const s = new Set(DATA["十字花科小葉菜類"]["斜紋夜蛾"].map(key));
  assert.equal([...s].filter(x => g.has(x)).length, 0, "排查結論:交集為 0");
}

/* 無從屬的害物不得產生提示 */
assert.deepEqual(A.relatedPests("番茄", "銀葉粉蝨", DATA).filter(r => r.relation === "child"), [],
  "具體物種不應有子項");

/* 不存在的作物/害物要安全回空陣列 */
assert.deepEqual(A.relatedPests("不存在作物", "夜蛾類", DATA), []);
assert.deepEqual(A.relatedPests("番茄", "不存在害物", DATA), []);

/* 全庫掃描:relatedPests 不得回傳非同作物的害物 */
{
  let checked = 0;
  for (const crop of Object.keys(DATA)) {
    for (const pest of Object.keys(DATA[crop])) {
      for (const r of A.relatedPests(crop, pest, DATA)) {
        assert.ok(DATA[crop][r.pest], `${crop}/${pest} 提示的 ${r.pest} 必須同作物存在`);
        checked++;
      }
    }
  }
  assert.ok(checked > 0, "應有從屬提示產生");
}

/* ── B. 種子/種苗處理 ── */
assert.ok(A.isSeedTreatment({ note: "限拌種使用" }));
assert.ok(A.isSeedTreatment({ note: "1.將稻種浸種消毒催芽至芽長0.5公釐" }));
assert.ok(A.isSeedTreatment({ note: "1. 適用於水稻種子處理。" }));
assert.ok(A.isSeedTreatment({ note: "浸種球30分鐘。" }));
assert.equal(A.isSeedTreatment({ note: "採收前3天停止施藥。" }), false);
assert.equal(A.isSeedTreatment({ note: "" }), false);
assert.equal(A.isSeedTreatment(null), false);

/* 全庫:種子處理藥劑應存在且其採收期本就多為空值 */
{
  let seed = 0, seedWithPhi = 0;
  for (const crop of Object.keys(DATA)) for (const pest of Object.keys(DATA[crop])) for (const a of DATA[crop][pest]) {
    if (A.isSeedTreatment(a)) { seed++; if (a.phi != null) seedWithPhi++; }
  }
  assert.ok(seed >= 30, "全庫應辨識出種子處理藥劑(排查:35 筆)");
  assert.equal(seedWithPhi, 0, "種子處理藥劑的採收期應皆為空值(故顯示為不適用)");
}

console.log("✓ 害物從屬只採 strong,排查列出的 weak 誤判全部不成立");
console.log("✓ 從屬提示限同作物,實案例(斜紋夜蛾↔夜蛾類,交集0)正確");
console.log("✓ 種子/種苗處理辨識正確,且該類藥劑採收期皆為空值");

/* ── C. 藥劑本位索引 ──
   最重要的不變式:索引只存「參照」,不複製資料。
   一旦有人改成複製,倍數/採收期就可能與 DATA 不一致而無人察覺,
   下面的 identity 檢查就是為了擋住那次改動。 */
{
  const idx = A.buildAgentIndex(DATA);
  assert.ok(idx.byName.size > 100, `普通名稱應有數百種,實際 ${idx.byName.size}`);
  assert.ok(idx.byBrand.size > 1000, `商品名應有數千種,實際 ${idx.byBrand.size}`);

  /* 雙向一致性:索引每一列都必須能在 DATA 正向查回「同一個物件」 */
  let rows = 0, sameObject = 0;
  for (const rec of idx.byName.values()) {
    for (const r of rec.rows) {
      rows++;
      const list = (DATA[r.crop] || {})[r.pest] || [];
      if (list.indexOf(r.a) >= 0) sameObject++;   // indexOf 用嚴格相等 → 證明是同一物件
    }
  }
  assert.equal(sameObject, rows, "索引每一列都必須是 DATA 內的同一物件(不可複製資料)");
  assert.ok(rows > 10000, `索引列數應為全庫規模,實際 ${rows}`);

  /* 涵蓋完整:DATA 內每一筆藥劑都要進索引 */
  let total = 0;
  for (const c of Object.keys(DATA)) for (const p of Object.keys(DATA[c])) total += DATA[c][p].length;
  assert.equal(rows, total, `索引應涵蓋全部 ${total} 筆藥劑列`);

  /* 建議:普通名稱直接命中 */
  const someName = idx.byName.keys().next().value;
  const s1 = A.agentSuggestions(someName, idx, 24);
  assert.equal(s1[0].name, someName, "完全相同的普通名稱應排第一");
  assert.equal(s1[0].kind, "direct");
  assert.ok(s1[0].cropCount >= 1);

  /* 建議:商品名可作為入口,且歧義商品名須列出全部候選(不自動挑一個) */
  let ambiguous = null;
  for (const [brand, names] of idx.byBrand) if (names.size > 1) { ambiguous = [brand, names]; break; }
  if (ambiguous) {
    const hits = A.agentSuggestions(ambiguous[0], idx, 24).map(h => h.name);
    for (const n of ambiguous[1]) {
      assert.ok(hits.indexOf(n) >= 0, `歧義商品名 ${ambiguous[0]} 必須列出候選 ${n},不得自動挑一個`);
    }
  }

  /* 空字串/不存在不得炸,也不得回傳結果 */
  assert.deepEqual(A.agentSuggestions("", idx, 24), []);
  assert.deepEqual(A.agentSuggestions("  ", idx, 24), []);
  assert.deepEqual(A.agentSuggestions("這個藥名不存在xyz", idx, 24), []);
  assert.deepEqual(A.agentRegistrations("這個藥名不存在xyz", idx), []);
  assert.equal(A.agentSuggestions("x", null, 24).length, 0);

  /* limit 必須生效(賽洛寧類的常見字會命中很多) */
  assert.ok(A.agentSuggestions("松", idx, 3).length <= 3, "limit 必須生效");

  /* 分組:只列實際登記,且分組後的總列數等於該藥劑的全部列數(不遺漏、不外推) */
  const big = [...idx.byName.values()].sort((a, b) => b.rows.length - a.rows.length)[0];
  const groups = A.agentRegistrations(big.name, idx);
  const grouped = groups.reduce((n, g) => n + g.rows.length, 0);
  assert.equal(grouped, big.rows.length, "分組不得遺漏或重複任何一列");
  assert.equal(groups.length, big.crops.size, "分組數應等於登記作物數");
  for (const g of groups) {
    for (const r of g.rows) {
      assert.equal(r.crop, g.crop, "分組內每列都必須屬於該作物");
      assert.ok((DATA[g.crop] || {})[r.pest], "分組列出的防治對象必須真的登記於該作物");
    }
  }
}

console.log("✓ 藥劑本位索引:只存參照(與 DATA 同物件)、涵蓋全庫、分組不遺漏");
console.log("✓ 藥劑建議:普通名稱優先、商品名可入口、歧義商品名列出全部候選");
