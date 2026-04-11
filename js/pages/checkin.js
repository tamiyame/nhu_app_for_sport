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
    const date = document.getElementById('checkin-date').value;
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

  function init() {
    document.getElementById('checkin-form').addEventListener('submit', handleSubmit);
    document.getElementById('checkin-user').addEventListener('change', handleUserChange);
    document.getElementById('checkin-date').value = todayIso();
  }

  return { init, load };
})();
