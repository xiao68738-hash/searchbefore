// The stock upload-pages-artifact action excludes dot directories, including
// .well-known. Archive the validated explicit file list instead; never tar '.'.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseFiles } from './check-release.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
assert.ok(process.argv[2], 'Supply an output artifact.tar path outside dist');
const output = path.resolve(process.argv[2]);
assert.equal(path.basename(output), 'artifact.tar');
const relative = path.relative(dist, output);
assert.ok(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'Archive must be outside dist');
await mkdir(path.dirname(output), { recursive: true });
execFileSync('tar', ['-cf', output, '-C', dist, ...releaseFiles], { stdio: 'inherit' });
const members = execFileSync('tar', ['-tf', output], { encoding: 'utf8' }).trim().split(/\r?\n/).sort();
assert.deepEqual(members, releaseFiles, 'Archive must contain exactly the checked public files, including .well-known');
console.log(`Pages archive verified: ${members.length} explicit files; no source/development directories.`);
