# 原生版合併 Manifest 安全回歸檢核

## 為什麼補這一項

既有網站測試會檢查手寫 `AndroidManifest.xml`，但 Android 建置會合併第三方 SDK 的 Manifest。只查來源檔無法發現套件更新後新增的權限、對外服務或除錯入口。本次新增 `scripts/VerifyNativeManifest.java`，以實際生成的合併 Manifest 作為輸入；沒有改動 APP 功能、帳號、資料或版本。

此為專案目前設定的回歸基準，不是通用 Android 安全認證，也不能代替登入、同步、伺服器規則或 Play 驗收。正式包的產生與发布仍受原有內部測試限制。

## 檢核內容

| 項目 | 規則 |
|---|---|
| 套件／版本環境 | 正式套件與 `.nativepreview` 分開檢核；目前 minSdk 24、targetSdk 36，變更需覆核 |
| 權限 | 僅接受目前六項合併權限；額外相機、外部儲存或 SDK 限定形式的權限都拒絕 |
| 對外入口 | 必須明確宣告 exported；對外開放元件採名單，Job／撤銷登入／效能安裝服務的權限保護不得消失 |
| 登入回呼 | 保留 Firebase 原有 scheme、host、path、VIEW action 和 categories；變寬或新增回呼條件需覆核 |
| 除錯 | 正式設定不得含 debuggable、testOnly 或 Compose 預覽入口；開發版例外不能用於正式套件 |
| 備份／網路 | 保留禁止系統備份與明文連線、既有資料搬移排除設定；新增 networkSecurityConfig 需先覆核，不能靠來源檔的 false 就判定通過 |
| 檢查器本身 | 拒絕外部 XML 實體與 DOCTYPE、重複關鍵節點、錯誤格式；不讀帳號、簽章密碼或私人紀錄 |

目前六項 requested permissions：INTERNET、POST_NOTIFICATIONS、RECEIVE_BOOT_COMPLETED、ACCESS_NETWORK_STATE、READ_GSERVICES，以及套件自己的 signature 級 DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION。這是現有依賴的基準，不表示每一項都由手寫 Manifest 直接宣告。

## 自動執行

- `scripts/build-android-native.ps1`：成功生成開發版後檢查 debug 合併 Manifest，失敗即退出。
- `scripts/build-android-native-internal.ps1 -InternalTestingOnly`：成功生成內部候選版後檢查 release 合併 Manifest，失敗不得視為可用候選；不含任何發布操作。
- GitHub Native CI：編譯後檢查實際 debug 合併 Manifest，並執行 Java 行為測試。
- 網站測試 `tests/native-manifest-gate.test.js`：確認建置腳本／CI 仍有接入檢核及失敗退出。行為測試由 Java 執行，不把靜態 wiring 測試當實際檢核。

手動執行（Java 17）：

```text
java scripts/VerifyNativeManifest.java --self-test
java scripts/VerifyNativeManifest.java debug android-native/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml
java scripts/VerifyNativeManifest.java release android-native/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml
```

獨立執行時必須確認輸入是哪一次建置的產物；本工具不替舊 Manifest 背書為新 AAB。直接執行 Gradle 不等於跑過上述包裝脚本檢核；建置產物即使已存在，檢核失敗仍須阻擋後續使用。

## 本輪證據與範圍

- 兩組合法測試通過、31 組異常／格式／跨 variant 範例皆被拒絕。
- 目前本機既有 release 與 debug 合併 Manifest 均符合基準。release 為既有產物，未重新簽署或发布 AAB。
- 上輪提交 `d358750` 的 Native CI `35421847340` 與 Review CI `35421847432` 已確認成功，PR #148 仍為 draft OPEN。
- 本輪 `build-android-native.ps1 -Lint` 成功（Gradle 5 分 12 秒，60 tasks／6 executed／54 up-to-date），新 debug Manifest 檢核和合成完整備份 web→Kotlin→web 往返通過；網站全套及 ELF 6 組邊界回歸通過。沒有 APP 執行期程式變更，因此未重跑手機 UI 或真實登入。
- 建置仍有既有 SDK XML 工具版本、metrics 目錄與 Gradle 9 相容性警告；此輪未修改全域環境或升級工具，不把它寫成完全無警告。新增提交的遠端 CI 需另查，不能沿用上輪結果。
- 產出測試報告核對：17 suites、71 tests、0 failures／errors／skipped；Lint 報告 `No issues found.`。這與上述工具鏈警告是不同層次。
- 本輪沒有可呼叫的瀏覽器控制工具，未重新查證 Play Console、修改審查帳號、OAuth 品牌或商店資料。沒有操作手機、Firebase 或正式網站。

## 依據

- [Android：Manifest 合併](https://developer.android.com/build/manage-manifests)：套件的設定與權限會進入合併結果。
- [Android：網路安全設定](https://developer.android.com/privacy-and-security/security-config)：網路安全設定、明文連線與除錯信任條件需一起檢核。

正式發布仍待：專用審查帳號／存取声明、OAuth 品牌、包含總覽修正的最終候選版與最終截圖、Play 品質資料及最後驗收。此檢查通過不會自動解除發布鎖。
