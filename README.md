# 運動紀錄 APP

一個純網頁運動紀錄小工具，資料存在 Google Sheet，管理員可以直接打開試算表查看、篩選、匯出資料。

## 功能

- **簽到頁**：選據點、輸入姓名與日期，送出簽到紀錄
- **重量訓練紀錄**：記錄動作類型（自行輸入）、重量 kg、反覆次數、組數
- **自主訓練紀錄**：記錄每日步數、每週步數、每週運動時間
- **設定頁**：新增 / 刪除據點、測試 Apps Script 連線

資料以 `(姓名, 據點)` 為主鍵 — 同一人在同一據點視為同一位使用者，但可以有多筆訓練紀錄。

## 架構

```
[瀏覽器網頁] ──fetch──▶ [Google Apps Script Web App] ──▶ [Google Sheet]
```

- 前端：純 HTML + CSS + JavaScript（不用框架、不用 npm）
- 後端：Google Apps Script 綁定 Google Sheet
- 資料庫：一個 Google Sheet，裡面有 5 個分頁（locations, users, check_ins, weight_training, self_training）

完全免費，只需要一個 Google 帳號。

## 建置步驟

### Step 1：建立 Google Sheet

1. 前往 <https://sheets.google.com>
2. 點「＋ 空白」建立新的試算表
3. 命名為例如「運動紀錄資料庫」（檔名隨意）

> 不用手動建表頭！Apps Script 程式碼會在第一次被呼叫時自動建立所有分頁和表頭。

### Step 2：貼 Apps Script 程式碼

1. 在剛建好的試算表上方選單點 **擴充功能 (Extensions) → Apps Script**
2. 會開一個新分頁，左側檔案列表有預設的 `Code.gs`
3. 把預設內容**全部刪掉**
4. 打開本專案的 `gas/Code.gs`，**複製全部內容**貼進去
5. 按儲存（磁片圖示或 Ctrl+S），專案名稱可以命名為例如「運動紀錄 API」

### Step 3：部署成 Web App

1. Apps Script 編輯器右上角點 **部署 (Deploy) → 新增部署作業 (New deployment)**
2. 左側齒輪「選取類型」→ 選 **網頁應用程式 (Web app)**
3. 填寫：
   - **說明**：`運動紀錄 API`（隨意）
   - **執行身分 (Execute as)**：**我 (Me)**
   - **存取權 (Who has access)**：**任何人 (Anyone)**
4. 點 **部署 (Deploy)**
5. 第一次會跳出授權視窗：
   - 點 **授權存取權 (Authorize access)**
   - 選擇你的 Google 帳號
   - 如果出現「Google 尚未驗證這個應用程式」：點 **進階 (Advanced)** → 點 **前往「專案名稱」(unsafe)** → **允許 (Allow)**
6. 部署成功後會看到 **「Web 應用程式」網址**，類似：
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxx/exec
   ```
7. **複製這個網址**

### Step 4：貼 URL 到 config.js

打開 `js/config.js`，把 `GAS_URL` 的值換成剛剛複製的網址：

```js
const APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxx/exec',
};
```

儲存檔案。

### Step 5：開啟 APP

**方式一（最簡單）**：直接雙擊 `index.html`，會用預設瀏覽器開啟。

**方式二（若遇到 CORS 問題）**：在專案資料夾開 cmd / PowerShell，執行其中一個：
```bash
python -m http.server 8000
```
或
```bash
npx serve
```
然後瀏覽器開 `http://localhost:8000`。

### Step 6：首次使用

1. 切到「**設定**」頁，點「測試連線」按鈕，應該看到 `✓ 連線成功，目前據點數：0`
2. 新增至少一個據點（例如「台北館」）
3. 切到「**簽到**」頁，選據點、輸入姓名、按「送出簽到」
4. 回到 Google Sheet，可以看到自動出現 5 個分頁，裡面有剛剛輸入的資料

## 資料表結構（Google Sheet 分頁）

| 分頁 | 欄位 |
|---|---|
| `locations` | name, created_at |
| `users` | name, location, created_at |
| `check_ins` | id, name, location, check_date, created_at |
| `weight_training` | id, name, location, train_date, action_type, weight_kg, reps, sets, created_at |
| `self_training` | id, name, location, train_date, daily_steps, weekly_steps, weekly_exercise_minutes, created_at |

管理員可以直接：
- 用 Google Sheet 的篩選 / 排序功能查資料
- 用樞紐分析 (Pivot Table) 統計
- 檔案 → 下載 → CSV 匯出

## 檔案結構

```
nhu_app_for_sport/
├── index.html              # 主頁面
├── css/styles.css          # 樣式
├── js/
│   ├── config.js           # ← 改這裡貼 GAS URL
│   ├── api.js              # API 呼叫封裝
│   ├── app.js              # 主控制 + 共用工具
│   └── pages/              # 四個分頁邏輯
│       ├── settings.js
│       ├── checkin.js
│       ├── weights.js
│       └── self.js
├── gas/
│   └── Code.gs             # Google Apps Script 後端（貼到 GAS 編輯器）
└── README.md
```

## 常見問題

**Q：部署後改了 Code.gs，前端呼叫為什麼沒更新？**
A：改完 Apps Script 之後，要再點一次「**部署 → 管理部署作業**」，在現有部署旁邊點鉛筆 → 版本選「**新版本**」→ 部署。Web App URL 不會變。

**Q：為什麼送出時看到「回傳格式錯誤」？**
A：通常是 GAS URL 貼錯了（結尾要是 `/exec`，不是 `/dev`），或部署時「存取權」沒設成「任何人」。

**Q：有沒有帳號密碼？**
A：目前沒有。因為 GAS 部署成「任何人可存取」，任何知道 URL 的人都能寫入。這適合內部使用情境。若要限制，可以在 GAS 加入密鑰檢查（每次前端呼叫時附帶一組 secret，後端比對），或把存取權改成「只有在我的組織內」。

**Q：資料可以備份嗎？**
A：Google Sheet 會自動記錄版本歷程（檔案 → 版本記錄）。也可以定期下載成 CSV 存檔。
