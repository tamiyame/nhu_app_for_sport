/**
 * 運動紀錄 APP — Google Apps Script 後端
 *
 * 部署方式：
 *   1. 打開要當資料庫的 Google Sheet
 *   2. 擴充功能 → Apps Script
 *   3. 刪除預設 Code.gs 內容，貼上本檔案全部內容
 *   4. 儲存 (Ctrl+S)
 *   5. 右上「部署 → 新增部署作業」→ 類型選「網頁應用程式」
 *      執行身分：我
 *      存取權：任何人
 *   6. 授權後複製 Web App URL，貼到前端 js/config.js
 */

// ===== 表頭定義 =====
const HEADERS = {
  locations:       ['name', 'created_at'],
  users:           ['name', 'location', 'created_at'],
  check_ins:       ['id', 'name', 'location', 'check_date', 'created_at'],
  weight_training: ['id', 'name', 'location', 'train_date', 'action_type', 'weight_kg', 'reps', 'sets', 'created_at'],
  self_training:   ['id', 'name', 'location', 'train_date', 'daily_steps', 'weekly_steps', 'weekly_exercise_minutes', 'created_at'],
};

// ===== 進入點 =====
function doGet(e) {
  return jsonResponse({ ok: true, message: '運動紀錄 API 已上線' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const fn = actions[req.action];
    if (!fn) throw new Error('未知的 action: ' + req.action);
    const data = fn(req);
    return jsonResponse({ ok: true, data: data });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== Sheet helpers =====
function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS[name]);
    sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS[name]);
    sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll(name) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function upsertUser(name, location) {
  const rows = readAll('users');
  const exists = rows.some(r => String(r.name) === String(name) && String(r.location) === String(location));
  if (!exists) {
    sheet('users').appendRow([name, location, new Date()]);
  }
}

function uuid() {
  return Utilities.getUuid();
}

function deleteRowById(sheetName, id) {
  const sh = sheet(sheetName);
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return { id: id };
    }
  }
  throw new Error('找不到紀錄 id: ' + id);
}

function toDateString(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return String(v);
}

// ===== Actions =====
const actions = {

  // ---- locations ----
  listLocations: function () {
    return readAll('locations');
  },

  // ---- users ----
  listUsers: function () {
    return readAll('users')
      .map(function (r) { return { name: r.name, location: r.location }; })
      .sort(function (a, b) {
        var ka = String(a.name) + '|' + String(a.location);
        var kb = String(b.name) + '|' + String(b.location);
        return ka < kb ? -1 : (ka > kb ? 1 : 0);
      });
  },

  addLocation: function (req) {
    const name = (req.name || '').trim();
    if (!name) throw new Error('據點名稱不可空白');
    const rows = readAll('locations');
    if (rows.some(r => String(r.name) === name)) {
      throw new Error('據點已存在：' + name);
    }
    sheet('locations').appendRow([name, new Date()]);
    return { name: name };
  },

  deleteLocation: function (req) {
    const name = String(req.name || '');
    if (!name) throw new Error('據點名稱不可空白');
    const users = readAll('users');
    if (users.some(u => String(u.location) === name)) {
      throw new Error('此據點仍有使用者紀錄，無法刪除');
    }
    const sh = sheet('locations');
    const data = sh.getDataRange().getValues();
    let deleted = false;
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === name) {
        sh.deleteRow(i + 1);
        deleted = true;
      }
    }
    if (!deleted) throw new Error('找不到據點：' + name);
    return { name: name };
  },

  // ---- check-in ----
  checkIn: function (req) {
    const name = (req.name || '').trim();
    const location = (req.location || '').trim();
    if (!name || !location) throw new Error('姓名與據點皆必填');
    const today = toDateString(new Date());
    const date = req.date ? req.date : today;
    // 僅限當日簽到，禁止補簽（過去）或預簽（未來）
    if (date !== today) throw new Error('只能簽到當日，無法補簽或預簽');
    // 當日重複檢查：同一 (姓名, 據點, 日期) 已存在就拒絕
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
  },

  listCheckIns: function (req) {
    const name = String(req.name || '');
    const location = String(req.location || '');
    const limit = Number(req.limit || 0);
    const rows = readAll('check_ins')
      .filter(r => String(r.name) === name && String(r.location) === location)
      .map(r => ({ id: r.id, name: r.name, location: r.location, check_date: toDateString(r.check_date) }))
      .sort((a, b) => (a.check_date < b.check_date ? 1 : -1));
    return limit > 0 ? rows.slice(0, limit) : rows;
  },

  // 僅依姓名查詢所有簽到紀錄（跨據點）
  listCheckInsByName: function (req) {
    const name = String(req.name || '').trim();
    if (!name) throw new Error('請輸入姓名');
    return readAll('check_ins')
      .filter(function (r) { return String(r.name) === name; })
      .map(function (r) {
        return {
          id: r.id,
          name: r.name,
          location: r.location,
          check_date: toDateString(r.check_date)
        };
      })
      .sort(function (a, b) { return a.check_date < b.check_date ? 1 : -1; });
  },

  deleteCheckIn: function (req) {
    return deleteRowById('check_ins', req.id);
  },

  // ---- weight training ----
  addWeightRecord: function (req) {
    const name = (req.name || '').trim();
    const location = (req.location || '').trim();
    if (!name || !location) throw new Error('姓名與據點皆必填');
    if (!req.action_type) throw new Error('動作類型必填');
    upsertUser(name, location);
    const id = uuid();
    sheet('weight_training').appendRow([
      id,
      name,
      location,
      req.train_date || toDateString(new Date()),
      String(req.action_type),
      Number(req.weight_kg || 0),
      Number(req.reps || 0),
      Number(req.sets || 0),
      new Date()
    ]);
    return { id: id };
  },

  listWeightRecords: function (req) {
    const name = String(req.name || '');
    const location = String(req.location || '');
    return readAll('weight_training')
      .filter(r => String(r.name) === name && String(r.location) === location)
      .map(r => ({
        id: r.id,
        name: r.name,
        location: r.location,
        train_date: toDateString(r.train_date),
        action_type: r.action_type,
        weight_kg: Number(r.weight_kg),
        reps: Number(r.reps),
        sets: Number(r.sets),
      }))
      .sort((a, b) => (a.train_date < b.train_date ? 1 : -1));
  },

  deleteWeightRecord: function (req) {
    return deleteRowById('weight_training', req.id);
  },

  // ---- self training ----
  addSelfRecord: function (req) {
    const name = (req.name || '').trim();
    const location = (req.location || '').trim();
    if (!name || !location) throw new Error('姓名與據點皆必填');
    upsertUser(name, location);
    const id = uuid();
    sheet('self_training').appendRow([
      id,
      name,
      location,
      req.train_date || toDateString(new Date()),
      Number(req.daily_steps || 0),
      Number(req.weekly_steps || 0),
      Number(req.weekly_exercise_minutes || 0),
      new Date()
    ]);
    return { id: id };
  },

  listSelfRecords: function (req) {
    const name = String(req.name || '');
    const location = String(req.location || '');
    return readAll('self_training')
      .filter(r => String(r.name) === name && String(r.location) === location)
      .map(r => ({
        id: r.id,
        name: r.name,
        location: r.location,
        train_date: toDateString(r.train_date),
        daily_steps: Number(r.daily_steps),
        weekly_steps: Number(r.weekly_steps),
        weekly_exercise_minutes: Number(r.weekly_exercise_minutes),
      }))
      .sort((a, b) => (a.train_date < b.train_date ? 1 : -1));
  },

  deleteSelfRecord: function (req) {
    return deleteRowById('self_training', req.id);
  },

};
