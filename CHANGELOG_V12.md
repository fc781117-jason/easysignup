# V12 Firebase 設定檔快取修正版

- index.html 將 firebase-config.js 版本參數更新為 20260523-1201。
- app.js 新增動態強制載入 firebase-config.js 的備援機制，避免手機或 CDN 快取舊設定檔。
- 若設定檔仍讀不到，錯誤訊息會顯示是否為載入錯誤。
- 本版本不包含正式 firebase-config.js，不會覆蓋你的 Firebase 設定。
