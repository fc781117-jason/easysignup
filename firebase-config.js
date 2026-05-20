// 消防局多功能報名系統 V1 設定檔
// 1) Firebase 設定值：Firebase Console → 專案設定 → 一般 → 您的應用程式 → SDK setup and configuration → Config
// 2) Google OAuth Client ID：Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
// 注意：Firebase apiKey 在前端是公開識別碼，不等於資料庫密碼；真正的資料安全靠 Firestore Rules。

window.APP_CONFIG = {
  systemAdminEmail: 'fc781117@gmail.com',
  defaultAgencyName: '新北市政府消防局',
  defaultSerialPrefix: 'NTP-FIRE',

  // 是否允許尚未完成雲端設定時使用 localStorage Demo 模式。
  // 正式部署後建議改為 false。
  allowDemoMode: true,

  firebaseConfig: {
    apiKey: "AIzaSyC-MOTqAX2BMqKgOHGuyUAtSCFx-E5DCGI",
  authDomain: "easysignup-59036.firebaseapp.com",
  projectId: "easysignup-59036",
  storageBucket: "easysignup-59036.firebasestorage.app",
  messagingSenderId: "809543820672",
  appId: "1:809543820672:web:bcb7eb1fba809f73ca8d65"
  },

  // Google Drive API 附件上傳使用。必須是「Web application」OAuth Client ID。
  googleOAuthClientId: 'PASTE_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com'
};
