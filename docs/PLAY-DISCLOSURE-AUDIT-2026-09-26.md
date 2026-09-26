# 上架聲明與公開政策核對

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
