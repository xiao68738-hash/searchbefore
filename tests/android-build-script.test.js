const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.log("Android PowerShell build harness skipped (Windows required).");
} else {
  // Isolated fake SDK/signing inputs. Never read the developer's real signing files.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "searchbefore-build-test-"));
  const repo = path.join(root, "worktrees", "candidate");
  const put = (name, text) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  try {
    put("tools/jdk17/jdk-17.0.20+8/bin/java.exe", "fixture");
    put("tools/android-sdk/platforms/android-36/android.jar", "fixture");
    put("private/android-signing/signing.keystore", "fixture");
    put("private/android-signing/signing-key-info.txt", "Key alias: dummy-alias\nKey store password: dummy-store\nKey password: dummy-key\n");
    put("worktrees/candidate/scripts/build-android-twa.ps1", fs.readFileSync(path.join(__dirname, "../scripts/build-android-twa.ps1"), "utf8"));
    const harness = `
$ErrorActionPreference = 'Stop'
$names = @('JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','ANDROID_USER_HOME','GRADLE_USER_HOME','GRADLE_OPTS','SEARCHBEFORE_KEYSTORE_PATH','SEARCHBEFORE_KEY_ALIAS','SEARCHBEFORE_STORE_PASSWORD','SEARCHBEFORE_KEY_PASSWORD')
$before = @{}
foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$cwd = (Get-Location).Path
$failed = $false
try { & (Join-Path $PSScriptRoot 'worktrees/candidate/scripts/build-android-twa.ps1') }
catch { $failed = $true }
if ($failed -ne ($env:BUILD_EXPECT_FAILURE -eq '1')) { throw 'Unexpected build outcome' }
foreach ($name in $names) {
  if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $before[$name]) { throw "Environment not restored: $name" }
}
if ((Get-Location).Path -ne $cwd) { throw 'Working directory not restored' }
Write-Output 'HARNESS_OK'
`;
    put("harness.ps1", harness);
    const run = (failure, extraEnv = {}) => {
      const env = { ...process.env };
      for (const name of Object.keys(env)) if (/^(SEARCHBEFORE_|JAVA_HOME$|ANDROID_|GRADLE_)/i.test(name)) delete env[name];
      const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "harness.ps1")], {
        cwd: repo, env: { ...env, ...extraEnv, BUILD_EXPECT_FAILURE: failure ? "1" : "0" }, encoding: "utf8", windowsHide: true, timeout: 30000,
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      assert.match(result.stdout, /HARNESS_OK/);
      assert.doesNotMatch(result.stdout + result.stderr, /dummy-store|dummy-key|prior-secret/);
    };
    put("worktrees/candidate/android-twa/gradlew.bat", "@echo off\r\nif not defined SEARCHBEFORE_KEY_ALIAS exit /b 9\r\nif not exist \"%ANDROID_HOME%\\platforms\\android-36\\android.jar\" exit /b 8\r\nexit /b 0\r\n");
    run(false);
    run(false, { SEARCHBEFORE_KEY_PASSWORD: "prior-secret", JAVA_HOME: "prior-java" });
    put("worktrees/candidate/android-twa/gradlew.bat", "@echo off\r\nexit /b 7\r\n");
    run(true, { SEARCHBEFORE_KEY_PASSWORD: "prior-secret" });
    put("private/android-signing/signing-key-info.txt", "Key alias: dummy-alias\n");
    run(true);
    console.log("Android build harness: worktree discovery, success/failure cleanup and incomplete signing passed.");
  } finally {
    // Only delete the exact unique test directory created by this test.
    fs.rmSync(root, { recursive: true, force: true });
  }
}
