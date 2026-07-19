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
