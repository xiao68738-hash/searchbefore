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

## 未完成，不能冒充已接入

- 正式 `google-services.json` 下載按鈕沒有交付新檔；既有 Downloads 同名檔是較早的預覽設定，不能拿來代替。已請使用者在正式套件頁另存下載。
- 已忽略 `android-native/firebase-production.json`，**檔案尚不存在**。取得後需核對 project ID、正式 package、App ID、Android OAuth SHA-1 與 Web OAuth client；不提交原始設定檔或 API key。
- 目前 Gradle 仍只產生 debug／預覽 Firebase resources。正式 variant 的資源接入、簽署候選套件、Play 派送身分下的真實登入／同步與 TWA 資料移轉尚未驗收。
- release guard 保留，不建立或發布正式 AAB，不替換手機上的現有 APP。

本輪没有讀取 Firestore 使用者紀錄，沒有更改資料庫規則、Google 登入供應商政策、API key 限制或其他帳號权限。Firebase App 登記完成不代表所有資安／登入測試通過。

## Play 當下狀態（唯讀）

最新版本為 versionCode 4／1.0.3.0，封閉測試 Alpha 全面推出。此次未上傳新套件，也未發布正式版。真正製作候選版本前須再查當時最大 versionCode。

## 瀏覽器限制

Chrome 分頁控制連續逾時後改用同一服務的右側瀏覽器，沿既有登入讀取 Play 憑證。Firebase 設定成功，但設定檔下載未成功。此限制不是登入失敗，也不是缺少使用者同意；後續不應重複建立正式 app 或重新詢問相同設定授權。
