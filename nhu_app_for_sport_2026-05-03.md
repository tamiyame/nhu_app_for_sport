# 運動紀錄 APP — 工作紀錄

**日期**：2026-05-03
**專案**：nhu_app_for_sport
**公開網址**：https://tamiyame.github.io/nhu_app_for_sport/
**這次 commit**：`8b21be8`（程式）、`db4f328`（工作日誌 + 範例 xlsx）

---

## 一、本次 Session 完成的工作

### 1. 簽到頁 — 成功訊息從彈窗改為 inline 狀態

- 移除送出後彙總成功 / 失敗的 toast
- 每個學員列右側加 `.row-status` span：送出時顯示「處理中…」（灰）→ 完成後變「✓ 今天已簽到」（綠）或「✗ <錯誤訊息>」（紅）
- 成功的 row checkbox 自動 disable，避免重複送出

### 2. 簽到頁 — 選據點立即顯示已簽到狀態

- 新增後端 action `listCheckInsByLocation({location, date?})`，預設回今日
- `handleLocationChange` 在拉取學員清單同時 `Promise.all` 抓今日簽到名單，把已簽到的列預先標成「✓ 今天已簽到」 + disabled checkbox
- hint 文字改為「此據點共 N 位學員，今天已簽到 M 位，請勾選尚未簽到的出席者：」
- 用語統一為「✓ 今天已簽到」（移除舊的「✓ 已簽到」分歧）

### 3. 簽到頁 — 移除「簽到查詢」按鈕

- inline status 已直接顯示，不需另外查詢
- 連同 `handleQuery` / `renderQueryResults` / `handleQueryDelete` 與 `Api.listCheckInsByName` / `Api.deleteCheckIn` 全部移除

### 4. 設定頁 — 從「新增據點」改為「新增學員」+ 學員管理

- 移除 `addLocation` 的手動 UI（只能透過後續的 .xlsx 匯入建立據點）
- 新增「新增學員」表單：據點下拉 + 姓名 input
- 新增「學員清單」table，依選定據點過濾、checkbox 多選 + 三鍵操作（**全選 / 全不選 / 刪除**）
- 後端新增 `addUser`（idempotent，已存在不報錯）、`deleteUser`（只移除 users 表，保留歷史紀錄）

### 5. 設定頁 — .xlsx 批次匯入名單

- 引入 SheetJS（jsdelivr CDN，pin `xlsx@0.18.5`）
- 解析規則：**每個分頁 = 一個據點，A 欄第 1 列為「姓名」表頭，第 2 列起為學員姓名**
- 上傳後顯示預覽表（據點 / 人數 / 姓名清單），提供兩種模式：
  - **合併匯入**：補上不存在的學員（已存在跳過）
  - **覆蓋匯入**：先清空 xlsx 涉及的據點現有學員、再寫入新名單（需 confirm）；歷史簽到 / 訓練紀錄保留
- 後端新增 `bulkImport({items, mode})` 一次處理整個檔案

### 6. 設定頁 — 「所有據點」改為下拉式選單 + 連動刪除

- 表格改為 `<select>` + 紅色「刪除據點」按鈕
- 後端 `deleteLocation` 從「有學員就拒絕」改為「先連動刪除該據點所有 users，再刪 location」，回傳 `{name, usersDeleted}`
- 簽到 / 訓練的歷史紀錄完全保留
- 前端 confirm 顯示「將連動刪除 N 位學員」

### 7. Google Fit 整合（新分頁）

#### Google Cloud Console 設定（透過 Chrome 自動化代為操作）

- Project：沿用既有 `chinup-fitness`
- 啟用 Fitness API
- OAuth 同意畫面：External + 測試模式（既有設定，不變動）
- 新增受限制範圍 `https://www.googleapis.com/auth/fitness.activity.read`
- 新建 OAuth Web Client `nhu-sport-web`，授權 origins：
  - `https://tamiyame.github.io`
  - `http://localhost:8765`
- Client ID：`476050640173-mlu4tn7j4bo174ajs4dino6hke51745t.apps.googleusercontent.com`

#### 前端實作

- `index.html` 加入 `<script src="https://accounts.google.com/gsi/client" async defer>`
- 新分頁 `<section id="tab-googlefit">`：登入按鈕、近 7 天步數表、「寫入自主訓練」表單
- `js/pages/googlefit.js`：
  - 用 GIS `initTokenClient` 走 OAuth implicit / token flow（scope = `fitness.activity.read email profile`）
  - 登入後呼叫 `fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate` 抓近 7 天的步數（`com.google.step_count.delta`）與活動分鐘（`derived:com.google.active_minutes:com.google.android.gms:merge_active_minutes`）
  - 渲染週表 + 合計
  - 「寫入自主訓練」按鈕：選學員 + 選日期 → 呼叫現有 `Api.addSelfRecord` 寫入 `self_training` 表（`weekly_steps` / `weekly_exercise_minutes` 用近 7 天累計）

