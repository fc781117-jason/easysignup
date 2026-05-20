/**
 * 消防局多功能報名系統：承辦人 Google Drive 附件上傳端點
 * 使用方式：
 * 1. 承辦人開啟 https://script.google.com/ 新增專案。
 * 2. 貼上本檔內容。
 * 3. 部署 → 新增部署作業 → 類型選「網頁應用程式」。
 * 4. 執行身分選「我」，誰可以存取選「任何擁有 Google 帳戶的使用者」。
 * 5. 複製 Web App URL，貼回報名系統案件設定的「承辦人 Apps Script 上傳網址」。
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    if (!data.fileBase64 || !data.fileName) throw new Error('缺少 fileBase64 或 fileName');

    var folderName = data.folderName || '消防局報名系統附件';
    var root = getOrCreateFolder_(folderName);
    var caseFolder = getOrCreateFolder_(sanitize_(data.caseTitle || '未命名案件'), root);

    var bytes = Utilities.base64Decode(data.fileBase64);
    var blob = Utilities.newBlob(bytes, data.mimeType || 'application/octet-stream', sanitize_(data.serialNo + '_' + data.fileName));
    var file = caseFolder.createFile(blob);

    return json_({ ok: true, fileId: file.getId(), fileName: file.getName(), webViewLink: file.getUrl() });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function getOrCreateFolder_(name, parent) {
  var iterator = parent ? parent.getFoldersByName(name) : DriveApp.getFoldersByName(name);
  if (iterator.hasNext()) return iterator.next();
  return parent ? parent.createFolder(name) : DriveApp.createFolder(name);
}

function sanitize_(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
