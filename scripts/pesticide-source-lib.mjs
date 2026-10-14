import crypto from 'node:crypto';

export const SOURCE_URL = 'https://data.moa.gov.tw/Service/OpenData/FromM/PesticideData.aspx';
const text = value => String(value ?? '').trim();
export const permitKey = row => `${row.permit}|${row.permitNumber}`;
export function normalizePermit(row) {
  return Object.fromEntries(Object.entries({permit:'許可證字',permitNumber:'許可證號',chineseName:'中文名稱',pesticideCode:'農藥代號',englishName:'英文名稱',form:'劑型',content:'含量',revocationType:'撤銷類別',revocationDate:'撤銷日期',pesticideType:'農藥類別中文意義'}).map(([key, source]) => [key, text(row[source])]));
}
export function validatePermits(rows, minimum = 10000) {
  if (!Array.isArray(rows) || rows.length < minimum || rows.length === 9999) throw Error('官方許可證筆數異常或可能截斷');
  const keys = new Set();
  for (const raw of rows) {
    const row = normalizePermit(raw), key = permitKey(row);
    if (!row.permit || !/^\d+$/.test(row.permitNumber) || keys.has(key)) throw Error('許可證缺少編號或分頁重複');
    keys.add(key);
  }
  return rows;
}
export function detailUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'data.moa.gov.tw' || url.port || url.username || url.password || url.pathname !== '/Service/OpenData/FromM/PesticideDetail.aspx') throw Error('拒絕非官方使用範圍網址');
  return url.href;
}
export const hashRows = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
export function validateDetails(permits, details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) throw Error('使用範圍快照格式錯誤');
  for (const permit of permits) {
    if (!String(permit['農藥使用範圍'] || '').trim()) throw Error('許可證缺少使用範圍來源，不能確認完整性');
    detailUrl(permit['農藥使用範圍']);
    const rows = details[`${permit['許可證字']}-${permit['許可證號']}`];
    if (!Array.isArray(rows)) throw Error('使用範圍缺漏或抓取失敗，不可產生正式候選');
    for (const row of rows) if (!row || typeof row !== 'object' || !('作物名稱' in row) || !('病蟲害名稱' in row)) throw Error('使用範圍欄位變更，需人工檢核');
  }
}
export function validateScopeCoverage(details, minimumRows = 10000, minimumNonempty = 100) {
  const valid = Object.values(details).filter(Array.isArray);
  const rows = valid.reduce((sum, entries) => sum + entries.length, 0);
  const nonempty = valid.filter(entries => entries.length > 0).length;
  if (rows < minimumRows || nonempty < minimumNonempty) throw Error(`官方用法覆蓋異常（${rows}列／${nonempty}張非空許可證），拒絕更新；空陣列不代表全部撤銷`);
  return {rows, nonempty};
}
export function comparePermits(before, after) {
  const keyed = rows => {
    const result = new Map();
    for (const row of rows) {
      const key = permitKey(row);
      if (!row.permit || !row.permitNumber || result.has(key)) throw Error('快照許可證編號缺漏或重複');
      result.set(key, row);
    }
    return result;
  };
  const old = keyed(before), fresh = keyed(after);
  const changed = [];
  for (const [key, row] of fresh) if (old.has(key)) {
    const prior = old.get(key);
    const fields = [...new Set([...Object.keys(prior), ...Object.keys(row)])].filter(field => prior[field] !== row[field]);
    if (fields.length) changed.push({key, fields, before:prior, after:row});
  }
  return {added:after.filter(row => !old.has(permitKey(row))), removed:before.filter(row => !fresh.has(permitKey(row))), changed};
}
export async function fetchPermitList(fetcher = fetch, pageSize = 5000) {
  const all = [], seen = new Set();
  for (let skip = 0; skip <= 500000; skip += pageSize) {
    const response = await fetcher(`${SOURCE_URL}?$top=${pageSize}&$skip=${skip}`, {signal:AbortSignal.timeout(45000),redirect:'error'});
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw Error('官方端點未回傳陣列');
    for (const row of page) {
      const key = permitKey(normalizePermit(row));
      if (seen.has(key)) throw Error('官方分頁重複，不接受不完整快照');
      seen.add(key); all.push(row);
    }
    if (page.length < pageSize) return validatePermits(all);
  }
  throw Error('官方分頁未收斂');
}
