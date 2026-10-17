const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const workflow = read('.github/workflows/pages.yml').split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n');
assert.doesNotMatch(workflow, /pull_request|workflow_run|secrets\.|contents: write|path: ['"]?\.(?:\/|['"]?\s*$)/m);
assert.match(workflow, /branches: \[main\]/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /npm run release:check/);
assert.match(workflow, /node scripts\/package-pages.mjs "\$RUNNER_TEMP\/artifact.tar"/);
assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/artifact.tar/);
assert.match(workflow, /PAGES_ARTIFACT_DEPLOY_ENABLED == 'true'/);
assert.match(workflow, /needs: build/);
assert.match(workflow, /name: github-pages/);
assert.match(workflow, /\.build_type\).* = workflow/);
const build = workflow.split('  deploy:')[0];
assert.doesNotMatch(build, /:\s*write\b/);
const uses = [...workflow.matchAll(/uses: ([^\s#]+)/g)].map(match => match[1]);
assert.deepEqual(uses, [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e'
]);
assert.match(read('scripts/build-release.mjs'), /const hostingFiles = \["CNAME", "\.nojekyll", "\.well-known\/assetlinks.json"\]/);
assert.match(read('scripts/check-release.mjs'), /isSymbolicLink/);
assert.match(read('scripts/check-release.mjs'), /info.nlink === 1/);
assert.match(read('scripts/check-release.mjs'), /assert.deepEqual\(actual, expected/);
assert.match(read('scripts/package-pages.mjs'), /\.\.\.releaseFiles/);
assert.match(read('scripts/package-pages.mjs'), /assert.deepEqual\(members, releaseFiles/);
console.log('Pages deployment: checked dist only, scoped permissions, explicit migration gate and hosting files.');
