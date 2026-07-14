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
    return {
      id: required(makeId("farm"), "紀錄編號"),
      plotId: required(source.plotId, "田區／種植批次"),
      type: type,
      date: date,
      operator: text(source.operator),
      notes: text(source.notes),
      details: makeDetails(type, source.details),
      createdAt: text(source.createdAt) || new Date().toISOString()
    };
  }

  function summary(record) {
    const r = record || {};
    const d = r.details || {};
    if (r.type === "cultivation") return [d.activity, d.method].filter(Boolean).join(" · ");
    if (r.type === "fertilizer") return [d.materialName, d.quantity && d.unit ? d.quantity + " " + d.unit : "", d.method].filter(Boolean).join(" · ");
    if (r.type === "harvest") return [d.quantity && d.unit ? d.quantity + " " + d.unit : "", d.grade, d.batchNo ? "批號 " + d.batchNo : ""].filter(Boolean).join(" · ");
    if (r.type === "postharvest") return [d.process, d.quantity && d.unit ? d.quantity + " " + d.unit : "", d.destination].filter(Boolean).join(" · ");
    if (r.type === "materialPurchase") return [d.materialName, d.quantity && d.unit ? d.quantity + " " + d.unit : "", d.supplier].filter(Boolean).join(" · ");
    return "";
  }

  function csvCell(value) {
    const raw = String(value == null ? "" : value);
    return /[",\n\r]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
  }

  function exportCsv(records, plotName) {
    const label = typeof plotName === "function" ? plotName : function (id) { return id || ""; };
    const head = ["田區/作物紀錄區", "紀錄日期", "紀錄類型", "作業/品項", "數量", "單位", "方法/處理", "供應商/去向", "批號", "憑證號碼", "執行人", "備註"];
    const rows = (Array.isArray(records) ? records : []).slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    }).map(function (r) {
      const d = r.details || {};
      let item = "", quantity = "", unit = "", method = "", party = "", lot = "", receipt = "";
      if (r.type === "cultivation") { item = d.activity; method = d.method; }
      if (r.type === "fertilizer") { item = d.materialName; quantity = d.quantity; unit = d.unit; method = d.method; lot = d.lotNo; }
      if (r.type === "harvest") { item = d.grade || "採收"; quantity = d.quantity; unit = d.unit; lot = d.batchNo; }
      if (r.type === "postharvest") { item = d.process; quantity = d.quantity; unit = d.unit; method = d.process; party = d.destination; }
      if (r.type === "materialPurchase") { item = d.materialName; quantity = d.quantity; unit = d.unit; method = d.category; party = d.supplier; lot = d.lotNo; receipt = d.receiptNo; }
      return [label(r.plotId), r.date, RECORD_TYPES[r.type] || r.type, item, quantity, unit, method, party, lot, receipt, r.operator, r.notes].map(csvCell).join(",");
    });
    return "\uFEFF" + head.join(",") + "\n" + rows.join("\n");
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
    exportCsv: exportCsv,
    buildBackup: buildBackup,
    readBackup: readBackup,
    validDate: validDate
  });
});
