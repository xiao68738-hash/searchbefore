# Android API 36 正式版更新

更新日期：2026-08-26

## 本次版本

- 套件名稱：`tw.searchbefore.app`（與既有 Google Play 正式版相同）
- `versionCode`：2
- `versionName`：1.0.1.0
- `minSdk`：23
- `compileSdk`／`targetSdk`：36（Android 16）
- 啟動網址：`https://searchbefore.tw/?app=google-play`
- 正式版未包含仍在開發中的 OCR prototype。

正式版 Android 原始碼位於 `android-twa/`，不再依賴日後重新由 PWABuilder 猜測設定。

## 建置

簽章檔與密碼只放在工作區外層的 `private/android-signing/`，不得加入 Git。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-twa.ps1
```

輸出：

- `android-twa/app/build/outputs/bundle/release/app-release.aab`
- `android-twa/app/build/outputs/apk/release/app-release.apk`

## 2026-08-26 驗證結果

- Gradle release build：通過
- Android release fatal Lint：通過
- APK 套件／版本：`tw.searchbefore.app`, versionCode 2
- APK target SDK：36
- APK 簽章驗證：通過
- SHA-256 簽章指紋：與既有正式版及 `.well-known/assetlinks.json` 相同
- API 34 模擬器：安裝與系統套件解析通過；模擬器內建 Chrome 無法完成直接網址啟動，因此尚不能視為完整 UI smoke test
- API 36 模擬器或 Android 16 實機：待補測

## 上傳前檢查

1. 先上傳封閉測試或內部測試，不直接替換正式版。
2. 確認 Play Console 顯示 versionCode 2、target API 36。
3. 在 Android 16 裝置測試啟動、登入、雲端備份與還原。
4. 通過後再建立正式版發布。

上傳 Google Play 屬外部發布動作，必須由專案擁有者確認後執行。
