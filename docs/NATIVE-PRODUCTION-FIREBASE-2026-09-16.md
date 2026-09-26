# 原生正式套件：Firebase／Play 簽署設定

2026-09-16 使用者明確同意設定正式套件。這是登入身分設定，不是發布批准或正式 APP 驗收完成。

## 已完成並在 Console 核對

- Firebase 專案：`searchbefore-4648b`。
- 新增 Android 套件：`tw.searchbefore.app`。
- 顯示名稱：噴前查原生正式版（Play 簽署）。
- Firebase App ID：`1:934300362639:android:a4a93aadef727eb2a5cdfa`。
- 登記目前 Play **應用程式簽署**公開憑證的 SHA-1 與 SHA-256。兩列已在 Firebase 儲存結果中確認。

| 類型 | 指紋 |
|---|---|
| SHA-1 | `90:99:BF:F0:3D:B1:74:C0:3B:51:11:D0:11:28:E3:A4:39:59:0A:E9` |
| SHA-256 | `E5:3B:71:99:DF:CF:F2:BD:81:23:46:DA:A9:F8:52:81:41:CB:C9:A8:34:0D:8D:42:B8:50:B7:E0:A3:00:47:3F` |

來源為 Play Console「應用程式簽署」→「應用程式簽署金鑰」下載的 `deployment_cert.der`；本機 keytool 讀取的 SHA-256 與同頁 Digital Asset Links 完全一致。不是上傳金鑰、不是 debug 憑證。沒有新增、重設或更換簽署私鑰。

## 使用者提供設定檔後的接入

- 使用者已提供 `google-services (1).json`。已核對 project ID／number、正式 package／App ID、Android OAuth 的 Play SHA-1，以及 Web OAuth client。它同時含正式與預覽 client，必須明確按套件選取。
- 原檔已複製為忽略的 `android-native/firebase-production.json`，與來源文字完全相同。正式與預覽 Android App ID 不同，Web OAuth client 相同；原始設定檔和 API key 不提交 Git。
- 正式 resources 由 `nativeFirebaseProduction` 產生到 `app/build/generated/firebase-production/res`，只掛到 release source set。debug 繼續使用原預覽檔與獨立目錄；CI 無設定檔仍可建置離線預覽。
- `gradle/firebase-config.gradle` 核對唯一 client、專案、App ID、Web OAuth、正式 Play SHA-1 與 API key 格式；正式檔缺失不會退回預覽設定。JSON 解析失敗不印出原始內容。13 項合成設定檢查（2 正確選取、11 拒絕）已執行通過；CI 額外拒絕存在正式設定檔。

## 尚未完成

以下為設定接入當時的驗證紀錄。使用者之後另同意「只發布內部測試」；最新候選建置／發布進度請讀 [內部候選驗收](NATIVE-INTERNAL-CANDIDATE-2026-09-16.md)。不是正式版發布同意。

本機驗證：debug build／Lint 成功（3m52s，Lint No issues found）；既有 55 JVM 測試本輪為 UP-TO-DATE，新增 13 項 Gradle 設定檢查實際執行通過。`nativeFirebaseProduction` 使用真實正式檔成功生成資源，隨後 `preReleaseBuild` 如預期因發布鎖定失敗（不是 Firebase 設定失敗），未產生正式套件。原生 catalog／安全邊界 Node 回歸通過。這些不取代正式簽署登入實測。

- 正式簽署候選套件、Play 派送身分下的真實登入／同步與 TWA 資料移轉仍未驗收。資源接入不等於正式登入實測。
- release guard 保留，不建立或發布正式 AAB，不替換手機上的現有 APP。

本輪没有讀取 Firestore 使用者紀錄，沒有更改資料庫規則、Google 登入供應商政策、API key 限制或其他帳號权限。Firebase App 登記完成不代表所有資安／登入測試通過。

## Play 當下狀態（唯讀）

最新版本為 versionCode 4／1.0.3.0，封閉測試 Alpha 全面推出。此次未上傳新套件，也未發布正式版。真正製作候選版本前須再查當時最大 versionCode。

## 瀏覽器限制

Chrome 分頁控制連續逾時後改用同一服務的右側瀏覽器，沿既有登入讀取 Play 憑證。Firebase 設定成功，原先設定檔下載未成功，後由使用者提供檔案解除。後續不應重複建立正式 app、要求同一檔案或重新詢問相同設定授權。
