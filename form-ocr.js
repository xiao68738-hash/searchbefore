/* 表單拍照辨識的共用核心。
 * OCR 端只回傳辨識文字與品質指標；本檔不接收或保存照片。
 * 所有結果先形成草稿，必須由使用者逐欄確認後才能寫入紀錄。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_FORM_OCR = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROTOCOL_VERSION = 1;
  const ALLOWED_UNITS = Object.freeze(["毫升", "公升", "公克", "公斤", "台斤", "c.c.", "c.c", "cc", "ml", "mL", "L", "g", "kg", "包", "袋"]);
  const EQUIPMENT_ITEMS = Object.freeze(["噴霧機", "割草機", "中耕機", "選別機", "貯藏／溫控設備", "搬運車", "冷藏車"]);
  const EQUIPMENT_ACTIONS = Object.freeze(["清潔", "保養", "維修", "校正"]);
  const SELF_INSPECTION_TEMPLATE = Object.freeze({
    id: "fruit-tgap-self-inspection-v1",
    title: "水果類作物生產及出貨自我查核表",
    sections: Object.freeze([
      Object.freeze({
        code: "3.1", title: "種苗使用管理", items: Object.freeze([
          Object.freeze({ code: "3.1.1", title: "種苗來源與證明文件" }),
          Object.freeze({ code: "3.1.2", title: "定植或嫁接作業紀錄" }),
          Object.freeze({ code: "3.1.3", title: "繁殖材料保管與環境清潔" }),
          Object.freeze({ code: "3.1.4", title: "繁殖材料處理或檢驗紀錄" })
        ])
      }),
      Object.freeze({
        code: "3.2", title: "樹體管理（含採收前果實）", items: Object.freeze([
          Object.freeze({ code: "3.2.1", title: "病蟲害部位清除與果園清潔" }),
          Object.freeze({ code: "3.2.2", title: "整枝修剪與通風採光" }),
          Object.freeze({ code: "3.2.3", title: "依最適期執行套袋" }),
          Object.freeze({ code: "3.2.4", title: "查詢災害預警並預先因應" }),
          Object.freeze({ code: "3.2.5", title: "防風林或防鳥設施" })
        ])
      }),
      Object.freeze({
        code: "3.3", title: "灌溉", items: Object.freeze([
          Object.freeze({ code: "3.3.1", title: "供水設備檢查、清潔與維護" }),
          Object.freeze({ code: "3.3.2", title: "異常天候後灌溉水質檢測" }),
          Object.freeze({ code: "3.3.3", title: "水源與穩定供水管理" }),
          Object.freeze({ code: "3.3.4", title: "排水避免污染環境" }),
          Object.freeze({ code: "3.3.5", title: "營養液設備清潔維護" }),
          Object.freeze({ code: "3.3.6", title: "供應養液管線定期清洗" }),
          Object.freeze({ code: "3.3.7", title: "選用合適資材並管理輸送管路" }),
          Object.freeze({ code: "3.3.8", title: "依作物需求正確施用肥灌資材" })
        ])
      }),
      Object.freeze({
        code: "3.4", title: "肥料", items: Object.freeze([
          Object.freeze({ code: "3.4.1", title: "依施肥標準或診斷結果訂定計畫" }),
          Object.freeze({ code: "3.4.2", title: "作業人員熟悉肥料施用管理" }),
          Object.freeze({ code: "3.4.3", title: "合法肥料、來源標示與採購憑據" }),
          Object.freeze({ code: "3.4.4", title: "自製肥料原料與製程紀錄" }),
          Object.freeze({ code: "3.4.5", title: "自製堆肥原料、製程與腐熟" }),
          Object.freeze({ code: "3.4.6", title: "自製堆肥檢驗報告" }),
          Object.freeze({ code: "3.4.7", title: "肥料施用紀錄完整性" }),
          Object.freeze({ code: "3.4.8", title: "採收前避免污染可食部位" }),
          Object.freeze({ code: "3.4.9", title: "肥料入出庫管理紀錄" }),
          Object.freeze({ code: "3.4.10", title: "肥料離地並遠離水源與農產品" }),
          Object.freeze({ code: "3.4.11", title: "儲放場所防漏與遮蔽" }),
          Object.freeze({ code: "3.4.12", title: "肥料分類儲放與環境清潔" }),
          Object.freeze({ code: "3.4.13", title: "危險物確認與安全儲存" })
        ])
      })
    ])
  });
  const FORM_TYPES = Object.freeze({
    pesticide: Object.freeze({ label: "病蟲害防治／用藥", markers: Object.freeze(["病蟲害防治", "環境消毒", "防治對象", "安全採收期", "稀釋倍數"]) }),
    fertilizer: Object.freeze({ label: "肥料施用", markers: Object.freeze(["肥料施用紀錄", "施肥別", "基肥", "追肥", "肥適用"]) }),
    purchase: Object.freeze({ label: "資材購入／庫存", markers: Object.freeze(["入出庫紀錄", "購入量", "使用量", "剩餘量", "供應商"]) }),
    cultivation: Object.freeze({ label: "栽培作業", markers: Object.freeze(["栽培工作紀錄", "工作事項", "整地", "水份管理", "田間作業"]) }),
    harvest: Object.freeze({ label: "採收", markers: Object.freeze(["採收紀錄", "採收日期", "採收量"]) }),
    postharvest: Object.freeze({ label: "採後處理", markers: Object.freeze(["採後處理", "分級", "包裝", "預冷"]) }),
    equipmentMaintenance: Object.freeze({ label: "器具／機械／設備管理", markers: Object.freeze(["器具/機械/設備之保養、維修、校正及清潔管理紀錄", "器具/機械/設備", "作業內容", "噴霧機", "清潔", "保養", "維修", "校正"]) }),
    selfInspection: Object.freeze({ label: "生產及出貨自我查核表", markers: Object.freeze(["農作物生產及出貨作業自我查核表", "查核項目", "查核頻率", "查核者", "確認日期", "程度", "備註"]) }),
    profile: Object.freeze({ label: "基本資料／田區資料", markers: Object.freeze(["基本資料", "經營農戶姓名", "農地地籍號碼", "栽培總面積"]) })
  });

  const DOCUMENT_ROUTES = Object.freeze({
    pesticide: Object.freeze({ route: "production-record", destination: "farm-form", l3MappingStatus: "unmapped" }),
    fertilizer: Object.freeze({ route: "production-record", destination: "farm-form", l3MappingStatus: "unmapped" }),
    cultivation: Object.freeze({ route: "production-record", destination: "farm-form", l3MappingStatus: "unmapped" }),
    harvest: Object.freeze({ route: "production-record", destination: "farm-form", l3MappingStatus: "unmapped" }),
    postharvest: Object.freeze({ route: "production-record", destination: "farm-form", l3MappingStatus: "unmapped" }),
    equipmentMaintenance: Object.freeze({ route: "supporting-record", destination: "local-equipment-record", l3MappingStatus: "unconfirmed" }),
    purchase: Object.freeze({ route: "material-ledger", destination: "material-inventory-review", l3MappingStatus: "unconfirmed" }),
    selfInspection: Object.freeze({ route: "reference-only", destination: "reference-review", l3MappingStatus: "not-applicable" }),
    profile: Object.freeze({ route: "master-data", destination: "manual-review-only", l3MappingStatus: "unmapped" })
  });

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

  /* 裝置端可提供客觀品質指標；雲端模式目前改由使用者在上傳前明確確認照片品質。 */
  function assessQuality(meta) {
    const m = meta || {};
    const width = Math.max(0, Number(m.width) || 0);
    const height = Math.max(0, Number(m.height) || 0);
    const shortEdge = Math.min(width, height);
    const coverage = clamp01(m.documentCoverage);
    const sharpness = clamp01(m.sharpness);
    const glare = clamp01(m.glareRatio);
    const skew = Math.abs(Number(m.skewDegrees) || 0);
    const cornersConfirmedByUser = m.cornersConfirmedByUser === true;
    const corners = m.cornersDetected === true || cornersConfirmedByUser;
    const manualPhotoCheck = m.assessment === "user-confirmed-before-upload";
    const issues = [];

    function add(code, level, message) {
      issues.push(Object.freeze({ code, level, message }));
    }

    if (!corners) add("missing-corners", "blocking", "沒有完整拍到表單四個角，請重新拍攝。");
    if (shortEdge < 720) add("low-resolution", "blocking", "照片解析度不足，請靠近表單重新拍攝。");
    if (!manualPhotoCheck) {
      if (coverage < 0.45) add("document-too-small", "blocking", "表單在畫面中太小，請靠近拍攝。");
      else if (coverage < 0.65) add("document-could-be-closer", "warning", "表單可以再靠近一些，辨識會更準確。");
      if (sharpness < 0.45) add("too-blurry", "blocking", "照片太模糊，請拿穩手機重新拍攝。");
      else if (sharpness < 0.65) add("slightly-blurry", "warning", "照片稍微模糊，請特別核對辨識內容。");
      if (glare > 0.22) add("too-much-glare", "blocking", "表單反光太嚴重，請調整角度或光線。");
      else if (glare > 0.1) add("some-glare", "warning", "照片有些反光，請核對反光區域的文字。");
      if (skew > 14) add("too-skewed", "blocking", "拍攝角度過斜，請從表單正上方重新拍攝。");
      else if (skew > 8) add("some-skew", "warning", "表單略為傾斜，請仔細核對辨識內容。");
    }

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
        cornersDetected: corners,
        cornersConfirmedByUser,
        assessment: manualPhotoCheck ? "user-confirmed-before-upload" : "measured"
      })
    });
  }

  function isoDate(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return "";
    const westernYear = y >= 1 && y <= 300 ? y + 1911 : (y >= 1912 && y <= 2200 ? y : 0);
    if (!westernYear) return "";
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
      /(?:民國\s*)?(\d{2,4})\s*[,，]\s*(\d{1,2})\s*(?:月|[/.,，\-])\s*(\d{1,2})\s*日?/g,
      /(?:民國\s*)?(\d{3,4})\s+(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g,
      /(\d{2,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g
    ];
    patterns.forEach(function (pattern) {
      let match;
      while ((match = pattern.exec(source))) {
        const value = isoDate(match[1], match[2], match[3]);
        if (value && !seen.has(value)) {
          seen.add(value);
          out.push(Object.freeze({ value, sourceText: match[0], sourceIndex: match.index, confidence: 0.9 }));
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

  function findSafetyIntervals(text) {
    const source = normalizeText(text);
    const out = [];
    const seen = new Set();
    const patterns = [
      /(?:安全採收期|採收期)\s*(?:\(天\))?\s*[:：]?\s*(\d{1,3})\s*(?:天|日|D)?/gi,
      /(?:^|[\s,，;；])([1-9]\d{0,2})\s*[dD](?=$|[\s,，;；])/g
    ];
    patterns.forEach(function (pattern) {
      let match;
      while ((match = pattern.exec(source))) {
        const value = Number(match[1]);
        if (value <= 365 && !seen.has(value)) {
          seen.add(value);
          out.push(Object.freeze({ value, sourceText: match[0].trim(), confidence: pattern === patterns[0] ? 0.94 : 0.72 }));
        }
      }
    });
    if (/安全採收期[^\n]{0,12}(?:未訂|未定|不適用)/.test(source)) {
      out.push(Object.freeze({ value: null, sourceText: "安全採收期未訂／不適用", confidence: 0.9 }));
    }
    return Object.freeze(out);
  }

  function detectFormTypes(text) {
    const body = compact(text);
    const out = Object.keys(FORM_TYPES).map(function (value) {
      const def = FORM_TYPES[value];
      const matched = def.markers.filter(function (marker) { return body.includes(compact(marker)); });
      return Object.freeze({
        value,
        label: def.label,
        sourceText: matched.join("、"),
        markerCount: matched.length,
        confidence: Math.min(0.99, matched.length ? 0.58 + matched.length * 0.1 : 0)
      });
    }).filter(function (item) { return item.markerCount > 0; });
    return Object.freeze(out.sort(function (a, b) {
      return b.markerCount - a.markerCount || b.confidence - a.confidence;
    }));
  }

  function decideDocumentRoute(recordTypes) {
    const candidates = Array.isArray(recordTypes) ? recordTypes : [];
    const top = candidates[0];
    const runnerUp = candidates[1];
    if (!top || top.markerCount < 2) {
      return Object.freeze({
        status: "unknown",
        type: null,
        route: "unknown",
        destination: "manual-classification",
        l3MappingStatus: "not-mapped",
        reason: "沒有足夠的同類表單標記，必須由使用者選擇文件用途"
      });
    }
    if (runnerUp && runnerUp.markerCount === top.markerCount) {
      return Object.freeze({
        status: "ambiguous",
        type: null,
        route: "unknown",
        destination: "manual-classification",
        l3MappingStatus: "not-mapped",
        reason: "兩種文件的辨識標記數相同，禁止自動採用第一名"
      });
    }
    const route = DOCUMENT_ROUTES[top.value];
    if (!route) {
      return Object.freeze({
        status: "unknown",
        type: null,
        route: "unknown",
        destination: "manual-classification",
        l3MappingStatus: "not-mapped",
        reason: "沒有可用的文件分流規則"
      });
    }
    return Object.freeze({
      status: "exact",
      type: top.value,
      route: route.route,
      destination: route.destination,
      l3MappingStatus: route.l3MappingStatus,
      reason: "辨識到 " + top.markerCount + " 個同類表單標記"
    });
  }

  function findPlotCodes(text) {
    const source = normalizeText(text);
    const out = [];
    const seen = new Set();
    const patterns = [
      /(?:田區(?:代號)?|區域)\s*[:：]?\s*([A-Za-zＡ-Ｚａ-ｚ0-9０-９+＋、,，\-]{1,12}\s*區?)/g,
      /(?:^|[\s,，])([A-Za-zＡ-Ｚａ-ｚ](?:\s*[+＋、,，]\s*[A-Za-zＡ-Ｚａ-ｚ])?\s*區)(?=$|[\s,，])/g
    ];
    patterns.forEach(function (pattern, patternIndex) {
      let match;
      while ((match = pattern.exec(source))) {
        const value = normalizeText(match[1]).replace(/\s+/g, "").replace(/＋/g, "+").toUpperCase();
        const key = compact(value);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(Object.freeze({ value, sourceText: match[0].trim(), confidence: patternIndex === 0 ? 0.9 : 0.76 }));
      }
    });
    return Object.freeze(out);
  }

  function findLabeledValues(text, labels, kind) {
    const source = normalizeText(text);
    const escaped = (labels || []).map(function (label) {
      return String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("|");
    if (!escaped) return Object.freeze([]);
    const pattern = new RegExp("(?:" + escaped + ")\\s*[:：]?\\s*([^\\n｜|]{2,24})", "g");
    const out = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(source))) {
      const value = normalizeText(match[1]).replace(/^[*＊]/, "").trim();
      const key = compact(value);
      if (!key || seen.has(key) || /^(日期|田區|作物|防治對象|資材名稱|使用量)/.test(value)) continue;
      seen.add(key);
      out.push(Object.freeze({ value, sourceText: match[0], confidence: 0.72, kind }));
    }
    return Object.freeze(out.slice(0, 8));
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

  function optionPattern(value) {
    return normalizeText(value).split("").map(function (char) {
      return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("\\s*");
  }

  function findMarkedOptions(text, values, kind) {
    const source = normalizeText(text);
    const body = compact(source);
    return Object.freeze((values || []).map(function (value) {
      if (!body.includes(compact(value))) return null;
      const marked = new RegExp("(?:☑|✓|√|■|▣|[Vv])\\s*" + optionPattern(value)).test(source);
      return Object.freeze({
        value,
        sourceText: value,
        confidence: marked ? 0.84 : 0.46,
        selected: marked,
        kind
      });
    }).filter(Boolean));
  }

  function safeBox(value) {
    if (!value || typeof value !== "object") return null;
    return Object.freeze({
      left: clamp01(value.left),
      top: clamp01(value.top),
      right: clamp01(value.right),
      bottom: clamp01(value.bottom)
    });
  }

  function safeIndex(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 100000 ? number : 0;
  }

  function safeDetectedBreak(value) {
    if (!value || typeof value !== "object") return null;
    const allowed = ["UNKNOWN", "SPACE", "SURE_SPACE", "EOL_SURE_SPACE", "HYPHEN", "LINE_BREAK"];
    const type = allowed.indexOf(String(value.type || "")) >= 0 ? String(value.type) : "UNKNOWN";
    return Object.freeze({ type, isPrefix: value.isPrefix === true });
  }

  function safeBlockWords(words, blockId, remainingWords) {
    const source = Array.isArray(words) ? words : [];
    const limit = Math.max(0, Math.min(200, Number(remainingWords) || 0));
    return Object.freeze(source.slice(0, limit).map(function (word, index) {
      const text = normalizeText(word && word.text).slice(0, 128);
      if (!text) return null;
      return Object.freeze({
        id: String(word && word.id || blockId + "-w" + (index + 1)).slice(0, 160),
        text,
        confidence: clamp01(word && word.confidence),
        box: safeBox(word && word.box),
        detectedBreak: safeDetectedBreak(word && word.detectedBreak)
      });
    }).filter(Boolean));
  }

  function safeBlocks(blocks) {
    let totalWords = 0;
    const out = [];
    (Array.isArray(blocks) ? blocks : []).slice(0, 500).forEach(function (block, index) {
      const id = String(block && block.id || "block-" + (index + 1)).slice(0, 160);
      const text = normalizeText(block && block.text).slice(0, 500);
      if (!text) return;
      const sourceWords = Array.isArray(block && block.words) ? block.words : [];
      const words = safeBlockWords(sourceWords, id, 5000 - totalWords);
      totalWords += words.length;
      const source = block && block.source && typeof block.source === "object" ? Object.freeze({
        pageIndex: safeIndex(block.source.pageIndex),
        blockIndex: safeIndex(block.source.blockIndex),
        paragraphIndex: safeIndex(block.source.paragraphIndex)
      }) : null;
      out.push(Object.freeze({
        id,
        text,
        confidence: clamp01(block && block.confidence),
        box: safeBox(block && block.box),
        source,
        blockBox: safeBox(block && block.blockBox),
        words,
        wordsTruncated: !!(block && block.wordsTruncated) || words.length < sourceWords.length
      }));
    });
    return Object.freeze(out);
  }

  function safeLayout(value) {
    if (!value || typeof value !== "object") return null;
    return Object.freeze({
      version: Math.max(1, Math.min(10, Number(value.version) || 1)),
      coordinateSpace: value.coordinateSpace === "normalized" ? "normalized" : "unknown",
      indexBase: Number(value.indexBase) === 0 ? 0 : 1,
      wordGeometry: value.wordGeometry === true
    });
  }

  function safeSourceImage(value) {
    if (!value || typeof value !== "object") return null;
    const id = String(value.sourceImageId || "");
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) return null;
    return Object.freeze({
      sourceImageId: id,
      fileName: String(value.fileName || "辨識來源").slice(0, 240),
      sourceIndex: safeIndex(value.sourceIndex),
      status: value.status === "recognized" ? "recognized" : "queued",
      mimeType: String(value.mimeType || "").slice(0, 100),
      sizeBytes: Math.max(0, Math.min(Number(value.sizeBytes) || 0, 25 * 1024 * 1024)),
      lastModified: Math.max(0, Number(value.lastModified) || 0)
    });
  }

  function blockCenter(block) {
    if (!block || !block.box) return null;
    return (block.box.top + block.box.bottom) / 2;
  }

  function findEquipmentMaintenanceRows(blocks) {
    const list = Array.isArray(blocks) ? blocks : [];
    const anchors = [];
    let inheritedYear = "";
    list.forEach(function (block, blockIndex) {
      const fullDates = findDates(block.text);
      const fullRanges = fullDates.map(function (date) {
        return [date.sourceIndex, date.sourceIndex + date.sourceText.length];
      });
      const dateParts = fullDates.map(function (date) { return { date, full: true }; });
      const partialPattern = /(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g;
      let partialMatch;
      while ((partialMatch = partialPattern.exec(block.text))) {
        const leading = /^\d/.test(partialMatch[0]) ? 0 : 1;
        const sourceIndex = partialMatch.index + leading;
        if (fullRanges.some(function (range) { return sourceIndex >= range[0] && sourceIndex < range[1]; })) continue;
        dateParts.push({ month: partialMatch[1], day: partialMatch[2], sourceIndex, sourceText: partialMatch[0].slice(leading), full: false });
      }
      dateParts.sort(function (a, b) {
        const aIndex = a.full ? a.date.sourceIndex : a.sourceIndex;
        const bIndex = b.full ? b.date.sourceIndex : b.sourceIndex;
        return aIndex - bIndex;
      });
      const dates = [];
      dateParts.forEach(function (part) {
        if (part.full) {
          inheritedYear = part.date.value.slice(0, 4);
          dates.push(part.date);
          return;
        }
        if (!inheritedYear) return;
        const value = isoDate(inheritedYear, part.month, part.day);
        if (!value) return;
        dates.push(Object.freeze({ value, sourceText: part.sourceText, sourceIndex: part.sourceIndex, confidence: 0.68, inheritedYear: true }));
      });
      dates.forEach(function (date, dateIndex) {
        const nextDate = dates[dateIndex + 1];
        anchors.push({
          date,
          blockIndex,
          dateIndex,
          center: blockCenter(block),
          segmentText: dates.length > 1
            ? block.text.slice(date.sourceIndex, nextDate ? nextDate.sourceIndex : block.text.length)
            : ""
        });
      });
    });
    anchors.sort(function (a, b) {
      const aCenter = a.center == null ? Number.POSITIVE_INFINITY : a.center;
      const bCenter = b.center == null ? Number.POSITIVE_INFINITY : b.center;
      return aCenter - bCenter || a.blockIndex - b.blockIndex || a.dateIndex - b.dateIndex;
    });
    const rows = anchors.slice(0, 30).map(function (anchor, index) {
      const previous = anchors[index - 1];
      const next = anchors[index + 1];
      const top = anchor.center == null || !previous || previous.center == null ? -1 : (previous.center + anchor.center) / 2;
      const bottom = anchor.center == null || !next || next.center == null ? 2 : (anchor.center + next.center) / 2;
      const nearby = list.filter(function (block, blockIndex) {
        const center = blockCenter(block);
        if (center != null && anchor.center != null) return center >= top && center < bottom;
        return blockIndex === anchor.blockIndex;
      });
      const rowText = anchor.segmentText || nearby.map(function (block) { return block.text; }).join("\n");
      const equipment = findMarkedOptions(rowText, EQUIPMENT_ITEMS, "equipment");
      const actions = findMarkedOptions(rowText, EQUIPMENT_ACTIONS, "equipmentAction");
      if (!equipment.length || !actions.length) return null;
      return Object.freeze({
        id: "equipment-row-" + (index + 1),
        date: Object.freeze([anchor.date]),
        equipment,
        actions,
        operator: findLabeledValues(rowText, ["記錄人", "紀錄人", "操作人員", "執行人"], "operator"),
        sourceBlockIds: Object.freeze(nearby.map(function (block) { return block.id; })),
        confidence: clamp01(anchor.date.confidence)
      });
    }).filter(Boolean).map(function (row, index) {
      return Object.freeze(Object.assign({}, row, { id: "equipment-row-" + (index + 1) }));
    });
    return Object.freeze(rows);
  }

  function findSelfInspectionInspectors(text) {
    const source = normalizeText(text);
    const out = [];
    const seen = new Set();
    const pattern = /(?:查核者|確認者)\s*[:：]?\s*([^\n|｜]{2,12})/g;
    let match;
    while ((match = pattern.exec(source))) {
      const value = normalizeText(match[1])
        .replace(/\s*(?:查核|頻率|程度|備註|\d+(?:\.\d+)+).*$/, "")
        .trim();
      const key = compact(value);
      if (!key || seen.has(key) || value.length > 8) continue;
      seen.add(key);
      out.push(Object.freeze({ value, sourceText: match[0], confidence: 0.62 }));
    }
    return Object.freeze(out.slice(0, 8));
  }

  function spacedLiteral(value) {
    return Array.from(String(value || "").replace(/\s+/g, "")).map(function (char) {
      return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("\\s*");
  }

  function findInventoryLabeledValues(text, labels, stopLabels, kind) {
    const source = normalizeText(text);
    const labelPattern = (labels || []).map(spacedLiteral).filter(Boolean).join("|");
    const stopPattern = (stopLabels || []).map(spacedLiteral).filter(Boolean).join("|");
    if (!labelPattern) return Object.freeze([]);
    const end = stopPattern ? "(?=[ \\t]*(?:" + stopPattern + ")[ \\t]*[:：]?|[ \\t]*\\n|$)" : "(?=[ \\t]*\\n|$)";
    const pattern = new RegExp("(?:" + labelPattern + ")[ \\t]*[:：]?[ \\t]*([^\\n]{1,40}?)" + end, "g");
    const out = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(source))) {
      const value = normalizeText(match[1])
        .replace(/[□☑√✓]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const key = compact(value);
      if (!key || seen.has(key) || /^(未填|無|其他)$/.test(key)) continue;
      seen.add(key);
      out.push(Object.freeze({ value: value.replace(/\s+/g, ""), sourceText: match[0], confidence: 0.8, kind }));
    }
    return Object.freeze(out.slice(0, 12));
  }

  function mergeCandidates() {
    const seen = new Set();
    const out = [];
    Array.from(arguments).forEach(function (items) {
      (items || []).forEach(function (item) {
        const key = compact(item && item.value);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(item);
      });
    });
    return Object.freeze(out);
  }

  function createMaterialInventoryDraft(text) {
    const stopLabels = ["資材名稱", "廠商", "供應商", "包裝單位", "包裝容量", "日期", "購入量", "使用量", "剩餘量"];
    const materials = findInventoryLabeledValues(text, ["資材名稱", "肥料名稱"], stopLabels, "inventoryMaterial");
    const manufacturers = findInventoryLabeledValues(text, ["廠商", "製造商"], stopLabels, "manufacturer");
    const suppliers = findInventoryLabeledValues(text, ["供應商", "購入處"], stopLabels, "supplier");
    const packageCapacities = findInventoryLabeledValues(text, ["包裝容量"], stopLabels, "packageCapacity");
    const dates = findDates(text);
    const amounts = findAmounts(text);
    return Object.freeze({
      title: "肥料／資材入出庫草稿",
      materials,
      manufacturers,
      suppliers,
      packageCapacities,
      dates,
      amounts,
      suggestedRowCount: Math.max(1, dates.length),
      manualReviewRequired: true,
      l3Mapping: "unconfirmed",
      fieldPolicy: "inventory-ledger-manual-row-review"
    });
  }

  function findSelfInspectionCodes(text) {
    const source = normalizeText(text);
    const found = new Set();
    const pattern = /(?:^|[^\d])(\d{1,2})\s*[.．]\s*(\d{1,2})\s*[.．]\s*(\d{1,2})(?=$|[^\d])/g;
    let match;
    while ((match = pattern.exec(source))) found.add([match[1], match[2], match[3]].join("."));
    return found;
  }

  function createSelfInspectionDraft(text) {
    const codes = findSelfInspectionCodes(text);
    const body = compact(text);
    const dates = findDates(text);
    const inspectors = findSelfInspectionInspectors(text);
    const sections = SELF_INSPECTION_TEMPLATE.sections.map(function (section) {
      const sectionDetected = body.includes(compact(section.code)) || body.includes(compact(section.title));
      const detectedItems = section.items.filter(function (item) { return codes.has(item.code); });
      if (!sectionDetected && !detectedItems.length) return null;
      return Object.freeze({
        code: section.code,
        title: section.title,
        detectedFromOcr: sectionDetected || detectedItems.length > 0,
        dates,
        inspectors,
        items: Object.freeze(section.items.map(function (item) {
          const detected = codes.has(item.code);
          return Object.freeze({
            code: item.code,
            title: item.title,
            detectedFromOcr: detected,
            status: "unresolved",
            confidence: detected ? 0.82 : 0.35,
            evidence: detected ? "辨識到項目代碼 " + item.code : "依查核表版型補回固定欄位"
          });
        }))
      });
    }).filter(Boolean);
    return Object.freeze({
      templateId: SELF_INSPECTION_TEMPLATE.id,
      title: SELF_INSPECTION_TEMPLATE.title,
      dates,
      inspectors,
      sections: Object.freeze(sections),
      manualReviewRequired: true,
      fieldPolicy: "fixed-template-plus-handwriting-review"
    });
  }

  function createDraft(scanResult, dictionaries, sourceMetadata) {
    const result = scanResult || {};
    const quality = assessQuality(result.quality);
    const blocks = safeBlocks(result.blocks);
    const text = blocks.map(function (block) { return block.text; }).join("\n");
    const dict = dictionaries || {};
    const recordTypes = detectFormTypes(text);
    const routeDecision = decideDocumentRoute(recordTypes);
    const isEquipmentForm = routeDecision.status === "exact" && routeDecision.type === "equipmentMaintenance";
    const isSelfInspection = routeDecision.status === "exact" && routeDecision.type === "selfInspection";
    const isMaterialInventory = routeDecision.status === "exact" && routeDecision.type === "purchase";
    const materialInventory = isMaterialInventory ? createMaterialInventoryDraft(text) : null;
    let equipmentRows = isEquipmentForm ? findEquipmentMaintenanceRows(blocks) : Object.freeze([]);
    if (isEquipmentForm && !equipmentRows.length) {
      equipmentRows = Object.freeze([Object.freeze({
        id: "equipment-row-1",
        date: Object.freeze([]),
        equipment: findMarkedOptions(text, EQUIPMENT_ITEMS, "equipment"),
        actions: findMarkedOptions(text, EQUIPMENT_ACTIONS, "equipmentAction"),
        operator: findLabeledValues(text, ["記錄人", "紀錄人", "操作人員", "執行人"], "operator"),
        sourceBlockIds: Object.freeze(blocks.map(function (block) { return block.id; })),
        confidence: 0.35
      })]);
    }
    return Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      requestId: String(result.requestId || "").slice(0, 100),
      source: result.source === "google-cloud-vision" ? "google-cloud-vision" : "android-on-device-ocr",
      createdAt: String(result.createdAt || new Date().toISOString()),
      confirmed: false,
      sourceImage: safeSourceImage(sourceMetadata || result.sourceImage),
      layout: safeLayout(result.layout),
      quality,
      routeDecision,
      route: Object.freeze({
        route: routeDecision.route,
        destination: routeDecision.destination,
        l3MappingStatus: routeDecision.l3MappingStatus,
        reason: routeDecision.reason
      }),
      fields: Object.freeze({
        recordType: recordTypes,
        date: findDates(text),
        crop: dictionaryCandidates(text, dict.crops, "crop"),
        fieldPlot: findPlotCodes(text),
        target: dictionaryCandidates(text, dict.targets, "target"),
        material: mergeCandidates(dictionaryCandidates(text, dict.materials, "material"), materialInventory && materialInventory.materials),
        dilution: findDilutions(text),
        amount: findAmounts(text),
        safetyInterval: findSafetyIntervals(text),
        operator: findLabeledValues(text, ["記錄人", "紀錄人", "操作人員", "執行人", "查核者", "確認者"], "operator")
      }),
      recordGroups: equipmentRows,
      selfInspection: isSelfInspection ? createSelfInspectionDraft(text) : null,
      materialInventory,
      blocks
    });
  }

  const COMMITTABLE_RECORD_TYPES = Object.freeze(["pesticide", "cultivation", "fertilizer", "harvest", "postharvest", "materialPurchase"]);

  function hasConfirmedValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    return normalizeText(value) !== "";
  }

  function confirmedValue(fields, name, aliases) {
    const source = fields || {};
    const details = source.details && typeof source.details === "object" ? source.details : {};
    const names = [name].concat(Array.isArray(aliases) ? aliases : []);
    for (let index = 0; index < names.length; index += 1) {
      const key = names[index];
      if (Object.prototype.hasOwnProperty.call(source, key) && hasConfirmedValue(source[key])) return source[key];
      if (Object.prototype.hasOwnProperty.call(details, key) && hasConfirmedValue(details[key])) return details[key];
    }
    return "";
  }

  function validationItem(field, label, message, code) {
    return Object.freeze({
      field,
      label,
      message,
      code: code || "required"
    });
  }

  function addMissing(items, field, label, message, code) {
    if (items.some(function (item) { return item.field === field && item.code === (code || "required"); })) return;
    items.push(validationItem(field, label, message || ("請填寫" + label), code));
  }

  function addWarning(items, code, message, field) {
    if (items.some(function (item) { return item.code === code && item.field === (field || ""); })) return;
    items.push(Object.freeze({ code, message, field: field || "" }));
  }

  function validConfirmedDate(value) {
    const date = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date + "T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }

  function validNonNegativeNumber(value) {
    if (!hasConfirmedValue(value)) return false;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0;
  }

  function finalizeValidation(missing, warnings, mappingPending) {
    const frozenMissing = Object.freeze(missing.slice());
    const frozenWarnings = Object.freeze(warnings.slice());
    return Object.freeze({
      ok: frozenMissing.length === 0,
      missing: frozenMissing,
      warnings: frozenWarnings,
      mappingPending: mappingPending === true
    });
  }

  /*
   * 驗證「使用者已確認、準備寫入正式紀錄」的欄位。
   * 欄位名稱以 farm-records.js 的 createRecord / details 為準；同時接受目前 OCR
   * 介面尚在使用的少數扁平別名。L3 尚未確認的欄位不列為本機紀錄必填。
   */
  function validateConfirmedFields(confirmedFields) {
    const fields = confirmedFields || {};
    const missing = [];
    const warnings = [];
    const recordType = normalizeText(fields.recordType || fields.type);
    const mappingStatus = normalizeText(fields.l3MappingStatus);
    const mappingPending = !!mappingStatus && mappingStatus !== "mapped" && mappingStatus !== "not-applicable";

    if (COMMITTABLE_RECORD_TYPES.indexOf(recordType) < 0) {
      addMissing(missing, "recordType", "紀錄類型", "請選擇支援的紀錄類型", "unsupported-record-type");
      return finalizeValidation(missing, warnings, mappingPending);
    }

    const date = confirmedValue(fields, "date");
    if (!date) addMissing(missing, "date", "日期");
    else if (!validConfirmedDate(date)) addMissing(missing, "date", "日期", "日期格式不正確", "invalid-date");

    if (recordType === "pesticide") {
      if (!confirmedValue(fields, "crop")) addMissing(missing, "crop", "作物");
      if (!confirmedValue(fields, "material", ["materialName", "agent"])) addMissing(missing, "material", "藥劑名稱");
      if (!confirmedValue(fields, "target", ["pest"])) {
        addWarning(warnings, "pesticide-target-not-confirmed", "尚未確認防治對象；正式儲存前仍須對到唯一的官方登記資料。", "target");
      }
      if (!confirmedValue(fields, "dilution")) {
        addWarning(warnings, "pesticide-dilution-not-confirmed", "尚未確認稀釋倍數；不得只依 OCR 文字推定用法。", "dilution");
      }
      return finalizeValidation(missing, warnings, mappingPending);
    }

    /* 現有正式田間紀錄皆以 plotId 連到田區；資材購入只是不要求 crop。 */
    if (!confirmedValue(fields, "plotId")) addMissing(missing, "plotId", "田區／種植批次");

    if (recordType === "cultivation") {
      if (!confirmedValue(fields, "activity")) addMissing(missing, "details.activity", "作業內容");
    } else if (recordType === "fertilizer") {
      if (!confirmedValue(fields, "materialName", ["material"])) addMissing(missing, "details.materialName", "肥料或資材名稱");
      const quantity = confirmedValue(fields, "quantity", ["amount"]);
      if (!hasConfirmedValue(quantity)) addMissing(missing, "details.quantity", "施用量");
      else if (!validNonNegativeNumber(quantity)) addMissing(missing, "details.quantity", "施用量", "施用量必須是 0 以上的數字", "invalid-number");
      if (!confirmedValue(fields, "unit")) addMissing(missing, "details.unit", "施用量單位");
    } else if (recordType === "harvest") {
      const quantity = confirmedValue(fields, "quantity", ["amount"]);
      if (!hasConfirmedValue(quantity)) addMissing(missing, "details.quantity", "採收量");
      else if (!validNonNegativeNumber(quantity)) addMissing(missing, "details.quantity", "採收量", "採收量必須是 0 以上的數字", "invalid-number");
      if (!confirmedValue(fields, "unit")) addMissing(missing, "details.unit", "採收量單位");
    } else if (recordType === "postharvest") {
      if (!confirmedValue(fields, "process")) addMissing(missing, "details.process", "處理方式");
      const quantity = confirmedValue(fields, "quantity", ["amount"]);
      if (hasConfirmedValue(quantity) && !validNonNegativeNumber(quantity)) {
        addMissing(missing, "details.quantity", "處理數量", "處理數量必須是 0 以上的數字", "invalid-number");
      }
      if (hasConfirmedValue(quantity) && !confirmedValue(fields, "unit")) {
        addWarning(warnings, "postharvest-quantity-without-unit", "已填處理數量但未填單位，建議補上以利日後核對。", "details.unit");
      }
    } else if (recordType === "materialPurchase") {
      if (!confirmedValue(fields, "category")) addMissing(missing, "details.category", "資材類別");
      if (!confirmedValue(fields, "materialName", ["material"])) addMissing(missing, "details.materialName", "資材名稱");
      if (!confirmedValue(fields, "supplier")) addMissing(missing, "details.supplier", "供應商");
      const quantity = confirmedValue(fields, "quantity", ["amount"]);
      if (!hasConfirmedValue(quantity)) addMissing(missing, "details.quantity", "購入數量");
      else if (!validNonNegativeNumber(quantity)) addMissing(missing, "details.quantity", "購入數量", "購入數量必須是 0 以上的數字", "invalid-number");
      if (!confirmedValue(fields, "unit")) addMissing(missing, "details.unit", "購入數量單位");
    }

    return finalizeValidation(missing, warnings, mappingPending);
  }

  function validateDraft(draft, confirmedFields) {
    const fields = confirmedFields || {};
    const fieldValidation = validateConfirmedFields(fields);
    const missing = fieldValidation.missing.slice();
    const warnings = fieldValidation.warnings.slice();
    let mappingPending = fieldValidation.mappingPending;

    if (!draft) {
      addMissing(missing, "draft", "辨識草稿", "找不到可確認的辨識草稿", "missing-draft");
      return finalizeValidation(missing, warnings, mappingPending);
    }
    if (draft.confirmed) addMissing(missing, "draft", "辨識草稿", "這份辨識草稿已經使用過", "already-confirmed");
    if (!draft.quality || !draft.quality.canProcess) {
      addMissing(missing, "quality", "照片品質", "照片品質未通過，請重新拍攝或重新確認原圖", "quality-blocked");
    }
    if (draft.quality && Array.isArray(draft.quality.issues)) {
      draft.quality.issues.filter(function (issue) { return issue.level === "warning"; }).forEach(function (issue) {
        addWarning(warnings, "quality-" + issue.code, issue.message, "quality");
      });
    }

    const decision = draft.routeDecision || {};
    const route = draft.route || {};
    const routeType = decision.type === "purchase" ? "materialPurchase" : decision.type;
    if (decision.status === "exact") {
      if (route.destination !== "farm-form") {
        addMissing(missing, "route", "文件用途", "這份文件屬於獨立覆核流程，不能直接帶入一般田間紀錄", "unsupported-route");
      } else if (routeType && normalizeText(fields.recordType || fields.type) !== routeType) {
        addMissing(missing, "recordType", "紀錄類型", "使用者確認的紀錄類型與文件分流結果不一致", "route-mismatch");
      }
    } else if (fields.routeConfirmed !== true) {
      addMissing(missing, "routeConfirmed", "文件用途", "文件類型不明確，請先對照原圖確認用途", "route-unconfirmed");
    } else {
      addWarning(warnings, "manual-route-confirmation", "文件類型由使用者人工指定，正式儲存前請再次對照原圖。", "routeConfirmed");
    }

    const mappingStatus = normalizeText(route.l3MappingStatus || decision.l3MappingStatus);
    if (mappingStatus && mappingStatus !== "mapped" && mappingStatus !== "not-applicable") mappingPending = true;
    if (mappingPending) {
      addWarning(warnings, "l3-mapping-pending", "目前只確認本機紀錄欄位；L3 欄位映射尚未確認，不代表已可上傳產銷履歷系統。", "l3MappingStatus");
    }

    return finalizeValidation(missing, warnings, mappingPending);
  }

  /*
   * 「帶入表單」不是正式儲存。這一道只確認照片、用途與可安全預填的最低欄位；
   * 真正儲存時仍由 validateDraft / farm-records.js 逐類檢查完整欄位。
   */
  function validateDraftForReview(draft, confirmedFields) {
    const fields = confirmedFields || {};
    const missing = [];
    const warnings = [];
    const recordType = normalizeText(fields.recordType || fields.type);
    let mappingPending = false;

    if (COMMITTABLE_RECORD_TYPES.indexOf(recordType) < 0) {
      addMissing(missing, "recordType", "紀錄類型", "請先選擇要整理成哪一類紀錄", "unsupported-record-type");
    }
    const date = confirmedValue(fields, "date");
    if (!date) addMissing(missing, "date", "日期");
    else if (!validConfirmedDate(date)) addMissing(missing, "date", "日期", "日期格式不正確", "invalid-date");
    if (recordType === "pesticide") {
      if (!confirmedValue(fields, "crop")) addMissing(missing, "crop", "作物");
      if (!confirmedValue(fields, "material", ["materialName", "agent"])) addMissing(missing, "material", "藥劑名稱");
    } else if (recordType && recordType !== "materialPurchase" && !confirmedValue(fields, "crop")) {
      addWarning(warnings, "crop-not-prefilled", "尚未確認作物；帶入後請從田區／種植批次補選。", "crop");
    }

    if (!draft) {
      addMissing(missing, "draft", "辨識草稿", "找不到可整理的辨識草稿", "missing-draft");
      return finalizeValidation(missing, warnings, mappingPending);
    }
    if (draft.confirmed) addMissing(missing, "draft", "辨識草稿", "這份辨識草稿已經使用過", "already-confirmed");
    if (!draft.quality || !draft.quality.canProcess) {
      addMissing(missing, "quality", "照片品質", "照片品質未通過，請重新拍攝或重新確認原圖", "quality-blocked");
    }

    const decision = draft.routeDecision || {};
    const route = draft.route || {};
    const routeType = decision.type === "purchase" ? "materialPurchase" : decision.type;
    if (decision.status === "exact" && route.destination !== "farm-form") {
      addMissing(missing, "route", "文件用途", "這份文件使用獨立覆核流程，不能帶入一般田間紀錄", "unsupported-route");
    } else if (decision.status !== "exact" && fields.routeConfirmed !== true) {
      addMissing(missing, "routeConfirmed", "文件用途", "文件類型不明確，請先對照原圖確認用途", "route-unconfirmed");
    } else if (routeType && recordType && routeType !== recordType) {
      if (fields.routeConfirmed !== true) {
        addMissing(missing, "routeConfirmed", "文件用途", "選擇的紀錄類型與辨識結果不同，請先人工確認", "route-override-unconfirmed");
      } else {
        addWarning(warnings, "manual-route-override", "你已改用另一種紀錄類型；帶入後請再次對照原圖。", "recordType");
      }
    }

    const mappingStatus = normalizeText(route.l3MappingStatus || decision.l3MappingStatus);
    if (mappingStatus && mappingStatus !== "mapped" && mappingStatus !== "not-applicable") mappingPending = true;
    if (mappingPending) {
      addWarning(warnings, "l3-mapping-pending", "這只會整理成本機待確認表單，不代表已可上傳產銷履歷系統。", "l3MappingStatus");
    }
    return finalizeValidation(missing, warnings, mappingPending);
  }

  function canCommit(draft, confirmedFields) {
    return validateDraft(draft, confirmedFields).ok;
  }

  return Object.freeze({
    PROTOCOL_VERSION,
    normalizeText,
    assessQuality,
    findDates,
    findDilutions,
    findAmounts,
    findSafetyIntervals,
    detectFormTypes,
    decideDocumentRoute,
    findPlotCodes,
    findLabeledValues,
    findInventoryLabeledValues,
    createMaterialInventoryDraft,
    dictionaryCandidates,
    findMarkedOptions,
    findEquipmentMaintenanceRows,
    findSelfInspectionInspectors,
    createSelfInspectionDraft,
    createDraft,
    validateConfirmedFields,
    validateDraft,
    validateDraftForReview,
    canCommit
  });
});
