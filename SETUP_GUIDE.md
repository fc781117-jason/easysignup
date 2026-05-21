# 消防局多功能報名系統 V4｜平台建置操作手冊

## 你需要記錄的資料清單

| 順序 | 平台 | 需要記錄的資料 | 貼到哪裡 |
|---:|---|---|---|
| 1 | Firebase | `apiKey` | `firebase-config.js` |
| 2 | Firebase | `authDomain` | `firebase-config.js` |
| 3 | Firebase | `projectId` | `firebase-config.js` |
| 4 | Firebase | `storageBucket` | `firebase-config.js` |
| 5 | Firebase | `messagingSenderId` | `firebase-config.js` |
| 6 | Firebase | `appId` | `firebase-config.js` |
| 7 | Google Cloud | OAuth 2.0 Client ID | `firebase-config.js` 的 `googleOAuthClientId` |
| 8 | Vercel | 部署網址，例如 `https://xxx.vercel.app` | Firebase Authorized domains / Google OAuth JavaScript origins |
| 9 | Apps Script | Web App URL | 每個案件的「承辦人 Apps Script 上傳網址」 |

---

## 第一階段：建立 GitHub Repo

1. 打開 GitHub。
2. 右上角按 `+`。
3. 選 `New repository`。
4. Repository name 建議填：`fire-registration-app-v3`。
5. Visibility 可選 `Private`。
6. 按 `Create repository`。
7. 進入 repo 後，點 `uploading an existing file`。
8. 將本專案所有檔案拖曳上傳：
   - `index.html`
   - `styles.css`
   - `app.js`
   - `firebase-config.js`
   - `firestore.rules`
   - `apps-script-upload.js`
   - `README.md`
   - `SETUP_GUIDE.md`
9. 下方 Commit message 可填：`init fire registration app v2`。
10. 按 `Commit changes`。

---

## 第二階段：建立 Firebase 專案

1. 打開 Firebase Console。
2. 按 `Add project` 或 `新增專案`。
3. 專案名稱建議：`fire-registration-app-v3`。
4. Google Analytics 可先關閉，因為第一版不需要。
5. 按 `Create project`。
6. 專案建立後，進入 Project Overview。

### 2-1 註冊 Web App

1. 在 Project Overview 中間找到 `</>` Web 圖示。
2. 點進去。
3. App nickname 填：`fire-registration-web`。
4. 不需要勾 Firebase Hosting。
5. 按 `Register app`。
6. 看到 Firebase SDK config 後，複製以下內容：
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
7. 回到 GitHub，打開 `firebase-config.js`。
8. 按右上角鉛筆圖示編輯。
9. 把 `PASTE_...` 的內容替換成剛剛複製的 Firebase 設定。
10. 按 `Commit changes`。

---

## 第三階段：啟用 Firebase Authentication

1. Firebase 左側選單找到 `Build`。
2. 點 `Authentication`。
3. 按 `Get started`。
4. 進入 `Sign-in method`。
5. 找到 `Google`。
6. 點進去後，把 Enable 打開。
7. Project support email 選你的 Gmail。
8. 按 `Save`。

---

## 第四階段：建立 Firestore Database

1. Firebase 左側選單找到 `Build`。
2. 點 `Firestore Database`。
3. 按 `Create database`。
4. Security rules 建議先選 `Start in production mode`。
5. Location 選離台灣近的區域。若看得到 `asia-east1` 可優先選。
6. 按 `Enable`。

### 4-1 貼上 Firestore Rules

1. 進入 Firestore Database。
2. 上方分頁點 `Rules`。
3. 打開本專案的 `firestore.rules`。
4. 全部複製，貼到 Rules 編輯區。
5. 按 `Publish`。

---

## 第五階段：建立 Google OAuth Client ID

1. 打開 Google Cloud Console。
2. 確認上方專案是剛剛 Firebase 建立的同一個專案。
3. 左側選單點 `APIs & Services`。
4. 點 `Library`。
5. 搜尋 `Google Drive API`。
6. 點進去後按 `Enable`。

### 5-1 設定 OAuth Consent Screen

