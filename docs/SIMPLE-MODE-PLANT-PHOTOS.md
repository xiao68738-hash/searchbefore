# 簡易模式與植物照片

網頁版本：0.3.10.4。原生 Android 不會因網站部署自動更新；本變更不涉及 PR161。

## 操作與資料

- 原查詢頁選擇「簡易」進入「我的植物／陽台」，標準為預設；可隨時切回原介面。
- 植物沿用 fieldPlots，澆水／施肥／觀察沿用 farmRecords 與既有驗證；不建第二套紀錄。
- 用藥與採收仍走原登記查詢及安全採收檢查。無用藥紀錄不代表可以採收。
- 照片是每株一張封面，選擇後預覽，明確按儲存才取代舊圖。可下載或確認移除。
- 照片只存 IndexedDB，按登入帳號／訪客分區，不放進雲端同步、JSON 備份或 OCR。這不是本機加密保險箱。
- JPG／PNG／WebP 上限 12 MiB；轉 JPG 移除 EXIF，長邊最多 1024px、每張最多 400 KiB、全部最多 30 MiB。
- 清除網站資料、瀏覽器回收空間、換裝置都可能遺失圖片，需另下載留存。
- 植物刪除不會連動永久刪除照片；可能保留孤立圖片。批次匯出與孤立圖片管理未納入本輪，不能宣稱照片完整備份。
- 原有公開操作指南一起接回入口，修正「所有功能都不用登入」的過度聲明；未啟用廣告。

## 驗收

2026-10-24：57 個根目錄 JS 測試檔、73 項隔離瀏覽器檢查、41 個發布成品檢查通過。
瀏覽器涵蓋 320／390／1280px、照片選擇／儲存／替換／下載／移除、偽裝格式拒絕、容量失敗保留舊圖、儲存不可用、帳號分區、重新載入與模式切回、深色高對比大字溢位。
僅隔離開發環境與合成圖片，不代表真實雲端或 Android 驗收。

```sh
npm test
npm run build
node scripts/check-release.mjs
node scripts/serve-balcony-preview.cjs
```

瀏覽器驗收需要已有 Playwright 與瀏覽器，可用 PLAYWRIGHT_MODULE 指定既有模組路徑，PLAYWRIGHT_CHANNEL 指定 msedge／chrome；未指定 channel 使用已安裝的 Playwright Chromium。BALCONY_AUDIT_DIR 可指定報告路徑，預設寫入系統暫存目錄。

```sh
node scripts/test-balcony-browser.cjs
```

測試不使用真實登入 profile，外部連線與 Service Worker 被隔離。正式部署後另核對來源檔、版本及原本入口，不能以本機通過代替部署驗證。
