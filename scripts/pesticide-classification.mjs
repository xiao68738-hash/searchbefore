import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = path.join(DIR, "..", "mrl-data", "pesticide-classification", "catalog-v1.json");
const DEFAULT_HIGH_RISK_PATH = path.join(DIR, "..", "mrl-data", "pesticide-classification", "high-resistance-risk-v1.json");
const RISK_SCORE = Object.freeze({ not_high: 0, high: 1 });
const RISK_LABEL = Object.freeze({ not_high: "未列為高抗藥性風險", high: "高抗藥性風險" });
const MOVEMENT_LABEL = Object.freeze({
  systemic: "系統性",
  selective_systemic: "選擇系統性",
  local_systemic: "局部系統性",
  translaminar: "穿層滲透",
  bidirectional: "上下移行",
  non_systemic: "非系統性",
  unknown: "待確認"
});

export function loadClassificationCatalog(file = DEFAULT_CATALOG_PATH) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadHighResistanceRiskMarkers(file = DEFAULT_HIGH_RISK_PATH) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function normalizeIngredientName(value) {
  return String(value == null ? "" : value).normalize("NFKC").replace(/[\s·‧．・-]+/g, "").trim();
}

export function parseMechanismCodes(value) {
  const raw = String(value == null ? "" : value).trim();
  const familyMatch = raw.match(/\b(IRAC|FRAC|HRAC)\b/i);
  if (!familyMatch) return [];
  const family = familyMatch[1].toUpperCase();
  const tail = raw.slice(familyMatch.index + familyMatch[0].length)
    .replace(/\([^)]*(?:新|舊)[^)]*\)/g, " ")
    .replace(/(?:新|舊)/g, " ");
  const tokens = tail.match(/(?:BM|UN|[A-Z])?\d+(?:\.\d+)?[A-Z]?|UN[A-Z]?/gi) || [];
  return [...new Set(tokens.map(code => ({ family, code: code.toUpperCase() })))];
}

function buildMovementIndex(catalog) {
  const index = new Map();
  for (const profile of catalog.movementProfiles || []) {
    for (const name of profile.names || []) {
      const key = normalizeIngredientName(name);
      if (!key) continue;
      if (index.has(key)) throw new Error(`重複的藥劑移行分類：${name}`);
      index.set(key, {
        movement: profile.movement,
        label: MOVEMENT_LABEL[profile.movement] || profile.movement,
        isSystemic: profile.movement === "non_systemic" ? false : true,
        sourcePages: [...(profile.sourcePages || [])],
        evidence: profile.evidence || "第四版表格之藥劑特性標記",
        confidence: profile.confidence || "not_recorded",
        sourceReference: profile.sourceReference || null
      });
    }
  }
  return index;
}

const markerIndexCache = new WeakMap();
function buildMarkerIndex(markers) {
  let index = markerIndexCache.get(markers);
  if (index) return index;
  index = new Map((markers.entries || []).map(entry => [normalizeIngredientName(entry.name), entry]));
  markerIndexCache.set(markers, index);
  return index;
}

export function resolveResistanceRisk(entry, catalog = loadClassificationCatalog(), markers = loadHighResistanceRiskMarkers()) {
  const sourceEntry = typeof entry === "object" && entry ? entry : { name: String(entry || "") };
  const found = buildMarkerIndex(markers).get(normalizeIngredientName(sourceEntry.name));
  const isHighRisk = found?.isHighResistanceRisk === true;
  const level = isHighRisk ? "high" : "not_high";
  return {
    level,
    label: RISK_LABEL[level],
    isHighRisk,
    basis: found ? "ingredient_aprd_case_count" : "unlisted",
    caseCount: found?.caseCount ?? null,
    evidenceStatus: found?.evidenceStatus || "unlisted",
    threshold: markers.policy?.threshold ?? 500,
    operator: markers.policy?.operator || ">",
    source: found ? markers.source : null,
    matchedCodes: parseMechanismCodes(sourceEntry.moa)
  };
}

export function resolveMovement(name, catalog = loadClassificationCatalog()) {
  const found = buildMovementIndex(catalog).get(normalizeIngredientName(name));
  if (found) return { ...found, basis: "ingredient" };
  return { movement: "unknown", label: MOVEMENT_LABEL.unknown, isSystemic: null, basis: "unclassified", sourcePages: [], evidence: "未收錄；不可推論為非系統性", confidence: "unverified", sourceReference: null };
}

export function classifyPesticide(entry, catalog = loadClassificationCatalog()) {
  const source = entry || {};
  return {
    name: String(source.name || "").trim(),
    moa: String(source.moa || "").trim(),
    resistanceRisk: resolveResistanceRisk(source, catalog),
    movement: resolveMovement(source.name, catalog)
  };
}

export function filterPesticides(entries, options = {}, catalog = loadClassificationCatalog()) {
  const wantedMovement = options.movement || "any";
  return (Array.isArray(entries) ? entries : []).filter(entry => {
    const classified = classifyPesticide(entry, catalog);
    if (options.highResistanceRiskOnly && !classified.resistanceRisk.isHighRisk) return false;
    if (wantedMovement === "systemic" && classified.movement.isSystemic !== true) return false;
    if (wantedMovement === "non_systemic" && classified.movement.isSystemic !== false) return false;
    if (wantedMovement === "unknown" && classified.movement.isSystemic !== null) return false;
    return true;
  });
}

export function summarizeClassificationCoverage(entries, catalog = loadClassificationCatalog()) {
  const rows = Array.isArray(entries) ? entries : [];
  const summary = { total: rows.length, resistanceClassified: 0, movementClassified: 0, systemic: 0, nonSystemic: 0, unknownMovement: 0 };
  for (const entry of rows) {
    const result = classifyPesticide(entry, catalog);
    if (result.resistanceRisk.basis !== "unlisted") summary.resistanceClassified += 1;
    if (result.movement.isSystemic === true) { summary.movementClassified += 1; summary.systemic += 1; }
    else if (result.movement.isSystemic === false) { summary.movementClassified += 1; summary.nonSystemic += 1; }
    else summary.unknownMovement += 1;
  }
  return summary;
}

export { DEFAULT_CATALOG_PATH, DEFAULT_HIGH_RISK_PATH, MOVEMENT_LABEL, RISK_LABEL, RISK_SCORE };
