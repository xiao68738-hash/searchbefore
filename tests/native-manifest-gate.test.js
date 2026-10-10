const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
for (const [file, variant] of [
  ['scripts/build-android-native.ps1', 'debug'],
  ['scripts/build-android-native-internal.ps1', 'release'],
]) {
  const script = read(file);
  assert.ok(script.includes("'VerifyNativeManifest.java') " + variant), 'builder must run the variant-specific verifier');
  assert.ok(script.includes('merged_manifests\\' + variant), 'verify generated merged manifest, not handwritten source');
  assert.match(script, /VerifyNativeManifest\.java[^\r\n]+\r?\n\s*if \(\$LASTEXITCODE -ne 0\) \{ throw/);
}
const ci = read('.github/workflows/native-preview.yml');
assert.ok(ci.includes("- 'scripts/VerifyNativeManifest.java'"));
assert.ok(ci.includes('java scripts/VerifyNativeManifest.java --self-test'));
assert.ok(ci.includes('java scripts/VerifyNativeManifest.java debug android-native/app/build/intermediates/merged_manifests/debug/'));
console.log('Native manifest gate: wired into debug/internal builders and CI, failure exits required. Java behavior tests run in native CI.');
