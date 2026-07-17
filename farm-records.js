(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_FARM = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RECORD_TYPES = Object.freeze({
    cultivation: "栽培作業",
    fertilizer: "施肥",
    harvest: "採收",
    postharvest: "採後處理",
    materialPurchase: "資材購入"
  });

  const BACKUP_PRODUCT = "searchbefore-backup";
  const BACKUP_FORMAT_VERSION = 1;

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function numberText(value) {
    const raw = text(value);
    if (!raw) return "";
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error("數量必須是 0 以上的數字");
    return String(n);
  }

  function validDate(value) {
    const date = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date + "T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }

  function required(value, label) {
    const out = text(value);
    if (!out) throw new Error("請填寫" + label);
    return out;
  }

  function makeDetails(type, details) {
    const d = details || {};
    if (type === "cultivation") {
      return {
        activity: required(d.activity, "作業內容"),
        method: text(d.method)
      };
    }
    if (type === "fertilizer") {
      return {
        materialName: required(d.materialName, "肥料或資材名稱"),
        dressing: text(d.dressing),
        quantity: numberText(required(d.quantity, "施用量")),
        unit: required(d.unit, "施用量單位"),
        method: text(d.method),
        lotNo: text(d.lotNo)
      };
    }
    if (type === "harvest") {
      return {
        quantity: numberText(required(d.quantity, "採收量")),
        unit: required(d.unit, "採收量單位"),
        grade: text(d.grade),
        batchNo: text(d.batchNo)
      };
    }
    if (type === "postharvest") {
      const quantity = numberText(d.quantity);
      return {
        process: required(d.process, "處理方式"),
        quantity: quantity,
        unit: quantity ? text(d.unit) : "",
        destination: text(d.destination)
      };
    }
    if (type === "materialPurchase") {
      return {
        category: required(d.category, "資材類別"),
        materialName: required(d.materialName, "資材名稱"),
        supplier: required(d.supplier, "供應商"),
        quantity: numberText(required(d.quantity, "購入數量")),
        unit: required(d.unit, "購入數量單位"),
        lotNo: text(d.lotNo),
        receiptNo: text(d.receiptNo)
      };
    }
    throw new Error("不支援的紀錄類型");
  }

  function createRecord(input, idFactory) {
    const source = input || {};
    const type = text(source.type);
    if (!Object.prototype.hasOwnProperty.call(RECORD_TYPES, type)) throw new Error("請選擇紀錄類型");
    const date = required(source.date, "日期");
    if (!validDate(date)) throw new Error("日期格式不正確");
    const makeId = typeof idFactory === "function"
      ? idFactory
      : function () { return "farm-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); };
    const record = {
      id: required(makeId("farm"), "紀錄編號"),
      plotId: required(source.plotId, "田區／種植批次"),
      type: type,
      date: date,
      operator: text(source.operator),
      notes: text(source.notes),
      details: makeDetails(type, source.details),
      createdAt: text(source.createdAt) || new Date().toISOString()
    };
    if (type === "harvest" && source.safetyCheck && typeof source.safetyCheck === "object") {
      const status = text(source.safetyCheck.status);
      if (["none", "safe", "waiting", "unknown"].indexOf(status) >= 0) {
        record.safetyCheck = {
          status: status,
          safeDate: text(source.safetyCheck.safeDate),
          daysRemaining: source.safetyCheck.daysRemaining == null ? null : Number(source.safetyCheck.daysRemaining),
          recordCount: Number(source.safetyCheck.recordCount) || 0,
          checkedAt: text(source.safetyCheck.checkedAt) || new Date().toISOString()
        };
      }
    }
    return record;
  }

  function summary(record) {
    const r = record || {};
    const d = r.details || {};
    if (r.type === "cultivation") return [d.activity, d.method].filter(Boolean).join(" · ");
    if (r.type === "fertilizer") return [d.materialName, d.dressing, d.quantity && d.unit ? d.quantity + " " + d.unit : "", d.method].filter(Boolean).join(" · ");
    if (r.type === "harvest") return [d.quantity && d.unit ? d.quantity + " " + d.unit : "", d.grade, d.batchNo ? "批號 " + d.batchNo : ""].filter(Boolean).join(" · ");
    if (r.type === "postharvest") return [d.process, d.quantity && d.unit ? d.quantity + " " + d.unit : "", d.destination].filter(Boolean).join(" · ");
    if (r.type === "materialPurchase") return [d.materialName, d.quantity && d.unit ? d.quantity + " " + d.unit : "", d.supplier].filter(Boolean).join(" · ");
    return "";
  }

  function csvCell(value) {
    const raw = String(value == null ? "" : value);
    return /[",\n\r]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
  }

  // 結構化表格（head + rows），供 CSV、Excel、列印/PDF 共用同一份欄位邏輯
  function buildRecordsTable(records, plotName) {
    const label = typeof plotName === "function" ? plotName : function (id) { return id || ""; };
    const head = ["田區/作物紀錄區", "紀錄日期", "紀錄類型", "作業/品項", "數量", "單位", "方法/處理", "供應商/去向", "批號", "憑證號碼", "執行人", "備註"];
    const rows = (Array.isArray(records) ? records : []).slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    }).map(function (r) {
      const d = r.details || {};
      let item = "", quantity = "", unit = "", method = "", party = "", lot = "", receipt = "";
      if (r.type === "cultivation") { item = d.activity; method = d.method; }
      if (r.type === "fertilizer") { item = d.materialName; quantity = d.quantity; unit = d.unit; method = [d.dressing, d.method].filter(Boolean).join(" · "); lot = d.lotNo; }
      if (r.type === "harvest") { item = d.grade || "採收"; quantity = d.quantity; unit = d.unit; lot = d.batchNo; }
      if (r.type === "postharvest") { item = d.process; quantity = d.quantity; unit = d.unit; method = d.process; party = d.destination; }
      if (r.type === "materialPurchase") { item = d.materialName; quantity = d.quantity; unit = d.unit; method = d.category; party = d.supplier; lot = d.lotNo; receipt = d.receiptNo; }
      return [label(r.plotId), r.date, RECORD_TYPES[r.type] || r.type, item, quantity, unit, method, party, lot, receipt, r.operator, r.notes]
        .map(function (v) { return v == null ? "" : v; });
    });
    return { head: head, rows: rows };
  }

  function exportCsv(records, plotName) {
    const table = buildRecordsTable(records, plotName);
    return "\uFEFF" + table.head.map(csvCell).join(",") + "\n"
      + table.rows.map(function (row) { return row.map(csvCell).join(","); }).join("\n");
  }

  function buildTimeline(pesticideRecords, farmRecords, plotId) {
    const events = [];
    (Array.isArray(pesticideRecords) ? pesticideRecords : []).forEach(function (record) {
      if (!plotId || record.plotId === plotId) events.push({ kind: "pesticide", date: text(record.date), id: text(record.id), source: record });
    });
    (Array.isArray(farmRecords) ? farmRecords : []).forEach(function (record) {
      if (!plotId || record.plotId === plotId) events.push({ kind: "farm", date: text(record.date), id: text(record.id), source: record });
    });
    return events.sort(function (a, b) {
      const byDate = b.date.localeCompare(a.date);
      if (byDate) return byDate;
      return String(b.source.createdAt || "").localeCompare(String(a.source.createdAt || ""));
    });
  }

  function recordCoverage(pesticideRecords, farmRecords, plotId) {
    const counts = { pesticide: 0, cultivation: 0, fertilizer: 0, harvest: 0, postharvest: 0, materialPurchase: 0 };
    (Array.isArray(pesticideRecords) ? pesticideRecords : []).forEach(function (record) {
      if (!plotId || record.plotId === plotId) counts.pesticide += 1;
    });
    (Array.isArray(farmRecords) ? farmRecords : []).forEach(function (record) {
      if ((!plotId || record.plotId === plotId) && Object.prototype.hasOwnProperty.call(counts, record.type)) counts[record.type] += 1;
    });
    const recordedTypes = Object.keys(counts).filter(function (key) { return counts[key] > 0; });
    return { counts: counts, recordedTypes: recordedTypes, total: recordedTypes.reduce(function (sum, key) { return sum + counts[key]; }, 0) };
  }

  function buildCombinedTable(pesticideRecords, farmRecords, options) {
    const opts = options || {};
    const plotName = typeof opts.plotName === "function" ? opts.plotName : function (id) { return id || ""; };
    const safeDate = typeof opts.safeDate === "function" ? opts.safeDate : function () { return ""; };
    const plotId = text(opts.plotId);
    const timeline = buildTimeline(pesticideRecords, farmRecords, plotId).slice().reverse();
    const head = ["田區/作物紀錄區", "日期", "事件類型", "作物/作業/品項", "病蟲害/方法", "藥劑/資材", "用量/稀釋", "安全採收期", "安全採收日/狀態", "批號/追溯碼", "供應商/去向", "執行人", "備註", "來源紀錄編號"];
    const rows = timeline.map(function (event) {
      const r = event.source || {};
      if (event.kind === "pesticide") {
        const phi = r.phi == null ? "未提供" : String(r.phi) + " 天";
        return [plotName(r.plotId), r.date, "用藥", r.crop, r.pest, r.agent, r.dil ? r.dil + " 倍" : "", phi, safeDate(r), "", "", r.operator || "", "", r.id];
      }
      const d = r.details || {};
      let item = "", method = "", material = "", quantity = "", lot = "", party = "", safety = "";
      if (r.type === "cultivation") { item = d.activity; method = d.method; }
      if (r.type === "fertilizer") { item = "施肥"; method = [d.dressing, d.method].filter(Boolean).join(" · "); material = d.materialName; quantity = [d.quantity, d.unit].filter(Boolean).join(" "); lot = d.lotNo; }
      if (r.type === "harvest") { item = d.grade || "採收"; quantity = [d.quantity, d.unit].filter(Boolean).join(" "); lot = d.batchNo; safety = r.safetyCheck ? r.safetyCheck.status + (r.safetyCheck.safeDate ? " / " + r.safetyCheck.safeDate : "") : "未連動檢查"; }
      if (r.type === "postharvest") { item = d.process; method = d.process; quantity = [d.quantity, d.unit].filter(Boolean).join(" "); party = d.destination; }
      if (r.type === "materialPurchase") { item = d.category; material = d.materialName; quantity = [d.quantity, d.unit].filter(Boolean).join(" "); lot = d.lotNo; party = d.supplier; }
      return [plotName(r.plotId), r.date, RECORD_TYPES[r.type] || r.type, item, method, material, quantity, "", safety, lot, party, r.operator, r.notes, r.id];
    });
    return { head: head, rows: rows };
  }

  function exportCombinedCsv(pesticideRecords, farmRecords, options) {
    const table = buildCombinedTable(pesticideRecords, farmRecords, options);
    return "\uFEFF" + table.head.map(csvCell).join(",") + "\n"
      + table.rows.map(function (row) { return row.map(csvCell).join(","); }).join("\n");
  }

  function buildBackup(data, appVersion) {
    return {
      product: BACKUP_PRODUCT,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: text(appVersion),
      exportedAt: new Date().toISOString(),
      data: data || {}
    };
  }

  function readBackup(payload) {
    if (!payload || payload.product !== BACKUP_PRODUCT) throw new Error("這不是噴前查的備份檔");
    if (Number(payload.formatVersion) !== BACKUP_FORMAT_VERSION) throw new Error("備份檔版本不支援");
    if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) throw new Error("備份內容不完整");
    const d = payload.data;
    for (const key of ["records", "farmRecords", "fieldPlots", "recipes", "recentCrops"]) {
      if (d[key] != null && !Array.isArray(d[key])) throw new Error("備份內容格式錯誤：" + key);
    }
    return d;
  }

  return Object.freeze({
    RECORD_TYPES: RECORD_TYPES,
    BACKUP_PRODUCT: BACKUP_PRODUCT,
    BACKUP_FORMAT_VERSION: BACKUP_FORMAT_VERSION,
    createRecord: createRecord,
    summary: summary,
    buildRecordsTable: buildRecordsTable,
    exportCsv: exportCsv,
    buildTimeline: buildTimeline,
    recordCoverage: recordCoverage,
    buildCombinedTable: buildCombinedTable,
    exportCombinedCsv: exportCombinedCsv,
    buildBackup: buildBackup,
    readBackup: readBackup,
    validDate: validDate
  });
});
