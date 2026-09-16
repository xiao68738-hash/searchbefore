param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._:-]+$')][string]$Serial,
    [string]$SharedRoot = 'D:\SearchBefore'
)
$ErrorActionPreference = 'Stop'
# Read-only acceptance snapshot. Never install, uninstall, clear data, authenticate or sync.
# Deliberately fixed to the DEBUG preview package, never the deployed TWA/production app.
$adb = Join-Path $SharedRoot 'tools\android-sdk\platform-tools\adb.exe'
$package = 'tw.searchbefore.app.nativepreview'
function Invoke-Device {
    param([string[]]$Arguments)
    $result = & $adb -s $Serial @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Device read failed. No data was changed.' }
    return $result
}
$deviceState = Invoke-Device @('get-state')
if (($deviceState -join '').Trim() -ne 'device') { throw 'The selected device is not authorized/ready.' }
$model = (Invoke-Device @('shell', 'getprop', 'ro.product.model') -join '').Trim()
$sdk = (Invoke-Device @('shell', 'getprop', 'ro.build.version.sdk') -join '').Trim()
$installed = Invoke-Device @('shell', 'pm', 'list', 'packages', $package)
if ($installed -notcontains "package:$package") { throw 'The native preview is not installed. No installation was attempted.' }
$raw = Invoke-Device @('shell', 'run-as', $package, 'cat', 'no_backup/native-records/state.json')
try { $document = ($raw -join "`n") | ConvertFrom-Json }
catch { throw 'The preview state is unreadable. Do not clear app data.' }
if ($document.version -ne 1 -or $null -eq $document.data) { throw 'Unexpected preview state format.' }
# Output aggregate evidence only. No account identifier, token, names, notes or record IDs.
$counts = [ordered]@{}
$tombstones = [ordered]@{}
foreach ($key in @('fieldPlots', 'records', 'farmRecords', 'recipes')) {
    if ($null -eq $document.data.$key) { throw 'Missing expected collection.' }
    $counts[$key] = @($document.data.$key).Count
    if ($key -ne 'recipes') { $tombstones[$key] = @($document.tombstones.$key | Where-Object { $null -ne $_ }).Count }
}
[ordered]@{
    observedAtUtc = [DateTime]::UtcNow.ToString('o')
    model = $model
    apiLevel = [int]$sdk
    package = $package
    counts = $counts
    tombstones = $tombstones
    ownerAssigned = [bool]$document.ownerUid
    syncEnabled = [bool]$document.syncEnabled
    lastCompletedSyncUtc = $document.lastSyncAt
    remindersEnabled = [bool]$document.remindersEnabled
    limitation = 'Local state only; does not prove authentication, server backup or restore.'
} | ConvertTo-Json -Depth 4
