(function () {
  "use strict";

  const TAP = window.PQC_TAP_WORKFLOW;
  if (!TAP) throw new Error("專員協作狀態模型載入失敗");

  const farmer = Object.freeze({ uid: "demo-farmer", role: "farmer" });
  const reviewer = Object.freeze({ uid: "demo-reviewer", role: "reviewer", capabilities: ["attest_manual_entry"] });
  const reviewLabels = Object.freeze({
    draft: "草稿",
    awaiting_review: "等待專員覆核",
    needs_changes: "等待農友補充",
    internal_review_complete: "內部覆核完成",
    cancelled: "已取消"
  });
  const interactionLabels = Object.freeze({
    not_connected: "尚未連接",
    manual_entry_claim_pending: "等待人工登打",
    manual_entry_claim_recorded_unverified: "專員已提出登打聲明（未查證）"
  });
  const eventLabels = Object.freeze({
    draft_created: "建立未確認草稿",
    review_requested: "送交內部覆核",
    changes_requested: "專員退回補充",
    draft_revised: "農友修訂草稿",
    internal_review_completed: "專員完成內部覆核",
    manual_entry_claim_recorded: "專員記錄人工登打聲明",
    review_cancelled: "取消覆核"
  });

  let tick = 0;
  let sourceHour = 0;
  let item = null;

  const byId = function (id) { return document.getElementById(id); };
  const sections = {
    draft: byId("draft-actions"),
    review: byId("review-actions"),
    revision: byId("revision-actions"),
    claim: byId("claim-actions"),
    claimComplete: byId("claim-complete")
  };
  const actionTitle = byId("action-title");
  const actionError = byId("action-error");

  function now() {
    tick += 1;
    return new Date(Date.UTC(2026, 7, 2, 0, 0, tick)).toISOString();
  }

  function nextSourceTime() {
    sourceHour += 1;
    return new Date(Date.UTC(2026, 7, 1, sourceHour, 0, 0)).toISOString();
  }

  function createDemo() {
    tick = 0;
    sourceHour = 0;
    item = TAP.createReviewItem({
      workspaceId: "demo-workspace",
      batchId: "demo-batch",
      kind: "pesticide",
      farmerUid: farmer.uid,
      assignedReviewerUid: reviewer.uid,
      createdBy: farmer,
      sourceRef: { collection: "records", id: "demo-record", updatedAt: "2026-08-01T00:00:00.000Z" },
      snapshot: {
        plot: { id: "demo-plot", crop: "番茄" },
        record: { id: "demo-record", date: "2026-08-01", crop: "番茄", agent: "示範藥劑", target: "葉蟎" }
      }
    }, { idFactory: function () { return "demo-review"; }, now: now });
    byId("change-reason").value = "";
    byId("revised-area").value = "0.2 公頃";
    byId("entry-reference").value = "";
    byId("entry-note").value = "";
    setError(null);
    render();
  }

  function setError(error) {
    actionError.textContent = error ? String(error.message || error) : "";
  }

  function hideActions() {
    Object.keys(sections).forEach(function (key) { sections[key].classList.add("hidden"); });
  }

  function renderActions() {
    hideActions();
    if (item.reviewState === TAP.REVIEW_STATES.DRAFT) {
      actionTitle.textContent = "農友確認後送交專員";
      sections.draft.classList.remove("hidden");
      return;
    }
    if (item.reviewState === TAP.REVIEW_STATES.AWAITING_REVIEW) {
      actionTitle.textContent = "專員檢查欄位是否完整";
      sections.review.classList.remove("hidden");
      return;
    }
    if (item.reviewState === TAP.REVIEW_STATES.NEEDS_CHANGES) {
      actionTitle.textContent = "農友補充缺漏內容";
      sections.revision.classList.remove("hidden");
      return;
    }
    if (item.l3InteractionState === TAP.L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_PENDING) {
      actionTitle.textContent = "專員回到官方系統人工登打";
      sections.claim.classList.remove("hidden");
      return;
    }
    if (item.l3InteractionState === TAP.L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED) {
      actionTitle.textContent = "本輪測試流程完成";
      sections.claimComplete.textContent = TAP.MANUAL_ENTRY_CLAIM_NOTICE;
      sections.claimComplete.classList.remove("hidden");
    }
  }

  function progressIndex() {
    if (item.l3InteractionState === TAP.L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED) return 4;
    if (item.reviewState === TAP.REVIEW_STATES.INTERNAL_REVIEW_COMPLETE) return 3;
    if (item.reviewState === TAP.REVIEW_STATES.AWAITING_REVIEW || item.reviewState === TAP.REVIEW_STATES.NEEDS_CHANGES) return 2;
    return 1;
  }

  function renderProgress() {
    const current = progressIndex();
    ["draft", "review", "complete", "claim"].forEach(function (name, index) {
      byId("step-" + name).classList.toggle("active", index + 1 === current);
    });
  }

  function renderState() {
    byId("state-revision").textContent = String(item.revision);
    byId("state-review").textContent = reviewLabels[item.reviewState] || item.reviewState;
    byId("state-l3").textContent = interactionLabels[item.l3InteractionState] || item.l3InteractionState;
    byId("state-followup").textContent = item.externalFollowupRequired ? "需要處理舊版外部紀錄" : "不需要";
    byId("record-area").textContent = item.snapshot.record.area || "尚未填寫";
    byId("safety-notice").textContent = item.l3InteractionState === TAP.L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED
      ? TAP.MANUAL_ENTRY_CLAIM_NOTICE
      : "這筆資料尚未送往任何政府系統。";
  }

  function renderTimeline() {
    byId("timeline").innerHTML = item.events.slice().reverse().map(function (event) {
      const details = event.action === "changes_requested" && event.details.reasons
        ? "｜" + event.details.reasons.join("、")
        : "";
      return "<li><strong>" + (eventLabels[event.action] || event.action) + "</strong><small>" +
        event.actorRole + "｜第 " + event.sequence + " 筆事件" + details + "</small></li>";
    }).join("");
  }

  function render() {
    renderActions();
    renderProgress();
    renderState();
    renderTimeline();
  }

  function act(callback) {
    setError(null);
    try {
      callback();
      render();
    } catch (error) {
      setError(error);
    }
  }

  byId("submit-review").addEventListener("click", function () {
    act(function () { item = TAP.submitForReview(item, farmer, now); });
  });

  byId("request-changes").addEventListener("click", function () {
    act(function () { item = TAP.requestChanges(item, reviewer, [byId("change-reason").value], now); });
  });

  byId("revise-submit").addEventListener("click", function () {
    act(function () {
      const snapshot = JSON.parse(JSON.stringify(item.snapshot));
      snapshot.record.area = byId("revised-area").value;
      item = TAP.reviseSnapshot(item, {
        sourceRef: { collection: item.sourceRef.collection, id: item.sourceRef.id, updatedAt: nextSourceTime() },
        snapshot: snapshot
      }, farmer, now);
      item = TAP.submitForReview(item, farmer, now);
    });
  });

  byId("complete-review").addEventListener("click", function () {
    act(function () { item = TAP.completeInternalReview(item, reviewer, now); });
  });

  byId("record-claim").addEventListener("click", function () {
    act(function () {
      item = TAP.recordManualEntryClaim(item, reviewer, {
        entryReference: byId("entry-reference").value,
        note: byId("entry-note").value
      }, now);
    });
  });

  byId("reset-demo").addEventListener("click", createDemo);
  createDemo();
})();
