param([string]$SharedRoot = 'D:\SearchBefore', [switch]$Interactive)
$ErrorActionPreference = 'Stop'
$adb = Join-Path $SharedRoot 'tools\android-sdk\platform-tools\adb.exe'
$emulator = Join-Path $SharedRoot 'tools\android-sdk\emulator\emulator.exe'
$avdRoot = Join-Path $SharedRoot 'private\android-play-avd'
if (!(Test-Path -LiteralPath (Join-Path $avdRoot 'SearchBefore_Play_API36.ini'))) {
    throw 'Create the dedicated Google Play AVD first. Do not reuse the UI instrumentation AVD.'
}
$devices = & $adb devices
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect running Android devices' }
if ($devices -match '^emulator-') { throw 'Close the existing emulator before starting the Play acceptance environment.' }
$logDir = Join-Path $SharedRoot ('audits\native-play-emulator-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $logDir | Out-Null
$changes = @{
    ANDROID_AVD_HOME = $avdRoot
    ANDROID_HOME = Join-Path $SharedRoot 'tools\android-sdk'
    ANDROID_USER_HOME = Join-Path $avdRoot 'android-user-home'
    ANDROID_EMULATOR_HOME = Join-Path $avdRoot 'android-user-home'
}
$previous = @{}
try {
    foreach ($key in $changes.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $changes[$key], 'Process')
    }
    New-Item -ItemType Directory -Force -Path $changes.ANDROID_USER_HOME | Out-Null
    # Persistent PRIVATE profile for user-driven Play login. Never run UI instrumentation here.
    # No snapshot, wipe-data, app sideload, account selection, login or Play-track mutation.
    $emulatorArgs = @('-avd', 'SearchBefore_Play_API36', '-no-snapshot', '-no-audio', '-no-boot-anim',
        '-memory', '2048', '-cores', '4', '-gpu', 'swiftshader_indirect', '-port', '5582')
    $windowStyle = 'Hidden'
    if ($Interactive) { $windowStyle = 'Normal' } else { $emulatorArgs += '-no-window' }
    $process = Start-Process -FilePath $emulator -WindowStyle $windowStyle -PassThru -ArgumentList $emulatorArgs `
        -RedirectStandardOutput (Join-Path $logDir 'stdout.log') -RedirectStandardError (Join-Path $logDir 'stderr.log')
    Write-Output ("Play acceptance emulator PID=" + $process.Id + '; serial=emulator-5582; private profile; logs=' + $logDir)
} finally {
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
