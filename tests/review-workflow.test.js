const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/review.yml'), 'utf8').replace(/\r\n/g, '\n');
assert.match(workflow, /\n  pull_request:\n    branches: \[main\]/);
assert.match(workflow, /\npermissions:\n  contents: read\n/);
assert.doesNotMatch(workflow, /pull_request_target|write-all|contents: write|id-token: write/);
assert.match(workflow, /timeout-minutes: 10/);
const commands = [...workflow.matchAll(/^\s+run: (.+)$/gm)].map(match => match[1]);
assert.deepEqual(commands, [
  'npm ci',
  'npm test',
  'npm run build',
  'node scripts/check-release.mjs'
], 'Review checks 必須依序安裝鎖定依賴、回歸、建置及檢查發布成品');
assert.doesNotMatch(workflow, /continue-on-error: true|\|\|\s*true|always\(\)/, '不得忽略失敗');
assert.doesNotMatch(workflow, /firebase deploy|pages: write|secrets\./, '檢查流程不部署、不使用發布密鑰');
console.log('✓ PR 工作流程涵蓋回歸、建置與成品驗證，維持唯讀權限');
