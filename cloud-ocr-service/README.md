# 噴前查 Google Cloud Vision OCR（尚未部署）

這是獨立的 Cloud Run 後端。PWA 不直接接觸 Vision API、服務帳戶或金鑰；前端只把使用者主動選取的照片送到 `/v1/ocr`，後端驗證 Firebase ID token 後再呼叫 Google Cloud Vision `DOCUMENT_TEXT_DETECTION`。

目前 `service-config.js` 的 `formOcr` 為 `development`，入口受測試驗證碼、Google 登入及逐次同意限制；正式端點仍是空白，因此尚未完成部署、隱私與實機驗收前不會真正上傳照片，也不得切到 `public`。

## 資料流程

1. 使用者以 Google 帳號登入。
2. 使用者選擇照片、確認四角與清晰度，並勾選本次雲端處理同意。
3. PWA 以 Firebase ID token 呼叫 Cloud Run `/v1/ocr`。
4. 後端限制 Origin、帳號頻率、檔案格式、12 MB 與 2,400 萬像素。
5. 後端修正 EXIF 方向、重新編碼成 JPEG，再使用 Cloud Run 服務身分呼叫 Vision API。
6. 後端只回傳文字、信心值與位置；前端建立未確認草稿，不自動儲存。

應用程式程式碼不寫入照片、OCR 文字或 token。仍須在 Cloud Logging 確認不記錄 request body，並設定合理的日誌保存期限。

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

## Google Cloud 前置作業

以 `PROJECT_ID`、`REGION` 與服務帳戶名稱替換範例值：

```bash
gcloud services enable vision.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project PROJECT_ID
gcloud iam service-accounts create searchbefore-ocr --project PROJECT_ID
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:searchbefore-ocr@PROJECT_ID.iam.gserviceaccount.com" --role="roles/serviceusage.serviceUsageConsumer"
gcloud run deploy searchbefore-ocr --source cloud-ocr-service --project PROJECT_ID --region REGION --service-account "searchbefore-ocr@PROJECT_ID.iam.gserviceaccount.com" --allow-unauthenticated --set-env-vars "ALLOWED_ORIGINS=https://searchbefore.tw,OCR_REQUESTS_PER_MINUTE=10"
```

Cloud Run 必須允許網路請求進入，因為瀏覽器帶的是 Firebase token，不是 Cloud Run IAM token；真正的使用者驗證由 `app/security.py` 完成。不要因此移除 Firebase token、Origin 或頻率限制。

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
