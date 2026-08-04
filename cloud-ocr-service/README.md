# 噴前查雲端 PaddleOCR（尚未部署）

這個資料夾是獨立的 Cloud Run 後端。GitHub Pages 仍只放 PWA；大型 PaddleOCR 模型在伺服器執行，手機不會再承擔模型記憶體。

## 安全邊界

- `/v1/ocr` 只接受 `searchbefore.tw`、JPG／PNG／WebP、12 MB 以下及 2,400 萬像素以下圖片。
- 每次請求都要附 Firebase ID token；後端用 Firebase Admin 驗證，前端不保存任何私鑰。
- 圖片只在記憶體解碼，不寫入磁碟；應用程式不記錄圖片、OCR 文字或 token。
- 回傳內容只建立前端草稿，仍須由使用者逐欄確認，不會自動存成正式紀錄。
- 服務採單一 worker，避免同一 Paddle 推論物件被平行執行緒共用。Cloud Run 的單一執行個體並行數也應設為 1。

## 部署前置作業

1. 在 Google Cloud 選定專案並啟用 Cloud Run、Cloud Build、Artifact Registry。
2. 確認 Cloud Run 使用的服務帳戶可呼叫 Firebase Authentication 驗證。
3. 於本目錄建置容器；第一次建置會下載 Paddle 套件，第一次啟動會下載模型。
4. 部署時設定至少 4 GiB 記憶體、2 CPU、concurrency 1、timeout 60 秒、min instances 0。
5. 先用測試網址驗證，再將 `service-config.js` 的 `ocr.provider` 改為 `cloud-paddleocr`，並填入 HTTPS endpoint。

參考指令（專案 ID 與區域需自行替換）：

```powershell
gcloud builds submit --tag asia-east1-docker.pkg.dev/PROJECT_ID/searchbefore/ocr:0.1
gcloud run deploy searchbefore-ocr --image asia-east1-docker.pkg.dev/PROJECT_ID/searchbefore/ocr:0.1 --region asia-east1 --allow-unauthenticated --cpu 2 --memory 4Gi --concurrency 1 --timeout 60 --min 0 --max 3 --set-env-vars "ALLOWED_ORIGINS=https://searchbefore.tw,https://www.searchbefore.tw"
```

`--allow-unauthenticated` 只代表瀏覽器能連到 Cloud Run；應用層仍強制驗證 Firebase ID token。正式公開前還應加上 App Check、用量警報與 API 配額。

## 本機測試

不安裝 Paddle 也能先執行純驗證測試：

```powershell
python -m pytest tests -q
```
