/* 噴前查 查詢輔助 PQC_AIDS
   兩個獨立但都屬「查詢顯示輔助」的功能:

   A. 害物從屬提示 —— 群組(如「夜蛾類」)與具體物種(如「斜紋夜蛾」)在資料庫
      是各自獨立條目,藥劑清單常完全不重疊(排查:42 組從屬中 18 組交集為 0)。
      只做「可發現性」提示,不合併清單。

   B. 種子/種苗處理辨識 —— 這類藥劑於播種前施用,採收期本就不適用;
      現行顯示「見標示」易被誤解為資料缺漏,也可能被誤當噴施用藥。

   ── 不可破壞的原則 ──
   1. 從屬只採「子項名稱完整包含群組字根」(strong);僅末字相同者一律不算
      (排查證實會產生「毒蛾類⊃斜紋夜蛾」「根蟎類⊃二點葉蟎」等誤判)。
   2. 從屬提示不得自動合併藥劑清單(同交接文件安全規則 7)。
   3. 種子處理辨識只依備註明確文字,不推測。
   4. 兩者皆為顯示層輔助,不參與安全採收期計算。
   詳見 docs/害物從屬階層排查.md
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_AIDS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ── A. 害物從屬 ── */
  function groupStem(pest) {
    const p = String(pest || "");
    return /類$/.test(p) ? p.slice(0, -1) : null;
  }
  /* group 是否為 child 的上位:group 必須是「⋯類」,且 child 完整包含其字根 */
  function isParentOf(group, child) {
    if (group === child) return false;
    const stem = groupStem(group);
    if (!stem) return false;
    return String(child || "").includes(stem);
  }
  /* 同一作物內,與 pest 有從屬關係的其他害物。
     回傳 [{pest, relation:"parent"|"child", agentCount}],依藥劑數多寡排序。 */
  function relatedPests(crop, pest, data) {
    const bucket = (data && data[crop]) || null;
    if (!bucket || !pest || !bucket[pest]) return [];
    const out = [];
    for (const other of Object.keys(bucket)) {
      if (other === pest) continue;
      let relation = null;
      if (isParentOf(other, pest)) relation = "parent";
      else if (isParentOf(pest, other)) relation = "child";
      if (!relation) continue;
      out.push({ pest: other, relation: relation, agentCount: (bucket[other] || []).length });
    }
    return out.sort(function (a, b) { return b.agentCount - a.agentCount; });
  }

  /* ── B. 種子/種苗處理 ── */
  const SEED_RE = /浸種|拌種|種子處理|種苗處理|浸漬|浸苗|種薯|催芽/;
  function isSeedTreatment(agent) {
    if (!agent) return false;
    return SEED_RE.test(String(agent.note || ""));
  }

  /* ── C. 藥劑本位索引(DATA 是作物本位,這裡建反向索引) ──
     設計依據見 docs/藥劑本位查詢-設計.md:
     - rows 只存「參照」,a 直接指向 DATA 內既有物件,不複製資料。
       這讓索引與 DATA 不可能出現倍數/採收期不一致(結構性保證)。
     - 入口以「普通名稱」為 key;劑型/含量的差異留到結果頁分層呈現。
     - 商品名另建索引,因農友多半記得商品名而非普通名稱。 */
  function buildAgentIndex(data) {
    const byName = new Map();
    const byBrand = new Map();
    const crops = Object.keys(data || {});
    for (let ci = 0; ci < crops.length; ci++) {
      const crop = crops[ci];
      const pests = data[crop] || {};
      const pestNames = Object.keys(pests);
      for (let pi = 0; pi < pestNames.length; pi++) {
        const pest = pestNames[pi];
        const list = pests[pest] || [];
        for (let ai = 0; ai < list.length; ai++) {
          const a = list[ai];
          const name = a && a.name;
          if (!name) continue;
          let rec = byName.get(name);
          if (!rec) { rec = { name: name, rows: [], crops: new Set() }; byName.set(name, rec); }
          rec.rows.push({ crop: crop, pest: pest, a: a });
          rec.crops.add(crop);
          const bl = a.bl || [];
          for (let bi = 0; bi < bl.length; bi++) {
            let s = byBrand.get(bl[bi]);
            if (!s) { s = new Set(); byBrand.set(bl[bi], s); }
            s.add(name);
          }
        }
      }
    }
    return { byName: byName, byBrand: byBrand };
  }

  /* 藥劑建議:先完全相同,再包含比對;普通名稱優先於商品名。
     一個商品名可能對到多個普通名稱(資料中有 6 例),一律全部列出,
     不自動挑一個 —— 挑錯會把農友導向另一支藥。 */
  function agentSuggestions(q, index, limit) {
    q = String(q == null ? "" : q).trim();
    if (!q || !index || !index.byName) return [];
    limit = limit || 24;
    const out = [];
    const seen = new Set();
    function add(name, kind, brand) {
      if (seen.has(name) || out.length >= limit) return;
      const rec = index.byName.get(name);
      if (!rec) return;
      seen.add(name);
      out.push({
        name: name, kind: kind, brand: brand || "",
        cropCount: rec.crops.size, rowCount: rec.rows.length
      });
    }
    if (index.byName.has(q)) add(q, "direct", "");
    const exactBrand = index.byBrand && index.byBrand.get(q);
    if (exactBrand) exactBrand.forEach(function (n) { add(n, "brand", q); });
    const names = index.byName.keys();
    for (let it = names.next(); !it.done && out.length < limit; it = names.next()) {
      if (String(it.value).indexOf(q) >= 0) add(it.value, "direct", "");
    }
    if (index.byBrand) {
      const brands = index.byBrand.entries();
      for (let it = brands.next(); !it.done && out.length < limit; it = brands.next()) {
        const brand = it.value[0];
        if (String(brand).indexOf(q) >= 0) it.value[1].forEach(function (n) { add(n, "brand", brand); });
      }
    }
    return out;
  }

  /* 某藥劑的登記內容,依作物分組。只回傳該藥劑「實際登記」者,
     絕不由作物分類或群組外推 —— 未列出不代表可以使用。 */
  function agentRegistrations(name, index) {
    const rec = index && index.byName && index.byName.get(name);
    if (!rec) return [];
    const byCrop = new Map();
    for (let i = 0; i < rec.rows.length; i++) {
      const r = rec.rows[i];
      let g = byCrop.get(r.crop);
      if (!g) { g = { crop: r.crop, rows: [] }; byCrop.set(r.crop, g); }
      g.rows.push(r);
    }
    return Array.from(byCrop.values()).sort(function (x, y) {
      return y.rows.length - x.rows.length || String(x.crop).localeCompare(String(y.crop), "zh-Hant");
    });
  }

  return Object.freeze({
    groupStem: groupStem,
    isParentOf: isParentOf,
    relatedPests: relatedPests,
    SEED_RE: SEED_RE,
    isSeedTreatment: isSeedTreatment,
    buildAgentIndex: buildAgentIndex,
    agentSuggestions: agentSuggestions,
    agentRegistrations: agentRegistrations
  });
});
