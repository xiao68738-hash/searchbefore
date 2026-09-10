import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMechanismCodes } from "./pesticide-classification.mjs";
import { HIGH_RISK_THRESHOLD, normalizeEnglish } from "./fetch-aprd-case-counts.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const OUTPUT_DIR = path.join(ROOT, "mrl-data", "pesticide-classification");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "resistance-literature-ledger-v1.json");
const OUTPUT_MARKERS = path.join(OUTPUT_DIR, "high-resistance-risk-v1.json");
const OUTPUT_REPORT = path.join(ROOT, "docs", "高抗藥性風險藥劑清單-2026-08-14.md");
const APRD_COUNTS = path.join(OUTPUT_DIR, "aprd-case-counts-v1.json");

const SOURCES = Object.freeze({
  baseline: {
    id: "taiwan-fourth-edition-2023",
    title: "農用藥劑分類及作用機制檢索（第四版）",
    published: "2023-01",
    localPath: "C:\\Users\\xiao6\\Downloads\\農用藥劑分類及作用機制檢索(第四版)(112年1月).pdf",
    role: "判定標準基準"
  },
  irac: {
    id: "irac-moa-11.5",
    title: "IRAC Mode of Action Classification Scheme, Version 11.5",
    published: "2026-02",
    url: "https://irac-online.org/documents/moa-classification/",
    role: "確認哪些有效成分屬殺蟲劑；不以作用機制代碼判定風險"
  },
  aprd: {
    id: "aprd",
    title: "Arthropod Pesticide Resistance Database",
    publisher: "Michigan State University",
    url: "https://pesticideresistance.org/",
    searchUrl: "https://pesticideresistance.org/search.php",
    role: "逐有效成分取得抗藥性案例數"
  }
});

function readSearchRows() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const match = html.match(/const DATA=(\{.*?\});\r?\n/s);
  if (!match) throw new Error("index.html 找不到 const DATA");
  const data = JSON.parse(match[1]);
  const rows = [];
  for (const pests of Object.values(data)) {
    for (const entries of Object.values(pests)) rows.push(...entries);
  }
  return rows;
}

function normalizeName(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function buildPermitIndex() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, "mrl-data", "pesticides-latest.json"), "utf8"));
  const index = new Map();
  for (const row of snapshot.rows || []) {
    const key = normalizeName(row.chineseName);
    if (!key) continue;
    const list = index.get(key) || [];
    list.push(row);
    index.set(key, list);
  }
  return { snapshot, index };
}

function decideRisk(codes, evidence) {
  const iracCodes = unique(codes.filter(x => x.family === "IRAC").map(x => x.code));
  const highRecords = (evidence?.records || []).filter(x => x.caseCount > HIGH_RISK_THRESHOLD);
  const highRisk = highRecords.length > 0;
  const maxCaseCount = evidence?.maxCaseCount ?? null;
  const evidenceStatus = !iracCodes.length ? "not_aprd_scope" : (evidence?.unmatchedComponents?.length ? (evidence.records.length ? "partial" : "unmatched") : "verified");
  return {
    status: highRisk ? "high" : "not_high",
    highRisk,
    basis: "APRD_CASE_COUNT",
    matchedCodes: iracCodes,
    evidenceStatus,
    caseCount: maxCaseCount,
    threshold: HIGH_RISK_THRESHOLD,
    operator: ">",
    reason: highRisk
      ? `APRD 有效成分 ${highRecords.map(x => x.activeIngredient).join(", ")} 案例數高於 ${HIGH_RISK_THRESHOLD} 件`
      : (maxCaseCount != null ? `APRD 已查案例數未高於 ${HIGH_RISK_THRESHOLD} 件` : `未取得高於 ${HIGH_RISK_THRESHOLD} 件的 APRD 證據，不顯示高風險標記`)
  };
}

function markdownTable(rows) {
  if (!rows.length) return "（無）";
  return [
    "| 藥劑名 | 英文成分 | APRD 案例數 | 判定依據 |",
    "|---|---|---:|---|",
    ...rows.map(row => `| ${row.name} | ${row.englishNames.join("<br>") || "—"} | ${row.decision.caseCount ?? "—"} | ${row.decision.reason} |`)
  ].join("\n");
}

