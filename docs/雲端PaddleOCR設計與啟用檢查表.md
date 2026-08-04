# 雲端 PaddleOCR 設計與啟用檢查表

更新日期：2026-08-04

## 為什麼改成雲端

瀏覽器版 PaddleOCR 即使壓縮照片，仍可能在 iPhone Safari／Chrome 因模型初始化超過分頁可用記憶體而失敗。手機剩餘儲存空間與瀏覽器可用 RAM 是兩件不同的事，因此繼續降低照片畫質不一定能解決問題。

新的目標流程是：

1. PWA 只負責拍照或選擇原始照片。
2. 使用者逐次勾選同意，並用 Google 帳號取得 Firebase ID token。
3. 照片以 HTTPS 傳到 Cloud Run 的 PaddleOCR。
4. 後端只在記憶體解碼與辨識，不寫入磁碟，不記錄 OCR 文字。
5. 後端只回傳文字、信心值及位置。
6. 前端建立未確認草稿，使用者逐欄核對後才可帶入紀錄。

## 目前狀態

- `cloud-ocr-service/`：可部署的後端骨架已建立。
- `form-ocr-ui.js`：已支援雲端模式、單次同意、Google 登入 token 與安全格式檢查。
- `service-config.js`：目前仍為 `provider: "browser"` 且 endpoint 空白，所以正式網站不會偷偷上傳照片。
- 尚未完成：Cloud Run 實際部署、模型冷啟動／成本測試、App Check、壓力與刪除驗證、真實表單正確率測試。

## 啟用前不得跳過

- [ ] 建立獨立 Google Cloud 專案或至少獨立 Cloud Run 服務帳戶。
- [ ] 設定預算通知、每分鐘／每日請求上限及最大執行個體數。
- [ ] Cloud Run 設定 2 CPU、至少 4 GiB RAM、concurrency 1、min instances 0。
- [ ] CORS 只允許 `https://searchbefore.tw` 與確有需要的 `https://www.searchbefore.tw`。
- [ ] 驗證未登入、假 token、錯誤網域、超大檔案、PDF、損壞圖片都被拒絕。
- [ ] 確認 Cloud Logging 沒有照片內容、OCR 文字、Authorization header 或個資。
- [ ] 以至少 30 張不同光線、角度與手寫方式的真實表單評估欄位正確率。
- [ ] 用 iPhone Safari、Android Chrome 與 Google Play TWA 實測。
- [ ] 更新隱私政策的實際 Cloud Run 服務位置與保留政策。
- [ ] 最後才把 `service-config.js` provider 改為 `cloud-paddleocr` 並填入 `/v1/ocr` 網址。

## 不會做的事

- 不把 Cloud Run 私鑰或服務帳戶 JSON 放進 GitHub／前端。
- 不使用寫在 JavaScript 的固定 API key 當安全驗證。
- 不讓 OCR 結果直接成為正式紀錄。
- 不以 OCR 正確率取代實際「是否省工」的流程驗證。
