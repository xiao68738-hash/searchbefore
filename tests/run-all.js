const { spawnSync } = require("node:child_process");
const path = require("node:path");

for (const file of ["safety.test.js", "farm-records.test.js", "account.test.js", "cloud-sync.test.js", "data-rules.test.js", "export-formats.test.js", "crop-forms.test.js", "query-aids.test.js", "mrl-data.test.js", "index-syntax.test.js"]) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("\n全部測試完成");
