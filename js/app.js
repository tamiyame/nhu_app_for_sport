/**
 * 主控制器：分頁切換、共用工具、啟動邏輯
 */

// ===== 共用工具（前面頁面模組會用到） =====

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

// 把目前的 locations 填到指定的 <select> 內
// options: { placeholder: string }
async function populateLocationSelect(selectId, options) {
  const el = document.getElementById(selectId);
  if (!el) return;
  options = options || {};
  const previous = el.value;
  let locations = SettingsPage.getLocations();
  if (!locations || !locations.length) {
    try {
      await SettingsPage.load();
      locations = SettingsPage.getLocations();
    } catch (e) {
      // 讀失敗就維持空選單
    }
  }
  el.innerHTML = '';
  if (!locations || !locations.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '（尚無據點，請到設定頁新增）';
    el.appendChild(opt);
    return;
  }
  if (options.placeholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = options.placeholder;
    el.appendChild(opt);
  }
  locations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.name;
    opt.textContent = loc.name;
    el.appendChild(opt);
  });
  if (previous) el.value = previous;
}

// 設定頁新增/刪除據點後呼叫這個，更新所有分頁的下拉
function refreshLocationSelects() {
  populateLocationSelect('checkin-location', { placeholder: '-- 請選擇 --' });
  populateLocationSelect('weights-location', { placeholder: '-- 請選擇 --' });
}

// ========== 使用者清單快取 ==========
let cachedUsers = [];

async function loadAllUsers(force) {
  if (force || !cachedUsers.length) {
    try {
      cachedUsers = await Api.listUsers();
    } catch (e) {
      cachedUsers = [];
    }
  }
  return cachedUsers;
}

function encodeUser(u) { return u.name + '|' + u.location; }
function decodeUser(val) {
  if (!val) return null;
  const idx = val.indexOf('|');
  if (idx < 0) return null;
  return { name: val.slice(0, idx), location: val.slice(idx + 1) };
}

// 把 cachedUsers 填到 <select> 裡
// options: { placeholder: string, includeNewOption: boolean }
async function populateUserSelect(selectId, options) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const previous = el.value;
  options = options || {};
  await loadAllUsers();
  el.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = options.placeholder ||
    (options.includeNewOption ? '-- 新使用者（請填下方姓名） --' : '-- 請選擇 --');
  el.appendChild(placeholder);
  cachedUsers.forEach(u => {
    const opt = document.createElement('option');
    opt.value = encodeUser(u);
    opt.textContent = u.name + ' @ ' + u.location;
    el.appendChild(opt);
  });
  if (previous) el.value = previous;
}

// 有新增/刪除使用者時呼叫，重新載入並更新所有下拉
async function refreshUserSelects() {
  await loadAllUsers(true);
  populateUserSelect('self-user');
}

// ===== 分頁切換 =====

const PAGE_LOADERS = {
  checkin:   () => CheckinPage.load(),
  weights:   () => WeightsPage.load(),
  self:      () => SelfPage.load(),
  googlefit: () => GoogleFitPage.load(),
  settings:  () => SettingsPage.load(),
};

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === 'tab-' + tabName);
  });
  const loader = PAGE_LOADERS[tabName];
  if (loader) loader();
}

// ===== 啟動 =====
document.addEventListener('DOMContentLoaded', function () {
  // 設定檔警告
  if (!isConfigured()) {
    document.getElementById('config-warning').classList.remove('hidden');
  }

  // 各頁模組 init（綁事件、填預設值）
  SettingsPage.init();
  CheckinPage.init();
  WeightsPage.init();
  SelfPage.init();
  GoogleFitPage.init();

  // 分頁 nav 事件
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 預先載入據點清單與使用者清單（之後其他頁面就有快取可用）
  if (isConfigured()) {
    Promise.all([
      SettingsPage.load(),
      loadAllUsers(true),
    ]).then(() => {
      // 首頁是簽到頁，填入據點下拉
      populateLocationSelect('checkin-location', { placeholder: '-- 請選擇 --' });
    }).catch(err => {
      showToast('載入資料失敗：' + err.message, 'error');
    });
  }
});
