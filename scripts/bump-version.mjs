/* 版本號換版:一次改完四處,漏一處就會出事。

   用法:
     node scripts/bump-version.mjs 0.1.11.0 crop-alias
     npm run release:bump -- 0.1.11.0 crop-alias

   為什麼要有這支腳本:
   版本號散在四個地方,其中 tests/index-syntax.test.js 有「兩個」釘住值,
   而且釘 CACHE_VERSION 的那一行整行沒有出現 CACHE_VERSION 這個字
   (只寫版本字串本身),用關鍵字搜尋找不到,人工換版很容易只改到一半。

   漏改 sw.js 的 CACHE_VERSION 後果最嚴重:測試會擋下來(所以不會上線),
   但如果連測試釘住值一起改錯,使用者手機會一直吃舊快取 ——
   你在電腦上看到更新了,農友那邊沒有,而且完全不會報錯。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [version, slug] = process.argv.slice(2);

if (!version || !slug) {
  console.error("用法:node scripts/bump-version.mjs <版本> <用途代號>");
  console.error("例如:node scripts/bump-version.mjs 0.1.11.0 batch-calendar");
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
  console.error(`版本格式須為 x.y.z.w,收到「${version}」`);
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`用途代號只能用小寫英數與連字號,收到「${slug}」`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const cacheVersion = `v${version}-${slug}-${today}`;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* 先讀出現值,順便確認四處彼此一致 */
function read(file) {
  const p = path.join(ROOT, file);
  const raw = fs.readFileSync(p, "utf8");
  return { p, raw, crlf: /\r\n/.test(raw) };
}

const idx = read("index.html");
const sw = read("sw.js");
const tst = read("tests/index-syntax.test.js");

const curApp = idx.raw.match(/const APP_VERSION="([\d.]+)"/)?.[1];
const curCache = sw.raw.match(/const CACHE_VERSION = "([^"]+)"/)?.[1];
if (!curApp) throw new Error("index.html 找不到 APP_VERSION");
if (!curCache) throw new Error("sw.js 找不到 CACHE_VERSION");

/* 測試釘的是「不含日期」的前綴,例如 /v0\.1\.10\.3-delete-page/,
   這樣同一版當天重跑不必再動測試。這裡要跟著只比對前綴。 */
const curPrefix = curCache.replace(/-\d{4}-\d{2}-\d{2}$/, "");
const newPrefix = `v${version}-${slug}`;
const rx = s => s.replace(/\./g, "\\.");

const pinApp = tst.raw.includes(rx(curApp));
const pinCache = tst.raw.includes(rx(curPrefix));
if (!pinApp) throw new Error(`測試未釘住目前的 APP_VERSION ${curApp},請先確認測試檔`);
if (!pinCache) throw new Error(`測試未釘住目前的快取版本前綴 ${curPrefix},請先確認測試檔`);

if (curApp === version) {
  console.error(`APP_VERSION 已經是 ${version},版本號必須往上加`);
  process.exit(1);
}

/* 逐檔替換,任何一處對不上就整批中止(不要留下改一半的狀態) */
const edits = [
  [idx, `const APP_VERSION="${curApp}"`, `const APP_VERSION="${version}"`, "index.html APP_VERSION"],
  [sw, `const CACHE_VERSION = "${curCache}"`, `const CACHE_VERSION = "${cacheVersion}"`, "sw.js CACHE_VERSION"],
  [tst, rx(curApp), rx(version), "測試釘住的 APP_VERSION"],
  [tst, rx(curPrefix), rx(newPrefix), "測試釘住的快取版本前綴"]
];

for (const [file, from, , label] of edits) {
  const hits = file.raw.split(from).length - 1;
  if (hits === 0) throw new Error(`${label}:找不到「${from}」`);
}

for (const [file, from, to, label] of edits) {
  file.raw = file.raw.replace(from, to);
  console.log(`✓ ${label}`);
}

for (const file of [idx, sw, tst]) fs.writeFileSync(file.p, file.raw, "utf8");

console.log(`\nAPP_VERSION   ${curApp} → ${version}`);
console.log(`CACHE_VERSION ${curCache}\n              → ${cacheVersion}`);
console.log(`\n接著執行:node tests/run-all.js`);
