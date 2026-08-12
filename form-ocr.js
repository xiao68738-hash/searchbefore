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
  const INTERMEDIATE_DRAFT_SCHEMA_VERSION = 1;
  const MAX_DRAFT_ACTIVITIES = 30;
  const MAX_ACTIVITY_DETAILS = 40;
  const MAX_FIELD_CANDIDATES = 12;
  const MAX_FIELD_EVIDENCE = 4;
  const MAX_SOURCE_ROW_CANDIDATES = 250;
  const MAX_SOURCE_CELL_CANDIDATES_PER_ROW = 20;
  const MAX_SOURCE_WORD_IDS_PER_CELL = 100;
  const MATERIAL_LEDGER_LIMITS = Object.freeze({
    headerConfidence: 0.7,
    dateConfidence: 0.7,
    amountConfidence: 0.65,
    minHeaderGapX: 0.035,
    maxHeaderGapX: 0.18,
    maxHeaderGapRatio: 2.5,
    boundaryMargin: 0.008,
    boundaryRatio: 0.15,
    masterConfidence: 0.7,
    maxMasterDistanceY: 0.18,
    maxDetailDistanceY: 0.28,
    maxPanels: 24,
    maxEntriesPerPanel: 40
  });
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
    const byValue = new Map();
    const pattern = /(\d{1,3}(?:,\d{3})*|\d+)\s*倍/g;
    let match;
    while ((match = pattern.exec(source))) {
      const value = Number(match[1].replace(/,/g, ""));
      if (value <= 0 || value > 100000) continue;
      const contextStart = Math.max(0, match.index - 24);
      const prefix = source.slice(contextStart, match.index);
      const clauseStart = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("｜"), prefix.lastIndexOf("|"), prefix.lastIndexOf("，"), prefix.lastIndexOf("。"), prefix.lastIndexOf("；"), prefix.lastIndexOf(";"));
      const context = prefix.slice(clauseStart + 1) + match[0];
      const actual = /(?:實際|本次|此次|施用|使用|調配|配製)(?:[^\n｜|]{0,12})(?:稀釋|倍數)?/i.test(context);
      const reference = /(?:建議|推薦|標示|標籤|登記|參考)(?:[^\n｜|]{0,12})(?:稀釋|倍數)?/i.test(context);
      const role = actual ? "actual" : (reference ? "reference" : "unlabeled");
      const confidence = role === "actual" ? 0.97 : (role === "reference" ? 0.62 : 0.86);
      const candidate = { value, sourceText: match[0], context: context.trim(), role, confidence };
      const previousIndex = byValue.get(value);
      if (previousIndex == null) {
        byValue.set(value, out.length);
        out.push(candidate);
      } else if (confidence > out[previousIndex].confidence) {
        out[previousIndex] = candidate;
      }
    }
    const rank = { actual: 0, unlabeled: 1, reference: 2 };
    return Object.freeze(out.sort(function (a, b) {
      return rank[a.role] - rank[b.role];
    }).map(function (item) { return Object.freeze(item); }));
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

  function strongDocumentType(text) {
    const body = compact(text);
    if (!body) return null;

    const isSelfInspection = body.includes("查核項目")
      && (body.includes("查核頻率") || body.includes("程度"))
      && (body.includes("查核者") || body.includes("確認日期"));
    if (isSelfInspection) {
      return Object.freeze({
        type: "selfInspection",
        reason: "辨識到查核項目、查核頻率／程度與查核者／確認日期等固定欄頭"
      });
    }

    const ledgerColumns = ["購入量", "使用量", "剩餘量"].filter(function (label) {
      return body.includes(compact(label));
    });
    const isMaterialLedger = body.includes("表10")
      && body.includes("肥料入出庫")
      && ledgerColumns.length >= 2;
    if (isMaterialLedger) {
      return Object.freeze({
        type: "purchase",
        reason: "辨識到表 10 肥料入出庫表名與至少兩個固定數量欄頭"
      });
    }

    const isEquipmentLedger = body.includes("表18")
      && body.includes("器具")
      && body.includes("機械")
      && body.includes("設備")
      && ["清潔", "保養", "維修", "校正"].some(function (label) { return body.includes(label); });
    if (isEquipmentLedger) {
      return Object.freeze({
        type: "equipmentMaintenance",
        reason: "辨識到表 18 器具／機械／設備表名與管理作業欄"
      });
    }
    return null;
  }

  function decideDocumentRoute(recordTypes, text) {
    const candidates = Array.isArray(recordTypes) ? recordTypes : [];
    const strong = strongDocumentType(text);
    if (strong) {
      const strongRoute = DOCUMENT_ROUTES[strong.type];
      return Object.freeze({
        status: "exact",
        type: strong.type,
        route: strongRoute.route,
        destination: strongRoute.destination,
        l3MappingStatus: strongRoute.l3MappingStatus,
        reason: strong.reason,
        evidenceLevel: "fixed-form-header"
      });
    }
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
    if (["selfInspection", "purchase", "equipmentMaintenance"].includes(top.value)) {
      return Object.freeze({
        status: "unknown",
        type: null,
        route: "unknown",
        destination: "manual-classification",
        l3MappingStatus: "not-mapped",
        reason: "固定表單的表名或必要欄頭不完整，禁止只靠內文關鍵字啟用專用解析"
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
    return Object.freeze(findLocationReferences(text).filter(function (item) {
      return item.role === "officialField";
    }).map(function (item) {
      return Object.freeze({ value: item.value, sourceText: item.sourceText, confidence: item.confidence, role: item.role });
    }));
  }

  function findLocationReferences(text) {
    const source = normalizeText(text);
    const out = [];
    const seen = new Set();
    const patterns = [
      { role: "officialField", confidence: 0.92, pattern: /(?:驗證田區|正式田區|田區(?:代號)?)\s*[:：]?\s*([A-Za-zＡ-Ｚａ-ｚ0-9０-９+＋、,，\-]{1,16}\s*區?)/g },
      { role: "workGroup", confidence: 0.9, pattern: /(?:共同作業(?:分)?區|作業分區|工作區|管理分區)\s*[:：]?\s*([A-Za-zＡ-Ｚａ-ｚ0-9０-９+＋、,，\-]{1,16}\s*區?)/g },
      { role: "landParcel", confidence: 0.9, pattern: /(?:農地地籍號碼|地籍號碼|地號)\s*[:：]?\s*([^\n｜|，,；;]{2,40})/g }
    ];
    patterns.forEach(function (definition) {
      let match;
      while ((match = definition.pattern.exec(source))) {
        const value = definition.role === "landParcel"
          ? normalizeText(match[1]).trim()
          : normalizeText(match[1]).replace(/\s+/g, "").replace(/＋/g, "+").toUpperCase();
        const key = definition.role + ":" + compact(value);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(Object.freeze({ value, sourceText: match[0].trim(), confidence: definition.confidence, role: definition.role }));
      }
    });
    return Object.freeze(out);
  }

  function findOperationalMeasurements(text) {
    const source = normalizeText(text);
    const out = [];
    const seen = new Set();
    const definitions = [
      { role: "harvestQuantity", confidence: 0.95, pattern: /(?:本次採收量|總採收量|採收量)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(公斤|台斤|公克|kg|g)/gi },
      { role: "packageWeight", confidence: 0.92, pattern: /(?:每包重量|包裝重量|包裝規格)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(公斤|台斤|公克|kg|g)/gi },
      { role: "labelCount", confidence: 0.92, pattern: /(?:標籤張數|貼紙張數|列印張數)\s*[:：]?\s*(\d+)\s*張/gi }
    ];
    definitions.forEach(function (definition) {
      let match;
      while ((match = definition.pattern.exec(source))) {
        const value = Number(match[1]);
        const unit = definition.role === "labelCount" ? "張" : match[2];
        const key = definition.role + ":" + value + ":" + unit;
        if (!Number.isFinite(value) || value < 0 || seen.has(key)) continue;
        seen.add(key);
        out.push(Object.freeze({ value, unit, sourceText: match[0].trim(), confidence: definition.confidence, role: definition.role }));
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

  function safeEvidenceId(value) {
    const id = String(value || "");
    return /^[A-Za-z0-9._:-]{1,160}$/.test(id) ? id : null;
  }

  function safeEvidenceIds(value) {
    return Object.freeze(Array.from(new Set((Array.isArray(value) ? value : [])
      .map(safeEvidenceId)
      .filter(Boolean))).slice(0, 100));
  }

  function safeRowCandidateSource(value) {
    if (!value || typeof value !== "object") return null;
    return Object.freeze({
      pageIndex: safeIndex(value.pageIndex),
      regionIndex: safeIndex(value.regionIndex)
    });
  }

  function safeCellCandidates(value) {
    return Object.freeze((Array.isArray(value) ? value : []).slice(0, MAX_SOURCE_CELL_CANDIDATES_PER_ROW).map(function (cell) {
      if (!cell || typeof cell !== "object") return null;
      const id = safeEvidenceId(cell.id);
      if (!id) return null;
      return Object.freeze({
        id,
        text: normalizeText(cell.text).slice(0, 250),
        confidence: clamp01(cell.confidence),
        box: safeBox(cell.box),
        wordIds: Object.freeze(safeEvidenceIds(cell.wordIds).slice(0, MAX_SOURCE_WORD_IDS_PER_CELL))
      });
    }).filter(Boolean));
  }

  function safeRowCandidates(value) {
    return Object.freeze((Array.isArray(value) ? value : []).slice(0, MAX_SOURCE_ROW_CANDIDATES).map(function (row) {
      if (!row || typeof row !== "object") return null;
      const id = safeEvidenceId(row.id);
      if (!id) return null;
      const sourceCells = Array.isArray(row.cellCandidates) ? row.cellCandidates : [];
      const cellCandidates = safeCellCandidates(sourceCells);
      return Object.freeze({
        id,
        source: safeRowCandidateSource(row.source),
        text: normalizeText(row.text).slice(0, 500),
        confidence: clamp01(row.confidence),
        box: safeBox(row.box),
        cellCandidates,
        cellsTruncated: row.cellsTruncated === true || cellCandidates.length < sourceCells.length
      });
    }).filter(Boolean));
  }

  function boxCenterX(box) {
    return box ? (Number(box.left) + Number(box.right)) / 2 : null;
  }

  function boxCenterY(box) {
    return box ? (Number(box.top) + Number(box.bottom)) / 2 : null;
  }

  function ledgerHeaderQuartets(row) {
    const limits = MATERIAL_LEDGER_LIMITS;
    if (!row || !row.source || !row.box) return Object.freeze([]);
    const cells = (row && Array.isArray(row.cellCandidates) ? row.cellCandidates : [])
      .filter(function (cell) { return cell.box && cell.confidence >= limits.headerConfidence; })
      .slice()
      .sort(function (a, b) { return boxCenterX(a.box) - boxCenterX(b.box); });
    const labels = ["日期", "購入量", "使用量", "剩餘量"];
    const used = new Set();
    const quartets = [];
    cells.forEach(function (cell, startIndex) {
      if (compact(cell.text) !== compact(labels[0]) || used.has(cell.id)) return;
      const chosen = [cell];
      let previousIndex = startIndex;
      for (let labelIndex = 1; labelIndex < labels.length; labelIndex += 1) {
        let found = null;
        for (let index = previousIndex + 1; index < cells.length; index += 1) {
          const candidate = cells[index];
          const gap = boxCenterX(candidate.box) - boxCenterX(chosen[chosen.length - 1].box);
          if (gap > limits.maxHeaderGapX) break;
          if (!used.has(candidate.id) && compact(candidate.text) === compact(labels[labelIndex])) {
            found = { cell: candidate, index, gap };
            break;
          }
        }
        if (!found) return;
        chosen.push(found.cell);
        previousIndex = found.index;
      }
      const centers = chosen.map(function (item) { return boxCenterX(item.box); });
      const gaps = centers.slice(1).map(function (center, index) { return center - centers[index]; });
      if (gaps.some(function (gap) { return gap < limits.minHeaderGapX || gap > limits.maxHeaderGapX; })) return;
      if (Math.max.apply(null, gaps) / Math.min.apply(null, gaps) > limits.maxHeaderGapRatio) return;
      const localLeft = Math.max(0, centers[0] - gaps[0] / 2);
      const localRight = Math.min(1, centers[3] + gaps[2] / 2);
      const localLabels = cells.filter(function (candidate) {
        const center = boxCenterX(candidate.box);
        return center >= localLeft && center <= localRight && labels.some(function (label) {
          return compact(candidate.text) === compact(label);
        });
      });
      if (labels.some(function (label) {
        return localLabels.filter(function (candidate) { return compact(candidate.text) === compact(label); }).length !== 1;
      })) return;
      chosen.forEach(function (item) { used.add(item.id); });
      quartets.push(Object.freeze({
        id: row.id + "-ledger-header-" + (quartets.length + 1),
        rowCandidateId: row.id,
        cells: Object.freeze(chosen),
        centers: Object.freeze(centers),
        source: row.source,
        box: row.box
      }));
    });
    return Object.freeze(quartets);
  }

  function ledgerColumnBands(header) {
    const centers = header.centers;
    const gaps = [centers[1] - centers[0], centers[2] - centers[1], centers[3] - centers[2]];
    const boundaries = Object.freeze([
      Math.max(0, centers[0] - gaps[0] / 2),
      (centers[0] + centers[1]) / 2,
      (centers[1] + centers[2]) / 2,
      (centers[2] + centers[3]) / 2,
      Math.min(1, centers[3] + gaps[2] / 2)
    ]);
    return Object.freeze({
      boundaries,
      date: Object.freeze([boundaries[0], boundaries[1]]),
      purchase: Object.freeze([boundaries[1], boundaries[2]]),
      used: Object.freeze([boundaries[2], boundaries[3]]),
      remaining: Object.freeze([boundaries[3], boundaries[4]])
    });
  }

  function ledgerCellsInBand(row, band) {
    return Object.freeze((row.cellCandidates || []).filter(function (cell) {
      const center = boxCenterX(cell.box);
      return center != null && center >= band[0] && center <= band[1];
    }));
  }

  function ledgerEvidenceCandidate(value, confidence, row, cells, sourceText, unit) {
    const candidate = {
      value,
      confidence: clamp01(confidence),
      sourceText: normalizeText(sourceText).slice(0, 240),
      rowCandidateId: row.id,
      cellCandidateIds: Object.freeze(cells.map(function (cell) { return cell.id; }).filter(Boolean))
    };
    if (unit) candidate.unit = unit;
    return Object.freeze(candidate);
  }

  function ledgerDateCandidates(row, cells) {
    const text = cells.map(function (cell) { return cell.text; }).join(" ");
    const confidence = cells.length ? Math.min.apply(null, cells.map(function (cell) { return cell.confidence; })) : 0;
    return Object.freeze(findDates(text).map(function (item) {
      return ledgerEvidenceCandidate(item.value, Math.min(item.confidence, confidence), row, cells, item.sourceText);
    }));
  }

  function ledgerAmountCandidates(row, cells) {
    const text = normalizeText(cells.map(function (cell) { return cell.text; }).join(" "));
    const units = ALLOWED_UNITS.map(function (unit) {
      return unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("|");
    const pattern = new RegExp("(?:^|[^\\d])([0-9]+(?:\\.[0-9]+)?)(?:\\s*(" + units + "))?(?=$|[^\\d])", "g");
    const out = [];
    let match;
    while ((match = pattern.exec(text))) {
      const value = Number(match[1]);
      if (!Number.isFinite(value)) continue;
      const confidence = cells.length ? Math.min.apply(null, cells.map(function (cell) { return cell.confidence; })) : 0;
      out.push(ledgerEvidenceCandidate(value, confidence, row, cells, match[0].trim(), match[2] || null));
    }
    return Object.freeze(out.slice(0, MAX_FIELD_CANDIDATES));
  }

  function ledgerCellsNearBoundary(cells, band, boundaries) {
    const width = Math.max(0, band[1] - band[0]);
    const margin = Math.max(MATERIAL_LEDGER_LIMITS.boundaryMargin, width * MATERIAL_LEDGER_LIMITS.boundaryRatio);
    return cells.some(function (cell) {
      const center = boxCenterX(cell.box);
      return boundaries.slice(1, -1).some(function (boundary) { return Math.abs(center - boundary) < margin; });
    });
  }

  function pendingLedgerDetail(candidates) {
    return Object.freeze({
      value: null,
      candidates: Object.freeze(Array.isArray(candidates) ? candidates : []),
      confirmation: Object.freeze({ state: "pending", confirmed: false, confirmedValue: null, confirmedAt: null })
    });
  }

  function ledgerMasterFieldCandidates(rows, panelBand, labels, stopLabels, kind) {
    const out = [];
    const seen = new Set();
    const stopKeys = (stopLabels || []).map(compact).filter(Boolean);
    rows.forEach(function (row) {
      const cells = ledgerCellsInBand(row, panelBand).slice().sort(function (a, b) {
        return boxCenterX(a.box) - boxCenterX(b.box);
      });
      if (!cells.length) return;
      const scopedText = cells.map(function (cell) { return cell.text; }).join(" ");
      findInventoryLabeledValues(scopedText, labels, stopLabels, kind).forEach(function (candidate) {
        const key = compact(candidate.value);
        if (!key || seen.has(key) || stopKeys.some(function (stopKey) { return key === stopKey || key.indexOf(stopKey) === 0; })) return;
        seen.add(key);
        const confidence = Math.min(row.confidence, candidate.confidence,
          Math.min.apply(null, cells.map(function (cell) { return cell.confidence; })));
        out.push(ledgerEvidenceCandidate(candidate.value, confidence, row, cells, candidate.sourceText));
      });
    });
    return Object.freeze(out.slice(0, MAX_FIELD_CANDIDATES));
  }

  function associateMaterialLedgerMaster(rows, header, bands, panelId, sourceImage, masterTop, rowCandidatesTruncated) {
    const panelBand = Object.freeze([bands.boundaries[0], bands.boundaries[4]]);
    const masterRows = rows.filter(function (row) {
      if (!row || !row.source || !row.box || row.id === header.rowCandidateId) return false;
      if (row.source.pageIndex !== header.source.pageIndex || row.source.regionIndex !== header.source.regionIndex) return false;
      const centerY = boxCenterY(row.box);
      const gap = header.box.top - row.box.bottom;
      if (centerY == null || centerY <= masterTop || centerY >= header.box.top || gap < 0 || gap > MATERIAL_LEDGER_LIMITS.maxMasterDistanceY) return false;
      return ledgerCellsInBand(row, panelBand).length > 0;
    });
    const stopLabels = ["資材名稱", "肥料名稱", "廠商", "製造商", "供應商", "購入處", "包裝單位", "包裝容量", "日期", "購入量", "使用量", "剩餘量"];
    const details = Object.freeze({
      materialName: pendingLedgerDetail(ledgerMasterFieldCandidates(masterRows, panelBand, ["資材名稱", "肥料名稱"], stopLabels, "inventoryMaterial")),
      manufacturer: pendingLedgerDetail(ledgerMasterFieldCandidates(masterRows, panelBand, ["廠商", "製造商"], stopLabels, "manufacturer")),
      supplier: pendingLedgerDetail(ledgerMasterFieldCandidates(masterRows, panelBand, ["供應商", "購入處"], stopLabels, "supplier")),
      packageCapacity: pendingLedgerDetail(ledgerMasterFieldCandidates(masterRows, panelBand, ["包裝容量"], stopLabels, "packageCapacity")),
      packageUnit: pendingLedgerDetail(ledgerMasterFieldCandidates(masterRows, panelBand, ["包裝單位"], stopLabels, "packageUnit"))
    });
    const allCandidates = Object.keys(details).reduce(function (items, key) {
      return items.concat(details[key].candidates);
    }, []);
    if (!allCandidates.length) return null;
    const materialCandidates = details.materialName.candidates;
    const reasons = [];
    if (rowCandidatesTruncated) reasons.push("source-row-candidates-truncated");
    if (masterRows.some(function (row) { return row.cellsTruncated; })) reasons.push("master-row-cells-truncated");
    if (materialCandidates.length !== 1) reasons.push(materialCandidates.length ? "multiple-material-names" : "missing-material-name");
    if (materialCandidates.some(function (candidate) { return candidate.confidence < MATERIAL_LEDGER_LIMITS.masterConfidence; })) reasons.push("low-confidence-material-name");
    const uniqueReasons = Object.freeze(Array.from(new Set(reasons)));
    const rowCandidateIds = safeEvidenceIds(allCandidates.map(function (candidate) { return candidate.rowCandidateId; }));
    const cellCandidateIds = safeEvidenceIds(allCandidates.reduce(function (ids, candidate) {
      return ids.concat(candidate.cellCandidateIds || []);
    }, []));
    return Object.freeze({
      id: panelId + "-master",
      hasEvidence: true,
      associationState: uniqueReasons.length ? "pending" : "row-evidence",
      panelAssociation: uniqueReasons.length ? "pending" : "strong",
      source: Object.freeze({
        sourceImageId: sourceImage ? sourceImage.sourceImageId : null,
        pageIndex: header.source.pageIndex,
        regionIndex: header.source.regionIndex,
        rowCandidateIds,
        cellCandidateIds
      }),
      details,
      reasons: uniqueReasons,
      confirmation: Object.freeze({ state: "pending", confirmed: false }),
      autoCommitAllowed: false,
      l3UploadReady: false
    });
  }

  function emptyMaterialLedgerMaster(panelId, header, sourceImage) {
    const emptyDetail = function () { return pendingLedgerDetail([]); };
    return Object.freeze({
      id: panelId + "-master",
      hasEvidence: false,
      associationState: "pending",
      panelAssociation: "pending",
      source: Object.freeze({
        sourceImageId: sourceImage ? sourceImage.sourceImageId : null,
        pageIndex: header.source.pageIndex,
        regionIndex: header.source.regionIndex,
        rowCandidateIds: Object.freeze([]),
        cellCandidateIds: Object.freeze([])
      }),
      details: Object.freeze({
        materialName: emptyDetail(),
        manufacturer: emptyDetail(),
        supplier: emptyDetail(),
        packageCapacity: emptyDetail(),
        packageUnit: emptyDetail()
      }),
      reasons: Object.freeze(["material-master-not-associated"]),
      confirmation: Object.freeze({ state: "pending", confirmed: false }),
      autoCommitAllowed: false,
      l3UploadReady: false
    });
  }

  function associateMaterialLedgerRows(rowCandidates, rowCandidatesTruncated, sourceImage) {
    const rows = Array.isArray(rowCandidates) ? rowCandidates : [];
    const headers = [];
    rows.forEach(function (row) {
      ledgerHeaderQuartets(row).forEach(function (header) { headers.push(header); });
    });
    const panels = headers.slice(0, MATERIAL_LEDGER_LIMITS.maxPanels).map(function (header, panelIndex) {
      const panelId = "inventory-panel-" + (panelIndex + 1);
      const bands = ledgerColumnBands(header);
      const groupHeaders = headers.filter(function (candidate) {
        return candidate !== header
          && candidate.source.pageIndex === header.source.pageIndex
          && candidate.source.regionIndex === header.source.regionIndex
          && candidate.box && header.box
          && candidate.box.top > header.box.top;
      }).sort(function (a, b) { return a.box.top - b.box.top; });
      const nextHeader = groupHeaders.find(function (candidate) {
        const left = Math.max(bands.boundaries[0], ledgerColumnBands(candidate).boundaries[0]);
        const right = Math.min(bands.boundaries[4], ledgerColumnBands(candidate).boundaries[4]);
        return right > left;
      });
      const previousHeader = headers.filter(function (candidate) {
        if (candidate === header || candidate.source.pageIndex !== header.source.pageIndex || candidate.source.regionIndex !== header.source.regionIndex) return false;
        if (!candidate.box || candidate.box.top >= header.box.top) return false;
        const candidateBands = ledgerColumnBands(candidate);
        return Math.min(bands.boundaries[4], candidateBands.boundaries[4]) > Math.max(bands.boundaries[0], candidateBands.boundaries[0]);
      }).sort(function (a, b) { return b.box.top - a.box.top; })[0];
      const masterTop = Math.max(0, header.box.top - MATERIAL_LEDGER_LIMITS.maxMasterDistanceY, previousHeader ? previousHeader.box.bottom : 0);
      const panelBottom = Math.min(1, nextHeader ? nextHeader.box.top : header.box.bottom + MATERIAL_LEDGER_LIMITS.maxDetailDistanceY);
      const panelBox = Object.freeze({ left: bands.boundaries[0], top: header.box.top, right: bands.boundaries[4], bottom: panelBottom });
      const master = associateMaterialLedgerMaster(rows, header, bands, panelId, sourceImage, masterTop, rowCandidatesTruncated);
      const entries = [];
      rows.forEach(function (row) {
        if (entries.length >= MATERIAL_LEDGER_LIMITS.maxEntriesPerPanel || !row.box || row.id === header.rowCandidateId) return;
        if (row.source.pageIndex !== header.source.pageIndex || row.source.regionIndex !== header.source.regionIndex) return;
        const centerY = boxCenterY(row.box);
        if (centerY == null || centerY <= header.box.bottom || centerY >= panelBottom) return;
        const rowText = compact(row.text);
        if (["資材名稱", "供應商", "包裝容量", "本表不敷", "購入量", "使用量", "剩餘量"].some(function (label) { return rowText.includes(compact(label)); })) return;
        const dateCells = ledgerCellsInBand(row, bands.date);
        const purchaseCells = ledgerCellsInBand(row, bands.purchase);
        const usedCells = ledgerCellsInBand(row, bands.used);
        const remainingCells = ledgerCellsInBand(row, bands.remaining);
        const dateCandidates = ledgerDateCandidates(row, dateCells);
        const purchaseCandidates = ledgerAmountCandidates(row, purchaseCells);
        const usedCandidates = ledgerAmountCandidates(row, usedCells);
        const remainingCandidates = ledgerAmountCandidates(row, remainingCells);
        if (!dateCandidates.length && !purchaseCandidates.length && !usedCandidates.length && !remainingCandidates.length) return;
        const reasons = [];
        if (rowCandidatesTruncated) reasons.push("source-row-candidates-truncated");
        if (row.cellsTruncated) reasons.push("row-cells-truncated");
        if (dateCandidates.length !== 1) reasons.push(dateCandidates.length ? "multiple-dates" : "missing-date");
        [["purchase", purchaseCandidates], ["used", usedCandidates], ["remaining", remainingCandidates]].forEach(function (entry) {
          if (entry[1].length > 1) reasons.push("multiple-" + entry[0] + "-amounts");
        });
        if (!purchaseCandidates.length && !usedCandidates.length && !remainingCandidates.length) reasons.push("missing-ledger-amount");
        if (dateCandidates.some(function (item) { return item.confidence < MATERIAL_LEDGER_LIMITS.dateConfidence; })) reasons.push("low-confidence-date");
        if ([purchaseCandidates, usedCandidates, remainingCandidates].some(function (items) {
          return items.some(function (item) { return item.confidence < MATERIAL_LEDGER_LIMITS.amountConfidence; });
        })) reasons.push("low-confidence-amount");
        if (ledgerCellsNearBoundary(dateCells, bands.date, bands.boundaries)
          || ledgerCellsNearBoundary(purchaseCells, bands.purchase, bands.boundaries)
          || ledgerCellsNearBoundary(usedCells, bands.used, bands.boundaries)
          || ledgerCellsNearBoundary(remainingCells, bands.remaining, bands.boundaries)) reasons.push("near-column-boundary");
        const uniqueReasons = Object.freeze(Array.from(new Set(reasons)));
        entries.push(Object.freeze({
          id: panelId + "-entry-" + (entries.length + 1),
          panelId,
          materialMasterId: master && master.associationState === "row-evidence" ? master.id : null,
          associationState: uniqueReasons.length ? "pending" : "row-evidence",
          rowAssociation: uniqueReasons.length ? "pending" : "strong",
          masterAssociation: master && master.associationState === "row-evidence" ? "panel-evidence" : "pending",
          source: Object.freeze({
            sourceImageId: sourceImage ? sourceImage.sourceImageId : null,
            pageIndex: row.source.pageIndex,
            regionIndex: row.source.regionIndex,
            rowCandidateId: row.id,
            cellCandidateIds: Object.freeze([].concat(dateCells, purchaseCells, usedCells, remainingCells).map(function (cell) { return cell.id; })),
            box: row.box
          }),
          details: Object.freeze({
            date: pendingLedgerDetail(dateCandidates),
            purchaseAmount: pendingLedgerDetail(purchaseCandidates),
            usedAmount: pendingLedgerDetail(usedCandidates),
            remainingAmount: pendingLedgerDetail(remainingCandidates)
          }),
          checks: Object.freeze({ columnOrder: true, uniquePerColumn: uniqueReasons.every(function (reason) { return !/^multiple-/.test(reason); }), balance: "not-checkable" }),
          reasons: uniqueReasons,
          confirmation: Object.freeze({ state: "pending", confirmed: false }),
          autoCommitAllowed: false,
          l3UploadReady: false
        }));
      });
      return Object.freeze({
        id: panelId,
        source: Object.freeze({
          sourceImageId: sourceImage ? sourceImage.sourceImageId : null,
          pageIndex: header.source.pageIndex,
          regionIndex: header.source.regionIndex,
          headerRowCandidateId: header.rowCandidateId,
          headerCellCandidateIds: Object.freeze(header.cells.map(function (cell) { return cell.id; }))
        }),
        panelBox,
        columnBands: bands,
        master: master || emptyMaterialLedgerMaster(panelId, header, sourceImage),
        entries: Object.freeze(entries)
      });
    });
    const materialMasters = Object.freeze(panels.map(function (panel) { return panel.master; }).filter(function (master) {
      return master && master.hasEvidence === true;
    }));
    const inventoryTransactions = Object.freeze(panels.reduce(function (entries, panel) {
      return entries.concat(panel.entries || []);
    }, []));
    return Object.freeze({
      schemaVersion: 2,
      completeness: rowCandidatesTruncated ? "partial" : "complete",
      panels: Object.freeze(panels),
      materialMasters,
      inventoryTransactions,
      unassignedCandidates: Object.freeze([]),
      warnings: Object.freeze(rowCandidatesTruncated ? ["source-row-candidates-truncated"] : []),
      autoCommitAllowed: false,
      l3UploadReady: false
    });
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
        regionIndex: safeIndex(block.source.regionIndex),
        blockIndex: safeIndex(block.source.blockIndex),
        paragraphIndex: safeIndex(block.source.paragraphIndex),
        rowCandidateId: safeEvidenceId(block.source.rowCandidateId),
        cellCandidateIds: safeEvidenceIds(block.source.cellCandidateIds)
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
      wordGeometry: value.wordGeometry === true,
      rowCandidateMethod: value.rowCandidateMethod === "geometry-only" ? "geometry-only" : "unknown",
      semanticInference: false
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

  function equipmentEvidenceZone(block) {
    const source = block && block.source && typeof block.source === "object" ? block.source : null;
    const rowCandidateId = source && safeEvidenceId(source.rowCandidateId);
    const parsedRow = rowCandidateId && rowCandidateId.match(/(?:^|-)p(\d+)-r(\d+)(?:-|$)/i);
    const sourcePage = source && Number.isInteger(Number(source.pageIndex)) && Number(source.pageIndex) >= 0
      ? Number(source.pageIndex)
      : null;
    const sourceRegion = source && Number.isInteger(Number(source.regionIndex)) && Number(source.regionIndex) >= 0
      ? Number(source.regionIndex)
      : null;
    const pageIndex = sourcePage != null ? sourcePage : (parsedRow ? Number(parsedRow[1]) - 1 : null);
    const regionIndex = sourceRegion != null ? sourceRegion : (parsedRow ? Number(parsedRow[2]) - 1 : null);
    return Object.freeze({
      pageIndex,
      regionIndex,
      key: (pageIndex == null ? "unknown-page" : "page-" + pageIndex)
        + ":" + (regionIndex == null ? "unknown-region" : "region-" + regionIndex)
    });
  }

  function sameEquipmentEvidenceZone(left, right) {
    const a = left && left.zone ? left.zone : equipmentEvidenceZone(left);
    const b = right && right.zone ? right.zone : equipmentEvidenceZone(right);
    if (a.pageIndex != null || b.pageIndex != null) {
      if (a.pageIndex == null || b.pageIndex == null || a.pageIndex !== b.pageIndex) return false;
    }
    if (a.regionIndex != null || b.regionIndex != null) {
      if (a.regionIndex == null || b.regionIndex == null || a.regionIndex !== b.regionIndex) return false;
    }
    return true;
  }

  function findEquipmentMaintenanceRows(blocks) {
    const list = Array.isArray(blocks) ? blocks : [];
    const anchors = [];
    const inheritedYears = new Map();
    list.forEach(function (block, blockIndex) {
      const zone = equipmentEvidenceZone(block);
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
          inheritedYears.set(zone.key, part.date.value.slice(0, 4));
          dates.push(part.date);
          return;
        }
        const inheritedYear = inheritedYears.get(zone.key) || "";
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
          zone,
          center: blockCenter(block),
          segmentText: dates.length > 1
            ? block.text.slice(date.sourceIndex, nextDate ? nextDate.sourceIndex : block.text.length)
            : ""
        });
      });
    });
    anchors.sort(function (a, b) {
      const aPage = a.zone.pageIndex == null ? Number.POSITIVE_INFINITY : a.zone.pageIndex;
      const bPage = b.zone.pageIndex == null ? Number.POSITIVE_INFINITY : b.zone.pageIndex;
      if (aPage !== bPage) return aPage - bPage;
      const aRegion = a.zone.regionIndex == null ? Number.POSITIVE_INFINITY : a.zone.regionIndex;
      const bRegion = b.zone.regionIndex == null ? Number.POSITIVE_INFINITY : b.zone.regionIndex;
      if (aRegion !== bRegion) return aRegion - bRegion;
      const aCenter = a.center == null ? Number.POSITIVE_INFINITY : a.center;
      const bCenter = b.center == null ? Number.POSITIVE_INFINITY : b.center;
      return aCenter - bCenter || a.blockIndex - b.blockIndex || a.dateIndex - b.dateIndex;
    });
    const rows = anchors.slice(0, 30).map(function (anchor, index) {
      const previousCandidate = anchors[index - 1];
      const nextCandidate = anchors[index + 1];
      const previous = previousCandidate && sameEquipmentEvidenceZone(anchor, previousCandidate) ? previousCandidate : null;
      const next = nextCandidate && sameEquipmentEvidenceZone(anchor, nextCandidate) ? nextCandidate : null;
      const top = anchor.center == null || !previous || previous.center == null ? -1 : (previous.center + anchor.center) / 2;
      const bottom = anchor.center == null || !next || next.center == null ? 2 : (anchor.center + next.center) / 2;
      const nearby = list.filter(function (block, blockIndex) {
        if (!sameEquipmentEvidenceZone(anchor, block)) return false;
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

  function safeCandidateValue(value) {
    if (value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean") return value;
    return normalizeText(value).slice(0, 240) || null;
  }

  function candidateEvidence(candidate, blocks, sourceImage, sourceBlockIds) {
    const item = candidate || {};
    const list = Array.isArray(blocks) ? blocks : [];
    const allowedIds = new Set(Array.isArray(sourceBlockIds) ? sourceBlockIds : []);
    const sourceText = normalizeText(item.sourceText).slice(0, 500);
    const valueText = normalizeText(item.value);
    const terms = [sourceText, valueText].map(compact).filter(function (term) { return term.length >= 2; });
    const matched = list.filter(function (block) {
      if (allowedIds.size && !allowedIds.has(block.id)) return false;
      if (!terms.length) return allowedIds.has(block.id);
      const body = compact(block.text);
      return terms.some(function (term) { return body.includes(term) || term.includes(body); });
    }).slice(0, MAX_FIELD_EVIDENCE).map(function (block) {
      const blockSource = block.source || {};
      return Object.freeze({
        sourceImageId: sourceImage ? sourceImage.sourceImageId : null,
        blockId: block.id,
        rowCandidateId: safeEvidenceId(item.rowCandidateId) || blockSource.rowCandidateId || null,
        cellCandidateIds: safeEvidenceIds(item.cellCandidateIds || blockSource.cellCandidateIds),
        sourceText: sourceText || block.text.slice(0, 500),
        box: block.box,
        confidence: clamp01(item.confidence || block.confidence)
      });
    });
    if (!matched.length && sourceText) {
      matched.push(Object.freeze({
        sourceImageId: sourceImage ? sourceImage.sourceImageId : null,
        blockId: null,
        rowCandidateId: safeEvidenceId(item.rowCandidateId),
        cellCandidateIds: safeEvidenceIds(item.cellCandidateIds),
        sourceText,
        box: null,
        confidence: clamp01(item.confidence)
      }));
    }
    return Object.freeze(matched);
  }

  function standardCandidate(candidate, blocks, sourceImage, sourceBlockIds) {
    const item = candidate || {};
    const value = safeCandidateValue(item.value);
    if (value == null) return null;
    const out = {
      value,
      confidence: clamp01(item.confidence),
      evidence: candidateEvidence(item, blocks, sourceImage, sourceBlockIds)
    };
    const unit = safeCandidateValue(item.unit);
    if (unit != null) out.unit = unit;
    const kind = safeCandidateValue(item.kind);
    if (kind != null) out.kind = kind;
    const match = safeCandidateValue(item.match);
    if (match != null) out.match = match;
    if (item.selected === true) out.markDetected = true;
    return Object.freeze(out);
  }

  function standardDetail(key, label, candidates, blocks, sourceImage, sourceBlockIds, requiredForLocalRecord) {
    const list = (Array.isArray(candidates) ? candidates : []).slice(0, MAX_FIELD_CANDIDATES).map(function (candidate) {
      return standardCandidate(candidate, blocks, sourceImage, sourceBlockIds);
    }).filter(Boolean);
    const evidence = [];
    const evidenceKeys = new Set();
    list.forEach(function (candidate) {
      candidate.evidence.forEach(function (item) {
        const evidenceKey = [item.sourceImageId || "", item.blockId || "", item.sourceText].join("|");
        if (evidence.length >= MAX_FIELD_EVIDENCE || evidenceKeys.has(evidenceKey)) return;
        evidenceKeys.add(evidenceKey);
        evidence.push(item);
      });
    });
    return Object.freeze({
      key,
      label,
      value: null,
      candidates: Object.freeze(list),
      confidence: list.length ? Math.max.apply(null, list.map(function (item) { return item.confidence; })) : null,
      evidence: Object.freeze(evidence),
      requiredForLocalRecord: requiredForLocalRecord === true,
      confirmation: Object.freeze({
        state: "pending",
        confirmed: false,
        confirmedValue: null,
        confirmedAt: null
      })
    });
  }

  function activityMappingPending(l3MappingStatus) {
    const status = normalizeText(l3MappingStatus);
    return !!status && status !== "mapped" && status !== "not-applicable";
  }

  function standardActivity(input) {
    const source = input || {};
    const details = (Array.isArray(source.details) ? source.details : []).slice(0, MAX_ACTIVITY_DETAILS);
    const blockIds = Array.from(new Set((Array.isArray(source.sourceBlockIds) ? source.sourceBlockIds : [])
      .map(function (id) { return String(id || "").slice(0, 160); })
      .filter(Boolean))).slice(0, 100);
    const rowCandidateIds = [];
    const cellCandidateIds = [];
    details.forEach(function (detail) {
      (Array.isArray(detail && detail.evidence) ? detail.evidence : []).forEach(function (evidence) {
        const rowId = safeEvidenceId(evidence && evidence.rowCandidateId);
        if (rowId && rowCandidateIds.indexOf(rowId) < 0 && rowCandidateIds.length < 100) rowCandidateIds.push(rowId);
        safeEvidenceIds(evidence && evidence.cellCandidateIds).forEach(function (cellId) {
          if (cellCandidateIds.indexOf(cellId) < 0 && cellCandidateIds.length < 100) cellCandidateIds.push(cellId);
        });
      });
    });
    const mappingStatus = normalizeText(source.l3MappingStatus) || "not-mapped";
    return Object.freeze({
      id: String(source.id || "activity-pending").slice(0, 100),
      kind: null,
      kindCandidate: safeCandidateValue(source.kindCandidate),
      route: normalizeText(source.route) || "unknown",
      destination: normalizeText(source.destination) || "manual-classification",
      associationState: source.associationState === "row-evidence" ? "row-evidence" : "pending",
      status: "pending-confirmation",
      confidence: details.length ? Math.max.apply(null, details.map(function (detail) { return Number(detail.confidence) || 0; })) : null,
      source: Object.freeze({
        sourceImageId: source.sourceImage ? source.sourceImage.sourceImageId : null,
        blockIds: Object.freeze(blockIds),
        rowCandidateIds: Object.freeze(rowCandidateIds),
        cellCandidateIds: Object.freeze(cellCandidateIds)
      }),
      details: Object.freeze(details),
      confirmation: Object.freeze({ state: "pending", confirmed: false, confirmedAt: null }),
      l3MappingStatus: mappingStatus,
      mappingPending: activityMappingPending(mappingStatus),
      l3UploadReady: false,
      autoCommitAllowed: false
    });
  }

  function standardActivities(context) {
    const ctx = context || {};
    const routeDecision = ctx.routeDecision || {};
    const route = ctx.route || {};
    const blocks = Array.isArray(ctx.blocks) ? ctx.blocks : [];
    const sourceImage = ctx.sourceImage || null;
    const activities = [];

    if (Array.isArray(ctx.equipmentRows) && ctx.equipmentRows.length) {
      ctx.equipmentRows.slice(0, MAX_DRAFT_ACTIVITIES).forEach(function (row, index) {
        const sourceBlockIds = row.sourceBlockIds || [];
        const selectedEquipment = (row.equipment || []).filter(function (item) { return item.selected === true; });
        const selectedActions = (row.actions || []).filter(function (item) { return item.selected === true; });
        activities.push(standardActivity({
          id: "activity-equipment-" + (index + 1),
          kindCandidate: "equipmentMaintenance",
          route: route.route,
          destination: route.destination,
          l3MappingStatus: route.l3MappingStatus,
          associationState: "row-evidence",
          sourceImage,
          sourceBlockIds,
          details: [
            standardDetail("date", "日期", row.date, blocks, sourceImage, sourceBlockIds, true),
            standardDetail("equipment", "器具／機械／設備", selectedEquipment, blocks, sourceImage, sourceBlockIds, true),
            standardDetail("actions", "作業內容", selectedActions, blocks, sourceImage, sourceBlockIds, true),
            standardDetail("operator", "記錄人", row.operator, blocks, sourceImage, sourceBlockIds, false)
          ]
        }));
      });
      return Object.freeze(activities);
    }

    if (ctx.materialInventory) {
      const inventory = ctx.materialInventory;
      const associatedEntries = [];
      const materialMasterById = new Map((inventory.materialMasters || []).map(function (master) {
        return [master.id, master];
      }));
      (inventory.panels || []).forEach(function (panel) {
        (panel.entries || []).forEach(function (entry) {
          if (associatedEntries.length < MAX_DRAFT_ACTIVITIES) associatedEntries.push(entry);
        });
      });
      if (associatedEntries.length) {
        associatedEntries.forEach(function (entry, index) {
          const master = entry.materialMasterId ? materialMasterById.get(entry.materialMasterId) : null;
          const masterDetails = master && master.details || {};
          activities.push(standardActivity({
            id: "activity-inventory-row-" + (index + 1),
            kindCandidate: "materialInventory",
            route: route.route,
            destination: route.destination,
            l3MappingStatus: route.l3MappingStatus,
            associationState: entry.associationState,
            sourceImage,
            sourceBlockIds: blocks.map(function (block) { return block.id; }),
            details: [
              standardDetail("materialName", "資材名稱", masterDetails.materialName && masterDetails.materialName.candidates, blocks, sourceImage, null, true),
              standardDetail("manufacturer", "廠商", masterDetails.manufacturer && masterDetails.manufacturer.candidates, blocks, sourceImage, null, false),
              standardDetail("supplier", "供應商", masterDetails.supplier && masterDetails.supplier.candidates, blocks, sourceImage, null, false),
              standardDetail("packageCapacity", "包裝容量", masterDetails.packageCapacity && masterDetails.packageCapacity.candidates, blocks, sourceImage, null, false),
              standardDetail("packageUnit", "包裝單位", masterDetails.packageUnit && masterDetails.packageUnit.candidates, blocks, sourceImage, null, false),
              standardDetail("date", "日期", entry.details.date.candidates, blocks, sourceImage, null, true),
              standardDetail("purchaseAmount", "購入量", entry.details.purchaseAmount.candidates, blocks, sourceImage, null, false),
              standardDetail("usedAmount", "使用量", entry.details.usedAmount.candidates, blocks, sourceImage, null, false),
              standardDetail("remainingAmount", "剩餘量", entry.details.remainingAmount.candidates, blocks, sourceImage, null, false)
            ]
          }));
        });
        return Object.freeze(activities);
      }
      const rowCount = Math.max(1, Math.min(MAX_DRAFT_ACTIVITIES, Math.max(
        inventory.suggestedRowCount || 1,
        inventory.materials.length,
        inventory.dates.length
      )));
      for (let index = 0; index < rowCount; index += 1) {
        activities.push(standardActivity({
          id: "activity-inventory-" + (index + 1),
          kindCandidate: "materialInventory",
          route: route.route,
          destination: route.destination,
          l3MappingStatus: route.l3MappingStatus,
          associationState: "pending",
          sourceImage,
          sourceBlockIds: blocks.map(function (block) { return block.id; }),
          details: [
            standardDetail("materialName", "資材名稱", inventory.materials, blocks, sourceImage, null, true),
            standardDetail("manufacturer", "廠商", inventory.manufacturers, blocks, sourceImage, null, false),
            standardDetail("supplier", "供應商", inventory.suppliers, blocks, sourceImage, null, true),
            standardDetail("packageCapacity", "包裝容量", inventory.packageCapacities, blocks, sourceImage, null, false),
            standardDetail("date", "日期", inventory.dates, blocks, sourceImage, null, true),
            standardDetail("amount", "數量候選（購入／使用／剩餘待確認）", inventory.amounts, blocks, sourceImage, null, false)
          ]
        }));
      }
      return Object.freeze(activities);
    }

    const fields = ctx.fields || {};
    const generalBlockIds = blocks.map(function (block) { return block.id; });
    const routeType = routeDecision.type === "purchase" ? "materialPurchase" : routeDecision.type;
    activities.push(standardActivity({
      id: "activity-1",
      kindCandidate: routeType || null,
      route: route.route,
      destination: route.destination,
      l3MappingStatus: route.l3MappingStatus,
      associationState: "pending",
      sourceImage,
      sourceBlockIds: generalBlockIds,
      details: [
        standardDetail("recordType", "紀錄類型", fields.recordType, blocks, sourceImage, null, true),
        standardDetail("date", "日期", fields.date, blocks, sourceImage, null, true),
        standardDetail("crop", "作物", fields.crop, blocks, sourceImage, null, false),
        standardDetail("fieldPlot", "正式田區代號", fields.fieldPlot, blocks, sourceImage, null, false),
        standardDetail("workGroup", "共同作業分區", fields.workGroup, blocks, sourceImage, null, false),
        standardDetail("landParcel", "地號／地籍", fields.landParcel, blocks, sourceImage, null, false),
        standardDetail("target", "防治對象", fields.target, blocks, sourceImage, null, false),
        standardDetail("material", "藥劑／資材名稱", fields.material, blocks, sourceImage, null, false),
        standardDetail("dilution", "稀釋倍數", fields.dilution, blocks, sourceImage, null, false),
        standardDetail("amount", "數量", fields.amount, blocks, sourceImage, null, false),
        standardDetail("packageWeight", "包裝規格／重量", fields.packageWeight, blocks, sourceImage, null, false),
        standardDetail("labelCount", "標籤張數", fields.labelCount, blocks, sourceImage, null, false),
        standardDetail("safetyInterval", "安全採收期", fields.safetyInterval, blocks, sourceImage, null, false),
        standardDetail("operator", "執行人", fields.operator, blocks, sourceImage, null, false)
      ]
    }));
    return Object.freeze(activities);
  }

  function createDraft(scanResult, dictionaries, sourceMetadata) {
    const result = scanResult || {};
    const quality = assessQuality(result.quality);
    const blocks = safeBlocks(result.blocks);
    const text = blocks.map(function (block) { return block.text; }).join("\n");
    const dict = dictionaries || {};
    const recordTypes = detectFormTypes(text);
    const routeDecision = decideDocumentRoute(recordTypes, text);
    const isEquipmentForm = routeDecision.status === "exact" && routeDecision.type === "equipmentMaintenance";
    const isSelfInspection = routeDecision.status === "exact" && routeDecision.type === "selfInspection";
    const isMaterialInventory = routeDecision.status === "exact" && routeDecision.type === "purchase";
    const materialInventoryTextDraft = isMaterialInventory ? createMaterialInventoryDraft(text) : null;
    const sourceImage = safeSourceImage(sourceMetadata || result.sourceImage);
    const sourceRowCandidates = Array.isArray(result.rowCandidates) ? result.rowCandidates : [];
    const rowCandidates = safeRowCandidates(sourceRowCandidates);
    const rowCandidatesTruncated = result.rowCandidatesTruncated === true
      || sourceRowCandidates.length > MAX_SOURCE_ROW_CANDIDATES
      || rowCandidates.length < sourceRowCandidates.length;
    const materialInventory = materialInventoryTextDraft ? Object.freeze(Object.assign({}, materialInventoryTextDraft,
      associateMaterialLedgerRows(rowCandidates, rowCandidatesTruncated, sourceImage))) : null;
    const route = Object.freeze({
      route: routeDecision.route,
      destination: routeDecision.destination,
      l3MappingStatus: routeDecision.l3MappingStatus,
      reason: routeDecision.reason
    });
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
    const locations = findLocationReferences(text);
    const operationalMeasurements = findOperationalMeasurements(text);
    const harvestQuantities = operationalMeasurements.filter(function (item) { return item.role === "harvestQuantity"; });
    const fields = Object.freeze({
      recordType: recordTypes,
      date: findDates(text),
      crop: dictionaryCandidates(text, dict.crops, "crop"),
      fieldPlot: locations.filter(function (item) { return item.role === "officialField"; }),
      workGroup: locations.filter(function (item) { return item.role === "workGroup"; }),
      landParcel: locations.filter(function (item) { return item.role === "landParcel"; }),
      target: dictionaryCandidates(text, dict.targets, "target"),
      material: mergeCandidates(dictionaryCandidates(text, dict.materials, "material"), materialInventory && materialInventory.materials),
      dilution: findDilutions(text),
      amount: routeDecision.status === "exact" && routeDecision.type === "harvest" ? harvestQuantities : findAmounts(text),
      harvestQuantity: harvestQuantities,
      packageWeight: operationalMeasurements.filter(function (item) { return item.role === "packageWeight"; }),
      labelCount: operationalMeasurements.filter(function (item) { return item.role === "labelCount"; }),
      safetyInterval: findSafetyIntervals(text),
      operator: findLabeledValues(text, ["記錄人", "紀錄人", "操作人員", "執行人", "查核者", "確認者"], "operator")
    });
    const activities = standardActivities({
      routeDecision,
      route,
      fields,
      equipmentRows,
      materialInventory,
      blocks,
      sourceImage
    });
    return Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      intermediateDraftSchemaVersion: INTERMEDIATE_DRAFT_SCHEMA_VERSION,
      requestId: String(result.requestId || "").slice(0, 100),
      source: result.source === "google-cloud-vision" ? "google-cloud-vision" : "android-on-device-ocr",
      createdAt: String(result.createdAt || new Date().toISOString()),
      confirmed: false,
      confirmationState: "pending",
      autoCommitAllowed: false,
      l3UploadReady: false,
      sourceImage,
      layout: safeLayout(result.layout),
      rowCandidates,
      rowCandidatesTruncated,
      quality,
      routeDecision,
      route,
      fields,
      activities,
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
    strongDocumentType,
    decideDocumentRoute,
    findPlotCodes,
    findLocationReferences,
    findOperationalMeasurements,
    findLabeledValues,
    findInventoryLabeledValues,
    createMaterialInventoryDraft,
    associateMaterialLedgerRows,
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
