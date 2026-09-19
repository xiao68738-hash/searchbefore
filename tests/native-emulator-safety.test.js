const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, '../scripts', name), 'utf8');
const run = read('test-native-emulator.ps1');
assert.match(run, /\$serial = 'emulator-5580'/);
assert.match(run, /getprop ro\.kernel\.qemu/);
assert.match(run, /getprop sys\.boot_completed/);
assert.match(run, /tw\.searchbefore\.app\.nativepreview\.test\/androidx\.test\.runner\.AndroidJUnitRunner/);
assert.match(run, /Get-FileHash -Algorithm SHA256/);
assert.match(run, /Tee-Object -FilePath/);
assert.match(run, /FAILURES!!!\|Process crashed\|INSTRUMENTATION_FAILED/);
assert.match(run, /-notmatch 'OK/);
for (const line of run.split('\n').filter((line) => /& \$adb\b/.test(line))) {
  assert.match(line, /& \$adb -s \$serial\b/, 'Every runner command must explicitly target the disposable emulator');
}
assert.doesNotMatch(run, /\b(?:uninstall|wipe-data|kill-server)\b|shell pm clear/);
const validation = read('start-native-validation-emulator.ps1');
const play = read('start-native-play-emulator.ps1');
for (const script of [validation, play]) {
  assert.match(script, /\$LASTEXITCODE -ne 0/);
  assert.match(script, /\$devices -match '\^emulator-'/, 'Do not run account and disposable emulators concurrently');
}
assert.match(validation, /'-read-only'/);
assert.match(validation, /'-port', '5580'/);
assert.match(play, /private\\android-play-avd/);
assert.match(play, /'-port', '5582'/);
assert.doesNotMatch(play, /& \$adb .*\b(?:install|instrument|input|clear|uninstall)\b/);
const tablet = read('test-native-tablet-matrix.ps1');
assert.match(tablet, /\$serial = 'emulator-5580'/);
assert.match(tablet, /getprop ro\.kernel\.qemu/);
assert.match(tablet, /getprop sys\.boot_completed/);
assert.match(tablet, /Size = '600x960'/);
assert.match(tablet, /Size = '1280x800'/);
assert.match(tablet, /test-native-emulator\.ps1/);
assert.match(tablet, /finally\s*\{/);
assert.match(tablet, /shell wm size \$originalSize/);
assert.match(tablet, /shell wm density \$originalDensity/);
assert.match(tablet, /shell settings put system font_scale \$originalFont/);
assert.match(tablet, /\$restoreFailures\.Count -gt 0/);
assert.doesNotMatch(tablet, /\b(?:uninstall|wipe-data|kill-server)\b|shell pm clear/);
for (const line of tablet.split('\n').filter((line) => /& \$adb\b/.test(line))) {
  assert.match(line, /& \$adb -s \$serial\b/, 'Tablet matrix must never target a phone or account emulator');
}
console.log('Native emulator safety contracts passed (static checks; not device acceptance).');