1. 左側選單點 `APIs & Services`。
2. 點 `OAuth consent screen`。
3. 因為本案會混用私人 Gmail，Audience / User Type 請選 `External`。
4. App name 可填：`消防局多功能報名系統`。
5. User support email 選你的 Gmail。
6. Developer contact information 填你的 Gmail。
7. Scopes 加入：
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`
8. 如果目前處於 Testing，請在 Test users 加入會測試的 Gmail。

### 5-2 建立 OAuth Client ID

1. 左側選單點 `Credentials`。
2. 上方按 `Create Credentials`。
3. 選 `OAuth client ID`。
4. Application type 選 `Web application`。
5. Name 填：`fire-registration-web-client`。
6. Authorized JavaScript origins 先加入：
   - `http://localhost:5173`（可選）
   - 等 Vercel 部署完成後，再回來加入 `https://你的專案.vercel.app`
7. Authorized redirect URIs 本案可先不填。
8. 按 `Create`。
9. 複製 `Client ID`。
10. 回 GitHub 編輯 `firebase-config.js`，貼到：
    `googleOAuthClientId: '你的ClientID.apps.googleusercontent.com'`
11. Commit changes。

---

## 第六階段：部署到 Vercel

1. 打開 Vercel。
2. 用 GitHub 帳號登入。
3. 右上角按 `Add New...`。
4. 選 `Project`。
5. 在 Import Git Repository 找到 `fire-registration-app-v3`。
6. 按 `Import`。
7. Framework Preset 選 `Other` 或保持 Auto Detect。
8. Build Command 留空。
9. Output Directory 留空。
10. 按 `Deploy`。
11. 部署完成後，複製 Vercel 網址，例如：
    `https://fire-registration-app-v3.vercel.app`

### 6-1 把 Vercel 網址加入 Firebase Authorized Domains

1. 回 Firebase Console。
2. 左側點 `Authentication`。
3. 點 `Settings`。
4. 找到 `Authorized domains`。
5. 按 `Add domain`。
6. 貼上你的 Vercel 網域，不要含 `https://`，例如：
   `fire-registration-app-v3.vercel.app`
7. Save。

### 6-2 把 Vercel 網址加入 Google OAuth Origins

1. 回 Google Cloud Console。
2. 左側點 `APIs & Services`。
3. 點 `Credentials`。
4. 點剛剛建立的 OAuth Client。
5. 在 Authorized JavaScript origins 按 `Add URI`。
6. 貼上完整網址，例如：
   `https://fire-registration-app-v3.vercel.app`
7. 按 `Save`。

---

## 第七階段：承辦人 Google Drive 附件端點

若你要做到「附件進入承辦人自己的 Google Drive」，每位承辦人需要建立一次 Apps Script 上傳端點。

1. 承辦人打開 Google Apps Script。
2. 按 `New project`。
3. 專案名稱可改成：`消防局報名系統附件上傳`。
4. 刪除原本內容。
5. 打開本專案 `apps-script-upload.js`。
6. 全部複製並貼上。
7. 按上方磁碟圖示儲存。
8. 右上角按 `Deploy`。
9. 選 `New deployment`。
10. 齒輪圖示選 `Web app`。
11. Description 填：`fire registration upload endpoint`。
12. Execute as 選：`Me`。
13. Who has access 選：`Anyone with Google account`。
14. 按 `Deploy`。
15. 第一次會要求授權，照畫面允許 Drive 存取。
16. 複製 Web App URL。
17. 回報名系統新增案件時，貼到「承辦人 Apps Script 上傳網址」。

---

## 第八階段：驗收流程

1. 打開 Vercel 網址。
2. 用 `fc781117@gmail.com` 登入。
3. 到 `新增 / 編輯案件`。
4. 建立一個內部案件。
5. 設定：
   - 停車位數：2
   - 年齡統計：每 5 歲一組
   - 附件：可選擇上傳
6. 發布案件。
7. 到 `報名填寫` 送出 3 筆報名，其中 3 筆都選需要停車。
8. 檢查停車序位是否為：
   - 正取第 1 車位
   - 正取第 2 車位
   - 候補第 1 位
9. 到 `名冊與統計輸出`。
10. 測試匯出：
    - Excel 名冊
    - PDF 簽到表
    - PDF 餐食簽收表
    - PDF 統計報告



## V4 PDF 輸出修正

- 修正 PDF 畫布隱藏導致無法產生 PDF 的問題。
- PDF 產出支援桌機下載與手機預覽。
- 若 PDF 套件載入失敗，會開啟列印／另存 PDF 的備援預覽頁。


## V6 重要補充：Firestore Rules 必須同步更新

V6 新增「使用者審核」與「案件建立者才可管理」機制，請務必到 Firebase Console → Firestore Database → Rules，貼上本資料夾內 `firestore.rules` 的完整內容並 Publish。若沒有更新 Rules，前端雖會限制操作，但資料庫層仍可能沿用舊權限。
