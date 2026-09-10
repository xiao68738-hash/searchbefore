# Feature Specification: OCR-assisted farm record entry

**Status**: Revised draft  
**Source of truth date**: 2026-08-09
**Scope**: PWA upload, Cloud Run, Google Cloud Vision, Android prototype and shared human-review workflow

**Observed workflow source**: [`docs/產銷履歷系統錄影-操作流程與欄位地圖.md`](../../docs/產銷履歷系統錄影-操作流程與欄位地圖.md)

## User scenarios

### US1 — Build a draft from a paper record

An authenticated user selects or photographs a record, confirms that its main table and handwriting remain readable, explicitly consents to this upload, and receives field candidates. The photo may contain a bound booklet, multiple pages, repeated rows or background material. Nothing becomes a record until the user reviews and saves it.

Acceptance criteria:

- The feature is absent while release state is `hidden`.
- Upload requires Firebase login, an HTTPS endpoint and per-request consent.
- The response is rejected when its request ID or protocol does not match.
- OCR results never bypass existing record validation.

### US2 — Make uncertainty visible

The user can distinguish recognized text, candidate fields and unresolved values. If pesticide information cannot map uniquely to official registration data, the UI blocks transfer rather than guessing.

### US3 — Fail safely

Invalid type, oversized image, excessive pixels, missing authentication, disallowed origin, quota exhaustion, timeout or malformed OCR output produces a clear error and stores nothing.

### US4 — Review several records from one photo

When one equipment maintenance form contains several dated rows, the system creates separate unconfirmed rows. Each row supports multiple equipment and action selections. The user can correct, add or remove rows before saving them as a batch; shared equipment does not require a field plot.

### US5 — Route a document before extracting records

The user may submit a production record, supporting record, inventory ledger, self-inspection sheet, master-data page or unrelated page. The system first decides the document route. A tied, weak or conflicting classification stays `ambiguous` or `unknown`; it never silently adopts the first candidate.

Acceptance criteria:

- Production records may continue to the existing record form after human review.
- Equipment sheets remain local supporting records while their L3 scope is unconfirmed.
- Material ledgers remain inventory drafts or exports, not one fertilizer application.
- Self-inspection, profile, administrative and unknown pages cannot pass the normal record commit gate.
- A user may manually choose a type for an ambiguous page, but must explicitly confirm that choice.

### US6 — Preserve the source of every candidate

For a multi-image batch, every candidate row remains linked to its source image, page and OCR block geometry. One failed or skipped image does not erase the others, and values from separate pages are not merged without an explicit reviewed rule.

## Functional requirements

- FR-001: Use Google Cloud Vision `DOCUMENT_TEXT_DETECTION` only through the SearchBefore backend.
- FR-002: Do not expose Google credentials or call Vision directly from the browser.
- FR-003: Strip EXIF and re-encode images before sending them to Vision.
- FR-004: Preserve the common `PQC_OCR_SCAN_RESULT` protocol and `google-cloud-vision` source marker.
- FR-005: Treat every result as an unconfirmed draft.
- FR-006: Keep the feature hidden until deployment, privacy, cost and real-device gates pass.
- FR-007: Do not log or persist images, full OCR text or tokens in application-controlled storage.
- FR-008: Do not reject an otherwise readable photo merely because page corners, a second page or background objects are visible.
- FR-009: Recognize equipment maintenance as a first-class record type and split repeated dated rows without auto-saving.
- FR-010: Treat inherited years, checkbox detection and uncertain row boundaries as reviewable candidates, never confirmed facts.
- FR-011: Classify every image as `production-record`, `supporting-record`, `material-ledger`, `reference-only`, `master-data`, `admin-output` or `unknown` before choosing a parser.
- FR-012: Store a route decision as `exact`, `ambiguous` or `unknown`; weak or tied evidence must abstain from automatic routing.
- FR-013: Keep SearchBefore field values separate from future official L3 codes. Values without an official source and dictionary version remain `unmapped`.
- FR-014: Preserve source image, page, OCR block IDs and geometry for each extracted candidate; never use the OCR output itself as test ground truth.
- FR-015: Do not present validation applications, product review or label-printing pages as supported OCR-to-record workflows.

## Success criteria

- SC-001: Cross-device upload and failure tests pass.
- SC-002: Required field accuracy is measured on consented real samples.
- SC-003: Median total entry time is lower than the current manual workflow.
- SC-004: No image, full OCR text or token appears in storage or application logs.
- SC-005: Monthly cost remains within configured budget and quotas.
- SC-006: No reference, master-data, administrative or unknown document is committed as a farm activity in the safety fixture set.
- SC-007: OCR-assisted median end-to-end handling time, including review and corrections, is lower than the manual baseline for the selected record types.

## Edge cases

- The declared MIME type does not match the actual image.
- A compressed image expands beyond the pixel limit.
- The form is incomplete, skewed, blurred or affected by glare.
- The photo includes a bound two-page spread, newspaper/background text or several record rows.
- Later rows omit the year and rely on the nearest previous year on the page.
- ROC and Gregorian dates coexist on one page.
- A pesticide name maps to multiple formulations or registrations.
- The token expires, quota is exhausted or Cloud Run times out.

## Key entities

- **OCR Request**: photo, request ID, Firebase identity and one-time consent state.
- **OCR Result Envelope**: protocol version, source, quality and normalized text blocks.
- **OCR Draft**: unconfirmed field candidates awaiting manual review.
- **OCR Record Group**: one dated row extracted from a multi-record page, with independently reviewable equipment and action candidates.
- **Document Route Decision**: exact, ambiguous or unknown classification with route, destination, L3 mapping state and reason.
- **Source Evidence**: image ID, page, OCR block IDs, geometry, original candidate text and confidence retained for review.
- **Standard Farm Draft**: one unconfirmed activity header with zero or more typed detail rows; distinct from official L3 codes.
- **Registered Pesticide Match**: the unique official registration match required before transfer.
