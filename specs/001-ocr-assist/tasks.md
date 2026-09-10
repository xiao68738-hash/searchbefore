# Tasks: Google Cloud Vision OCR

## Completed in code

- [x] 建立 `PQC_OCR_SCAN_RESULT` v1 共用協定。
- [x] OCR 結果只建立未確認草稿。
- [x] 建立日期、田區、作物、防治對象、資材、數量、稀釋倍數、安全採收期、操作人員候選。
- [x] 新增器具／機械／設備保養、維修、校正及清潔紀錄類型。
- [x] 依日期切分同一張表的多筆草稿，支援同列多設備與多項作業。
- [x] 支援後續列省略年份、民國年份常見分隔方式，並拒絕不合理四位數年份。
- [x] 新增多筆人工覆核與批次儲存介面；共用設備不強制綁田區。
- [x] 放寬輸入版面限制：允許整本、跨頁及背景，只要求主要內容可閱讀。
- [x] 用藥候選無法唯一對回正式登記資料時阻擋帶入。
- [x] Android ML Kit 獨立原型與品質資訊協定。
- [x] Remove browser OCR model, generated bundle and package dependency.
- [x] Replace server engine with Google Cloud Vision `DOCUMENT_TEXT_DETECTION`.
- [x] Re-encode images and strip original EXIF before the third-party call.
- [x] Preserve Firebase token, exact Origin, size, pixel, timeout and per-user limits.
- [x] Preserve common draft protocol and mark source as `google-cloud-vision`.
- [x] Keep the production endpoint empty, set `formOcr=development`, and require the browser-session verification gate.
- [x] Update privacy, architecture, deployment and release-gate documentation.
- [x] Deploy the staging `/v1/ocr` service and configure the development endpoint.
- [x] Review the complete L3 operation recording and publish the timestamped workflow and field map.
- [x] Add exact／ambiguous／unknown document routing and prevent weak or tied evidence from auto-selecting the first type.
- [x] Keep complete material ledgers on the inventory-review route and adapt the local farm-record type to `materialPurchase` only after manual choice.
- [x] Keep stable source-image metadata and per-image queued／processing／recognized／failed state without storing image bytes or Object URLs in drafts.
- [x] Preserve page／block／paragraph indices, word geometry and detected breaks with bounded response sizes.
- [x] Add typed validation results (`ok`, `missing`, `warnings`, `mappingPending`) and separate review-prefill checks from final-save checks.

## Google Cloud setup and operations

- [x] Deploy staging Cloud Run and record the HTTPS endpoint.
- [ ] Verify in the Cloud console that billing, Vision API, Cloud Run, Cloud Build and Artifact Registry are enabled for the intended project.
- [ ] Verify the deployed service uses a dedicated Cloud Run service account through ADC with minimum permissions.
- [ ] Configure budget alerts, Vision quota and Cloud Run maximum instances.
- [ ] Verify application logs do not contain images, full OCR text or tokens.

## Verification

- [ ] Test authentication, CORS, 413, 422, 429, timeout and Vision errors.
- [ ] Test Traditional Chinese printed text, handwriting, multi-row forms, two-page spreads, background interference, glare, blur and skew.
- [ ] Measure per-field accuracy and missed-field rate on consented samples.
- [ ] Compare total manual time against OCR-assisted time.
- [ ] Update privacy text to match the final Google Cloud retention and logging settings.
- [ ] Set endpoint and give the verification code only to a named test cohort.
- [ ] Complete PWA, iOS browser, Android TWA and desktop regression tests.

## P0 after full workflow review

- [ ] Add source image ID, page, block IDs and geometry to every candidate and multi-row group.
- [ ] Introduce a standard draft schema: activity header plus typed `details[]`, rather than one generic material and amount pair.
- [x] Add per-record-type validation that returns missing fields and warnings; do not rely on a single boolean `canCommit` rule.
- [x] Preserve word geometry and detected breaks in the backend; reviewed table-row／cell candidates remain a later parser task.
- [ ] Add real consented golden fixtures for rotated spreads, table 10 material ledgers and table 18 equipment records; fixtures must be de-identified and must not enter a public repository.
- [ ] Add multi-image tests for partial failure, retry, removal, duplicate pages and cross-page grouping.
- [ ] Keep official L3 mappings `unmapped` until approved dictionaries, WSDL and a test environment are available.
