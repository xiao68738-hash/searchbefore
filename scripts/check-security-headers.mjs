const target = process.argv[2] || "https://searchbefore.tw/";

const required = [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy"
];

const response = await fetch(target, { redirect: "follow" });
if (!response.ok) throw new Error(`${target} 回傳 HTTP ${response.status}`);

let failed = false;
for (const name of required) {
  const value = response.headers.get(name);
  if (!value) {
    failed = true;
    console.error(`✗ 缺少 ${name}`);
  } else {
    console.log(`✓ ${name}: ${value}`);
  }
}

const csp = response.headers.get("content-security-policy");
const reportOnly = response.headers.get("content-security-policy-report-only");
if (csp) console.log(`✓ content-security-policy: ${csp}`);
else if (reportOnly) console.log(`△ CSP 仍為觀察模式: ${reportOnly}`);
else {
  failed = true;
  console.error("✗ 缺少 Content-Security-Policy 或 Report-Only");
}

if (failed) process.exitCode = 1;
