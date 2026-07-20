/* MRL(農藥殘留容許量標準)資料下載腳本
   來源:政府資料開放平台 dataset 8944 / 衛福部食藥署
   用法:node mrl-data/fetch-mrl.mjs
   產出:mrl-data/mrl-<YYYY-MM-DD>.json + mrl-data/latest.json

   ── 原則 ──
   1. 此資料與農藥登記資料「分開維護、分開標版本」,不併入 index.html。
   2. 每次下載存成帶日期的快照,保留舊版可比對差異。
   3. 只下載與存檔,不做任何判定;判定邏輯另見 review-needed 產出腳本。
*/
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash, snapshotId, writeSnapshotPair } from "./lib.mjs";

const SRC_URL = "https://data.fda.gov.tw/data/opendata/export/13/json";
const DIR = path.dirname(fileURLToPath(import.meta.url));

async function fetchRows(attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const res = await fetch(SRC_URL, { signal: controller.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("下載失敗: " + (lastError?.message || lastError));
}

const rows = await fetchRows();
if (!Array.isArray(rows) || rows.length < 1_000) {
  throw new Error(`資料筆數非預期(至少 1,000 筆，實際 ${rows?.length ?? "非陣列"})`);
}

const need = ["國際普通名稱", "普通名稱", "作物類別", "容許量ppm", "備註"];
const bad = rows.findIndex(row => !row || need.some(key => !(key in row)));
if (bad !== -1) throw new Error(`第 ${bad + 1} 筆欄位與預期不符`);

const retrievedAt = new Date();
const payload = {
  schemaVersion: 2,
  source: "政府資料開放平台 dataset 8944(衛福部食藥署)",
  sourceUrl: SRC_URL,
  retrievedAt: retrievedAt.toISOString(),
  snapshotId: snapshotId(retrievedAt),
  contentSha256: contentHash(rows),
  count: rows.length,
  warnings: [],
  rows
};
const snapshot = writeSnapshotPair(DIR, "mrl", payload, "latest.json");
console.log(`已下載 ${rows.length} 筆 → ${path.basename(snapshot)}(同時更新 latest.json)`);
