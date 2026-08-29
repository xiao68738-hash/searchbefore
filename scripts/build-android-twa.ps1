$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Join-Path $workspaceRoot "android-twa"
$toolsRoot = Split-Path -Parent $workspaceRoot
$privateRoot = Join-Path $toolsRoot "private"
$signingInfoPath = Join-Path $privateRoot "android-signing\signing-key-info.txt"
$keystorePath = Join-Path $privateRoot "android-signing\signing.keystore"

$env:JAVA_HOME = Join-Path $toolsRoot "tools\jdk17\jdk-17.0.20+8"
$env:ANDROID_HOME = Join-Path $toolsRoot "tools\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $privateRoot "android-user-home"
$env:GRADLE_USER_HOME = Join-Path $privateRoot "gradle-home-8.13"
$env:GRADLE_OPTS = "-Dorg.gradle.native=false"

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

$env:SEARCHBEFORE_KEYSTORE_PATH = $keystorePath
$env:SEARCHBEFORE_KEY_ALIAS = $signing["Key alias"]
$env:SEARCHBEFORE_STORE_PASSWORD = $signing["Key store password"]
$env:SEARCHBEFORE_KEY_PASSWORD = $signing["Key password"]

foreach ($requiredValue in @(
    $env:SEARCHBEFORE_KEY_ALIAS,
    $env:SEARCHBEFORE_STORE_PASSWORD,
    $env:SEARCHBEFORE_KEY_PASSWORD
)) {
    if ([string]::IsNullOrWhiteSpace($requiredValue)) {
        throw "Production signing fields are incomplete."
    }
}

Push-Location $projectRoot
try {
    & .\gradlew.bat --no-daemon clean bundleRelease assembleRelease
    if ($LASTEXITCODE -ne 0) {
        throw "Android release build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
    Remove-Item Env:SEARCHBEFORE_KEY_ALIAS -ErrorAction SilentlyContinue
    Remove-Item Env:SEARCHBEFORE_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SEARCHBEFORE_KEY_PASSWORD -ErrorAction SilentlyContinue
}

Write-Host "AAB: $projectRoot\app\build\outputs\bundle\release\app-release.aab"
Write-Host "APK: $projectRoot\app\build\outputs\apk\release\app-release.apk"
