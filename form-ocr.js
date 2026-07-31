/* 表單拍照辨識的共用核心。
 * Android 端只回傳裝置內辨識出的文字與品質指標；本檔不接收或保存照片。
 * 所有結果先形成草稿，必須由使用者逐欄確認後才能寫入紀錄。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_FORM_OCR = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROTOCOL_VERSION = 1;
  const ALLOWED_UNITS = Object.freeze(["毫升", "公升", "公克", "公斤", "ml", "mL", "L", "g", "kg"]);

  function clamp01(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function compact(value) {
    return normalizeText(value).replace(/\s+/g, "").toLocaleLowerCase("zh-Hant");
  }

  /* Android 端提供 0~1 的 sharpness/glareRatio；越清晰 sharpness 越高。 */
  function assessQuality(meta) {
    const m = meta || {};
    const width = Math.max(0, Number(m.width) || 0);
    const height = Math.max(0, Number(m.height) || 0);
    const shortEdge = Math.min(width, height);
    const coverage = clamp01(m.documentCoverage);
    const sharpness = clamp01(m.sharpness);
    const glare = clamp01(m.glareRatio);
    const skew = Math.abs(Number(m.skewDegrees) || 0);
    const corners = m.cornersDetected === true;
    const issues = [];

    function add(code, level, message) {
      issues.push(Object.freeze({ code, level, message }));
    }

    if (!corners) add("missing-corners", "blocking", "沒有完整拍到表單四個角，請重新拍攝。");
    if (shortEdge < 720) add("low-resolution", "blocking", "照片解析度不足，請靠近表單重新拍攝。");
    if (coverage < 0.45) add("document-too-small", "blocking", "表單在畫面中太小，請靠近拍攝。");
    else if (coverage < 0.65) add("document-could-be-closer", "warning", "表單可以再靠近一些，辨識會更準確。");
    if (sharpness < 0.45) add("too-blurry", "blocking", "照片太模糊，請拿穩手機重新拍攝。");
    else if (sharpness < 0.65) add("slightly-blurry", "warning", "照片稍微模糊，請特別核對辨識內容。");
    if (glare > 0.22) add("too-much-glare", "blocking", "表單反光太嚴重，請調整角度或光線。");
    else if (glare > 0.1) add("some-glare", "warning", "照片有些反光，請核對反光區域的文字。");
    if (skew > 14) add("too-skewed", "blocking", "拍攝角度過斜，請從表單正上方重新拍攝。");
    else if (skew > 8) add("some-skew", "warning", "表單略為傾斜，請仔細核對辨識內容。");

    return Object.freeze({
      canProcess: !issues.some(function (issue) { return issue.level === "blocking"; }),
      issues: Object.freeze(issues),
      metrics: Object.freeze({
        width,
        height,
        shortEdge,
        documentCoverage: coverage,
        sharpness,
        glareRatio: glare,
        skewDegrees: skew,
        cornersDetected: corners
      })
    });
  }

  function isoDate(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return "";
    const westernYear = y < 1911 ? y + 1911 : y;
    const date = new Date(Date.UTC(westernYear, m - 1, d));
    if (date.getUTCFullYear() !== westernYear || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
    return String(westernYear).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  function findDates(text) {
    const source = normalizeText(text);
    const out = [];
    const seen = new Set();
    const patterns = [
      /(?:民國\s*)?(\d{2,4})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?/g,
      /(\d{2,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g
    ];
    patterns.forEach(function (pattern) {
      let match;
      while ((match = pattern.exec(source))) {
        const value = isoDate(match[1], match[2], match[3]);
        if (value && !seen.has(value)) {
          seen.add(value);
          out.push(Object.freeze({ value, sourceText: match[0], confidence: 0.9 }));
        }
      }
    });
    return Object.freeze(out);
  }

  function findDilutions(text) {
    const source = normalizeText(text);
    const out = [];
    const seen = new Set();
    const pattern = /(\d{1,3}(?:,\d{3})*|\d+)\s*倍/g;
    let match;
    while ((match = pattern.exec(source))) {
      const value = Number(match[1].replace(/,/g, ""));
      if (value > 0 && value <= 100000 && !seen.has(value)) {
        seen.add(value);
        out.push(Object.freeze({ value, sourceText: match[0], confidence: 0.94 }));
      }
    }
    return Object.freeze(out);
  }

  function findAmounts(text) {
    const source = normalizeText(text);
    const units = ALLOWED_UNITS.map(function (unit) {
      return unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("|");
    const pattern = new RegExp("(\\d+(?:\\.\\d+)?)\\s*(" + units + ")", "g");
    const out = [];
    let match;
    while ((match = pattern.exec(source))) {
      out.push(Object.freeze({ value: Number(match[1]), unit: match[2], sourceText: match[0], confidence: 0.86 }));
    }
    return Object.freeze(out);
  }

  function dictionaryCandidates(text, values, kind) {
    const body = compact(text);
    const seen = new Set();
    const out = [];
    (values || []).forEach(function (raw) {
      const value = normalizeText(raw);
      const key = compact(value);
      if (!key || key.length < 2 || seen.has(key)) return;
      if (body.includes(key)) {
        seen.add(key);
        out.push(Object.freeze({ value, sourceText: value, confidence: 0.96, match: "exact-substring", kind }));
      }
    });
    return Object.freeze(out.sort(function (a, b) { return b.value.length - a.value.length; }).slice(0, 12));
  }

  function safeBlocks(blocks) {
    return Object.freeze((Array.isArray(blocks) ? blocks : []).slice(0, 500).map(function (block, index) {
      return Object.freeze({
        id: String(block && block.id || "block-" + (index + 1)),
        text: normalizeText(block && block.text).slice(0, 500),
        confidence: clamp01(block && block.confidence),
        box: block && block.box ? Object.freeze({
          left: clamp01(block.box.left),
          top: clamp01(block.box.top),
          right: clamp01(block.box.right),
          bottom: clamp01(block.box.bottom)
        }) : null
      });
    }).filter(function (block) { return block.text; }));
  }

  function createDraft(scanResult, dictionaries) {
    const result = scanResult || {};
    const quality = assessQuality(result.quality);
    const blocks = safeBlocks(result.blocks);
    const text = blocks.map(function (block) { return block.text; }).join("\n");
    const dict = dictionaries || {};
    return Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      requestId: String(result.requestId || "").slice(0, 100),
      source: "android-on-device-ocr",
      createdAt: String(result.createdAt || new Date().toISOString()),
      confirmed: false,
      quality,
      fields: Object.freeze({
        date: findDates(text),
        crop: dictionaryCandidates(text, dict.crops, "crop"),
        material: dictionaryCandidates(text, dict.materials, "material"),
        dilution: findDilutions(text),
        amount: findAmounts(text),
        operator: Object.freeze([])
      }),
      blocks
    });
  }

  function canCommit(draft, confirmedFields) {
    if (!draft || draft.confirmed || !draft.quality || !draft.quality.canProcess) return false;
    const fields = confirmedFields || {};
    return Boolean(fields.date && fields.crop && fields.recordType);
  }

  return Object.freeze({
    PROTOCOL_VERSION,
    normalizeText,
    assessQuality,
    findDates,
    findDilutions,
    findAmounts,
    dictionaryCandidates,
    createDraft,
    canCommit
  });
});
