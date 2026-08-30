# SearchBefore Android TWA

這是 `tw.searchbefore.app` 的可重建正式 Android 外殼。它只負責以 Trusted Web Activity 開啟 `https://searchbefore.tw/?app=google-play`，不包含網站資料、私鑰或 OCR 開發功能。

## 版本基線

- `compileSdk 36`
- `targetSdk 36`
- `minSdk 23`
- `versionCode 2`
- `versionName 1.0.1.0`

正式簽章只從環境變數讀取，簽章檔與密碼不得加入 Git：

- `SEARCHBEFORE_KEYSTORE_PATH`
- `SEARCHBEFORE_KEY_ALIAS`
- `SEARCHBEFORE_STORE_PASSWORD`
- `SEARCHBEFORE_KEY_PASSWORD`

建置前須設定 `JAVA_HOME`、`ANDROID_HOME`，再執行 `gradlew.bat clean bundleRelease assembleRelease`。
