param(
  [Parameter(Mandatory = $true)][string]$InputDirectory,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [string]$LanguageTag = "zh-Hant-TW"
)

$ErrorActionPreference = "Stop"

$resolvedInput = [System.IO.Path]::GetFullPath($InputDirectory)
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$privateRoot = [System.IO.Path]::GetFullPath("D:\SearchBefore\private")
if (-not $resolvedOutput.StartsWith($privateRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OCR 原文可能含個資，輸出目錄必須位於 $privateRoot"
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$asTaskMethods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
}

function Await-Operation {
  param($Operation, [Type]$ResultType)
  $method = $asTaskMethods | Where-Object {
    $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
  } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

$language = [Windows.Globalization.Language]::new($LanguageTag)
if (-not [Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($language)) {
  throw "Windows OCR 不支援 $LanguageTag"
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if (-not $engine) { throw "無法建立 Windows OCR 引擎" }

[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null
$files = Get-ChildItem -LiteralPath $resolvedInput -File | Where-Object {
  $_.Extension -match '^\.(jpg|jpeg|png|bmp|tif|tiff)$'
} | Sort-Object Name

$summary = @()
foreach ($file in $files) {
  $target = Join-Path $resolvedOutput ($file.BaseName + ".windows-ocr.json")
  if (Test-Path -LiteralPath $target) {
    $existing = Get-Content -Raw -Encoding UTF8 -LiteralPath $target | ConvertFrom-Json
    $summary += [ordered]@{
      sourceImage = $file.Name
      status = "existing"
      lineCount = @($existing.lines).Count
      charCount = ([string]$existing.text).Length
      elapsedMs = $existing.elapsedMs
      output = [System.IO.Path]::GetFileName($target)
    }
    continue
  }
  $started = [DateTimeOffset]::UtcNow
  $storageFile = Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($file.FullName)) ([Windows.Storage.StorageFile])
  $stream = Await-Operation ($storageFile.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Await-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-Operation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    try {
      $result = Await-Operation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      $lines = @()
      foreach ($line in $result.Lines) {
        $words = @()
        foreach ($word in $line.Words) {
          $rect = $word.BoundingRect
          $words += [ordered]@{
            text = $word.Text
            box = [ordered]@{ x = $rect.X; y = $rect.Y; width = $rect.Width; height = $rect.Height }
          }
        }
        $lines += [ordered]@{ text = $line.Text; words = $words }
      }
      $elapsed = ([DateTimeOffset]::UtcNow - $started).TotalMilliseconds
      $payload = [ordered]@{
        schemaVersion = 1
        sourceImage = $file.Name
        engine = "Windows.Media.Ocr"
        language = $LanguageTag
        generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
        elapsedMs = [math]::Round($elapsed)
        textAngle = $result.TextAngle
        text = $result.Text
        lines = $lines
      }
      [System.IO.File]::WriteAllText($target, ($payload | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
      $summary += [ordered]@{ sourceImage = $file.Name; status = "ok"; lineCount = $lines.Count; charCount = $result.Text.Length; elapsedMs = [math]::Round($elapsed); output = [System.IO.Path]::GetFileName($target) }
    } finally {
      if ($bitmap) { $bitmap.Dispose() }
    }
  } finally {
    if ($stream) { $stream.Dispose() }
  }
}

$summaryPayload = [ordered]@{
  schemaVersion = 1
  engine = "Windows.Media.Ocr"
  language = $LanguageTag
  generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  files = $summary
}
$summaryTarget = Join-Path $resolvedOutput "summary.json"
[System.IO.File]::WriteAllText($summaryTarget, ($summaryPayload | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
$summaryPayload | ConvertTo-Json -Depth 6
