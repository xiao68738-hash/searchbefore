param([string]$SharedRoot = "D:\SearchBefore", [switch]$Lint, [switch]$Connected, [switch]$UiTestApk)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
function Assert-IsolatedValidationDevice {
    param([string[]]$DeviceOutput)
    # connectedDebugAndroidTest installs/uninstalls packages, even when the UI tests only read.
    # Never run this suite on a user's phone or an unrelated emulator.
    $adb = Join-Path $SharedRoot "tools\android-sdk\platform-tools\adb.exe"
    if (!$PSBoundParameters.ContainsKey('DeviceOutput')) {
        $DeviceOutput = & $adb devices
        if ($LASTEXITCODE -ne 0) { throw "Cannot inspect Android devices safely" }
    }
    $entries = @($DeviceOutput | Where-Object { ![string]::IsNullOrWhiteSpace($_) -and $_ -notmatch '^List of devices attached\s*$' })
    if ($entries.Count -ne 1 -or $entries[0] -notmatch '^emulator-5580\s+device\b') {
        throw "Connected tests require ONLY disposable emulator-5580. Disconnect phones and start scripts/start-native-validation-emulator.ps1; real-device acceptance is separate."
    }
}
if ($Connected) { Assert-IsolatedValidationDevice }
$changes = @{
    JAVA_HOME = Join-Path $SharedRoot "tools\jdk17\jdk-17.0.20+8"
    ANDROID_HOME = Join-Path $SharedRoot "tools\android-sdk"
    ANDROID_USER_HOME = Join-Path $SharedRoot "private\android-user-home"
    GRADLE_USER_HOME = Join-Path $SharedRoot "private\gradle-home-8.13"
}
$previous = @{}
try {
    foreach ($key in $changes.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, $changes[$key], "Process")
    }
    & (Join-Path $SharedRoot "tools\node\node.exe") (Join-Path $PSScriptRoot "export-native-catalog.cjs")
    if ($LASTEXITCODE -ne 0) { throw "Native catalog export failed" }
    $nativeTasks = @(':app:testDebugUnitTest', ':app:assembleDebug')
    if ($Lint) { $nativeTasks += ':app:lintDebug' }
    # Build only; no device installation. Explicit-serial emulator validation is a separate step.
    if ($UiTestApk) { $nativeTasks += ':app:assembleDebugAndroidTest' }
    if ($Connected) { $nativeTasks += ':app:connectedDebugAndroidTest' }
    if ($Connected) { Assert-IsolatedValidationDevice }
    & (Join-Path $projectRoot "android-twa\gradlew.bat") -p (Join-Path $projectRoot "android-native") --no-daemon @nativeTasks
    if ($LASTEXITCODE -ne 0) { throw "Native preview build/test failed" }
} finally {
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], "Process") }
}
