(function (root) {
  'use strict';
  const statuses = new Set(['confirmed', 'needs-fix', 'unknown']);
  function fields(input) {
    if (!Array.isArray(input) || input.length > 500) throw Error('每份案例須為最多 500 個欄位');
    return input.map((field, index) => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) throw Error('欄位格式錯誤');
      const value = (v, fallback = '') => {
        if (v == null) return fallback;
        if (!['string', 'number'].includes(typeof v) || String(v).length > 20000) throw Error('欄位內容格式或長度錯誤');
        return String(v);
      };
      return {
        key: value(field.key ?? field.label, `field-${index + 1}`),
        label: value(field.label ?? field.key, '欄位'),
        candidate: value(field.candidate ?? field.prediction),
        truth: value(field.truth ?? field.groundTruth),
        status: statuses.has(field.status) ? field.status : 'unknown',
        note: value(field.note)
      };
    });
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
  const api = {fields, score};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OcrReviewModel = api;
})(typeof window === 'object' ? window : globalThis);
