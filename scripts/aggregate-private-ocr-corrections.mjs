import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PRIVATE_ROOT = "D:\\SearchBefore\\private";
const ALLOWED_FIELDS = new Set([
  "recordType", "date", "crop", "target", "material", "dilution",
  "amount", "safetyInterval", "activity", "method"
]);

function normalizedText(value) {
  return String(value == null ? "" : value).normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function pathIsInsidePrivate(targetPath, privateRoot = DEFAULT_PRIVATE_ROOT) {
  const root = path.resolve(privateRoot);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function validateCorrectionRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) errors.push("record must be an object");
  if (Number(record && record.schemaVersion) !== 1) errors.push("unsupported schemaVersion");
  if (record && record.recordType !== "ocr-local-correction") errors.push("invalid recordType");
  if (!/^ocr-correction-[a-f0-9]{8}$/.test(String(record && record.correctionId || ""))) errors.push("invalid correctionId");
  const privacy = record && record.privacy;
  if (!privacy || privacy.storage !== "user-download-only" || privacy.autoUploadAllowed !== false) errors.push("unsafe privacy declaration");
  if (privacy && (privacy.imageIncluded !== false || privacy.sourceFileMetadataIncluded !== false || privacy.accountIdentifiersIncluded !== false)) {
    errors.push("record may contain identifying source data");
  }
  const contentWithoutPrivacyDeclaration = Object.assign({}, record || {});
  delete contentWithoutPrivacyDeclaration.privacy;
  const serialized = JSON.stringify(contentWithoutPrivacyDeclaration);
  if (/data:image|base64|imageData|imageUri|fileName|sourceImageId|requestId|accountId|operator|fieldPlot/i.test(serialized)) {
    errors.push("forbidden source or identifying field");
  }
  const fields = Array.isArray(record && record.fields) ? record.fields : [];
  if (!fields.length) errors.push("record has no confirmed fields");
  fields.forEach(function (field, index) {
    if (!field || !ALLOWED_FIELDS.has(field.key)) errors.push("invalid field key at index " + index);
    if (!normalizedText(field && field.confirmedValue)) errors.push("missing confirmedValue at index " + index);
    if (!Array.isArray(field && field.candidates) || field.candidates.length > 20) errors.push("invalid candidates at index " + index);
    (Array.isArray(field && field.candidates) ? field.candidates : []).forEach(function (candidate) {
      if (!normalizedText(candidate && candidate.value) || normalizedText(candidate.value).length > 240) errors.push("invalid candidate at index " + index);
    });
  });
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function aggregateCorrectionRecords(records, generatedAt = new Date().toISOString()) {
  const accepted = [];
  const rejected = [];
  const seenIds = new Set();
  (Array.isArray(records) ? records : []).forEach(function (record, index) {
    const validation = validateCorrectionRecord(record);
    if (!validation.ok) {
      rejected.push({ index, errors: validation.errors });
      return;
    }
    if (seenIds.has(record.correctionId)) {
      rejected.push({ index, errors: ["duplicate correctionId"] });
      return;
    }
    seenIds.add(record.correctionId);
    accepted.push(record);
  });
  const metricMap = new Map();
  accepted.forEach(function (record) {
    record.fields.forEach(function (field) {
      const metric = metricMap.get(field.key) || { field: field.key, confirmed: 0, exact: 0, withCandidate: 0 };
      metric.confirmed += 1;
      if (field.exactMatch === true) metric.exact += 1;
      if (field.candidates.length) metric.withCandidate += 1;
      metricMap.set(field.key, metric);
    });
  });
  const fieldMetrics = Array.from(metricMap.values()).sort(function (left, right) {
    return left.field.localeCompare(right.field);
  }).map(function (metric) {
    return Object.freeze(Object.assign({}, metric, {
      exactRate: metric.confirmed ? metric.exact / metric.confirmed : 0,
      outputRate: metric.confirmed ? metric.withCandidate / metric.confirmed : 0
    }));
  });
  return Object.freeze({
    schemaVersion: 1,
    datasetType: "ocr-private-field-ground-truth",
    generatedAt,
    privacy: Object.freeze({ storage: "private-workspace-only", publishAllowed: false }),
    summary: Object.freeze({ accepted: accepted.length, rejected: rejected.length, fieldMetrics: Object.freeze(fieldMetrics) }),
    records: Object.freeze(accepted),
    rejected: Object.freeze(rejected)
  });
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

async function runCli() {
  const args = process.argv.slice(2);
  const privateRoot = optionValue(args, "--private-root", DEFAULT_PRIVATE_ROOT);
  const inputDir = optionValue(args, "--input", path.join(privateRoot, "ocr-corrections"));
  const outputFile = optionValue(args, "--output", path.join(privateRoot, "ocr-corrections", "field-ground-truth.json"));
  if (!pathIsInsidePrivate(inputDir, privateRoot) || !pathIsInsidePrivate(outputFile, privateRoot)) {
    throw new Error("Input and output must remain inside the private workspace");
  }
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^ocr-correction-.*\.json$/i.test(entry.name) || path.resolve(inputDir, entry.name) === path.resolve(outputFile)) continue;
    const filePath = path.join(inputDir, entry.name);
    const stat = await fs.stat(filePath);
    if (stat.size > 1024 * 1024) {
      records.push({ invalidOversizedFile: true });
      continue;
    }
    try {
      records.push(JSON.parse(await fs.readFile(filePath, "utf8")));
    } catch (_) {
      records.push({ invalidJsonFile: true });
    }
  }
  const aggregate = aggregateCorrectionRecords(records);
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(aggregate, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({ outputFile, accepted: aggregate.summary.accepted, rejected: aggregate.summary.rejected }) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch(function (error) {
    process.stderr.write(String(error && error.message || error) + "\n");
    process.exitCode = 1;
  });
}
