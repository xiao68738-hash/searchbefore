const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const script = path.join(__dirname, '../scripts/check-android-startup.mjs');
for (const args of [
  ['--serial=physical-phone'], ['--mode=arbitrary-url'], ['--rounds=0'],
  ['--rounds=11'], ['--rounds=1.5'], [], ['--bad-argument']
]) {
  const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8',windowsHide:true,timeout:5000});
  assert.equal(r.status,1,'Invalid diagnostic options must fail before touching a device');
  assert.doesNotMatch(r.stderr,/ENOENT/,'Must reject options before invoking an adb executable');
}
const source=fs.readFileSync(script,'utf8');
assert.match(source,/avd !== 'SearchBefore_API36_Release3'/);
assert.match(source,/Use a new evidence directory/);
assert.match(source,/baselineHealthy/);
assert.doesNotMatch(source,/['"](?:clear|uninstall|disable-user|wipe-data)['"]|--disable-web-security/);
assert.match(source,/hostFreeMBAfter/);
assert.match(source,/report\.appVersionCode !== 3/);
assert.match(source,/item\.unresponsiveWindow/);
assert.match(source,/report\.networkAvailable/);
assert.match(source,/Android did not accept the activity launch/);
assert.match(source,/'-t',`\$\{deviceStart\}\.000`/);
const launcher = path.join(__dirname, '../scripts/start-android-test-emulator.mjs');
for (const args of [[], ['--sdk=x'], ['--bad=x'], ['--sdk=x', '--sdk=y']]) {
  const r = spawnSync(process.execPath, [launcher, ...args], {encoding:'utf8', windowsHide:true, timeout:5000});
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stderr, /ENOENT/, 'Reject invalid arguments before reading or writing environment files');
}
const launchSource = fs.readFileSync(launcher, 'utf8');
assert.match(launchSource, /fs\.openSync\(logPath, 'wx'\)/);
assert.match(launchSource, /System image must be inside the same SSD test root/);
assert.match(launchSource, /ANDROID_USER_HOME: userDir/);
assert.match(launchSource, /iccprofile_for_sim0\.xml/);
assert.match(launchSource, /radioconfig\.xml/);
assert.doesNotMatch(launchSource, /-wipe-data|--disable-web-security|disable-user|netsh/);
if (process.platform === 'win32') {
  const os = require('node:os');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'searchbefore-startup-fixture-'));
  const avdName = 'SearchBefore_API36_Release3';
  const avdDir = path.join(fixture, 'avd', avdName + '.avd');
  const systemDir = path.join(fixture, 'system-images', 'android-36', 'google_apis', 'x86_64');
  const log = path.join(fixture, 'must-not-start.log');
  try {
    for (const d of [avdDir, systemDir, path.join(fixture, 'emulator')]) fs.mkdirSync(d, {recursive:true});
    fs.writeFileSync(path.join(avdDir, 'config.ini'), [
      'image.sysdir.1=' + systemDir, 'hw.lcd.width=720', 'hw.lcd.height=1280',
      'hw.lcd.density=320', 'hw.gpu.enabled=yes', 'hw.gpu.mode=host'
    ].join('\n'));
    fs.writeFileSync(path.join(fixture, 'avd', avdName + '.ini'), 'path=' + avdDir + '\ntarget=android-36\n');
    for (const f of [path.join(avdDir, 'userdata-qemu.img'), path.join(systemDir, 'system.img'), path.join(fixture, 'emulator', 'emulator.exe')]) fs.writeFileSync(f, 'fixture');
    const args = [launcher, '--sdk=' + fixture, '--ssd-root=' + fixture, '--log=' + log];
    let r = spawnSync(process.execPath, args, {encoding:'utf8', windowsHide:true, timeout:5000});
    assert.equal(r.status, 1);
    assert.match(r.stderr, /iccprofile_for_sim0\.xml/, 'Reject a copied image without its data subtree before launching');
    assert.equal(fs.existsSync(log), false);
    const modemDir = path.join(systemDir, 'data', 'misc', 'modem_simulator');
    fs.mkdirSync(modemDir, {recursive:true});
    fs.writeFileSync(path.join(modemDir, 'iccprofile_for_sim0.xml'), 'fixture');
    r = spawnSync(process.execPath, args, {encoding:'utf8', windowsHide:true, timeout:5000});
    assert.equal(r.status, 1);
    assert.match(r.stderr, /radioconfig\.xml/);
    assert.equal(fs.existsSync(log), false);
  } finally {
    const resolved = fs.realpathSync(fixture);
    const expectedParent = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved).toLowerCase(), expectedParent.toLowerCase());
    assert.ok(path.basename(resolved).startsWith('searchbefore-startup-fixture-'));
    fs.rmSync(resolved, {recursive:true});
  }
}
console.log('Android startup probe: emulator scope, bounded rounds, safe failure and evidence preservation passed.');
