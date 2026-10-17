// Inspect the actual optimized APK, not only generated XML. Never print resource values.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sdk = process.env.ANDROID_HOME;
assert.ok(sdk, 'ANDROID_HOME is required');
const aapt = path.join(sdk, 'build-tools/36.0.0', process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
const build = path.join(root, 'android-native/app/build');
const apk = path.join(build, 'outputs/apk/optimizedPreview/app-optimizedPreview.apk');
const dump = args => execFileSync(aapt, ['dump', ...args, apk], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const badge = dump(['badging']);
assert.match(badge, /package: name='tw\.searchbefore\.app\.nativepreview'/);
assert.match(badge, /optimized-preview-NOT-FOR-PLAY/);
assert.doesNotMatch(badge, /application-debuggable/);
const resources = dump(['resources']);
const names = ['google_app_id', 'google_api_key', 'project_id', 'gcm_defaultSenderId', 'default_web_client_id'];
for (const name of names) assert.ok(resources.includes(`string/${name}`), `R8 removed dynamic resource: ${name}`);
if (process.argv.includes('--fixture')) assert.ok(resources.includes('demo-optimization-only'), 'CI must use only the offline fixture project');
const mapping = fs.readFileSync(path.join(build, 'outputs/mapping/optimizedPreview/mapping.txt'), 'utf8');
assert.match(mapping, /^tw\.searchbefore\.nativeapp\.[^\n]+ -> [^\n]+:$/m, 'R8 must actually produce app mapping');
console.log(JSON.stringify({ packageName: 'tw.searchbefore.app.nativepreview', debuggable: false,
  dynamicResourcesPresent: names, apkBytes: fs.statSync(apk).size,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),
  runtimeTestedByThisScript: false, realLoginTestedByThisScript: false, playMetricVerified: false }, null, 2));
