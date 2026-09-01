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

/* ── 搜尋容錯:只能提供建議,不得自動選定 ── */
assert.equal(A.normalizeSearchText(" 番 茄（果） "), "番茄果");
assert.equal(A.damerauLevenshtein("番茄", "茄番"), 1, "相鄰字顛倒應算一次編輯");
assert.equal(A.bopomofoToPinyin("ㄈㄢㄑㄧㄝ"), "fanqie", "連續注音應能轉成拼音");
assert.equal(A.candidateMatch("番笳", "番茄").kind, "typo", "錯一字只能列為可能錯字");
assert.equal(A.candidateMatch("茄番", "番茄").kind, "reordered", "字序顛倒應明確標示");
assert.equal(A.candidateMatch("蕃茄", "番茄").kind, "homophone", "中文同音字應能提出建議");
assert.equal(A.candidateMatch("fanqie", "番茄").kind, "pinyin", "完整拼音應能查中文名稱");
assert.equal(A.candidateMatch("fq", "番茄").kind, "pinyin-initials", "拼音縮寫應能查中文名稱");
assert.equal(A.candidateMatch("ㄈㄢㄑㄧㄝ", "番茄").kind, "bopomofo", "注音應能查中文名稱");
assert.equal(A.candidateMatch("我想找番茄可以用什麼", "番茄").kind, "semantic", "句子中已知名稱只能列為待確認候選");
assert.equal(A.candidateMatch("完全不相關", "番茄"), null, "不相關內容不得硬猜");

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
assert.ok(A.isSeedTreatment({ dose: "0.5G/1公斤種子", note: "" }));
assert.equal(A.isSeedTreatment({ note: "採收前3天停止施藥。" }), false);
assert.equal(A.isSeedTreatment({ note: "種子須先催芽後再播種於苗床" }), false, "只描述播種前準備，不等於藥劑用於種子處理");
assert.equal(A.isSeedTreatment({ note: "" }), false);
assert.equal(A.isSeedTreatment(null), false);

/* 稀釋欄位不一定是倍數：不可把施用水量、原液或空值顯示成「--倍」。 */
assert.equal(A.isDilutionMultiple("1,500"), true);
assert.equal(A.isDilutionMultiple("500-1,000"), true);
assert.equal(A.isDilutionMultiple("稀釋至600公升"), false);
assert.equal(A.isDilutionMultiple("--"), false);
assert.deepEqual(A.usagePresentation({ dilution: "1,500" }), {
  kind: "dilution", label: "稀釋倍數", value: "1,500 倍", detail: "", raw: "1,500", canCalculateDilution: true, isSpecial: false
});
assert.equal(A.usagePresentation({ dilution: "", note: "限拌種使用" }).kind, "seed_treatment");
assert.equal(A.usagePresentation({ dilution: "", note: "限拌種使用" }).value, "種子處理");
assert.equal(A.usagePresentation({ dilution: "-", dose: "0.5G/1公斤種子" }).label, "施用用途");
assert.equal(A.usagePresentation({ dilution: "稀釋至600公升" }).kind, "water_volume");
assert.equal(A.usagePresentation({ dilution: "稀釋至600公升" }).value, "依登記水量施用");
assert.equal(A.usagePresentation({ dilution: "稀釋至600公升" }).detail, "稀釋至600公升");
assert.equal(A.usagePresentation({ dilution: "原液" }).kind, "undiluted");
assert.equal(A.usagePresentation({ dilution: "--" }).canCalculateDilution, false);

const peaTachigaren = DATA["豌豆"]["立枯病"].find(a => a.name === "脫克松");
assert.ok(peaTachigaren, "應存在豌豆／立枯病／脫克松登記資料");
assert.equal(A.usagePresentation(peaTachigaren).value, "種子處理");
assert.equal(A.usagePresentation(peaTachigaren).canCalculateDilution, false);

