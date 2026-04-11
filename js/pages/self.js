/**
 * 自主訓練頁
 */
const SelfPage = (function () {

  let currentName = '';
  let currentLocation = '';

  async function load() {
    await populateUserSelect('self-user');
  }

  function getSelectedUser() {
    return decodeUser(document.getElementById('self-user').value);
  }

  async function handleLoad() {
    const user = getSelectedUser();
    if (!user) {
      showToast('請先選擇使用者', 'error');
      return;
    }
    currentName = user.name;
    currentLocation = user.location;
    await refreshList();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const user = getSelectedUser();
    if (!user) {
      showToast('請先選擇使用者', 'error');
      return;
    }
    const payload = {
      name: user.name,
      location: user.location,
      train_date: document.getElementById('self-date').value,
      daily_steps: Number(document.getElementById('self-daily-steps').value || 0),
      weekly_steps: Number(document.getElementById('self-weekly-steps').value || 0),
      weekly_exercise_minutes: Number(document.getElementById('self-weekly-min').value || 0),
    };
    try {
      await Api.addSelfRecord(payload);
      showToast('已新增自主訓練紀錄', 'success');
      currentName = user.name;
      currentLocation = user.location;
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
    document.getElementById('self-load').addEventListener('click', handleLoad);
    document.getElementById('self-date').value = todayIso();
  }

  return { init, load };
})();
