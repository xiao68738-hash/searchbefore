# Google Cloud Vision 設計與啟用檢查表

## 目前決策

- 不再在瀏覽器下載或執行 OCR 模型。
- 不使用原本的 PaddleOCR 前端與伺服器套件。
- PWA 只連到噴前查 Cloud Run；Cloud Run 再以服務身分呼叫 Google Cloud Vision。
- 使用 `DOCUMENT_TEXT_DETECTION`，因為來源是密集文字、表格與手寫紀錄照片。
- OCR 永遠只產生待人工確認草稿，不會直接建立正式紀錄。
- 正式端點尚未部署，所以 `formOcr=development` 只顯示測試入口；入口另有測試驗證碼、Google 登入與單次同意閘門。

## 上線前必做

- [ ] Google Cloud 專案已啟用計費與 Vision API。
- [ ] 已建立專用 Cloud Run 服務帳戶，沒有下載長效 JSON 金鑰。
- [ ] 已設定預算通知、Vision 配額及 Cloud Run 最大執行個體數。
- [ ] Firebase ID token、Origin 白名單、每帳號限流、檔案大小與像素限制均通過測試。
- [ ] Cloud Logging 不包含 request body、圖片、完整 OCR 文字或 token。
- [ ] 隱私政策已說明照片會交由 Google Cloud 處理。
- [ ] 使用真實但已取得同意的樣本，完成清晰／模糊／反光／歪斜／手寫測試。
- [ ] 與人工登打比較總時間，確認確實省工，而非多一道核對步驟。
- [ ] 端點填入後先使用 `development`，不得直接改為 `public`。

## 驗收指標

- 服務：成功率、P50／P95 延遲、401／429／5xx 比例。
- 辨識：日期、作物、資材、數量、稀釋倍數等欄位的正確率與漏字率。
- 工作：單筆總時間、必須回看紙本的次數、人工改字數、缺資料回問次數。
- 安全：沒有任何圖片或完整 OCR 文字出現在應用程式日誌與資料庫。
- 成本：每 100、1,000 張圖片的 Vision 與 Cloud Run 實際費用。