### 8. GAS 後端三次重新部署

| 版本 | 內容 | 部署時間 |
|---|---|---|
| 6 版 | `addUser` / `deleteUser` / `bulkImport` | 2026-04-27 18:48 |
| 7 版 | `listCheckInsByLocation` | 2026-04-27 19:10 |
| 8 版 | `deleteLocation` cascade | 2026-04-28 01:14 |

URL 全程不變（`AKfycbyI770HW...damx5dg`），前端 `js/config.js` 沒動。

---

## 二、API 變更總覽（Code.gs）

新增 / 修改的 actions：

| Action | 新增 / 變更 | 說明 |
|---|---|---|
| `addUser` | 新增 | idempotent 學員 upsert，回 `{name, location, created}` |
| `deleteUser` | 新增 | 僅移除 users 表，保留歷史 |
| `bulkImport` | 新增 | `items=[{location, name}]` + `mode=merge|replace` |
| `listCheckInsByLocation` | 新增 | 回某據點某日的所有簽到列 |
| `deleteLocation` | **變更** | 改為 cascade 刪 users（不再拒絕有學員的據點） |

不再被前端使用（保留在後端，無害）：
- `listCheckInsByName`
- `deleteCheckIn`
- `addLocation`（仍透過 `bulkImport` 自動建立）

---

## 三、檔案結構新增 / 變更

```
nhu_app_for_sport/
├── index.html              # 加入 SheetJS + GIS SDK；簽到 / 設定 / Google Fit 分頁全面改寫
├── css/
│   └── styles.css          # row-status / checkbox-list / 學員 checkbox 欄樣式
├── js/
│   ├── config.js           # 新增 GOOGLE_FIT_CLIENT_ID
│   ├── api.js              # 新增 addUser / deleteUser / bulkImport / listCheckInsByLocation
│   ├── app.js              # 加入 GoogleFitPage init / loader
│   └── pages/
│       ├── checkin.js      # inline status + pre-load 今日簽到
│       ├── settings.js     # 全部改寫（學員管理 + xlsx 匯入 + 據點下拉）
│       ├── googlefit.js    # 新檔（OAuth + Fit REST + 寫入自主訓練）
│       ├── weights.js      # 未動
│       └── self.js         # 未動
├── gas/
│   └── Code.gs             # 新增 5 個 action / deleteLocation 變 cascade
├── 據點名單.xlsx            # 範例 xlsx（已 commit）
├── nhu_app_for_sport_2026-04-27.md
└── nhu_app_for_sport_2026-05-03.md  # 本檔
```

---

## 四、過程中遇到並解決的問題

| 問題 | 解法 |
|---|---|
| Settings dropdown 一直空白，但 cache 有 16 個據點 | 是瀏覽器 HTTP 快取了舊版 settings.js。在 `<script src>` 加 `?v=N` query 強制 cache-bust。 |
| `.row-status font-size: 13px` 沒套用 | 被 `.card .checkbox-list label.attendee-row span` 高優先序蓋過。把選擇器改為 `.card .checkbox-list .attendee-row .row-status` 提升特異度。 |
| GAS 部署誤點到「5 版」造成 rollback（addUser 全失效） | 立刻發現，重新進「管理部署作業 → 編輯 → 建立新版本 → 部署」修正回來。後續每步先 screenshot 確認狀態再點。 |
| 部署視窗變寬 (1568x744) 時座標漂移 | 不再用記憶座標，每次先 screenshot 重抓元素位置。 |
| `Ctrl+S` 在 Apps Script 編輯器有時不生效 | 先 `monaco.editor.getEditors()[0].focus()` 確保編輯器拿到 focus，再送 keydown 事件。 |
| 刪除據點跳「找不到據點：[object Object]」 | 我把 `Api.deleteLocation(name)` 寫成 `Api.deleteLocation({name})` 多包一層，後端 `String({name:'foo'})` 變 `"[object Object]"`。改回單字串參數。 |
| Google Fit 設定警告誤顯示（client ID 已設） | `configured()` 用了 `window.APP_CONFIG`，但 `const` 在普通 script 不會掛到 window。改為 `typeof APP_CONFIG !== 'undefined'`。 |
| 手機開 GitHub Pages 連結時 OAuth 跳 `disallowed_useragent` | 不是 App 問題：是從 LINE / Messenger 的 in-app webview 開的，Google 政策禁止。請使用者改用 Chrome 開或加到主畫面。 |
| 第一次 commit 失敗：`Author identity unknown` | 安全規則禁止我修改 git config，改用 `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` 環境變數一次性提供身份；後續請使用者自己 `git config user.name/email` 設好就不必再用環境變數。 |

