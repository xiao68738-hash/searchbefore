param(
    [string]$SearchBeforeRoot,
    [string]$JavaHome,
    [string]$AndroidSdkRoot
)

$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Join-Path $workspaceRoot "android-twa"
# Worktrees are not necessarily direct children of the shared tools directory.
if (-not $SearchBeforeRoot) {
    $candidate = $workspaceRoot
    while ($candidate) {
        if ((Test-Path -LiteralPath (Join-Path $candidate "tools\android-sdk")) -and
            (Test-Path -LiteralPath (Join-Path $candidate "private\android-signing"))) {
            $SearchBeforeRoot = $candidate
            break
        }
        $candidate = Split-Path -Parent $candidate
    }
}
if (-not $SearchBeforeRoot) {
    throw "Shared tools/signing directory not found. Specify -SearchBeforeRoot."
}
$toolsRoot = (Resolve-Path -LiteralPath $SearchBeforeRoot).Path
$privateRoot = Join-Path $toolsRoot "private"
$signingInfoPath = Join-Path $privateRoot "android-signing\signing-key-info.txt"
$keystorePath = Join-Path $privateRoot "android-signing\signing.keystore"

if (-not $JavaHome) { $JavaHome = Join-Path $toolsRoot "tools\jdk17\jdk-17.0.20+8" }
if (-not $AndroidSdkRoot) { $AndroidSdkRoot = Join-Path $toolsRoot "tools\android-sdk" }
if (-not (Test-Path -LiteralPath (Join-Path $JavaHome "bin\java.exe")) -or
    -not (Test-Path -LiteralPath (Join-Path $AndroidSdkRoot "platforms\android-36\android.jar"))) {
    throw "JDK or Android API 36 SDK missing. Specify -JavaHome / -AndroidSdkRoot."
}

if (-not (Test-Path -LiteralPath $signingInfoPath) -or -not (Test-Path -LiteralPath $keystorePath)) {
    throw "Production signing files are missing from private/android-signing."
}

$signing = @{}
Get-Content -LiteralPath $signingInfoPath | ForEach-Object {
    $parts = $_ -split ":", 2
    if ($parts.Count -eq 2) {
        $signing[$parts[0].Trim()] = $parts[1].Trim()
    }
}

foreach ($requiredValue in @(
    $signing["Key alias"],
    $signing["Key store password"],
    $signing["Key password"]
)) {
    if ([string]::IsNullOrWhiteSpace($requiredValue)) {
        throw "Production signing fields are incomplete."
    }
}

$buildEnvironment = @{
    JAVA_HOME = $JavaHome
    ANDROID_HOME = $AndroidSdkRoot
    ANDROID_SDK_ROOT = $AndroidSdkRoot
    ANDROID_USER_HOME = (Join-Path $privateRoot "android-user-home")
    GRADLE_USER_HOME = (Join-Path $privateRoot "gradle-home-8.13")
    GRADLE_OPTS = "-Dorg.gradle.native=false"
    SEARCHBEFORE_KEYSTORE_PATH = $keystorePath
    SEARCHBEFORE_KEY_ALIAS = $signing["Key alias"]
    SEARCHBEFORE_STORE_PASSWORD = $signing["Key store password"]
    SEARCHBEFORE_KEY_PASSWORD = $signing["Key password"]
}
$previousEnvironment = @{}
foreach ($name in $buildEnvironment.Keys) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}
$locationPushed = $false
try {
    foreach ($name in $buildEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $buildEnvironment[$name], "Process")
    }
    Push-Location $projectRoot
    $locationPushed = $true
    & .\gradlew.bat --no-daemon clean bundleRelease assembleRelease
    if ($LASTEXITCODE -ne 0) {
        throw "Android release build failed with exit code $LASTEXITCODE."
    }
}
finally {
    if ($locationPushed) { Pop-Location }
    foreach ($name in $buildEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
    }
    $signing.Clear()
    $buildEnvironment.Clear()
    $previousEnvironment.Clear()
}

Write-Host "AAB: $projectRoot\app\build\outputs\bundle\release\app-release.aab"
Write-Host "APK: $projectRoot\app\build\outputs\apk\release\app-release.apk"
