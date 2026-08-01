const { spawnSync } = require("node:child_process");
const path = require("node:path");

for (const file of ["safety.test.js", "farm-records.test.js", "account.test.js", "payment-boundary.test.js", "cloud-sync.test.js", "data-rules.test.js", "export-formats.test.js", "crop-forms.test.js", "query-aids.test.js", "form-ocr.test.js", "form-ocr-ui.test.js", "feature-release-gate.test.js", "android-ocr-source.test.js", "agent-search.test.js", "mrl-data.test.js", "mrl-review-gate.test.js", "index-syntax.test.js"]) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("\n全部測試完成");
