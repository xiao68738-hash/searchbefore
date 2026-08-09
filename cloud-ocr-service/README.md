# 噴前查 Google Cloud Vision OCR（staging 測試中）

這是獨立的 Cloud Run 後端。PWA 不直接接觸 Vision API、服務帳戶或金鑰；前端只把使用者主動選取的照片送到 `/v1/ocr`，後端驗證 Firebase ID token 後再呼叫 Google Cloud Vision `DOCUMENT_TEXT_DETECTION`。

目前 `service-config.js` 的 `formOcr` 為 `development`，入口受測試驗證碼、Google 登入及逐次同意限制；前端解鎖後，後端仍會以 `OCR_TEST_CODE_SHA256` 再次核對驗證碼。已部署 staging Cloud Run endpoint，但尚未完成品質、隱私、費用與實機驗收，因此不得切到 `public`。

## 資料流程

1. 使用者以 Google 帳號登入。
2. 使用者選擇照片、確認四角與清晰度，並勾選本次雲端處理同意。
3. PWA 以 Firebase ID token 與本次輸入的測試驗證碼呼叫 Cloud Run `/v1/ocr`；驗證碼只保留在目前頁面的記憶體中。
4. 後端限制 Origin、登入帳號、測試驗證碼、帳號頻率、檔案格式、12 MB 與 2,400 萬像素。
5. 後端修正 EXIF 方向、重新編碼成 JPEG，再使用 Cloud Run 服務身分呼叫 Vision API。
6. 後端只回傳文字、信心值與位置；前端建立未確認草稿，不自動儲存。

應用程式程式碼不寫入照片、OCR 文字或 token。仍須在 Cloud Logging 確認不記錄 request body，並設定合理的日誌保存期限。

## 辨識結果與來源追溯

`protocolVersion` 維持 `1`，既有的段落 `id`、`text`、`confidence`、`box` 欄位不變。後端以加欄位方式提供：

- `layout.coordinateSpace = "normalized"`：所有方框皆為 `0..1` 的正規化座標。
- 每個段落的 `source`：保留原結果中的 page、block、paragraph 索引。
- 每個段落的 `blockBox`：保留所屬區塊位置。
- 每個段落的 `words`：包含單字文字、信心值、位置及 `detectedBreak` 換行／空白提示。
- `wordsTruncated`：若單段或整份文件超過安全上限，明確告知幾何資料未完整回傳。

服務只在目前 HTTPS 回應內傳回上述結果，不把原圖、完整 OCR 全文或 token 寫入應用程式日誌或資料庫。為避免異常文件造成過大回應，最多回傳 500 個段落、每段 200 個單字、整份文件 5,000 個單字位置；舊前端可忽略新增欄位並繼續運作。

## 本機測試

```powershell
cd cloud-ocr-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
gcloud auth application-default login
pytest -q
uvicorn app.main:app --reload
```

純邏輯測試不會呼叫 Vision API。需要實際辨識時，必須先啟用 API、設定計費與 ADC，並使用不含真實個資的測試圖片。

## staging 實機驗收清單

目前前端入口仍是 `development`，只有取得測試驗證碼、完成 Google 登入，並同意本次雲端處理後才會送出圖片。驗證碼不寫入文件或公開貼文，請由專案管理者另行提供給測試者。

請依序驗證：

1. 未登入、驗證碼錯誤、未勾選同意時，不能開始辨識，也不應發出 OCR 請求。
2. 使用一張四角完整、文字清楚且不含真實個資的表單照片，確認可選擇拍照或檔案。
3. 開始辨識後，確認畫面顯示處理中、成功結果與信心資訊；結果必須先人工確認，不能直接寫入正式紀錄。
4. 分別測試模糊、裁切不完整、過大檔案與非圖片檔，確認畫面提供可理解的錯誤與重新選取方式。
5. 在 Cloud Logging 檢查不包含圖片內容、完整 OCR 文字、Firebase token 或個人資料。
6. 每次測試記錄圖片類型、成功／失敗、錯誤訊息、欄位正確率與人工修正時間，作為是否省工的依據。

測試期間不得把 staging 端點切換為 `public`，也不得使用農民真實含個資的表單；完成品質、隱私、費用與實際省工驗收後，才重新評估公開範圍。

## 健康檢查

部署後請使用 `GET /v1/health` 確認服務可用，預期回應為 `{"status":"ok"}`。Cloud Run 的 Google 前端可能攔截 `/healthz`，因此外部監控不要使用該路徑；`/healthz` 僅保留給本機相容用途。

## Google Cloud 前置作業

以 `PROJECT_ID`、`REGION` 與服務帳戶名稱替換範例值：

```bash
gcloud services enable vision.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project PROJECT_ID
gcloud iam service-accounts create searchbefore-ocr --project PROJECT_ID
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:searchbefore-ocr@PROJECT_ID.iam.gserviceaccount.com" --role="roles/serviceusage.serviceUsageConsumer"
gcloud run deploy searchbefore-ocr --source cloud-ocr-service --project PROJECT_ID --region REGION --service-account "searchbefore-ocr@PROJECT_ID.iam.gserviceaccount.com" --allow-unauthenticated --set-env-vars "ALLOWED_ORIGINS=https://searchbefore.tw,OCR_REQUESTS_PER_MINUTE=10,OCR_TEST_CODE_SHA256=<64-char-sha256>"
```

Cloud Run 必須允許網路請求進入，因為瀏覽器帶的是 Firebase token，不是 Cloud Run IAM token；真正的使用者驗證由 `app/security.py` 完成。不要因此移除 Firebase token、測試驗證碼、Origin 或頻率限制。

生產環境使用 Cloud Run 附加的服務帳戶與 Application Default Credentials。不要下載 JSON 金鑰，也不要把 API key、服務帳戶金鑰或 access token 寫進 GitHub、前端設定或 App。

## 啟用順序

1. 啟用 Vision API 與計費，建立預算通知和可接受的配額。
2. 以專用服務帳戶部署 Cloud Run。
3. 使用測試帳號驗證 401、403、413、422、429、逾時與正常回應。
4. 確認 Cloud Logging 不含圖片、完整 OCR 文字或 token。
5. 更新 `privacy.html` 的實際處理方式與 Google 服務說明。
6. 將 Cloud Run `/v1/ocr` HTTPS 網址填入 `service-config.js`。
7. 部署並驗收端點後，維持 `development` 做指定測試；完成正確率、實際省工、隱私及費用驗收後，才評估是否改為 `public`。
8. 通過欄位正確率、人工覆核與省工比較後，才評估 `public`。

## 成本邊界

Vision 依圖片／頁面及使用的功能計價，Cloud Run 另行計費。除了帳號頻率限制，還要在 Google Cloud 設定預算通知、配額與異常流量監控；應用程式端限流不能取代雲端配額。
