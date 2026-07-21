const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const account = fs.readFileSync(path.join(root, "account.js"), "utf8");
const configSource = fs.readFileSync(path.join(root, "service-config.js"), "utf8");

new vm.Script(account, { filename: "account.js" });
const sandbox = { window: {} };
vm.runInNewContext(configSource, sandbox, { filename: "service-config.js" });

assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.firebase.projectId, "searchbefore-4648b");
assert.match(sandbox.window.PQC_PUBLIC_CONFIG.firebase.authDomain, /\.firebaseapp\.com$/);
assert.ok(sandbox.window.PQC_PUBLIC_CONFIG.firebase.apiKey);
assert.ok(sandbox.window.PQC_PUBLIC_CONFIG.firebase.appId);
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.feedbackEmail, "");
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.supportUrl, "");
assert.match(account, /firebasejs\/"\+FIREBASE_VERSION\+"\/firebase-auth\.js/);
assert.match(account, /signInWithPopup\(instance,provider\)/);
assert.match(account, /browserLocalPersistence/);
assert.match(account, /document\.getElementById\("homeAccountInner"\)/);
assert.match(account, /document\.getElementById\("entryAccountInner"\)/);
assert.match(account, /function googleLogo\(\)/);
assert.match(account, /fill="#EA4335"/);
assert.match(account, /fill="#4285F4"/);
assert.match(account, /fill="#FBBC05"/);
assert.match(account, /fill="#34A853"/);
assert.doesNotMatch(account, /class="google-mark">G</);
assert.match(account, /accountBoxes\(\)\.forEach/);
assert.match(account, /window\.completeEntryWithGoogle/);
assert.match(account, /return user/);
assert.match(account, /location\.protocol==="file:"/);
/* 同步層不存在時的退路文案:必須說資料在本機,不可寫死「已備份到雲端」,
   否則同步失效或被關閉時會誤導農友以為資料有備份。 */
assert.match(account, /田區、用藥與農務紀錄保存在這台裝置/);
assert.doesNotMatch(account, /已備份到雲端|資料已上傳|自動備份完成/);
/* 狀態文字一律向同步層要,不在帳號層自行判斷 */
assert.match(account, /window\.PQC_SYNC/);
assert.match(account, /PQC_SYNC\.statusLine\(\)/);
/* 帳號層只外露身分,供同步層訂閱 */
assert.match(account, /getUser:function\(\)\{return currentUser\}/);
assert.match(account, /onUser:onUser/);
assert.doesNotMatch(account, /firestore|storage|databaseURL/i);

console.log("✓ Google 登入僅在公開設定完成後載入");
console.log("✓ 帳號層不包含田間資料同步或付款程式");
