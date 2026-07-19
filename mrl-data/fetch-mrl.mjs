/* MRL(農藥殘留容許量標準)資料下載腳本
   來源:政府資料開放平台 dataset 8944 / 衛福部食藥署
   用法:node mrl-data/fetch-mrl.mjs
   產出:mrl-data/mrl-<YYYY-MM-DD>.json + mrl-data/latest.json

   ── 原則 ──
   1. 此資料與農藥登記資料「分開維護、分開標版本」,不併入 index.html。
   2. 每次下載存成帶日期的快照,保留舊版可比對差異。
   3. 只下載與存檔,不做任何判定;判定邏輯另見 review-needed 產出腳本。
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_URL = "https://data.fda.gov.tw/data/opendata/export/13/json";
const DIR = path.dirname(fileURLToPath(import.meta.url));

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const res = await fetch(SRC_URL);
if (!res.ok) throw new Error("下載失敗 HTTP " + res.status);
const rows = await res.json();
if (!Array.isArray(rows) || !rows.length) throw new Error("資料格式非預期(應為非空陣列)");

const need = ["國際普通名稱", "普通名稱", "作物類別", "容許量ppm", "備註"];
const missing = need.filter(k => !(k in rows[0]));
if (missing.length) throw new Error("欄位與預期不符,缺少:" + missing.join("、"));

const stamp = today();
const payload = {
  source: "政府資料開放平台 dataset 8944(衛福部食藥署)",
  url: SRC_URL,
  fetchedAt: new Date().toISOString(),
  version: stamp,
  count: rows.length,
  rows
};
fs.writeFileSync(path.join(DIR, `mrl-${stamp}.json`), JSON.stringify(payload, null, 0), "utf8");
fs.writeFileSync(path.join(DIR, "latest.json"), JSON.stringify(payload, null, 0), "utf8");
console.log(`已下載 ${rows.length} 筆 → mrl-${stamp}.json(同時更新 latest.json)`);
