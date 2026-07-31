(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_FORM_OCR_UI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const RESULT_TYPE = "PQC_OCR_SCAN_RESULT";
  const REQUEST_TYPE = "PQC_OCR_SCAN_REQUEST";
  const TRUSTED_ORIGINS = Object.freeze(["https://searchbefore.tw", "android://tw.searchbefore.app"]);
  let currentDraft = null;
  let twaPort = null;

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
    if (Number(value.protocolVersion || 1) !== 1) return null;
    return value;
  }

  function dictionaries() {
    const crops = typeof CROPS !== "undefined" && Array.isArray(CROPS) ? CROPS : [];
    const materials = new Set();
    if (typeof DATA !== "undefined" && DATA && typeof DATA === "object") {
      Object.values(DATA).forEach(function (pests) {
        Object.values(pests || {}).forEach(function (agents) {
          (agents || []).forEach(function (agent) {
            if (agent && agent.name) materials.add(agent.name);
            (agent && Array.isArray(agent.bl) ? agent.bl : []).forEach(function (brand) {
              if (brand) materials.add(typeof brand === "string" ? brand : brand.name);
            });
          });
        });
      });
    }
    return { crops: crops, materials: Array.from(materials).filter(Boolean) };
  }

  function optionList(items, format) {
    if (!items || !items.length) return '<option value="">未辨識到，請自行輸入</option>';
    return '<option value="">請選擇辨識結果</option>' + items.map(function (item) {
      const value = format ? format(item) : item.value;
      return '<option value="' + esc(value) + '">' + esc(value) + '</option>';
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
      + '<div class="field"><label>紀錄類型 *</label><select id="ocrRecordType"><option value="">請選擇</option><option value="cultivation">栽培作業</option><option value="fertilizer">施肥</option><option value="harvest">採收</option><option value="postharvest">採後處理</option><option value="purchase">資材購入</option></select></div>'
      + '<div class="field"><label>日期候選 *</label><select id="ocrDateCandidate">' + optionList(draft.fields.date) + '</select><input id="ocrDateManual" type="date" aria-label="手動修正日期"></div>'
      + '<div class="field"><label>作物候選 *</label><select id="ocrCropCandidate">' + optionList(draft.fields.crop) + '</select><input id="ocrCropManual" placeholder="或自行輸入作物"></div>'
      + '<div class="field"><label>資材／藥劑候選</label><select id="ocrMaterialCandidate">' + optionList(draft.fields.material) + '</select><input id="ocrMaterialManual" placeholder="或自行輸入名稱"></div>'
      + '<div class="field"><label>稀釋倍數</label><select id="ocrDilutionCandidate">' + optionList(draft.fields.dilution) + '</select></div>'
      + '<div class="field"><label>數量候選</label><select id="ocrAmountCandidate">' + optionList(draft.fields.amount, function (item) { return item.value + " " + item.unit; }) + '</select></div>'
      + '<div class="field"><label>執行人</label><input id="ocrOperator" placeholder="請自行確認填寫"></div>'
      + '<div class="field wide"><label>辨識原文</label><textarea id="ocrRawText" readonly>' + esc(text) + '</textarea></div>'
      + '<fieldset class="ocr-confirm wide"><legend>儲存前必須確認</legend><label><input id="ocrConfirmType" type="checkbox"> 紀錄類型已核對</label><label><input id="ocrConfirmDate" type="checkbox"> 日期已核對</label><label><input id="ocrConfirmCrop" type="checkbox"> 作物已核對</label></fieldset>'
      + '<button class="btn btn-main wide" type="button" onclick="PQC_FORM_OCR_UI.applyToFarmForm()"' + (draft.quality.canProcess ? "" : " disabled") + '>帶入紀錄表單並繼續確認</button>'
      + '<p class="disclaimer wide">辨識結果只是草稿。系統不會自動儲存；帶入後仍須在原本的作業紀錄表單再次確認並按下儲存。</p>'
      + '</div>';
    if (draft.fields.date.length) {
      setValue("ocrDateCandidate", draft.fields.date[0].value);
      setValue("ocrDateManual", draft.fields.date[0].value);
    }
    if (draft.fields.crop.length) setValue("ocrCropCandidate", draft.fields.crop[0].value);
    if (draft.fields.material.length) setValue("ocrMaterialCandidate", draft.fields.material[0].value);
    if (draft.fields.dilution.length) setValue("ocrDilutionCandidate", draft.fields.dilution[0].value);
    if (draft.fields.amount.length) setValue("ocrAmountCandidate", draft.fields.amount[0].value + " " + draft.fields.amount[0].unit);
  }

  function receiveScanResult(payload) {
    const safe = safePayload(payload);
    if (!safe || !root.PQC_FORM_OCR) {
      if (typeof root.toast === "function") root.toast("辨識資料格式不正確，請重新掃描");
      return false;
    }
    renderDraft(root.PQC_FORM_OCR.createDraft(safe, dictionaries()));
    return true;
  }

  function requestNativeScan() {
    const request = { type: REQUEST_TYPE, protocolVersion: 1, requestId: "ocr-" + Date.now() };
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
    const note = document.getElementById("ocrBridgeNote");
    if (note) note.hidden = false;
    if (typeof root.toast === "function") root.toast("目前瀏覽器沒有 Android 掃描功能，可先貼上辨識文字測試");
  }

  function parsePastedText() {
    const input = document.getElementById("ocrPasteText");
    const text = input ? input.value.trim() : "";
    if (!text) {
      if (typeof root.toast === "function") root.toast("請先貼上表單辨識文字");
      return;
    }
    receiveScanResult({
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

  function applyToFarmForm() {
    if (!currentDraft) return;
    const recordType = selectedOrManual("ocrRecordType", "");
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
    setValue("farmOperator", selectedOrManual("ocrOperator", ""));
    if (typeof fieldPlots !== "undefined" && Array.isArray(fieldPlots)) {
      const matches = fieldPlots.filter(function (plot) { return String(plot.crop || "").trim() === crop; });
      if (matches.length === 1) setValue("farmPlot", matches[0].id);
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
    style.textContent = ".ocr-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:var(--shadow)}.ocr-card h3{font-size:19px;color:var(--green-deep);margin:0 0 6px}.ocr-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.ocr-paste{border-top:1px solid var(--line);padding-top:15px}.ocr-paste textarea,.ocr-review textarea{min-height:110px}.ocr-status{border-radius:13px;padding:13px 15px;margin:14px 0;display:grid;gap:4px}.ocr-status.ok{background:var(--ok-bg);color:var(--green-deep)}.ocr-status.warn{background:#fff4d6;color:#6f4b00}.ocr-status.bad{background:#fff0ed;color:#982d20}.ocr-status ul{margin:5px 0 0;padding-left:20px}.ocr-review{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ocr-review .field{display:grid;gap:6px}.ocr-review .field input,.ocr-review .field select{width:100%}.ocr-review .field select+input{margin-top:6px}.ocr-review .wide{grid-column:1/-1}.ocr-confirm{border:1px solid var(--line);border-radius:13px;padding:12px;display:grid;gap:8px}.ocr-confirm legend{font-weight:900;color:var(--green-deep);padding:0 5px}.ocr-confirm label{font-weight:700}@media(max-width:620px){.ocr-actions,.ocr-review{grid-template-columns:1fr}.ocr-review .wide{grid-column:auto}}";
    document.head.appendChild(style);
  }

  function installPanel() {
    const menu = document.querySelector(".record-hub-menu");
    const records = document.getElementById("scr-records");
    if (!menu || !records || document.getElementById("recordPanelOcr")) return;
    menu.insertAdjacentHTML("beforeend", '<button class="record-hub-button" type="button" onclick="openRecordHub(\'ocr\')" aria-controls="recordPanelOcr"><span class="record-hub-index">04</span><span class="record-hub-copy"><b>拍攝表單建立草稿</b><small>Android App 在手機內辨識文字；逐欄確認後再帶入紀錄，不會自動儲存。</small></span><span class="record-hub-arrow" aria-hidden="true">›</span></button>');
    records.insertAdjacentHTML("beforeend", '<section class="record-hub-panel" id="recordPanelOcr" data-record-panel="ocr" hidden><button class="record-hub-back" type="button" onclick="showRecordHub()"><span class="record-hub-back-icon" aria-hidden="true">←</span><span>返回紀錄首頁</span></button><div class="record-hub-panel-head"><h2>拍攝表單建立草稿 <span class="plot-tag">測試版</span></h2><p>適合把既有紙本紀錄先辨識成草稿。照片只在 Android 裝置內處理；網站只接收文字與品質指標。</p></div><div class="ocr-card"><h3>先取得表單文字</h3><p class="farm-note">請把紙張攤平、避免陰影與反光，並完整拍到四個角。辨識不清楚時系統會要求重拍。</p><div class="ocr-actions"><button class="btn btn-main" type="button" onclick="PQC_FORM_OCR_UI.requestNativeScan()">開啟 Android 表單掃描</button><button class="btn btn-ghost" type="button" onclick="document.getElementById(\'ocrPasteText\').focus()">沒有掃描器，先貼文字測試</button></div><div id="ocrBridgeNote" class="safety-banner" hidden>此瀏覽器尚未連接 Android 原生掃描器。仍可在下方貼上 OCR 文字測試草稿整理流程。</div><div class="ocr-paste"><label for="ocrPasteText"><b>貼上辨識文字（無模板測試）</b></label><textarea id="ocrPasteText" placeholder="例如：民國115/7/30　番茄　施肥　有機質肥料20公斤"></textarea><button class="btn btn-ghost" type="button" onclick="PQC_FORM_OCR_UI.parsePastedText()">從文字建立草稿</button></div><div id="ocrDraftBox"></div></div></section>');
  }

  function init() {
    if (!root.document || !root.PQC_FORM_OCR) return;
    installStyle();
    installPanel();
    root.addEventListener("message", function (event) {
      if (TRUSTED_ORIGINS.indexOf(event.origin) < 0) return;
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
    safePayload,
    receiveScanResult,
    requestNativeScan,
    parsePastedText,
    applyToFarmForm,
    init
  });
});
