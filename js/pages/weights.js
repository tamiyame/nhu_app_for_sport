/**
 * 重訓紀錄頁
 */
const WeightsPage = (function () {

  let currentName = '';
  let currentLocation = '';

  async function load() {
    await populateUserSelect('weights-user');
  }

  function getSelectedUser() {
    return decodeUser(document.getElementById('weights-user').value);
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
      train_date: document.getElementById('weights-date').value,
      action_type: document.getElementById('weights-action').value.trim(),
      weight_kg: Number(document.getElementById('weights-kg').value),
      reps: Number(document.getElementById('weights-reps').value),
      sets: Number(document.getElementById('weights-sets').value),
    };
    try {
      await Api.addWeightRecord(payload);
      showToast('已新增重訓紀錄', 'success');
      // 清空動作輸入，保留其他欄位方便連續輸入
      document.getElementById('weights-action').value = '';
      currentName = user.name;
      currentLocation = user.location;
      await refreshList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function refreshList() {
    if (!currentName || !currentLocation) return;
    const tbody = document.querySelector('#weights-table tbody');
    try {
      const rows = await Api.listWeightRecords({ name: currentName, location: currentLocation });
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
      await refreshList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function init() {
    document.getElementById('weights-form').addEventListener('submit', handleSubmit);
    document.getElementById('weights-load').addEventListener('click', handleLoad);
    document.getElementById('weights-date').value = todayIso();
  }

  return { init, load };
})();
