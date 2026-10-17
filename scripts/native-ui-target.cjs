const assert = require('node:assert/strict');
function nodes(xml) {
  const result = [], stack = [];
  for (const match of xml.matchAll(/<(\/?)node\b([^>]*)>/g)) {
    if (match[1]) { stack.pop(); continue; }
    const node = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
    node.parent = stack.at(-1);
    result.push(node);
    if (!match[2].trimEnd().endsWith('/')) stack.push(node);
  }
  return result;
}
function tapPoint(xml, pkg, label) {
  const matches = nodes(xml).filter(node => node.package === pkg && (node.text === label || node['content-desc'] === label));
  assert.equal(matches.length, 1, `Expected one visible navigation target: ${label}`);
  // Compose may expose label text at [0,0][0,0] while its actual clickable parent
  // has valid bounds. Use that observed ancestor, never a hard-coded coordinate.
  for (let node = matches[0]; node && node.package === pkg; node = node.parent) {
    if (node.enabled !== 'true') throw Error('Disabled navigation target');
    if (node.clickable !== 'true') continue;
    const bounds = (node.bounds || '').match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    assert.ok(bounds, 'Missing target bounds');
    const [, x1, y1, x2, y2] = bounds.map(Number);
    assert.ok(x2 > x1 && y2 > y1, 'Invisible clickable target');
    return [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)];
  }
  throw Error('No visible clickable ancestor for navigation target');
}
module.exports = { tapPoint };
