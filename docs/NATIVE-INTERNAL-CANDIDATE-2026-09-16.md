# 原生內部候選版驗收

## 授權界線

使用者明確同意：只建立並發布 Google Play 內部測試；不更改封閉測試 Alpha 或正式版，不新增測試者。發布內部候選不等於正式替代完成。

## 候選內容

- `tw.searchbefore.app`，versionCode 5，`1.1.0-internal`，API 36。
- 2026-09-16 Play 套件清單最高為 4／1.0.3.0，Alpha 全面推出；尚無 5。
- 正式 Firebase 設定依 exact package 選取，驗證 appId／project／Play OAuth 憑證，與 debug 資源隔離。
- AAB 使用既有 upload key；Gradle 在內部候選 opt-in 時驗證其 SHA-256，未提供 opt-in 則一般 release build 仍拒絕。
- 顯示內部候選標籤，新增舊版資料移轉指引。網站／舊 TWA 的瀏覽器資料不會自動轉入原生；完整 JSON 匯入前須確認並保存上一份。
- 不加入 OCR、不自動上傳、不放寬 Firestore 規則、不新增權限。

## 本輪驗證狀態

- Native catalog Node 對照測試：通過（17,333 筆）。
- 本輪 release 建置成功（16m59s，70 個任務實際執行）：55 JVM 測試全部通過、Lint No issues found、AAB 簽署完成；不是沿用前次 debug 成果。
- bundletool 1.18.3 validate 通過；解出的 manifest 為 tw.searchbefore.app／versionCode 5／1.1.0-internal／target 36／min 23／非 debuggable／禁止明文／禁止系統備份。
- jarsigner 顯示 jar verified，另有自簽／無時間戳及 JarInputStream 項目順序警告；使用 JarFile 完整讀取 300 個 payload 項目，逐項驗證 digest 與既有 upload certificate 通過。不把自簽憑證當公有 CA 驗證。
- `VerifyNativeBundle.java` 同時核對 4 個 64-bit .so 的 ELF PT_LOAD 16 KB 對齊通過；不代替 Play 派送 APK 的 ZIP 對齊與 16 KB 系統实測。參考 [Android 16 KB 支援檢查](https://developer.android.com/guide/practices/page-sizes)。
- AAB config 為 PAGE_ALIGNMENT_16K。初版 RELRO 檢查只看結束地址而誤報；核對 [Android 16 linker 的整頁保護算法](https://android.googlesource.com/platform/bionic/+/android16-qpr2-release/linker/linker_phdr.cpp) 後，改驗證保護擴張是否覆蓋 RELRO 以外仍需寫入／執行的 LOAD 位元組。6 組正反例與候選的 4 個函式庫通過；未更換或修改函式庫。這是靜態布局推論，不是 16 KB 系統實測。
- 原候選 SHA-256：4bab9bdad015e75040b1a94072d2981f44ae1ffe28242910ff04f1b333c2d128（14,334,021 bytes），尚未上傳；若重建或更新須重新計算。
- 本機 Node 全套與 GitHub Review／Android CI（65a3f73；Review run 35111843180、Android run 35111842752）通過。CI 是 debug 編譯／JVM／Lint，不是 Play 登入驗收。
- Android 16 UI：隔離 emulator-5580、1.5 倍字型，8 項測試全部通過（包含新增移轉指引），connected build 6m32s；恢復字型後已關閉本次唯讀模擬器，adb devices 空白。本輪沒有手機測試。此 UI 結果先於下面的 minSdk 單一相容性調整。
- Play 初次上傳被自動保護檢核拒絕：最低 API 23 不符合已啟用保護的 API 24 要求。沒有關閉保護；候選改 minSdk 24，重新執行 release 測試／Lint／打包。Android 6 不在此候選支援範圍，舊 Alpha／正式版不動。
- 已儲存內部草稿名稱及 zh-TW 說明。內部測試目前沒有勾選測試名單，既有「測試人員」26 人清單仍未勾選；沒有新增成員。尚未發布，待新 AAB 通過 Play 檢核。

## 仍需 Play 派送與實機的驗收

1. 舊版先匯出 JSON；保留原網站資料，不卸載／不清除 Chrome。
2. 既有內部測試成員從 Play 更新，核對 package、versionCode、Play signing SHA-256。
3. 同帳號 Google 登入、明確同意同步、伺服器完成後核對紀錄。
4. 加入明確 TEST_ONLY 非施藥紀錄，上傳，登出重登並還原；跨帳號不得混傳。
5. 真實 JSON 網站 → 原生 → 網站，逐項核對田區／用藥／農務／配方與刪除標記。
6. 非空資料重啟、離線、更新及通知；實測與 Play 預先發布報告分別記錄。

只有完成上述驗收及差異檢查，才評估正式替代；不把單元測試或成功上傳 AAB 當成正式驗收。
