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

/* 保留三個官方欄位；安全警語排最前，不代表可以丟掉其他用法限制。
   沿用 note 讓網頁和原生版的既有讀取器都能顯示完整內容。
   施藥方法固定帶欄名，不從藥名、劑型或空白倍數推測用途。
   sameUsage 比較完整 note，因此不同施藥方法不會被合併。 */
export function noteOf(detail) {
  const meaningful = value => {
    const s = text(value);
    return /^[-－—–]+$/.test(s) ? "" : s;
  };
  const caution = meaningful(detail["注意事項"]);
  const remark = meaningful(detail["備註"]);
  const method = meaningful(detail["施藥方法"]);
  const parts = [];
  if (caution) parts.push(caution);
  if (remark && remark !== caution) parts.push(caution ? `備註：${remark}` : remark);
  if (method) parts.push(`施藥方法：${method}`);
  return parts.join("\n");
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
