param([string]$SharedRoot = 'D:\SearchBefore')
$ErrorActionPreference = 'Stop'
$adb = Join-Path $SharedRoot 'tools\android-sdk\platform-tools\adb.exe'
$serial = 'emulator-5580' # Disposable validation profile only, never a user's phone.
$state = & $adb -s $serial get-state
if ($LASTEXITCODE -ne 0 -or "$state".Trim() -ne 'device') { throw 'Validation emulator is not online' }
$virtual = & $adb -s $serial shell getprop ro.kernel.qemu
$boot = & $adb -s $serial shell getprop sys.boot_completed
if ("$virtual".Trim() -ne '1' -or "$boot".Trim() -ne '1') { throw 'Require a booted emulator' }

# Preserve overrides rather than assuming that reset reproduces the original viewport.
$sizeOutput = (& $adb -s $serial shell wm size) -join "`n"
if ($LASTEXITCODE -ne 0 -or $sizeOutput -notmatch 'Physical size: \d+x\d+') { throw 'Cannot read original display size' }
$originalSize = if ($sizeOutput -match 'Override size: (\d+x\d+)') { $Matches[1] } else { 'reset' }
$densityOutput = (& $adb -s $serial shell wm density) -join "`n"
if ($LASTEXITCODE -ne 0 -or $densityOutput -notmatch 'Physical density: \d+') { throw 'Cannot read original density' }
$originalDensity = if ($densityOutput -match 'Override density: (\d+)') { $Matches[1] } else { 'reset' }
$originalFont = "$(& $adb -s $serial shell settings get system font_scale)".Trim()
if ($LASTEXITCODE -ne 0 -or $originalFont -notmatch '^\d+(\.\d+)?$') { throw 'Cannot read original font scale' }
$logDir = Join-Path $SharedRoot ('audits\native-tablet-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $logDir | Out-Null
$profiles = @(
    @{ Name = 'tablet-portrait'; Size = '600x960' },
    @{ Name = 'tablet-landscape'; Size = '1280x800' }
)
$results = @()
$complete = $false
$restoreFailures = @()
Start-Transcript -Path (Join-Path $logDir 'matrix.txt') | Out-Null
try {
    Write-Output "Target=$serial; viewport validation, not real tablet hardware or Play acceptance; evidence=$logDir"
    foreach ($profile in $profiles) {
        & $adb -s $serial shell wm size $profile.Size
        if ($LASTEXITCODE -ne 0) { throw 'Viewport size change failed' }
        & $adb -s $serial shell wm density 160
        if ($LASTEXITCODE -ne 0) { throw 'Viewport density change failed' }
        & $adb -s $serial shell settings put system font_scale 1.5
        if ($LASTEXITCODE -ne 0) { throw 'Font scale change failed' }
        Write-Output ("PROFILE " + $profile.Name + '; size=' + $profile.Size + '; density=160; font=1.5')
        # Existing runner installs only preview/test APKs and requires the complete-suite marker.
        & (Join-Path $PSScriptRoot 'test-native-emulator.ps1') -SharedRoot $SharedRoot
        $results += @{ profile = $profile.Name; size = $profile.Size; density = 160; fontScale = 1.5; passed = $true }
        $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $logDir 'completed-profiles.json') -Encoding utf8
    }
    $complete = $true
} finally {
    & $adb -s $serial shell wm size $originalSize
    if ($LASTEXITCODE -ne 0) { $restoreFailures += 'size' }
    & $adb -s $serial shell wm density $originalDensity
    if ($LASTEXITCODE -ne 0) { $restoreFailures += 'density' }
    & $adb -s $serial shell settings put system font_scale $originalFont
    if ($LASTEXITCODE -ne 0) { $restoreFailures += 'fontScale' }
    @{ complete = $complete; restored = ($restoreFailures.Count -eq 0); restoreFailures = $restoreFailures; results = $results } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $logDir 'result.json') -Encoding utf8
    Stop-Transcript | Out-Null
    if ($restoreFailures.Count -gt 0) { throw ('Viewport restoration failed: ' + ($restoreFailures -join ', ')) }
}
Write-Output "Tablet viewport matrix passed; original display overrides restored. Evidence=$logDir"