---

## 五、Google Fit 後續相關說明（給未來參考）

### 測試模式 → 上 production 的兩條路

- **路線 A（現況，建議）**：維持測試模式，最多 100 位測試使用者；首次授權有「未驗證」黃底警告，按「進階 → 繼續」即可。對小規模使用足夠。
- **路線 B（須資安評估）**：送 Google verification。fitness.activity.read 屬「**受限制範圍**」，除一般文件外還必須做 CASA Tier 2/3 滲透測試，每年費用約 $5,000–15,000 美金。對個人 / 小社群基本上不可行。
- **路線 C（Workspace 限定）**：若使用者都在同一個 Google Workspace 組織內，可把 OAuth 同意畫面改為 Internal，免驗證且無 100 人上限。一般 `@gmail.com` 不適用。

### Fitness API 淘汰風險

Google 2024 年開始把開發者推向 Health Connect（Android-only 原生 API）。Fit REST API 還能用，但時程不明朗（早期跡象指 2025–2026 之間）。長期方案要小心，做 PoC / 內部使用沒問題。

### 寫入自主訓練的對應規則

- Google Fit 登入的 Google 帳號 ≠ 系統內的學員，所以「寫入自主訓練」要先選一個學員（從 `cachedUsers` 下拉）
- 寫入時：`daily_steps` = 選定日期的步數；`weekly_steps` / `weekly_exercise_minutes` = 近 7 天累計值

---

## 六、後續可考慮事項

- **Health Connect 整合**：若未來想接「真正的手機健康資料總匯」，必須開發 Android 原生 App（Kotlin + Health Connect SDK），跳出網頁架構。
- **Fit scope 擴充**：目前只授權 activity，若要顯示心率 / 睡眠 / 體重，到 Cloud Console 加 `fitness.heart_rate.read` / `fitness.sleep.read` / `fitness.body.read` scope（都是 restricted），無需重新部署 GAS，僅前端 `googlefit.js` 加新的 `dataTypeName` 即可。
- **學員身份對應 Google 帳號**：目前 Google Fit 寫入要每次選學員，未來若每位學員都有自己的 Gmail，可以做「綁定」表把 Google email → (name, location) 自動對應。
- **GitHub Pages cache-buster 自動化**：現在改 css / js 都要手動把 `?v=N` 加 1，可以寫個 build step 用檔案 hash 自動產生。
- **GAS 部署的腳本化**：每次改 Code.gs 都要手動進 Apps Script editor 貼程式 + 部署，可以考慮用 `clasp`（Google 官方 CLI）做 push & deploy 自動化，省去 Chrome 自動化的維護成本。
- **登入流程教學**：在 Google Fit 分頁加一段 hint 文字說明「未驗證」警告與 in-app webview 問題，避免使用者第一次就被擋住。

---

## 七、驗證紀錄

完整端到端測試已通過（preview 自動化 + 手動）：

- [x] 簽到頁：選據點 → 立即顯示「✓ 今天已簽到 5 位」與綠色標籤；未簽到者可勾選送出
- [x] 簽到頁：送出後 inline 顯示「✓ 今天已簽到」/「✗ <錯誤>」，不再彈 toast
- [x] 設定頁：新增學員、刪除單一學員、學員 checkbox 全選 / 全不選 / 批次刪除
- [x] 設定頁：上傳 `據點名單.xlsx` → 預覽顯示嘉義 / 南靖各 3 位，合併與覆蓋按鈕都運作
- [x] 設定頁：所有據點下拉，刪除據點時 confirm 顯示影響學員數，cascade 後 listLocations / listUsers 都查不到該資料
- [x] 後端 8 版生效：`addUser`、`deleteUser`、`bulkImport`、`listCheckInsByLocation`、`deleteLocation`（cascade）皆正常
- [x] Google Fit 分頁：UI 載入正常、GIS SDK 載入、Client ID 已配置、登入按鈕可見
- [x] 兩次 git commit 推送成功（`8b21be8` 程式碼 + `db4f328` 工作日誌與範例 xlsx）

仍待使用者實測：
- [ ] Google Fit 在 Chrome 真正登入並抓到資料（測試使用者已加 `tamiyane@gmail.com`）
- [ ] 「寫入自主訓練」實際寫入後，自主訓練頁能查到該筆紀錄
