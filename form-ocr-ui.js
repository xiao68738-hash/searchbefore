(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_FORM_OCR_UI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const RESULT_TYPE = "PQC_OCR_SCAN_RESULT";
  const REQUEST_TYPE = "PQC_OCR_SCAN_REQUEST";
  const TRUSTED_ORIGINS = Object.freeze(["https://searchbefore.tw", "android://tw.searchbefore.app"]);
  const RELEASE_STATES = Object.freeze(["hidden", "development", "public"]);
  const MAX_OCR_PAYLOAD_CHARS = 1500000;
  let currentDraft = null;
  let twaPort = null;
  let pendingRequestId = null;
  let selectedOcrFiles = [];
  let selectedOcrPreviewUrls = [];
  let selectedOcrSources = [];
  let nextSourceImageIndex = 0;
  let ocrBatchDrafts = [];
  let ocrBatchIndex = 0;
  let ocrBatchRunning = false;
  let ocrVerificationCode = "";

  const SOURCE_IMAGE_STATUSES = Object.freeze(["queued", "processing", "recognized", "failed"]);
  const SOURCE_IMAGE_STATUS_LABELS = Object.freeze({
    queued: "等待辨識",
    processing: "辨識中",
    recognized: "辨識完成",
    failed: "辨識失敗"
  });

  const RECORD_TYPE_LABELS = Object.freeze({
    pesticide: "病蟲害防治／用藥",
    cultivation: "栽培作業",
    fertilizer: "施肥",
    harvest: "採收",
    postharvest: "採後處理",
    materialPurchase: "資材購入",
    equipmentMaintenance: "器具／機械／設備管理"
  });

  function canonicalRecordType(value) {
    return value === "purchase" ? "materialPurchase" : value;
  }

  function sourceImageHash(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function sourceImageId(file) {
    const source = file || {};
    const fingerprint = [source.name, source.size, source.lastModified, source.type].map(function (value) {
      return String(value == null ? "" : value);
    }).join("|");
    return "ocr-source-" + sourceImageHash(fingerprint);
  }

  function sourceImageMetadata(file, sourceIndex, status, statusMessage) {
    const source = file || {};
    const normalizedStatus = SOURCE_IMAGE_STATUSES.indexOf(status) >= 0 ? status : "queued";
    return {
      sourceImageId: sourceImageId(source),
      fileName: String(source.name || ("第 " + (Number(sourceIndex) + 1) + " 張照片")).slice(0, 240),
      sourceIndex: Math.max(0, Number(sourceIndex) || 0),
      status: normalizedStatus,
      statusMessage: String(statusMessage || "").slice(0, 500),
      mimeType: String(source.type || "").slice(0, 100),
      sizeBytes: Math.max(0, Number(source.size) || 0),
      lastModified: Math.max(0, Number(source.lastModified) || 0)
    };
  }

  function sanitizeSourceImageMetadata(value, fallbackStatus) {
    const source = value && typeof value === "object" ? value : {};
    const status = SOURCE_IMAGE_STATUSES.indexOf(source.status) >= 0 ? source.status : (fallbackStatus || "recognized");
    return Object.freeze({
      sourceImageId: /^[A-Za-z0-9._:-]{1,128}$/.test(String(source.sourceImageId || ""))
        ? String(source.sourceImageId)
        : "ocr-source-unknown",
      fileName: String(source.fileName || "辨識來源").slice(0, 240),
      sourceIndex: Math.max(0, Number(source.sourceIndex) || 0),
      status: SOURCE_IMAGE_STATUSES.indexOf(status) >= 0 ? status : "recognized",
      statusMessage: String(source.statusMessage || "").slice(0, 500),
      mimeType: String(source.mimeType || "").slice(0, 100),
      sizeBytes: Math.max(0, Number(source.sizeBytes) || 0),
      lastModified: Math.max(0, Number(source.lastModified) || 0)
    });
  }

  function attachSourceImageMetadata(draft, metadata) {
    if (!draft || typeof draft !== "object") return draft;
    return Object.freeze(Object.assign({}, draft, {
      sourceImage: sanitizeSourceImageMetadata(metadata, "recognized")
    }));
  }

  function createDraftWithSource(payload, metadata) {
    if (!root.PQC_FORM_OCR || typeof root.PQC_FORM_OCR.createDraft !== "function") return null;
    const safeMetadata = sanitizeSourceImageMetadata(metadata, "recognized");
    const draft = root.PQC_FORM_OCR.createDraft(payload, dictionaries(), safeMetadata);
    return attachSourceImageMetadata(draft, safeMetadata);
  }

  function featureReleaseState(key) {
    const config = root.PQC_PUBLIC_CONFIG && root.PQC_PUBLIC_CONFIG.features;
    const state = config && config[key];
    return RELEASE_STATES.indexOf(state) >= 0 ? state : "hidden";
  }

  function ocrConfig() {
    const config = root.PQC_PUBLIC_CONFIG && root.PQC_PUBLIC_CONFIG.ocr;
    return config && typeof config === "object" ? config : {};
  }

  function cloudOcrConfig() {
    const config = ocrConfig().cloud;
    return config && typeof config === "object" ? config : {};
  }

  function cloudRequestId() {
    const cryptoApi = root.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
      return "ocr-" + cryptoApi.randomUUID();
    }
    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
      const bytes = new Uint8Array(12);
      cryptoApi.getRandomValues(bytes);
      return "ocr-" + Array.from(bytes, function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("");
    }
    return "ocr-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
  }

  function ocrVerificationConfig() {
    const config = cloudOcrConfig().verification;
    return config && typeof config === "object" ? config : {};
  }

  function ocrVerificationStorage() {
    try {
      return root.sessionStorage || null;
    } catch (_) {
      return null;
    }
  }

  function isOcrUnlocked() {
    const config = ocrVerificationConfig();
    if (config.required === false) return true;
    if (!ocrVerificationCode) return false;
    const storage = ocrVerificationStorage();
    if (!storage || !config.hash || !config.sessionKey) return false;
    try {
      return storage.getItem(config.sessionKey) === config.hash;
    } catch (_) {
      return false;
    }
  }

  function sha256Hex(value) {
    if (!root.crypto || !root.crypto.subtle || typeof root.TextEncoder !== "function") return Promise.resolve("");
    return root.crypto.subtle.digest("SHA-256", new root.TextEncoder().encode(String(value || ""))).then(function (buffer) {
      return Array.from(new Uint8Array(buffer)).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    });
  }

  function setOcrVerificationStatus(message, tone) {
    const box = root.document && root.document.getElementById("ocrVerificationStatus");
    if (!box) return;
    box.hidden = !message;
    box.className = "ocr-status " + (tone || "warn");
    box.textContent = message || "";
  }

  function applyOcrVerificationState() {
    const locked = !isOcrUnlocked();
    const gate = root.document && root.document.getElementById("ocrVerificationGate");
    const content = root.document && root.document.getElementById("ocrVisionLockedContent");
    if (gate) gate.hidden = !locked;
    if (content) content.hidden = locked;
    return !locked;
  }

  async function unlockOcr() {
    const input = root.document && root.document.getElementById("ocrVerificationCode");
    const value = input ? String(input.value || "").trim() : "";
    const config = ocrVerificationConfig();
    if (!value) {
      setOcrVerificationStatus("請輸入測試驗證碼。", "warn");
      return false;
    }
    if (!config.hash || !config.sessionKey) {
      setOcrVerificationStatus("OCR 驗證設定尚未完成，請暫勿使用。", "bad");
      return false;
    }
    const digest = await sha256Hex(value);
    if (!digest || digest !== config.hash) {
      setOcrVerificationStatus("驗證碼不正確，尚未解鎖 OCR 測試功能。", "bad");
      if (input) {
        input.value = "";
        input.focus();
      }
      return false;
    }
    const storage = ocrVerificationStorage();
    if (!storage) {
      setOcrVerificationStatus("此瀏覽器無法建立測試工作階段，請改用一般瀏覽器視窗。", "bad");
      return false;
    }
    try {
      storage.setItem(config.sessionKey, config.hash);
      ocrVerificationCode = value;
      if (input) input.value = "";
    } catch (_) {
      setOcrVerificationStatus("無法保存本次解鎖狀態，請檢查瀏覽器隱私設定。", "bad");
      return false;
    }
    applyOcrVerificationState();
    setOcrVerificationStatus("驗證完成。本次瀏覽器工作階段已解鎖 OCR 測試功能。", "ok");
    return true;
  }

  function validCloudEndpoint(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && /\/v1\/ocr\/?$/.test(url.pathname) ? url.toString() : "";
    } catch (_) {
      return "";
    }
  }

  function activeOcrProvider() {
    const config = ocrConfig();
    if (config.provider === "google-cloud-vision" && validCloudEndpoint(cloudOcrConfig().endpoint)) return "google-cloud-vision";
    return "unavailable";
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function safePayload(value) {
    if (!value || typeof value !== "object") return null;
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_OCR_PAYLOAD_CHARS || /data:image|base64|imageUri|imageData/i.test(serialized)) return null;
    if (value.type !== RESULT_TYPE || Number(value.protocolVersion) !== 1) return null;
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(String(value.requestId || ""))) return null;
    if (!Array.isArray(value.blocks) || value.blocks.length > 500) return null;
    let wordCount = 0;
    for (let index = 0; index < value.blocks.length; index += 1) {
      const words = value.blocks[index] && value.blocks[index].words;
      if (words != null && (!Array.isArray(words) || words.length > 200)) return null;
      wordCount += Array.isArray(words) ? words.length : 0;
      if (wordCount > 5000) return null;
    }
    return value;
  }

  function dictionaries() {
    const crops = typeof CROPS !== "undefined" && Array.isArray(CROPS) ? CROPS : [];
    const materials = new Set();
    const targets = new Set();
    if (typeof DATA !== "undefined" && DATA && typeof DATA === "object") {
      Object.values(DATA).forEach(function (pests) {
        Object.entries(pests || {}).forEach(function (entry) {
          const pest = entry[0];
          const agents = entry[1];
          if (pest) targets.add(pest);
          (agents || []).forEach(function (agent) {
            if (agent && agent.name) materials.add(agent.name);
            (agent && Array.isArray(agent.bl) ? agent.bl : []).forEach(function (brand) {
              if (brand) materials.add(typeof brand === "string" ? brand : brand.name);
            });
          });
        });
      });
    }
    return { crops: crops, materials: Array.from(materials).filter(Boolean), targets: Array.from(targets).filter(Boolean) };
  }

  function matchKey(value) {
    return String(value || "").normalize("NFKC").replace(/[\s·‧・,，.。()（）\-]/g, "").toLocaleLowerCase("zh-Hant");
  }

  function registeredPesticideMatches(input) {
    if (typeof DATA === "undefined" || !DATA || typeof DATA !== "object") return [];
    const cropKey = matchKey(input && input.crop);
    const materialKey = matchKey(input && input.material);
    const targetKey = matchKey(input && input.target);
    const dilution = Number(input && input.dilution) || null;
    const phi = input && input.safetyInterval !== "" && input.safetyInterval != null ? Number(input.safetyInterval) : null;
    if (!cropKey || !materialKey) return [];
    const matches = [];
    Object.entries(DATA).forEach(function (cropEntry) {
      const crop = cropEntry[0];
      if (matchKey(crop) !== cropKey) return;
      Object.entries(cropEntry[1] || {}).forEach(function (pestEntry) {
        const pest = pestEntry[0];
        if (targetKey && matchKey(pest) !== targetKey) return;
        (pestEntry[1] || []).forEach(function (agent) {
          const names = [agent && agent.name].concat((agent && Array.isArray(agent.bl) ? agent.bl : []).map(function (brand) {
            return typeof brand === "string" ? brand : brand && brand.name;
          })).filter(Boolean);
          if (!names.some(function (name) { return matchKey(name) === materialKey; })) return;
          const officialDilution = Number(String(agent.dilution || "").replace(/,/g, "")) || null;
          const officialPhi = agent.phi == null || agent.phi === "" ? null : Number(agent.phi);
          let score = 2;
          if (targetKey) score += 2;
          if (dilution && officialDilution === dilution) score += 1;
          if (phi != null && officialPhi === phi) score += 1;
          matches.push({ crop, pest, agent, score, matchedName: names.find(function (name) { return matchKey(name) === materialKey; }) || agent.name });
        });
      });
    });
    matches.sort(function (a, b) { return b.score - a.score; });
    if (!matches.length) return [];
    const best = matches[0].score;
    return matches.filter(function (match) { return match.score === best; });
  }

  function optionList(items, format) {
    if (!items || !items.length) return '<option value="">未辨識到，請自行輸入</option>';
    return '<option value="">請選擇辨識結果</option>' + items.map(function (item) {
      const value = format ? format(item) : item.value;
      return '<option value="' + esc(value) + '">' + esc(value) + '</option>';
    }).join("");
  }

  function recordTypeOptions(items) {
    const detected = new Map((items || []).map(function (item) { return [canonicalRecordType(item.value), item]; }));
    return '<option value="">請選擇</option>' + Object.keys(RECORD_TYPE_LABELS).map(function (value) {
      const item = detected.get(value);
      return '<option value="' + value + '">' + esc(RECORD_TYPE_LABELS[value] + (item ? "（辨識候選）" : "")) + '</option>';
    }).join("");
  }

  function routeDecisionHtml(draft) {
    const decision = draft && draft.routeDecision;
    if (!decision || decision.status === "exact") return "";
    const message = decision.status === "ambiguous"
      ? "這張照片同時像多種表單，系統不會自動選第一名。請對照原圖自行選擇紀錄類型。"
      : "目前無法可靠判斷文件用途。請對照原圖自行選擇；若不是田間作業，請不要帶入。";
    return '<div class="ocr-status warn"><b>需要人工判斷文件用途</b><span>' + esc(message) + '</span></div>';
  }

  function qualityHtml(quality) {
    if (!quality) return "";
    const blocking = quality.issues.filter(function (issue) { return issue.level === "blocking"; });
    const warnings = quality.issues.filter(function (issue) { return issue.level === "warning"; });
    if (!blocking.length && !warnings.length) return '<div class="ocr-status ok"><b>照片品質通過</b><span>仍請逐欄核對辨識結果。</span></div>';
    const title = blocking.length ? "照片品質未通過，請重新拍攝" : "照片可辨識，但需要仔細核對";
    return '<div class="ocr-status ' + (blocking.length ? "bad" : "warn") + '"><b>' + title + '</b><ul>' + quality.issues.map(function (issue) {
      return '<li>' + esc(issue.message) + '</li>';
    }).join("") + '</ul></div>';
  }

  function equipmentReviewOptions(items, selectedValues, attribute) {
    const selected = new Set(selectedValues || []);
    return (items || []).map(function (item) {
      return '<label><input type="checkbox" ' + attribute + ' value="' + esc(item) + '"' + (selected.has(item) ? " checked" : "") + '> ' + esc(item) + '</label>';
    }).join("");
  }

  function renderEquipmentMaintenanceDraft(draft, text) {
    const box = document.getElementById("ocrDraftBox");
    if (!box) return;
    const farm = root.PQC_FARM || {};
    const equipmentItems = farm.EQUIPMENT_ITEMS || ["噴霧機", "割草機", "中耕機", "選別機", "貯藏／溫控設備", "搬運車", "冷藏車"];
    const actionItems = farm.EQUIPMENT_ACTIONS || ["清潔", "保養", "維修", "校正"];
    const rows = draft.recordGroups && draft.recordGroups.length ? draft.recordGroups : [{ id: "equipment-row-1", date: [], equipment: [], actions: [], operator: [] }];
    box.innerHTML = qualityHtml(draft.quality)
      + '<div class="ocr-equipment-intro"><b>辨識到設備管理表單</b><span>同一張表可能包含多筆日期。系統先拆成 ' + rows.length + ' 筆本機輔助紀錄草稿；看不清楚的欄位保留空白。是否屬 L3 上傳範圍仍待官方確認。</span></div>'
      + '<div id="ocrEquipmentRows" class="ocr-equipment-rows">'
      + rows.map(function (row, index) {
        const selectedEquipment = (row.equipment || []).filter(function (item) { return item.selected; }).map(function (item) { return item.value; });
        const selectedActions = (row.actions || []).filter(function (item) { return item.selected; }).map(function (item) { return item.value; });
        const date = row.date && row.date[0] ? row.date[0].value : "";
        const operator = row.operator && row.operator[0] ? row.operator[0].value : "";
        return '<section class="ocr-equipment-row" data-ocr-equipment-row>'
          + '<div class="ocr-equipment-row-head"><b>第 ' + (index + 1) + ' 筆</b><span>' + (date ? "已找到日期候選" : "日期待確認") + '</span><button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.removeEquipmentDraftRow(this)">排除這筆</button></div>'
          + '<div class="field"><label>日期 *</label><input class="ocr-equipment-date" type="date" value="' + esc(date) + '"></div>'
          + '<div class="field"><label>記錄人</label><input class="ocr-equipment-operator" value="' + esc(operator) + '" placeholder="看不清楚可留空"></div>'
          + '<div class="equipment-choice"><span>器具／機械／設備 *</span><div class="equipment-choice-list">' + equipmentReviewOptions(equipmentItems, selectedEquipment, "data-ocr-equipment-item") + '</div></div>'
          + '<div class="field equipment-other"><label>其他設備</label><input class="ocr-equipment-other" placeholder="可自行輸入"></div>'
          + '<div class="equipment-choice"><span>作業內容 *</span><div class="equipment-choice-list">' + equipmentReviewOptions(actionItems, selectedActions, "data-ocr-equipment-action") + '</div></div>'
          + '<div class="field equipment-other"><label>其他作業</label><input class="ocr-equipment-other-action" placeholder="可自行輸入"></div>'
          + '<div class="field wide"><label>備註</label><textarea class="ocr-equipment-notes" placeholder="維修內容、校正結果或其他說明"></textarea></div>'
          + '</section>';
      }).join("")
      + '</div>'
      + '<div class="field wide"><label>辨識原文</label><textarea id="ocrRawText" readonly>' + esc(text) + '</textarea></div>'
      + '<fieldset class="ocr-confirm wide"><legend>帶入前必須確認</legend><label><input id="ocrConfirmEquipmentRows" type="checkbox"> 我已逐筆核對日期、設備與作業內容</label></fieldset>'
      + '<button class="btn btn-main wide" type="button" onclick="PQC_FORM_OCR_UI.applyEquipmentMaintenanceBatch()"' + (draft.quality.canProcess ? "" : " disabled") + '>帶入多筆設備管理紀錄</button>'
      + '<p class="disclaimer wide">辨識結果只會帶入批次編輯清單，不會自動儲存。未勾選或看不清楚的內容必須由使用者確認。</p>';
  }

  function batchNavigatorHtml() {
    if (!ocrBatchDrafts.length) return "";
    const item = ocrBatchDrafts[ocrBatchIndex];
    if (!item) return "";
    const sourceNumber = Number(item.sourceIndex) + 1;
    const statusLabel = SOURCE_IMAGE_STATUS_LABELS[item.status] || "等待確認";
    const sourceArgument = esc(JSON.stringify(String(item.sourceImageId || "")));
    return '<div class="ocr-batch-nav">'
      + '<div><b>照片 ' + (ocrBatchIndex + 1) + ' / ' + ocrBatchDrafts.length + '</b><span>來源 #' + sourceNumber + '・' + esc(item.fileName) + '</span><small class="ocr-source-status" data-status="' + esc(item.status) + '">' + esc(statusLabel) + '</small></div>'
      + '<div class="ocr-batch-nav-actions"><button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.showOcrBatchDraft(' + (ocrBatchIndex - 1) + ')"' + (ocrBatchIndex <= 0 ? " disabled" : "") + '>上一張</button>'
      + '<button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.openOcrImagePreview(' + sourceArgument + ')">查看原圖</button>'
      + '<button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.showOcrBatchDraft(' + (ocrBatchIndex + 1) + ')"' + (ocrBatchIndex >= ocrBatchDrafts.length - 1 ? " disabled" : "") + '>下一張</button></div>'
      + '</div>';
  }

  function renderFailedBatchDraft(item) {
    currentDraft = null;
    const box = document.getElementById("ocrDraftBox");
    if (!box || !item) return;
    const sourceArgument = esc(JSON.stringify(String(item.sourceImageId || "")));
    box.innerHTML = batchNavigatorHtml()
      + '<div class="ocr-status bad"><b>這張照片沒有建立草稿</b><span>' + esc(item.error || "辨識失敗，請查看原圖後重新拍攝或再次辨識。") + '</span></div>'
      + '<button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.openOcrImagePreview(' + sourceArgument + ')">查看這張原圖</button>'
      + '<p class="disclaimer">其他照片的草稿仍可使用上一張／下一張繼續核對；這張失敗不會清除已完成的結果。</p>';
  }

  function selfInspectionStatusOptions() {
    return '<option value="unresolved">未判定</option>'
      + '<option value="compliant">符合</option>'
      + '<option value="noncompliant">不符合</option>'
      + '<option value="not-applicable">不適用</option>';
  }

  function renderSelfInspectionDraft(draft, text) {
    const box = document.getElementById("ocrDraftBox");
    if (!box) return;
    const currentBatchItem = ocrBatchDrafts[ocrBatchIndex];
    const sourceArgument = esc(JSON.stringify(String(currentBatchItem && currentBatchItem.sourceImageId || "")));
    const review = draft.selfInspection;
    const dates = review && review.dates || [];
    const inspectors = review && review.inspectors || [];
    const defaultDate = dates.length === 1 ? dates[0].value : "";
    const defaultInspector = inspectors.length === 1 ? inspectors[0].value : "";
    const sections = review && review.sections || [];
    box.innerHTML = batchNavigatorHtml()
      + qualityHtml(draft.quality)
      + '<section class="ocr-reference-review"><div class="ocr-reference-title"><b>備查文件（非 L3 登打）</b><span>依農民實務回饋，這類自我檢核表通常由核檢人員現場查看，不需登打到產銷履歷系統。你可以略過；若想留電子備查，再人工核對後下載 CSV。</span></div>'
      + '<div class="ocr-reference-summary"><div><span>日期候選</span><b>' + esc(dates.map(function (item) { return item.value; }).join("、") || "未辨識到") + '</b></div>'
      + '<div><span>查核者候選</span><b>' + esc(inspectors.map(function (item) { return item.value; }).join("、") || "未辨識到") + '</b></div></div>'
      + '<div id="ocrSelfInspectionSections" class="ocr-self-sections">'
      + sections.map(function (section) {
        return '<section class="ocr-self-section" data-self-section data-section-code="' + esc(section.code) + '" data-section-title="' + esc(section.title) + '">'
          + '<div class="ocr-self-section-head"><div><b>' + esc(section.code + " " + section.title) + '</b><span>僅供選擇性備查；未判定不是辨識失敗</span></div><button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.openOcrImagePreview(' + sourceArgument + ')">查看原圖</button></div>'
          + '<div class="ocr-self-meta"><label>確認日期<input class="ocr-self-date" type="date" value="' + esc(defaultDate) + '"></label><label>查核者<input class="ocr-self-inspector" value="' + esc(defaultInspector) + '" placeholder="看不清楚可留空"></label></div>'
          + '<div class="ocr-self-items">'
          + section.items.map(function (item) {
            return '<div class="ocr-self-item" data-self-item data-item-code="' + esc(item.code) + '" data-item-title="' + esc(item.title) + '">'
              + '<div class="ocr-self-item-copy"><b>' + esc(item.code) + '</b><span>' + esc(item.title) + '</span><small>' + esc(item.evidence) + '</small></div>'
              + '<label>結果<select class="ocr-self-status">' + selfInspectionStatusOptions() + '</select></label>'
              + '<label>備註<input class="ocr-self-note" placeholder="可補充原表備註"></label>'
              + '</div>';
          }).join("")
          + '</div></section>';
      }).join("")
      + '</div>'
      + '<details class="ocr-raw-details"><summary>查看辨識原文</summary><textarea id="ocrRawText" readonly>' + esc(text) + '</textarea></details>'
      + '<fieldset class="ocr-confirm wide"><legend>匯出前確認</legend><label><input id="ocrConfirmSelfInspection" type="checkbox"> 我已對照原圖逐列核對；無法確定的項目保留「未判定」</label></fieldset>'
      + '<button class="btn btn-main wide" type="button" onclick="PQC_FORM_OCR_UI.exportSelfInspectionDraft()">下載選擇性備查 CSV</button>'
      + '<p class="disclaimer">若現場只需紙本供核檢，可直接略過。CSV 不是 L3 上傳檔，也不會建立任何田間作業紀錄。</p></section>';
  }

  function inventoryOptionList(items, selectedValue) {
    if (!items || !items.length) return '<option value="">未辨識到，請自行輸入</option>';
    return '<option value="">請選擇辨識候選</option>' + items.map(function (item) {
      return '<option value="' + esc(item.value) + '"' + (item.value === selectedValue ? " selected" : "") + '>' + esc(item.value) + '</option>';
    }).join("");
  }

  function materialInventoryRowHtml(index, draft) {
    const date = draft.dates && draft.dates[index] ? draft.dates[index].value : "";
    const material = draft.materials && draft.materials[index] ? draft.materials[index].value : (draft.materials[0] && draft.materials[0].value || "");
    const manufacturer = draft.manufacturers && draft.manufacturers[index] ? draft.manufacturers[index].value : (draft.manufacturers[0] && draft.manufacturers[0].value || "");
    const supplier = draft.suppliers && draft.suppliers[index] ? draft.suppliers[index].value : (draft.suppliers[0] && draft.suppliers[0].value || "");
    const capacity = draft.packageCapacities && draft.packageCapacities[index] ? draft.packageCapacities[index].value : (draft.packageCapacities[0] && draft.packageCapacities[0].value || "");
    return '<section class="ocr-inventory-row" data-inventory-row><div class="ocr-inventory-row-head"><b>進出庫第 ' + (index + 1) + ' 筆</b><button class="btn btn-ghost" type="button" onclick="this.closest(\'[data-inventory-row]\').remove()">移除</button></div>'
      + '<label>資材名稱<select class="ocr-inventory-material">' + inventoryOptionList(draft.materials, material) + '</select><input class="ocr-inventory-material-manual" placeholder="或自行輸入"></label>'
      + '<label>廠商<select class="ocr-inventory-manufacturer">' + inventoryOptionList(draft.manufacturers, manufacturer) + '</select><input class="ocr-inventory-manufacturer-manual" placeholder="或自行輸入"></label>'
      + '<label>供應商<select class="ocr-inventory-supplier">' + inventoryOptionList(draft.suppliers, supplier) + '</select><input class="ocr-inventory-supplier-manual" placeholder="或自行輸入"></label>'
      + '<label>包裝容量<select class="ocr-inventory-capacity">' + inventoryOptionList(draft.packageCapacities, capacity) + '</select><input class="ocr-inventory-capacity-manual" placeholder="例如 25 公斤"></label>'
      + '<label>日期<input class="ocr-inventory-date" type="date" value="' + esc(date) + '"></label>'
      + '<label>購入量<input class="ocr-inventory-purchase" inputmode="decimal" placeholder="例如 15"></label>'
      + '<label>使用量<input class="ocr-inventory-used" inputmode="decimal" placeholder="例如 5"></label>'
      + '<label>剩餘量<input class="ocr-inventory-remaining" inputmode="decimal" placeholder="例如 10"></label>'
      + '<label>單位<input class="ocr-inventory-unit" placeholder="包、公斤、瓶"></label></section>';
  }

  function renderMaterialInventoryDraft(draft, text) {
    const box = document.getElementById("ocrDraftBox");
    if (!box) return;
    const currentBatchItem = ocrBatchDrafts[ocrBatchIndex];
    const sourceArgument = esc(JSON.stringify(String(currentBatchItem && currentBatchItem.sourceImageId || "")));
    const inventory = draft.materialInventory;
    const rowCount = Math.min(12, Math.max(1, inventory.suggestedRowCount || 1, inventory.materials.length));
    box.innerHTML = batchNavigatorHtml() + qualityHtml(draft.quality)
      + '<section class="ocr-reference-review"><div class="ocr-reference-title"><b>肥料／資材入出庫草稿（測試中）</b><span>這是庫存帳，不會被當成一次施肥或一次購入。系統先整理資材基本資料與多筆進出庫列，請對照原圖修正；目前不直接送入 L3。</span></div>'
      + '<div class="ocr-reference-summary"><div><span>資材候選</span><b>' + esc(inventory.materials.map(function (item) { return item.value; }).join("、") || "未辨識到") + '</b></div><div><span>日期候選</span><b>' + esc(inventory.dates.map(function (item) { return item.value; }).join("、") || "未辨識到") + '</b></div></div>'
      + '<div class="ocr-inventory-toolbar"><b>進出庫明細</b><button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.addMaterialInventoryRow()">＋ 新增一列</button></div>'
      + '<div id="ocrInventoryRows" class="ocr-inventory-rows">' + Array.from({ length: rowCount }, function (_, index) { return materialInventoryRowHtml(index, inventory); }).join("") + '</div>'
      + '<button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.openOcrImagePreview(' + sourceArgument + ')">查看原圖核對</button>'
      + '<details class="ocr-raw-details"><summary>查看辨識原文</summary><textarea id="ocrRawText" readonly>' + esc(text) + '</textarea></details>'
      + '<fieldset class="ocr-confirm wide"><legend>匯出前確認</legend><label><input id="ocrConfirmMaterialInventory" type="checkbox"> 我已對照原圖核對資材名稱與每筆數量</label></fieldset>'
      + '<button class="btn btn-main wide" type="button" onclick="PQC_FORM_OCR_UI.exportMaterialInventoryDraft()">下載資材庫存草稿 CSV</button>'
      + '<p class="disclaimer">辨識結果不會自動儲存或上傳。等取得正式 L3 欄位規格後，再決定哪些欄位可安全串接。</p></section>';
  }

  function renderReferenceDocumentDraft(draft, text, detectedType) {
    const box = document.getElementById("ocrDraftBox");
    if (!box) return;
    const isChecklist = detectedType && detectedType.value === "selfInspection";
    if (isChecklist && draft.selfInspection && draft.selfInspection.sections.length) {
      renderSelfInspectionDraft(draft, text);
      return;
    }
    const title = isChecklist ? "辨識到生產及出貨自我查核表" : "辨識到基本資料／田區資料";
    const explanation = isChecklist
      ? "這類文件是查核與備查資料，不是單筆田間作業。為避免誤存，系統先保留辨識原文與日期／查核者候選，暫不帶入作業紀錄。"
      : "這類文件包含農戶、田區或聯絡資料，不是單筆作業紀錄。系統先提供核對結果，暫不自動寫入個人資料或田區。";
    box.innerHTML = batchNavigatorHtml()
      + qualityHtml(draft.quality)
      + '<section class="ocr-reference-review"><div class="ocr-reference-title"><b>' + title + '</b><span>' + explanation + '</span></div>'
      + '<div class="ocr-reference-summary"><div><span>日期候選</span><b>' + esc((draft.fields.date || []).map(function (item) { return item.value; }).join("、") || "未辨識到") + '</b></div>'
      + '<div><span>填寫／查核者候選</span><b>' + esc((draft.fields.operator || []).map(function (item) { return item.value; }).join("、") || "未辨識到") + '</b></div></div>'
      + '<label class="field"><span>辨識原文（供人工整理與核對）</span><textarea id="ocrRawText" readonly>' + esc(text) + '</textarea></label>'
      + '<p class="disclaimer">目前只做辨識與分類，不會將查核勾選結果或個人資料誤存為田間紀錄。</p></section>';
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value == null ? "" : value;
  }

  function renderDraft(draft) {
    currentDraft = draft;
    const box = document.getElementById("ocrDraftBox");
    if (!box) return;
    const text = draft.blocks.map(function (block) { return block.text; }).join("\n");
    const routeDecision = draft.routeDecision || {};
    const detectedType = routeDecision.status === "exact" && routeDecision.type
      ? (draft.fields.recordType || []).find(function (item) { return item.value === routeDecision.type; })
      : null;
    if (detectedType && (detectedType.value === "selfInspection" || detectedType.value === "profile")) {
      renderReferenceDocumentDraft(draft, text, detectedType);
      return;
    }
    if (detectedType && detectedType.value === "purchase" && draft.materialInventory) {
      renderMaterialInventoryDraft(draft, text);
      return;
    }
    if (draft.recordGroups && draft.recordGroups.length) {
      renderEquipmentMaintenanceDraft(draft, text);
      box.insertAdjacentHTML("afterbegin", batchNavigatorHtml());
      return;
    }
    box.innerHTML = batchNavigatorHtml() + qualityHtml(draft.quality) + routeDecisionHtml(draft)
      + '<div class="ocr-review">'
      + '<div class="field"><label>紀錄類型 *</label><select id="ocrRecordType">' + recordTypeOptions(draft.fields.recordType) + '</select></div>'
      + '<div class="field"><label>日期候選 *</label><select id="ocrDateCandidate">' + optionList(draft.fields.date) + '</select><input id="ocrDateManual" type="date" aria-label="手動修正日期"></div>'
      + '<div class="field"><label>作物候選 *</label><select id="ocrCropCandidate">' + optionList(draft.fields.crop) + '</select><input id="ocrCropManual" placeholder="或自行輸入作物"></div>'
      + '<div class="field"><label>田區代號候選</label><select id="ocrFieldPlotCandidate">' + optionList(draft.fields.fieldPlot) + '</select><input id="ocrFieldPlotManual" placeholder="或自行輸入田區代號"></div>'
      + '<div class="field"><label>防治對象候選</label><select id="ocrTargetCandidate">' + optionList(draft.fields.target) + '</select><input id="ocrTargetManual" placeholder="或自行輸入病蟲害"></div>'
      + '<div class="field"><label>資材／藥劑候選</label><select id="ocrMaterialCandidate">' + optionList(draft.fields.material) + '</select><input id="ocrMaterialManual" placeholder="或自行輸入名稱"></div>'
      + '<div class="field"><label>稀釋倍數</label><select id="ocrDilutionCandidate">' + optionList(draft.fields.dilution) + '</select></div>'
      + '<div class="field"><label>數量候選</label><select id="ocrAmountCandidate">' + optionList(draft.fields.amount, function (item) { return item.value + " " + item.unit; }) + '</select></div>'
      + '<div class="field"><label>安全採收期候選</label><select id="ocrSafetyCandidate">' + optionList(draft.fields.safetyInterval, function (item) { return item.value == null ? "未訂／不適用" : item.value; }) + '</select><input id="ocrSafetyManual" type="number" min="0" max="365" inputmode="numeric" placeholder="或自行輸入天數"></div>'
      + '<div class="field"><label>執行人</label><select id="ocrOperatorCandidate">' + optionList(draft.fields.operator) + '</select><input id="ocrOperator" placeholder="請自行確認填寫"></div>'
      + '<div class="field wide"><label>辨識原文</label><textarea id="ocrRawText" readonly>' + esc(text) + '</textarea></div>'
      + '<fieldset class="ocr-confirm wide"><legend>帶入前必須確認</legend><label><input id="ocrConfirmType" type="checkbox"> 紀錄類型已核對</label><label><input id="ocrConfirmDate" type="checkbox"> 日期已核對</label><label><input id="ocrConfirmCrop" type="checkbox"> 作物已核對（如有）</label><label><input id="ocrConfirmMaterial" type="checkbox"> 藥劑／資材名稱已核對（如有）</label></fieldset>'
      + '<button class="btn btn-main wide" type="button" onclick="PQC_FORM_OCR_UI.applyToFarmForm()"' + (draft.quality.canProcess ? "" : " disabled") + '>帶入紀錄表單並繼續確認</button>'
      + '<p class="disclaimer wide">辨識結果只是草稿。系統不會自動儲存；帶入後仍須在原本的作業紀錄表單再次確認並按下儲存。</p>'
      + '</div>';
    if (draft.fields.date.length) {
      setValue("ocrDateCandidate", draft.fields.date[0].value);
      setValue("ocrDateManual", draft.fields.date[0].value);
    }
    if (detectedType && RECORD_TYPE_LABELS[canonicalRecordType(detectedType.value)]) setValue("ocrRecordType", canonicalRecordType(detectedType.value));
    if (draft.fields.crop.length) setValue("ocrCropCandidate", draft.fields.crop[0].value);
    if (draft.fields.fieldPlot.length) setValue("ocrFieldPlotCandidate", draft.fields.fieldPlot[0].value);
    if (draft.fields.target.length) setValue("ocrTargetCandidate", draft.fields.target[0].value);
    if (draft.fields.material.length) setValue("ocrMaterialCandidate", draft.fields.material[0].value);
    if (draft.fields.dilution.length) setValue("ocrDilutionCandidate", draft.fields.dilution[0].value);
    if (draft.fields.amount.length) setValue("ocrAmountCandidate", draft.fields.amount[0].value + " " + draft.fields.amount[0].unit);
    if (draft.fields.safetyInterval.length && draft.fields.safetyInterval[0].value != null) {
      setValue("ocrSafetyCandidate", draft.fields.safetyInterval[0].value);
      setValue("ocrSafetyManual", draft.fields.safetyInterval[0].value);
    }
    if (draft.fields.operator.length) setValue("ocrOperatorCandidate", draft.fields.operator[0].value);
  }

  function receiveScanResult(payload) {
    const safe = safePayload(payload);
    if (!safe || !root.PQC_FORM_OCR) {
      if (typeof root.toast === "function") root.toast("辨識資料格式不正確，請重新掃描");
      return false;
    }
    if (pendingRequestId && safe.requestId !== pendingRequestId) {
      if (typeof root.toast === "function") root.toast("這不是本次掃描的辨識結果，已拒絕帶入");
      return false;
    }
    pendingRequestId = null;
    const sourceMetadata = safe.sourceImage && typeof safe.sourceImage === "object"
      ? safe.sourceImage
      : {
          sourceImageId: "ocr-result-" + sourceImageHash(safe.requestId),
          fileName: "辨識結果",
          sourceIndex: 0,
          status: "recognized"
        };
    renderDraft(createDraftWithSource(safe, sourceMetadata));
    return true;
  }

  function requestNativeScan() {
    if (!isOcrUnlocked()) {
      if (typeof root.toast === "function") root.toast("請先輸入 OCR 測試驗證碼");
      return false;
    }
    const request = { type: REQUEST_TYPE, protocolVersion: 1, requestId: "ocr-" + Date.now() };
    pendingRequestId = request.requestId;
    if (root.PQC_ANDROID_OCR && typeof root.PQC_ANDROID_OCR.scanForm === "function") {
      root.PQC_ANDROID_OCR.scanForm(JSON.stringify(request));
      return;
    }
    if (twaPort && typeof twaPort.postMessage === "function") {
      twaPort.postMessage(JSON.stringify(request));
      return;
    }
    if (root.PQC_TWA_CHANNEL && typeof root.PQC_TWA_CHANNEL.postMessage === "function") {
      root.PQC_TWA_CHANNEL.postMessage(JSON.stringify(request));
      return;
    }
    pendingRequestId = null;
    const note = document.getElementById("ocrBridgeNote");
    if (note) note.hidden = false;
    if (typeof root.toast === "function") root.toast("目前瀏覽器沒有 Android 掃描功能，可先貼上辨識文字測試");
  }

  function setBrowserOcrStatus(message, tone) {
    const box = document.getElementById("cloudVisionStatus");
    if (!box) return;
    box.hidden = !message;
    box.className = "ocr-status " + (tone || "warn");
    box.textContent = message || "";
  }

  function setOcrProgress(value, label, active) {
    const box = document.getElementById("cloudVisionProgress");
    const bar = document.getElementById("cloudVisionProgressBar");
    const text = document.getElementById("cloudVisionProgressText");
    if (!box || !bar || !text) return;
    const progress = Math.max(0, Math.min(100, Number(value) || 0));
    box.hidden = active === false;
    box.setAttribute("aria-valuenow", String(Math.round(progress)));
    bar.style.width = progress + "%";
    text.textContent = label || "正在處理照片…";
  }

  function closeOcrImagePreview() {
    const modal = document.getElementById("ocrImagePreviewModal");
    if (modal) modal.hidden = true;
  }

  function selectedSourceIndex(reference) {
    if (typeof reference === "string" && reference) {
      return selectedOcrSources.findIndex(function (source) { return source.sourceImageId === reference; });
    }
    const index = Number(reference);
    return Number.isInteger(index) && index >= 0 && index < selectedOcrSources.length ? index : -1;
  }

  function openOcrImagePreview(reference) {
    const safeIndex = selectedSourceIndex(reference);
    const modal = document.getElementById("ocrImagePreviewModal");
    const image = document.getElementById("ocrImagePreviewLarge");
    const title = document.getElementById("ocrImagePreviewTitle");
    const source = safeIndex >= 0 ? selectedOcrSources[safeIndex] : null;
    if (!modal || !image || !source || !selectedOcrPreviewUrls[safeIndex]) return false;
    image.src = selectedOcrPreviewUrls[safeIndex];
    image.alt = "待辨識照片：" + source.fileName;
    if (title) title.textContent = "來源 #" + (source.sourceIndex + 1) + "　" + source.fileName;
    modal.hidden = false;
    return true;
  }

  function updateSelectedOcrSource(sourceImageIdValue, status, statusMessage) {
    const index = selectedOcrSources.findIndex(function (source) { return source.sourceImageId === sourceImageIdValue; });
    if (index < 0) return false;
    selectedOcrSources[index].status = SOURCE_IMAGE_STATUSES.indexOf(status) >= 0 ? status : selectedOcrSources[index].status;
    selectedOcrSources[index].statusMessage = String(statusMessage || "").slice(0, 500);
    renderSelectedOcrFiles();
    return true;
  }

  function renderSelectedOcrFiles() {
    const label = document.getElementById("cloudVisionSelected");
    const preview = document.getElementById("cloudVisionPreviewList");
    if (label) {
      label.hidden = !selectedOcrFiles.length;
      label.textContent = selectedOcrFiles.length
        ? "已加入 " + selectedOcrFiles.length + " 張照片，可再拍照或繼續加入"
        : "";
    }
    if (!preview) return;
    preview.hidden = !selectedOcrFiles.length;
    preview.innerHTML = selectedOcrFiles.map(function (file, index) {
      const source = selectedOcrSources[index] || sourceImageMetadata(file, index, "queued", "");
      const statusLabel = SOURCE_IMAGE_STATUS_LABELS[source.status] || "等待辨識";
      const sourceArgument = esc(JSON.stringify(source.sourceImageId));
      return '<div class="ocr-preview-thumb">'
        + '<button class="ocr-preview-open" type="button" onclick="PQC_FORM_OCR_UI.openOcrImagePreview(' + sourceArgument + ')" aria-label="放大查看來源第 ' + (source.sourceIndex + 1) + ' 張照片"><img src="' + esc(selectedOcrPreviewUrls[index]) + '" alt=""><span><b>來源 #' + (source.sourceIndex + 1) + '・' + esc(statusLabel) + '</b><small>' + esc(file.name) + '</small></span></button>'
        + '<button class="ocr-preview-remove" type="button" onclick="PQC_FORM_OCR_UI.removeSelectedOcrFile(' + index + ')" aria-label="移除第 ' + (index + 1) + ' 張照片">移除</button>'
        + '</div>';
    }).join("");
  }

  function removeSelectedOcrFile(index) {
    const safeIndex = Number(index);
    if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= selectedOcrFiles.length) return false;
    if (ocrBatchRunning) {
      if (typeof root.toast === "function") root.toast("照片正在辨識中，完成後再移除");
      return false;
    }
    const removedSource = selectedOcrSources[safeIndex];
    if (selectedOcrPreviewUrls[safeIndex]) URL.revokeObjectURL(selectedOcrPreviewUrls[safeIndex]);
    selectedOcrFiles.splice(safeIndex, 1);
    selectedOcrPreviewUrls.splice(safeIndex, 1);
    selectedOcrSources.splice(safeIndex, 1);
    if (removedSource) {
      ocrBatchDrafts = ocrBatchDrafts.filter(function (item) { return item.sourceImageId !== removedSource.sourceImageId; });
      ocrBatchIndex = Math.max(0, Math.min(ocrBatchIndex, ocrBatchDrafts.length - 1));
      if (ocrBatchDrafts.length) showOcrBatchDraft(ocrBatchIndex);
      else {
        currentDraft = null;
        const box = document.getElementById("ocrDraftBox");
        if (box) box.innerHTML = "";
      }
    }
    if (!selectedOcrFiles.length) nextSourceImageIndex = 0;
    renderSelectedOcrFiles();
    if (!selectedOcrFiles.length) setBrowserOcrStatus("尚未加入照片。可立即拍照或一次選取多張。", "warn");
    return true;
  }

  function selectBrowserImage(input) {
    const files = Array.from(input && input.files ? input.files : []);
    if (!files.length) return false;
    files.forEach(function (file) {
      const duplicate = selectedOcrFiles.some(function (existing) {
        return existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified;
      });
      if (duplicate) return;
      selectedOcrFiles.push(file);
      selectedOcrPreviewUrls.push(URL.createObjectURL(file));
      selectedOcrSources.push(sourceImageMetadata(file, nextSourceImageIndex, "queued", ""));
      nextSourceImageIndex += 1;
    });
    if (input) input.value = "";
    renderSelectedOcrFiles();
    setBrowserOcrStatus("照片已加入。可一次加入多張，系統會依序辨識並分張核對。", "ok");
    return true;
  }

  function friendlyOcrError(error) {
    const raw = error && error.message ? String(error.message) : "";
    if (/429|quota|resource exhausted/i.test(raw)) {
      return "雲端辨識目前已達使用上限，請稍後再試或改用文字貼上。";
    }
    if (/failed to fetch|network|load|fetch/i.test(raw)) {
      return "無法連線至雲端辨識服務，請確認網路後再試。";
    }
    if (/401|403|登入|token|permission/i.test(raw)) {
      return "登入或辨識權限已失效，請重新登入 Google 帳號後再試。";
    }
    return raw || "辨識失敗，請重新拍攝後再試";
  }

  async function firebaseIdToken() {
    const account = root.PQC_ACCOUNT;
    const user = account && typeof account.getUser === "function" ? account.getUser() : null;
    if (!user || typeof user.getIdToken !== "function") throw new Error("請先使用 Google 帳號登入，才能使用雲端圖片辨識");
    return user.getIdToken(false);
  }

  async function recognizeCloudImage(file, requestId) {
    const config = cloudOcrConfig();
    const endpoint = validCloudEndpoint(config.endpoint);
    if (!endpoint) throw new Error("雲端圖片辨識尚未完成設定");
    const consent = document.getElementById("cloudOcrConsent");
    if (!consent || !consent.checked) throw new Error("請先勾選同意本次將照片傳送至雲端辨識");
    const maxBytes = Number(config.maxUploadBytes) || 12 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error("照片超過 12 MB，請改用較小的原始照片");
    const token = await firebaseIdToken();
    const testCode = String(ocrVerificationCode || "");
    if (config.verification && config.verification.required !== false && !testCode) {
      throw new Error("請重新輸入 OCR 測試驗證碼");
    }
    const body = new FormData();
    body.append("image", file, file.name || "record-photo.jpg");
    body.append("request_id", String(requestId || cloudRequestId()));
    const headers = { Authorization: "Bearer " + token };
    if (testCode) headers["X-OCR-Test-Code"] = testCode;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(payload && payload.detail ? payload.detail : "雲端辨識服務暫時無法使用");
    if (!safePayload(payload)) throw new Error("雲端辨識結果格式不正確，未匯入任何資料");
    return payload;
  }

  async function recognizeBrowserImage() {
    if (!isOcrUnlocked()) {
      if (typeof root.toast === "function") root.toast("請先輸入 OCR 測試驗證碼");
      return false;
    }
    const cameraInput = document.getElementById("cloudVisionCamera");
    const fileInput = document.getElementById("cloudVisionFile");
    const confirmCorners = document.getElementById("cloudVisionConfirmCorners");
    const button = document.getElementById("cloudVisionRun");
    let queuedItems = selectedOcrFiles.map(function (file, index) {
      return { file, source: selectedOcrSources[index], previewIndex: index };
    }).filter(function (item) { return item.file && item.source; });
    if (!queuedItems.length) {
      const fallbackFiles = [cameraInput && cameraInput.files && cameraInput.files[0], fileInput && fileInput.files && fileInput.files[0]].filter(Boolean);
      fallbackFiles.forEach(function (file) {
        selectedOcrFiles.push(file);
        selectedOcrPreviewUrls.push(URL.createObjectURL(file));
        selectedOcrSources.push(sourceImageMetadata(file, nextSourceImageIndex, "queued", ""));
        nextSourceImageIndex += 1;
      });
      queuedItems = selectedOcrFiles.map(function (file, index) {
        return { file, source: selectedOcrSources[index], previewIndex: index };
      }).filter(function (item) { return item.file && item.source; });
      renderSelectedOcrFiles();
    }
    if (!queuedItems.length) {
      if (typeof root.toast === "function") root.toast("請先選擇或拍攝表單照片");
      return false;
    }
    if (!confirmCorners || !confirmCorners.checked) {
      if (typeof root.toast === "function") root.toast("請先確認主要表格與手寫內容仍可閱讀");
      return false;
    }
    if (button) button.disabled = true;
    ocrBatchRunning = true;
    ocrBatchDrafts = [];
    ocrBatchIndex = 0;
    queuedItems.forEach(function (item) {
      updateSelectedOcrSource(item.source.sourceImageId, "queued", "");
    });
    setOcrProgress(5, "準備辨識 " + queuedItems.length + " 張照片", true);
    setBrowserOcrStatus("正在準備雲端表單辨識…", "warn");
    try {
      if (activeOcrProvider() !== "google-cloud-vision") throw new Error("雲端表單辨識尚未完成設定");
      const failedFiles = [];
      let successCount = 0;
      for (let index = 0; index < queuedItems.length; index += 1) {
        const item = queuedItems[index];
        const file = item.file;
        const source = item.source;
        const start = 8 + (index / queuedItems.length) * 82;
        updateSelectedOcrSource(source.sourceImageId, "processing", "");
        setOcrProgress(start, "第 " + (index + 1) + " / " + queuedItems.length + " 張：安全傳送與辨識中", true);
        try {
          pendingRequestId = cloudRequestId();
          const payload = await recognizeCloudImage(file, pendingRequestId);
          if (!payload.blocks || !payload.blocks.length) throw new Error("沒有辨識到文字");
          if (!safePayload(payload)) throw new Error("結果未通過安全格式檢查");
          const recognizedSource = sourceImageMetadata(file, source.sourceIndex, "recognized", "");
          recognizedSource.sourceImageId = source.sourceImageId;
          const draft = createDraftWithSource(payload, recognizedSource);
          ocrBatchDrafts.push({
            sourceImageId: source.sourceImageId,
            fileName: file.name || ("第 " + (index + 1) + " 張照片"),
            sourceIndex: source.sourceIndex,
            previewIndex: item.previewIndex,
            status: "recognized",
            draft
          });
          successCount += 1;
          updateSelectedOcrSource(source.sourceImageId, "recognized", "");
        } catch (fileError) {
          const message = friendlyOcrError(fileError);
          failedFiles.push({ name: file.name || ("第 " + (index + 1) + " 張"), message });
          ocrBatchDrafts.push({
            sourceImageId: source.sourceImageId,
            fileName: file.name || ("第 " + (index + 1) + " 張照片"),
            sourceIndex: source.sourceIndex,
            previewIndex: item.previewIndex,
            status: "failed",
            error: message,
            draft: null
          });
          updateSelectedOcrSource(source.sourceImageId, "failed", message);
        }
        setOcrProgress(8 + ((index + 1) / queuedItems.length) * 82, "已完成 " + (index + 1) + " / " + queuedItems.length + " 張", true);
      }
      pendingRequestId = null;
      if (!successCount) {
        showOcrBatchDraft(0);
        throw new Error(failedFiles.length ? failedFiles[0].message : "沒有可供核對的辨識結果");
      }
      setOcrProgress(100, "全部辨識完成，請分張核對", true);
      showOcrBatchDraft(0);
      setBrowserOcrStatus("成功辨識 " + successCount + " 張" + (failedFiles.length ? "，另有 " + failedFiles.length + " 張未成功，可查看原圖後重試" : "") + "。請使用下方上一張／下一張逐張核對；系統尚未儲存任何紀錄。", failedFiles.length ? "warn" : "ok");
      return true;
    } catch (error) {
      const message = friendlyOcrError(error);
      setOcrProgress(100, "辨識未完成，請依提示重試", true);
      setBrowserOcrStatus(message, "bad");
      if (typeof root.toast === "function") root.toast(message);
      return false;
    } finally {
      pendingRequestId = null;
      ocrBatchRunning = false;
      if (button) button.disabled = false;
    }
  }

  function showOcrBatchDraft(index) {
    if (!ocrBatchDrafts.length) return false;
    ocrBatchIndex = Math.max(0, Math.min(ocrBatchDrafts.length - 1, Number(index) || 0));
    const item = ocrBatchDrafts[ocrBatchIndex];
    if (!item || item.status !== "recognized" || !item.draft) {
      renderFailedBatchDraft(item);
      return true;
    }
    renderDraft(item.draft);
    return true;
  }

  function parsePastedText() {
    if (!isOcrUnlocked()) {
      if (typeof root.toast === "function") root.toast("請先輸入 OCR 測試驗證碼");
      return false;
    }
    const input = document.getElementById("ocrPasteText");
    const text = input ? input.value.trim() : "";
    if (!text) {
      if (typeof root.toast === "function") root.toast("請先貼上表單辨識文字");
      return;
    }
    receiveScanResult({
      type: RESULT_TYPE,
      protocolVersion: 1,
      requestId: "paste-" + Date.now(),
      createdAt: new Date().toISOString(),
      quality: { width: 1600, height: 2200, documentCoverage: 1, sharpness: 1, glareRatio: 0, skewDegrees: 0, cornersDetected: true },
      blocks: [{ id: "paste-1", text: text, confidence: 1 }]
    });
  }

  function checked(id) {
    const element = document.getElementById(id);
    return Boolean(element && element.checked);
  }

  function selectedOrManual(selectId, manualId) {
    const manual = document.getElementById(manualId);
    const select = document.getElementById(selectId);
    return String((manual && manual.value) || (select && select.value) || "").trim();
  }

  function matchingPlotId(fieldCode, crop) {
    if (typeof fieldPlots === "undefined" || !Array.isArray(fieldPlots)) return "";
    const codeKey = matchKey(fieldCode);
    const cropKey = matchKey(crop);
    const matches = fieldPlots.filter(function (plot) {
      if (cropKey && matchKey(plot.crop || plot.name) !== cropKey) return false;
      if (!codeKey) return true;
      const labels = [plot.id, plot.code, plot.label, plot.name];
      if (typeof root.plotDisplayName === "function") labels.push(root.plotDisplayName(plot));
      return labels.some(function (label) {
        const key = matchKey(label);
        return key && (key === codeKey || key.includes(codeKey) || codeKey.includes(key));
      });
    });
    return matches.length === 1 ? matches[0].id : "";
  }

  function distinctRegistrationMatches(matches) {
    const seen = new Set();
    return (matches || []).filter(function (match) {
      const agent = match.agent || {};
      const key = [match.crop, match.pest, agent.name, agent.form, agent.dilution, agent.phi, agent.moa].map(matchKey).join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function validationMessage(validation, fallback) {
    if (!validation || !Array.isArray(validation.missing) || !validation.missing.length) return fallback || "尚有欄位需要確認";
    const labels = validation.missing.map(function (item) { return item.label || item.field; }).filter(Boolean);
    return "請先確認：" + Array.from(new Set(labels)).slice(0, 4).join("、");
  }

  function applyToPesticideRecord() {
    const date = selectedOrManual("ocrDateCandidate", "ocrDateManual");
    const crop = selectedOrManual("ocrCropCandidate", "ocrCropManual");
    const fieldCode = selectedOrManual("ocrFieldPlotCandidate", "ocrFieldPlotManual");
    const target = selectedOrManual("ocrTargetCandidate", "ocrTargetManual");
    const material = selectedOrManual("ocrMaterialCandidate", "ocrMaterialManual");
    const dilution = selectedOrManual("ocrDilutionCandidate", "");
    const safetyInterval = selectedOrManual("ocrSafetyCandidate", "ocrSafetyManual");
    if (!checked("ocrConfirmType") || !checked("ocrConfirmDate") || !checked("ocrConfirmCrop") || !checked("ocrConfirmMaterial")) {
      if (typeof root.toast === "function") root.toast("用藥紀錄請先核對類型、日期、作物與藥劑名稱");
      return;
    }
    const reviewValidation = root.PQC_FORM_OCR.validateDraftForReview(currentDraft, {
      recordType: "pesticide",
      date,
      crop,
      material,
      routeConfirmed: checked("ocrConfirmType")
    });
    if (!reviewValidation.ok) {
      if (typeof root.toast === "function") root.toast(validationMessage(reviewValidation, "照片品質或用藥必要欄位尚未通過"));
      return;
    }
    const matches = distinctRegistrationMatches(registeredPesticideMatches({ crop, target, material, dilution, safetyInterval }));
    if (!matches.length) {
      if (typeof root.toast === "function") root.toast("找不到完全相符的登記資料，請回查詢頁重新選擇藥劑，不能直接儲存 OCR 文字");
      return;
    }
    if (matches.length > 1) {
      if (typeof root.toast === "function") root.toast("這組作物與藥劑對到多筆登記，請補齊防治對象或稀釋倍數後再試");
      return;
    }
    const match = matches[0];
    const agent = match.agent;
    const plotId = matchingPlotId(fieldCode, match.crop);
    if (typeof root.openRecordModal !== "function") return;
    root.openRecordModal({
      crop: match.crop,
      agent: agent.name,
      phi: agent.phi,
      moa: agent.moa,
      pest: match.pest,
      dil: agent.dilution,
      water: "",
      plotId
    });
    setValue("rDate", date);
    setValue("rOperator", selectedOrManual("ocrOperatorCandidate", "ocrOperator"));
    if (typeof root.toast === "function") root.toast("已用正式登記資料帶入；請核對田區、日期及標示後再儲存");
  }

  function applyToFarmForm() {
    if (!currentDraft) return;
    const recordType = selectedOrManual("ocrRecordType", "");
    if (recordType === "pesticide") {
      applyToPesticideRecord();
      return;
    }
    const date = selectedOrManual("ocrDateCandidate", "ocrDateManual");
    const crop = selectedOrManual("ocrCropCandidate", "ocrCropManual");
    if (!checked("ocrConfirmType") || !checked("ocrConfirmDate")) {
      if (typeof root.toast === "function") root.toast("請先核對紀錄類型與日期");
      return;
    }
    const reviewValidation = root.PQC_FORM_OCR.validateDraftForReview(currentDraft, {
      recordType,
      date,
      crop,
      routeConfirmed: checked("ocrConfirmType")
    });
    if (!reviewValidation.ok) {
      if (typeof root.toast === "function") root.toast(validationMessage(reviewValidation, "照片品質或必要欄位尚未通過"));
      return;
    }
    if (typeof root.openRecordHub !== "function" || typeof root.renderFarmRecordBox !== "function") return;
    root.openRecordHub("farm");
    root.renderFarmRecordBox();
    setValue("farmType", recordType);
    setValue("farmDate", date);
    setValue("farmOperator", selectedOrManual("ocrOperatorCandidate", "ocrOperator"));
    let plotId = "";
    if (typeof fieldPlots !== "undefined" && Array.isArray(fieldPlots)) {
      plotId = matchingPlotId(selectedOrManual("ocrFieldPlotCandidate", "ocrFieldPlotManual"), crop);
      if (plotId) setValue("farmPlot", plotId);
    }
    if (typeof root.renderFarmDetailFields === "function") root.renderFarmDetailFields();
    const material = selectedOrManual("ocrMaterialCandidate", "ocrMaterialManual");
    if (material) setValue("farmMaterialName", material);
    const amount = selectedOrManual("ocrAmountCandidate", "");
    const amountMatch = amount.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (amountMatch) {
      setValue("farmQuantity", amountMatch[1]);
      setValue("farmUnit", amountMatch[2]);
    }
    const dilution = selectedOrManual("ocrDilutionCandidate", "");
    if (dilution && document.getElementById("farmNotes")) document.getElementById("farmNotes").value = "表單辨識到稀釋 " + dilution + " 倍；請核對後補入適當欄位。";
    const strictFields = {
      recordType,
      date,
      crop,
      plotId,
      details: {
        materialName: material,
        quantity: amountMatch ? amountMatch[1] : "",
        unit: amountMatch ? amountMatch[2] : ""
      }
    };
    const strictValidation = root.PQC_FORM_OCR.validateConfirmedFields(strictFields);
    const remaining = strictValidation.missing.map(function (item) { return item.label; }).filter(Boolean);
    if (typeof root.toast === "function") {
      root.toast(remaining.length
        ? "已帶入可辨識欄位；請再補：" + Array.from(new Set(remaining)).slice(0, 4).join("、")
        : "草稿已帶入，請再次核對後再儲存");
    }
  }

  function applyEquipmentMaintenanceBatch() {
    if (!currentDraft || !checked("ocrConfirmEquipmentRows")) {
      if (typeof root.toast === "function") root.toast("請先逐筆核對日期、設備與作業內容");
      return false;
    }
    const rowElements = Array.from(document.querySelectorAll("#ocrEquipmentRows [data-ocr-equipment-row]"));
    const rows = rowElements.map(function (row) {
      return {
        date: String((row.querySelector(".ocr-equipment-date") || {}).value || "").trim(),
        operator: String((row.querySelector(".ocr-equipment-operator") || {}).value || "").trim(),
        equipment: Array.from(row.querySelectorAll("[data-ocr-equipment-item]:checked")).map(function (input) { return input.value; }),
        actions: Array.from(row.querySelectorAll("[data-ocr-equipment-action]:checked")).map(function (input) { return input.value; }),
        notes: String((row.querySelector(".ocr-equipment-notes") || {}).value || "").trim()
      };
    }).map(function (row, index) {
      const source = rowElements[index];
      const otherEquipment = String((source.querySelector(".ocr-equipment-other") || {}).value || "").trim();
      const otherAction = String((source.querySelector(".ocr-equipment-other-action") || {}).value || "").trim();
      if (otherEquipment) row.equipment.push(otherEquipment);
      if (otherAction) row.actions.push(otherAction);
      return row;
    });
    if (!rows.length || rows.some(function (row) { return !row.date || !row.equipment.length || !row.actions.length; })) {
      if (typeof root.toast === "function") root.toast("每一筆都需要日期、至少一項設備與一項作業內容");
      return false;
    }
    if (typeof root.openRecordHub !== "function" || typeof root.renderFarmRecordBox !== "function" || typeof root.loadEquipmentBatchDraft !== "function") return false;
    root.openRecordHub("farm");
    root.renderFarmRecordBox();
    if (!root.loadEquipmentBatchDraft(rows)) return false;
    if (typeof root.toast === "function") root.toast("已帶入 " + rows.length + " 筆設備管理草稿，請再次核對後一次儲存");
    return true;
  }

  function csvCell(value) {
    let safe = String(value == null ? "" : value);
    if (/^[\s]*[=+\-@]/.test(safe)) safe = "'" + safe;
    return '"' + safe.replace(/"/g, '""') + '"';
  }

  function exportSelfInspectionDraft() {
    if (!currentDraft || !currentDraft.selfInspection || !checked("ocrConfirmSelfInspection")) {
      if (typeof root.toast === "function") root.toast("請先逐列核對，無法確定的項目請保留未判定");
      return false;
    }
    const statusLabels = { unresolved: "未判定", compliant: "符合", noncompliant: "不符合", "not-applicable": "不適用" };
    const rows = [["文件類型", "章節", "確認日期", "查核者", "項目代碼", "查核項目", "結果", "備註", "辨識說明"]];
    Array.from(document.querySelectorAll("#ocrSelfInspectionSections [data-self-section]")).forEach(function (section) {
      const sectionName = String(section.dataset.sectionCode || "") + " " + String(section.dataset.sectionTitle || "");
      const date = String((section.querySelector(".ocr-self-date") || {}).value || "");
      const inspector = String((section.querySelector(".ocr-self-inspector") || {}).value || "");
      Array.from(section.querySelectorAll("[data-self-item]")).forEach(function (item) {
        const status = String((item.querySelector(".ocr-self-status") || {}).value || "unresolved");
        const note = String((item.querySelector(".ocr-self-note") || {}).value || "").trim();
        const evidence = String((item.querySelector(".ocr-self-item-copy small") || {}).textContent || "").trim();
        rows.push([
          currentDraft.selfInspection.title,
          sectionName.trim(), date, inspector,
          item.dataset.itemCode || "", item.dataset.itemTitle || "",
          statusLabels[status] || "未判定", note, evidence
        ]);
      });
    });
    const unresolved = rows.slice(1).filter(function (row) { return row[6] === "未判定"; }).length;
    const csv = "\uFEFF" + rows.map(function (row) { return row.map(csvCell).join(","); }).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "噴前查_自我查核草稿_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (typeof root.toast === "function") root.toast("已下載查核草稿" + (unresolved ? "；仍有 " + unresolved + " 項未判定" : ""));
    return true;
  }

  function addMaterialInventoryRow() {
    const container = document.getElementById("ocrInventoryRows");
    if (!container || !currentDraft || !currentDraft.materialInventory) return false;
    const index = container.querySelectorAll("[data-inventory-row]").length;
    container.insertAdjacentHTML("beforeend", materialInventoryRowHtml(index, currentDraft.materialInventory));
    return true;
  }

  function exportMaterialInventoryDraft() {
    if (!currentDraft || !currentDraft.materialInventory || !checked("ocrConfirmMaterialInventory")) {
      if (typeof root.toast === "function") root.toast("請先對照原圖核對資材與每筆進出庫數量");
      return false;
    }
    const rows = [["文件類型", "資材名稱", "廠商", "供應商", "包裝容量", "日期", "購入量", "使用量", "剩餘量", "單位", "L3狀態"]];
    Array.from(document.querySelectorAll("#ocrInventoryRows [data-inventory-row]")).forEach(function (row) {
      function rowValue(selectClass, inputClass) {
        const manual = row.querySelector(inputClass);
        const selected = row.querySelector(selectClass);
        return String(manual && manual.value || selected && selected.value || "").trim();
      }
      rows.push([
        "肥料／資材入出庫草稿",
        rowValue(".ocr-inventory-material", ".ocr-inventory-material-manual"),
        rowValue(".ocr-inventory-manufacturer", ".ocr-inventory-manufacturer-manual"),
        rowValue(".ocr-inventory-supplier", ".ocr-inventory-supplier-manual"),
        rowValue(".ocr-inventory-capacity", ".ocr-inventory-capacity-manual"),
        String((row.querySelector(".ocr-inventory-date") || {}).value || ""),
        String((row.querySelector(".ocr-inventory-purchase") || {}).value || ""),
        String((row.querySelector(".ocr-inventory-used") || {}).value || ""),
        String((row.querySelector(".ocr-inventory-remaining") || {}).value || ""),
        String((row.querySelector(".ocr-inventory-unit") || {}).value || ""),
        "待確認正式欄位規格"
      ]);
    });
    if (rows.length < 2 || rows.slice(1).some(function (row) { return !row[1]; })) {
      if (typeof root.toast === "function") root.toast("每一筆都需要確認資材名稱");
      return false;
    }
    const csv = "\uFEFF" + rows.map(function (row) { return row.map(csvCell).join(","); }).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "噴前查_資材庫存草稿_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (typeof root.toast === "function") root.toast("已下載資材庫存草稿；尚未送入 L3");
    return true;
  }

  function removeEquipmentDraftRow(button) {
    const row = button && button.closest ? button.closest("[data-ocr-equipment-row]") : null;
    if (row) row.remove();
    const rows = Array.from(document.querySelectorAll("#ocrEquipmentRows [data-ocr-equipment-row]"));
    rows.forEach(function (item, index) {
      const label = item.querySelector(".ocr-equipment-row-head b");
      if (label) label.textContent = "第 " + (index + 1) + " 筆";
    });
    if (!rows.length && typeof root.toast === "function") root.toast("已排除所有辨識列；請返回手動新增設備紀錄");
    return Boolean(rows.length);
  }

  function installStyle() {
    const style = document.createElement("style");
    style.textContent = ".ocr-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:var(--shadow)}.ocr-card h3{font-size:19px;color:var(--green-deep);margin:0 0 6px}.ocr-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.ocr-browser-import{border:1px solid var(--orange);background:color-mix(in srgb,var(--orange) 9%,var(--card));border-radius:15px;padding:15px;margin:14px 0;display:grid;gap:11px}.ocr-browser-import input[type=file]{width:100%;padding:10px;background:var(--card);border:1px solid var(--line);border-radius:11px}.ocr-browser-import label{font-weight:800}.ocr-browser-note{font-size:13px;color:var(--muted);line-height:1.6}.ocr-paste{border-top:1px solid var(--line);padding-top:15px}.ocr-paste textarea,.ocr-review textarea{min-height:110px}.ocr-status[hidden]{display:none}.ocr-status{border-radius:13px;padding:13px 15px;margin:14px 0;display:grid;gap:4px}.ocr-status.ok{background:var(--ok-bg);color:var(--green-deep)}.ocr-status.warn{background:#fff4d6;color:#6f4b00}.ocr-status.bad{background:#fff0ed;color:#982d20}.ocr-status ul{margin:5px 0 0;padding-left:20px}.ocr-review{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ocr-review .field{display:grid;gap:6px}.ocr-review .field input,.ocr-review .field select{width:100%}.ocr-review .field select+input{margin-top:6px}.ocr-review .wide{grid-column:1/-1}.ocr-confirm{border:1px solid var(--line);border-radius:13px;padding:12px;display:grid;gap:8px}.ocr-confirm legend{font-weight:900;color:var(--green-deep);padding:0 5px}.ocr-confirm label{font-weight:700}.ocr-source-title{font-size:14px;font-weight:900;color:var(--green-deep);margin:2px 0 0}.ocr-source-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ocr-source-button{position:relative;min-height:92px;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:13px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center;cursor:pointer;transition:border-color .18s,transform .18s,background .18s}.ocr-source-button:hover{border-color:var(--orange);transform:translateY(-1px)}.ocr-source-button input{position:absolute;opacity:0;pointer-events:none}.ocr-source-button:has(input:focus-visible){outline:3px solid color-mix(in srgb,var(--orange) 35%,transparent);outline-offset:2px}.ocr-source-icon{width:32px;height:32px;color:var(--orange);display:grid;place-items:center}.ocr-source-icon svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.ocr-source-button b{font-size:15px;color:var(--green-deep)}.ocr-source-button small{font-size:12px;color:var(--muted)}.ocr-selected-file{margin:0;padding:9px 11px;border-radius:10px;background:color-mix(in srgb,var(--green) 10%,var(--card));color:var(--green-deep);font-size:12px;font-weight:800;overflow-wrap:anywhere}.ocr-quality-confirm,.ocr-cloud-consent{position:relative;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:13px;display:grid!important;grid-template-columns:34px 1fr;gap:11px;align-items:center;cursor:pointer}.ocr-quality-confirm input{position:absolute;opacity:0;pointer-events:none}.ocr-quality-check{width:32px;height:32px;border:2px solid var(--line);border-radius:10px;display:grid;place-items:center;color:transparent;background:var(--paper);font-size:20px;font-weight:900;transition:.18s}.ocr-quality-copy{display:grid;gap:4px}.ocr-quality-copy b{color:var(--green-deep);font-size:15px}.ocr-quality-copy span{color:var(--muted);font-size:12px;font-weight:700}.ocr-quality-confirm:has(input:checked){border-color:var(--green);background:color-mix(in srgb,var(--green) 8%,var(--card))}.ocr-quality-confirm:has(input:checked) .ocr-quality-check{border-color:var(--green);background:var(--green);color:white}.ocr-quality-confirm:has(input:focus-visible){outline:3px solid color-mix(in srgb,var(--orange) 35%,transparent);outline-offset:2px}.ocr-cloud-consent{grid-template-columns:22px 1fr}.ocr-cloud-consent input{width:20px;height:20px;accent-color:var(--green)}.ocr-cloud-consent span{display:grid;gap:3px}.ocr-cloud-consent b{color:var(--green-deep)}.ocr-cloud-consent small{color:var(--muted);font-weight:600;line-height:1.5}@media(max-width:620px){.ocr-actions,.ocr-review{grid-template-columns:1fr}.ocr-review .wide{grid-column:auto}}";
    style.textContent += ".ocr-gate{border:1px solid var(--orange);background:color-mix(in srgb,var(--orange) 8%,var(--card));border-radius:16px;padding:18px;display:grid;gap:10px}.ocr-gate h3{margin:0;color:var(--green-deep)}.ocr-gate p{margin:0;color:var(--muted);line-height:1.6}.ocr-gate-row{display:grid;grid-template-columns:1fr auto;gap:10px}.ocr-gate-row input{min-width:0;width:100%;border:1px solid var(--line);border-radius:11px;padding:12px;background:var(--card);font-size:16px}.ocr-gate-status{margin:0}.ocr-gate-warning{font-size:12px;color:var(--muted)}.ocr-equipment-intro{display:grid;gap:4px;margin:14px 0;padding:13px;border-radius:13px;background:var(--ok-bg);color:var(--green-deep)}.ocr-equipment-intro span{font-size:13px;line-height:1.55}.ocr-equipment-rows{display:grid;gap:12px}.ocr-equipment-row{border:1px solid var(--line);border-radius:14px;padding:13px;background:var(--card);display:grid;grid-template-columns:1fr 1fr;gap:10px}.ocr-equipment-row-head{grid-column:1/-1;display:flex;justify-content:space-between;gap:10px}.ocr-equipment-row-head b{color:var(--green-deep)}.ocr-equipment-row-head span{font-size:12px;color:var(--muted)}.ocr-quality-confirm,.ocr-cloud-consent{grid-template-columns:36px 1fr;padding:14px;min-height:78px}.ocr-cloud-consent input{position:absolute;opacity:0;pointer-events:none}.ocr-cloud-consent:has(input:checked){border-color:var(--green);background:color-mix(in srgb,var(--green) 8%,var(--card))}.ocr-cloud-consent:has(input:checked) .ocr-quality-check{border-color:var(--green);background:var(--green);color:#fff}.ocr-preview-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ocr-preview-thumb{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:7px;display:grid;gap:6px;text-align:left;min-width:0}.ocr-preview-thumb img{width:100%;height:76px;object-fit:cover;border-radius:8px;background:var(--paper)}.ocr-preview-thumb span{display:grid;min-width:0}.ocr-preview-thumb b{font-size:12px;color:var(--green-deep)}.ocr-preview-thumb small{font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ocr-preview-modal{position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.82);padding:18px;display:grid;grid-template-rows:auto 1fr;gap:12px}.ocr-preview-modal[hidden]{display:none}.ocr-preview-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#fff}.ocr-preview-modal-head button{min-width:48px}.ocr-preview-modal img{width:100%;height:100%;object-fit:contain;min-height:0}.ocr-progress{display:grid;gap:7px;border:1px solid var(--line);border-radius:13px;padding:12px;background:var(--card)}.ocr-progress[hidden]{display:none}.ocr-progress-track{height:10px;border-radius:999px;background:color-mix(in srgb,var(--green) 12%,var(--paper));overflow:hidden}.ocr-progress-bar{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,var(--green),var(--orange));transition:width .25s ease}.ocr-progress span{font-size:12px;font-weight:800;color:var(--green-deep)}.ocr-batch-nav{margin:14px 0;border:1px solid var(--orange);border-radius:14px;padding:12px;background:color-mix(in srgb,var(--orange) 7%,var(--card));display:grid;gap:10px}.ocr-batch-nav>div:first-child{display:grid;gap:3px}.ocr-batch-nav b{color:var(--green-deep)}.ocr-batch-nav span{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.ocr-source-status{justify-self:start;border-radius:999px;padding:3px 8px;background:var(--paper);color:var(--muted);font-size:11px;font-weight:900}.ocr-source-status[data-status=recognized]{background:var(--ok-bg);color:var(--green-deep)}.ocr-source-status[data-status=failed]{background:#fff0ed;color:#982d20}.ocr-source-status[data-status=processing]{background:#fff4d6;color:#6f4b00}.ocr-batch-nav-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}.ocr-reference-review{display:grid;gap:12px}.ocr-reference-title{display:grid;gap:5px;padding:14px;border-radius:13px;background:var(--ok-bg);color:var(--green-deep)}.ocr-reference-title span{font-size:13px;line-height:1.6}.ocr-reference-summary{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ocr-reference-summary div{border:1px solid var(--line);border-radius:12px;padding:11px;display:grid;gap:4px}.ocr-reference-summary span{font-size:12px;color:var(--muted)}.ocr-reference-summary b{font-size:14px;color:var(--green-deep)}@media(max-width:620px){.ocr-gate-row,.ocr-equipment-row,.ocr-reference-summary{grid-template-columns:1fr}.ocr-equipment-row-head{grid-column:auto}.ocr-preview-list{grid-template-columns:repeat(2,minmax(0,1fr))}.ocr-batch-nav-actions{grid-template-columns:1fr 1fr}.ocr-batch-nav-actions button:nth-child(2){grid-column:1/-1;grid-row:2}}";
    style.textContent += ".ocr-self-sections{display:grid;gap:14px}.ocr-self-section{border:1px solid var(--line);border-radius:15px;background:var(--card);padding:13px;display:grid;gap:12px}.ocr-self-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.ocr-self-section-head>div{display:grid;gap:3px}.ocr-self-section-head b{color:var(--green-deep)}.ocr-self-section-head span{font-size:12px;color:var(--muted)}.ocr-self-meta{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ocr-self-meta label,.ocr-self-item label{display:grid;gap:5px;font-size:12px;font-weight:800;color:var(--muted)}.ocr-self-meta input,.ocr-self-item input,.ocr-self-item select{width:100%}.ocr-self-items{display:grid;gap:8px}.ocr-self-item{border-top:1px solid var(--line);padding-top:10px;display:grid;grid-template-columns:minmax(180px,1.5fr) minmax(100px,.6fr) minmax(150px,1fr);gap:9px;align-items:end}.ocr-self-item-copy{display:grid;gap:3px}.ocr-self-item-copy b{color:var(--orange)}.ocr-self-item-copy span{font-weight:800;color:var(--green-deep)}.ocr-self-item-copy small{font-size:11px;color:var(--muted)}.ocr-raw-details{border:1px solid var(--line);border-radius:13px;padding:11px}.ocr-raw-details summary{cursor:pointer;font-weight:800;color:var(--green-deep)}.ocr-raw-details textarea{width:100%;min-height:150px;margin-top:10px}@media(max-width:720px){.ocr-self-item{grid-template-columns:1fr 1fr}.ocr-self-item-copy{grid-column:1/-1}.ocr-self-meta{grid-template-columns:1fr}}";
    style.textContent += ".ocr-preview-open{border:0;background:transparent;padding:0;display:grid;gap:6px;text-align:left;min-width:0;width:100%;cursor:pointer}.ocr-preview-remove{border:0;border-top:1px solid var(--line);background:transparent;color:var(--muted);font-size:11px;font-weight:800;padding:6px 2px 0;cursor:pointer}.ocr-preview-remove:hover{color:#982d20}.ocr-inventory-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ocr-inventory-meta label,.ocr-inventory-row label{display:grid;gap:5px;font-size:12px;font-weight:800;color:var(--muted)}.ocr-inventory-meta select,.ocr-inventory-meta input,.ocr-inventory-row input{width:100%}.ocr-inventory-meta select+input{margin-top:5px}.ocr-inventory-toolbar,.ocr-inventory-row-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.ocr-inventory-toolbar b,.ocr-inventory-row-head b{color:var(--green-deep)}.ocr-inventory-rows{display:grid;gap:10px}.ocr-inventory-row{border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--card);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}.ocr-inventory-row-head{grid-column:1/-1}@media(max-width:720px){.ocr-inventory-meta{grid-template-columns:1fr}.ocr-inventory-row{grid-template-columns:1fr 1fr}.ocr-inventory-row-head{grid-column:1/-1}}";
    document.head.appendChild(style);
  }

  function installPanel(releaseState) {
    const menu = document.querySelector(".record-hub-menu");
    const records = document.getElementById("scr-records");
    if (!menu || !records || document.getElementById("recordPanelOcr")) return;
    const developing = releaseState === "development";
    const ocrHeading = "雲端表單辨識（測試中）";
    const cloudConsent = '<label class="ocr-cloud-consent"><input id="cloudOcrConsent" type="checkbox"><span class="ocr-quality-check" aria-hidden="true">✓</span><span class="ocr-quality-copy"><b>同意本次雲端辨識</b><span>照片會逐張加密傳送至噴前查後端，再交由第三方雲端辨識服務處理；目前設計不保存原始照片。</span></span></label><details class="ocr-raw-details"><summary>資料處理服務說明</summary><p class="ocr-browser-note">目前辨識處理服務為 Google Cloud Vision。照片只會在您主動勾選並送出後傳送；詳細內容請參閱隱私權政策。</p></details>';
    const ocrRunLabel = "開始雲端辨識（測試中）";
    const ocrNote = "辨識運算在雲端進行，不占用手機載入模型的記憶體。此功能需要 Google 登入及網路；照片只在你勾選同意並按下按鈕後傳送。";
    const gateLabel = developing ? "04・測試中／開發中" : "04・辨識";
    const headingTag = developing ? ' <span class="plot-tag">測試中・開發中</span>' : "";
    const entryCopy = "一次選擇一張或多張照片，辨識後逐張核對；系統不會自動儲存。";
    menu.insertAdjacentHTML("beforeend", '<button class="record-hub-button" type="button" onclick="openRecordHub(\'ocr\')" aria-controls="recordPanelOcr"><span class="record-hub-index" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M5 11h6l2-3h6l2 3h6v15H5Z"/><circle cx="16" cy="18.5" r="5"/><path d="M23 14h1"/></svg></span><span class="record-hub-copy"><span class="record-hub-label">' + gateLabel + '</span><b>拍攝表單建立草稿</b><small>' + entryCopy + '</small></span><span class="record-hub-arrow" aria-hidden="true">›</span></button>');
    records.insertAdjacentHTML("beforeend", `
      <section class="record-hub-panel" id="recordPanelOcr" data-record-panel="ocr" hidden>
        <button class="record-hub-back" type="button" onclick="showRecordHub()"><span class="record-hub-back-icon" aria-hidden="true">←</span><span>返回紀錄首頁</span></button>
        <div class="record-hub-panel-head"><h2>拍攝表單建立草稿${headingTag}</h2><p>適合把既有紙本紀錄先辨識成草稿。這項功能仍在測試，辨識結果必須逐欄人工確認。</p></div>
        <div class="ocr-gate" id="ocrVerificationGate">
          <h3>雲端表單辨識測試驗證</h3>
          <p>這是尚未公開的 OCR 測試功能。請輸入指定驗證碼後，才會顯示照片辨識工具。</p>
          <div class="ocr-gate-row"><input id="ocrVerificationCode" type="password" autocomplete="off" placeholder="輸入測試驗證碼" aria-label="OCR 測試驗證碼"><button class="btn btn-main" type="button" onclick="PQC_FORM_OCR_UI.unlockOcr()">解鎖測試功能</button></div>
          <div id="ocrVerificationStatus" class="ocr-status ocr-gate-status" role="status" aria-live="polite" hidden></div>
          <small class="ocr-gate-warning">這是測試中、開發中的限制功能。驗證碼只代表測試入口，不取代 Google 登入、雲端同意與後端安全檢查。</small>
        </div>
        <div class="ocr-card" id="ocrVisionLockedContent" hidden>
          <h3>${ocrHeading}</h3>
          <p class="farm-note">可拍整本紀錄、跨頁表格或帶有背景的照片，也可一次加入多張。系統會逐張辨識、分張核對；只要主要內容可閱讀即可，不會自動儲存。</p>
          <div class="ocr-browser-import">
            <p class="ocr-source-title">選擇照片來源</p>
            <div class="ocr-source-actions">
              <label class="ocr-source-button">
                <input id="cloudVisionCamera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onchange="PQC_FORM_OCR_UI.selectBrowserImage(this)">
                <span class="ocr-source-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M5 11h6l2-3h6l2 3h6v15H5Z"/><circle cx="16" cy="18.5" r="5"/></svg></span>
                <b>立即拍照</b><small>開啟手機相機</small>
              </label>
              <label class="ocr-source-button">
                <input id="cloudVisionFile" type="file" accept="image/jpeg,image/png,image/webp" multiple onchange="PQC_FORM_OCR_UI.selectBrowserImage(this)">
                <span class="ocr-source-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M4 9h9l2 3h13v14H4Z"/><path d="M4 12h24"/></svg></span>
                <b>選擇照片</b><small>可一次選取多張</small>
              </label>
            </div>
            <p id="cloudVisionSelected" class="ocr-selected-file" hidden></p>
            <div id="cloudVisionPreviewList" class="ocr-preview-list" hidden></div>
            <label class="ocr-quality-confirm">
              <input id="cloudVisionConfirmCorners" type="checkbox">
              <span class="ocr-quality-check" aria-hidden="true">✓</span>
              <span class="ocr-quality-copy"><b>主要內容可閱讀</b><span>表格與手寫內容未被遮住；可包含書本邊緣、跨頁或背景</span></span>
            </label>
            ${cloudConsent}
            <button class="btn btn-main" id="cloudVisionRun" type="button" onclick="PQC_FORM_OCR_UI.recognizeBrowserImage()">${ocrRunLabel}</button>
            <div id="cloudVisionProgress" class="ocr-progress" role="progressbar" aria-label="照片辨識進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><div class="ocr-progress-track"><div id="cloudVisionProgressBar" class="ocr-progress-bar"></div></div><span id="cloudVisionProgressText">準備辨識</span></div>
            <p class="ocr-browser-note">${ocrNote}</p>
          </div>
          <div id="cloudVisionStatus" class="ocr-status warn" role="status" aria-live="polite" hidden></div>
          <div id="ocrDraftBox"></div>
        </div>
        <div id="ocrImagePreviewModal" class="ocr-preview-modal" role="dialog" aria-modal="true" aria-labelledby="ocrImagePreviewTitle" hidden><div class="ocr-preview-modal-head"><b id="ocrImagePreviewTitle">查看待辨識照片</b><button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.closeOcrImagePreview()">關閉</button></div><img id="ocrImagePreviewLarge" alt=""></div>
      </section>
    `);
    applyOcrVerificationState();
  }

  function init() {
    if (!root.document || !root.PQC_FORM_OCR) return;
    const releaseState = featureReleaseState("formOcr");
    if (releaseState === "hidden") return;
    installStyle();
    installPanel(releaseState);
    root.addEventListener("message", function (event) {
      if (TRUSTED_ORIGINS.indexOf(event.origin) < 0) return;
      if (event.origin === "android://tw.searchbefore.app" && typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") {
        root.dispatchEvent(new root.CustomEvent("pqc:android-app-context"));
      }
      if (event.ports && event.ports[0]) {
        twaPort = event.ports[0];
        if (typeof twaPort.start === "function") twaPort.start();
        twaPort.onmessage = function (portEvent) {
          let portData = portEvent.data;
          if (typeof portData === "string") {
            try { portData = JSON.parse(portData); } catch (_) { return; }
          }
          if (portData && portData.type === RESULT_TYPE) receiveScanResult(portData.payload || portData);
        };
        twaPort.postMessage(JSON.stringify({ type: "PQC_OCR_WEB_READY", protocolVersion: 1 }));
      }
      let data = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch (_) { return; }
      }
      if (data && data.type === RESULT_TYPE) receiveScanResult(data.payload || data);
    });
  }

  if (root.document) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else setTimeout(init, 0);
  }

  return Object.freeze({
    RESULT_TYPE,
    REQUEST_TYPE,
    TRUSTED_ORIGINS,
    RELEASE_STATES,
    SOURCE_IMAGE_STATUSES,
    featureReleaseState,
    validCloudEndpoint,
    activeOcrProvider,
    cloudRequestId,
    isOcrUnlocked,
    unlockOcr,
    safePayload,
    sourceImageId,
    sourceImageMetadata,
    sanitizeSourceImageMetadata,
    attachSourceImageMetadata,
    matchKey,
    registeredPesticideMatches,
    receiveScanResult,
    requestNativeScan,
    selectBrowserImage,
    removeSelectedOcrFile,
    openOcrImagePreview,
    closeOcrImagePreview,
    recognizeCloudImage,
    recognizeBrowserImage,
    showOcrBatchDraft,
    parsePastedText,
    applyToPesticideRecord,
    applyToFarmForm,
    applyEquipmentMaintenanceBatch,
    exportSelfInspectionDraft,
    addMaterialInventoryRow,
    exportMaterialInventoryDraft,
    removeEquipmentDraftRow,
    init
  });
});
