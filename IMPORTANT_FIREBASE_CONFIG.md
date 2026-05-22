# 重要：不要讓新版檔案覆蓋正式 firebase-config.js

V10 已停用 Demo 登入。正式系統必須依賴 GitHub 專案根目錄的 `firebase-config.js`。

如果登入頁出現「Firebase 尚未正確連線」，通常代表：

1. `firebase-config.js` 還是 PASTE_FIREBASE_API_KEY_HERE 這種範本值；或
2. 上傳新版時把正式設定檔覆蓋成範本；或
3. Firebase Web App config 的 projectId/authDomain/apiKey/appId 填錯。

請到 Firebase Console → Project settings → General → Your apps → Web app config 複製設定，貼回 GitHub 的 `firebase-config.js`。

本 V10 zip 不放正式 `firebase-config.js`，只放 `firebase-config.example.js`，避免再次覆蓋你的正式設定。
