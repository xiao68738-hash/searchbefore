const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Public root assets only. ads.txt is a passive authorization record, not a loader.
const assets = fs.readdirSync(root).filter(name => /\.(html|js)$/.test(name));
assert.ok(assets.includes('index.html') && assets.includes('guides.html'));
for (const name of assets) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  assert.doesNotMatch(source, /(?:pagead\d*\.googlesyndication\.com|adsbygoogle\s*[.(\[]|google-adsense-account|doubleclick\.net)/i,
    `Ad loading must stay disabled in ${name}`);
}
console.log(`No ad loading: checked ${assets.length} public HTML/JS assets; no account, records or sync changes.`);
