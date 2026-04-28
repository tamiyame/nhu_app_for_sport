/**
 * 前端設定檔
 *
 * 部署完 Google Apps Script 後，把取得的 Web App URL 貼到 GAS_URL。
 * 格式大約是：
 *   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxx/exec
 *
 * 詳細部署步驟請看 README.md。
 */
const APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyI770HWTqEQ9IDh2b9GPHOhVeokWsldFy8zYazdV855BHLqIcag6FiO6ctduMdamx5dg/exec',
  // Google Fit OAuth Web Client ID（chinup-fitness project / nhu-sport-web client）
  // 已授權 origins: https://tamiyame.github.io、http://localhost:8765
  // OAuth 同意畫面為「測試」模式，僅 Google Cloud Console 上的測試使用者可登入
  GOOGLE_FIT_CLIENT_ID: '476050640173-mlu4tn7j4bo174ajs4dino6hke51745t.apps.googleusercontent.com',
};
