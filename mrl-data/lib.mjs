import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const text = value => String(value == null ? "" : value).trim();
export const canonicalEnglish = value => text(value).replace(/\s+/g, " ").toUpperCase();

export function splitActiveIngredients(value) {
  return text(value)
    .split(/\s*\+\s*/)
    .map(canonicalEnglish)
    .filter(Boolean);
}

export function buildPesticideNameIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const chineseName = text(row.chineseName ?? row["中文名稱"]);
    const englishName = text(row.englishName ?? row.EnName ?? row["英文名稱"]);
    const components = splitActiveIngredients(englishName);
    if (!chineseName || !components.length) continue;

    const signature = components.join(" + ");
    if (!index.has(chineseName)) index.set(chineseName, new Map());
    const variants = index.get(chineseName);
    if (!variants.has(signature)) variants.set(signature, []);
    variants.get(signature).push(row);
  }
  return index;
}

export function resolvePesticideName(name, index) {
  const variants = index.get(text(name));
  if (!variants) return { status: "unresolved", reason: "name-not-found", components: [] };
  if (variants.size !== 1) {
    return {
      status: "ambiguous",
      reason: "multiple-component-sets",
      components: [],
      variants: [...variants.keys()]
    };
  }
  return {
    status: "resolved",
    reason: "official-name-match",
    components: splitActiveIngredients([...variants.keys()][0])
  };
}

export function buildEnglishSet(rows, fields) {
  const set = new Set();
  for (const row of rows) {
    for (const field of fields) {
      const value = canonicalEnglish(row[field]);
      if (value) set.add(value);
    }
  }
  return set;
}

export function classifyComponents(components, mrlEnglish, exemptEnglish) {
  return components.map(component => ({
    component,
    status: exemptEnglish.has(component)
      ? "exempt"
      : mrlEnglish.has(component)
        ? "mrl-listed"
        : "unresolved"
  }));
}

export function parseCropCategoryMembers(value) {
  return text(value)
    .replace(/[。；;]/g, "、")
    .split(/[、，,]/)
    .map(item => item.replace(/^\s*及\s*/, "").replace(/\s*等\s*$/, "").trim())
    .filter(Boolean);
}

export function contentHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function snapshotId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function writeJsonAtomic(file, value) {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, JSON.stringify(value), "utf8");
  fs.renameSync(temp, file);
}

export function writeSnapshotPair(dir, prefix, payload, latestName = `${prefix}-latest.json`) {
  const snapshot = path.join(dir, `${prefix}-${payload.snapshotId}.json`);
  writeJsonAtomic(snapshot, payload);
  writeJsonAtomic(path.join(dir, latestName), payload);
  return snapshot;
}
