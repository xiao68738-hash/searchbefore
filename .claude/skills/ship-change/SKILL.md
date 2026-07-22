---
name: ship-change
description: >
  噴前查 SearchBefore 專案「把一個改動送成 PR」的標準流程。凡是要在這個 repo
  改任何檔案並開 Pull Request —— 改農藥資料、改功能、修文案、改進站頁、更新
  MRL 腳本、寫文件 —— 一律先讀這個 skill 再動手。它固定了開分支、升版、測試、
  commit、開 PR 的順序,避免重複踩過的坑(squash 合併分歧、heredoc/printf 中文
  出錯、漏升版號)。即使只是一行小修正也適用,因為那幾個坑跟改動大小無關。
---

# 把一個改動送成 PR

這個 repo 的每個改動都走同一條路。以下每一步都對應一個實際踩過的坑,照做就不會重犯。

## 為什麼要有這個 skill

過去在這個 repo 重複犯了四類錯,每次都要重新診斷、重新解衝突,浪費大量來回:

1. **從已合併的分支再開分支** → squash 合併讓 SHA 不同,發 PR 時衝突
2. **printf 帶中文 commit message** → `invalid format character` 失敗後重試
3. **手動改版本號** → 四處只改到一部分,或忘記升
4. **改一半才發現工作區不乾淨** → 帶到新分支造成混淆

每一步的指令都已經把這些坑處理掉。照順序走,不要即興。

## 標準流程

### 1. 開分支(一定用腳本,不要手動 `git checkout -b`)

```bash
npm run branch -- feature/簡短描述
```

分支前綴用 `feature/` `fix/` `docs/` `data/`。腳本會**強制回到 main、拉最新、確認工作區乾淨**才建分支。

**為什麼不能手動開:** 本 repo 一律 squash merge。若當下分支的 commit 已經以另一個 SHA 進了 main,從它再開分支會帶著孤兒 commit,對 main 發 PR 時 Git 判定兩條分歧歷史 —— 而且衝突內容是**重複而非矛盾**,很容易解錯。腳本從 main 重建就避開這件事。

### 2. 改你要改的東西

- `index.html` 是**全 CRLF**,且字串裡有 BOM 殘留。用 Edit 工具直接改;若同一處 Edit 連兩次失敗,改寫 Node patch 腳本(先 `raw.replace(/\r\n/g,"\n")` 正規化、處理完 `.replace(/\n/g,"\r\n")` 轉回),不要硬試第三次。
- `DATA`(農藥資料)在 `index.html` 第 985 行,**不要手動編輯那一行**。更新資料走 `docs/資料與版本更新流程.md` 的腳本流程。
- 改動若牽涉安全判斷(採收期、稀釋倍數、殘留容許量),寧可保守、寧可標「尚未確認」,不要自動推測。錯誤在這個 App 裡是靜默的 —— 不報錯,農友照著噴才出事。

### 3. 升版號(只在動到 `index.html` 或 `sw.js` 時)

```bash
npm run release:bump -- 0.2.1.1 簡短代號
```

一次改完四處(`index.html` 的 `APP_VERSION`、`sw.js` 的 `CACHE_VERSION`、測試檔兩個釘住值)。**不要手動改任何版本號** —— 版本號散在四處,測試檔那兩個釘住值有一個整行沒出現 `CACHE_VERSION` 字樣,關鍵字搜尋找不到,人工必漏。

版位規則:
- 第 3 位 `0.2.X.0`:新功能、明顯改版
- 第 4 位 `0.2.1.X`:小修正、文案、資料更新

漏升 `CACHE_VERSION` 的後果:使用者手機一直吃舊快取,你在電腦看到更新了農友沒有,而且**完全不報錯**。這是本 repo 最難察覺的失敗模式,所以交給腳本。

**純資料檔、文件、mrl-data 腳本**(不影響 `index.html`/`sw.js`)不需要升版,升了反而可能跟其他未合併 PR 撞版本號。

### 4. 測試(必過才能提交)

```bash
node tests/run-all.js
```

若改的是可在瀏覽器觀察的 UI/邏輯,再跑對應的無頭瀏覽器探針(見 `references/verification.md`)—— 語法測試看不出版面跳動、水平溢出、狀態切換這類問題,那些要實際渲染才抓得到。

### 5. Commit(用 heredoc,不要用 printf)

```bash
git add -A
git commit -q -F- <<'MSG'
主旨:一句話講清楚改了什麼

為什麼要改(問題),怎麼改的(方案),以及任何日後維護者需要知道的
非顯而易見決策。

APP_VERSION 0.2.1.1 / CACHE_VERSION v0.2.1.1-代號-日期

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
```

**為什麼用 heredoc 不用 printf:** `printf` 帶中文會 `invalid format character` 失敗。`git commit -F-` 讀 stdin,heredoc 用 `<<'MSG'`(單引號)避免變數展開,中文完全不受影響。訊息若很長或含大量特殊字元,寫進 scratchpad 檔案再 `-F 檔名` 更保險。

### 6. 推送並開 PR

```bash
git push -q -u origin 分支名
gh pr create --base main --head 分支名 --title "主旨" --body "$(cat <<'EOF'
PR 描述:問題 → 方案 → 驗證。
把「這次版本號 A → B」寫進描述,方便對照合併後 App 有沒有更新。
若這次改動修正了先前某個判斷或 PR,誠實寫出來。
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR 描述保持精簡(約 10-15 行),不要把整份分析貼進去。

## 合併後

- 使用者合併 PR → GitHub Pages 自動部署(約 1-2 分鐘)→ 農友下次開 App 就是新版。**網頁層改動不需碰 Play Console。**
- 只有重產 `.aab`(target API、啟動畫面、方向)才需要上傳 Play Console,見 `docs/Android重新產生aab.md`。
- 下一個改動:**回到步驟 1**,用 `npm run branch` 從最新 main 重開,不要重用剛才的分支。

## 常見情境速查

| 情境 | 要不要升版 | 要不要碰 Play |
|---|---|---|
| 改功能、文案、進站頁 | ✅ | ❌ |
| 更新農藥 `DATA` | ✅ | ❌ |
| 改 mrl-data 腳本、產生校對檔 | ❌ | ❌ |
| 寫文件 | ❌ | ❌ |
| target API、啟動畫面、方向 | (改 manifest 不升)| ✅ 重產 .aab |

不確定時,寧可跑一次 `node tests/run-all.js`,它會告訴你版本號有沒有對齊。
