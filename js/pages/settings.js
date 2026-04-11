/**
 * 設定頁：管理據點
 */
const SettingsPage = (function () {

  let locations = [];

  async function load() {
    try {
      locations = await Api.listLocations();
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function render() {
    const tbody = document.querySelector('#settings-table tbody');
    tbody.innerHTML = '';
    if (!locations.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="2">目前沒有據點，請在上方新增</td></tr>';
      return;
    }
    locations.forEach(loc => {
      const tr = document.createElement('tr');
      const nameTd = document.createElement('td');
      nameTd.textContent = loc.name;
      const actionTd = document.createElement('td');
      actionTd.style.textAlign = 'right';
      const btn = document.createElement('button');
      btn.className = 'danger';
      btn.textContent = '刪除';
      btn.addEventListener('click', () => handleDelete(loc.name));
      actionTd.appendChild(btn);
      tr.appendChild(nameTd);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('settings-new-location');
    const name = input.value.trim();
    if (!name) return;
    try {
      await Api.addLocation(name);
      showToast('已新增據點：' + name, 'success');
      input.value = '';
      await load();
      // 其他頁面的據點下拉也要更新
      if (typeof refreshLocationSelects === 'function') refreshLocationSelects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDelete(name) {
    if (!confirm('確定要刪除據點「' + name + '」嗎？')) return;
    try {
      await Api.deleteLocation(name);
      showToast('已刪除據點：' + name, 'success');
      await load();
      if (typeof refreshLocationSelects === 'function') refreshLocationSelects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleTest() {
    const resultEl = document.getElementById('settings-test-result');
    resultEl.textContent = '測試中...';
    try {
      const data = await Api.listLocations();
      resultEl.textContent = '✓ 連線成功，目前據點數：' + data.length;
      resultEl.style.color = 'var(--success)';
    } catch (err) {
      resultEl.textContent = '✗ ' + err.message;
      resultEl.style.color = 'var(--danger)';
    }
  }

  function getLocations() {
    return locations;
  }

  function init() {
    document.getElementById('settings-form').addEventListener('submit', handleSubmit);
    document.getElementById('settings-test').addEventListener('click', handleTest);
  }

  return { init, load, getLocations };
})();
