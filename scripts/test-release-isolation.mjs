import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, link, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { releaseFiles, validatePublicationFiles } from './check-release.mjs';
const fixture = await mkdtemp(path.join(os.tmpdir(), 'searchbefore-release-isolation-'));
let checks = 0;
try {
  for (const file of releaseFiles) {
    await mkdir(path.dirname(path.join(fixture, file)), { recursive: true });
    await writeFile(path.join(fixture, file), 'synthetic fixture');
  }
  await validatePublicationFiles(fixture); checks++;
  for (const extra of ['README.md', 'source.map', '.well-known/README.md', 'dev/ocr-manual-review.html', 'private/backup.json']) {
    const target = path.join(fixture, extra);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'synthetic fixture only');
    await assert.rejects(validatePublicationFiles(fixture)); checks++;
    await rm(target);
    if (extra.includes('/') && !extra.startsWith('.well-known/')) await rm(path.dirname(target), { recursive: true });
  }
  await rm(path.join(fixture, 'CNAME'));
  await assert.rejects(validatePublicationFiles(fixture)); checks++;
  await writeFile(path.join(fixture, 'CNAME'), 'synthetic fixture');
  await link(path.join(fixture, 'CNAME'), path.join(fixture, 'hardlink'));
  await assert.rejects(validatePublicationFiles(fixture)); checks++;
  await rm(path.join(fixture, 'hardlink'));
  try {
    await symlink(path.join(fixture, 'CNAME'), path.join(fixture, 'symlink'));
    await assert.rejects(validatePublicationFiles(fixture)); checks++;
    await rm(path.join(fixture, 'symlink'));
  } catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    console.log('Symlink creation unavailable on Windows; Linux CI must run this case.');
  }
  await validatePublicationFiles(fixture);
  console.log(`Release isolation: ${checks} inventory/negative cases passed; synthetic temporary files only.`);
} finally {
  // Only the explicitly created OS temporary fixture; never the workspace/dist.
  await rm(fixture, { recursive: true, force: true });
}
