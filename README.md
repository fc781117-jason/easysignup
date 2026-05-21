# 消防局多功能報名系統 V4

這是一個可直接部署到 Vercel 的靜態網頁版 App，使用 Firebase Authentication / Firestore 作為登入與資料庫，並支援 PDF、Excel、簽到表、餐食簽收表輸出。

## 內建需求

- 系統管理員固定：`fc781117@gmail.com`
- 案件類型：訓練報名、講習報名、會議報名、甄選報名
- 內部報名欄位：姓名、電話、Email、性別、年齡、單位類型、單位、分隊/科室、內外勤、職稱、停車需求、餐食、備註
- 外部報名欄位：姓名、電話、Email、性別、年齡、停車需求、餐食、備註
- 性別：男 / 女，不提供「不便透露」
- 年齡統計：每 5 歲一組，或由承辦人自訂區間
- 停車：承辦人設定車位數，採先搶先贏，自動標示正取或候補序位
- 匯出：PDF 報名表、PDF 簽到表、PDF 餐食簽收表、PDF 統計報告、Excel 名冊
- 附件：支援 Google Drive API 或承辦人 Apps Script 端點

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `index.html` | 主頁面 |
| `styles.css` | 介面樣式 |
| `app.js` | 系統邏輯 |
| `firebase-config.js` | Firebase 與 Google OAuth 設定檔 |
| `firestore.rules` | Firestore 安全規則 |
| `apps-script-upload.js` | 承辦人 Google Drive 附件上傳用 Apps Script |
| `SETUP_GUIDE.md` | 平台註冊與部署操作手冊 |

## 快速測試

1. 直接將整包檔案部署到 Vercel。
2. 尚未填 Firebase 設定前，可使用「Demo 模式登入」先測試功能。
3. 正式測試前，請依 `SETUP_GUIDE.md` 完成 Firebase、Google OAuth、Vercel 設定。

## 正式部署前提醒

- `firebase-config.js` 裡面的 Firebase 設定必須替換成你自己的專案資料。
- `firestore.rules` 必須貼到 Firebase Console 的 Firestore Rules。
- Google Drive 若要讓附件進入「承辦人自己的 Drive」，建議每位承辦人建立自己的 Apps Script Web App URL，並貼到案件設定。


## V4 本次重點

- 「固定欄位設定」改名為「欄位設定」。
- 固定欄位可點擊啟用 / 停用；停用後會變灰色，報名表自動重排。
- 可由承辦人新增自訂欄位，支援文字、長文字、數字、日期、下拉選單、單選、多選。
- 下拉、單選、多選欄位可展開編輯選項，支援新增與刪除選項。
- 案件列表操作改為「填寫 / 重新編輯 / 案件管理」。
- 一般承辦人只能管理自己建立的案件；最高系統管理員可管理所有案件。
- 名冊與統計輸出已整合進「單一案件管理」，不再作為側邊欄獨立功能。
- 非最高系統管理員不顯示「系統設定」，所有一般帳號需由最高系統管理員核准後才可使用。
- 報名者重新編輯資料時保留原序號，只更新資料內容。


## V4 PDF 輸出修正

- 修正 PDF 畫布隱藏導致無法產生 PDF 的問題。
- PDF 產出支援桌機下載與手機預覽。
- 若 PDF 套件載入失敗，會開啟列印／另存 PDF 的備援預覽頁。
