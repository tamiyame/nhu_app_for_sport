/**
 * 重訓紀錄頁
 *
 * 流程（與簽到頁類似）：
 *   1. 選擇據點
 *   2. 系統載入該據點所有學員，以核取方塊呈現
 *   3. 一次只能勾選一位學員（單選），勾選後自動載入該學員紀錄
 *   4. 新增重訓時，後端自動以當天日期寫入
 */
const WeightsPage = (function () {

  let usersAtLocation = [];
  let currentName = '';
  let currentLocation = '';
  // 紀錄快取：{ [location]: Promise<rows[]> }
  // 選據點時就背景開始 fetch；點學員時直接從快取過濾，秒出。
  const recordsCache = {};
  // 只要看到任何一筆只丟 location 就回傳資料的成功例，就確定後端已支援
  // location-only 模式（新版 GAS）。確認前用 per-name fallback 避免破畫面。
  let locationOnlyVerified = false;

  function prefetchRecords(location) {
    if (!location) return null;
    if (!recordsCache[location]) {
      recordsCache[location] = Api.listWeightRecords({ location: location })
        .then(rows => {
          if (Array.isArray(rows) && rows.length > 0) locationOnlyVerified = true;
          return rows;
        })
        .catch(err => { delete recordsCache[location]; throw err; });
    }
    return recordsCache[location];
  }

  function invalidateRecords(location) {
    if (location) delete recordsCache[location];
  }

  async function load() {
    await populateLocationSelect('weights-location', { placeholder: '-- 請選擇 --' });
    const wrap = document.getElementById('weights-attendees-wrap');
    wrap.classList.add('hidden');
    document.getElementById('weights-attendees-list').innerHTML = '';
    currentName = '';
    currentLocation = '';
    clearTable();
    // 進分頁時在背景刷新一次學員快取，讓之後選據點時可直接用快取秒出
    loadAllUsers(true).catch(() => {});
  }

  function clearTable() {
    const tbody = document.querySelector('#weights-table tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">尚無紀錄</td></tr>';
  }

  async function handleLocationChange() {
    const location = document.getElementById('weights-location').value;
    const wrap = document.getElementById('weights-attendees-wrap');
    currentName = '';
    currentLocation = '';
    clearTable();
    if (!location) {
      wrap.classList.add('hidden');
      return;
    }
    try {
      // 用既有快取，避免每次切據點都等 ~2 秒 API
      await loadAllUsers();
      usersAtLocation = cachedUsers
        .filter(u => String(u.location) === location)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
      renderAttendeeList();
      wrap.classList.remove('hidden');
      // 背景啟動該據點全部紀錄的 prefetch；學員選定後直接過濾 cache
      prefetchRecords(location);
    } catch (err) {
      showToast('載入學員失敗：' + err.message, 'error');
    }
  }

  function renderAttendeeList() {
    const list = document.getElementById('weights-attendees-list');
    const hint = document.getElementById('weights-attendees-hint');
    list.innerHTML = '';
    if (!usersAtLocation.length) {
      hint.textContent = '此據點尚無學員，請到「設定」頁新增。';
      return;
    }
    hint.textContent = '此據點共 ' + usersAtLocation.length + ' 位學員，請勾選一位（一次僅能選一人）：';
    usersAtLocation.forEach((u, idx) => {
      const id = 'weights-attendee-' + idx;
      const wrapper = document.createElement('label');
      wrapper.className = 'attendee-row';
      wrapper.setAttribute('for', id);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.dataset.name = u.name;
      cb.addEventListener('change', () => handleAttendeeChange(cb));
      const span = document.createElement('span');
      span.textContent = u.name;
      wrapper.appendChild(cb);
      wrapper.appendChild(span);
      list.appendChild(wrapper);
    });
  }

  function handleAttendeeChange(changedCb) {
    const list = document.getElementById('weights-attendees-list');
    if (changedCb.checked) {
      list.querySelectorAll('input[type=checkbox]').forEach(other => {
        if (other !== changedCb) other.checked = false;
      });
      currentName = changedCb.dataset.name;
      currentLocation = document.getElementById('weights-location').value;
      refreshList();
    } else {
      currentName = '';
      currentLocation = '';
      clearTable();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!currentName || !currentLocation) {
      showToast('請先選擇據點與學員', 'error');
      return;
    }
    const payload = {
      name: currentName,
      location: currentLocation,
      action_type: document.getElementById('weights-action').value.trim(),
      weight_kg: Number(document.getElementById('weights-kg').value),
      reps: Number(document.getElementById('weights-reps').value),
      sets: Number(document.getElementById('weights-sets').value),
    };
    try {
      await Api.addWeightRecord(payload);
      showToast('已新增重訓紀錄', 'success');
      document.getElementById('weights-action').value = '';
      // 紀錄已變更：作廢該據點快取，並在背景重新 prefetch；refreshList 會 await 新 Promise
      invalidateRecords(currentLocation);
      prefetchRecords(currentLocation);
      await refreshList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function refreshList() {
    if (!currentName || !currentLocation) return;
    const tbody = document.querySelector('#weights-table tbody');
    const reqName = currentName;
    const reqLocation = currentLocation;
    try {
      // 從據點快取過濾；快取若已落地則秒出，否則 await 同一個背景 Promise。
      const allRows = await prefetchRecords(reqLocation);
      // 期間若使用者已切換到別的學員/據點就不要覆蓋畫面
      if (reqName !== currentName || reqLocation !== currentLocation) return;
      let rows = allRows.filter(r => String(r.name) === reqName);
      // 後端尚未確認支援 location-only（如尚未重新部署）時，若 cache 為空就以
      // per-name 模式 fallback 一次，確保畫面不會誤顯示為「尚無紀錄」。
      if (!locationOnlyVerified && allRows.length === 0) {
        rows = await Api.listWeightRecords({ name: reqName, location: reqLocation });
        if (reqName !== currentName || reqLocation !== currentLocation) return;
      }
      tbody.innerHTML = '';
      if (!rows.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">尚無紀錄</td></tr>';
        return;
      }
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escapeHtml(r.train_date) + '</td>' +
          '<td>' + escapeHtml(r.action_type) + '</td>' +
          '<td>' + r.weight_kg + ' kg</td>' +
          '<td>' + r.reps + '</td>' +
          '<td>' + r.sets + '</td>' +
          '<td style="text-align:right"></td>';
        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.textContent = '刪除';
        delBtn.addEventListener('click', () => handleDelete(r.id));
        tr.lastElementChild.appendChild(delBtn);
        tbody.appendChild(tr);
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('確定要刪除這筆紀錄嗎？')) return;
    try {
      await Api.deleteWeightRecord(id);
      showToast('已刪除', 'success');
      invalidateRecords(currentLocation);
      prefetchRecords(currentLocation);
      await refreshList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function init() {
    document.getElementById('weights-form').addEventListener('submit', handleSubmit);
    document.getElementById('weights-location').addEventListener('change', handleLocationChange);
  }

  return { init, load };
})();
