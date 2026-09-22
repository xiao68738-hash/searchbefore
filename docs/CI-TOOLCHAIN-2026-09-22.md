# CI 工具鏈更新（2026-09-22）

## 範圍

上輪 Native CI 已通過，但 GitHub 提示 action 的 Node20 runtime 與 setup-java v4 已淘汰，以及 ubuntu-latest 即將更換作業系統。本輪更新兩個測試 workflow，不改 APP 功能、版本、資料、Firebase、Play 或發布授權。

| 工具 | 新固定版本／commit |
|---|---|
| checkout | v7.0.1 / `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| setup-node | v7.0.0 / `820762786026740c76f36085b0efc47a31fe5020` |
| setup-java | v6.0.1 / `de7274f081f381c8f8158605e0321c36c376e2e6` |
| GitHub runner | `ubuntu-24.04`，不隨 latest 自動換大版本；該映像仍有例行更新，不代表位元組級可重現 |

三個官方 tag 均透過 GitHub API 確認指向上述 commit，並查閱 action.yml，runtime 均為 node24。測試使用的 Node 仍為 24，Android 使用的 Java 仍為 17；沒有連帶升級 Gradle／Kotlin／Firebase 依賴。

## 安全限制

- 兩份 workflow 都只給 `contents: read`；Review 的 checkout 也明確停用 `persist-credentials`。
- 不使用 `pull_request_target` 或 `workflow_run` 執行 PR 程式、不啟用 unsafe checkout、不加入 secrets／簽章／發布動作。
- 新增 `tests/ci-workflow-policy.test.js` 檢查本專案兩個 workflow 的版本 pin、OS、權限與無發布設定；這是靜態政策回歸，不是完整 YAML 驗證或遠端建置結果。
- 原有 debug 編譯、單元測試、Lint、完整備份往返、Manifest 與 ELF 檢查全部保留。
- 遠端執行結果必須由本次提交的 CI 確認，不能沿用 c9a03d9 的成功。待辦與交接總表記錄最終提交及結果。

## 官方核對來源

- [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)／[runtime 與預設安全輸入](https://github.com/actions/checkout/blob/v7.0.1/action.yml)
- [setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)／[action.yml](https://github.com/actions/setup-node/blob/v7.0.0/action.yml)
- [setup-java v6.0.1](https://github.com/actions/setup-java/releases/tag/v6.0.1)／[action.yml](https://github.com/actions/setup-java/blob/v6.0.1/action.yml)

此輪沒有 Play 當日查證。正式發布仍需審查登入資訊、OAuth 品牌、最終候選版與素材及品質驗收；工具鏈更新不解除發布鎖。
