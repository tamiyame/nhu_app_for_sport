# 運動紀錄 APP — 工作紀錄

**日期**：2026-04-27
**專案**：nhu_app_for_sport
**公開網址**：https://tamiyame.github.io/nhu_app_for_sport/

---

## 一、專案總覽

從零打造一個運動紀錄網頁 APP，提供以下功能：

- **簽到**：依據點勾選出席學員，支援當日批次簽到
- **重訓紀錄**：依使用者記錄動作、重量、次數、組數
- **自主訓練**：記錄每日步數、每週步數、每週運動分鐘
- **設定**：新增 / 刪除據點

### 架構

```
[瀏覽器網頁 (GitHub Pages)]
        │  fetch (POST, text/plain)
        ▼
[Google Apps Script Web App]
        │
        ▼
[Google Sheet（5 個分頁）]
```

- 前端：純 HTML + CSS + JavaScript（無框架）
- 後端：Google Apps Script Web App
- 資料庫：Google Sheet（管理員可直接打開檢視）
- 主鍵：`(姓名, 據點)` — 同人在不同據點視為不同帳號
- 部署：GitHub Pages（免費、公開）

---

## 二、檔案結構

```
nhu_app_for_sport/
├── index.html              # 單頁應用主檔
├── css/
│   └── styles.css
├── js/
│   ├── config.js           # GAS Web App URL
│   ├── api.js              # fetch 封裝
│   ├── app.js              # 分頁切換、共用工具
│   └── pages/
│       ├── checkin.js
│       ├── weights.js
│       ├── self.js
│       └── settings.js
├── gas/
│   └── Code.gs             # Apps Script 後端
└── README.md
```

### Google Sheet 的 5 個分頁

| 分頁 | 欄位 |
|---|---|
| `locations` | name, created_at |
| `users` | name, location, created_at |
| `check_ins` | id, name, location, check_date, created_at |
| `weight_training` | id, name, location, train_date, action_type, weight_kg, reps, sets, created_at |
| `self_training` | id, name, location, train_date, daily_steps, weekly_steps, weekly_exercise_minutes, created_at |

---

## 三、本次 Session 完成的工作

### 1. 初版實作（從零搭建）

- 建立完整檔案結構（HTML / CSS / JS / GAS）
- 4 分頁 SPA：簽到 / 重訓 / 自主訓練 / 設定
- 後端 GAS API 共 14 個 actions
- 自動建立 Sheet 分頁與表頭

### 2. 部署

- **GAS 部署**：使用瀏覽器自動化貼程式碼到 Apps Script 編輯器，部署為 Web App（執行身分=我，存取權=任何人），取得 Web App URL 並寫入 `js/config.js`
- **GitHub Pages 部署**：建立 repo `tamiyame/nhu_app_for_sport`，啟用 Pages，公開網址：`https://tamiyame.github.io/nhu_app_for_sport/`

### 3. UX 優化：使用者下拉選單

- 第一次簽到後，姓名+據點存入 `users`
- 重訓 / 自主訓練頁直接從下拉選單挑選使用者，自動帶出據點
- 全域 `cachedUsers` 快取，新增使用者後自動刷新所有下拉

### 4. 同日重複簽到檢核

- 後端：同 `(姓名, 據點, 日期)` 已存在則拒絕，錯誤訊息「今天已經簽到過了喔!」

### 5. 簽到查詢功能

- 「簽到查詢」按鈕：以 `prompt` 輸入姓名，跨所有據點列出該姓名的所有簽到紀錄
- 每筆紀錄可單獨刪除（含確認對話框）

### 6. 限制當日簽到

- 後端：`date !== today` 則拒絕，錯誤訊息「只能簽到當日，無法補簽或預簽」
- 禁止過去日期補簽與未來日期預簽

### 7. 簽到流程簡化（核取方塊批次模式）

**最後完成的關鍵變更**：把簽到改為「先選據點 → 自動帶出該據點所有學員的核取方塊 → 勾選出席者 → 一次送出」。

