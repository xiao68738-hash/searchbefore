import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const SEARCH_URL = "https://pesticideresistance.org/search.php";
const OUTPUT = path.join(ROOT, "mrl-data", "pesticide-classification", "aprd-case-counts-v1.json");
const OPTIONS_SNAPSHOT = path.join(ROOT, "mrl-data", "pesticide-classification", "aprd-active-ingredient-options-v1.json");
const HIGH_RISK_THRESHOLD = 500;
const CONCURRENCY = 4;
const NAME_ALIASES = Object.freeze({
  pirmiphosmethyl: ["pirimiphosmethyl"],
  methylparathion: ["parathionmethyl"]
});

function decodeHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

function normalizeEnglish(value) {
  return decodeHtml(value).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function nameVariants(value) {
  const raw = decodeHtml(value).normalize("NFKC").toLowerCase().trim();
  const variants = new Set([normalizeEnglish(raw)]);
  const prefix = raw.match(/^(alpha|beta|gamma|lambda|theta|zeta)-(.+)$/);
  if (prefix) variants.add(normalizeEnglish(`${prefix[2]}-${prefix[1]}`));
  const suffix = raw.match(/^(.+)-(alpha|beta|gamma|lambda|theta|zeta)$/);
  if (suffix) variants.add(normalizeEnglish(`${suffix[2]}-${suffix[1]}`));
  for (const alias of NAME_ALIASES[normalizeEnglish(raw)] || []) variants.add(alias);
  return [...variants].filter(Boolean);
}

function parseActiveIngredientOptions(html) {
  const select = String(html).match(/<select\b[^>]*(?:id|name)=["']us_ainame["'][^>]*>[\s\S]*?<\/select>/i)?.[0] || "";
  const options = [];
  for (const match of select.matchAll(/<option\b[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi)) {
    const id = match[1].trim(), name = decodeHtml(match[2]);
    if (id && name && !/^all$/i.test(name)) options.push({ id, name });
  }
  if (!options.length) throw new Error("APRD 查詢頁找不到有效成分選項");
  return options;
}

function parseCaseRows(html) {
  const rows = [];
  for (const tr of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x => decodeHtml(x[1]));
    if (cells.length >= 5 && /^\d[\d,]*$/.test(cells[3])) rows.push(cells);
  }
  return rows;
}

function readTargets() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dataMatch = html.match(/const DATA=(\{.*?\});\r?\n/s);
  if (!dataMatch) throw new Error("index.html 找不到 const DATA");
  const data = JSON.parse(dataMatch[1]);
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, "mrl-data", "pesticides-latest.json"), "utf8"));
  const permitNames = new Map();
  for (const row of snapshot.rows || []) {
    const key = String(row.chineseName || "").normalize("NFKC").replace(/\s+/g, "");
    if (!key || !row.englishName) continue;
    const names = permitNames.get(key) || new Set();
    String(row.englishName).split(/\s*\+\s*/).map(x => x.trim()).filter(Boolean).forEach(x => names.add(x));
    permitNames.set(key, names);
  }
  const targets = new Map();
  for (const pests of Object.values(data)) for (const entries of Object.values(pests)) for (const row of entries) {
    if (!/\bIRAC\b/i.test(String(row.moa || ""))) continue;
    const chineseName = String(row.name || "").trim();
    const key = chineseName.normalize("NFKC").replace(/\s+/g, "");
    for (const englishName of permitNames.get(key) || []) {
      const normalized = normalizeEnglish(englishName);
      if (!normalized) continue;
      const current = targets.get(normalized) || { requestedName: englishName, chineseNames: new Set() };
      current.chineseNames.add(chineseName);
      targets.set(normalized, current);
    }
  }
  return [...targets.values()].map(x => ({ requestedName: x.requestedName, chineseNames: [...x.chineseNames].sort((a, b) => a.localeCompare(b, "zh-Hant")) }));
}

async function request(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { ...options, headers: { "user-agent": "SearchBefore resistance evidence updater/1.0", ...(options.headers || {}) } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

async function queryOption(option, requestedNames) {
  const body = new URLSearchParams({ us_ainame: option.id, submit: "Search" });
  const html = await request(SEARCH_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const rows = parseCaseRows(html);
  const caseCount = rows.reduce((sum, row) => sum + Number(row[3].replace(/,/g, "")), 0);
  return {
    activeIngredient: option.name,
    aprdOptionId: option.id,
    requestedNames: [...requestedNames].sort(),
    caseCount,
    speciesCount: rows.length,
    isHighResistanceRisk: caseCount > HIGH_RISK_THRESHOLD,
    status: "verified"
  };
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }));
  return output;
}

async function main() {
  const checkedAt = new Date().toISOString().slice(0, 10);
  const targets = readTargets();
  let options;
  try {
    const searchHtml = await request(SEARCH_URL);
    options = parseActiveIngredientOptions(searchHtml);
  } catch (error) {
    if (!fs.existsSync(OPTIONS_SNAPSHOT)) throw error;
    options = JSON.parse(fs.readFileSync(OPTIONS_SNAPSHOT, "utf8")).options;
    process.stderr.write("APRD 查詢頁受網站防護，改用同日瀏覽器擷取的官方選項快照。\n");
  }
  const optionByVariant = new Map();
  for (const option of options) for (const variant of nameVariants(option.name)) if (!optionByVariant.has(variant)) optionByVariant.set(variant, option);

  const matched = new Map(), unmatched = [];
  for (const target of targets) {
    const option = nameVariants(target.requestedName).map(key => optionByVariant.get(key)).find(Boolean);
    if (!option) { unmatched.push(target); continue; }
    const item = matched.get(option.id) || { option, requestedNames: new Set(), chineseNames: new Set() };
    item.requestedNames.add(target.requestedName);
    target.chineseNames.forEach(name => item.chineseNames.add(name));
    matched.set(option.id, item);
  }

  const jobs = [...matched.values()];
  const records = await mapLimit(jobs, CONCURRENCY, async (job, index) => {
    const record = await queryOption(job.option, job.requestedNames);
    record.chineseNames = [...job.chineseNames].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    if ((index + 1) % 20 === 0 || index + 1 === jobs.length) process.stderr.write(`APRD ${index + 1}/${jobs.length}\n`);
    return record;
  });
  records.sort((a, b) => b.caseCount - a.caseCount || a.activeIngredient.localeCompare(b.activeIngredient));

  const result = {
    schemaVersion: 1,
    checkedAt,
    source: {
      title: "Arthropod Pesticide Resistance Database",
      publisher: "Michigan State University",
      searchUrl: SEARCH_URL,
      citation: `Mota-Sanchez, D. and J.C. Wise. ${new Date().getFullYear()}. The Arthropod Pesticide Resistance Database.`
    },
    policy: {
      metric: "APRD reported resistance case count by active ingredient",
      operator: ">",
      threshold: HIGH_RISK_THRESHOLD,
      highDefinition: "caseCount > 500",
      boundaryAt500: "not_high"
    },
    summary: {
      requestedComponentCount: targets.length,
      matchedOptionCount: records.length,
      unmatchedComponentCount: unmatched.length,
      highRiskComponentCount: records.filter(x => x.isHighResistanceRisk).length
    },
    records,
    unmatched
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result.summary, null, 2));
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exit(1); });

export { HIGH_RISK_THRESHOLD, decodeHtml, normalizeEnglish, nameVariants, parseActiveIngredientOptions, parseCaseRows };
