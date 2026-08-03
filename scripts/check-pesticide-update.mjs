import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const SOURCE_URL = "https://data.moa.gov.tw/Service/OpenData/FromM/PesticideData.aspx";
const PAGE = 5000;

async function fetchPage(skip) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${SOURCE_URL}?$top=${PAGE}&$skip=${skip}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error("官方端點未回傳陣列");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const text = value => String(value == null ? "" : value).trim();
const rows = [];
for (let skip = 0; ; skip += PAGE) {
  const page = await fetchPage(skip);
  rows.push(...page);
  if (page.length < PAGE) break;
  if (rows.length > 500000) throw new Error("官方資料分頁未收斂");
}
if (rows.length < 10000 || rows.length === 9999) throw new Error(`官方資料筆數異常：${rows.length}`);

const normalized = rows.map(row => ({
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
const sha256 = crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
const current = JSON.parse(fs.readFileSync(path.join(ROOT, "mrl-data", "pesticides-latest.json"), "utf8"));

console.log(`官方目前：${normalized.length} 筆 / ${sha256}`);
console.log(`專案快照：${current.count} 筆 / ${current.contentSha256}`);
if (sha256 === current.contentSha256 && normalized.length === current.count) {
  console.log("✓ 農藥許可證資料沒有變動，不需更新專案資料。");
} else {
  const keyOf = row => `${row.permit}|${row.permitNumber}`;
  const before = new Map((current.rows || []).map(row => [keyOf(row), row]));
  const after = new Map(normalized.map(row => [keyOf(row), row]));
  const added = normalized.filter(row => !before.has(keyOf(row)));
  const removed = (current.rows || []).filter(row => !after.has(keyOf(row)));
  const changed = normalized.filter(row => {
    const old = before.get(keyOf(row));
    return old && JSON.stringify(old) !== JSON.stringify(row);
  });
  console.log("△ 官方農藥許可證資料已有變動；先執行完整比對與人工抽驗，不直接覆寫前端 DATA。");
  console.log(`  新增 ${added.length}｜移除 ${removed.length}｜欄位變更 ${changed.length}`);
  for (const row of added.slice(0, 20)) console.log(`  + ${row.permit}${row.permitNumber} ${row.chineseName}`);
  for (const row of removed.slice(0, 20)) console.log(`  - ${row.permit}${row.permitNumber} ${row.chineseName}`);
  for (const row of changed.slice(0, 20)) console.log(`  ~ ${row.permit}${row.permitNumber} ${row.chineseName}`);
  process.exitCode = 2;
}
