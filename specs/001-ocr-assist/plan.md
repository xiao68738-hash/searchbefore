# Implementation Plan: Google Cloud Vision OCR

## Architecture

- Frontend: single-page PWA, native JavaScript and Firebase Authentication.
- Backend: Python 3.11, FastAPI and Cloud Run.
- OCR: Google Cloud Vision `DOCUMENT_TEXT_DETECTION` through the Python client library.
- Authentication: Firebase ID token at the application boundary; Cloud Run attached service account for Vision ADC.
- Storage: no OCR image persistence; reviewed records continue through existing local/cloud-sync paths.

## Repository layout

```text
form-ocr.js                         # OCR output to field candidates
form-ocr-ui.js                      # upload, consent and review UI
service-config.js                   # provider, endpoint and release gate
cloud-ocr-service/                  # FastAPI / Vision backend
android-ocr-prototype/              # separate ML Kit research prototype
tests/form-ocr*.test.js             # draft and UI protocol tests
tests/cloud-ocr.test.js             # cloud security and disabled-by-default tests
specs/001-ocr-assist/               # specification, plan and task tracking
```

## Delivery strategy

1. Remove device and server Paddle dependencies.
2. Implement Vision normalization without changing the frontend result protocol.
3. Keep `formOcr=hidden` and endpoint empty.
4. Deploy with a dedicated Cloud Run service identity and no downloaded service-account key.
5. Add budgets, quotas and log-content checks.
6. Open only a `development` test cohort.
7. Promote only when accuracy and time-saving evidence pass.
