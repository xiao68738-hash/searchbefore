// Local-only diagnostic. Never runs on a physical device or clears app data.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const opts = Object.fromEntries(process.argv.slice(2).map(arg => {
  const at = arg.indexOf('=');
  if (!arg.startsWith('--') || at < 0) throw new Error('Use --name=value arguments');
  return [arg.slice(2, at), arg.slice(at + 1)];
}));
const serial = opts.serial || 'emulator-5556';
const mode = opts.mode || 'twa';
const rounds = Number(opts.rounds || 3);
if (!/^emulator-\d+$/.test(serial)) throw new Error('Only an isolated emulator is allowed');
if (!['twa', 'chrome', 'blank'].includes(mode)) throw new Error('Unsupported launch mode');
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error('Use 1–10 rounds');
if (!opts.adb || !opts.out) throw new Error('--adb and --out are required');
const out = path.resolve(opts.out);
if (fs.existsSync(out)) throw new Error('Use a new evidence directory; do not overwrite old runs');
function adb(args, {binary = false, timeout = 20000} = {}) {
  const r = spawnSync(opts.adb, ['-s', serial, ...args], {
    encoding: binary ? undefined : 'utf8', timeout, windowsHide: true,
    maxBuffer: 24 * 1024 * 1024
  });
  if (r.error || r.status !== 0) throw new Error(`adb ${args[0]} failed (exit=${r.status}, signal=${r.signal}): ${r.error?.message || r.stderr || String(r.stdout).slice(-500)}`);
  return r.stdout;
}
const avd = adb(['shell', 'getprop', 'ro.boot.qemu.avd_name']).trim();
if (avd !== 'SearchBefore_API36_Release3') {
  throw new Error('Refusing to operate an unrelated emulator: ' + avd);
}
if (adb(['shell', 'getprop', 'sys.boot_completed']).trim() !== '1') throw new Error('Android has not completed boot');
fs.mkdirSync(out, {recursive:true});
const report = { startedAt: new Date().toISOString(), serial, avd, mode, rounds: [],
  limitation: 'No fresh ANR in this bounded observation is not a guarantee of app stability or a cloud restore test.' };
try {
  report.baselineAnr = adb(['shell','dumpsys','activity','lastanr']);
  report.baselineEvents = adb(['logcat','-b','events','-d','-v','epoch']).split(/\r?\n/)
    .filter(line => /\bam_anr\b|\bam_crash\b/.test(line));
  report.baselineHealthy = report.baselineAnr.includes('<no ANR has occurred since boot>') && !report.baselineEvents.length;
  fs.writeFileSync(path.join(out,'baseline-lastanr.txt'),report.baselineAnr);
  const chromePackage = adb(['shell','dumpsys','package','com.android.chrome']);
  fs.writeFileSync(path.join(out, 'chrome-package.txt'), chromePackage);
  report.chromeVersion = chromePackage.match(/\bversionName=([^\s]+)/)?.[1] || null;
  report.androidBuild = adb(['shell','getprop','ro.build.fingerprint']).trim();
  if (mode !== 'blank') {
    const connectivity = adb(['shell','dumpsys','connectivity']);
    report.networkAvailable = /Active default network:\s*\d+/.test(connectivity);
    fs.writeFileSync(path.join(out, 'network-baseline.txt'), connectivity);
    if (!report.networkAvailable) throw new Error('No active Android network; an offline page cannot pass the online launch probe');
  }
  const appPackage = adb(['shell','dumpsys','package','tw.searchbefore.app']);
  fs.writeFileSync(path.join(out, 'app-package.txt'), appPackage);
  report.appVersionCode = Number(appPackage.match(/\bversionCode=(\d+)/)?.[1]) || null;
  if (mode === 'twa' && report.appVersionCode !== 3) throw new Error('TWA probe requires the versionCode 3 candidate');
  for (let i = 1; i <= rounds; i++) {
    const prefix = path.join(out, `round-${i}`);
    const deviceStart = Number(adb(['shell','date','+%s']).trim());
    const item = {round:i, startedAt:new Date().toISOString(),deviceStart,hostFreeMB:Math.round(os.freemem()/1024/1024)};
    report.rounds.push(item);
    console.log(JSON.stringify({event:'starting',mode,round:i}));
    adb(['shell','am','force-stop','tw.searchbefore.app']);
    adb(['shell','am','force-stop','com.android.chrome']);
    const target = mode === 'twa'
      ? ['-n','tw.searchbefore.app/.LauncherActivity']
      : ['-a','android.intent.action.VIEW','-d',mode === 'blank' ? 'about:blank' : 'https://searchbefore.tw/?app=google-play','-p','com.android.chrome'];
    item.launch = adb(['shell','am','start','-W',...target], {timeout:45000});
    if (!/Status:\s*ok/.test(item.launch)) throw new Error('Android did not accept the activity launch: ' + item.launch.trim());
    console.log(JSON.stringify({event:'launched',mode,round:i,launch:item.launch.trim()}));
    // Observe beyond the platform input timeout; do not change ANR settings.
    await delay(20000);
    const events = adb(['logcat','-b','events','-d','-v','epoch','-t',`${deviceStart}.000`]);
    const fresh = events.split(/\r?\n/).filter(line => Number(line.trim().split(/\s+/)[0]) >= deviceStart);
    item.anrs = fresh.filter(line => /\bam_anr\b/.test(line));
    item.crashes = fresh.filter(line => /\bam_crash\b/.test(line));
    item.hostFreeMBAfter = Math.round(os.freemem()/1024/1024);
    item.focus = adb(['shell','dumpsys','window']).split(/\r?\n/).filter(line => /mCurrentFocus|mFocusedApp|mObscuringWindow/.test(line));
    item.unresponsiveWindow = item.focus.some(line => /Application Not Responding/.test(line));
    fs.writeFileSync(prefix + '-events.txt', fresh.join('\n'));
    fs.writeFileSync(prefix + '-lastanr.txt', adb(['shell','dumpsys','activity','lastanr']));
    fs.writeFileSync(prefix + '.png', adb(['exec-out','screencap','-p'], {binary:true}));
    fs.writeFileSync(path.join(out,'report.json'), JSON.stringify(report,null,2));
    console.log(JSON.stringify({event:'observed',mode,round:i,anrs:item.anrs,crashes:item.crashes,focus:item.focus}));
    if (item.anrs.length || item.crashes.length || item.unresponsiveWindow) break;
  }
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out,'report.json'), JSON.stringify(report,null,2));
}
if (!report.baselineHealthy || report.rounds.some(r => r.anrs?.length || r.crashes?.length || r.unresponsiveWindow)) process.exitCode = 2;
console.log('Evidence: ' + out);
