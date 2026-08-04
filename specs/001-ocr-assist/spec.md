# Feature Specification: OCR-assisted farm record entry

**Status**: Revised draft  
**Source of truth date**: 2026-08-04  
**Scope**: PWA upload, Cloud Run, Google Cloud Vision, Android prototype and shared human-review workflow

## User scenarios

### US1 — Build a draft from a paper record

An authenticated user selects or photographs a record, confirms its quality, explicitly consents to this upload, and receives field candidates. Nothing becomes a record until the user reviews and saves it.

Acceptance criteria:

- The feature is absent while release state is `hidden`.
- Upload requires Firebase login, an HTTPS endpoint and per-request consent.
- The response is rejected when its request ID or protocol does not match.
- OCR results never bypass existing record validation.

### US2 — Make uncertainty visible

The user can distinguish recognized text, candidate fields and unresolved values. If pesticide information cannot map uniquely to official registration data, the UI blocks transfer rather than guessing.

### US3 — Fail safely

Invalid type, oversized image, excessive pixels, missing authentication, disallowed origin, quota exhaustion, timeout or malformed OCR output produces a clear error and stores nothing.

## Functional requirements

- FR-001: Use Google Cloud Vision `DOCUMENT_TEXT_DETECTION` only through the SearchBefore backend.
- FR-002: Do not expose Google credentials or call Vision directly from the browser.
- FR-003: Strip EXIF and re-encode images before sending them to Vision.
- FR-004: Preserve the common `PQC_OCR_SCAN_RESULT` protocol and `google-cloud-vision` source marker.
- FR-005: Treat every result as an unconfirmed draft.
- FR-006: Keep the feature hidden until deployment, privacy, cost and real-device gates pass.
- FR-007: Do not log or persist images, full OCR text or tokens in application-controlled storage.

## Success criteria

- SC-001: Cross-device upload and failure tests pass.
- SC-002: Required field accuracy is measured on consented real samples.
- SC-003: Median total entry time is lower than the current manual workflow.
- SC-004: No image, full OCR text or token appears in storage or application logs.
- SC-005: Monthly cost remains within configured budget and quotas.

## Edge cases

- The declared MIME type does not match the actual image.
- A compressed image expands beyond the pixel limit.
- The form is incomplete, skewed, blurred or affected by glare.
- ROC and Gregorian dates coexist on one page.
- A pesticide name maps to multiple formulations or registrations.
- The token expires, quota is exhausted or Cloud Run times out.

## Key entities

- **OCR Request**: photo, request ID, Firebase identity and one-time consent state.
- **OCR Result Envelope**: protocol version, source, quality and normalized text blocks.
- **OCR Draft**: unconfirmed field candidates awaiting manual review.
- **Registered Pesticide Match**: the unique official registration match required before transfer.
