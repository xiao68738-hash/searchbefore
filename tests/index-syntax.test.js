const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const about = fs.readFileSync(path.join(root, "about.html"), "utf8");
const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));

function pngSize(filename){
  const png=fs.readFileSync(path.join(root,filename));
  assert.equal(png.subarray(1,4).toString("ascii"),"PNG",filename+" 必須是 PNG");
  return {width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
}

const inlineScripts = [];
const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptRe.exec(html))) inlineScripts.push(match[1]);
assert.ok(inlineScripts.length >= 2, "應找到主程式的 inline scripts");
inlineScripts.forEach((code, index) => new vm.Script(code, { filename: `index-inline-${index + 1}.js` }));

assert.ok(html.indexOf('<script src="./service-config.js"></script>') < html.indexOf("const DATA="), "service-config.js 必須在主程式前載入");
assert.ok(html.indexOf('<script src="./account.js"></script>') < html.indexOf("const DATA="), "account.js 必須在主程式前載入");
assert.ok(html.indexOf('<script src="./safety.js"></script>') < html.indexOf("const DATA="), "safety.js 必須在主程式前載入");
assert.ok(html.indexOf('<script src="./farm-records.js"></script>') < html.indexOf("const DATA="), "farm-records.js 必須在主程式前載入");
assert.ok(html.indexOf('<script src="./export-formats.js"></script>') < html.indexOf("const DATA="), "export-formats.js 必須在主程式前載入");
assert.match(html, /const APP_VERSION="0\.2\.1\.0"/);
assert.match(html, /<title>噴前查 SearchBefore/);
assert.match(html, /href="\.\/about\.html"/);
assert.match(html, /id="entryTitle">噴前查 SearchBefore<\/h1>/);
assert.match(html, /協助台灣農友查詢合法登記藥劑、完成配藥換算/);
assert.match(html, /<link rel="canonical" href="https:\/\/searchbefore\.tw\/">/);
assert.match(html, /const PRIVACY_URL="https:\/\/searchbefore\.tw\/privacy\.html"/);
assert.match(html, /const SCHEMA_VERSION=4/);
/* v4 遷移必須為既有紀錄回填 updatedAt,否則第一次雲端同步時
   所有舊資料會被當成同一時刻寫入,兩台裝置互相覆蓋。 */
assert.match(html, /oldVersion<4/);
assert.match(html, /updatedAt/);
/* 同步層必須攔在 store.set 這個單一出口 */
assert.match(html, /PQC_SYNC\.beforeStore/);
assert.match(html, /PQC_SYNC\.afterStore/);
assert.match(html, /<script src="\.\/cloud-sync\.js"><\/script>/);
/* 備份說明必須依同步狀態切換。寫死任一種在另一種狀態下都是假訊息:
   同步開啟時說「只存在這台裝置」會讓農友重複手動備份;
   未登入時說「已備份」則會讓他們以為有備援而其實沒有。 */
assert.match(html, /id="backupNote"/);

/* 殘留容許量說明:必須維持中性陳述。
   衛福部資料中沒有「不得檢出」這個值(8,258 筆容許量全為數字),
   不得檢出是「查無此筆」的預設結果 —— 因此比對失敗與真正未訂容許量
   在系統中無法區分。一旦把查無結果講成「風險」,合法登記藥劑會被誤報,
   農友被誤報一次就會忽略所有警告,包括真正該注意的。 */
assert.match(html, /殘留容許量尚未納入/);