/* 作物用藥總覽只反向整理既有登記資料，不得自行增加防治對象。 */
{
  const first = { name: "亞托敏", form: "水懸劑", src: "蔥" };
  const second = { name: "亞托敏", form: "水分散性粒劑", src: "蔥" };
  const other = { name: "測試藥劑", form: "乳劑", src: "蔥" };
  const overview = A.cropAgentOverview({
    "紫斑病": { list: [first, other] },
    "露菌病": { list: [second] },
    "疫病": { list: [first] }
  });
  assert.equal(overview[0].name, "亞托敏", "涵蓋較多防治對象的藥劑應優先顯示");
  assert.deepEqual(overview[0].pests, ["疫病", "紫斑病", "露菌病"].sort((a, b) => a.localeCompare(b, "zh-Hant")));
  assert.equal(overview[0].rows.length, 3, "同一藥劑的不同登記列不得遺漏");
  assert.equal(overview[0].rows[0].a, first, "總覽必須保留原始登記物件參照");
  assert.deepEqual(A.cropAgentOverview(null), []);
}

/* 全庫:種子處理藥劑應存在且其採收期本就多為空值 */
{
  let seed = 0, seedWithPhi = 0;
  let special = 0, invalidMultiple = 0, specialWithMultipleWording = 0;
  for (const crop of Object.keys(DATA)) for (const pest of Object.keys(DATA[crop])) for (const a of DATA[crop][pest]) {
    if (A.isSeedTreatment(a)) { seed++; if (a.phi != null) seedWithPhi++; }
    const usage = A.usagePresentation(a);
    if (usage.isSpecial) special++;
    if (usage.isSpecial && /倍/.test(usage.label + usage.value)) specialWithMultipleWording++;
    if (usage.canCalculateDilution && !A.isDilutionMultiple(a.dilution)) invalidMultiple++;
  }
  assert.ok(seed >= 30, "全庫應辨識出種子處理藥劑(排查:35 筆)");
  assert.equal(seedWithPhi, 0, "種子處理藥劑的採收期應皆為空值(故顯示為不適用)");
  assert.ok(special >= 1000, `全庫應辨識所有沒有數字稀釋資料的特殊用法,實際 ${special}`);
  assert.equal(specialWithMultipleWording, 0, "沒有數字稀釋資料的用途標籤不得出現『倍』字");
  assert.equal(invalidMultiple, 0, "只有純數字倍數資料可以進入倍數計算");
}

assert.ok(html.includes("特殊施用方式("), "查詢畫面須將特殊施用方式移到獨立區塊");
assert.ok(html.includes("不適用稀釋計算"), "特殊用法須停用稀釋計算按鈕");
assert.ok(!html.includes('${esc(r.a.dilution||"—")} 倍'), "藥劑本位查詢不得替空白或橫線資料加上『倍』");
assert.ok(html.includes("已登記用藥總覽"), "選擇作物後須提供已登記用藥總覽");
assert.ok(html.includes('id="cropOverviewSearch"'), "總覽須能依藥劑或病蟲害篩選");
assert.ok(html.includes("cropOverviewData(CUR)"), "總覽須由目前作物的登記資料產生");
assert.ok(html.includes('src="./brand-logo-transparent.png"'), "登入頁須改用透明 Logo 素材");
assert.ok(html.includes("box-shadow:none;background:transparent"), "登入 Logo 不得帶卡片背景或陰影");

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

  /* 近似藥名只回候選與原因,不得自行進入某支藥的登記內容 */
  if (idx.byName.has("納乃得")) {
    for (const q of ["納乃德", "nanaide", "ㄋㄚˋㄋㄞˇㄉㄜˊ", "乃納得", "我想找納乃得的登記資料"]) {
      const fuzzy = A.agentSuggestions(q, idx, 24);
      const hit = fuzzy.find(h => h.name === "納乃得");
      assert.ok(hit, `近似輸入「${q}」應建議納乃得`);
      assert.ok(hit.reasonLabel, `近似輸入「${q}」必須顯示命中原因`);
      assert.deepEqual(A.agentRegistrations(q, idx), [], "近似輸入本身不得被當成正式藥名");
    }
  }

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
