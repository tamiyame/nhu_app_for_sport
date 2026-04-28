/**
 * 設定頁：管理學員與據點，支援 .xlsx 批次匯入
 */
const SettingsPage = (function () {

  let locations = [];
  let users = [];
  let xlsxParsed = null; // { items: [{location, name}, ...], byLocation: {loc: [name, ...]} }

  async function load() {
    try {
      const [locs, us] = await Promise.all([
        Api.listLocations(),
        Api.listUsers()
      ]);
      locations = locs || [];
      users = us || [];
      renderLocationDropdown();
      renderLocationsSelect();
      renderUsersTable();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderLocationDropdown() {
    const sel = document.getElementById('settings-location');
    const previous = sel.value;
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '-- 請選擇 --';
    sel.appendChild(ph);
    locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.name;
      opt.textContent = loc.name;
      sel.appendChild(opt);
    });
    if (previous) sel.value = previous;
  }

  function renderLocationsSelect() {
    const sel = document.getElementById('settings-locations-select');
    const previous = sel.value;
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = locations.length ? '-- 請選擇 --' : '（目前沒有據點，請從上方批次匯入建立）';
    sel.appendChild(ph);
    locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.name;
      opt.textContent = loc.name;
      sel.appendChild(opt);
    });
    if (previous && locations.some(l => String(l.name) === previous)) sel.value = previous;
  }

  async function handleDeleteLocation() {
    const sel = document.getElementById('settings-locations-select');
    const name = sel.value;
    if (!name) {
      showToast('請先選擇要刪除的據點', 'error');
      return;
    }
    const userCount = users.filter(u => String(u.location) === name).length;
    const ok = confirm(
      '確定要刪除據點「' + name + '」？\n' +
      '此據點底下共 ' + userCount + ' 位學員會一併移除。\n\n' +
      '（簽到/重訓/自主訓練的歷史紀錄會保留。）'
    );
    if (!ok) return;
    try {
      const result = await Api.deleteLocation(name);
      showToast('已刪除據點「' + name + '」與其下 ' + (result.usersDeleted || 0) + ' 位學員', 'success');
      await load();
      if (typeof refreshLocationSelects === 'function') refreshLocationSelects();
      if (typeof refreshUserSelects === 'function') refreshUserSelects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderUsersTable() {
    const tbody = document.querySelector('#settings-users-table tbody');
    const actions = document.getElementById('settings-users-actions');
    tbody.innerHTML = '';
    const loc = document.getElementById('settings-location').value;
    if (!loc) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="2">請先選擇上方據點</td></tr>';
      actions.classList.add('hidden');
      return;
    }
    const list = users
      .filter(u => String(u.location) === loc)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
    if (!list.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="2">該據點尚無學員</td></tr>';
      actions.classList.add('hidden');
      return;
    }
    actions.classList.remove('hidden');
    list.forEach((u, idx) => {
      const tr = document.createElement('tr');
      const cbTd = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'settings-user-cb-' + idx;
      cb.dataset.name = u.name;
      cb.dataset.location = u.location;
      cbTd.appendChild(cb);
      const nameTd = document.createElement('td');
      const lbl = document.createElement('label');
      lbl.htmlFor = cb.id;
      lbl.textContent = u.name;
      lbl.style.cursor = 'pointer';
      lbl.style.display = 'block';
      nameTd.appendChild(lbl);
      tr.appendChild(cbTd);
      tr.appendChild(nameTd);
      tbody.appendChild(tr);
    });
  }

  function setAllUserCheckboxes(checked) {
    document.querySelectorAll('#settings-users-table tbody input[type=checkbox]')
      .forEach(cb => { cb.checked = checked; });
  }

  async function handleBulkDelete() {
    const items = Array.from(
      document.querySelectorAll('#settings-users-table tbody input[type=checkbox]:checked')
    ).map(cb => ({ name: cb.dataset.name, location: cb.dataset.location }));
    if (!items.length) {
      showToast('請先勾選要刪除的學員', 'error');
      return;
    }
    const names = items.map(i => i.name).join('、');
    const ok = confirm(
      '確定要刪除以下 ' + items.length + ' 位學員？\n' + names +
      '\n\n（過去的簽到/訓練紀錄會保留，僅將其從學員清單移除。）'
    );
    if (!ok) return;
    let succ = 0;
    const failed = [];
    for (const item of items) {
      try {
        await Api.deleteUser(item);
        succ++;
      } catch (err) {
        failed.push(item.name + '（' + err.message + '）');
      }
    }
    if (failed.length) {
      showToast('成功 ' + succ + ' 位、失敗 ' + failed.length + ' 位：\n' + failed.join('\n'), 'error');
    } else {
      showToast('已刪除 ' + succ + ' 位學員', 'success');
    }
    await load();
    if (typeof refreshUserSelects === 'function') refreshUserSelects();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const location = document.getElementById('settings-location').value;
    const nameInput = document.getElementById('settings-new-user');
    const name = nameInput.value.trim();
    if (!location) { showToast('請先選擇據點', 'error'); return; }
    if (!name) { showToast('請輸入姓名', 'error'); return; }
    try {
      const result = await Api.addUser({ name, location });
      if (result.created) {
        showToast('已新增學員：' + name + ' @ ' + location, 'success');
      } else {
        showToast(name + ' 已存在於 ' + location, 'error');
      }
      nameInput.value = '';
      await load();
      if (typeof refreshUserSelects === 'function') refreshUserSelects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ===== 批次匯入 xlsx =====

  function handleXlsxFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      showToast('xlsx 解析模組尚未載入，請重新整理頁面再試', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        parseWorkbook(wb);
      } catch (err) {
        showToast('解析 xlsx 失敗：' + err.message, 'error');
      }
    };
    reader.onerror = function () { showToast('讀檔失敗', 'error'); };
    reader.readAsArrayBuffer(file);
  }

  function parseWorkbook(wb) {
    const items = [];
    const byLocation = {};
    (wb.SheetNames || []).forEach(sheetName => {
      const location = String(sheetName).trim();
      if (!location) return;
      const ws = wb.Sheets[sheetName];
      if (!ws) return;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      const names = [];
      const seen = {};
      // 跳過第 1 列表頭
      for (let i = 1; i < rows.length; i++) {
        const cell = rows[i] && rows[i][0];
        const name = cell == null ? '' : String(cell).trim();
        if (!name || seen[name]) continue;
        seen[name] = true;
        names.push(name);
      }
      if (names.length) {
        byLocation[location] = names;
        names.forEach(n => items.push({ location, name: n }));
      }
    });
    if (!items.length) {
      showToast('xlsx 內未找到任何學員資料', 'error');
      return;
    }
    xlsxParsed = { items, byLocation };
    renderXlsxPreview();
  }

  function renderXlsxPreview() {
    const wrap = document.getElementById('settings-xlsx-preview');
    const tbody = document.getElementById('settings-xlsx-preview-body');
    tbody.innerHTML = '';
    Object.keys(xlsxParsed.byLocation).forEach(loc => {
      const names = xlsxParsed.byLocation[loc];
      const tr = document.createElement('tr');
      const tdLoc = document.createElement('td');
      tdLoc.textContent = loc;
      const tdCount = document.createElement('td');
      tdCount.textContent = names.length + ' 位';
      const tdNames = document.createElement('td');
      tdNames.textContent = names.join('、');
      tr.appendChild(tdLoc);
      tr.appendChild(tdCount);
      tr.appendChild(tdNames);
      tbody.appendChild(tr);
    });
    wrap.classList.remove('hidden');
  }

  async function handleXlsxImport(mode) {
    if (!xlsxParsed) return;
    if (mode === 'replace') {
      const locs = Object.keys(xlsxParsed.byLocation).join('、');
      const ok = confirm('將先清空以下據點的現有學員清單，再匯入新名單：\n' + locs +
        '\n\n（過去的簽到/訓練紀錄會保留，但學員清單會被重建。）\n\n確定要繼續？');
      if (!ok) return;
    }
    try {
      const result = await Api.bulkImport({ items: xlsxParsed.items, mode });
      const parts = [];
      parts.push('新增據點 ' + result.locationsAdded);
      parts.push('新增學員 ' + result.usersAdded);
      if (mode === 'replace') {
        parts.push('清除舊學員 ' + result.usersDeleted);
      } else {
        parts.push('已存在跳過 ' + result.usersSkipped);
      }
      showToast('匯入完成：' + parts.join('、'), 'success');
      cancelXlsxPreview();
      await load();
      if (typeof refreshLocationSelects === 'function') refreshLocationSelects();
      if (typeof refreshUserSelects === 'function') refreshUserSelects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function cancelXlsxPreview() {
    xlsxParsed = null;
    document.getElementById('settings-xlsx-preview').classList.add('hidden');
    document.getElementById('settings-xlsx-preview-body').innerHTML = '';
    document.getElementById('settings-xlsx-file').value = '';
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
    document.getElementById('settings-location').addEventListener('change', renderUsersTable);
    document.getElementById('settings-users-select-all').addEventListener('click', () => setAllUserCheckboxes(true));
    document.getElementById('settings-users-select-none').addEventListener('click', () => setAllUserCheckboxes(false));
    document.getElementById('settings-users-delete').addEventListener('click', handleBulkDelete);
    document.getElementById('settings-delete-location-btn').addEventListener('click', handleDeleteLocation);
    document.getElementById('settings-test').addEventListener('click', handleTest);
    document.getElementById('settings-xlsx-file').addEventListener('change', handleXlsxFile);
    document.getElementById('settings-xlsx-merge').addEventListener('click', () => handleXlsxImport('merge'));
    document.getElementById('settings-xlsx-replace').addEventListener('click', () => handleXlsxImport('replace'));
    document.getElementById('settings-xlsx-cancel').addEventListener('click', cancelXlsxPreview);
  }

  return { init, load, getLocations };
})();
