# Tasks: OCR 表單輸入輔助

## Phase 1：已完成的基礎

- [x] 建立 `PQC_OCR_SCAN_RESULT` v1 共用協定。
- [x] OCR 結果只建立未確認草稿。
- [x] 建立日期、田區、作物、防治對象、資材、數量、稀釋倍數、安全採收期、操作人員候選。
- [x] 用藥候選無法唯一對回正式登記資料時阻擋帶入。
- [x] 瀏覽器 PaddleOCR.js 圖片匯入與低記憶體錯誤提示。
- [x] Android ML Kit 獨立原型與品質資訊協定。
- [x] FastAPI／PaddleOCR 3.7 雲端服務骨架。
- [x] Firebase token、Origin、格式、大小、像素、逾時與記憶體限流控制。
- [x] 雲端 provider 預設關閉，endpoint 保持空白。
- [x] 前端與後端基本單元／安全測試。

## Phase 2：PR #115 工程評審

- [ ] 確認 PaddleOCR 3.7 真實輸出與 `normalize_results()` 相容。
- [ ] 在乾淨環境建置 Docker，確認非 root HOME 的模型快取可重現。
- [ ] 實測 `asyncio.wait_for` 逾時後的推論執行緒是否釋放。
- [ ] 評估單 worker、concurrency 1、2 CPU／4 GiB 的吞吐與成本。
- [ ] 檢查依賴授權、CVE、模型來源與 checksum 固定方式。
- [ ] 確認 Cloud Logging 與錯誤追蹤不含圖片、token、OCR 文字。
- [ ] 決定跨執行個體的全域限流與防刷方案。

## Phase 3：受控部署

- [ ] 建立獨立測試用 Google Cloud／Cloud Run 環境。
- [ ] 使用最小權限服務帳戶，不放長期金鑰到 GitHub 或前端。
- [ ] 設定 Artifact Registry、預算警報、max instances 與告警。
- [ ] 加入 App Check 或等效的應用層濫用防護。
- [ ] 只以測試網域／測試帳號存取，不修改正式 provider。
- [ ] 驗證冷／暖啟動、錯誤碼、逾時、記憶體峰值與單張成本。

## Phase 4：資料與流程驗收

- [ ] 取得 30～50 張有同意且去識別化的實際表單。
- [ ] 建立版本化 ground truth，不提交含個資的原圖到公開 Git。
- [ ] 量測欄位 precision、recall、無候選率與誤帶入率。
- [ ] 量測完整作業時間與人工修正次數，回答是否真的省工。
- [ ] 驗證特殊品種、地方俗稱、紙本與官方欄位不一致等例外。
- [ ] 確認所有用藥無／多重對應情境都會阻擋。

## Phase 5：正式啟用（另開 PR）

- [ ] 更新隱私政策與上傳同意文字，與實際保存／日誌設定一致。
- [ ] 填入正式 HTTPS `/v1/ocr` endpoint。
- [ ] 將 provider 改為 `cloud-paddleocr`，保留快速回退開關。
- [ ] 完成手機、PWA、Google Play TWA 與桌面回歸測試。
- [ ] 上線後監控成本、逾時率、錯誤率與濫用，不記錄敏感內容。

## Do Not Ship

- [ ] 不在 Phase 2～4 完成前切換正式 provider。
- [ ] 不宣稱 OCR 可以自動登打或直接上傳 L3。
- [ ] 不讓 OCR 值覆蓋官方農藥登記資訊。
- [ ] 不把未去識別化表單、服務帳戶 JSON、私鑰或 token 放進 repo。
