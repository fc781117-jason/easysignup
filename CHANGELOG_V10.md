# V10｜Firebase 正式安全版

- 全面停用 Demo 登入，避免未設定 Firebase 時所有人被當成最高系統管理員。
- Firebase 未連線時阻止登入，並在登入頁顯示設定警示。
- 加入 Firebase Auth local persistence，重新整理後應保留登入狀態。
- 首頁非承辦人案件管理按鈕改為灰色不可按。
- Firestore Rules 強化：使用者建立資料必須符合自己的 UID/email；案件 owner 欄位不可由一般承辦人竄改。
- 系統設定顯示 Firebase 是否真的進入 Firestore 正式模式。
