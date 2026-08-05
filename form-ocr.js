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

  function createDraft(scanResult, dictionaries) {
    const result = scanResult || {};
    const quality = assessQuality(result.quality);
    const blocks = safeBlocks(result.blocks);
    const text = blocks.map(function (block) { return block.text; }).join("\n");
    const dict = dictionaries || {};
    const recordTypes = detectFormTypes(text);
    const isEquipmentForm = recordTypes.some(function (item) { return item.value === "equipmentMaintenance" && item.markerCount >= 2; });
    const isSelfInspection = recordTypes.some(function (item) { return item.value === "selfInspection" && item.markerCount >= 2; });
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
      quality,
      fields: Object.freeze({
        recordType: recordTypes,
        date: findDates(text),
        crop: dictionaryCandidates(text, dict.crops, "crop"),
        fieldPlot: findPlotCodes(text),
        target: dictionaryCandidates(text, dict.targets, "target"),
        material: dictionaryCandidates(text, dict.materials, "material"),
        dilution: findDilutions(text),
        amount: findAmounts(text),
        safetyInterval: findSafetyIntervals(text),
        operator: findLabeledValues(text, ["記錄人", "紀錄人", "操作人員", "執行人", "查核者", "確認者"], "operator")
      }),
      recordGroups: equipmentRows,
      selfInspection: isSelfInspection ? createSelfInspectionDraft(text) : null,
      blocks
    });
  }

  function canCommit(draft, confirmedFields) {
    if (!draft || draft.confirmed || !draft.quality || !draft.quality.canProcess) return false;
    const fields = confirmedFields || {};
    if (!fields.date || !fields.crop || !fields.recordType) return false;
    if (fields.recordType === "pesticide" && !fields.material) return false;
    return true;
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
    findPlotCodes,
    findLabeledValues,
    dictionaryCandidates,
    findMarkedOptions,
    findEquipmentMaintenanceRows,
    findSelfInspectionInspectors,
    createSelfInspectionDraft,
    createDraft,
    canCommit
  });
});
