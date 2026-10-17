// Black-box smoke test of the non-debuggable/minified APK. No target app classes or
// instrumentation keep rules are linked into the target. Never signs in or writes records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { tapPoint } = require('./native-ui-target.cjs');
const args = process.argv.slice(2);
const ci = args.includes('--ci');
const serialIndex = args.indexOf('--serial');
const serial = serialIndex < 0 ? '' : args[serialIndex + 1];
assert.ok(serial && /^[A-Za-z0-9_-]+$/.test(serial), 'Supply an explicit device serial');
assert.ok(ci || args.includes('--device-acceptance'), 'Explicit local device acceptance required');
if (ci) assert.ok(process.env.CI === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted' && serial === 'emulator-5580');
const sdk = process.env.ANDROID_HOME;
assert.ok(sdk, 'ANDROID_HOME required');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const pkg = 'tw.searchbefore.app.nativepreview';
const run = (...command) => execFileSync(adb, ['-s', serial, ...command], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
if (ci) assert.equal(run('shell', 'getprop', 'ro.kernel.qemu').trim(), '1');
const installed = run('shell', 'dumpsys', 'package', pkg);
assert.match(installed, /versionName=.*optimized-preview-NOT-FOR-PLAY/);
assert.doesNotMatch(installed, /(?:pkgFlags|flags)=\[[^\]]*\bDEBUGGABLE\b/);
const remote = '/sdcard/searchbefore-optimized-smoke.xml';
function snapshot() {
  run('shell', 'uiautomator', 'dump', remote);
  const xml = run('shell', 'cat', remote);
  assert.ok(xml.includes(`package="${pkg}"`), 'Target app is not visible; no coordinate guess');
  return xml;
}
function tapLabel(label, xml) {
  const [x, y] = tapPoint(xml, pkg, label);
  run('shell', 'input', 'tap', String(x), String(y));
}
function start() {
  run('shell', 'am', 'force-stop', pkg);
  run('shell', 'am', 'start', '-W', '-n', `${pkg}/tw.searchbefore.nativeapp.MainActivity`);
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { const xml = snapshot(); assert.ok(xml.includes('查詢') && xml.includes('個人')); return xml; }
    catch (error) { lastError = error; }
  }
  throw lastError;
}
const pages = [['計算', '配藥計算'], ['配方', '我的常用配方'], ['倒數', '安全採收期倒數'],
  ['紀錄', '田區摘要'], ['個人', '外觀'], ['查詢', '選作物|第一次使用']];
let xml = start();
for (const [label, expected] of pages) {
  tapLabel(label, xml);
  xml = snapshot();
  assert.ok(new RegExp(expected).test(xml), `Optimized page failed to render: ${label}`);
  if (ci) {
    const dir = path.join(process.env.RUNNER_TEMP, 'searchbefore-native-ui/public-evidence');
    fs.mkdirSync(dir, { recursive: true });
    const image = execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 8 * 1024 * 1024 });
    fs.writeFileSync(path.join(dir, `optimized-${pages.findIndex(page => page[0] === label)}.png`), image);
  }
}
start();
assert.ok(run('shell', 'pidof', pkg).trim(), 'Optimized app did not survive restart');
console.log('PASS: non-debuggable optimized APK cold start, six destinations and restart. No login/cloud/record-write acceptance claimed.');
