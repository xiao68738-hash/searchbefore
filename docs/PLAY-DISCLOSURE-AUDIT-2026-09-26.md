# 上架聲明與公開政策核對

## 2026-10-11 狀態修正

- 原帳號復原已完成：經使用者同意後，完整備份、空白本機登入原帳號、匯入、伺服器同步與重開後逐欄核對均完成，沒有繞過 owner 保護。下方 ownerConflict 不再是目前狀態。
- 五項商店變更已經使用者授權提交，Console 仍審查中；並非正式版本上架。SDK 分類與正式放行仍獨立核對。

### 本日 SDK 與線上 TWA 實查

- 重新成功解析 `releaseRuntimeClasspath`，不是只讀 build.gradle：Auth 24.2.0、Firestore 26.6.0、Common 22.2.1、Credentials 1.3.0、GoogleID 1.1.1、Play Services Auth 21.1.1。Analytics／Crashlytics／Installations／Performance 解析項目為 0。首頁／水量 UI 改動未新增任何依賴。
- `NativeCloud.kt` 只使用 Google ID token 登入；登入本身不讀寫田間資料。同步另受同意、UID 與請求逐階段檢查保護；Firestore 僅記憶體快取。Manifest 無位置、相機、聯絡人或廣告 ID 權限。這是程式／依賴覆核，不是完整網路流量或 Google Play Services 內部稽核。
- [Firebase 官方揭露](https://firebase.google.com/docs/android/play-data-disclosure)仍列 Auth 的 IP／user agent／App ID，以及 Firestore 的 user agent 與登入 UID。user agent 的裝置／版本中繼資料不等於零資料；也不能把專案共用 App ID 直接等同個別安裝識別碼。IP 是否屬位置類別須看有無位置推導用途，不憑字串自動勾選。
- **新增實際發現：** 線上 `searchbefore.tw` 的 DOM 已載入 `pagead2.googlesyndication.com/pagead/js/adsbygoogle.js` 及 `show_ads_impl_fy2021.js`；本機 `index.html` 亦有無條件 AdSense script。原生無廣告 SDK 不代表仍使用網站的 TWA 無廣告處理。
- [Play 資料安全說明](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)要求涵蓋目前散布版本的收集／分享總和。因此不能僅根據原生 SDK 清單替整個 App 聲明結案。
- 使用者已明確同意先停用廣告載入並知悉收益影響。首頁／五個指南頁的 script 與帳戶 meta 已移除，版本升至 0.3.10.1；PR151 已合併（cc58da5），Pages 部署 38068859572 成功。全部 JavaScript 測試及 36 個發布成品檢查通過。HTTP 實查首頁、五指南、隱私頁及 sw.js 均 200／無廣告載入碼；瀏覽器經「立即更新」後顯示 0.3.10.1，DOM adScripts=[]。未清除網站資料。公開政策證據：releases/native-v11-20261010/screenshots/website-ads-disabled-20261011.png。
- 保留被動 ads.txt，未修改登入、同步或紀錄；未更改 Play 資料安全表單或發布正式 AAB。歷史廣告處理與未更新快取不能當作不存在。原生介面 CI 38067877011 另已通過 Android 16 的 78 項公開／合成 UI 測試，不能當作新 AAB 已發布。

## 2026-10-10 晚間最終覆核（優先於下方早先狀態）

- PR150 已合併部署；公開 privacy.html 與 delete-account.html 已實讀 HTTP 200、10/10 新版。下方「尚未部署」只屬本日較早紀錄。
- 專用審查帳號已於 Play v11 真實登入，空白環境上傳明確測試樣本、清除僅本機後重新登入還原均完成。本人資料內容已匯回，但本機 ownerConflict 阻擋本人同步，仍待安全復原；不得改 owner 或放寬資料庫規則。
- 本輪再由 Console 應用程式內容進入資料安全五步驟，全程唯讀，儲存按钮停用。現況：OAuth；傳輸加密；可刪帳戶及單獨刪資料，兩者網址均為 delete-account.html。
- 公開預覽：名稱／Email 選用、帳戶管理；UID 選用、功能與帳戶管理；其他使用者原創內容選用、應用程式功能；不向第三方分享。未選位置、檔案、分析互動、效能、裝置 ID。這是申報現況，不等於完整流量稽核。
- 再讀 [Firebase 官方資料揭露](https://firebase.google.com/docs/android/play-data-disclosure)：Auth 包含安全／防濫用 IP 及技術資訊；Firebase user agent 是裝置／SDK 中繼資料，官方表示不連結 user/device identifier。不得僅憑沒有 Analytics 就宣稱完全沒有技術資料，也不得直接把 user agent 當永久裝置 ID。技術資料與 Play 分類的最終對照仍需保留證據。
- 商店原生手機5張、七吋1張、十吋1張及短／全文已保存；發布總覽5項尚未送審。本輪未提交正式版本、改名單或讀取審查密碼。

## 2026-10-10 更新（優先於下方歷史）

- 專用審查帳號已由使用者準備並直接填入 Console；登入详细資料現為「是」、有一份操作說明。沒有讀取或保存密碼。
- 10/7 使用者授權提交的項目 #7，10/10 實讀為「已發布」（提交 22:59、完成 23:19）。這只確認存取聲明發布，不代表正式 AAB 上架或審查帳號實際登入／同步通過。不要重新要求建立帳號或重送相同聲明。
- 10/10 直接讀取公開隱私頁，仍是 8/4 舊文，仍有「所有功能免登入」及 local storage 說法。PR148 的原生／選用同步文案尚不能算已部署。
- 本輪沒有重新儲存資料安全表單、改動測試名單或發布版本。下方依賴解析及資料安全選項是 9/26 歷史查證，不冒充本日最終候選覆核。

## 2026-09-26 歷史查證

2026-09-26透過已登入Chrome實際讀取。只讀，未更改／儲存Console表單、未送審、未處理舊草稿、未修改測試名單。

## 實際發現

| 項目 | Console／網站現況 | 發行前處置 |
|---|---|---|
| 登入詳細資料 | 選「否」，即所有部分未受限／不用登入 | **與雲端同步需Google登入不一致**。改為是，補可用審查登入方式及英文步驟；先由使用者準備專用帳號，憑證不進聊天或Git |
| 資料收集 | 是、傳輸加密、OAuth | 與目前選用登入／同步方向相符，不代表所有SDK分類均已驗證 |
| 名稱、Email、使用者ID | 已列收集；皆選用，帳戶管理，ID另含應用程式功能 | 與帳號與紀錄歸屬方向相符 |
| 其他使用者原創內容 | 已列收集、選用、應用程式功能 | 涵蓋主動同步田區／施藥／農務；本機配方不应稱已同步 |
| 第三方分享 | 預覽為不分享 | 需依實際服務供應商處理及Google豁免定義覆核，不因使用Firebase便自動改為分享 |
| 裝置ID、效能／診斷資料 | 目前未選 | 需結合解析後依賴與實際调用核對，不把「無Analytics」當「無技術資料」 |
| 刪除帳號及只刪資料 | 都指向公開delete-account.html | 公開頁缺少只刪雲端資料保留帳號的獨立步驟；PR148已有修正但未部署 |
| 公開隱私頁 | 仍2026/8/4、寫所有功能免登入、local storage | PR148修正需部署後再讀線上驗證；不能只以本機文案算完成 |

公開刪除頁也仍是舊版7/21文字，未說明TWA卸載不清Chrome資料、匯出備份須另行刪除。現有「30天處理／系統備份90天」承諾本輪未變更，實際營運執行仍需負責人確保。

## 候選版實際解析依賴

對v10來源執行`:app:dependencies --configuration releaseRuntimeClasspath`成功，不僅檢查宣告檔：

- Firebase BOM34.19.0：Auth24.2.0、Firestore26.6.0、Common22.2.1。
- AndroidX Credentials與Play Services橋接1.3.0、Google ID1.1.1、Play Services Auth21.1.1。
- 解析的Firebase依賴中沒有Analytics／Crashlytics／Installations SDK；這不等於零技術資料，也不涵蓋Google Play Services自身處理。
- 存在phone-auth／fido等間接依賴，不等於APP已啟用電話登入或收集所有對應資料；不可僅憑套件名稱勾選申報。

[Firebase官方資料揭露](https://firebase.google.com/docs/android/play-data-disclosure)於9/26重讀：Auth含防濫用IP及技術資訊；Firestore含Firebase user agent，且登入後請求含Auth使用者ID。官方文件強調要依SDK版本與實際使用方式判斷；這不是法律意見或完整流量測試。

## 未代替使用者完成

未建立審查Google帳號、未記錄密碼、未操作OAuth安全設定，也沒有透過真實刪除使用者資料來測試。正式提交前需要：可用審查帳號、全功能存取驗證、公開政策部署與對照、最終SDK申報覆核及品質驗收。
