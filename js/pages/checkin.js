/**
 * 簽到頁
 */
const CheckinPage = (function () {

  async function load() {
    await populateLocationSelect('checkin-location');
    await populateUserSelect('checkin-user', { includeNewOption: true });
  }

  // 使用者下拉變動 → 自動填入姓名與據點
  function handleUserChange() {
    const val = document.getElementById('checkin-user').value;
    const user = decodeUser(val);
    if (user) {
      document.getElementById('checkin-name').value = user.name;
      document.getElementById('checkin-location').value = user.location;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const location = document.getElementById('checkin-location').value;
    const name = document.getElementById('checkin-name').value.trim();
    // 送出時強制重新取今天日期（避免頁面開了一晚日期還停在昨天）
    const dateEl = document.getElementById('checkin-date');
    const today = todayIso();
    dateEl.value = today;
    dateEl.min = today;
    dateEl.max = today;
    const date = today;
    if (!location) {
      showToast('請先到「設定」新增據點', 'error');
      return;
    }
    if (!name) {
      showToast('請輸入姓名', 'error');
      return;
    }
    try {
      await Api.checkIn({ name, location, date });
      showToast('簽到成功：' + name + ' @ ' + location, 'success');
      await refreshList(name, location);
      // 新簽到可能帶來新使用者，刷新所有下拉
      await refreshUserSelects();
      // 保留剛才的選擇方便連續簽到
      document.getElementById('checkin-user').value = name + '|' + location;
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function refreshList(name, location) {
    const tbody = document.querySelector('#checkin-table tbody');
    try {
      const rows = await Api.listCheckIns({ name, location, limit: 10 });
      tbody.innerHTML = '';
      if (!rows.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="3">尚無紀錄</td></tr>';
        return;
      }
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escapeHtml(r.check_date) + '</td>' +
          '<td>' + escapeHtml(r.name) + '</td>' +
          '<td>' + escapeHtml(r.location) + '</td>';
        tbody.appendChild(tr);
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ===== 簽到查詢 =====
  let lastQueryName = '';

  async function handleQuery() {
    const name = document.getElementById('checkin-name').value.trim();
    if (!name) {
      showToast('請先輸入姓名再查詢', 'error');
      return;
    }
    try {
      const rows = await Api.listCheckInsByName(name);
      lastQueryName = name;
      renderQueryResults(name, rows);
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
    document.getElementById('checkin-user').addEventListener('change', handleUserChange);
    document.getElementById('checkin-query-btn').addEventListener('click', handleQuery);
    // 鎖定日期欄位只能是今天，禁止補簽或預簽
    const dateEl = document.getElementById('checkin-date');
    const today = todayIso();
    dateEl.value = today;
    dateEl.min = today;
    dateEl.max = today;
    dateEl.readOnly = true;
  }

  return { init, load };
})();
