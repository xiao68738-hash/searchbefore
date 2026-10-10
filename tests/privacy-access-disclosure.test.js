const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Content regression only: this does not certify the live Console declaration,
// server rules, legal compliance, or a review account's ability to sign in.
const root = path.resolve(__dirname, '..');
const text = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8')
  .replace(/<[^>]+>/g, '').replace(/\s+/g, '');
assert.doesNotMatch(text, /不登入使用目前所有功能|所有功能[，、]?皆?不[必需]登入/,
  'Optional login is not the same as anonymous access to cloud sync');
assert.match(text, /查詢、計算、本機紀錄與JSON備份不必登入/);
assert.match(text, /選用雲端同步則需要Google登入/);
assert.match(text, /登入本身不代表同意上傳田間資料/);
assert.match(text, /另外同意同步並按下「立即同步」後/);
assert.match(text, /配方與偏好設定不包含在雲端同步範圍內/);
assert.match(text, /原生版不會自動讀取Chrome的舊紀錄/);
assert.match(text, /「未啟用同步」不表示Google登入完全不傳送資料/);
const deletion = fs.readFileSync(path.join(root, 'delete-account.html'), 'utf8');
assert.match(deletion, /請勿寄送 Google 密碼或驗證碼/);
assert.match(deletion, /自行匯出的 JSON／報表須另外處理/);
console.log('Privacy access disclosure: guest scope, authenticated sync, consent and migration limits retained.');
