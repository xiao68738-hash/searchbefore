# NAF cell-level OCR benchmark v1

This benchmark uses 40 NAF documents from the official `test` and `valid` splits. Raw images, annotations, provider responses, and recognized text remain under `D:\SearchBefore\private` and must not be committed.

## Scope

- Ground truth: table row, column, and cell polygons derived from reviewed NAF annotations.
- Structure metrics: cell precision/recall/F1 at polygon IoU 0.5, matched mean IoU, row/column count accuracy, table detection rate, and latency.
- Text metrics: unavailable in v1 because NAF does not provide cell-level handwriting transcriptions.
- Matching: deterministic global greedy matching, sorted by polygon IoU descending.

## Prediction format

Each provider writes one `<documentId>.json` file:

```json
{
  "schemaVersion": 1,
  "provider": "provider-name",
  "model": "model-version",
  "documentId": "group-image",
  "processingMs": 1234,
  "tables": [{
    "cells": [{
      "rowIndex": 0,
      "columnIndex": 0,
      "rowSpan": 1,
      "columnSpan": 1,
      "polygon": [[0, 0], [100, 0], [100, 40], [0, 40]],
      "text": "",
      "confidence": null
    }]
  }]
}
```

All polygons use source-image pixel coordinates.

## Provider lanes

- Google ML Kit: text recognition only. For a fair cell benchmark, Table Transformer supplies the cell polygons and ML Kit supplies text per crop. ML Kit alone is recorded as `structure unsupported`.
- Google Document AI: Form Parser tables and cells.
- Azure Document Intelligence: `prebuilt-layout`, API version `2024-11-30`.

No PaddleOCR dependency or model is used.

The local structure lane uses Microsoft `table-transformer-detection` followed by `table-transformer-structure-recognition-v1.1-all`. Its output is marked `pending-ml-kit-device-run` until the same cell crops have been processed on Android; it must not be presented as an ML Kit text result before that step finishes.

The second local structure lane uses long horizontal/vertical ruling-line evidence at a reduced analysis resolution. It is deliberately independent from OCR text and emits only cell polygons.

## Commands

Validate and render the private ground truth:

```powershell
node scripts/validate-naf-cell-ground-truth.mjs D:\SearchBefore\private\ocr-benchmark\naf-cell-ground-truth-v1
python scripts/render-naf-cell-ground-truth.py D:\SearchBefore\private\ocr-benchmark\naf-cell-ground-truth-v1 D:\SearchBefore\private\ocr-benchmark\naf-cell-ground-truth-v1\previews 8
```

Run the cloud lanes after configuring credentials and existing processors/resources:

```powershell
python scripts/run-document-ai-cell-benchmark.py <ground-truth-root> <private-predictions-root>
node scripts/run-azure-cell-benchmark.mjs <ground-truth-root> <private-predictions-root>
node scripts/score-ocr-cell-benchmark.mjs <ground-truth-root> <private-predictions-root> <private-report.json>
```

Run the local gridline lane and rebuild the progress report:

```powershell
python scripts/run-gridline-cell-benchmark.py <ground-truth-root> <private-predictions-root>
python scripts/run-gridline-cell-benchmark-v3.py <ground-truth-root> <private-v3-predictions-root>
node scripts/score-ocr-cell-benchmark.mjs <ground-truth-root> <private-predictions-root> <private-reports-root>\gridline-v2.json
node scripts/merge-ocr-structure-predictions.mjs <gridline-predictions> <tatr-predictions> <private-hybrid-output>
node scripts/score-ocr-cell-benchmark.mjs <ground-truth-root> <private-hybrid-output> <private-reports-root>\hybrid-v2.json
node scripts/build-ocr-benchmark-report.mjs <private-reports-root> docs\OCR-Benchmark-Progress.md
```

