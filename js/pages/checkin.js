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
  let lastQueryName = '';

  async function load() {
    await populateLocationSelect('checkin-location', { placeholder: '-- 請選擇 --' });
    // 重置畫面
    const wrap = document.getElementById('checkin-attendees-wrap');
    wrap.classList.add('hidden');
    document.getElementById('checkin-attendees-list').innerHTML = '';
    document.getElementById('checkin-new-names').value = '';
  }

  // 據點變動 → 載入該據點的學員清單
  async function handleLocationChange() {
    const location = document.getElementById('checkin-location').value;
    const wrap = document.getElementById('checkin-attendees-wrap');
    if (!location) {
      wrap.classList.add('hidden');
      return;
    }
    try {
      await loadAllUsers(true);
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
    const list = document.getElementById('checkin-attendees-list');
    const hint = document.getElementById('checkin-attendees-hint');
    list.innerHTML = '';
    if (!usersAtLocation.length) {
      hint.textContent = '此據點尚無學員，請在下方「新增其他學員」輸入新姓名。';
      return;
    }
    hint.textContent = '此據點共 ' + usersAtLocation.length + ' 位學員，請勾選今日出席者：';
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
      wrapper.appendChild(cb);
      wrapper.appendChild(span);
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
    // 收集勾選的學員 + 新增的其他學員
    const checked = Array.from(document.querySelectorAll(
      '#checkin-attendees-list input[type=checkbox]:checked'
    )).map(cb => cb.dataset.name);
    const newNames = parseNewNames(document.getElementById('checkin-new-names').value);
    // 去重（保留順序）
    const seen = new Set();
    const allNames = [...checked, ...newNames].filter(n => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
    if (!allNames.length) {
      showToast('請勾選至少一位學員或輸入新學員姓名', 'error');
      return;
    }
    // 依序送出簽到（後端有當日重複檢查 + 僅限今日驗證）
    const results = [];
    for (const name of allNames) {
      try {
        await Api.checkIn({ name, location });
        results.push({ name, ok: true });
      } catch (err) {
        results.push({ name, ok: false, error: err.message });
      }
    }
    // 顯示結果
    const succ = results.filter(r => r.ok);
    const fail = results.filter(r => !r.ok);
    let msg = '✓ 成功 ' + succ.length + ' 位';
    if (succ.length) msg += '：' + succ.map(r => r.name).join('、');
    if (fail.length) {
      msg += '\n✗ 失敗 ' + fail.length + ' 位：' +
        fail.map(r => r.name + '（' + r.error + '）').join('、');
    }
    showToast(msg, fail.length && !succ.length ? 'error' : 'success');
    // 清空新增姓名欄並重新載入清單（剛新增的學員會出現在下次的勾選列表）
    document.getElementById('checkin-new-names').value = '';
    await loadAllUsers(true);
    usersAtLocation = cachedUsers
      .filter(u => String(u.location) === location)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
    renderAttendeeList();
    // 也通知其他頁面的使用者下拉刷新
    if (typeof refreshUserSelects === 'function') refreshUserSelects();
  }

  // ===== 簽到查詢（用 prompt 問姓名） =====
  async function handleQuery() {
    const name = window.prompt('輸入姓名查詢簽到紀錄（跨所有據點）：');
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('請輸入姓名', 'error');
      return;
    }
    try {
      const rows = await Api.listCheckInsByName(trimmed);
      lastQueryName = trimmed;
      renderQueryResults(trimmed, rows);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderQueryResults(name, rows) {
    const section = document.getElementById('checkin-query-section');
    const label = document.getElementById('checkin-query-name-label');
    const tbody = document.querySelector('#checkin-query-table tbody');
    label.textContent = name;
    section.classList.remove('hidden');
    tbody.innerHTML = '';
    if (!rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">查無紀錄</td></tr>';
      return;
    }
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(r.check_date) + '</td>' +
        '<td>' + escapeHtml(r.name) + '</td>' +
        '<td>' + escapeHtml(r.location) + '</td>' +
        '<td style="text-align:right"></td>';
      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.textContent = '刪除';
      delBtn.addEventListener('click', () => handleQueryDelete(r.id));
      tr.lastElementChild.appendChild(delBtn);
      tbody.appendChild(tr);
    });
  }

  async function handleQueryDelete(id) {
    if (!confirm('確定要刪除這筆簽到紀錄嗎？')) return;
    try {
      await Api.deleteCheckIn(id);
      showToast('已刪除', 'success');
      if (lastQueryName) {
        const rows = await Api.listCheckInsByName(lastQueryName);
        renderQueryResults(lastQueryName, rows);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function init() {
    document.getElementById('checkin-form').addEventListener('submit', handleSubmit);
    document.getElementById('checkin-location').addEventListener('change', handleLocationChange);
    document.getElementById('checkin-query-btn').addEventListener('click', handleQuery);
  }

  return { init, load };
})();
