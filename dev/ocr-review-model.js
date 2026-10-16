(function (root) {
  'use strict';
  const statuses = new Set(['confirmed', 'needs-fix', 'unknown']);
  function fields(input) {
    if (!Array.isArray(input) || input.length > 500) throw Error('每份案例須為最多 500 個欄位');
    const keys = new Set();
    return input.map((field, index) => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) throw Error('欄位格式錯誤');
      const value = (v, fallback = '') => {
        if (v == null) return fallback;
        if (!['string', 'number'].includes(typeof v) || String(v).length > 20000) throw Error('欄位內容格式或長度錯誤');
        return String(v);
      };
      const key = value(field.key ?? field.label, `field-${index + 1}`);
      if (!key.trim() || keys.has(key)) throw Error('欄位識別碼不得空白或重複');
      keys.add(key);
      return {
        key,
        label: value(field.label ?? field.key, '欄位'),
        group: value(field.group),
        candidate: value(field.candidate ?? field.prediction),
        truth: value(field.truth ?? field.groundTruth),
        status: statuses.has(field.status) ? field.status : 'unknown',
        note: value(field.note)
      };
    });
  }
  // Logical cell locations only: no inferred handwriting, blank truth or image geometry.
  // Taiwan material-inventory form 13 is not the public English NAF dataset.
  function form13Fields() {
    const panels = ['左上', '右上', '左中', '右中', '左下', '右下'];
    const metadata = [['materialName', '資材名稱'], ['productName', '商品名（廠牌）'],
      ['formulation', '劑型'], ['supplier', '供應商'], ['packageUnit', '包裝單位'], ['packageCapacity', '包裝容量']];
    const columns = [['date', '日期'], ['purchaseAmount', '購入量'], ['usageAmount', '使用量'], ['remainingAmount', '剩餘量']];
    const result = [];
    panels.forEach((position, index) => {
      const prefix = `p${index + 1}`;
      const group = `區 ${index + 1}（${position}）`;
      const add = (key, label) => result.push({key, label, group, candidate:'', truth:'', status:'unknown', note:''});
      metadata.forEach(([key, label]) => add(`${prefix}.header.${key}`, label));
      for (let row = 1; row <= 5; row++) columns.forEach(([key, label]) => add(`${prefix}.r${row}.${key}`, `第 ${row} 列｜${label}`));
    });
    return fields(result);
  }
  function score(input) {
    const reviewed = fields(input).filter(field => field.status !== 'unknown');
    const nonblank = reviewed.filter(field => field.truth !== '');
    const blank = reviewed.filter(field => field.truth === '');
    const exact = nonblank.filter(field => field.candidate === field.truth).length;
    return {
      reviewed: reviewed.length, unknown: input.length - reviewed.length,
      nonblank: nonblank.length, exact,
      exactRate: nonblank.length ? exact / nonblank.length : null,
      blank: blank.length, blankFalsePositives: blank.filter(field => field.candidate !== '').length
    };
  }
  const api = {fields, score, form13Fields};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OcrReviewModel = api;
})(typeof window === 'object' ? window : globalThis);
