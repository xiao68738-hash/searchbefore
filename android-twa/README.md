# SearchBefore Android TWA

這是 `tw.searchbefore.app` 的可重建正式 Android 外殼。它只負責以 Trusted Web Activity 開啟 `https://searchbefore.tw/?app=google-play`，不包含網站資料、私鑰或 OCR 開發功能。

## 版本基線

- `compileSdk 36`
- `targetSdk 36`
- `minSdk 23`
- `versionCode 3`（本地候選版，尚未發布）
- `versionName 1.0.2.0`
- Android Browser Helper `2.7.3`，包含上游啟動畫面 edge-to-edge 相容性更新

正式簽章只從環境變數讀取，簽章檔與密碼不得加入 Git：

- `SEARCHBEFORE_KEYSTORE_PATH`
- `SEARCHBEFORE_KEY_ALIAS`
- `SEARCHBEFORE_STORE_PASSWORD`
- `SEARCHBEFORE_KEY_PASSWORD`

建置前須設定 `JAVA_HOME`、`ANDROID_HOME`，再執行 `gradlew.bat clean bundleRelease assembleRelease`。

本機可從 repo 或獨立 worktree 執行 `powershell -NoProfile -File scripts/build-android-twa.ps1`。
腳本向上尋找共用的 `tools/android-sdk` 與 `private/android-signing`，也可用
`-SearchBeforeRoot D:\SearchBefore` 明確指定；JDK / SDK 可用 `-JavaHome` / `-AndroidSdkRoot` 覆寫。
簽章資訊不寫入專案，成功或失敗都會還原本次修改的處理程序環境變數。

上游更新來源：https://github.com/GoogleChrome/android-browser-helper/releases/tag/android-browser-helper-2.7.3
升級不代表 Play 警告已消除；仍須實機確認啟動、導覽列、Google 登入、返回與雲端還原。

## 本機 Chrome／ANR 排查

詳見 [Android v3 Chrome 測試紀錄](../docs/ANDROID-CHROME-ANR-2026-09-08.md)。
`scripts/start-android-test-emulator.mjs` 啟動隔離的 API 36 SSD 測試環境，
`scripts/check-android-startup.mjs` 保存啟動、ANR、版本、網路與截圖證據。
複製系統映像時必須保留完整 `data/` 子目錄；缺少 SIM／radio 設定時啟動檢查會拒絕執行。
啟動指令成功不代表頁面可用；需另外核對畫面和操作，不能以停用 ANR 或放寬系統 timeout 作為修復。
