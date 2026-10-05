const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// These two workflows execute PR code, not releases. Keep their access read-only.
const pins = {
  'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node': '820762786026740c76f36085b0efc47a31fe5020',
  'actions/setup-java': 'de7274f081f381c8f8158605e0321c36c376e2e6',
  'actions/upload-artifact': '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
};
for (const file of ['review.yml', 'native-preview.yml']) {
  const source = fs.readFileSync(path.join(__dirname, '../.github/workflows', file), 'utf8');
  const active = source.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n');
  assert.match(active, /^\s*runs-on: ubuntu-24\.04\s*$/m, `${file}: review OS changes deliberately`);
  assert.match(active, /^permissions:\s*\n  contents: read\s*\n/m);
  assert.equal((active.match(/^\s*permissions:/gm) || []).length, 1, 'job must not override token access');
  assert.doesNotMatch(active, /pull_request_target|workflow_run|secrets\.|\bwrite-all\b|:\s*write\b/);
  assert.doesNotMatch(active, /allow-unsafe-pr-checkout|FORCE_JAVASCRIPT_ACTIONS_TO_NODE20/);
  const steps = active.split(/^\s*- name:/m).slice(1);
  const uses = [...active.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)].map(match => match[1]);
  assert.equal(uses.length, file === 'review.yml' ? 2 : 4, 'new executable actions require review');
  for (const action of uses) {
    const [name, sha] = action.split('@');
    assert.match(sha || '', /^[a-f0-9]{40}$/, 'pin immutable action commits, not moving tags');
    assert.equal(sha, pins[name], `unreviewed action pin: ${name}`);
  }
  const checkout = steps.filter(step => /uses: actions\/checkout@/.test(step));
  assert.equal(checkout.length, 1);
  assert.match(checkout[0], /\bwith:\s*\n\s+persist-credentials: false\s*(?:\n|$)/);
  assert.match(active, /node-version: 24\b/);
  assert.match(active, /run: (?:\|\s*\n\s*)?npm ci\b/);
  if (file === 'native-preview.yml') {
    assert.match(active, /java-version: 17\b/);
    assert.match(active, /:app:testDebugUnitTest :app:assembleDebug :app:lintDebug/);
    assert.doesNotMatch(active, /:app:(?:bundle|assemble)Release|SEARCHBEFORE_(?:KEY|STORE)/);
    assert.match(active, /:app:assembleDebugAndroidTest/);
    assert.match(active, /run: bash scripts\/test-native-ci-emulator\.sh/);
    const upload = steps.filter(step => /uses: actions\/upload-artifact@/.test(step));
    assert.equal(upload.length, 1);
    assert.match(upload[0], /path: \$\{\{ runner\.temp \}\}\/searchbefore-native-ui\/public-evidence\//);
    assert.match(upload[0], /retention-days: 3\b/);
    assert.match(upload[0], /include-hidden-files: false/);
    assert.doesNotMatch(upload[0], /\*|android-user|avd|\.apk|\.json|overwrite: true/);
  }
}
const ui = fs.readFileSync(path.join(__dirname, '../scripts/test-native-ci-emulator.sh'), 'utf8');
assert.match(ui, /RUNNER_ENVIRONMENT:-\}" == github-hosted/);
assert.match(ui, /serial=emulator-5580/);
assert.match(ui, /ro\.kernel\.qemu/);
assert.match(ui, /nativepreview\.test\/androidx\.test\.runner/);
assert.match(ui, /trap cleanup EXIT/);
assert.match(ui, /System\/App ANR invalidates/);
assert.match(ui, /UI suite failed or incomplete/);
assert.match(ui, /Explicit allowlist/);
assert.match(ui, /reports\/synthetic-report\.pdf reports\/synthetic-report\.xlsx reports\/synthetic-report-page1\.png/);
const evidenceLoop = ui.match(/for screen in ([\s\S]*?); do/)[1];
assert.doesNotMatch(evidenceLoop, /\*|\.json|\.apk|before-import|state\.json/);
assert.match(ui, /exec-out run-as tw\.searchbefore\.app\.nativepreview cat "cache\/native-validation\/\$screen"/);
assert.doesNotMatch(ui, /\b(?:cp|tar|zip)[^\n]*(?:avd|android-user|firebase|\.apk)/i);
assert.doesNotMatch(ui, /adb[^\n]*\s(?:uninstall|clear)\s|tw\.searchbefore\.app\/|chmod\s+(?:777|a\+rw)|-wipe-data/);
console.log('CI workflow policy: reviewed immutable pins, explicit OS, read-only token, no retained credentials or release secrets.');
