const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// These two workflows execute PR code, not releases. Keep their access read-only.
const pins = {
  'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node': '820762786026740c76f36085b0efc47a31fe5020',
  'actions/setup-java': 'de7274f081f381c8f8158605e0321c36c376e2e6',
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
  assert.equal(uses.length, file === 'review.yml' ? 2 : 3, 'new executable actions require review');
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
  }
}
console.log('CI workflow policy: reviewed immutable pins, explicit OS, read-only token, no retained credentials or release secrets.');
