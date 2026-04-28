/**
 * Google Fit 分頁
 *
 * 透過 Google Identity Services (GIS) 進行 OAuth implicit / token flow，
 * 取得 access token 後呼叫 Fit REST API（fitness.googleapis.com）
 * 讀取最近 7 天的步數與運動時間，並可寫入自主訓練表。
 *
 * 注意：fitness.activity.read 為「受限制範圍」，OAuth 同意畫面為測試模式時，
 *       僅 Google Cloud Console 列入測試使用者的 Google 帳號可登入。
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
      // 拿 email（用 token 呼叫 userinfo）
      const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken }
      }).then(r => r.json());
      userEmail = ui.email || '已登入';
    } catch (e) {
      userEmail = '已登入';
    }
    renderAuthState();
    try {
      await loadWeekData();
      populateDaySelect();
      document.getElementById('gfit-data-section').classList.remove('hidden');
    } catch (err) {
      showToast('讀取 Google Fit 資料失敗：' + err.message, 'error');
    }
  }

  function renderAuthState() {
    const label = document.getElementById('gfit-account-label');
    const signin = document.getElementById('gfit-signin-btn');
    const signout = document.getElementById('gfit-signout-btn');
    if (accessToken) {
      label.textContent = '已連結：' + (userEmail || '');
      signin.classList.add('hidden');
      signout.classList.remove('hidden');
    } else {
      label.textContent = '';
      signin.classList.remove('hidden');
      signout.classList.add('hidden');
    }
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
    renderAuthState();
    document.getElementById('gfit-data-section').classList.add('hidden');
    document.querySelector('#gfit-week-table tbody').innerHTML = '';
    document.getElementById('gfit-week-summary').textContent = '';
  }

  // 取最近 7 天（含今天）的步數與活動分鐘
  async function loadWeekData() {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 0, 0); // 明天 00:00（exclusive）
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

  function populateDaySelect() {
    const sel = document.getElementById('gfit-write-day');
    const previous = sel.value;
    sel.innerHTML = '<option value="">-- 請選擇 --</option>';
    weekDays.slice().sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1)).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.dateIso;
      opt.textContent = d.dateIso + '（' + d.dailySteps + ' 步、' + d.activeMinutes + ' 分鐘）';
      sel.appendChild(opt);
    });
    if (previous) sel.value = previous;
  }

  async function handleWriteSubmit(e) {
    e.preventDefault();
    if (!accessToken) { showToast('請先登入 Google', 'error'); return; }
    const userVal = document.getElementById('gfit-write-user').value;
    const dateIso = document.getElementById('gfit-write-day').value;
    if (!userVal) { showToast('請選擇學員', 'error'); return; }
    if (!dateIso) { showToast('請選擇日期', 'error'); return; }
    const u = decodeUser(userVal);
    if (!u) { showToast('學員資料解析失敗', 'error'); return; }
    const day = weekDays.find(d => d.dateIso === dateIso);
    if (!day) { showToast('找不到對應日期的資料', 'error'); return; }
    // 同時計算近 7 天的累計（直接寫入 weekly_steps / weekly_exercise_minutes）
    const weekTotalSteps = weekDays.reduce((s, d) => s + d.dailySteps, 0);
    const weekTotalMinutes = weekDays.reduce((s, d) => s + d.activeMinutes, 0);
    try {
      await Api.addSelfRecord({
        name: u.name,
        location: u.location,
        train_date: dateIso,
        daily_steps: day.dailySteps,
        weekly_steps: weekTotalSteps,
        weekly_exercise_minutes: weekTotalMinutes,
      });
      showToast('已寫入自主訓練（' + dateIso + '）', 'success');
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
    // 切到此頁時刷新一下使用者下拉
    await populateUserSelect('gfit-write-user');
    renderAuthState();
  }

  function init() {
    document.getElementById('gfit-signin-btn').addEventListener('click', handleSignin);
    document.getElementById('gfit-signout-btn').addEventListener('click', handleSignout);
    document.getElementById('gfit-write-form').addEventListener('submit', handleWriteSubmit);
  }

  return { init, load };
})();
