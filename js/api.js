/**
 * API 封裝：前端統一透過這個檔案呼叫 Google Apps Script。
 *
 * 為了避開 CORS preflight，所有請求都用 POST + text/plain，
 * body 是 JSON 字串，第一個欄位 action 決定要執行哪個後端函式。
 */

function isConfigured() {
  return APP_CONFIG && APP_CONFIG.GAS_URL && !APP_CONFIG.GAS_URL.includes('REPLACE_ME');
}

async function callApi(action, payload) {
  if (!isConfigured()) {
    throw new Error('尚未設定 Google Apps Script URL，請先編輯 js/config.js');
  }
  const body = JSON.stringify(Object.assign({ action: action }, payload || {}));
  let res;
  try {
    res = await fetch(APP_CONFIG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow',
    });
  } catch (e) {
    throw new Error('連線失敗：' + e.message);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('回傳格式錯誤：' + text.slice(0, 120));
  }
  if (!json.ok) throw new Error(json.error || '未知錯誤');
  return json.data;
}

const Api = {
  // locations
  listLocations:      ()       => callApi('listLocations'),
  addLocation:        (name)   => callApi('addLocation', { name }),
  deleteLocation:     (name)   => callApi('deleteLocation', { name }),

  // users
  listUsers:          ()       => callApi('listUsers'),
  addUser:            (p)      => callApi('addUser', p),
  deleteUser:         (p)      => callApi('deleteUser', p),
  bulkImport:         (p)      => callApi('bulkImport', p),

  // check-in
  checkIn:                  (p) => callApi('checkIn', p),
  listCheckIns:             (p) => callApi('listCheckIns', p),
  listCheckInsByLocation:   (p) => callApi('listCheckInsByLocation', p),

  // weight training
  addWeightRecord:    (p)      => callApi('addWeightRecord', p),
  listWeightRecords:  (p)      => callApi('listWeightRecords', p),
  deleteWeightRecord: (id)     => callApi('deleteWeightRecord', { id }),

  // self training
  addSelfRecord:      (p)      => callApi('addSelfRecord', p),
  listSelfRecords:    (p)      => callApi('listSelfRecords', p),
  deleteSelfRecord:   (id)     => callApi('deleteSelfRecord', { id }),
};
