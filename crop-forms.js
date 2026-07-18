/* 噴前查 作物收穫型態消歧 PQC_CROP_FORMS
   背景:同一登記作物下,部分藥劑備註限定收穫部位/型態(例:蒜頭 vs 蒜葉、
   乾大豆 vs 毛豆)。農友分不清時可能用錯藥,殘留類別也不同。

   ── 不可破壞的原則 ──
   1. 只依備註「明確文字」分類或排除;規則正文全部來自 2026-07 版資料庫
      實際出現的語句(逐字比對後收錄,見 docs/作物收穫型態消歧.md)。
   2. 備註未註明型態的藥劑,一律歸「未註明」,不得自動歸入任何型態。
   3. 分組只影響顯示順序與提醒;任何藥劑都不得被移除——
      matched + unspecified + excluded 必須等於輸入總數(有測試把關)。
   4. 未選擇型態時,行為與原本完全相同(全部顯示)。
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_CROP_FORMS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* strict=true:此型態通常是「另有獨立商品類別」的次要部位(如葉用),
     母作物未註明的登記不能推定適用 → 未註明者移入待確認區。
     strict=false:未註明者留在主清單並標示「未註明型態」。 */
  const FORMS = {
    "蒜": { prompt: "你採收的是?", forms: [
      { id: "蒜頭", label: "蒜頭(鱗莖)", match: ["適用於蒜頭"], strict: false },
      { id: "蒜葉", label: "青蒜・蒜葉", match: ["適用於蒜葉"], strict: true }
    ]},
    "蕗蕎": { prompt: "你採收的是?", forms: [
      { id: "蕗蕎頭", label: "蕗蕎頭(鱗莖)", match: ["適用於蕗蕎頭", "適用於蕎頭"], strict: false },
      { id: "蕗蕎葉", label: "蕗蕎葉", match: ["適用於蕗蕎葉"], strict: true }
    ]},
    "珠蔥": { prompt: "你採收的是?", forms: [
      { id: "紅蔥頭", label: "紅蔥頭(鱗莖)", match: ["適用於紅蔥頭"], strict: false },
      { id: "珠蔥葉", label: "珠蔥葉", match: ["適用於珠蔥葉"], strict: true }
    ]},
    "大豆": { prompt: "你種的是?", forms: [
      { id: "乾大豆", label: "乾大豆(黃豆・黑豆)", match: ["限採收乾大豆者使用", "適用於乾大豆", "適用於乾豆"], strict: false },
      { id: "毛豆", label: "毛豆(鮮莢)", match: ["適用於毛豆", "限毛豆園使用"], strict: true }
    ]},
    "豌豆": { prompt: "你採收的是?", forms: [
      { id: "鮮豆莢", label: "鮮豆莢", match: ["適用於鮮豆", "豆莢採收前"], strict: false },
      { id: "乾豆", label: "乾豆", match: ["適用於乾豆"], strict: false },
      { id: "葉用豌豆", label: "豆苗・葉用豌豆", match: ["適用於葉用豌豆", "豆苗採收前"], strict: true }
    ]},
    "樹豆": { prompt: "你採收的是?", forms: [
      { id: "鮮豆莢", label: "鮮豆莢", match: ["適用於鮮豆"], strict: false },
      { id: "乾豆", label: "乾豆", match: ["適用於乾豆"], strict: false }
    ]},
    "花豆": { prompt: "你採收的是?", forms: [
      { id: "鮮豆莢", label: "鮮豆莢", match: ["適用於鮮豆"], strict: false },
      { id: "乾豆", label: "乾豆", match: ["適用於乾豆"], strict: false }
    ]},
    "蠶豆": { prompt: "你採收的是?", forms: [
      { id: "鮮豆莢", label: "鮮豆莢", match: ["適用於鮮豆"], strict: false },
      { id: "乾豆", label: "乾豆", match: ["適用於乾豆"], strict: false }
    ]},
    "豇豆": { prompt: "你採收的是?", forms: [
      { id: "鮮豆莢", label: "鮮豆莢(菜豆仔)", match: ["適用於鮮豆"], strict: false },
      { id: "乾豆", label: "乾豆", match: ["適用於乾豆"], strict: false }
    ]},
    "萊豆": { prompt: "你採收的是?", forms: [
      { id: "鮮豆莢", label: "鮮豆(皇帝豆)", match: ["適用於鮮豆"], strict: false },
      { id: "乾豆", label: "乾豆", match: ["適用於乾豆"], strict: false }
    ]},
    "菜豆": { prompt: "你採收的是?", forms: [
      { id: "鮮豆莢", label: "鮮豆莢(敏豆・四季豆)", match: ["適用於鮮豆"], strict: false },
      { id: "乾豆", label: "乾豆", match: ["適用於乾豆"], strict: false }
    ]},
    "豆菜類": { prompt: "你採收的是?", forms: [
      { id: "豆莢", label: "鮮豆莢", match: ["豆莢採收前"], strict: false },
      { id: "豆苗", label: "豆苗", match: ["豆苗採收前"], prohibit: ["禁止使用於豆苗"], strict: false }
    ]},
    "金針": { prompt: "你採收的是?", forms: [
      { id: "金針花", label: "金針花", match: ["適用於金針花"], strict: false },
      { id: "碧玉筍", label: "碧玉筍(嫩莖)", match: ["適用於碧玉筍", "碧玉筍採收前"], strict: true }
    ]},
    "枸杞": { prompt: "你採收的是?", forms: [
      { id: "果實", label: "枸杞果實", match: ["限採收果實者使用"], strict: false },
      { id: "枸杞葉", label: "枸杞葉", match: ["適用於枸杞葉"], strict: true }
    ]},
    "甘藷": { prompt: "你採收的是?", forms: [
      { id: "塊根", label: "甘藷(地瓜塊根)", match: [], strict: false },
      { id: "葉用甘藷", label: "地瓜葉・葉用甘藷", match: ["適用於葉用甘藷"], strict: true }
    ]},
    "甜菜": { prompt: "你採收的是?", forms: [
      { id: "根用", label: "甜菜(根用)", match: [], strict: false },
      { id: "葉用甜菜", label: "葉用甜菜", match: ["適用於葉用甜菜"], strict: true }
    ]},
    "韭": { prompt: "你種的是?", forms: [
      { id: "韭菜", label: "韭菜", match: [], strict: false },
      { id: "韭黃", label: "韭黃", match: [], prohibit: ["不得使用於韭黃"], strict: false },
      { id: "韭菜花", label: "韭菜花", match: [], prohibit: ["不得使用於韭黃及韭菜花"], strict: false }
    ]},
    "蓮": { prompt: "你採收的是?", forms: [
      { id: "蓮藕", label: "蓮藕・蓮花", match: [], strict: false },
      { id: "蓮子", label: "蓮子", match: [], prohibit: ["禁止使用於蓮子"], strict: false }
    ]}
  };

  /* 型態別名:搜尋詞 → 母作物＋預選型態。只收錄對應關係無疑義者。
     刻意不收:「豆苗」(可能指多種豆的苗)、「黑豆」型態(仍屬大豆但讓使用者自選)。 */
  const FORM_ALIAS = {
    "青蒜": { crop: "蒜", form: "蒜葉" },
    "蒜苗": { crop: "蒜", form: "蒜葉" },
    "蒜頭": { crop: "蒜", form: "蒜頭" },
    "毛豆": { crop: "大豆", form: "毛豆" },
    "黃豆": { crop: "大豆", form: "乾大豆" },
    "黑豆": { crop: "大豆", form: "" },
    "豌豆苗": { crop: "豌豆", form: "葉用豌豆" },
    "豌豆嬰": { crop: "豌豆", form: "葉用豌豆" },
    "碧玉筍": { crop: "金針", form: "碧玉筍" },
    "金針花": { crop: "金針", form: "金針花" },
    "紅蔥頭": { crop: "珠蔥", form: "紅蔥頭" },
    "蕎頭": { crop: "蕗蕎", form: "蕗蕎頭" },
    "地瓜葉": { crop: "甘藷", form: "葉用甘藷" },
    "甘藷葉": { crop: "甘藷", form: "葉用甘藷" },
    "葉用甘藷": { crop: "甘藷", form: "葉用甘藷" },
    "枸杞葉": { crop: "枸杞", form: "枸杞葉" },
    "韭菜": { crop: "韭", form: "韭菜" },
    "韭黃": { crop: "韭", form: "韭黃" },
    "韭菜花": { crop: "韭", form: "韭菜花" },
    "蓮子": { crop: "蓮", form: "蓮子" },
    "蓮藕": { crop: "蓮", form: "蓮藕" },
    "敏豆": { crop: "菜豆", form: "" },
    "四季豆": { crop: "菜豆", form: "" }
  };

  function text(v) { return String(v == null ? "" : v); }

  function hasForms(crop) {
    return Object.prototype.hasOwnProperty.call(FORMS, crop);
  }

  /* 依備註明確文字分類:回傳 {tags:[命中型態id], prohibited:[明確禁用型態id]} */
  function classify(crop, note) {
    const def = FORMS[crop];
    const out = { tags: [], prohibited: [] };
    if (!def) return out;
    const n = text(note);
    if (!n) return out;
    for (const f of def.forms) {
      if ((f.match || []).some(function (s) { return n.indexOf(s) >= 0; })) out.tags.push(f.id);
      if ((f.prohibit || []).some(function (s) { return n.indexOf(s) >= 0; })) out.prohibited.push(f.id);
    }
    return out;
  }

  /* 把藥劑「索引」分組(絕不重排原陣列,呼叫端用原索引取藥劑,確保
     帶入計算/紀錄對到同一筆)。
     回傳 {matched, unspecified, excluded:[{index, reason}]},三組聯集=全部。 */
  function splitIndices(crop, formId, agents) {
    const def = FORMS[crop];
    const all = Array.isArray(agents) ? agents : [];
    const res = { matched: [], unspecified: [], excluded: [] };
    if (!def || !formId) {
      for (let i = 0; i < all.length; i++) res.unspecified.push(i);
      return res;
    }
    const form = def.forms.find(function (f) { return f.id === formId; });
    if (!form) {
      for (let i = 0; i < all.length; i++) res.unspecified.push(i);
      return res;
    }
    for (let i = 0; i < all.length; i++) {
      const c = classify(crop, all[i] && all[i].note);
      if (c.prohibited.indexOf(formId) >= 0) {
        res.excluded.push({ index: i, reason: "備註標明不得用於此型態" });
        continue;
      }
      if (c.tags.indexOf(formId) >= 0) { res.matched.push(i); continue; }
      if (c.tags.length > 0) {
        res.excluded.push({ index: i, reason: "備註標明適用其他型態" });
        continue;
      }
      if (form.strict) {
        res.excluded.push({ index: i, reason: "未註明適用此型態,請先核對標示" });
      } else {
        res.unspecified.push(i);
      }
    }
    return res;
  }

  function formLabel(crop, formId) {
    const def = FORMS[crop];
    if (!def) return "";
    const f = def.forms.find(function (x) { return x.id === formId; });
    return f ? f.label : "";
  }

  return Object.freeze({
    FORMS: FORMS,
    FORM_ALIAS: FORM_ALIAS,
    hasForms: hasForms,
    classify: classify,
    splitIndices: splitIndices,
    formLabel: formLabel
  });
});
