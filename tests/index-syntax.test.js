const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

const inlineScripts = [];
const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptRe.exec(html))) inlineScripts.push(match[1]);
assert.ok(inlineScripts.length >= 2, "應找到主程式的 inline scripts");
inlineScripts.forEach((code, index) => new vm.Script(code, { filename: `index-inline-${index + 1}.js` }));

assert.ok(html.indexOf('<script src="./safety.js"></script>') < html.indexOf("const DATA="), "safety.js 必須在主程式前載入");
assert.ok(html.indexOf('<script src="./farm-records.js"></script>') < html.indexOf("const DATA="), "farm-records.js 必須在主程式前載入");
assert.match(html, /const APP_VERSION="1\.5\.0"/);
assert.match(html, /const SCHEMA_VERSION=3/);
assert.match(html, /PQC_SAFETY\.shouldShowVolumeApprox\(unit\)/);
assert.match(html, /PQC_SAFETY\.directCropLevels\(crop,DATA\)/);
assert.match(html, /id="rNotify" disabled/);
assert.match(html, /id="phiCustom" type="number" min="1" max="365"/);
assert.match(html, /function applyCustomPhi\(btn\)/);
assert.match(html, /PQC_SAFETY\.harvestStatus\(records,input\.plotId,input\.date\)/);
assert.match(html, /PQC_FARM\.buildTimeline\(list,farmList,p\.id\)/);
assert.match(html, /PQC_FARM\.exportCombinedCsv\(pesticideList,farmList/);
assert.match(html, /href="\$\{TRIAL_FORM_URL\}"[^>]*>開啟試用申請表<\/a>/);
assert.doesNotMatch(html, /pre\.phi==null\|\|pre\.phi===""/);
assert.match(sw, /"\.\/safety\.js"/);
assert.match(sw, /"\.\/farm-records\.js"/);
assert.match(sw, /v1\.5\.0-connected-records/);

console.log("✓ index.html 所有程式區塊語法正確");
console.log("✓ 安全核心載入、版本與離線快取設定正確");