Document AI requires `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `GOOGLE_DOCUMENT_AI_PROCESSOR_ID`. Azure requires `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` and `AZURE_DOCUMENT_INTELLIGENCE_KEY`. Scripts report only progress and counts; raw provider output and recognized text remain private.

## First local baseline result

Microsoft TATR was run over all 40 documents with table detection threshold 0.50. It detected a table in 35% of documents. At polygon IoU 0.50, cell precision was 13.33%, recall was 3.36%, and F1 was 5.36%; mean IoU among matched cells was 0.642. Median CPU inference latency was 444.5 ms and P95 was approximately 1.13 seconds. This is an intentionally retained unsuccessful baseline showing domain mismatch on dense historical forms. It is not an ML Kit text-accuracy result.

## Gridline v2 result

The gridline lane was run on the same 40 documents. At polygon IoU 0.50, cell precision was 58.60%, recall was 9.87%, and F1 was 16.89%; mean matched IoU was 0.690. Median latency was 720 ms and P95 was approximately 1.08 seconds. F1 is about 3.15 times the TATR v1 baseline, but document table detection was only 17.5%, so skew correction and a complementary fallback remain necessary.

The hybrid selects gridline v2 whenever it emits at least one cell and otherwise falls back to TATR v1. On the same corpus it reached 42.68% precision, 13.13% recall, 20.08% F1, 0.679 mean matched IoU, and 45% document table detection. Median latency was 1.04 seconds and P95 was approximately 1.82 seconds. This is the retained v2 structure baseline; skew correction is still required.

## Gridline v3 result

V3 preserves the original v2 result whenever at least 20 cells are detected. Only low-yield documents enter deskew estimation and adaptive local-threshold fallback; remaining empty documents use TATR. The full hybrid reached 39.54% precision, 13.90% recall, 20.57% F1, 0.682 mean matched IoU, and 47.5% document table detection. Median latency was 1.05 seconds and P95 was approximately 1.83 seconds. The gain over hybrid v2 is real but small, and the precision tradeoff keeps this as an experimental baseline rather than a release result.

A full-page local-background-contrast fallback was also evaluated on all 40 documents. It recovered 47 of 51 predicted cells on one previously missed faint-line page, but the aggregate hybrid result fell to 54.25% precision, 11.74% recall, 19.30% F1, and 40% table detection. It is therefore rejected as a baseline. The next experiment should segment table regions before applying faint-line enhancement, rather than relaxing line detection across the entire page.

## Gridline v4 page-region result

V4 preserves every non-empty v3 result. Empty pages are split into one or two paper regions, black borders and binding gutters are excluded, and faint-line enhancement runs only inside each region. With TATR fallback, the 40-document result reached 48.89% precision, 16.51% recall, 24.68% F1, 0.727 mean matched IoU, and 65% table detection. Median latency was 1.01 seconds and P95 was approximately 1.59 seconds. This replaces v3 as the current experimental structure baseline, but remains below release quality.

## Gridline v5 gated projection result

V5 adds long-line projection only when v4 remains empty. An ungated experiment raised table detection to 87.5% but lowered precision to 26.65% and F1 to 24.17%, so it was rejected. The retained version gates projection candidates by regional cell count, combined cell count, horizontal coverage, and cell-width variation. With TATR fallback it reached 43.42% precision, 20.76% recall, 28.09% F1, 0.725 mean matched IoU, and 72.5% table detection. Median latency was 1.07 seconds and P95 was approximately 2.20 seconds. V5 is the current experimental structure baseline.

## Gridline v6 two-page consensus result

V6 runs only on two-page documents that remain empty after v5. It selects column boundaries corroborated on both pages and reconstructs rows from a regular-spacing sequence, suppressing page-specific handwriting strokes. Two court-record documents recovered 256 and 228 cells, with 271 total true matches. The full benchmark reached 44.32% precision, 22.84% recall, 30.14% F1, 0.722 mean matched IoU, and 77.5% table detection. Median latency was 1.00 seconds and P95 was approximately 2.36 seconds. V6 is the current experimental structure baseline.

## V7 sibling-template-assisted result

V7 is a separate template-assisted lane, not a replacement for single-image v6. For v6-empty pages it considers only sibling pages from the same source record with 50–800 detected cells, and transfers normalized cell geometry only when 128×128 gradient similarity is at least 0.70. One page passed the gate and added 29 true matches. The resulting benchmark reached 44.16% precision, 23.06% recall, 30.30% F1, 0.720 mean matched IoU, and 80% table detection. A permissive version transferred two lower-similarity pages and reduced F1 to 29.16%, validating the conservative gate.

## V8 orientation and low-cell fallback result

V8 preserves every non-empty v7 result and runs only on empty documents. It evaluates 0°, 90°, and 270° orientations with conservative local-contrast grid candidates. Candidates require at least three rows and columns, 45% lattice occupancy, bounded width and height variation, and sufficient long-line coverage. Extreme candidates above 500 cells are trimmed when a coherent, stable-row-count lower table can be isolated; the trim is bypassed when the untrimmed count is consistent with a sibling page. A sibling-consistency gate still rejects anomalous fallbacks above a four-times count ratio. Five previously empty documents were recovered. The full benchmark reached 47.46% precision, 28.94% recall, 35.95% F1, 0.730 mean matched IoU, and 92.5% table detection. V8 remains an experimental recovery lane and does not replace the single-image v6 baseline.

## V9 underfilled sibling-template result

V9 targets non-empty pages whose detected cell count is at least four times lower than a sibling page from the same source record. A transfer requires 128×128 gradient similarity of at least 0.84 and a source candidate between 50 and 800 cells. The transferred grid is then checked directly against the target image: mean line support must be at least 0.30 and at least 25% of evaluated edges must have strong support. Three of four candidates passed this gate; one globally similar but structurally incompatible page was rejected. The 40-document benchmark reached 48.31% precision, 31.56% recall, 38.17% F1, 0.721 mean matched IoU, and 92.5% table detection. Because these thresholds were iterated on the same corpus, an untouched validation set is required before treating the gain as evidence of generalization.

## Untouched holdout result

After excluding all 40 development documents, 21 remaining eligible NAF test/valid documents formed an untouched holdout with 1,842 cells across 12 source groups. With all thresholds frozen, v6 reached 11.02% precision, 22.04% recall, 14.69% F1, and 76.19% table detection. V8 reached 11.43% precision, 25.90% recall, 15.86% F1, and 90.48% detection. V9 found no transfer candidate meeting its fixed gates, so its result was identical to v8. The large gap from the development corpus is a failed generalization test: dense false grids on documents with relatively small annotated tables dominate the errors. The 40-document result must not be presented as production accuracy.

## V10 projection confidence gate

V10 changes only the high-error v5 projection lane. It retains a projection when column-width variation is strongly regular, or when an irregular grid is corroborated by target-image edge support and a bounded page aspect ratio. Direct, regional, two-page consensus, orientation recovery, and sibling-transfer lanes are preserved unchanged. On the 50-document low-complexity train development set, precision increased from 9.90% to 18.54% while recall fell from 16.20% to 9.34%; F1 moved from 12.29% to 12.42%. All three projection documents in the original 40-document corpus passed the gate, so its v9 metrics were unchanged.

With the rule frozen, the 21-document validation set improved from 11.43% precision, 25.90% recall, and 15.86% F1 to 24.60% precision, 18.51% recall, and 21.13% F1. False positives fell from 3,696 to 1,045, while table detection fell from 90.48% to 66.67%. This is evidence that the conservative gate generalizes for false-positive suppression, but it is not sufficient for unattended extraction because recall remains low.

## V11 orientation-recovery confidence gate

V11 revisits only pages that remain empty after v10. It obtains the existing orientation-recovery candidate and accepts it only when target-image edge support, cell-width and cell-height variation, candidate size, and horizontal coverage provide sufficient evidence. On the 50-document low-complexity train development set, precision, recall, F1, and table detection increased from 18.54%, 9.34%, 12.42%, and 30% to 30.22%, 20.71%, 24.58%, and 48%.

With the gate frozen, one of 21 holdout pages was recovered. True positives increased from 341 to 356 while false positives increased only from 1,045 to 1,051; precision, recall, F1, and table detection rose to 25.30%, 19.33%, 21.91%, and 71.43%. The original 40-document corpus had no accepted recovery and therefore remained at its v10 metrics. This is the first empty-page recovery in this sequence to improve precision, recall, and F1 on both train and holdout, but the absolute accuracy remains unsuitable for unattended extraction.

## NAF transcription ground truth

The source annotations contain a `transcriptions` map keyed by NAF field IDs. The 40-document corpus exposes 376 transcribed fields, 4,134 normalized reference characters, and 811 words. These field boxes are not equivalent to the row-by-column intersection polygons used for structure scoring, so the benchmark preserves both layers and records only traceable spatial links instead of forcing every transcription into a derived grid cell.

The crop exporter and CER/WER scorer were validated with Windows.Media.Ocr `en-US` as a local comparison lane. Original crops produced 95.79% CER, 108.38% WER, 4.26% exact-field accuracy, and 22.87% non-empty recognition coverage. Upscaling, contrast enhancement, and fixed-threshold binarization produced CER values of 97.22%, 96.78%, and 98.45%, so none was retained as an improvement. This poor comparison baseline is not an ML Kit, Document AI, or Azure result.
