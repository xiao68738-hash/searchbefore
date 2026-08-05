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

## Google Cloud setup

- [ ] Enable billing, Vision API, Cloud Run, Cloud Build and Artifact Registry.
- [ ] Create a dedicated Cloud Run service account and attach it through ADC.
- [ ] Configure budget alerts, Vision quota and Cloud Run maximum instances.
- [ ] Deploy `/v1/ocr` and record the HTTPS endpoint.
- [ ] Verify application logs do not contain images, full OCR text or tokens.

## Verification

- [ ] Test authentication, CORS, 413, 422, 429, timeout and Vision errors.
- [ ] Test Traditional Chinese printed text, handwriting, multi-row forms, two-page spreads, background interference, glare, blur and skew.
- [ ] Measure per-field accuracy and missed-field rate on consented samples.
- [ ] Compare total manual time against OCR-assisted time.
- [ ] Update privacy text to match the final Google Cloud retention and logging settings.
- [ ] Set endpoint and give the verification code only to a named test cohort.
- [ ] Complete PWA, iOS browser, Android TWA and desktop regression tests.
