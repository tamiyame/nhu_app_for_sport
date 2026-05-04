/**
 * 自主訓練頁
 *
 * 流程（與簽到/重訓頁一致）：
 *   1. 選擇據點
 *   2. 系統載入該據點所有學員，以核取方塊呈現
 *   3. 一次只能勾選一位學員（單選），勾選後自動載入該學員紀錄
 */
const SelfPage = (function () {

  let usersAtLocation = [];
  let currentName = '';
  let currentLocation = '';

  async function load() {
    await populateLocationSelect('self-location', { placeholder: '-- 請選擇 --' });
    const wrap = document.getElementById('self-attendees-wrap');
    wrap.classList.add('hidden');
    document.getElementById('self-attendees-list').innerHTML = '';
    currentName = '';
    currentLocation = '';
    clearTable();
    // 進分頁時在背景刷新一次學員快取，讓之後選據點時可直接用快取秒出
    loadAllUsers(true).catch(() => {});
  }

  function clearTable() {
    const tbody = document.querySelector('#self-table tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">尚無紀錄</td></tr>';
  }

  async function handleLocationChange() {
    const location = document.getElementById('self-location').value;
    const wrap = document.getElementById('self-attendees-wrap');
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
    } catch (err) {
      showToast('載入學員失敗：' + err.message, 'error');
    }
  }

  function renderAttendeeList() {
    const list = document.getElementById('self-attendees-list');
    const hint = document.getElementById('self-attendees-hint');
    list.innerHTML = '';
    if (!usersAtLocation.length) {
      hint.textContent = '此據點尚無學員，請到「設定」頁新增。';
      return;
    }
    hint.textContent = '此據點共 ' + usersAtLocation.length + ' 位學員，請勾選一位（一次僅能選一人）：';
    usersAtLocation.forEach((u, idx) => {
      const id = 'self-attendee-' + idx;
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
    const list = document.getElementById('self-attendees-list');
    if (changedCb.checked) {
      list.querySelectorAll('input[type=checkbox]').forEach(other => {
        if (other !== changedCb) other.checked = false;
      });
      currentName = changedCb.dataset.name;
      currentLocation = document.getElementById('self-location').value;
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
      daily_steps: Number(document.getElementById('self-daily-steps').value || 0),
      weekly_steps: Number(document.getElementById('self-weekly-steps').value || 0),
      weekly_exercise_minutes: Number(document.getElementById('self-weekly-min').value || 0),
    };
    try {
      await Api.addSelfRecord(payload);
      showToast('已新增自主訓練紀錄', 'success');
      await refreshList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function refreshList() {
    if (!currentName || !currentLocation) return;
    const tbody = document.querySelector('#self-table tbody');
    try {
      const rows = await Api.listSelfRecords({ name: currentName, location: currentLocation });
      tbody.innerHTML = '';
      if (!rows.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">尚無紀錄</td></tr>';
        return;
      }
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escapeHtml(r.train_date) + '</td>' +
          '<td>' + r.daily_steps + '</td>' +
          '<td>' + r.weekly_steps + '</td>' +
          '<td>' + r.weekly_exercise_minutes + '</td>' +
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
      await Api.deleteSelfRecord(id);
      showToast('已刪除', 'success');
      await refreshList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function init() {
    document.getElementById('self-form').addEventListener('submit', handleSubmit);
    document.getElementById('self-location').addEventListener('change', handleLocationChange);
  }

  return { init, load };
})();
