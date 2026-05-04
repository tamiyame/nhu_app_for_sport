/**
 * Google Fit 分頁
 *
 * 透過 Google Identity Services (GIS) 進行 OAuth implicit / token flow，
 * 取得 access token 後呼叫 Fit REST API（fitness.googleapis.com）
 * 讀取最近 7 天的步數與運動時間，並可寫入自主訓練表。
 *
 * 綁定機制：登入後會把 Google email 與某位「學員 + 據點」綁在後端 email_bindings 表。
 *           綁定後寫入自主訓練時不需再選學員/日期，直接以綁定學員 + 今天日期寫入。
 */
const GoogleFitPage = (function () {

  const FIT_SCOPE = 'https://www.googleapis.com/auth/fitness.activity.read';
  const STEP_DATA_TYPE = 'com.google.step_count.delta';
  // 「動作活動分鐘」聚合資料來源（移動相關）
  const ACTIVE_DATA_SOURCE = 'derived:com.google.active_minutes:com.google.android.gms:merge_active_minutes';

  let tokenClient = null;
  let accessToken = null;
  let userEmail = null;
  let weekDays = []; // [{ dateIso, dailySteps, activeMinutes }]
  let binding = null; // { email, name, location } 或 null
  let bindUsersAtLocation = []; // 綁定面板的學員快取

  function configured() {
    return typeof APP_CONFIG !== 'undefined' && !!APP_CONFIG.GOOGLE_FIT_CLIENT_ID;
  }

  function setupTokenClient() {
    if (tokenClient) return;
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: APP_CONFIG.GOOGLE_FIT_CLIENT_ID,
      scope: FIT_SCOPE + ' email profile',
      prompt: '',
      callback: handleTokenResponse,
    });
  }

  async function handleTokenResponse(resp) {
    if (resp.error) {
      showToast('授權失敗：' + resp.error, 'error');
      return;
    }
    accessToken = resp.access_token;
    try {
      const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken }
      }).then(r => r.json());
      userEmail = ui.email || '已登入';
    } catch (e) {
      userEmail = '已登入';
    }
    renderAuthState();
    // 讀取此 email 是否已綁定學員
    fetchBinding();
    try {
      await loadWeekData();
      document.getElementById('gfit-data-section').classList.remove('hidden');
      updateWriteStatus();
    } catch (err) {
      showToast('讀取 Google Fit 資料失敗：' + err.message, 'error');
    }
  }

  async function fetchBinding() {
    if (!userEmail || userEmail === '已登入') {
      binding = null;
      renderBindStatus();
      updateWriteStatus();
      return;
    }
    try {
      const b = await Api.getEmailBinding({ email: userEmail });
      binding = b || null;
    } catch (err) {
      // 後端尚未支援的話也 fallback 為未綁定
      binding = null;
    }
    renderBindStatus();
    updateWriteStatus();
  }

  function renderAuthState() {
    const label = document.getElementById('gfit-account-label');
    const signin = document.getElementById('gfit-signin-btn');
    const signout = document.getElementById('gfit-signout-btn');
    const bindBtn = document.getElementById('gfit-bind-btn');
    if (accessToken) {
      label.textContent = '已連結：' + (userEmail || '');
      signin.classList.add('hidden');
      signout.classList.remove('hidden');
      bindBtn.classList.remove('hidden');
    } else {
      label.textContent = '';
      signin.classList.remove('hidden');
      signout.classList.add('hidden');
      bindBtn.classList.add('hidden');
      closeBindPanel();
    }
  }

  function renderBindStatus() {
    const el = document.getElementById('gfit-bind-status');
    if (!accessToken) { el.textContent = ''; return; }
    if (binding && binding.name && binding.location) {
      el.textContent = '綁定學員：' + binding.name + ' @ ' + binding.location;
    } else {
      el.textContent = '尚未綁定學員。請按右上「綁定」按鈕設定。';
    }
  }

  function updateWriteStatus() {
    const el = document.getElementById('gfit-write-status');
    if (!el) return;
    if (!accessToken) { el.textContent = '尚未登入 Google。'; return; }
    if (!binding) { el.textContent = '尚未綁定學員 — 寫入會被擋下。'; return; }
    const todayIsoStr = todayIso();
    const today = weekDays.find(d => d.dateIso === todayIsoStr);
    const weekSteps = weekDays.reduce((s, d) => s + d.dailySteps, 0);
    const weekMin = weekDays.reduce((s, d) => s + d.activeMinutes, 0);
    el.textContent = '將寫入：' + binding.name + ' @ ' + binding.location +
      '；日期 ' + todayIsoStr +
      '；今日 ' + (today ? today.dailySteps : 0) + ' 步、' +
      '7 天累計 ' + weekSteps.toLocaleString() + ' 步、' + weekMin + ' 分鐘運動。';
  }

  function handleSignin() {
    if (!configured()) {
      showToast('尚未設定 Google Fit Client ID', 'error');
      return;
    }
    if (!tokenClient) setupTokenClient();
    if (!tokenClient) {
      showToast('Google 登入元件尚未載入完成，請稍候再試', 'error');
      return;
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  function handleSignout() {
    if (accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    userEmail = null;
    weekDays = [];
    binding = null;
    renderAuthState();
    renderBindStatus();
    updateWriteStatus();
    document.getElementById('gfit-data-section').classList.add('hidden');
    document.querySelector('#gfit-week-table tbody').innerHTML = '';
    document.getElementById('gfit-week-summary').textContent = '';
  }

  // ===== 綁定面板 =====
  async function openBindPanel() {
    const panel = document.getElementById('gfit-bind-panel');
    panel.classList.remove('hidden');
    // 填入據點清單
    await populateLocationSelect('gfit-bind-location', { placeholder: '-- 請選擇 --' });
    // 重置選擇
    document.getElementById('gfit-bind-location').value = '';
    document.getElementById('gfit-bind-attendees-wrap').classList.add('hidden');
    document.getElementById('gfit-bind-attendees-list').innerHTML = '';
  }

  function closeBindPanel() {
    const panel = document.getElementById('gfit-bind-panel');
    if (panel) panel.classList.add('hidden');
  }

  async function handleBindLocationChange() {
    const location = document.getElementById('gfit-bind-location').value;
    const wrap = document.getElementById('gfit-bind-attendees-wrap');
    if (!location) {
      wrap.classList.add('hidden');
      return;
    }
    try {
      await loadAllUsers();
      bindUsersAtLocation = cachedUsers
        .filter(u => String(u.location) === location)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
      renderBindAttendeeList();
      wrap.classList.remove('hidden');
    } catch (err) {
      showToast('載入學員失敗：' + err.message, 'error');
    }
  }

  function renderBindAttendeeList() {
    const list = document.getElementById('gfit-bind-attendees-list');
    const hint = document.getElementById('gfit-bind-attendees-hint');
    list.innerHTML = '';
    if (!bindUsersAtLocation.length) {
      hint.textContent = '此據點尚無學員，請到「設定」頁新增。';
      return;
    }
    hint.textContent = '此據點共 ' + bindUsersAtLocation.length + ' 位學員，請勾選一位（一次僅能選一人）：';
    bindUsersAtLocation.forEach((u, idx) => {
      const id = 'gfit-bind-attendee-' + idx;
      const wrapper = document.createElement('label');
      wrapper.className = 'attendee-row';
      wrapper.setAttribute('for', id);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.dataset.name = u.name;
      cb.addEventListener('change', () => handleBindAttendeeChange(cb));
      const span = document.createElement('span');
      span.textContent = u.name;
      wrapper.appendChild(cb);
      wrapper.appendChild(span);
      list.appendChild(wrapper);
    });
  }

  function handleBindAttendeeChange(changedCb) {
    if (!changedCb.checked) return;
    document.querySelectorAll('#gfit-bind-attendees-list input[type=checkbox]').forEach(other => {
      if (other !== changedCb) other.checked = false;
    });
  }

  async function handleBindConfirm() {
    if (!userEmail) {
      showToast('請先登入 Google', 'error');
      return;
    }
    const location = document.getElementById('gfit-bind-location').value;
    if (!location) { showToast('請先選擇據點', 'error'); return; }
    const cb = document.querySelector('#gfit-bind-attendees-list input[type=checkbox]:checked');
    if (!cb) { showToast('請勾選一位學員', 'error'); return; }
    const name = cb.dataset.name;
    try {
      const result = await Api.bindEmail({ email: userEmail, name: name, location: location });
      binding = { email: result.email, name: result.name, location: result.location };
      showToast('綁定成功：' + name + ' @ ' + location, 'success');
      closeBindPanel();
      renderBindStatus();
      updateWriteStatus();
    } catch (err) {
      showToast('綁定失敗：' + err.message, 'error');
    }
  }

  // ===== 7 天資料 =====
  async function loadWeekData() {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 0, 0);
    const start = new Date(end.getTime() - 7 * 86400000);
    const body = {
      aggregateBy: [
        { dataTypeName: STEP_DATA_TYPE },
        { dataSourceId: ACTIVE_DATA_SOURCE }
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: start.getTime(),
      endTimeMillis: end.getTime()
    };
    const res = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('HTTP ' + res.status + '：' + text.slice(0, 200));
    }
    const json = await res.json();
    weekDays = (json.bucket || []).map(b => {
      const d = new Date(Number(b.startTimeMillis));
      const dateIso = formatIso(d);
      let steps = 0;
      let minutes = 0;
      (b.dataset || []).forEach(ds => {
        (ds.point || []).forEach(p => {
          (p.value || []).forEach(v => {
            if (typeof v.intVal === 'number') {
              if (ds.dataSourceId && ds.dataSourceId.indexOf('active_minutes') !== -1) {
                minutes += v.intVal;
              } else {
                steps += v.intVal;
              }
            }
          });
        });
      });
      return { dateIso, dailySteps: steps, activeMinutes: minutes };
    });
    renderWeekTable();
  }

  function formatIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function renderWeekTable() {
    const tbody = document.querySelector('#gfit-week-table tbody');
    tbody.innerHTML = '';
    if (!weekDays.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="3">查無資料</td></tr>';
      return;
    }
    let totalSteps = 0;
    let totalMinutes = 0;
    weekDays.slice().sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1)).forEach(d => {
      totalSteps += d.dailySteps;
      totalMinutes += d.activeMinutes;
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + d.dateIso + '</td>' +
        '<td>' + d.dailySteps.toLocaleString() + '</td>' +
        '<td>' + d.activeMinutes + '</td>';
      tbody.appendChild(tr);
    });
    document.getElementById('gfit-week-summary').textContent =
      '本週合計：' + totalSteps.toLocaleString() + ' 步、' + totalMinutes + ' 分鐘運動時間';
  }

  // ===== 寫入 =====
  async function handleWriteSubmit(e) {
    e.preventDefault();
    if (!accessToken) { showToast('請先登入 Google', 'error'); return; }
    if (!binding || !binding.name || !binding.location) {
      showToast('尚未綁定學員，請先按「綁定」', 'error');
      return;
    }
    // 用今天的 daily steps（若沒有則 0），週累計直接加總 7 天
    const todayIsoStr = todayIso();
    const today = weekDays.find(d => d.dateIso === todayIsoStr);
    const weekTotalSteps = weekDays.reduce((s, d) => s + d.dailySteps, 0);
    const weekTotalMinutes = weekDays.reduce((s, d) => s + d.activeMinutes, 0);
    try {
      await Api.addSelfRecord({
        name: binding.name,
        location: binding.location,
        // train_date 不傳：後端會自動以當天日期寫入
        daily_steps: today ? today.dailySteps : 0,
        weekly_steps: weekTotalSteps,
        weekly_exercise_minutes: weekTotalMinutes,
      });
      showToast('已寫入自主訓練（' + todayIsoStr + '）', 'success');
    } catch (err) {
      showToast('寫入失敗：' + err.message, 'error');
    }
  }

  async function load() {
    if (!configured()) {
      document.getElementById('gfit-config-warning').classList.remove('hidden');
      return;
    }
    document.getElementById('gfit-config-warning').classList.add('hidden');
    setupTokenClient();
    renderAuthState();
    renderBindStatus();
    updateWriteStatus();
  }

  function init() {
    document.getElementById('gfit-signin-btn').addEventListener('click', handleSignin);
    document.getElementById('gfit-signout-btn').addEventListener('click', handleSignout);
    document.getElementById('gfit-bind-btn').addEventListener('click', openBindPanel);
    document.getElementById('gfit-bind-cancel').addEventListener('click', closeBindPanel);
    document.getElementById('gfit-bind-confirm').addEventListener('click', handleBindConfirm);
    document.getElementById('gfit-bind-location').addEventListener('change', handleBindLocationChange);
    document.getElementById('gfit-write-form').addEventListener('submit', handleWriteSubmit);
  }

  return { init, load };
})();
