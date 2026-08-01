/* 產銷履歷協作流程的內部狀態模型。
 *
 * 這個模組目前只供開發與測試，不會載入正式網站，也不會連接 L3。
 * 「manual_entry_claim_recorded_unverified」只代表資訊服務專員自行註記
 * 已完成人工登打；噴前查尚未向官方系統查證，不得顯示為已上傳或已受理。
 *
 * 重要：actor 只代表「已由可信任後端驗證過」的操作情境。不得直接接受
 * 瀏覽器傳來的 actor.role/capabilities 作為授權依據。正式啟用前必須由後端
 * 依 Firebase UID、工作區成員資格、指派關係與能力重新授權。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_TAP_WORKFLOW = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REVIEW_STATES = Object.freeze({
    DRAFT: "draft",
    AWAITING_REVIEW: "awaiting_review",
    NEEDS_CHANGES: "needs_changes",
    INTERNAL_REVIEW_COMPLETE: "internal_review_complete",
    CANCELLED: "cancelled"
  });

  const L3_INTERACTION_STATES = Object.freeze({
    NOT_CONNECTED: "not_connected",
    MANUAL_ENTRY_CLAIM_PENDING: "manual_entry_claim_pending",
    MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED: "manual_entry_claim_recorded_unverified"
  });

  const KINDS = Object.freeze([
    "pesticide",
    "cultivation",
    "fertilizer",
    "harvest",
    "postharvest",
    "materialPurchase"
  ]);

  const SOURCE_COLLECTIONS = Object.freeze(["records", "farmRecords"]);
  const COLLECTION_BY_KIND = Object.freeze({
    pesticide: "records",
    cultivation: "farmRecords",
    fertilizer: "farmRecords",
    harvest: "farmRecords",
    postharvest: "farmRecords",
    materialPurchase: "farmRecords"
  });
  const ACTOR_ROLES = Object.freeze(["farmer", "reviewer", "manager"]);
  const ACTOR_CAPABILITIES = Object.freeze(["attest_manual_entry"]);
  const EVENT_ACTIONS = Object.freeze([
    "draft_created",
    "review_requested",
    "changes_requested",
    "draft_revised",
    "internal_review_completed",
    "manual_entry_claim_recorded",
    "review_cancelled"
  ]);
  const MANUAL_ENTRY_CLAIM_NOTICE = "專員已標記完成登打，噴前查尚未向官方系統查證";

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function required(value, label) {
    const output = text(value);
    if (!output) throw new Error("請提供" + label);
    return output;
  }

  function iso(value, label) {
    const output = required(value, label);
    const parsed = new Date(output);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== output) {
      throw new Error(label + "必須是 ISO 時間");
    }
    return output;
  }

  function dateText(value, label) {
    const output = required(value, label);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(output)) throw new Error(label + "格式不正確");
    const parsed = new Date(output + "T00:00:00.000Z");
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== output) {
      throw new Error(label + "格式不正確");
    }
    return output;
  }

  function positiveInteger(value, label) {
    if (!Number.isInteger(value) || value < 1) throw new Error(label + "必須是正整數");
    return value;
  }

  function plainObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(label + "格式不正確");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(label + "只能使用一般物件");
    }
    return value;
  }

  function validateJsonValue(value, label, depth, budget) {
    budget.nodes += 1;
    if (budget.nodes > 10000) throw new Error(label + "節點過多");
    if (depth > 30) throw new Error(label + "巢狀層級過深");
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "string") {
      if (value.length > 20000) throw new Error(label + "文字過長");
      return;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(label + "包含無效數值");
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 2000) throw new Error(label + "陣列過長");
      value.forEach(function (entry) { validateJsonValue(entry, label, depth + 1, budget); });
      return;
    }
    plainObject(value, label);
    const keys = Object.keys(value);
    if (keys.length > 500) throw new Error(label + "欄位過多");
    keys.forEach(function (key) {
      if (["__proto__", "prototype", "constructor"].indexOf(key) >= 0) {
        throw new Error(label + "包含不允許的欄位");
      }
      validateJsonValue(value[key], label, depth + 1, budget);
    });
  }

  function safeClone(value, label) {
    validateJsonValue(value, label, 0, { nodes: 0 });
    let encoded;
    try {
      encoded = JSON.stringify(value);
    } catch (_) {
      throw new Error(label + "無法序列化");
    }
    if (!encoded || encoded.length > 200000) throw new Error(label + "過大或為空");
    return JSON.parse(encoded);
  }

  // 用來發現版本錯置與意外竄改；不是密碼學簽章，也不能取代後端授權。
  function canonicalJson(value) {
    if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + canonicalJson(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function snapshotFingerprint(value) {
    const encoded = canonicalJson(value);
    let hash = 2166136261;
    for (let index = 0; index < encoded.length; index += 1) {
      hash ^= encoded.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return "fnv1a32:" + (hash >>> 0).toString(16).padStart(8, "0") + ":" + encoded.length;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function nowIso(nowFactory) {
    const value = typeof nowFactory === "function" ? nowFactory() : new Date().toISOString();
    return iso(value, "事件時間");
  }

  function actorContext(actor) {
    const source = plainObject(actor, "操作人");
    const role = required(source.role, "操作人角色");
    if (ACTOR_ROLES.indexOf(role) < 0) throw new Error("操作人角色不受支援");
    const capabilities = Array.isArray(source.capabilities)
      ? source.capabilities.map(function (entry) { return required(entry, "操作能力"); })
      : [];
    capabilities.forEach(function (capability) {
      if (ACTOR_CAPABILITIES.indexOf(capability) < 0) throw new Error("操作能力不受支援");
    });
    return Object.freeze({
      uid: required(source.uid, "操作人識別碼"),
      role: role,
      capabilities: Object.freeze(Array.from(new Set(capabilities)))
    });
  }

  function validateSnapshot(kind, value) {
    const snapshot = safeClone(value, "紀錄快照");
    const record = plainObject(snapshot.record, "紀錄快照的紀錄");
    dateText(record.date, "紀錄日期");
    if (kind === "pesticide") {
      required(record.agent, "藥劑名稱");
      const plot = snapshot.plot && typeof snapshot.plot === "object" ? snapshot.plot : {};
      required(record.crop || plot.crop, "作物名稱");
    } else {
      if (record.type !== kind) throw new Error("農務紀錄類型與協作類型不一致");
      required(record.plotId, "田區／種植批次");
      plainObject(record.details, "農務紀錄內容");
      if (!Object.keys(record.details).length) throw new Error("農務紀錄內容不可為空");
    }
    return snapshot;
  }

  function validateSourceRef(kind, value) {
    const source = plainObject(value, "來源參照");
    const collection = required(source.collection, "來源集合");
    if (SOURCE_COLLECTIONS.indexOf(collection) < 0) throw new Error("來源集合不受支援");
    if (COLLECTION_BY_KIND[kind] !== collection) throw new Error("紀錄類型與來源集合不一致");
    return {
      collection: collection,
      id: required(source.id, "來源紀錄編號"),
      updatedAt: iso(source.updatedAt, "來源更新時間")
    };
  }

  function validateClaim(value, index) {
    const source = plainObject(value, "人工登打聲明");
    const notice = required(source.notice, "人工登打聲明提示");
    if (notice !== MANUAL_ENTRY_CLAIM_NOTICE) throw new Error("人工登打聲明提示不正確");
    return {
      sequence: positiveInteger(source.sequence, "人工登打聲明序號"),
      revision: positiveInteger(source.revision, "人工登打聲明版本"),
      sourceUpdatedAt: iso(source.sourceUpdatedAt, "聲明來源時間"),
      snapshotFingerprint: required(source.snapshotFingerprint, "聲明快照指紋"),
      entryReference: required(source.entryReference, "人工登打參照"),
      note: text(source.note),
      claimedBy: required(source.claimedBy, "聲明人識別碼"),
      claimedAt: iso(source.claimedAt, "聲明時間"),
      notice: notice,
      expectedIndex: index
    };
  }

  function validateEvent(value, index) {
    const source = plainObject(value, "事件");
    const sequence = positiveInteger(source.sequence, "事件序號");
    if (sequence !== index + 1) throw new Error("事件序號不連續");
    const role = required(source.actorRole, "事件角色");
    if (ACTOR_ROLES.indexOf(role) < 0) throw new Error("事件角色不受支援");
    const action = required(source.action, "事件動作");
    if (EVENT_ACTIONS.indexOf(action) < 0) throw new Error("事件動作不受支援");
    return {
      sequence: sequence,
      action: action,
      actorUid: required(source.actorUid, "事件操作人"),
      actorRole: role,
      at: iso(source.at, "事件時間"),
      details: safeClone(source.details || {}, "事件內容")
    };
  }

  function replayEvents(events, claims) {
    let revision = 1;
    let reviewedRevision = null;
    let reviewState = REVIEW_STATES.DRAFT;
    let interactionState = L3_INTERACTION_STATES.NOT_CONNECTED;
    let externalFollowupRequired = false;
    let sourceUpdatedAt = "";
    let currentSnapshotFingerprint = "";
    let claimIndex = 0;

    events.forEach(function (event, index) {
      const details = event.details;
      if (index === 0) {
        if (event.action !== "draft_created") throw new Error("第一個事件必須是建立草稿");
        if (positiveInteger(details.revision, "建立事件版本") !== 1) throw new Error("建立事件版本不正確");
        sourceUpdatedAt = iso(details.sourceUpdatedAt, "建立事件來源時間");
        currentSnapshotFingerprint = required(details.snapshotFingerprint, "建立事件快照指紋");
        return;
      }
      if (event.action === "draft_created") throw new Error("建立草稿事件只能出現一次");
      if (reviewState === REVIEW_STATES.CANCELLED) throw new Error("取消後不可再追加流程事件");

      if (event.action === "review_requested") {
        if ([REVIEW_STATES.DRAFT, REVIEW_STATES.NEEDS_CHANGES].indexOf(reviewState) < 0) throw new Error("送審事件順序不正確");
        if (positiveInteger(details.revision, "送審事件版本") !== revision) throw new Error("送審事件版本不正確");
        reviewState = REVIEW_STATES.AWAITING_REVIEW;
        return;
      }
      if (event.action === "changes_requested") {
        if (reviewState !== REVIEW_STATES.AWAITING_REVIEW) throw new Error("要求修正事件順序不正確");
        if (!Array.isArray(details.reasons) || !details.reasons.length) throw new Error("要求修正事件缺少原因");
        reviewState = REVIEW_STATES.NEEDS_CHANGES;
        reviewedRevision = null;
        interactionState = claimIndex
          ? L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED
          : L3_INTERACTION_STATES.NOT_CONNECTED;
        externalFollowupRequired = claimIndex > 0;
        return;
      }
      if (event.action === "draft_revised") {
        if (positiveInteger(details.revision, "修訂事件版本") !== revision + 1) throw new Error("修訂事件版本不連續");
        revision += 1;
        sourceUpdatedAt = iso(details.sourceUpdatedAt, "修訂事件來源時間");
        currentSnapshotFingerprint = required(details.snapshotFingerprint, "修訂事件快照指紋");
        reviewState = REVIEW_STATES.DRAFT;
        reviewedRevision = null;
        interactionState = claimIndex
          ? L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED
          : L3_INTERACTION_STATES.NOT_CONNECTED;
        externalFollowupRequired = claimIndex > 0;
        return;
      }
      if (event.action === "internal_review_completed") {
        if (reviewState !== REVIEW_STATES.AWAITING_REVIEW) throw new Error("內部覆核事件順序不正確");
        if (positiveInteger(details.revision, "內部覆核事件版本") !== revision) throw new Error("內部覆核事件版本不正確");
        if (event.actorRole !== "reviewer" && event.actorRole !== "manager") throw new Error("內部覆核事件角色不正確");
        reviewState = REVIEW_STATES.INTERNAL_REVIEW_COMPLETE;
        reviewedRevision = revision;
        interactionState = L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_PENDING;
        externalFollowupRequired = claimIndex > 0;
        return;
      }
      if (event.action === "manual_entry_claim_recorded") {
        if (reviewState !== REVIEW_STATES.INTERNAL_REVIEW_COMPLETE || interactionState !== L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_PENDING) {
          throw new Error("人工登打聲明事件順序不正確");
        }
        if (event.actorRole !== "reviewer" && event.actorRole !== "manager") throw new Error("人工登打聲明事件角色不正確");
        const claim = claims[claimIndex];
        if (!claim) throw new Error("人工登打聲明事件缺少對應聲明");
        if (positiveInteger(details.revision, "人工登打聲明事件版本") !== revision ||
          claim.revision !== revision || claim.entryReference !== details.entryReference ||
          claim.claimedBy !== event.actorUid || claim.claimedAt !== event.at ||
          claim.sourceUpdatedAt !== sourceUpdatedAt || claim.snapshotFingerprint !== currentSnapshotFingerprint) {
          throw new Error("人工登打聲明與事件歷程不一致");
        }
        claimIndex += 1;
        interactionState = L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED;
        externalFollowupRequired = false;
        return;
      }
      if (event.action === "review_cancelled") {
        required(details.reason, "取消事件原因");
        reviewState = REVIEW_STATES.CANCELLED;
        reviewedRevision = null;
        interactionState = claimIndex
          ? L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED
          : L3_INTERACTION_STATES.NOT_CONNECTED;
        externalFollowupRequired = claimIndex > 0;
        return;
      }
      throw new Error("事件動作不受支援");
    });

    if (claimIndex !== claims.length) throw new Error("人工登打聲明缺少對應事件");
    return {
      revision: revision,
      reviewedRevision: reviewedRevision,
      reviewState: reviewState,
      l3InteractionState: interactionState,
      externalFollowupRequired: externalFollowupRequired,
      sourceUpdatedAt: sourceUpdatedAt,
      snapshotFingerprint: currentSnapshotFingerprint
    };
  }

  function validateReviewItem(value) {
    const source = plainObject(value, "協作資料");
    if (source.schemaVersion !== 1) throw new Error("協作資料版本不受支援");
    const kind = required(source.kind, "紀錄類型");
    if (KINDS.indexOf(kind) < 0) throw new Error("不支援的紀錄類型");
    const revision = positiveInteger(source.revision, "資料版本");
    const reviewedRevision = source.reviewedRevision == null
      ? null
      : positiveInteger(source.reviewedRevision, "已覆核版本");
    if (reviewedRevision != null && reviewedRevision > revision) throw new Error("已覆核版本不可大於資料版本");
    const reviewState = required(source.reviewState, "內部覆核狀態");
    if (Object.values(REVIEW_STATES).indexOf(reviewState) < 0) throw new Error("內部覆核狀態不受支援");
    const interactionState = required(source.l3InteractionState, "L3 互動狀態");
    if (Object.values(L3_INTERACTION_STATES).indexOf(interactionState) < 0) throw new Error("L3 互動狀態不受支援");
    const claimsSource = Array.isArray(source.externalEntryClaims) ? source.externalEntryClaims : [];
    if (claimsSource.length > 100) throw new Error("人工登打聲明過多");
    const claims = claimsSource.map(validateClaim).map(function (claim, index) {
      if (claim.sequence !== index + 1) throw new Error("人工登打聲明序號不連續");
      delete claim.expectedIndex;
      if (claim.revision > revision) throw new Error("人工登打聲明版本不可大於資料版本");
      return claim;
    });
    const eventsSource = Array.isArray(source.events) ? source.events : [];
    if (eventsSource.length > 1000) throw new Error("事件數量過多");
    const events = eventsSource.map(validateEvent);
    if (!events.length) throw new Error("協作資料缺少建立事件");
    events.forEach(function (event, index) {
      if (index > 0 && new Date(event.at).getTime() < new Date(events[index - 1].at).getTime()) {
        throw new Error("事件時間順序不正確");
      }
    });
    const createdAt = iso(source.createdAt, "建立時間");
    const updatedAt = iso(source.updatedAt, "更新時間");
    if (new Date(updatedAt).getTime() < new Date(createdAt).getTime()) throw new Error("更新時間不可早於建立時間");
    if (events[0].at !== createdAt || events[events.length - 1].at !== updatedAt) {
      throw new Error("事件時間與協作資料時間不一致");
    }
    const sourceRef = validateSourceRef(kind, source.sourceRef);
    const snapshot = validateSnapshot(kind, source.snapshot);
    const fingerprint = snapshotFingerprint(snapshot);
    if (required(source.snapshotFingerprint, "資料快照指紋") !== fingerprint) throw new Error("資料快照指紋不一致");
    const currentRevisionClaimed = claims.some(function (claim) { return claim.revision === revision; });
    const expectedFollowup = claims.length > 0 && (!currentRevisionClaimed || reviewState === REVIEW_STATES.CANCELLED);
    const externalFollowupRequired = source.externalFollowupRequired === true;
    if (externalFollowupRequired !== expectedFollowup) throw new Error("外部後續處理狀態不一致");
    if (reviewState === REVIEW_STATES.INTERNAL_REVIEW_COMPLETE) {
      if (reviewedRevision !== revision) throw new Error("內部覆核完成時必須綁定目前版本");
    } else if (reviewedRevision != null) {
      throw new Error("目前狀態不可保留已覆核版本");
    }
    if (interactionState === L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_PENDING && reviewState !== REVIEW_STATES.INTERNAL_REVIEW_COMPLETE) {
      throw new Error("只有內部覆核完成的資料可等待人工登打");
    }
    if (interactionState === L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED && !claims.length) {
      throw new Error("缺少人工登打聲明");
    }
    if (interactionState === L3_INTERACTION_STATES.NOT_CONNECTED && claims.length) {
      throw new Error("已有人工登打聲明時不可標為未連接");
    }
    if (currentRevisionClaimed && interactionState !== L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED) {
      throw new Error("目前版本已有人工登打聲明但狀態不一致");
    }
    const replayed = replayEvents(events, claims);
    if (replayed.revision !== revision || replayed.reviewedRevision !== reviewedRevision ||
      replayed.reviewState !== reviewState || replayed.l3InteractionState !== interactionState ||
      replayed.externalFollowupRequired !== externalFollowupRequired ||
      replayed.sourceUpdatedAt !== sourceRef.updatedAt || replayed.snapshotFingerprint !== fingerprint) {
      throw new Error("目前狀態與事件歷程不一致");
    }
    const output = {
      schemaVersion: 1,
      id: required(source.id, "協作資料編號"),
      workspaceId: required(source.workspaceId, "工作區識別碼"),
      batchId: text(source.batchId),
      kind: kind,
      farmerUid: required(source.farmerUid, "農友識別碼"),
      sourceRef: sourceRef,
      snapshot: snapshot,
      snapshotFingerprint: fingerprint,
      revision: revision,
      reviewedRevision: reviewedRevision,
      reviewState: reviewState,
      l3InteractionState: interactionState,
      externalFollowupRequired: externalFollowupRequired,
      assignedReviewerUid: text(source.assignedReviewerUid),
      externalEntryClaims: claims,
      createdAt: createdAt,
      updatedAt: updatedAt,
      events: events
    };
    return deepFreeze(output);
  }

  function reviewerAllowed(item, actor) {
    if (actor.role !== "reviewer" && actor.role !== "manager") throw new Error("此動作必須由審核者執行");
    if (item.assignedReviewerUid && item.assignedReviewerUid !== actor.uid && actor.role !== "manager") {
      throw new Error("這筆資料已指派給其他審核者");
    }
  }

  function ownerOrReviewerAllowed(item, actor) {
    if (actor.role === "farmer") {
      if (actor.uid !== item.farmerUid) throw new Error("這筆資料不屬於目前農友");
      return;
    }
    reviewerAllowed(item, actor);
  }

  function addEvent(item, action, actor, at, details) {
    const events = item.events.slice();
    events.push({
      sequence: events.length + 1,
      action: action,
      actorUid: actor.uid,
      actorRole: actor.role,
      at: at,
      details: safeClone(details || {}, "事件內容")
    });
    return events;
  }

  function nextItem(itemInput, patch, action, actor, nowFactory, details) {
    const item = validateReviewItem(itemInput);
    const at = nowIso(nowFactory);
    const output = Object.assign({}, item, patch, { updatedAt: at });
    output.events = addEvent(item, action, actor, at, details);
    return validateReviewItem(output);
  }

  function createReviewItem(input, options) {
    const source = plainObject(input, "協作資料");
    const config = options || {};
    const kind = required(source.kind, "紀錄類型");
    if (KINDS.indexOf(kind) < 0) throw new Error("不支援的紀錄類型");
    const creator = actorContext(source.createdBy);
    const farmerUid = required(source.farmerUid, "農友識別碼");
    let assignedReviewerUid = text(source.assignedReviewerUid);
    if (creator.role === "farmer" && creator.uid !== farmerUid) throw new Error("農友只能建立自己的協作資料");
    if (creator.role === "reviewer") {
      if (assignedReviewerUid && assignedReviewerUid !== creator.uid) throw new Error("審核者不能替其他審核者建立指派");
      assignedReviewerUid = creator.uid;
    }
    const createdAt = nowIso(config.now);
    const makeId = typeof config.idFactory === "function"
      ? config.idFactory
      : function () { return "tap-review-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); };
    const sourceRef = validateSourceRef(kind, source.sourceRef);
    const snapshot = validateSnapshot(kind, source.snapshot);
    const fingerprint = snapshotFingerprint(snapshot);
    const item = {
      schemaVersion: 1,
      id: required(makeId("tap-review"), "協作資料編號"),
      workspaceId: required(source.workspaceId, "工作區識別碼"),
      batchId: text(source.batchId),
      kind: kind,
      farmerUid: farmerUid,
      sourceRef: sourceRef,
      snapshot: snapshot,
      snapshotFingerprint: fingerprint,
      revision: 1,
      reviewedRevision: null,
      reviewState: REVIEW_STATES.DRAFT,
      l3InteractionState: L3_INTERACTION_STATES.NOT_CONNECTED,
      externalFollowupRequired: false,
      assignedReviewerUid: assignedReviewerUid,
      externalEntryClaims: [],
      createdAt: createdAt,
      updatedAt: createdAt,
      events: []
    };
    item.events = addEvent(item, "draft_created", creator, createdAt, {
      revision: 1,
      sourceUpdatedAt: sourceRef.updatedAt,
      snapshotFingerprint: fingerprint
    });
    return validateReviewItem(item);
  }

  function submitForReview(itemInput, actorInput, nowFactory) {
    const item = validateReviewItem(itemInput);
    const actor = actorContext(actorInput);
    if ([REVIEW_STATES.DRAFT, REVIEW_STATES.NEEDS_CHANGES].indexOf(item.reviewState) < 0) {
      throw new Error("目前狀態不能送交審核");
    }
    ownerOrReviewerAllowed(item, actor);
    return nextItem(item, { reviewState: REVIEW_STATES.AWAITING_REVIEW }, "review_requested", actor, nowFactory, { revision: item.revision });
  }

  function requestChanges(itemInput, actorInput, reasons, nowFactory) {
    const item = validateReviewItem(itemInput);
    const actor = actorContext(actorInput);
    reviewerAllowed(item, actor);
    if (item.reviewState !== REVIEW_STATES.AWAITING_REVIEW) throw new Error("只有待審資料可以要求修正");
    const normalized = (Array.isArray(reasons) ? reasons : []).map(function (reason) { return text(reason); }).filter(Boolean);
    if (!normalized.length) throw new Error("請提供需要修正的原因");
    return nextItem(item, {
      reviewState: REVIEW_STATES.NEEDS_CHANGES,
      reviewedRevision: null,
      l3InteractionState: item.externalEntryClaims.length
        ? L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED
        : L3_INTERACTION_STATES.NOT_CONNECTED,
      externalFollowupRequired: item.externalEntryClaims.length > 0
    }, "changes_requested", actor, nowFactory, { reasons: normalized });
  }

  function reviseSnapshot(itemInput, input, actorInput, nowFactory) {
    const item = validateReviewItem(itemInput);
    const actor = actorContext(actorInput);
    if (item.reviewState === REVIEW_STATES.CANCELLED) throw new Error("已取消資料不能修改");
    ownerOrReviewerAllowed(item, actor);
    const source = plainObject(input, "修訂資料");
    const sourceRef = validateSourceRef(item.kind, source.sourceRef);
    if (sourceRef.collection !== item.sourceRef.collection || sourceRef.id !== item.sourceRef.id) {
      throw new Error("修訂資料不可更換來源紀錄");
    }
    if (new Date(sourceRef.updatedAt).getTime() <= new Date(item.sourceRef.updatedAt).getTime()) {
      throw new Error("來源更新時間必須晚於目前版本");
    }
    const revision = item.revision + 1;
    const snapshot = validateSnapshot(item.kind, source.snapshot);
    const fingerprint = snapshotFingerprint(snapshot);
    const hasClaims = item.externalEntryClaims.length > 0;
    return nextItem(item, {
      sourceRef: sourceRef,
      snapshot: snapshot,
      snapshotFingerprint: fingerprint,
      revision: revision,
      reviewedRevision: null,
      reviewState: REVIEW_STATES.DRAFT,
      l3InteractionState: hasClaims
        ? L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED
        : L3_INTERACTION_STATES.NOT_CONNECTED,
      externalFollowupRequired: hasClaims
    }, "draft_revised", actor, nowFactory, {
      revision: revision,
      sourceUpdatedAt: sourceRef.updatedAt,
      snapshotFingerprint: fingerprint,
      externalFollowupRequired: hasClaims
    });
  }

  function completeInternalReview(itemInput, actorInput, nowFactory) {
    const item = validateReviewItem(itemInput);
    const actor = actorContext(actorInput);
    reviewerAllowed(item, actor);
    if (item.reviewState !== REVIEW_STATES.AWAITING_REVIEW) throw new Error("只有待審資料可以完成內部覆核");
    return nextItem(item, {
      reviewState: REVIEW_STATES.INTERNAL_REVIEW_COMPLETE,
      reviewedRevision: item.revision,
      l3InteractionState: L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_PENDING,
      externalFollowupRequired: item.externalEntryClaims.length > 0
    }, "internal_review_completed", actor, nowFactory, { revision: item.revision });
  }

  function recordManualEntryClaim(itemInput, actorInput, input, nowFactory) {
    const item = validateReviewItem(itemInput);
    const actor = actorContext(actorInput);
    reviewerAllowed(item, actor);
    if (actor.capabilities.indexOf("attest_manual_entry") < 0) throw new Error("操作人沒有人工登打聲明權限");
    if (item.reviewState !== REVIEW_STATES.INTERNAL_REVIEW_COMPLETE || item.reviewedRevision !== item.revision) {
      throw new Error("只有目前版本已完成內部覆核後才能記錄人工登打聲明");
    }
    if (item.l3InteractionState !== L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_PENDING) {
      throw new Error("目前狀態不能記錄人工登打聲明");
    }
    const source = plainObject(input, "人工登打聲明");
    const at = nowIso(nowFactory);
    const claims = item.externalEntryClaims.slice();
    const claim = {
      sequence: claims.length + 1,
      revision: item.revision,
      sourceUpdatedAt: item.sourceRef.updatedAt,
      snapshotFingerprint: item.snapshotFingerprint,
      entryReference: required(source.entryReference, "人工登打參照"),
      note: text(source.note),
      claimedBy: actor.uid,
      claimedAt: at,
      notice: MANUAL_ENTRY_CLAIM_NOTICE
    };
    claims.push(claim);
    const output = Object.assign({}, item, {
      l3InteractionState: L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED,
      externalFollowupRequired: false,
      externalEntryClaims: claims,
      updatedAt: at
    });
    output.events = addEvent(item, "manual_entry_claim_recorded", actor, at, {
      revision: claim.revision,
      entryReference: claim.entryReference
    });
    return validateReviewItem(output);
  }

  function cancelReview(itemInput, actorInput, reason, nowFactory) {
    const item = validateReviewItem(itemInput);
    const actor = actorContext(actorInput);
    if (item.reviewState === REVIEW_STATES.CANCELLED) throw new Error("這筆資料已取消");
    ownerOrReviewerAllowed(item, actor);
    const hasClaims = item.externalEntryClaims.length > 0;
    return nextItem(item, {
      reviewState: REVIEW_STATES.CANCELLED,
      reviewedRevision: null,
      l3InteractionState: hasClaims
        ? L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED
        : L3_INTERACTION_STATES.NOT_CONNECTED,
      externalFollowupRequired: hasClaims
    }, "review_cancelled", actor, nowFactory, {
      reason: required(reason, "取消原因"),
      externalFollowupRequired: hasClaims
    });
  }

  return Object.freeze({
    REVIEW_STATES,
    L3_INTERACTION_STATES,
    KINDS,
    SOURCE_COLLECTIONS,
    COLLECTION_BY_KIND,
    MANUAL_ENTRY_CLAIM_NOTICE,
    validateReviewItem,
    createReviewItem,
    submitForReview,
    requestChanges,
    reviseSnapshot,
    completeInternalReview,
    recordManualEntryClaim,
    cancelReview
  });
});
