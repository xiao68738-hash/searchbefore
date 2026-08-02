(function () {
  "use strict";

  const MAP = window.PQC_TAP_ACTIVITY_MAPPING;
  if (!MAP) throw new Error("特殊作業對照模型載入失敗");

  const DEMO_CATALOG_VERSION = "DEMO-NOT-OFFICIAL";
  const DEMO_CANDIDATES = Object.freeze([
    Object.freeze({ code: "DEMO-100", label: "（示意）設施巡查與維護", catalogVersion: DEMO_CATALOG_VERSION, source: "official_api" }),
    Object.freeze({ code: "DEMO-200", label: "（示意）病蟲害防治", catalogVersion: DEMO_CATALOG_VERSION, source: "official_api" }),
    Object.freeze({ code: "DEMO-OTHER", label: "（示意）其他作業", catalogVersion: DEMO_CATALOG_VERSION, source: "official_api" })
  ]);
  const farmer = Object.freeze({ uid: "demo-farmer", role: "farmer" });
  const reviewer = Object.freeze({ uid: "demo-reviewer", role: "reviewer" });
  const actionLabels = Object.freeze({
    mapping_created: "建立農友原文草稿",
    candidates_suggested: "系統列出候選項目",
    mapping_marked_unmapped: "覆核人員標記暫不對照",
    exact_mapping_confirmed: "覆核人員確認精確對照",
    other_mapping_confirmed: "覆核人員確認其他＋備註",
    source_revised: "農友修改原始內容，舊對照失效"
  });
  const stateLabels = Object.freeze({
    unmapped: "尚未對照",
    suggested: "等待人工確認",
    exact: "已人工確認：精確對照",
    other: "已人工確認：其他＋備註"
  });

  let item = null;
  let clock = Date.now();

  const byId = function (id) { return document.getElementById(id); };
  const sourceText = byId("source-text");
  const createDraft = byId("create-draft");
  const reviseSource = byId("revise-source");
  const resetDemo = byId("reset-demo");
  const reviewCard = byId("review-card");
  const candidateSelect = byId("candidate-select");
  const normalizedText = byId("normalized-text");
  const officialNote = byId("official-note");
  const confirmOther = byId("confirm-other");
  const unmappedReason = byId("unmapped-reason");
  const sourceError = byId("source-error");
  const reviewError = byId("review-error");
  const stateBox = byId("state-box");
  const timeline = byId("timeline");

  function nextNow() {
    clock += 1000;
    return new Date(clock).toISOString();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function selectedCandidate() {
    return DEMO_CANDIDATES.find(function (entry) { return entry.code === candidateSelect.value; }) || null;
  }

  function setError(target, error) {
    target.textContent = error ? String(error.message || error) : "";
  }

  function fillCandidates() {
    candidateSelect.innerHTML = DEMO_CANDIDATES.map(function (entry) {
      return '<option value="' + escapeHtml(entry.code) + '">' + escapeHtml(entry.label) + "｜" + escapeHtml(entry.code) + "</option>";
    }).join("");
  }

  function renderState() {
    if (!item) {
      stateBox.innerHTML = '<div class="state-row"><dt>狀態</dt><dd><span class="status">尚未建立</span></dd></div>' +
        '<div class="state-row"><dt>農友原文</dt><dd>—</dd></div>' +
        '<div class="state-row"><dt>官方項目</dt><dd>—</dd></div>' +
        '<div class="state-row"><dt>整理描述</dt><dd>—</dd></div>' +
        '<div class="state-row"><dt>備註／原因</dt><dd>—</dd></div>';
      return;
    }
    const statusClass = escapeHtml(item.mappingState);
    const official = item.officialEntry ? item.officialEntry.label + "｜" + item.officialEntry.code : "—";
    const note = item.officialNote || item.unmappedReason || "—";
    stateBox.innerHTML = '<div class="state-row"><dt>狀態</dt><dd><span class="status ' + statusClass + '">' + escapeHtml(stateLabels[item.mappingState]) + "</span></dd></div>" +
      '<div class="state-row"><dt>農友原文</dt><dd>' + escapeHtml(item.sourceText) + "</dd></div>" +
      '<div class="state-row"><dt>官方項目</dt><dd>' + escapeHtml(official) + "</dd></div>" +
      '<div class="state-row"><dt>整理描述</dt><dd>' + escapeHtml(item.normalizedActivity || "—") + "</dd></div>" +
      '<div class="state-row"><dt>備註／原因</dt><dd>' + escapeHtml(note) + "</dd></div>";
  }

  function renderTimeline() {
    if (!item || !item.events.length) {
      timeline.innerHTML = '<li class="empty">尚無操作紀錄</li>';
      return;
    }
    timeline.innerHTML = item.events.slice().reverse().map(function (event) {
      const actor = event.actorRole === "farmer" ? "農友" : "覆核人員";
      return "<li><strong>" + escapeHtml(actionLabels[event.action] || event.action) + "</strong><small>" +
        escapeHtml(actor) + "｜第 " + escapeHtml(event.sequence) + " 筆事件</small></li>";
    }).join("");
  }

  function renderProgress() {
    const hasItem = Boolean(item);
    const decided = hasItem && (item.mappingState === MAP.MAPPING_STATES.EXACT || item.mappingState === MAP.MAPPING_STATES.OTHER || (item.mappingState === MAP.MAPPING_STATES.UNMAPPED && item.unmappedReason));
    byId("progress-source").classList.toggle("active", !hasItem);
    byId("progress-review").classList.toggle("active", hasItem && !decided);
    byId("progress-result").classList.toggle("active", Boolean(decided));
  }

  function render() {
    const hasItem = Boolean(item);
    reviewCard.classList.toggle("hidden", !hasItem);
    createDraft.classList.toggle("hidden", hasItem);
    reviseSource.classList.toggle("hidden", !hasItem);
    renderState();
    renderTimeline();
    renderProgress();
  }

  function createItem() {
    setError(sourceError, null);
    try {
      const createdAt = nextNow();
      item = MAP.createActivityMapping({
        id: "demo-activity",
        workspaceId: "demo-workspace",
        farmerUid: farmer.uid,
        sourceRef: { kind: "manual_note", id: "demo-source", updatedAt: createdAt },
        sourceText: sourceText.value,
        createdBy: farmer
      }, { now: function () { return createdAt; }, idFactory: function () { return "demo-activity"; } });
      item = MAP.suggestCandidates(item, reviewer, DEMO_CANDIDATES, nextNow);
      render();
      reviewCard.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setError(sourceError, error);
    }
  }

  function reviseItem() {
    setError(sourceError, null);
    try {
      const updatedAt = nextNow();
      item = MAP.reviseSource(item, farmer, {
        sourceRef: { kind: "manual_note", id: "demo-source", updatedAt: updatedAt },
        sourceText: sourceText.value
      }, function () { return updatedAt; });
      item = MAP.suggestCandidates(item, reviewer, DEMO_CANDIDATES, nextNow);
      render();
    } catch (error) {
      setError(sourceError, error);
    }
  }

  function confirmExactMapping() {
    setError(reviewError, null);
    try {
      const candidate = selectedCandidate();
      if (!candidate || candidate.code === "DEMO-OTHER") throw new Error("精確對照不能選擇其他作業");
      item = MAP.confirmExact(item, reviewer, {
        officialEntry: candidate,
        normalizedActivity: normalizedText.value
      }, nextNow);
      render();
    } catch (error) {
      setError(reviewError, error);
    }
  }

  function confirmOtherMapping() {
    setError(reviewError, null);
    try {
      const candidate = selectedCandidate();
      if (!candidate || candidate.code !== "DEMO-OTHER") throw new Error("請先選擇「（示意）其他作業」");
      item = MAP.confirmOther(item, reviewer, {
        officialEntry: candidate,
        officialEntryIsOther: confirmOther.checked,
        normalizedActivity: normalizedText.value,
        officialNote: officialNote.value
      }, nextNow);
      render();
    } catch (error) {
      setError(reviewError, error);
    }
  }

  function markWithoutMapping() {
    setError(reviewError, null);
    try {
      item = MAP.markUnmapped(item, reviewer, unmappedReason.value, nextNow);
      render();
    } catch (error) {
      setError(reviewError, error);
    }
  }

  function reset() {
    item = null;
    sourceText.value = "";
    normalizedText.value = "";
    officialNote.value = "";
    unmappedReason.value = "";
    confirmOther.checked = false;
    candidateSelect.selectedIndex = 0;
    setError(sourceError, null);
    setError(reviewError, null);
    render();
  }

  document.querySelectorAll("[data-example]").forEach(function (button) {
    button.addEventListener("click", function () { sourceText.value = button.getAttribute("data-example") || ""; });
  });
  createDraft.addEventListener("click", createItem);
  reviseSource.addEventListener("click", reviseItem);
  resetDemo.addEventListener("click", reset);
  byId("confirm-exact").addEventListener("click", confirmExactMapping);
  byId("confirm-other-button").addEventListener("click", confirmOtherMapping);
  byId("mark-unmapped").addEventListener("click", markWithoutMapping);

  fillCandidates();
  render();
})();
