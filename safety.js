(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PQC_SAFETY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeDigits(value) {
    return String(value || "").replace(/[０-９]/g, function (ch) {
      return String(ch.charCodeAt(0) - 0xfee0);
    });
  }

  function numericPhi(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 365 ? n : null;
  }

  /*
   * 備註可能同時列出露天、設施或不同採收用途。
   * App 尚未詢問栽培方式，因此只要備註明確談到採收/停藥，便採其中最長天數。
   * 這可能比實際標示更保守，但不會把較長的設施栽培天數漏掉。
   */
  function phiFromNote(note) {
    const text = normalizeDigits(note);
    if (!/(採收|收穫|停止施藥|停止用藥|設施栽培)/.test(text)) return null;
    const values = [];
    const re = /(\d{1,3})\s*天/g;
    let match;
    while ((match = re.exec(text))) {
      const n = Number(match[1]);
      if (n >= 0 && n <= 365) values.push(n);
    }
    return values.length ? Math.max.apply(null, values) : null;
  }

  function effectivePhi(agent) {
    const basePhi = numericPhi(agent && agent.phi);
    const notePhi = phiFromNote(agent && agent.note);
    const phi = basePhi === null ? notePhi : (notePhi === null ? basePhi : Math.max(basePhi, notePhi));
    return {
      phi: phi,
      basePhi: basePhi,
      notePhi: notePhi,
      adjusted: notePhi !== null && (basePhi === null || notePhi > basePhi)
    };
  }

  function formKind(form) {
    const value = String(form || "").toUpperCase();
    if (/SC|EC|SL|EW|ME|OD|SE|CS|EO|AL|懸|乳|溶液|油|液/.test(value)) return "液";
    if (/WP|WG|WDG|GR|DP|SP|SG|GB|WS|粉|粒/.test(value)) return "粉";
    return "";
  }

  function shouldShowVolumeApprox(unit) {
    return String(unit || "").trim().toLowerCase() === "ml";
  }

  /* 未完成官方逐項校驗前，只回傳作物本身，不自動併入上層群組。 */
  function directCropLevels(crop, data) {
    return data && data[crop] ? [crop] : [];
  }

  function safeHarvestDate(dateString, phi) {
    const days = numericPhi(phi);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ""));
    if (days === null || !match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(date.getTime())) return null;
    date.setDate(date.getDate() + days + 1);
    return date;
  }

  function recordGroupKey(record) {
    if (record && record.plotId) return "plot:" + record.plotId;
    return "crop:" + String(record && record.crop || "未指定作物");
  }

  /*
   * 每筆實際施藥都納入。track/notify 等偏好不得排除安全計算。
   * 同田區/種植批次取最晚日期；只要其中一筆採收期未知，整批便不可顯示可採日期。
   */
  function aggregateHarvest(records) {
    const groups = {};
    (Array.isArray(records) ? records : []).forEach(function (record) {
      const key = recordGroupKey(record);
      const group = groups[key] || (groups[key] = {
        key: key,
        crop: record.crop || "未指定作物",
        plotId: record.plotId || "",
        records: [],
        unknown: false,
        latestKnown: null,
        controlling: null,
        ok: null
      });
      group.records.push(record);
      const date = safeHarvestDate(record.date, record.phi);
      if (!date) {
        group.unknown = true;
      } else if (!group.latestKnown || date > group.latestKnown) {
        group.latestKnown = date;
        group.controlling = record;
      }
    });
    Object.keys(groups).forEach(function (key) {
      groups[key].ok = groups[key].unknown ? null : groups[key].latestKnown;
    });
    return groups;
  }

  return {
    normalizeDigits: normalizeDigits,
    numericPhi: numericPhi,
    phiFromNote: phiFromNote,
    effectivePhi: effectivePhi,
    formKind: formKind,
    shouldShowVolumeApprox: shouldShowVolumeApprox,
    directCropLevels: directCropLevels,
    safeHarvestDate: safeHarvestDate,
    recordGroupKey: recordGroupKey,
    aggregateHarvest: aggregateHarvest
  };
});
