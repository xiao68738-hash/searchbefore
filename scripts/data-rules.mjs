/* DATA 轉換規則(純函式,無 I/O)。

   抽成獨立模組是為了能單元測試 —— 這幾條規則錯了不會有任何錯誤訊息,
   只會讓農友看到錯的安全採收期或看到已撤銷的藥劑。 */

export const text = v => String(v == null ? "" : v).trim();

/* 安全採收期:「18日」→ 18;「-日」「日」「-」「」→ null。

   null 與 0 意義完全不同:
     null = 未訂或不適用(例如觀賞花卉、種子處理)
     0    = 當天即可採收
   混為一談會讓倒數功能給出錯誤的可採日期,而且不會報錯。

   ── 區間寫法取「較長的一端」──
   官方資料中有 496 列是區間,例如「7-15日」「90-100日」。
   本工具的用途是避免過早採收,取較短的一端會讓農友提早採,可能導致
   殘留超標;取較長的一端最多是多等幾天。安全方向明確,所以取上限。

   注意不可直接移除非數字字元 —— 「7-15日」會變成 715,
   等於叫農友等兩年。這種錯誤不會拋例外,只會靜默產生荒謬的日期。 */
export function parsePhi(raw) {
  const s = text(raw).replace(/日$/, "").replace(/天$/, "").trim();
  if (!s || s === "-") return null;

  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;

  const values = nums.map(Number).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.max(...values);
}

/* 區間寫法保留原文供顯示,例如「7-15日」→「7-15」。

   phi 取上限是給倒數用的(保守方向),但只顯示「15」會讓農友對不上
   產品標示上的「7-15日」,反而懷疑資料錯誤。所以數字歸數字、
   顯示歸顯示:phi 供計算,phiText 供顯示。

   非區間的一律回傳空字串,避免 DATA 多出 16,000 個無用欄位。 */
export function phiTextOf(raw) {
  const s = text(raw).replace(/日$/, "").replace(/天$/, "").trim();
  if (!s || s === "-") return "";
  const nums = s.match(/\d+(?:\.\d+)?/g);
  return nums && nums.length > 1 ? nums.join("-") : "";
}

/* 作用機制:IRAC(殺蟲)/FRAC(殺菌)/HRAC(除草)擇一 */
const MOA_FIELDS = [
  ["IRAC", "IRAC殺蟲劑抗藥性"],
  ["FRAC", "FRAC殺菌劑抗藥性"],
  ["HRAC", "HRAC除草劑抗藥性"]
];
export function moaOf(p) {
  for (const [label, field] of MOA_FIELDS) {
    const v = text(p[field]);
    if (v && v !== "-") return `${label} ${v}`;
  }
  return "";
}

export function keyOf(p) {
  return `${p["許可證字"] || ""}-${p["許可證號"] || ""}`;
}

/* 已廢止的許可證不應出現在查詢結果 —— 農友照著用會買不到,
   更糟的是那可能正是被撤銷的原因。

   注意:未撤銷時「撤銷日期」不是空字串,而是「   /  /  」這種
   只有空白與斜線的佔位字串。單純 trim 後判斷非空,會把全部許可證
   都當成已撤銷,結果是產出空的 DATA。以「是否含數字」判斷才正確。 */
export function isActive(p) {
  const type = text(p["撤銷類別"]);
  const date = text(p["撤銷日期"]);
  return !type && !/\d/.test(date);
}

/* 判斷兩筆用法是否可合併(商品名不列入比較) */
export function sameUsage(a, b) {
  return a.name === b.name && a.form === b.form && a.content === b.content &&
    a.dilution === b.dilution && a.phi === b.phi && a.dose === b.dose &&
    a.times === b.times && a.note === b.note &&
    (a.phiText || "") === (b.phiText || "");
}

/* 備註欄:官方分成「注意事項」與「備註」兩個欄位。

   「注意事項」全資料只有 138 列有值,內容是「鐵具腐蝕性」這類安全警語;
   「備註」有 92,773 列,多為施用方式說明。兩者皆有值的 46 列中,
   現行 DATA 取的是「注意事項」—— 安全警語優先於施用說明,這是對的,
   所以沿用同樣的優先順序。

   只讀「備註」會讓那 92 列只有注意事項的紀錄失去警語,而且不會有
   任何錯誤訊息。 */
export function noteOf(detail) {
  const caution = text(detail["注意事項"]);
  if (caution && caution !== "-") return caution;
  return text(detail["備註"]);
}

/* 由許可證與一列使用範圍組出 DATA 的項目。

   phiText 只在區間寫法時才加入(全資料 496 列)。
   若無條件加入,DATA 會多出 17,000 個空字串欄位而毫無用途。 */
export function makeEntry(permit, detail) {
  const entry = {
    name: text(permit["中文名稱"]),
    form: text(permit["劑型"]),
    content: text(permit["含量"]),
    dilution: text(detail["稀釋倍數"]),
    phi: parsePhi(detail["安全採收期"]),
    dose: text(detail["每公頃使用用藥量"]),
    times: text(detail["施用次數"]),
    moa: moaOf(permit),
    note: noteOf(detail),
    bl: []
  };
  const range = phiTextOf(detail["安全採收期"]);
  if (range) entry.phiText = range;
  return entry;
}
