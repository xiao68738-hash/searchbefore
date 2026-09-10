(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_FIELD_SUMMARY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TYPE_LABELS = Object.freeze({
    pesticide: "施藥",
    cultivation: "栽培作業",
    fertilizer: "施肥",
    harvest: "採收",
    postharvest: "採後處理",
    materialPurchase: "資材購入",
    equipmentMaintenance: "設備管理",
    farm: "田間作業"
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function validDate(value) {
    const date = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date + "T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }

  function dateValue(value) {
    return validDate(value) ? new Date(value + "T00:00:00") : null;
  }

  function dateSort(a, b) {
    return String(b.date || "").localeCompare(String(a.date || ""));
  }

  function plotName(plot) {
    const p = plot || {};
    return [p.crop || p.name, p.variety, p.tag].filter(Boolean).join(" / ") || "未命名田區";
  }

  function farmSummary(record, farm) {
    if (farm && typeof farm.summary === "function") {
      try { return text(farm.summary(record)); } catch (error) { /* fallback below */ }
    }
    const details = record && record.details || {};
    const type = text(record && record.type);
    const values = {
      cultivation: [details.activity, details.method],
      fertilizer: [details.materialName, details.dressing, details.quantity && details.unit ? details.quantity + " " + details.unit : "", details.method],
      harvest: [details.quantity && details.unit ? details.quantity + " " + details.unit : "", details.grade],
      postharvest: [details.process, details.quantity && details.unit ? details.quantity + " " + details.unit : "", details.destination],
      materialPurchase: [details.materialName, details.quantity && details.unit ? details.quantity + " " + details.unit : "", details.supplier],
      equipmentMaintenance: [(details.equipment || []).join("、"), (details.actions || []).join("、")]
    }[type] || [record && record.notes];
    return values.filter(Boolean).join(" · ");
  }

  function pesticideSummary(record) {
    const r = record || {};
    return [r.agent || r.productName || "藥劑紀錄", r.pest, r.phi != null && r.phi !== "" ? "採收期 " + r.phi + " 天" : ""].filter(Boolean).join(" · ");
  }

  function normalizeEvents(input) {
    const source = input || {};
    const events = [];
    (Array.isArray(source.pesticideRecords) ? source.pesticideRecords : []).forEach(function (record) {
      if (!record || !validDate(record.date)) return;
      events.push({
        id: text(record.id),
        kind: "pesticide",
        date: text(record.date),
        label: TYPE_LABELS.pesticide,
        summary: pesticideSummary(record),
        source: record
      });
    });
    (Array.isArray(source.farmRecords) ? source.farmRecords : []).forEach(function (record) {
      if (!record || !validDate(record.date)) return;
      const kind = text(record.type) || "farm";
      events.push({
        id: text(record.id),
        kind: kind,
        date: text(record.date),
        label: TYPE_LABELS[kind] || TYPE_LABELS.farm,
        summary: farmSummary(record, source.farm),
        source: record
      });
    });
    return events.sort(dateSort);
  }

  function prepareSafetyRecords(records, safety) {
    return (Array.isArray(records) ? records : []).map(function (record) {
      if (!record) return record;
      if (!safety || typeof safety.effectivePhi !== "function") return record;
      const result = safety.effectivePhi(record);
      return Object.assign({}, record, { phi: result.phi });
    });
  }

  function isoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function buildSafety(records, today, safety) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!list.length) return { status: "none", safeDate: "", daysRemaining: null, recordCount: 0, unknownCount: 0 };
    const prepared = prepareSafetyRecords(list, safety);
    let groups = {};
    if (safety && typeof safety.aggregateHarvest === "function") groups = safety.aggregateHarvest(prepared);
    else {
      groups = { all: { records: prepared, unknown: false, latestKnown: null, ok: null } };
      prepared.forEach(function (record) {
        const phi = Number(record && record.phi);
        const date = dateValue(record && record.date);
        if (!Number.isFinite(phi) || !date) groups.all.unknown = true;
        else if (!groups.all.latestKnown || date.getTime() + (phi + 1) * 86400000 > groups.all.latestKnown.getTime()) {
          const safeDate = new Date(date.getTime());
          safeDate.setDate(safeDate.getDate() + phi + 1);
          groups.all.latestKnown = safeDate;
        }
      });
      groups.all.ok = groups.all.unknown ? null : groups.all.latestKnown;
    }
    const groupList = Object.keys(groups).map(function (key) { return groups[key]; });
    const unknownCount = groupList.reduce(function (total, group) {
      return total + (group.unknown ? (group.records || []).filter(function (record) {
        const phi = safety && typeof safety.effectivePhi === "function" ? safety.effectivePhi(record).phi : record && record.phi;
        return phi == null || !validDate(record && record.date);
      }).length : 0);
    }, 0);
    if (groupList.some(function (group) { return group.unknown; })) {
      const latestKnown = groupList.reduce(function (latest, group) {
        return group.latestKnown && (!latest || group.latestKnown > latest) ? group.latestKnown : latest;
      }, null);
      return { status: "unknown", safeDate: isoDate(latestKnown), daysRemaining: null, recordCount: list.length, unknownCount: unknownCount || 1 };
    }
    const latest = groupList.reduce(function (latestDate, group) {
      return group.ok && (!latestDate || group.ok > latestDate) ? group.ok : latestDate;
    }, null);
    if (!latest) return { status: "unknown", safeDate: "", daysRemaining: null, recordCount: list.length, unknownCount: list.length };
    const todayDate = dateValue(today) || new Date();
    todayDate.setHours(0, 0, 0, 0);
    const daysRemaining = Math.ceil((latest.getTime() - todayDate.getTime()) / 86400000);
    return {
      status: daysRemaining > 0 ? "waiting" : "safe",
      safeDate: isoDate(latest),
      daysRemaining: Math.max(0, daysRemaining),
      recordCount: list.length,
      unknownCount: 0
    };
  }

  function resolveNextAction(summary) {
    const s = summary || {};
    if (!s.plot) return { code: "CREATE_PLOT", label: "先建立第一個田區", description: "建立田區後，後續作業才會集中在同一處。" };
    if (s.safety && s.safety.status === "unknown") return { code: "REVIEW_SAFETY", label: "先核對採收期", description: "有施藥紀錄缺少可判定的採收期，先核對產品標示。" };
    if (s.safety && s.safety.status === "waiting") return { code: "VIEW_COUNTDOWN", label: "查看安全採收倒數", description: "目前仍在安全採收期內，先確認倒數再安排採收。" };
    if (!s.events || !s.events.length) return { code: "ADD_FIRST_RECORD", label: "新增第一筆作業", description: "從今天的栽培、施肥或用藥開始留下紀錄。" };
    if (!s.farmEventCount) return { code: "CONTINUE_RECORD", label: "補上田間作業", description: "用藥已留下，下一步可補上施肥、採收或其他作業。" };
    return { code: "CONTINUE_RECORD", label: "繼續記錄田間作業", description: "每次只記一件事，之後查找與匯出會更清楚。" };
  }

  function buildFieldSummary(input) {
    const source = input || {};
    const plot = source.plot || null;
    const events = normalizeEvents({ pesticideRecords: source.pesticideRecords, farmRecords: source.farmRecords, farm: source.farm });
    const safety = buildSafety(source.pesticideRecords, source.today, source.safety);
    const counts = {};
    events.forEach(function (event) { counts[event.kind] = (counts[event.kind] || 0) + 1; });
    const result = {
      plot: plot,
      plotName: plotName(plot),
      events: events,
      latestEvent: events[0] || null,
      counts: counts,
      pesticideCount: counts.pesticide || 0,
      farmEventCount: events.filter(function (event) { return event.kind !== "pesticide"; }).length,
      safety: safety,
      dataQuality: { totalEvents: events.length, invalidDates: 0, unknownSafety: safety.unknownCount || 0 }
    };
    result.nextAction = resolveNextAction(result);
    return result;
  }

  function selectPlot(input) {
    const source = input || {};
    const plots = Array.isArray(source.fieldPlots) ? source.fieldPlots.filter(Boolean) : [];
    if (!plots.length) return null;
    const active = plots.find(function (plot) { return plot.id && plot.id === source.activePlotId; });
    if (active) return active;
    const events = normalizeEvents({ pesticideRecords: source.pesticideRecords, farmRecords: source.farmRecords });
    const eventPlot = events.find(function (event) { return event.source && event.source.plotId; });
    if (eventPlot) {
      const byEvent = plots.find(function (plot) { return plot.id === eventPlot.source.plotId; });
      if (byEvent) return byEvent;
    }
    return plots.slice().sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); })[0];
  }

  return {
    TYPE_LABELS: TYPE_LABELS,
    validDate: validDate,
    normalizeEvents: normalizeEvents,
    buildSafety: buildSafety,
    resolveNextAction: resolveNextAction,
    buildFieldSummary: buildFieldSummary,
    selectPlot: selectPlot,
    plotName: plotName
  };
});
