# PR 發布成品檢查

## 變更

在既有 `Review checks` 的 `test` 工作中，依序執行：

1. `npm ci`：依鎖定檔安裝依賴。
2. `npm test`：執行完整回歸。
3. `npm run build`：產生發布成品。
4. `node scripts/check-release.mjs`：檢查成品白名單、必要檔案、程式語法及既有隱私／安全條件。

任一步失敗即失敗，不使用 continue-on-error。保留 PR／main 觸發、10 分鐘逾時與 contents: read；沒有部署權限或發布密鑰。新增工作流程回歸測試，防止後续刪除這些步驟而未察覺。

## 本機驗證

基於 #144 合併後的 main `b189fdd37323a23c1982f1249b593753ecb06705`。全套測試、建置與發布成品檢查通過（36 檔，6.53 MB），不改動 APP 功能、資料或 AAB。

## 界線

- 這是自動檢查，不代表無任何資安風險，也不能代替 Android 真機或帳號資料隔離驗收。
- 工作流程不能自行強制阻擋合併；需另設定分支保護並將 `test` 列為必要檢查。
- 不改 GitHub Pages 的既有 main 根目錄發布模式；`dist` 檢查不代表已切換成 dist 部署，也不會自動阻擋既有 Pages 工作流程。
- 不在這個 PR 修改帳號 MFA、API key、Google Cloud、Dependabot、分支保護或掃描警報狀態。
