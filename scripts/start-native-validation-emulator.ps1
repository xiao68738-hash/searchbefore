param([string]$SharedRoot = "D:\SearchBefore")
$ErrorActionPreference = "Stop"
$emulator = Join-Path $SharedRoot "tools\android-sdk\emulator\emulator.exe"
$adb = Join-Path $SharedRoot "tools\android-sdk\platform-tools\adb.exe"
$avdRoot = Join-Path $SharedRoot "tools\android-avd"
$avd = Join-Path $avdRoot "SearchBefore_API36_Fresh.ini"
if (!(Test-Path -LiteralPath $avd)) { throw "Existing Android 16 validation AVD is missing" }
$devices = & $adb devices
if ($devices -match 'emulator-5580\s') { throw "Port 5580 is already in use; keep the existing emulator intact" }
$logDir = Join-Path $SharedRoot ("audits\native-emulator-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $logDir | Out-Null
$oldAvd = $env:ANDROID_AVD_HOME
$oldSdk = $env:ANDROID_HOME
$oldUser = $env:ANDROID_USER_HOME
$oldEmulator = $env:ANDROID_EMULATOR_HOME
try {
    $env:ANDROID_AVD_HOME = $avdRoot
    $env:ANDROID_HOME = Join-Path $SharedRoot "tools\android-sdk"
    $env:ANDROID_USER_HOME = Join-Path $logDir "android-user-home"
    New-Item -ItemType Directory -Path $env:ANDROID_USER_HOME | Out-Null
    $env:ANDROID_EMULATOR_HOME = $env:ANDROID_USER_HOME
    # Disposable overlay. No wipe-data, no snapshot writes, and no change to the existing AVD.
    $process = Start-Process -FilePath $emulator -WindowStyle Hidden -PassThru -ArgumentList @(
        '-avd', 'SearchBefore_API36_Fresh', '-read-only', '-no-snapshot', '-no-window',
        '-no-audio', '-no-boot-anim', '-memory', '1536', '-cores', '2', '-gpu', 'swiftshader_indirect', '-port', '5580'
    ) -RedirectStandardOutput (Join-Path $logDir "stdout.log") -RedirectStandardError (Join-Path $logDir "stderr.log")
    Write-Output ("Native validation emulator PID=" + $process.Id + "; serial=emulator-5580; logs=" + $logDir)
} finally {
    $env:ANDROID_AVD_HOME = $oldAvd
    $env:ANDROID_HOME = $oldSdk
    $env:ANDROID_USER_HOME = $oldUser
    $env:ANDROID_EMULATOR_HOME = $oldEmulator
}
