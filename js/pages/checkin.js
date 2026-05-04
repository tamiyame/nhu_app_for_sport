/**
 * 簽到頁（批次模式）
 *
 * 流程：
 *   1. 選擇據點
 *   2. 系統載入該據點的所有學員，以核取方塊呈現
 *   3. 勾選出席學員（可選擇性在「新增其他學員」加入新人）
 *   4. 送出 → 對所有勾選的學員執行 checkIn
 */
const CheckinPage = (function () {

  let usersAtLocation = [];
  let currentLocationToken = 0;

  async function load() {
    await populateLocationSelect('checkin-location', { placeholder: '-- 請選擇 --' });
    // 重置畫面
    const wrap = document.getElementById('checkin-attendees-wrap');
    wrap.classList.add('hidden');
    document.getElementById('checkin-attendees-list').innerHTML = '';
    document.getElementById('checkin-new-names').value = '';
    // 進分頁時在背景刷新一次學員快取，讓之後選據點時可直接用快取秒出
    loadAllUsers(true).catch(() => {});
  }

  // 據點變動 → 載入該據點的學員清單，並標出今天已簽到者
  async function handleLocationChange() {
    const location = document.getElementById('checkin-location').value;
    const wrap = document.getElementById('checkin-attendees-wrap');
    if (!location) {
      wrap.classList.add('hidden');
      return;
    }
    try {
      // 先用快取秒出學員清單（不阻塞 UI），再背景拿今天已簽到名單回來補狀態
      await loadAllUsers();
      usersAtLocation = cachedUsers
        .filter(u => String(u.location) === location)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
      renderAttendeeList(new Set());
      wrap.classList.remove('hidden');
      // 用 token 避免使用者快速切換據點時舊請求蓋掉新清單
      const token = ++currentLocationToken;
      Api.listCheckInsByLocation({ location, date: todayIso() })
        .then(rows => {
          if (token !== currentLocationToken) return;
          const todaySet = new Set((rows || []).map(r => String(r.name)));
          renderAttendeeList(todaySet);
        })
        .catch(() => {});
    } catch (err) {
      showToast('載入學員失敗：' + err.message, 'error');
    }
  }

  function renderAttendeeList(todaySet) {
    todaySet = todaySet || new Set();
    const list = document.getElementById('checkin-attendees-list');
    const hint = document.getElementById('checkin-attendees-hint');
    list.innerHTML = '';
    if (!usersAtLocation.length) {
      hint.textContent = '此據點尚無學員，請在下方「新增其他學員」輸入新姓名。';
      return;
    }
    const signedCount = usersAtLocation.filter(u => todaySet.has(String(u.name))).length;
    hint.textContent = '此據點共 ' + usersAtLocation.length + ' 位學員，今天已簽到 ' +
      signedCount + ' 位，請勾選尚未簽到的出席者：';
    usersAtLocation.forEach((u, idx) => {
      const id = 'attendee-' + idx;
      const wrapper = document.createElement('label');
      wrapper.className = 'attendee-row';
      wrapper.setAttribute('for', id);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.dataset.name = u.name;
      const span = document.createElement('span');
      span.textContent = u.name;
      const status = document.createElement('span');
      status.className = 'row-status';
      if (todaySet.has(String(u.name))) {
        cb.disabled = true;
        status.textContent = '✓ 今天已簽到';
        status.className = 'row-status row-status--success';
      }
      wrapper.appendChild(cb);
      wrapper.appendChild(span);
      wrapper.appendChild(status);
      list.appendChild(wrapper);
    });
  }

  function parseNewNames(text) {
    if (!text) return [];
    return text.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const location = document.getElementById('checkin-location').value;
    if (!location) {
      showToast('請先選擇據點', 'error');
      return;
    }
    const list = document.getElementById('checkin-attendees-list');
    // 清除上一輪的 inline 狀態與動態新增列；但保留「今天已簽到」（checkbox disabled）那些列
    list.querySelectorAll('.attendee-row.attendee-row--new').forEach(el => el.remove());
    list.querySelectorAll('.attendee-row').forEach(row => {
      const cb = row.querySelector('input[type=checkbox]');
      if (cb && cb.disabled) return;
      const el = row.querySelector('.row-status');
      if (el) {
        el.textContent = '';
        el.className = 'row-status';
      }
    });
    // 收集勾選的學員（連同其 row）
    const checkedBoxes = Array.from(list.querySelectorAll('input[type=checkbox]:checked'));
    const newNames = parseNewNames(document.getElementById('checkin-new-names').value);
    const seen = new Set();
    const items = [];
    checkedBoxes.forEach(cb => {
      const name = cb.dataset.name;
      if (seen.has(name)) return;
      seen.add(name);
      const row = cb.closest('.attendee-row');
      items.push({ name, statusEl: row.querySelector('.row-status'), checkbox: cb });
    });
    // 為新增姓名動態建立 row（不含 checkbox，僅顯示姓名與狀態）
    newNames.forEach(name => {
      if (seen.has(name)) return;
      seen.add(name);
      const row = document.createElement('div');
      row.className = 'attendee-row attendee-row--new';
      const span = document.createElement('span');
      span.textContent = name;
      const status = document.createElement('span');
      status.className = 'row-status';
      row.appendChild(span);
      row.appendChild(status);
      list.appendChild(row);
      items.push({ name, statusEl: status });
    });
    if (!items.length) {
      showToast('請勾選至少一位學員或輸入新學員姓名', 'error');
      return;
    }
    // 全部標示為處理中
    items.forEach(item => {
      item.statusEl.textContent = '處理中…';
      item.statusEl.className = 'row-status row-status--pending';
    });
    // 依序送出簽到（後端有當日重複檢查 + 僅限今日驗證）
    for (const item of items) {
      try {
        await Api.checkIn({ name: item.name, location });
        item.statusEl.textContent = '✓ 今天已簽到';
        item.statusEl.className = 'row-status row-status--success';
        if (item.checkbox) {
          item.checkbox.checked = false;
          item.checkbox.disabled = true;
        }
      } catch (err) {
        item.statusEl.textContent = '✗ ' + err.message;
        item.statusEl.className = 'row-status row-status--error';
      }
    }
    // 清空新增姓名欄；不重新渲染清單，保留 inline 狀態給使用者檢視
    document.getElementById('checkin-new-names').value = '';
    await loadAllUsers(true);
    if (typeof refreshUserSelects === 'function') refreshUserSelects();
  }

  function init() {
    document.getElementById('checkin-form').addEventListener('submit', handleSubmit);
    document.getElementById('checkin-location').addEventListener('change', handleLocationChange);
  }

  return { init, load };
})();
