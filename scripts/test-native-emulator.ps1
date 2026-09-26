param([string]$SharedRoot = 'D:\SearchBefore')
$ErrorActionPreference = 'Stop'
$adb = Join-Path $SharedRoot 'tools\android-sdk\platform-tools\adb.exe'
$serial = 'emulator-5580' # Dedicated disposable validation profile; NEVER a phone or Play profile.
$repo = Split-Path $PSScriptRoot -Parent
$apkRoot = Join-Path $repo 'android-native\app\build\outputs\apk'
$apks = @((Join-Path $apkRoot 'debug\app-debug.apk'),
    (Join-Path $apkRoot 'androidTest\debug\app-debug-androidTest.apk'))
foreach ($apk in $apks) { if (!(Test-Path -LiteralPath $apk)) { throw "Missing test APK: $apk" } }
$state = & $adb -s $serial get-state
if ($LASTEXITCODE -ne 0 -or "$state".Trim() -ne 'device') { throw 'Validation emulator is not online' }
$virtual = & $adb -s $serial shell getprop ro.kernel.qemu
$boot = & $adb -s $serial shell getprop sys.boot_completed
if ("$virtual".Trim() -ne '1' -or "$boot".Trim() -ne '1') { throw 'Require a booted emulator, never a physical device' }
$logDir = Join-Path $SharedRoot ('audits\native-ui-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir 'execution.txt') | Out-Null
try {
    Write-Output "Target=$serial; only preview/test APKs; evidence=$logDir"
    Get-FileHash -Algorithm SHA256 -LiteralPath $apks | Format-List
    & $adb -s $serial shell getprop ro.build.version.sdk
    & $adb -s $serial shell wm size
    & $adb -s $serial shell wm density
    & $adb -s $serial shell settings get system font_scale
    foreach ($apk in $apks) {
        & $adb -s $serial install -r $apk
        if ($LASTEXITCODE -ne 0) { throw 'Preview APK install failed; tests not started' }
    }
    & $adb -s $serial shell pm revoke tw.searchbefore.app.nativepreview android.permission.POST_NOTIFICATIONS
    if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare notification-permission test' }
    $result = & $adb -s $serial shell am instrument -w tw.searchbefore.app.nativepreview.test/androidx.test.runner.AndroidJUnitRunner 2>&1 |
        Tee-Object -FilePath (Join-Path $logDir 'instrumentation.txt')
    $exitCode = $LASTEXITCODE
    $result | Write-Output
    # adb may exit 0 on a crashed runner. Require Android's completed-suite marker.
    if ($exitCode -ne 0 -or ($result -join "`n") -notmatch 'OK \(\d+ tests?\)' -or
        ($result -join "`n") -match 'FAILURES!!!|Process crashed|INSTRUMENTATION_FAILED') {
        throw 'UI suite did not complete successfully; preserve logs, do not report a pass'
    }
} finally { Stop-Transcript | Out-Null }
