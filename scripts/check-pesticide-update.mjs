import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { fetchPermitList, comparePermits, hashRows } from './pesticide-source-lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const SOURCE_URL = "https://data.moa.gov.tw/Service/OpenData/FromM/PesticideData.aspx";
const text = value => String(value == null ? "" : value).trim();
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out')) throw Error('用法：[--out 新證據目錄]');
const output = args.length ? path.resolve(args[1]) : null;
if (output && fs.existsSync(output)) throw Error('證據目錄已存在，請用新目錄避免覆寫');
const rows = await fetchPermitList();
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
if (current.count !== current.rows.length || current.contentSha256 !== hashRows(current.rows)) throw Error('專案快照完整性錯誤');
const diff = comparePermits(current.rows, normalized);
if (output) {
  fs.mkdirSync(output, {recursive:true});
  fs.writeFileSync(path.join(output, 'permits.json'), JSON.stringify(rows), {flag:'wx'});
  fs.writeFileSync(path.join(output, 'permit-diff.json'), JSON.stringify({checkedAt:new Date().toISOString(), sourceUrl:SOURCE_URL, baselineRetrievedAt:current.retrievedAt, baselineCount:current.count, currentCount:normalized.length, contentSha256:sha256, scope:'permit-metadata-only', usageDetailsChecked:false, ...diff}, null, 2), {flag:'wx'});
  console.log(`唯讀差異證據：${output}`);
}
console.log('注意：許可證清單無變動不代表使用範圍無變動；不得僅依本檢查更新前端資料日期。');

console.log(`官方目前：${normalized.length} 筆 / ${sha256}`);
console.log(`專案快照：${current.count} 筆 / ${current.contentSha256}`);
if (sha256 === current.contentSha256 && normalized.length === current.count) {
  console.log("✓ 農藥許可證欄位沒有變動；用法明細仍需獨立檢核。");
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
  for (const item of diff.changed) console.log(`  欄位 ${item.key}: ${item.fields.map(key => `${key}: ${item.before[key]} → ${item.after[key]}`).join('；')}`);
  process.exitCode = 2;
}
