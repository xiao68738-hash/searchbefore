param([string]$SharedRoot = "D:\SearchBefore", [switch]$InternalTestingOnly)
$ErrorActionPreference = "Stop"
if (!$InternalTestingOnly) { throw "Explicit -InternalTestingOnly is required. This does not authorize Alpha or production release." }
$projectRoot = Split-Path -Parent $PSScriptRoot
$privateRoot = Join-Path $SharedRoot "private"
$signingInfoPath = Join-Path $privateRoot "android-signing\signing-key-info.txt"
$keystorePath = Join-Path $privateRoot "android-signing\signing.keystore"
if (!(Test-Path -LiteralPath $signingInfoPath) -or !(Test-Path -LiteralPath $keystorePath)) { throw "Existing upload signing files missing" }
if (!(Test-Path -LiteralPath (Join-Path $projectRoot "android-native\firebase-production.json"))) { throw "Formal Firebase configuration missing" }
$signing = @{}
$changes = @{}
$previous = @{}
try {
    Get-Content -LiteralPath $signingInfoPath | ForEach-Object {
        $parts = $_ -split ':', 2
        if ($parts.Count -eq 2) { $signing[$parts[0].Trim()] = $parts[1].Trim() }
    }
    foreach ($key in @('Key alias', 'Key store password', 'Key password')) {
        if ([string]::IsNullOrWhiteSpace($signing[$key])) { throw "Upload signing fields incomplete" }
    }
    $changes = @{
        JAVA_HOME = Join-Path $SharedRoot "tools\jdk17\jdk-17.0.20+8"
        ANDROID_HOME = Join-Path $SharedRoot "tools\android-sdk"
        ANDROID_USER_HOME = Join-Path $privateRoot "android-user-home"
        GRADLE_USER_HOME = Join-Path $privateRoot "gradle-home-8.13"
        SEARCHBEFORE_KEYSTORE_PATH = $keystorePath
        SEARCHBEFORE_KEY_ALIAS = $signing['Key alias']
        SEARCHBEFORE_STORE_PASSWORD = $signing['Key store password']
        SEARCHBEFORE_KEY_PASSWORD = $signing['Key password']
    }
    foreach ($key in $changes.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $changes[$key], 'Process')
    }
    & (Join-Path $SharedRoot 'tools\node\node.exe') (Join-Path $PSScriptRoot 'export-native-catalog.cjs')
    if ($LASTEXITCODE -ne 0) { throw "Catalog export failed" }
    & (Join-Path $projectRoot 'android-twa\gradlew.bat') -p (Join-Path $projectRoot 'android-native') --no-daemon -PnativeInternalCandidate=true :app:checkNativeFirebaseConfig :app:testReleaseUnitTest :app:lintRelease :app:bundleRelease
    if ($LASTEXITCODE -ne 0) { throw "Internal candidate verification/build failed" }
} finally {
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
    $signing.Clear(); $changes.Clear(); $previous.Clear()
}
Write-Output 'Built for INTERNAL TESTING ONLY. No upload or rollout was performed.'
Write-Output (Join-Path $projectRoot 'android-native\app\build\outputs\bundle\release\app-release.aab')
