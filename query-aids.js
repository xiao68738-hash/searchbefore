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

  return Object.freeze({
    groupStem: groupStem,
    isParentOf: isParentOf,
    relatedPests: relatedPests,
    SEED_RE: SEED_RE,
    isSeedTreatment: isSeedTreatment
  });
});