const aprdCounts = JSON.parse(fs.readFileSync(APRD_COUNTS, "utf8"));
if (aprdCounts.policy?.operator !== ">" || aprdCounts.policy?.threshold !== HIGH_RISK_THRESHOLD) {
  throw new Error(`APRD 門檻必須是 caseCount > ${HIGH_RISK_THRESHOLD}`);
}
const aprdIndex = new Map();
for (const record of aprdCounts.records || []) {
  for (const name of [record.activeIngredient, ...(record.requestedNames || [])]) {
    const key = normalizeEnglish(name);
    if (key) aprdIndex.set(key, record);
  }
}
function resolveAprdEvidence(components, isIrac) {
  if (!isIrac) return { records: [], unmatchedComponents: [], maxCaseCount: null, status: "not_aprd_scope" };
  const records = [], unmatchedComponents = [];
  for (const component of components) {
    const found = aprdIndex.get(normalizeEnglish(component));
    if (found && !records.some(x => x.aprdOptionId === found.aprdOptionId)) records.push(found);
    else if (!found) unmatchedComponents.push(component);
  }
  return {
    records,
    unmatchedComponents,
    maxCaseCount: records.length ? Math.max(...records.map(x => x.caseCount)) : null,
    status: unmatchedComponents.length ? (records.length ? "partial" : "unmatched") : "verified"
  };
}

const searchRows = readSearchRows();
const { snapshot, index: permitIndex } = buildPermitIndex();
const grouped = new Map();
for (const row of searchRows) {
  const name = String(row.name || "").trim();
  if (!name) continue;
  const current = grouped.get(name) || { rows: 0, mechanisms: [] };
  current.rows += 1;
  if (row.moa) current.mechanisms.push(String(row.moa).trim());
  grouped.set(name, current);
}

const ingredients = [...grouped].map(([name, item]) => {
  const permits = permitIndex.get(normalizeName(name)) || [];
  const mechanisms = unique(item.mechanisms);
  const codes = unique(mechanisms.flatMap(parseMechanismCodes).map(x => `${x.family}:${x.code}`))
    .map(value => { const [family, code] = value.split(":"); return { family, code }; });
  const englishNames = unique(permits.map(row => String(row.englishName || "").trim()));
  const components = unique(englishNames.flatMap(value => value.split(/\s*\+\s*/)).map(value => value.trim()));
  const isIrac = codes.some(x => x.family === "IRAC");
  const aprd = resolveAprdEvidence(components, isIrac);
  const decision = decideRisk(codes, aprd);
  return {
    name,
    englishNames,
    components,
    isMixture: englishNames.some(value => value.includes("+")),
    pesticideCodes: unique(permits.map(row => row.pesticideCode)),
    pesticideTypes: unique(permits.map(row => row.pesticideType)),
    searchRowCount: item.rows,
    permitRowCount: permits.length,
    mechanisms,
    mechanismCodes: codes,
    decision,
    aprd: isIrac ? {
      checkedAt: aprdCounts.checkedAt,
      status: aprd.status,
      caseCount: aprd.maxCaseCount,
      records: aprd.records.map(x => ({ activeIngredient: x.activeIngredient, caseCount: x.caseCount, speciesCount: x.speciesCount, aprdOptionId: x.aprdOptionId })),
      unmatchedComponents: aprd.unmatchedComponents
    } : null
  };
}).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

const statuses = unique(ingredients.map(x => x.decision.status));
const countsByStatus = Object.fromEntries(statuses.map(status => [status, ingredients.filter(x => x.decision.status === status).length]));
const high = ingredients.filter(x => x.decision.status === "high");
const englishMatchedCount = ingredients.filter(x => x.englishNames.length).length;
const mechanismClassifiedCount = ingredients.filter(x => x.mechanismCodes.length).length;
const mixtureCount = ingredients.filter(x => x.isMixture).length;
const aprdVerifiedCount = ingredients.filter(x => x.aprd?.status === "verified").length;
const aprdPartialCount = ingredients.filter(x => x.aprd?.status === "partial").length;
const ledger = {
  schemaVersion: 1,
  generatedAt: aprdCounts.checkedAt,
  standard: {
    displayOptions: ["high", "not_high"],
    high: `APRD 單一有效成分抗藥性案例數高於 ${HIGH_RISK_THRESHOLD} 件（caseCount > ${HIGH_RISK_THRESHOLD}）`,
    notHigh: `未取得 caseCount > ${HIGH_RISK_THRESHOLD} 的證據；前端不顯示低風險或安全字樣`,
    mechanismPolicy: "IRAC／FRAC／HRAC 作用機制代碼不得直接推定為高抗藥性風險"
  },
  sources: SOURCES,
  sourceSnapshots: {
    pesticidePermits: { snapshotId: snapshot.snapshotId, retrievedAt: snapshot.retrievedAt, rowCount: snapshot.count },
    aprd: { checkedAt: aprdCounts.checkedAt, matchedOptionCount: aprdCounts.summary.matchedOptionCount, unmatchedComponentCount: aprdCounts.summary.unmatchedComponentCount }
  },
  summary: { totalIngredientNames: ingredients.length, totalSearchRows: searchRows.length, englishMatchedCount, mechanismClassifiedCount, mixtureCount, strictHighCount: high.length, notHighCount: ingredients.length - high.length, aprdVerifiedCount, aprdPartialCount, countsByStatus },
  ingredients
};

