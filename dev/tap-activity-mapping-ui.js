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
  const DEMO_SOURCE_TEXTS = Object.freeze([
    "捕捉飛入溫室內的蝙蝠",
    "巡查並修補溫室破損的防鳥網",
    "清理排水溝並移除動物卵塊"
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

  let items = [];
  let selectedId = null;
  let activeFilter = "all";
  let sequence = 0;
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
  const queueList = byId("queue-list");

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

  function currentItem() {
    return items.find(function (entry) { return entry.id === selectedId; }) || null;
  }

  function replaceCurrent(nextItem) {
    items = items.map(function (entry) { return entry.id === nextItem.id ? nextItem : entry; });
  }

  function selectedCandidate() {
    return DEMO_CANDIDATES.find(function (entry) { return entry.code === candidateSelect.value; }) || null;
  }

  function setError(target, error) {
    target.textContent = error ? String(error.message || error) : "";
  }

  function clearReviewInputs() {
    normalizedText.value = "";
    officialNote.value = "";
    unmappedReason.value = "";
    confirmOther.checked = false;
    candidateSelect.selectedIndex = 0;
    setError(sourceError, null);
    setError(reviewError, null);
  }

  function fillCandidates() {
    candidateSelect.innerHTML = DEMO_CANDIDATES.map(function (entry) {
      return '<option value="' + escapeHtml(entry.code) + '">' + escapeHtml(entry.label) + "｜" + escapeHtml(entry.code) + "</option>";
    }).join("");
  }

  function statusGroup(item) {
    if (item.mappingState === MAP.MAPPING_STATES.EXACT || item.mappingState === MAP.MAPPING_STATES.OTHER) return "confirmed";
    if (item.mappingState === MAP.MAPPING_STATES.UNMAPPED && item.unmappedReason) return "unmapped";
    return "pending";
  }

  function filterMatches(item) {
    return activeFilter === "all" || statusGroup(item) === activeFilter;
  }

  function renderCounts() {
    const counts = { all: items.length, pending: 0, confirmed: 0, unmapped: 0 };
    items.forEach(function (item) { counts[statusGroup(item)] += 1; });
    Object.keys(counts).forEach(function (key) {
      const target = document.querySelector('[data-count="' + key + '"]');
      if (target) target.textContent = String(counts[key]);
    });
  }

  function renderQueue() {
    renderCounts();
    document.querySelectorAll("[data-filter]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-filter") === activeFilter);
    });
    const visible = items.filter(filterMatches);
    if (!visible.length) {
      queueList.innerHTML = '<div class="queue-empty">' + (items.length ? "這個篩選狀態目前沒有案例。" : "尚未載入案例。你可以先載入三筆完全虛構的測試資料。") + "</div>";
      return;
    }
    queueList.innerHTML = visible.map(function (item) {
      const group = statusGroup(item);
      const label = group === "pending" ? "待人工確認" : group === "confirmed" ? "已人工確認" : "暫不對照";
      return '<button class="queue-item' + (item.id === selectedId ? " selected" : "") + '" type="button" data-case-id="' + escapeHtml(item.id) + '">' +
        "<small><span>案例 " + escapeHtml(item.id.replace("demo-activity-", "")) + "</span><span>" + escapeHtml(label) + "</span></small>" +
        "<strong>" + escapeHtml(item.sourceText) + "</strong></button>";
    }).join("");
  }

  function renderState() {
    const item = currentItem();
    if (!item) {
      stateBox.innerHTML = '<div class="state-row"><dt>狀態</dt><dd><span class="status">尚未選擇</span></dd></div>' +
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
    const item = currentItem();
    if (!item || !item.events.length) {
      timeline.innerHTML = '<li class="empty">選擇案例後顯示操作紀錄</li>';
      return;
    }
    timeline.innerHTML = item.events.slice().reverse().map(function (event) {
      const actor = event.actorRole === "farmer" ? "農友" : "覆核人員";
      return "<li><strong>" + escapeHtml(actionLabels[event.action] || event.action) + "</strong><small>" +
        escapeHtml(actor) + "｜第 " + escapeHtml(event.sequence) + " 筆事件</small></li>";
    }).join("");
  }

  function renderProgress() {
    const item = currentItem();
    const hasItem = Boolean(item);
    const decided = hasItem && statusGroup(item) !== "pending";
    byId("progress-source").classList.toggle("active", !hasItem);
    byId("progress-review").classList.toggle("active", hasItem && !decided);
    byId("progress-result").classList.toggle("active", Boolean(decided));
  }

  function render() {
    const item = currentItem();
    const hasItem = Boolean(item);
    reviewCard.classList.toggle("hidden", !hasItem);
    createDraft.classList.toggle("hidden", hasItem);
    reviseSource.classList.toggle("hidden", !hasItem);
    if (hasItem && sourceText.value !== item.sourceText) sourceText.value = item.sourceText;
    renderQueue();
    renderState();
    renderTimeline();
    renderProgress();
  }

  function makeMapping(originalText, idSuffix) {
    const createdAt = nextNow();
    const id = "demo-activity-" + idSuffix;
    let item = MAP.createActivityMapping({
      id: id,
      workspaceId: "demo-workspace",
      farmerUid: farmer.uid,
      sourceRef: { kind: "manual_note", id: "demo-source-" + idSuffix, updatedAt: createdAt },
      sourceText: originalText,
      createdBy: farmer
    }, { now: function () { return createdAt; }, idFactory: function () { return id; } });
    return MAP.suggestCandidates(item, reviewer, DEMO_CANDIDATES, nextNow);
  }

  function selectCase(id) {
    selectedId = id;
    const item = currentItem();
    sourceText.value = item ? item.sourceText : "";
    clearReviewInputs();
    render();
  }

  function loadDemoCases() {
    items = DEMO_SOURCE_TEXTS.map(function (text, index) { return makeMapping(text, String(index + 1)); });
    sequence = items.length;
    activeFilter = "all";
    selectCase(items[0].id);
  }

  function prepareNewCase() {
    selectedId = null;
    sourceText.value = "";
    clearReviewInputs();
    render();
    sourceText.focus();
  }

  function createItem() {
    setError(sourceError, null);
    try {
      sequence += 1;
      const item = makeMapping(sourceText.value, "new-" + sequence);
      items = items.concat([item]);
      selectedId = item.id;
      render();
      reviewCard.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setError(sourceError, error);
    }
  }

  function reviseItem() {
    setError(sourceError, null);
    try {
      const current = currentItem();
      if (!current) throw new Error("請先選擇一筆案例");
      const updatedAt = nextNow();
      let nextItem = MAP.reviseSource(current, farmer, {
        sourceRef: { kind: current.sourceRef.kind, id: current.sourceRef.id, updatedAt: updatedAt },
        sourceText: sourceText.value
      }, function () { return updatedAt; });
      nextItem = MAP.suggestCandidates(nextItem, reviewer, DEMO_CANDIDATES, nextNow);
      replaceCurrent(nextItem);
      clearReviewInputs();
      render();
    } catch (error) {
      setError(sourceError, error);
    }
  }

  function confirmExactMapping() {
    setError(reviewError, null);
    try {
      const current = currentItem();
      const candidate = selectedCandidate();
      if (!current) throw new Error("請先選擇一筆案例");
      if (!candidate || candidate.code === "DEMO-OTHER") throw new Error("精確對照不能選擇其他作業");
      replaceCurrent(MAP.confirmExact(current, reviewer, {
        officialEntry: candidate,
        normalizedActivity: normalizedText.value
      }, nextNow));
      render();
    } catch (error) {
      setError(reviewError, error);
    }
  }

  function confirmOtherMapping() {
    setError(reviewError, null);
    try {
      const current = currentItem();
      const candidate = selectedCandidate();
      if (!current) throw new Error("請先選擇一筆案例");
      if (!candidate || candidate.code !== "DEMO-OTHER") throw new Error("請先選擇「（示意）其他作業」");
      replaceCurrent(MAP.confirmOther(current, reviewer, {
        officialEntry: candidate,
        officialEntryIsOther: confirmOther.checked,
        normalizedActivity: normalizedText.value,
        officialNote: officialNote.value
      }, nextNow));
      render();
    } catch (error) {
      setError(reviewError, error);
    }
  }

  function markWithoutMapping() {
    setError(reviewError, null);
    try {
      const current = currentItem();
      if (!current) throw new Error("請先選擇一筆案例");
      replaceCurrent(MAP.markUnmapped(current, reviewer, unmappedReason.value, nextNow));
      render();
    } catch (error) {
      setError(reviewError, error);
    }
  }

  function reset() {
    items = [];
    selectedId = null;
    activeFilter = "all";
    sourceText.value = "";
    clearReviewInputs();
    render();
  }

  document.querySelectorAll("[data-example]").forEach(function (button) {
    button.addEventListener("click", function () { sourceText.value = button.getAttribute("data-example") || ""; });
  });
  document.querySelectorAll("[data-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      activeFilter = button.getAttribute("data-filter") || "all";
      renderQueue();
    });
  });
  queueList.addEventListener("click", function (event) {
    const button = event.target.closest("[data-case-id]");
    if (button) selectCase(button.getAttribute("data-case-id"));
  });
  byId("load-demo-cases").addEventListener("click", loadDemoCases);
  byId("new-case").addEventListener("click", prepareNewCase);
  createDraft.addEventListener("click", createItem);
  reviseSource.addEventListener("click", reviseItem);
  resetDemo.addEventListener("click", reset);
  byId("confirm-exact").addEventListener("click", confirmExactMapping);
  byId("confirm-other-button").addEventListener("click", confirmOtherMapping);
  byId("mark-unmapped").addEventListener("click", markWithoutMapping);

  fillCandidates();
  render();
})();
