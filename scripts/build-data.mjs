/* 由官方快取產生 index.html 所需的 DATA 結構。

   前置:先跑 scripts/fetch-pesticide-source.mjs 取得 mrl-data/source-cache/

   結構:
     DATA[作物名稱][病蟲害名稱] = [
       { name, form, content, dilution, phi, dose, times, moa, note, bl }
     ]

   聚合規則:
   同一個「作物 × 病蟲害 × 成分中文名 × 劑型 × 含量 × 用法」的多張許可證
   合併成一筆,各家商品名收進 bl 陣列。農友要看的是「這支藥怎麼用」,
   不是「哪幾家公司有賣」;不合併的話光是待克利在單一作物就會列出數十筆
   一模一樣的內容。

   用法:
     node scripts/build-data.mjs           # 只產生並比對,不寫入
     node scripts/build-data.mjs --write   # 確認差異合理後才寫回 index.html
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* 轉換規則抽在 data-rules.mjs,由 tests/data-rules.test.js 單元測試 */
import { text, keyOf, isActive, makeEntry, sameUsage } from "./data-rules.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const CACHE = path.join(ROOT, "mrl-data", "source-cache");
const WRITE = process.argv.includes("--write");

for (const f of ["permits.json", "details.json"]) {
  if (!fs.existsSync(path.join(CACHE, f))) {
    console.error(`缺少 ${f},請先執行:node scripts/fetch-pesticide-source.mjs`);
    process.exit(1);
  }
}

const permits = JSON.parse(fs.readFileSync(path.join(CACHE, "permits.json"), "utf8"));
const details = JSON.parse(fs.readFileSync(path.join(CACHE, "details.json"), "utf8"));

const DATA = {};
let usedPermits = 0, skippedRevoked = 0, skippedNoDetail = 0, rows = 0;

for (const p of permits) {
  if (!isActive(p)) { skippedRevoked++; continue; }
  const detail = details[keyOf(p)];
  if (!Array.isArray(detail) || !detail.length) { skippedNoDetail++; continue; }
  usedPermits++;

  const name = text(p["中文名稱"]);
  const brand = text(p["廠牌名稱"]);
  if (!name) continue;

  for (const d of detail) {
    const crop = text(d["作物名稱"]);
    const pest = text(d["病蟲害名稱"]);
    if (!crop || !pest) continue;
    rows++;

    const entry = makeEntry(p, d);

    if (!DATA[crop]) DATA[crop] = {};
    if (!DATA[crop][pest]) DATA[crop][pest] = [];

    const bucket = DATA[crop][pest];
    const same = bucket.find(e => sameUsage(e, entry));

    if (same) {
      if (brand && same.bl.indexOf(brand) < 0) same.bl.push(brand);
      if (!same.moa && entry.moa) same.moa = entry.moa;
    } else {
      if (brand) entry.bl.push(brand);
      bucket.push(entry);
    }
  }
}

const crops = Object.keys(DATA).length;
let pairs = 0, entries = 0;
for (const c of Object.keys(DATA)) {
  const ps = Object.keys(DATA[c]);
  pairs += ps.length;
  for (const p of ps) entries += DATA[c][p].length;
}

console.log(`許可證 ${permits.length} 張:採用 ${usedPermits}、已廢止 ${skippedRevoked}、無使用範圍 ${skippedNoDetail}`);
console.log(`使用範圍 ${rows} 列 → 作物 ${crops}｜作物×病蟲害 ${pairs}｜藥劑 ${entries}`);

fs.writeFileSync(path.join(CACHE, "DATA.built.json"), JSON.stringify(DATA), "utf8");
console.log(`\n已產生 mrl-data/source-cache/DATA.built.json`);

if (WRITE) {
  const idx = path.join(ROOT, "index.html");
  const raw = fs.readFileSync(idx, "utf8");
  const marker = "const DATA=";
  const i = raw.indexOf(marker);
  if (i < 0) throw new Error("index.html 找不到 const DATA=");
  const lineEnd = raw.indexOf("\r\n", i);
  if (lineEnd < 0) throw new Error("index.html 換行格式非 CRLF");
  const before = raw.slice(0, i + marker.length);
  const after = raw.slice(lineEnd);
  fs.writeFileSync(idx, before + JSON.stringify(DATA) + ";" + after, "utf8");
  console.log("✓ 已寫回 index.html");
  console.log("接著務必執行:npm run release:bump 與 node tests/run-all.js");
} else {
  console.log("\n未寫入 index.html。先執行 node scripts/compare-data.mjs 檢視差異,");
  console.log("確認合理後再加 --write 重跑。");
}