const markers = {
  schemaVersion: 1,
  generatedAt: aprdCounts.checkedAt,
  policy: {
    field: "isHighResistanceRisk",
    type: "boolean",
    metric: aprdCounts.policy.metric,
    operator: ">",
    threshold: HIGH_RISK_THRESHOLD,
    boundaryAt500: false,
    trueLabel: "高抗藥性風險",
    falseLabel: "未列為高抗藥性風險",
    displayRule: "正式查詢只顯示 true；false 不顯示低風險或安全標籤"
  },
  source: aprdCounts.source,
  summary: { total: ingredients.length, high: high.length, notHigh: ingredients.length - high.length },
  entries: ingredients.map(item => ({
    name: item.name,
    isHighResistanceRisk: item.decision.highRisk,
    caseCount: item.decision.caseCount,
    evidenceStatus: item.decision.evidenceStatus,
    checkedAt: item.aprd?.checkedAt || null
  }))
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
fs.writeFileSync(OUTPUT_MARKERS, `${JSON.stringify(markers, null, 2)}\n`, "utf8");

const report = `# 高抗藥性風險藥劑清單（文獻更新基準）

更新日：${aprdCounts.checkedAt}

## 結論

- 現有查詢系統共有 ${ingredients.length} 個藥劑名、${searchRows.length} 筆使用資料。
- 已對應英文成分 ${englishMatchedCount} 個，其中 ${mixtureCount} 個至少包含一筆混劑資料；已有作用機制代碼 ${mechanismClassifiedCount} 個。
- 依使用者指定的嚴格門檻，只有 APRD 單一有效成分案例數 **高於 ${HIGH_RISK_THRESHOLD} 件**才標示高風險；剛好 500 件不列入。
- 共 ${high.length} 個查詢藥劑名符合高風險標記，其餘 ${ingredients.length - high.length} 個為「未列為高抗藥性風險」。
- IRAC／FRAC／HRAC 代碼只保留為作用機制資料，不再直接推定高風險。
- 未列為高風險不等於低風險或安全；正式畫面只需要顯示高風險標記。

## 高抗藥性風險清單（APRD caseCount > ${HIGH_RISK_THRESHOLD}）

${markdownTable(high)}

## 狀態統計

${Object.entries(countsByStatus).map(([status, count]) => `- \`${status}\`: ${count}`).join("\n")}

## 資料來源與限制

- 基準文件：農用藥劑分類及作用機制檢索（第四版，2023-01）。
- 殺蟲劑作用機制：IRAC MoA v11.5（2026-02）；只用來辨識 APRD 適用範圍。
- 案例數：Michigan State University APRD，查詢日 ${aprdCounts.checkedAt}。
- 第四版原文為「500 種以上」；本清單依本次明確需求採更嚴格的 \`> 500\`，不是 \`>= 500\`。
- APRD 的「沒有資料」不代表沒有抗藥性，因此「未列為高風險」不可解讀為安全。
- 完整逐藥名證據、英文成分、混劑拆分與狀態位於 \`mrl-data/pesticide-classification/resistance-literature-ledger-v1.json\`。
`;
fs.writeFileSync(OUTPUT_REPORT, report, "utf8");

console.log(JSON.stringify(ledger.summary, null, 2));

export { OUTPUT_JSON, OUTPUT_MARKERS, OUTPUT_REPORT, decideRisk };
