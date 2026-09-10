// Local API 36 test environment only. Does not publish or change system settings.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const opts = {};
for (const arg of process.argv.slice(2)) {
  const match = /^--(sdk|ssd-root|log|memory)=(.+)$/.exec(arg);
  if (!match || opts[match[1]]) throw new Error('Use unique --sdk=, --ssd-root= and --log= arguments');
  opts[match[1]] = match[2];
}
if (!opts.sdk || !opts['ssd-root'] || !opts.log) throw new Error('--sdk, --ssd-root and --log are required');
const memory = Number(opts.memory || 2560);
if (![2048, 2560, 3072].includes(memory)) throw new Error('Use --memory=2048, 2560 or 3072');
if (process.platform !== 'win32') throw new Error('This local launcher is for Windows');
const sdk = path.resolve(opts.sdk);
const root = path.resolve(opts['ssd-root']);
const avdHome = path.join(root, 'avd');
const avdName = 'SearchBefore_API36_Release3';
const avdDir = path.join(avdHome, `${avdName}.avd`);
const config = fs.readFileSync(path.join(avdDir, 'config.ini'), 'utf8');
const pointer = fs.readFileSync(path.join(avdHome, `${avdName}.ini`), 'utf8');
const value = (text, key) => text.split(/\r?\n/).find(line => line.startsWith(key + '='))?.slice(key.length + 1).trim();
const samePath = (a, b) => !!a && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const systemDir = path.join(root, 'system-images', 'android-36', 'google_apis', 'x86_64');
if (!samePath(value(pointer, 'path'), avdDir) || value(pointer, 'target') !== 'android-36') {
  throw new Error('AVD pointer must reference this isolated API 36 test directory');
}
if (!samePath(value(config, 'image.sysdir.1'), systemDir)) {
  throw new Error('System image must be inside the same SSD test root');
}
for (const [key, expected] of Object.entries({
  'hw.lcd.width': '720', 'hw.lcd.height': '1280', 'hw.lcd.density': '320',
  'hw.gpu.enabled': 'yes', 'hw.gpu.mode': 'host'
})) {
  if (value(config, key) !== expected) throw new Error(`Unexpected test profile: ${key}`);
}
const executable = path.join(sdk, 'emulator', 'emulator.exe');
for (const file of [executable, path.join(systemDir, 'system.img'), path.join(avdDir, 'userdata-qemu.img'),
  path.join(systemDir, 'data', 'misc', 'modem_simulator', 'iccprofile_for_sim0.xml'),
  path.join(systemDir, 'data', 'misc', 'emulator', 'config', 'radioconfig.xml')]) {
  if (!fs.statSync(file).isFile()) throw new Error('Missing emulator input: ' + file);
}
const logPath = path.resolve(opts.log);
if (fs.existsSync(logPath)) throw new Error('Use a new log file to preserve previous evidence');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const userDir = path.join(root, 'user');
fs.mkdirSync(userDir, { recursive: true });
const log = fs.createWriteStream(logPath, { fd: fs.openSync(logPath, 'wx') });
const args = ['-avd', avdName, '-port', '5556', '-no-window', '-no-audio',
  '-no-snapshot', '-no-metrics', '-memory', String(memory), ...(memory < 2560 ? ['-lowram'] : []), '-cores', '4',
  '-skin', '720x1280', '-gpu', 'host'];
const child = spawn(executable, args, { windowsHide: true, env: {
  ...process.env, ANDROID_HOME: sdk, ANDROID_AVD_HOME: avdHome,
  ANDROID_USER_HOME: userDir, ANDROID_EMULATOR_HOME: userDir
}});
let logged = 0, shown = 0;
console.log(JSON.stringify({ startedAt: new Date().toISOString(), pid: child.pid, avdName, root, logPath }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
  if (logged < 5_000_000) {
    const chunk = bytes.subarray(0, 5_000_000 - logged);
    log.write(chunk); logged += chunk.length;
  }
  if (shown < 2000) {
    const chunk = bytes.subarray(0, 2000 - shown);
    process.stdout.write(chunk); shown += chunk.length;
  }
});
log.on('error', error => { console.error('Log failure:', error.message); process.exitCode = 1; });
child.on('error', error => { console.error(error.message); log.end(); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  log.end();
  console.log(JSON.stringify({ exitedAt: new Date().toISOString(), code, signal }));
  process.exitCode = process.exitCode || (code ?? 1);
});
