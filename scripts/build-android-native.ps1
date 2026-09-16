param([string]$SharedRoot = "D:\SearchBefore", [switch]$Lint)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
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
    & (Join-Path $projectRoot "android-twa\gradlew.bat") -p (Join-Path $projectRoot "android-native") --no-daemon @nativeTasks
    if ($LASTEXITCODE -ne 0) { throw "Native preview build/test failed" }
} finally {
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], "Process") }
}