/* ── 作物別名的目標必須真的存在於 DATA ──
   查詢時 add() 會靜默跳過不存在的目標,所以指向錯誤的別名不會報錯,
   只會讓農友打了俗名卻查不到東西。稽核時發現「小黃瓜→花胡瓜」
   從一開始就指向不存在的作物(該作物在 DATA 中從未出現過)。
   這種錯誤沒有測試就永遠不會被發現。 */
{
  const di = html.indexOf("const DATA=") + "const DATA=".length;
  const DATA = JSON.parse(html.slice(di, html.indexOf("\n", di)).trim().replace(/;$/, ""));

  const ai = html.indexOf("const CROP_ALIAS={");
  const aliasSrc = html.slice(ai + "const CROP_ALIAS={".length, html.indexOf("};", ai));
  const ALIAS = eval("({" + aliasSrc.replace(/\/\*[\s\S]*?\*\//g, "") + "})");

  const dead = [];
  for (const [alias, targets] of Object.entries(ALIAS)) {
    for (const t of targets) if (!DATA[t]) dead.push(`${alias} → ${t}`);
  }
  assert.equal(dead.length, 0,
    `俗名對照指向不存在的作物:${dead.join("、")}`);
  assert.ok(Object.keys(ALIAS).length >= 100,
    `俗名對照應有 100 組以上,實際 ${Object.keys(ALIAS).length} 組`);

  /* phiText 只在區間時存在,且 phi 必須等於區間上限 */
  let ptBad = [];
  for (const c of Object.keys(DATA)) for (const p of Object.keys(DATA[c])) for (const e of DATA[c][p]) {
    if (!("phiText" in e)) continue;
    if (!/^\d+(\.\d+)?(-\d+(\.\d+)?)+$/.test(e.phiText)) { ptBad.push(`${c}/${p}/${e.name} 格式異常 ${e.phiText}`); continue; }
    const max = Math.max(...String(e.phiText).split("-").map(Number));
    if (e.phi !== max) ptBad.push(`${c}/${p}/${e.name} phi=${e.phi} 但區間上限為 ${max}`);
  }
  assert.equal(ptBad.length, 0,
    `採收期區間的 phi 必須等於上限(倒數採保守值):${ptBad.slice(0, 3).join("；")}`);
}
assert.match(html, /未涵蓋衛福部訂定的農產品殘留容許量標準/);
assert.doesNotMatch(html, /殘留超標風險|有超標風險|不得檢出風險|禁用藥劑警告/);
assert.match(html, /function renderBackupNote\(\)/);
assert.match(html, /常用配方與偏好設定仍只存在這台裝置/);
assert.match(html, /用藥、田間作業、田區與配方只存在這台裝置/);
assert.match(html, /PQC_SAFETY\.shouldShowVolumeApprox\(unit\)/);
assert.match(html, /PQC_SAFETY\.directCropLevels\(crop,DATA\)/);
assert.match(html, /id="rNotify" disabled/);
assert.match(html, /id="phiCustom" type="number" min="1" max="365"/);
assert.match(html, /function applyCustomPhi\(btn\)/);
assert.match(html, /PQC_SAFETY\.harvestStatus\(records,input\.plotId,input\.date\)/);
assert.match(html, /PQC_FARM\.buildTimeline\(list,farmList,p\.id\)/);
assert.match(html, /PQC_FARM\.buildCombinedTable\(pesticideList,farmList/);
assert.doesNotMatch(html, /試用申請|授權碼啟用|方案與付款|付款功能尚未開放/);
assert.match(html, /id="homeFeatures"/);
assert.match(html, /function focusHomeSearch\(\)/);
assert.match(html, /公開測試中/);
assert.match(html, /請用一次真實流程，再告訴我們哪裡卡住/);
assert.match(html, /公開測試期間所有功能均開放，不登入也能直接使用/);
/* 不得出現無條件、無期限的免費承諾——未來若推出付費升級會構成前後矛盾 */
assert.doesNotMatch(html, /永久免費|終身免費|一律免費|永遠免費|完全免費/);
assert.match(html, /function searchPlotCrops\(raw\)/);
assert.match(html, /function pickPlotCrop\(crop\)/);
assert.match(html, /function useCustomPlotCrop\(\)/);
assert.match(html, /data-crop="" data-custom="0" oninput="searchPlotCrops\(this\.value\)"/);
assert.match(html, /cropSource:linkedCrop\?"registered":"custom"/);
assert.doesNotMatch(html, /一條完整工作流程|從噴藥前，一路接到採收後|最近更新|產品正在持續變好/);
assert.match(html, /合法用藥查詢/);
assert.match(html, /安全採收連動/);
assert.match(html, /id="accountInner" aria-live="polite"/);
assert.match(html, /id="homeAccountInner" aria-live="polite"/);
assert.match(html, /id="entryAccountInner" aria-live="polite"/);
assert.match(html, /選擇 Google 帳號/);
assert.match(html, /以訪客身分使用/);
assert.match(html, /登入或直接開始使用/);
assert.match(html, /兩種方式都能使用查詢、計算與田間紀錄/);
assert.match(html, /\.entry-hero h1\{[^}]*font-size:40px/);
assert.match(html, /function completeEntryWithGoogle\(\)/);
assert.match(html, /function openEntryGate\(\)/);
assert.match(html, /openEntryGate\(\);/);
assert.doesNotMatch(html, /store\.get\("onboarded"\)|store\.set\("onboarded"/);
assert.match(html, /window\.addEventListener\("load",function\(\)\{/);
assert.match(html, /d\.id="loadFailureBanner"/);
assert.match(html, /if\(loadFailureBanner\)loadFailureBanner\.remove\(\)/);
assert.doesNotMatch(html, /\},2500\);/);
assert.match(html, /id="recordHubHome"/);
assert.match(html, /田區新增／田區管理/);
assert.match(html, /其他田區紀錄/);
assert.match(html, /用藥歷史／匯出用藥紀錄/);
assert.match(html, /function openRecordHub\(section\)/);
assert.match(html, /function showRecordHub\(\)/);
assert.match(html, /id="navSearch" onclick="go\('search',this\)"/);
assert.match(html, /function openHomeOnLaunch\(\)\{\s*go\("search",document\.getElementById\("navSearch"\)\);\s*\}/);
assert.match(html, /renderPlotRecordBox\(\);openHomeOnLaunch\(\);/);
assert.match(html, /id="supportLink"[^>]*rel="noopener noreferrer"/);
assert.match(html, /id="supportCard" style="display:none/);
assert.match(html, /是否贊助都不影響任何功能或服務/);
assert.match(html, /贊助不會解鎖任何內容，也不影響功能或服務/);
assert.match(html, /function publicConfigHttpsUrl\(key\)/);
assert.doesNotMatch(html, /your-email@example\.com/);
assert.doesNotMatch(html, /贊助連結準備中/);
assert.match(html, /function canAddPlot\(\)\{\s*return true;/);
assert.doesNotMatch(html, /class="lock lockmark"/);
assert.match(html, /parsed\.protocol==="https:"/);
assert.doesNotMatch(html, /id="shopLinkInner"/);
assert.doesNotMatch(html, /function (?:renderShopLink|saveShopLink|disconnectShop)\(/);
assert.doesNotMatch(html, /linkedShop:store\.get\("linkedShop"\)/);
assert.doesNotMatch(html, /pre\.phi==null\|\|pre\.phi===""/);
assert.match(sw, /"\.\/safety\.js"/);
assert.match(sw, /"\.\/farm-records\.js"/);
assert.match(sw, /"\.\/export-formats\.js"/);
assert.match(sw, /"\.\/service-config\.js"/);
assert.match(sw, /"\.\/account\.js"/);
assert.match(sw, /"\.\/about\.html"/);
assert.match(sw, /"\.\/brand-lockup\.png"/);
assert.match(sw, /"\.\/brand-logo-120\.png"/);
assert.match(html, /class="record-hub-back-icon" aria-hidden="true">←<\/span>/);
assert.match(html, /\.record-hub-back-icon\{[^}]*font-size:27px/);
assert.match(sw, /v0\.2\.1\.0-entry-polish/);
assert.match(sw, /"\.\/query-aids\.js"/);
assert.ok(html.indexOf('<script src="./query-aids.js"></script>') < html.indexOf("const DATA="), "query-aids.js 必須在主程式前載入");
assert.match(html, /function renderPestRelated\(\)/);
assert.match(html, /PQC_AIDS\.isSeedTreatment\(a\)/);
assert.match(html, /種子\/種苗處理・非噴施/);
assert.match(html, /本工具不會自動合併/);
assert.match(sw, /"\.\/crop-forms\.js"/);
assert.ok(html.indexOf('<script src="./crop-forms.js"></script>') < html.indexOf("const DATA="), "crop-forms.js 必須在主程式前載入");
assert.match(html, /id="formBlock"/);
assert.match(html, /function renderFormChips\(\)/);
assert.match(html, /function setCropForm\(id\)/);
assert.match(html, /CF\.splitIndices\(selCrop,selForm,list\)/);
assert.match(html, /不會自動歸類/);
assert.match(about, /<h1>噴前查 <span>SearchBefore<\/span><\/h1>/);
assert.match(about, /src="\.\/brand-lockup\.png"/);
assert.match(about, /Google 登入與資料使用/);
assert.match(html, /class="brand">噴前查 <span class="brand-en">SearchBefore<\/span>/);
assert.match(html, /噴前查 SearchBefore 是協助台灣農友查詢合法登記藥劑/);
assert.match(about, /只取得 Google 提供的基本帳號識別資料/);
assert.match(about, /不會因 Google 登入而自動上傳至 Google 或 Firebase 資料庫/);
assert.match(about, /href="\.\/privacy\.html"/);
assert.match(privacy, /噴前查 SearchBefore 隱私權政策/);
assert.match(manifest.name, /^噴前查 SearchBefore/);
assert.deepEqual(pngSize("brand-logo-120.png"),{width:120,height:120});
assert.deepEqual(pngSize("icon-192.png"),{width:192,height:192});
assert.deepEqual(pngSize("icon-512.png"),{width:512,height:512});

/* ── TWA(Google Play)上架前置 ── */
/* GitHub Pages 預設以 Jekyll 建置,會忽略 . 開頭的資料夾,
   少了 .nojekyll 會導致 /.well-known/assetlinks.json 部署後 404,
   且無任何錯誤訊息。此檔不可刪除。 */
assert.ok(fs.existsSync(path.join(root, ".nojekyll")),
  ".nojekyll 必須存在,否則 GitHub Pages 會忽略 .well-known 導致 TWA 驗證失敗");

/* PWA manifest 必備欄位(TWA 封裝與 Play 上架都會檢查) */
for (const key of ["name", "short_name", "start_url", "scope", "display", "icons"]) {
  assert.ok(manifest[key], `manifest 缺少 TWA 必要欄位:${key}`);
}
assert.equal(manifest.display, "standalone", "TWA 需要 display: standalone");
const iconSizes = manifest.icons.map(i => i.sizes);
assert.ok(iconSizes.includes("512x512"), "manifest 必須含 512x512 圖示");
assert.ok(manifest.icons.some(i => String(i.purpose || "").includes("maskable")),
  "manifest 必須含 maskable 圖示,否則 Android 桌面圖示會被裁切");

/* assetlinks.json 若已放入,格式必須正確——格式錯誤會讓 App 出現網址列 */
const assetlinksPath = path.join(root, ".well-known", "assetlinks.json");
if (fs.existsSync(assetlinksPath)) {
  const links = JSON.parse(fs.readFileSync(assetlinksPath, "utf8"));
  assert.ok(Array.isArray(links) && links.length, "assetlinks.json 應為非空陣列");
  for (const entry of links) {
    assert.ok(Array.isArray(entry.relation) && entry.relation.includes("delegate_permission/common.handle_all_urls"),
      "assetlinks.json 缺少正確的 relation");
    assert.equal(entry.target?.namespace, "android_app");
    assert.ok(entry.target?.package_name, "assetlinks.json 缺少 package_name");
    const fps = entry.target?.sha256_cert_fingerprints;
    assert.ok(Array.isArray(fps) && fps.length, "assetlinks.json 缺少 sha256_cert_fingerprints");
    for (const fp of fps) {
      assert.match(fp, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i,
        "SHA-256 指紋格式須為 32 組冒號分隔的十六進位:" + fp);
    }
  }
  console.log("✓ assetlinks.json 格式正確");
}

console.log("✓ index.html 所有程式區塊語法正確");
console.log("✓ 安全核心載入、版本與離線快取設定正確");
console.log("✓ TWA 上架前置:.nojekyll 存在、manifest 欄位完整");
