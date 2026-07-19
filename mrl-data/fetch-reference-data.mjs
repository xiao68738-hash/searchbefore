/* 下載 MRL 對照所需的官方參考資料。
   只建立離線資料快照，不接入 App，也不做法規判定。
*/
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash, snapshotId, text, writeSnapshotPair } from "./lib.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = {
  pesticides: {
    dataset: "農業部 dataset 7293 農藥資料查詢",
    url: "https://data.moa.gov.tw/Service/OpenData/FromM/PesticideData.aspx"
  },
  cropCategories: {
    dataset: "食藥署 dataset 8940 農作物類農產品分類表",
    url: "https://data.fda.gov.tw/data/opendata/export/16/json"
  },
  exempt: {
    dataset: "食藥署 dataset 8943 得免訂定容許量之農藥一覽表",
    url: "https://data.fda.gov.tw/data/opendata/export/14/json"
  }
};

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`下載失敗 ${url}: ${lastError?.message || lastError}`);
}

function assertRows(rows, required, label, minimum = 1) {
  if (!Array.isArray(rows) || rows.length < minimum) {
    throw new Error(`${label} 筆數異常，預期至少 ${minimum} 筆，實際 ${rows?.length ?? "非陣列"}`);
  }
  const bad = rows.findIndex(row => !row || required.some(key => !(key in row)));
  if (bad !== -1) throw new Error(`${label} 第 ${bad + 1} 筆缺少必要欄位`);
}

const [rawPesticides, cropCategories, exempt] = await Promise.all([
  fetchJson(SOURCES.pesticides.url),
  fetchJson(SOURCES.cropCategories.url),
  fetchJson(SOURCES.exempt.url)
]);

assertRows(rawPesticides, ["許可證字", "許可證號", "中文名稱", "英文名稱", "農藥代號"], "農藥許可證", 5_000);
assertRows(cropCategories, ["類別", "農作物類農產品"], "作物分類", 10);
assertRows(exempt, ["農藥名稱", "英文名稱"], "免訂容許量清單", 10);

const pesticides = rawPesticides.map(row => ({
  permit: text(row["許可證字"]),
  permitNumber: text(row["許可證號"]),
  chineseName: text(row["中文名稱"]),
  pesticideCode: text(row["農藥代號"]),
  englishName: text(row["英文名稱"]),
  form: text(row["劑型"]),
  content: text(row["含量"]),
  revocationType: text(row["撤銷類別"]),
  revocationDate: text(row["撤銷日期"]),
  pesticideType: text(row["農藥類別中文意義"])
}));

const retrievedAt = new Date();
const id = snapshotId(retrievedAt);
const makePayload = (source, rows, warnings = []) => ({
  schemaVersion: 1,
  source: source.dataset,
  sourceUrl: source.url,
  retrievedAt: retrievedAt.toISOString(),
  snapshotId: id,
  contentSha256: contentHash(rows),
  count: rows.length,
  warnings,
  rows
});

const pesticideWarnings = [];
if (pesticides.length === 9_999) {
  pesticideWarnings.push("來源剛好回傳 9,999 筆，可能是舊版端點上限；任何查無結果都只能列為尚未解析。");
}

const outputs = [
  writeSnapshotPair(DIR, "pesticides", makePayload(SOURCES.pesticides, pesticides, pesticideWarnings)),
  writeSnapshotPair(DIR, "crop-categories", makePayload(SOURCES.cropCategories, cropCategories)),
  writeSnapshotPair(DIR, "mrl-exempt", makePayload(SOURCES.exempt, exempt))
];

for (const file of outputs) console.log(`已建立 ${path.basename(file)}`);
console.log(`農藥 ${pesticides.length} 筆｜作物分類 ${cropCategories.length} 筆｜免訂容許量 ${exempt.length} 筆`);
