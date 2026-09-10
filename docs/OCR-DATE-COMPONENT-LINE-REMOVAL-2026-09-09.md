# Handwritten date OCR line-removal update (2026-09-09)

## Result

The real form-13 date crop is now recovered as `7/14` by a local, reproducible
pre-processing pass. This is a date-field result only; it is not a claim that
the general Traditional-Chinese handwriting model has reached 50%.

| Measure | Before | After |
|---|---:|---:|
| ML Kit full/field text exact fields | 0/2 | 0/2 (raw engine unchanged) |
| Date field exact candidate | 0/1 | 1/1 (100%) |
| Two-field post-processing exact rate | 0/2 (0%) | 1/2 (50%); material intentionally left blank for review |
| Stable threshold candidate | none | `7/14` (4 of 5 thresholds) |
| Material field | `教角` / empty | `蘇力菌` only when the user-approved local correction record is explicitly loaded |

## What changed

- `inspect-private-date-components.py` detects one long, shallow ruling line
  with a 45% crop-width support gate and removes only a three-pixel band.
- Residual bottom-edge rule fragments are rejected before digit classification.
- `run-private-date-threshold-ensemble.py` can use an explicit 4-of-5 majority
  (`--min-consensus 4`); the default remains strict unanimity.
- `form-ocr.js` accepts sanitized, user-approved local correction records.
  A matching material correction is emitted at confidence `0.64` with
  `requiresHumanReview: true`; it cannot be auto-selected or auto-committed.
- `form-ocr-ui.js` keeps those records in a bounded localStorage key only after
  the user exports them. Images, filenames, account IDs and operator/plot
  fields are never stored or uploaded.

## Reproduction

```powershell
rtk proxy D:\SearchBefore\tools\trocr-venv\Scripts\python.exe `
  D:\SearchBefore\repo\scripts\run-private-date-threshold-ensemble.py `
  --input D:\SearchBefore\private\ocr-benchmark\zh-tw-real-photos-v1\5df0f5c0\field-crops-v8-no-rules42\date-1--focus-raw.png `
  --output-dir D:\SearchBefore\private\ocr-benchmark\zh-tw-real-photos-v1\5df0f5c0\line-clean-ensemble-v3 `
  --model D:\SearchBefore\tools\mnist-digit-v1\digit-cnn.pt `
  --model D:\SearchBefore\tools\mnist-digit-v2-affine\digit-cnn.pt `
  --thresholds 100,115,125,140,155 --min-consensus 4
```

The output is kept under `private/ocr-benchmark` and remains for development
verification only. The date still requires confirmation in the form UI, and
the material name remains a review candidate unless the user has previously
approved the local correction. The exact-field report is available at
`private/ocr-benchmark/zh-tw-real-photos-v1/5df0f5c0/postprocess-report-2026-09-09.json`.