- **HTML**：移除舊的姓名輸入框與日期欄；新增 `<div id="checkin-attendees-list" class="checkbox-list">` 與「新增其他學員」`<textarea>`
- **JS** (`pages/checkin.js`)：
  - `handleLocationChange`：依選定據點過濾 `cachedUsers`，渲染核取方塊清單
  - `renderAttendeeList`：產出 `<label class="attendee-row">` + checkbox + 姓名 span
  - `handleSubmit`：收集勾選 + 解析新增姓名（支援逗號 / 換行分隔），依序呼叫 `Api.checkIn`，最後彙總成功 / 失敗顯示在 toast
- **CSS**：新增 `.checkbox-list` grid 與 `.attendee-row` 樣式；`#toast` 改為 `white-space: pre-line` 以支援多行訊息

---

## 四、關鍵程式片段

### 後端：`checkIn` action（含驗證）

```js
checkIn: function (req) {
  const name = (req.name || '').trim();
  const location = (req.location || '').trim();
  if (!name || !location) throw new Error('姓名與據點皆必填');
  const today = toDateString(new Date());
  const date = req.date ? req.date : today;
  // 僅限當日簽到
  if (date !== today) throw new Error('只能簽到當日，無法補簽或預簽');
  // 同日重複檢查
  const dup = readAll('check_ins').some(function (r) {
    return String(r.name) === name
      && String(r.location) === location
      && toDateString(r.check_date) === date;
  });
  if (dup) throw new Error('今天已經簽到過了喔!');
  upsertUser(name, location);
  const id = uuid();
  sheet('check_ins').appendRow([id, name, location, date, new Date()]);
  return { id: id };
}
```

### 前端：批次簽到送出

```js
async function handleSubmit(e) {
  e.preventDefault();
  const location = document.getElementById('checkin-location').value;
  const checked = Array.from(document.querySelectorAll(
    '#checkin-attendees-list input[type=checkbox]:checked'
  )).map(cb => cb.dataset.name);
  const newNames = parseNewNames(document.getElementById('checkin-new-names').value);
  const seen = new Set();
  const allNames = [...checked, ...newNames].filter(n => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  const results = [];
  for (const name of allNames) {
    try {
      await Api.checkIn({ name, location });
      results.push({ name, ok: true });
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
    }
  }
  // 彙總顯示成功 / 失敗
  // ...
}
```

---

## 五、過程中遇到並解決的問題

| 問題 | 解法 |
|---|---|
| Apps Script 分頁中途被關閉 | 透過 Extensions → Apps Script 重新開啟 |
| Monaco editor `setValue` 在錯誤頁面執行（長度不符） | 偵測到後導航回 `/edit` 重新貼程式碼 |
| `const Api = ...` 因 const block scope 無法覆寫全域 | 改用 `window.Api = ...` + `(0, eval)(code)` 全域 eval |
| GitHub Pages HTTP cache 提供舊版 `api.js`（10 分鐘） | 等待快取過期或 Ctrl+F5 強制更新；以 `fetch('?ts='+Date.now())` 驗證 |
| GitHub username 拼錯（tamiyane vs tamiyame） | 建立 repo 時發現實際帳號是 `tamiyame`，更新所有路徑 |
| Date 驗證以 server `new Date()` 為準 | 以 `toDateString(new Date())` 比對，確保時區一致 |

---

## 六、後續可考慮事項

- GAS Web App 目前是「任何人」可呼叫，知道 URL 即可寫入。若要收緊，可加入 secret token 驗證，或限制「只有在我的組織內」
- 若需多管理員協作，可在 Sheet 設定多人編輯權限
- 如需離線使用，可加上 PWA Service Worker
- 簽到查詢目前用 `window.prompt`，未來可改為更友善的對話框 UI

---

## 七、驗證紀錄

完整端到端測試已通過：

- [x] 設定頁新增「台北館」→ Sheet `locations` 出現新列
- [x] 簽到頁選據點 → 核取方塊清單正確帶出該據點學員
- [x] 批次勾選 4 位學員送出 → 3 位成功、1 位（已簽到過）正確被拒
- [x] 重訓頁新增紀錄 → Sheet 與列表同步
- [x] 自主訓練頁新增紀錄 → Sheet 與列表同步
- [x] 簽到查詢輸入姓名 → 跨據點列出所有紀錄並可刪除
- [x] 嘗試以非今日日期簽到 → 後端正確拒絕
- [x] 設定頁刪除已綁使用者的據點 → 後端正確拒絕
