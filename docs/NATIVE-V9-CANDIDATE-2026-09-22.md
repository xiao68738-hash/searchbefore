# v9 原生內部候選版（2026-09-22）

## 狀態與範圍

僅準備本機內部測試候選包，沒有上傳、送審、更新 Alpha／正式版或操作手機。Play 今日版本尚未重新查證；`versionCode 9` 必須在上傳前確認未被使用，不代表已在 Console 保留。

- 正式套件仍 `tw.searchbefore.app`，候選版 `9 / 1.1.4-internal`，minSdk 24／targetSdk 36。
- 納入 9/19 已完成的作物用藥總覽全寬卡片、至少 48dp 防治對象入口、劑型與登記不可互用说明。
- 不合併夜蛾類與甜菜夜蛾登記；不修改登記資料、雲端資料格式或使用者紀錄。
- 使用原 upload 簽章，保留內部測試頁首、預設 release 阻擋與明確內部候選開關。沒有新增金鑰或放寬 Firebase 規則。
- 建置現在會檢查第三方 SDK 合併後的 Manifest，另保留全部 payload 簽章與 64-bit 原生庫 16KB 檢核。

## 驗收

- 網站全套 45 個根目錄測試檔通過（runner 另重跑兩項分類測試，不將檔案數當作斷言數）。
- 前一提交 `309fec7a25acd84dc08f89d7c06278d0f47ab920` 已確認兩項遠端 CI SUCCESS：Review `35740038633`、Native `35740037643`。該提交是工具鏈更新，不能冒充本次 v9 提交的遠端結果。
- v9 release 建置成功（8 分鐘、72 tasks／35 executed／37 up-to-date）；17 suites、71 tests、0 failures／errors／skipped，Lint `No issues found.`。工具鏈仍有既有 metrics、SDK XML 與 Gradle9 相容警告，沒有修改全域環境。
- 合併 Manifest 檢查通過；300 筆 payload 符合既有 upload 簽章、4 個 64-bit library 的 16KB LOAD／RELRO 檢查通過，bundletool validate exit0。
- 從實際 AAB 讀得 package `tw.searchbefore.app`、versionCode9、`1.1.4-internal`、min24／target36；六項 requested permissions 與封存 v8 完全相同，未啟用除錯、系統備份或明文連線。
- 額外將 AAB dump manifest 輸入嚴格檢查，發現 `signature` 在編譯後以 `0x00000002` 表示造成工具誤報。依 [Android PermissionInfo 常數](https://developer.android.com/reference/android/content/pm/PermissionInfo#PROTECTION_SIGNATURE)補正等值判讀；只接受 signature／2／0x00000002，不接受一般、dangerous 或額外 privileged flags。4 正向與35負向通過；實際 AAB dump 及建置合併檔重新檢查都通過。不是修改 APP 權限或忽略檢查。
- 合成備份 web→Kotlin→web 往返再次通過。未接觸任何私人紀錄。
- 獨立封存 `D:/SearchBefore/releases/native-internal-v9-20260922/searchbefore-native-v9-internal.aab`，14,220,438 bytes；SHA256 `b2398b3ebaf60f6e44ae5aeaa1a49f0529e75682d1034b621a5e805e1f259605`。採不可覆寫複製並逐 byte 確認一致，未覆蓋 v8。旁邊的 `AndroidManifest.xml` 來自實際 AAB。
- 先前同一總覽程式碼已有 API36 手機窄視窗、大字體與兩組平板視窗各 24/24 的開發版證據。這些不是 v9 Play 簽章實機驗收，不因增加版號就宣稱重新跑過。

## 尚未完成，不得略過

1. 確認 Play 版本號可用，僅上傳既有內部軌道，不能直接發正式版。
2. Play 提供更新後，不卸載、不清資料，核對來源與版本、登入保留、同步前後完整 JSON、重啟及總覽畫面。
3. 專用審查帳號／存取聲明、OAuth 品牌與正式商店素材仍待處理。帳密不進聊天或 Git。
4. 正式候選還需最後的發布標示／商店／隱私一致性和 Google 品質資料查核。沒有報告不代表零問題。

## 內部版本說明草稿（尚未提交）

改善作物用藥總覽的卡片寬度與防治對象入口，方便在小螢幕及大字體下閱讀。不同防治對象仍依原登記分開顯示。保留既有登入、手動同步與完整備份流程；此版僅供內部測試。
