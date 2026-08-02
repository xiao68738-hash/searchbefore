/* 產銷履歷特殊作業對照的內部狀態模型。
 *
 * 這個模組只供開發與測試，不載入正式網站、不連接 L3，也不代表任何
 * 自由文字已獲主管機關接受。官方項目只能來自核准後取得的官方 API
 * 代碼表；系統建議永遠不是確認結果。
 *
 * actor 代表已由可信任後端驗證的操作情境。正式啟用時不得直接相信
 * 瀏覽器傳來的 actor.role 或 actor.uid。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_TAP_ACTIVITY_MAPPING = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAPPING_STATES = Object.freeze({
    UNMAPPED: "unmapped",
    SUGGESTED: "suggested",
    EXACT: "exact",
    OTHER: "other"
  });
  const SOURCE_KINDS = Object.freeze(["farm_record", "form_ocr_draft", "manual_note"]);
  const ACTOR_ROLES = Object.freeze(["farmer", "reviewer", "manager"]);
  const OFFICIAL_CATALOG_SOURCE = "official_api";
  const EVENT_ACTIONS = Object.freeze([
    "mapping_created",
    "candidates_suggested",
    "mapping_marked_unmapped",
    "exact_mapping_confirmed",
    "other_mapping_confirmed",
    "source_revised"
  ]);

  function text(value, label, maxLength, required) {
    const output = String(value == null ? "" : value).trim();
    if (required && !output) throw new Error("請提供" + label);
    if (output.length > maxLength) throw new Error(label + "文字過長");
    return output;
  }

  function plainObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + "格式不正確");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(label + "只能使用一般物件");
    return value;
  }

  function iso(value, label) {
    const output = text(value, label, 40, true);
    const parsed = new Date(output);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== output) throw new Error(label + "必須是 ISO 時間");
    return output;
  }

  function positiveInteger(value, label) {
    if (!Number.isInteger(value) || value < 1) throw new Error(label + "必須是正整數");
    return value;
  }

  function safeClone(value, label, depth) {
    if (depth > 20) throw new Error(label + "巢狀層級過深");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") return text(value, label, 5000, false);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(label + "包含無效數值");
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > 100) throw new Error(label + "項目過多");
      return value.map(function (entry) { return safeClone(entry, label, depth + 1); });
    }
    const source = plainObject(value, label);
    const output = {};
    Object.keys(source).forEach(function (key) {
      if (["__proto__", "prototype", "constructor"].indexOf(key) >= 0) throw new Error(label + "包含不允許的欄位");
      output[key] = safeClone(source[key], label, depth + 1);
    });
    return output;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function nowIso(nowFactory) {
    return iso(typeof nowFactory === "function" ? nowFactory() : new Date().toISOString(), "事件時間");
  }

  function actorContext(value) {
    const source = plainObject(value, "操作人");
    const role = text(source.role, "操作人角色", 30, true);
    if (ACTOR_ROLES.indexOf(role) < 0) throw new Error("操作人角色不受支援");
    return {
      uid: text(source.uid, "操作人識別碼", 200, true),
      role: role
    };
  }

  function reviewerAllowed(actor) {
    if (actor.role !== "reviewer" && actor.role !== "manager") throw new Error("只有覆核人員可以確認官方對照");
  }

  function sourceRef(value) {
    const source = plainObject(value, "來源參照");
    const kind = text(source.kind, "來源種類", 40, true);
    if (SOURCE_KINDS.indexOf(kind) < 0) throw new Error("來源種類不受支援");
    return {
      kind: kind,
      id: text(source.id, "來源編號", 200, true),
      updatedAt: iso(source.updatedAt, "來源更新時間")
    };
  }

  function catalogEntry(value, label) {
    const source = plainObject(value, label);
    if (source.source !== OFFICIAL_CATALOG_SOURCE) throw new Error(label + "必須來自官方 API 代碼表");
    return {
      code: text(source.code, label + "代碼", 200, true),
      label: text(source.label, label + "名稱", 500, true),
      catalogVersion: text(source.catalogVersion, label + "代碼表版本", 200, true),
      source: OFFICIAL_CATALOG_SOURCE
    };
  }

  function candidates(value) {
    if (!Array.isArray(value) || !value.length) throw new Error("請提供至少一個候選官方項目");
    if (value.length > 20) throw new Error("候選官方項目過多");
    const seen = new Set();
    return value.map(function (entry) { return catalogEntry(entry, "候選官方項目"); }).filter(function (entry) {
      const key = entry.catalogVersion + "\u0000" + entry.code;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function event(value, index) {
    const source = plainObject(value, "對照事件");
    const sequence = positiveInteger(source.sequence, "事件序號");
    if (sequence !== index + 1) throw new Error("事件序號不連續");
    const action = text(source.action, "事件動作", 60, true);
    if (EVENT_ACTIONS.indexOf(action) < 0) throw new Error("事件動作不受支援");
    const role = text(source.actorRole, "事件角色", 30, true);
    if (ACTOR_ROLES.indexOf(role) < 0) throw new Error("事件角色不受支援");
    return {
      sequence: sequence,
      action: action,
      actorUid: text(source.actorUid, "事件操作人", 200, true),
      actorRole: role,
      at: iso(source.at, "事件時間"),
      details: safeClone(source.details || {}, "事件內容", 0)
    };
  }

  function emptyMapping(source, originalText) {
    return {
      sourceRef: source,
      sourceText: originalText,
      normalizedActivity: "",
      mappingState: MAPPING_STATES.UNMAPPED,
      unmappedReason: "",
      candidates: [],
      officialEntry: null,
      officialNote: "",
      reviewedRevision: null
    };
  }

  function replay(events) {
    let revision = 0;
    let state = null;
    events.forEach(function (entry, index) {
      const details = entry.details;
      if (index === 0) {
        if (entry.action !== "mapping_created") throw new Error("第一個事件必須是建立特殊作業草稿");
        revision = 1;
        state = emptyMapping(sourceRef(details.sourceRef), text(details.sourceText, "原始作業內容", 2000, true));
        return;
      }
      if (entry.action === "mapping_created") throw new Error("建立事件只能出現一次");
      if (entry.action === "source_revised") {
        if (positiveInteger(details.revision, "修訂版本") !== revision + 1) throw new Error("修訂版本不連續");
        const nextSource = sourceRef(details.sourceRef);
        if (nextSource.kind !== state.sourceRef.kind || nextSource.id !== state.sourceRef.id) throw new Error("修訂不可更換來源紀錄");
        if (new Date(nextSource.updatedAt).getTime() <= new Date(state.sourceRef.updatedAt).getTime()) throw new Error("來源更新時間必須晚於目前版本");
        revision += 1;
        state = emptyMapping(nextSource, text(details.sourceText, "原始作業內容", 2000, true));
        return;
      }
      if (positiveInteger(details.revision, "事件版本") !== revision) throw new Error("事件版本與目前來源不一致");
      if (entry.action === "candidates_suggested") {
        state.mappingState = MAPPING_STATES.SUGGESTED;
        state.candidates = candidates(details.candidates);
        state.officialEntry = null;
        state.officialNote = "";
        state.normalizedActivity = "";
        state.unmappedReason = "";
        state.reviewedRevision = null;
        return;
      }
      if (entry.action === "mapping_marked_unmapped") {
        state = Object.assign(state, emptyMapping(state.sourceRef, state.sourceText), {
          unmappedReason: text(details.reason, "無法對照原因", 1000, true)
        });
        return;
      }
      reviewerAllowed({ role: entry.actorRole });
      if (entry.action === "exact_mapping_confirmed") {
        state.mappingState = MAPPING_STATES.EXACT;
        state.officialEntry = catalogEntry(details.officialEntry, "正式官方項目");
        state.normalizedActivity = text(details.normalizedActivity, "標準化作業描述", 500, true);
        state.officialNote = "";
        state.unmappedReason = "";
        state.reviewedRevision = revision;
        return;
      }
      if (entry.action === "other_mapping_confirmed") {
        if (details.officialEntryIsOther !== true) throw new Error("必須明確確認所選項目是官方其他類別");
        state.mappingState = MAPPING_STATES.OTHER;
        state.officialEntry = catalogEntry(details.officialEntry, "官方其他類別");
        state.normalizedActivity = text(details.normalizedActivity, "標準化作業描述", 500, true);
        state.officialNote = text(details.officialNote, "官方備註草稿", 2000, true);
        state.unmappedReason = "";
        state.reviewedRevision = revision;
        return;
      }
      throw new Error("事件動作不受支援");
    });
    return Object.assign({ revision: revision }, state);
  }

  function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function validateActivityMapping(value) {
    const source = plainObject(value, "特殊作業對照資料");
    if (source.schemaVersion !== 1) throw new Error("特殊作業對照資料版本不受支援");
    const eventsSource = Array.isArray(source.events) ? source.events : [];
    if (!eventsSource.length) throw new Error("特殊作業對照資料缺少事件");
    if (eventsSource.length > 500) throw new Error("特殊作業對照事件過多");
    const events = eventsSource.map(event);
    events.forEach(function (entry, index) {
      if (index && new Date(entry.at).getTime() < new Date(events[index - 1].at).getTime()) throw new Error("事件時間順序不正確");
    });
    const derived = replay(events);
    const actualState = {
      revision: positiveInteger(source.revision, "資料版本"),
      sourceRef: sourceRef(source.sourceRef),
      sourceText: text(source.sourceText, "原始作業內容", 2000, true),
      normalizedActivity: text(source.normalizedActivity, "標準化作業描述", 500, false),
      mappingState: text(source.mappingState, "對照狀態", 30, true),
      unmappedReason: text(source.unmappedReason, "無法對照原因", 1000, false),
      candidates: Array.isArray(source.candidates) && source.candidates.length ? candidates(source.candidates) : [],
      officialEntry: source.officialEntry == null ? null : catalogEntry(source.officialEntry, "正式官方項目"),
      officialNote: text(source.officialNote, "官方備註草稿", 2000, false),
      reviewedRevision: source.reviewedRevision == null ? null : positiveInteger(source.reviewedRevision, "已覆核版本")
    };
    if (Object.values(MAPPING_STATES).indexOf(actualState.mappingState) < 0) throw new Error("對照狀態不受支援");
    if (!same(actualState, derived)) throw new Error("特殊作業對照狀態與事件歷程不一致");
    const createdAt = iso(source.createdAt, "建立時間");
    const updatedAt = iso(source.updatedAt, "更新時間");
    if (events[0].at !== createdAt || events[events.length - 1].at !== updatedAt) throw new Error("事件時間與資料時間不一致");
    return deepFreeze({
      schemaVersion: 1,
      id: text(source.id, "特殊作業對照編號", 200, true),
      workspaceId: text(source.workspaceId, "工作區識別碼", 200, true),
      farmerUid: text(source.farmerUid, "農友識別碼", 200, true),
      revision: actualState.revision,
      sourceRef: actualState.sourceRef,
      sourceText: actualState.sourceText,
      normalizedActivity: actualState.normalizedActivity,
      mappingState: actualState.mappingState,
      unmappedReason: actualState.unmappedReason,
      candidates: actualState.candidates,
      officialEntry: actualState.officialEntry,
      officialNote: actualState.officialNote,
      reviewedRevision: actualState.reviewedRevision,
      createdAt: createdAt,
      updatedAt: updatedAt,
      events: events
    });
  }

  function addEvent(item, action, actor, at, details) {
    return item.events.concat([{
      sequence: item.events.length + 1,
      action: action,
      actorUid: actor.uid,
      actorRole: actor.role,
      at: at,
      details: details
    }]);
  }

  function withEvent(itemInput, actorInput, action, details, nowFactory) {
    const item = validateActivityMapping(itemInput);
    const actor = actorContext(actorInput);
    const at = nowIso(nowFactory);
    const events = addEvent(item, action, actor, at, details);
    const derived = replay(events);
    return validateActivityMapping(Object.assign({}, item, derived, { updatedAt: at, events: events }));
  }

  function createActivityMapping(input, options) {
    const source = plainObject(input, "特殊作業草稿");
    const config = options || {};
    const actor = actorContext(source.createdBy);
    const farmerUid = text(source.farmerUid, "農友識別碼", 200, true);
    if (actor.role === "farmer" && actor.uid !== farmerUid) throw new Error("農友只能建立自己的特殊作業草稿");
    const at = nowIso(config.now);
    const ref = sourceRef(source.sourceRef);
    const originalText = text(source.sourceText, "原始作業內容", 2000, true);
    const idFactory = typeof config.idFactory === "function" ? config.idFactory : function () { return "tap-activity-" + Date.now().toString(36); };
    const events = [{
      sequence: 1,
      action: "mapping_created",
      actorUid: actor.uid,
      actorRole: actor.role,
      at: at,
      details: { sourceRef: ref, sourceText: originalText }
    }];
    const derived = replay(events);
    return validateActivityMapping(Object.assign({
      schemaVersion: 1,
      id: text(idFactory(), "特殊作業對照編號", 200, true),
      workspaceId: text(source.workspaceId, "工作區識別碼", 200, true),
      farmerUid: farmerUid,
      createdAt: at,
      updatedAt: at,
      events: events
    }, derived));
  }

  function suggestCandidates(item, actor, entries, nowFactory) {
    const current = validateActivityMapping(item);
    return withEvent(current, actor, "candidates_suggested", {
      revision: current.revision,
      candidates: candidates(entries)
    }, nowFactory);
  }

  function markUnmapped(item, actor, reason, nowFactory) {
    const current = validateActivityMapping(item);
    return withEvent(current, actor, "mapping_marked_unmapped", {
      revision: current.revision,
      reason: text(reason, "無法對照原因", 1000, true)
    }, nowFactory);
  }

  function confirmExact(item, actorInput, input, nowFactory) {
    const current = validateActivityMapping(item);
    const actor = actorContext(actorInput);
    reviewerAllowed(actor);
    const source = plainObject(input, "精確對照確認");
    return withEvent(current, actor, "exact_mapping_confirmed", {
      revision: current.revision,
      officialEntry: catalogEntry(source.officialEntry, "正式官方項目"),
      normalizedActivity: text(source.normalizedActivity, "標準化作業描述", 500, true)
    }, nowFactory);
  }

  function confirmOther(item, actorInput, input, nowFactory) {
    const current = validateActivityMapping(item);
    const actor = actorContext(actorInput);
    reviewerAllowed(actor);
    const source = plainObject(input, "其他類別確認");
    if (source.officialEntryIsOther !== true) throw new Error("必須明確確認所選項目是官方其他類別");
    return withEvent(current, actor, "other_mapping_confirmed", {
      revision: current.revision,
      officialEntry: catalogEntry(source.officialEntry, "官方其他類別"),
      officialEntryIsOther: true,
      normalizedActivity: text(source.normalizedActivity, "標準化作業描述", 500, true),
      officialNote: text(source.officialNote, "官方備註草稿", 2000, true)
    }, nowFactory);
  }

  function reviseSource(itemInput, actorInput, input, nowFactory) {
    const current = validateActivityMapping(itemInput);
    const actor = actorContext(actorInput);
    if (actor.role === "farmer" && actor.uid !== current.farmerUid) throw new Error("農友只能修改自己的特殊作業草稿");
    const source = plainObject(input, "來源修訂");
    const ref = sourceRef(source.sourceRef);
    return withEvent(current, actor, "source_revised", {
      revision: current.revision + 1,
      sourceRef: ref,
      sourceText: text(source.sourceText, "原始作業內容", 2000, true)
    }, nowFactory);
  }

  return Object.freeze({
    MAPPING_STATES,
    SOURCE_KINDS,
    OFFICIAL_CATALOG_SOURCE,
    createActivityMapping,
    validateActivityMapping,
    suggestCandidates,
    markUnmapped,
    confirmExact,
    confirmOther,
    reviseSource
  });
});
