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
  let currentDraft = null;
  let twaPort = null;
  let pendingRequestId = null;
  let selectedOcrFile = null;
  let ocrVerificationCode = "";

  const RECORD_TYPE_LABELS = Object.freeze({
    pesticide: "病蟲害防治／用藥",
    cultivation: "栽培作業",
    fertilizer: "施肥",
    harvest: "採收",
    postharvest: "採後處理",
    purchase: "資材購入"
  });

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
    if (serialized.length > 350000 || /data:image|base64|imageUri|imageData/i.test(serialized)) return null;
    if (value.type !== RESULT_TYPE || Number(value.protocolVersion) !== 1) return null;
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(String(value.requestId || ""))) return null;
    if (!Array.isArray(value.blocks)) return null;
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
    const detected = new Map((items || []).map(function (item) { return [item.value, item]; }));
    return '<option value="">請選擇</option>' + Object.keys(RECORD_TYPE_LABELS).map(function (value) {
      const item = detected.get(value);
      return '<option value="' + value + '">' + esc(RECORD_TYPE_LABELS[value] + (item ? "（辨識候選）" : "")) + '</option>';
    }).join("");
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

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value == null ? "" : value;
  }

  function renderDraft(draft) {
    currentDraft = draft;
    const box = document.getElementById("ocrDraftBox");
    if (!box) return;
    const text = draft.blocks.map(function (block) { return block.text; }).join("\n");
    box.innerHTML = qualityHtml(draft.quality)
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
      + '<fieldset class="ocr-confirm wide"><legend>帶入前必須確認</legend><label><input id="ocrConfirmType" type="checkbox"> 紀錄類型已核對</label><label><input id="ocrConfirmDate" type="checkbox"> 日期已核對</label><label><input id="ocrConfirmCrop" type="checkbox"> 作物已核對</label><label><input id="ocrConfirmMaterial" type="checkbox"> 藥劑／資材名稱已核對</label></fieldset>'
      + '<button class="btn btn-main wide" type="button" onclick="PQC_FORM_OCR_UI.applyToFarmForm()"' + (draft.quality.canProcess ? "" : " disabled") + '>帶入紀錄表單並繼續確認</button>'
      + '<p class="disclaimer wide">辨識結果只是草稿。系統不會自動儲存；帶入後仍須在原本的作業紀錄表單再次確認並按下儲存。</p>'
      + '</div>';
    if (draft.fields.date.length) {
      setValue("ocrDateCandidate", draft.fields.date[0].value);
      setValue("ocrDateManual", draft.fields.date[0].value);
    }
    if (draft.fields.recordType.length && RECORD_TYPE_LABELS[draft.fields.recordType[0].value]) setValue("ocrRecordType", draft.fields.recordType[0].value);
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
    renderDraft(root.PQC_FORM_OCR.createDraft(safe, dictionaries()));
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

  function selectBrowserImage(input) {
    const file = input && input.files && input.files[0];
    if (!file) return false;
    selectedOcrFile = file;
    ["cloudVisionCamera", "cloudVisionFile"].forEach(function (id) {
      const other = document.getElementById(id);
      if (other && other !== input) other.value = "";
    });
    const label = document.getElementById("cloudVisionSelected");
    if (label) {
      label.hidden = false;
      label.textContent = "已選擇：" + file.name;
    }
    setBrowserOcrStatus("照片已選擇，確認品質後即可開始辨識。", "ok");
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
    setBrowserOcrStatus("正在安全傳送照片並進行雲端辨識…", "warn");
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
    const file = selectedOcrFile
      || (cameraInput && cameraInput.files && cameraInput.files[0])
      || (fileInput && fileInput.files && fileInput.files[0]);
    if (!file) {
      if (typeof root.toast === "function") root.toast("請先選擇或拍攝表單照片");
      return false;
    }
    if (!confirmCorners || !confirmCorners.checked) {
      if (typeof root.toast === "function") root.toast("請先確認照片完整拍到表單四個角");
      return false;
    }
    if (button) button.disabled = true;
    setBrowserOcrStatus("正在準備 Google Cloud Vision 雲端辨識…", "warn");
    try {
      if (activeOcrProvider() !== "google-cloud-vision") throw new Error("Google Cloud Vision 尚未完成正式設定");
      pendingRequestId = cloudRequestId();
      const payload = await recognizeCloudImage(file, pendingRequestId);
      if (!payload.blocks || !payload.blocks.length) throw new Error("沒有辨識到文字，請靠近表單並避免反光後重拍");
      if (!receiveScanResult(payload)) throw new Error("辨識結果未通過安全格式檢查");
      setBrowserOcrStatus("辨識完成。請逐欄核對下方草稿，系統尚未儲存任何紀錄。", "ok");
      return true;
    } catch (error) {
      const message = friendlyOcrError(error);
      setBrowserOcrStatus(message, "bad");
      if (typeof root.toast === "function") root.toast(message);
      return false;
    } finally {
      if (button) button.disabled = false;
    }
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
    if (!root.PQC_FORM_OCR.canCommit(currentDraft, { recordType: "pesticide", date, crop, material })) {
      if (typeof root.toast === "function") root.toast("照片品質或用藥必要欄位尚未通過");
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
    if (!checked("ocrConfirmType") || !checked("ocrConfirmDate") || !checked("ocrConfirmCrop")) {
      if (typeof root.toast === "function") root.toast("請先勾選三個已核對項目");
      return;
    }
    if (!root.PQC_FORM_OCR.canCommit(currentDraft, { recordType: recordType, date: date, crop: crop })) {
      if (typeof root.toast === "function") root.toast("照片品質或必要欄位尚未通過");
      return;
    }
    if (typeof root.openRecordHub !== "function" || typeof root.renderFarmRecordBox !== "function") return;
    root.openRecordHub("farm");
    root.renderFarmRecordBox();
    setValue("farmType", recordType);
    setValue("farmDate", date);
    setValue("farmOperator", selectedOrManual("ocrOperatorCandidate", "ocrOperator"));
    if (typeof fieldPlots !== "undefined" && Array.isArray(fieldPlots)) {
      const plotId = matchingPlotId(selectedOrManual("ocrFieldPlotCandidate", "ocrFieldPlotManual"), crop);
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
    if (typeof root.toast === "function") root.toast("草稿已帶入，請再次核對後再儲存");
  }

  function installStyle() {
    const style = document.createElement("style");
    style.textContent = ".ocr-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:var(--shadow)}.ocr-card h3{font-size:19px;color:var(--green-deep);margin:0 0 6px}.ocr-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.ocr-browser-import{border:1px solid var(--orange);background:color-mix(in srgb,var(--orange) 9%,var(--card));border-radius:15px;padding:15px;margin:14px 0;display:grid;gap:11px}.ocr-browser-import input[type=file]{width:100%;padding:10px;background:var(--card);border:1px solid var(--line);border-radius:11px}.ocr-browser-import label{font-weight:800}.ocr-browser-note{font-size:13px;color:var(--muted);line-height:1.6}.ocr-paste{border-top:1px solid var(--line);padding-top:15px}.ocr-paste textarea,.ocr-review textarea{min-height:110px}.ocr-status[hidden]{display:none}.ocr-status{border-radius:13px;padding:13px 15px;margin:14px 0;display:grid;gap:4px}.ocr-status.ok{background:var(--ok-bg);color:var(--green-deep)}.ocr-status.warn{background:#fff4d6;color:#6f4b00}.ocr-status.bad{background:#fff0ed;color:#982d20}.ocr-status ul{margin:5px 0 0;padding-left:20px}.ocr-review{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ocr-review .field{display:grid;gap:6px}.ocr-review .field input,.ocr-review .field select{width:100%}.ocr-review .field select+input{margin-top:6px}.ocr-review .wide{grid-column:1/-1}.ocr-confirm{border:1px solid var(--line);border-radius:13px;padding:12px;display:grid;gap:8px}.ocr-confirm legend{font-weight:900;color:var(--green-deep);padding:0 5px}.ocr-confirm label{font-weight:700}.ocr-source-title{font-size:14px;font-weight:900;color:var(--green-deep);margin:2px 0 0}.ocr-source-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ocr-source-button{position:relative;min-height:92px;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:13px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center;cursor:pointer;transition:border-color .18s,transform .18s,background .18s}.ocr-source-button:hover{border-color:var(--orange);transform:translateY(-1px)}.ocr-source-button input{position:absolute;opacity:0;pointer-events:none}.ocr-source-button:has(input:focus-visible){outline:3px solid color-mix(in srgb,var(--orange) 35%,transparent);outline-offset:2px}.ocr-source-icon{width:32px;height:32px;color:var(--orange);display:grid;place-items:center}.ocr-source-icon svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.ocr-source-button b{font-size:15px;color:var(--green-deep)}.ocr-source-button small{font-size:12px;color:var(--muted)}.ocr-selected-file{margin:0;padding:9px 11px;border-radius:10px;background:color-mix(in srgb,var(--green) 10%,var(--card));color:var(--green-deep);font-size:12px;font-weight:800;overflow-wrap:anywhere}.ocr-quality-confirm,.ocr-cloud-consent{position:relative;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:13px;display:grid!important;grid-template-columns:34px 1fr;gap:11px;align-items:center;cursor:pointer}.ocr-quality-confirm input{position:absolute;opacity:0;pointer-events:none}.ocr-quality-check{width:32px;height:32px;border:2px solid var(--line);border-radius:10px;display:grid;place-items:center;color:transparent;background:var(--paper);font-size:20px;font-weight:900;transition:.18s}.ocr-quality-copy{display:grid;gap:4px}.ocr-quality-copy b{color:var(--green-deep);font-size:15px}.ocr-quality-copy span{color:var(--muted);font-size:12px;font-weight:700}.ocr-quality-confirm:has(input:checked){border-color:var(--green);background:color-mix(in srgb,var(--green) 8%,var(--card))}.ocr-quality-confirm:has(input:checked) .ocr-quality-check{border-color:var(--green);background:var(--green);color:white}.ocr-quality-confirm:has(input:focus-visible){outline:3px solid color-mix(in srgb,var(--orange) 35%,transparent);outline-offset:2px}.ocr-cloud-consent{grid-template-columns:22px 1fr}.ocr-cloud-consent input{width:20px;height:20px;accent-color:var(--green)}.ocr-cloud-consent span{display:grid;gap:3px}.ocr-cloud-consent b{color:var(--green-deep)}.ocr-cloud-consent small{color:var(--muted);font-weight:600;line-height:1.5}@media(max-width:620px){.ocr-actions,.ocr-review{grid-template-columns:1fr}.ocr-review .wide{grid-column:auto}}";
    style.textContent += ".ocr-gate{border:1px solid var(--orange);background:color-mix(in srgb,var(--orange) 8%,var(--card));border-radius:16px;padding:18px;display:grid;gap:10px}.ocr-gate h3{margin:0;color:var(--green-deep)}.ocr-gate p{margin:0;color:var(--muted);line-height:1.6}.ocr-gate-row{display:grid;grid-template-columns:1fr auto;gap:10px}.ocr-gate-row input{min-width:0;width:100%;border:1px solid var(--line);border-radius:11px;padding:12px;background:var(--card);font-size:16px}.ocr-gate-status{margin:0}.ocr-gate-warning{font-size:12px;color:var(--muted)}@media(max-width:620px){.ocr-gate-row{grid-template-columns:1fr}}";
    document.head.appendChild(style);
  }

  function installPanel(releaseState) {
    const menu = document.querySelector(".record-hub-menu");
    const records = document.getElementById("scr-records");
    if (!menu || !records || document.getElementById("recordPanelOcr")) return;
    const developing = releaseState === "development";
    const ocrHeading = "Google Cloud Vision 圖片辨識（測試中・開發中）";
    const cloudConsent = '<label class="ocr-cloud-consent"><input id="cloudOcrConsent" type="checkbox"><span><b>同意本次雲端辨識</b><small>照片會加密傳送至噴前查後端，再交由 Google Cloud Vision 辨識；目前設計不保存原始照片，結果仍須由你確認。</small></span></label>';
    const ocrRunLabel = "開始雲端辨識（測試中）";
    const ocrNote = "辨識運算在 Google Cloud 進行，不占用手機載入模型的記憶體。此功能需要 Google 登入及網路；照片只在你勾選同意並按下按鈕後傳送。";
    const gateLabel = developing ? "04・測試中／開發中" : "04・辨識";
    const headingTag = developing ? ' <span class="plot-tag">測試中・開發中</span>' : "";
    const entryCopy = "選擇照片後由 Google Cloud Vision 辨識；逐欄確認後再帶入紀錄，不會自動儲存。";
    menu.insertAdjacentHTML("beforeend", '<button class="record-hub-button" type="button" onclick="openRecordHub(\'ocr\')" aria-controls="recordPanelOcr"><span class="record-hub-index" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M5 11h6l2-3h6l2 3h6v15H5Z"/><circle cx="16" cy="18.5" r="5"/><path d="M23 14h1"/></svg></span><span class="record-hub-copy"><span class="record-hub-label">' + gateLabel + '</span><b>拍攝表單建立草稿</b><small>' + entryCopy + '</small></span><span class="record-hub-arrow" aria-hidden="true">›</span></button>');
    records.insertAdjacentHTML("beforeend", `
      <section class="record-hub-panel" id="recordPanelOcr" data-record-panel="ocr" hidden>
        <button class="record-hub-back" type="button" onclick="showRecordHub()"><span class="record-hub-back-icon" aria-hidden="true">←</span><span>返回紀錄首頁</span></button>
        <div class="record-hub-panel-head"><h2>拍攝表單建立草稿${headingTag}</h2><p>適合把既有紙本紀錄先辨識成草稿。這項功能仍在測試，辨識結果必須逐欄人工確認。</p></div>
        <div class="ocr-gate" id="ocrVerificationGate">
          <h3>Google Cloud Vision 測試驗證</h3>
          <p>這是尚未公開的 OCR 測試功能。請輸入指定驗證碼後，才會顯示照片辨識工具。</p>
          <div class="ocr-gate-row"><input id="ocrVerificationCode" type="password" autocomplete="off" placeholder="輸入測試驗證碼" aria-label="OCR 測試驗證碼"><button class="btn btn-main" type="button" onclick="PQC_FORM_OCR_UI.unlockOcr()">解鎖測試功能</button></div>
          <div id="ocrVerificationStatus" class="ocr-status ocr-gate-status" role="status" aria-live="polite" hidden></div>
          <small class="ocr-gate-warning">驗證碼只代表測試入口，不取代 Google 登入、雲端同意與後端安全檢查。</small>
        </div>
        <div class="ocr-card" id="ocrVisionLockedContent" hidden>
          <h3>${ocrHeading}</h3>
          <p class="farm-note">請把紙張攤平、避免陰影與反光，並完整拍到四個角。辨識只建立待確認草稿，不會自動儲存。</p>
          <div class="ocr-browser-import">
            <p class="ocr-source-title">選擇照片來源</p>
            <div class="ocr-source-actions">
              <label class="ocr-source-button">
                <input id="cloudVisionCamera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onchange="PQC_FORM_OCR_UI.selectBrowserImage(this)">
                <span class="ocr-source-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M5 11h6l2-3h6l2 3h6v15H5Z"/><circle cx="16" cy="18.5" r="5"/></svg></span>
                <b>立即拍照</b><small>開啟手機相機</small>
              </label>
              <label class="ocr-source-button">
                <input id="cloudVisionFile" type="file" accept="image/jpeg,image/png,image/webp" onchange="PQC_FORM_OCR_UI.selectBrowserImage(this)">
                <span class="ocr-source-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M4 9h9l2 3h13v14H4Z"/><path d="M4 12h24"/></svg></span>
                <b>選擇檔案</b><small>從照片或檔案挑選</small>
              </label>
            </div>
            <p id="cloudVisionSelected" class="ocr-selected-file" hidden></p>
            <label class="ocr-quality-confirm">
              <input id="cloudVisionConfirmCorners" type="checkbox">
              <span class="ocr-quality-check" aria-hidden="true">✓</span>
              <span class="ocr-quality-copy"><b>拍照品質確認</b><span>四角完整・文字清楚・沒有強烈反光</span></span>
            </label>
            ${cloudConsent}
            <button class="btn btn-main" id="cloudVisionRun" type="button" onclick="PQC_FORM_OCR_UI.recognizeBrowserImage()">${ocrRunLabel}</button>
            <p class="ocr-browser-note">${ocrNote}</p>
          </div>
          <div id="cloudVisionStatus" class="ocr-status warn" role="status" aria-live="polite" hidden></div>
          <div class="ocr-actions"><button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.requestNativeScan()">使用 Android 原生掃描（開發中）</button><button class="btn btn-ghost" type="button" onclick="document.getElementById('ocrPasteText').focus()">改用文字貼上測試</button></div>
          <div id="ocrBridgeNote" class="safety-banner" hidden>此版本尚未連接 Android 原生掃描器，請改用上方 Google Cloud Vision 圖片辨識。</div>
          <div class="ocr-paste"><label for="ocrPasteText"><b>貼上辨識文字（備用測試）</b></label><textarea id="ocrPasteText" placeholder="例如：民國115/7/30　番茄　施肥　有機質肥料20公斤"></textarea><button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.parsePastedText()">從文字建立草稿</button></div>
          <div id="ocrDraftBox"></div>
        </div>
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
    featureReleaseState,
    validCloudEndpoint,
    activeOcrProvider,
    isOcrUnlocked,
    unlockOcr,
    safePayload,
    matchKey,
    registeredPesticideMatches,
    receiveScanResult,
    requestNativeScan,
    selectBrowserImage,
    recognizeCloudImage,
    recognizeBrowserImage,
    parsePastedText,
    applyToPesticideRecord,
    applyToFarmForm,
    init
  });
});
