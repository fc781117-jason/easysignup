import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

const CONFIG = window.APP_CONFIG || {};
const ADMIN_EMAIL = CONFIG.systemAdminEmail || 'fc781117@gmail.com';
const STORAGE_KEY = 'fire-registration-app-v3'; // 保留 V3 key，避免使用者更新後 Demo 資料消失

const OUTSIDE_PLACEHOLDER = '外部單位不列入統計';
const FIELD = {
  applicantName: '姓名',
  phone: '電話',
  email: '電子郵件',
  gender: '性別',
  age: '年齡',
  unitGroup: '單位類型',
  unit: '單位',
  subUnit: '分隊／科室',
  dutyType: '內外勤',
  position: '職稱',
  parkingNeed: '是否需要停車',
  parkingStatus: '停車序位',
  meal: '餐食',
  note: '備註'
};

const FIREFIGHTER_UNITS = {
  field: [
    '第一救災救護大隊','第二救災救護大隊','第三救災救護大隊','第四救災救護大隊','第五救災救護大隊','第六救災救護大隊','第七救災救護大隊','第八救災救護大隊','第九救災救護大隊','特搜大隊'
  ],
  office: [
    '救災救護指揮中心','車輛保養中心','火災預防科','災害搶救科','緊急救護科','教育訓練科','火災鑑識中心','危險物品管理科','民力運用科','整備應變科','消防宣導科','資通管考科','減災規劃科','秘書室','人事室','會計室','政風室','督察室'
  ]
};

const POSITIONS = {
  field: ['隊員','小隊長','分隊長','護理師','中隊長','組長','組員','副大隊長','大隊長'],
  office: ['隊員','護理師','科員','股長','專員','秘書','主任','科長','簡任技正','專門委員','副局長','局長']
};

const CASE_TYPES = ['訓練報名','講習報名','會議報名','甄選報名'];

const FIXED_FIELD_DEFS = [
  { key:'applicantName', label:'姓名', type:'text', locked:true, required:true },
  { key:'phone', label:'電話', type:'text', required:true },
  { key:'email', label:'電子郵件', type:'email' },
  { key:'gender', label:'性別（男／女）', type:'select', options:['男','女'], required:true },
  { key:'age', label:'年齡', type:'number', required:true },
  { key:'unitGroup', label:'單位類型', type:'select', options:['外勤單位','內勤科室'], internalOnly:true, required:true },
  { key:'unit', label:'單位', type:'select', internalOnly:true, required:true },
  { key:'subUnit', label:'分隊／科室', type:'text', internalOnly:true },
  { key:'dutyType', label:'內外勤', type:'select', options:['外勤','內勤'], internalOnly:true, required:true },
  { key:'position', label:'職稱', type:'select', internalOnly:true, required:true },
  { key:'parkingNeed', label:'停車需求', type:'select', options:['不需要停車','需要停車'] },
  { key:'meal', label:'餐食（葷／素）', type:'select', options:['葷','素','不需餐食'] },
  { key:'note', label:'備註', type:'textarea', full:true }
];
const OPTION_FIELD_TYPES = new Set(['select','radio','checkbox']);


let firebaseApp = null;
let auth = null;
let db = null;
let usingFirebase = false;
let usingDemoMode = false;
let currentUser = null;
let driveAccessToken = null;
let cases = [];
let registrations = [];
let selectedCaseId = '';
let reportCaseId = '';
let dashboardChart = null;
let reportCharts = [];
let editingCaseId = '';
let editorFieldSettings = {};
let editorCustomFields = [];
let expandedFieldId = '';
let registrationEditingId = '';

const $ = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowText = () => new Date().toLocaleString('zh-TW', { hour12: false });
const safe = (value, fallback = '') => value === undefined || value === null ? fallback : String(value);
const randomId = (len = 6) => Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len).padEnd(len, 'X');
const sanitizeFilename = (name) => safe(name).replace(/[\\/:*?"<>|]/g, '_');

function isSystemAdmin() {
  return currentUser?.email === ADMIN_EMAIL || currentUser?.role === 'systemAdmin';
}
function canManageCase(c) {
  if (!c || !currentUser) return false;
  return isSystemAdmin() || c.createdBy === currentUser.uid || c.createdByEmail === currentUser.email;
}
function visibleFixedFieldDefs(audience) {
  return FIXED_FIELD_DEFS.filter(f => audience === 'internal' || !f.internalOnly);
}
function defaultFieldSettings(audience = 'internal') {
  const obj = {};
  FIXED_FIELD_DEFS.forEach(f => {
    obj[f.key] = {
      active: audience === 'internal' || !f.internalOnly,
      label: f.label,
      type: f.type,
      required: Boolean(f.required),
      locked: Boolean(f.locked),
      options: Array.isArray(f.options) ? [...f.options] : []
    };
  });
  return obj;
}
function normalizeFieldSettings(settings = {}, audience = 'internal') {
  const base = defaultFieldSettings(audience);
  FIXED_FIELD_DEFS.forEach(f => {
    const existing = settings?.[f.key] || {};
    base[f.key] = {
      ...base[f.key],
      ...existing,
      locked: Boolean(f.locked),
      label: f.label,
      type: f.type,
      options: Array.isArray(existing.options) && existing.options.length ? existing.options : base[f.key].options
    };
    if (audience === 'external' && f.internalOnly) base[f.key].active = false;
    if (f.locked) base[f.key].active = true;
  });
  return base;
}
function normalizeCustomFields(fields = []) {
  return (Array.isArray(fields) ? fields : []).map(f => ({
    id: f.id || ('custom_' + randomId(8)),
    label: f.label || '自訂欄位',
    type: f.type || 'text',
    required: Boolean(f.required),
    active: f.active !== false,
    options: Array.isArray(f.options) && f.options.length ? f.options : ['選項1','選項2']
  }));
}
function activeFixedKeys(c) {
  const settings = normalizeFieldSettings(c.fieldSettings, c.audience);
  return visibleFixedFieldDefs(c.audience).filter(f => settings[f.key]?.active !== false).map(f => f.key);
}
function ownRegistrationFor(caseId) {
  if (!currentUser) return null;
  return registrations.find(r => r.caseId === caseId && (r.createdBy === currentUser.uid || r.createdByEmail === currentUser.email || r.applicantEmail === currentUser.email));
}
function optionListForFixed(key, c) {
  const settings = normalizeFieldSettings(c.fieldSettings, c.audience);
  return settings[key]?.options || [];
}
function formOptionValues(name) {
  return Array.from(document.querySelectorAll(`[name="${name}"]:checked`)).map(el => el.value);
}

function validFirebaseConfig() {
  const cfg = CONFIG.firebaseConfig || {};
  return Boolean(cfg.apiKey && cfg.projectId && !cfg.apiKey.includes('PASTE_') && !cfg.projectId.includes('PASTE_'));
}

function validGoogleClient() {
  return Boolean(CONFIG.googleOAuthClientId && !CONFIG.googleOAuthClientId.includes('PASTE_'));
}

async function init() {
  $('adminEmailLabel').textContent = ADMIN_EMAIL;
  $('settingsAdminEmail').textContent = ADMIN_EMAIL;
  $('caseAgency').value = CONFIG.defaultAgencyName || '新北市政府消防局';
  $('serialPrefix').value = CONFIG.defaultSerialPrefix || 'NTP-FIRE';
  $('caseDeadline').value = todayISO();
  $('caseCode').value = 'TRAIN';

  if (validFirebaseConfig()) {
    try {
      firebaseApp = initializeApp(CONFIG.firebaseConfig);
      auth = getAuth(firebaseApp);
      db = getFirestore(firebaseApp);
      usingFirebase = true;
      usingDemoMode = false;
      onAuthStateChanged(auth, async (user) => {
        if (user) await afterLogin(makeUser(user));
      });
    } catch (err) {
      console.error(err);
      usingFirebase = false;
      usingDemoMode = true;
      toast('Firebase 初始化失敗，已切換 Demo 模式：' + err.message, 'warn');
    }
  } else {
    usingDemoMode = true;
  }

  editorFieldSettings = defaultFieldSettings($('caseAudience').value || 'internal');
  editorCustomFields = [];
  wireEvents();
  renderTemplatePreview();
  renderPositionRules();
  renderEnvStatus();
  applyRoleNavigation();
}

function makeUser(user) {
  return {
    uid: user.uid || 'demo-admin',
    name: user.displayName || user.email || '使用者',
    email: user.email || ADMIN_EMAIL,
    photoURL: user.photoURL || '',
    role: user.email === ADMIN_EMAIL ? 'systemAdmin' : 'manager'
  };
}

function demoUser() {
  return {
    uid: 'demo-admin',
    name: '何健鳴',
    email: ADMIN_EMAIL,
    photoURL: '',
    role: 'systemAdmin'
  };
}

function wireEvents() {
  $('googleLoginBtn').addEventListener('click', loginWithGoogle);
  $('demoLoginBtn').addEventListener('click', async () => afterLogin(demoUser(), true));
  $('logoutBtn').addEventListener('click', logout);
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.jump)));

  $('caseAudience').addEventListener('change', () => { editorFieldSettings = normalizeFieldSettings(editorFieldSettings, $('caseAudience').value); renderTemplatePreview(); });
  $('caseAgeBucketMode').addEventListener('change', () => $('customAgeWrap').classList.toggle('hidden', $('caseAgeBucketMode').value !== 'custom'));
  $('resetCaseBtn').addEventListener('click', resetCaseEditor);
  $('addCustomFieldBtn').addEventListener('click', addCustomFieldFromEditor);
  $('saveDraftBtn').addEventListener('click', () => saveCase('draft'));
  $('publishCaseBtn').addEventListener('click', () => saveCase('open'));
  $('caseSearch').addEventListener('input', renderCasesTable);
  $('caseStatusFilter').addEventListener('change', renderCasesTable);

  $('registrationCaseSelect').addEventListener('change', () => {
    selectedCaseId = $('registrationCaseSelect').value;
    renderRegistrationForm();
  });
  $('reportCaseSelect').addEventListener('change', () => {
    reportCaseId = $('reportCaseSelect').value;
    renderReports();
  });
  $('submitRegistrationBtn').addEventListener('click', submitRegistration);
  $('attachmentInput').addEventListener('change', renderAttachmentInfo);
  $('connectDriveBtn').addEventListener('click', requestDriveAccess);

  $('editCaseFromReportsBtn').addEventListener('click', () => loadCaseForEdit(reportCaseId));
  $('toggleCaseStatusBtn').addEventListener('click', toggleReportCaseStatus);
  $('deleteCaseBtn').addEventListener('click', () => deleteCaseById(reportCaseId));
  $('exportExcelBtn').addEventListener('click', exportExcelWorkbook);
  $('exportRosterPdfBtn').addEventListener('click', () => exportSimplePdf('signIn'));
  $('exportMealPdfBtn').addEventListener('click', () => exportSimplePdf('meal'));
  $('exportStatsPdfBtn').addEventListener('click', exportStatsPdf);
  $('seedDemoBtn').addEventListener('click', seedDemoData);
  $('clearDemoBtn').addEventListener('click', clearDemoData);
}

async function loginWithGoogle() {
  if (!usingFirebase || !auth) {
    if (CONFIG.allowDemoMode) {
      toast('尚未完成 Firebase 設定，已使用 Demo 模式登入。', 'warn');
      await afterLogin(demoUser(), true);
      return;
    }
    toast('請先完成 Firebase 設定。', 'danger');
    return;
  }
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const res = await signInWithPopup(auth, provider);
    await afterLogin(makeUser(res.user));
  } catch (err) {
    toast('Google 登入失敗：' + err.message, 'danger');
  }
}

async function afterLogin(user, demo = false) {
  currentUser = user;
  if (demo) usingDemoMode = true;
  $('loginPage').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  $('userName').textContent = user.name;
  $('userRole').textContent = user.email === ADMIN_EMAIL ? '最高系統管理員（固定）' : '承辦人 / 報名者';
  $('userAvatar').textContent = (user.name || user.email || '?').slice(0, 1).toUpperCase();
  await ensureUserProfile(user);
  await loadAllData();
  renderAll();
  applyRoleNavigation();
  showPage(isSystemAdmin() ? 'dashboard' : 'cases');
  toast('登入成功，歡迎使用 V4 PDF 輸出修正版。', 'ok');
}

async function logout() {
  if (usingFirebase && auth) await signOut(auth).catch(() => {});
  currentUser = null;
  $('loginPage').classList.remove('hidden');
  $('appShell').classList.add('hidden');
  toast('已登出。');
}

async function ensureUserProfile(user) {
  const profile = {
    uid: user.uid,
    name: user.name,
    email: user.email,
    role: user.email === ADMIN_EMAIL ? 'systemAdmin' : 'manager',
    updatedAt: Date.now()
  };
  if (usingFirebase && db) {
    await setDoc(doc(db, 'users', user.uid), { ...profile, updatedAt: serverTimestamp() }, { merge: true }).catch(console.warn);
  } else {
    const store = loadStore();
    store.users = store.users || {};
    store.users[user.uid] = profile;
    saveStore(store);
  }
}

function showPage(page) {
  if (!isSystemAdmin() && (page === 'dashboard' || page === 'settings')) page = 'cases';
  if (page === 'reports') {
    const c = getCase(reportCaseId);
    if (c && !canManageCase(c)) {
      toast('您只能管理自己建立的案件；可查看案件並填寫／重新編輯自己的資料。', 'warn');
      page = 'cases';
    }
  }
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === page));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
  if (page === 'reports') renderReports();
  if (page === 'dashboard') renderDashboard();
}

function applyRoleNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    const adminOnly = btn.dataset.role === 'admin';
    btn.classList.toggle('hidden', adminOnly && !isSystemAdmin());
  });
}

function renderAll() {
  renderDashboard();
  renderCasesTable();
  renderCaseSelects();
  renderRegistrationForm();
  renderReports();
  renderEnvStatus();
  applyRoleNavigation();
}

async function loadAllData() {
  if (usingFirebase && db) {
    const caseSnap = await getDocs(query(collection(db, 'cases'), orderBy('createdAt', 'desc'))).catch(async () => getDocs(collection(db, 'cases')));
    cases = caseSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const regSnap = await getDocs(query(collection(db, 'registrations'), orderBy('submittedAt', 'desc'))).catch(async () => getDocs(collection(db, 'registrations')));
    registrations = regSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    const store = loadStore();
    cases = store.cases || [];
    registrations = store.registrations || [];
    if (!cases.length) seedDemoData(false);
    const store2 = loadStore();
    cases = store2.cases || [];
    registrations = store2.registrations || [];
  }
  selectedCaseId = selectedCaseId || (cases.find(c => c.status === 'open') || cases[0] || {}).id || '';
  reportCaseId = reportCaseId || selectedCaseId;
}

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveStore(store) { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }

function caseBase(status) {
  const title = $('caseTitle').value.trim();
  if (!title) throw new Error('請輸入案件標題。');
  const audience = $('caseAudience').value;
  const rawCode = $('caseCode').value.trim();
  const caseCode = (rawCode || typeToCode($('caseType').value)).toUpperCase();
  return {
    agencyName: $('caseAgency').value.trim() || CONFIG.defaultAgencyName || '新北市政府消防局',
    title,
    type: $('caseType').value,
    audience,
    status,
    deadline: $('caseDeadline').value || todayISO(),
    quota: Number($('caseQuota').value || 0),
    parkingSlots: Number($('caseParkingSlots').value || 0),
    attachmentLimitMB: Number($('caseAttachmentLimit').value || 10),
    attachmentMode: $('caseAttachmentMode').value,
    ageBucketMode: $('caseAgeBucketMode').value,
    customAgeBuckets: $('caseCustomAgeBuckets').value.trim(),
    note: $('caseNote').value.trim(),
    uploadMode: $('uploadMode').value,
    uploadEndpoint: $('uploadEndpoint').value.trim(),
    driveFolderName: $('driveFolderName').value.trim() || '消防局報名系統附件',
    serialPrefix: $('serialPrefix').value.trim() || CONFIG.defaultSerialPrefix || 'NTP-FIRE',
    caseCode,
    fieldSettings: normalizeFieldSettings(editorFieldSettings, audience),
    customFields: normalizeCustomFields(editorCustomFields),
    createdBy: currentUser?.uid || 'demo-admin',
    createdByEmail: currentUser?.email || ADMIN_EMAIL,
    createdByName: currentUser?.name || '',
    updatedAtMillis: Date.now()
  };
}

function typeToCode(type) {
  if (type === '訓練報名') return 'TRAIN';
  if (type === '講習報名') return 'LECTURE';
  if (type === '會議報名') return 'MEET';
  if (type === '甄選報名') return 'SELECT';
  return 'CASE';
}

async function saveCase(status) {
  try {
    const payload = caseBase(status);
    if (editingCaseId) {
      const existing = getCase(editingCaseId);
      if (!canManageCase(existing)) throw new Error('您沒有權限編輯此案件。');
      const updatePayload = { ...payload, createdBy: existing.createdBy || payload.createdBy, createdByEmail: existing.createdByEmail || payload.createdByEmail, createdByName: existing.createdByName || payload.createdByName };
      if (usingFirebase && db) {
        await updateDoc(doc(db, 'cases', editingCaseId), { ...updatePayload, updatedAt: serverTimestamp() });
      } else {
        const store = loadStore();
        store.cases = (store.cases || []).map(c => c.id === editingCaseId ? { ...c, ...updatePayload } : c);
        saveStore(store);
        cases = store.cases;
      }
      toast('案件設定已更新。', 'ok');
    } else if (usingFirebase && db) {
      const docRef = await addDoc(collection(db, 'cases'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      cases.unshift({ id: docRef.id, ...payload });
      toast(status === 'open' ? '案件已發布。' : '草稿已儲存。', 'ok');
    } else {
      const store = loadStore();
      store.cases = store.cases || [];
      const id = 'case_' + randomId(8);
      store.cases.unshift({ id, ...payload, createdAtMillis: Date.now() });
      saveStore(store);
      cases = store.cases;
      toast(status === 'open' ? '案件已發布。' : '草稿已儲存。', 'ok');
    }
    resetCaseEditor(false);
    await loadAllData();
    renderAll();
    showPage('cases');
  } catch (err) {
    toast(err.message, 'danger');
  }
}

function resetCaseEditor(show = true) {
  editingCaseId = '';
  expandedFieldId = '';
  editorFieldSettings = defaultFieldSettings('internal');
  editorCustomFields = [];
  $('saveDraftBtn').textContent = '儲存草稿';
  $('publishCaseBtn').textContent = '發布案件';
  $('caseAgency').value = CONFIG.defaultAgencyName || '新北市政府消防局';
  $('caseTitle').value = '';
  $('caseType').value = '訓練報名';
  $('caseAudience').value = 'internal';
  $('caseDeadline').value = todayISO();
  $('caseQuota').value = 0;
  $('caseParkingSlots').value = 0;
  $('caseAttachmentLimit').value = 10;
  $('caseAttachmentMode').value = 'none';
  $('caseAgeBucketMode').value = 'five';
  $('caseCustomAgeBuckets').value = '';
  $('caseNote').value = '請報名人確認資料正確。若需取消或補件，請於截止日前洽承辦人。';
  $('uploadMode').value = 'appsScript';
  $('uploadEndpoint').value = '';
  $('driveFolderName').value = '消防局報名系統附件';
  $('serialPrefix').value = CONFIG.defaultSerialPrefix || 'NTP-FIRE';
  $('caseCode').value = 'TRAIN';
  renderTemplatePreview();
  if (show) toast('已清空案件編輯區。');
}

function loadCaseForEdit(caseId) {
  const c = getCase(caseId);
  if (!c) return toast('找不到案件。', 'danger');
  if (!canManageCase(c)) return toast('您只能編輯自己建立的案件。', 'warn');
  editingCaseId = c.id;
  expandedFieldId = '';
  $('caseAgency').value = c.agencyName || CONFIG.defaultAgencyName || '新北市政府消防局';
  $('caseTitle').value = c.title || '';
  $('caseType').value = c.type || '訓練報名';
  $('caseAudience').value = c.audience || 'internal';
  $('caseDeadline').value = c.deadline || todayISO();
  $('caseQuota').value = c.quota || 0;
  $('caseParkingSlots').value = c.parkingSlots || 0;
  $('caseAttachmentLimit').value = c.attachmentLimitMB || 10;
  $('caseAttachmentMode').value = c.attachmentMode || 'none';
  $('caseAgeBucketMode').value = c.ageBucketMode || 'five';
  $('customAgeWrap').classList.toggle('hidden', $('caseAgeBucketMode').value !== 'custom');
  $('caseCustomAgeBuckets').value = c.customAgeBuckets || '';
  $('caseNote').value = c.note || '請報名人確認資料正確。若需取消或補件，請於截止日前洽承辦人。';
  $('uploadMode').value = c.uploadMode || 'appsScript';
  $('uploadEndpoint').value = c.uploadEndpoint || '';
  $('driveFolderName').value = c.driveFolderName || '消防局報名系統附件';
  $('serialPrefix').value = c.serialPrefix || CONFIG.defaultSerialPrefix || 'NTP-FIRE';
  $('caseCode').value = c.caseCode || typeToCode(c.type || '訓練報名');
  editorFieldSettings = normalizeFieldSettings(c.fieldSettings, c.audience || 'internal');
  editorCustomFields = normalizeCustomFields(c.customFields);
  $('saveDraftBtn').textContent = '更新為草稿';
  $('publishCaseBtn').textContent = '更新並發布';
  renderTemplatePreview();
  showPage('caseEditor');
  toast('已載入案件設定，可直接修改後更新。', 'ok');
}

async function toggleReportCaseStatus() {
  const c = getCase(reportCaseId);
  if (!c || !canManageCase(c)) return toast('您沒有權限管理此案件。', 'warn');
  const nextStatus = c.status === 'open' ? 'closed' : 'open';
  await updateCasePartial(c.id, { status: nextStatus, updatedAtMillis: Date.now() });
  toast(`案件狀態已改為：${statusText(nextStatus)}`, 'ok');
  await loadAllData();
  renderAll();
  reportCaseId = c.id;
  showPage('reports');
}

async function updateCasePartial(caseId, patch) {
  if (usingFirebase && db) await updateDoc(doc(db, 'cases', caseId), { ...patch, updatedAt: serverTimestamp() });
  else {
    const store = loadStore();
    store.cases = (store.cases || []).map(c => c.id === caseId ? { ...c, ...patch } : c);
    saveStore(store);
    cases = store.cases;
  }
}

async function deleteCaseById(caseId) {
  const c = getCase(caseId);
  if (!c || !canManageCase(c)) return toast('您沒有權限刪除此案件。', 'warn');
  const ok = confirm(`確定要刪除「${c.title}」？\n此動作會一併移除本機／資料庫中的該案件報名資料，請先匯出備份。`);
  if (!ok) return;
  if (usingFirebase && db) {
    await deleteDoc(doc(db, 'cases', caseId));
    const regSnap = await getDocs(query(collection(db, 'registrations'), where('caseId', '==', caseId)));
    await Promise.all(regSnap.docs.map(d => deleteDoc(doc(db, 'registrations', d.id))));
  } else {
    const store = loadStore();
    store.cases = (store.cases || []).filter(c => c.id !== caseId);
    store.registrations = (store.registrations || []).filter(r => r.caseId !== caseId);
    saveStore(store);
  }
  reportCaseId = '';
  selectedCaseId = '';
  await loadAllData();
  renderAll();
  showPage('cases');
  toast('案件已刪除。', 'ok');
}

function renderTemplatePreview() {
  const audience = $('caseAudience').value;
  editorFieldSettings = normalizeFieldSettings(editorFieldSettings, audience);
  const fixedCards = visibleFixedFieldDefs(audience).map(def => renderFieldSettingCard(def, editorFieldSettings[def.key], 'fixed')).join('');
  $('templatePreview').innerHTML = `<div class="field-setting-list">${fixedCards}</div>` +
    `<div class="notice mt-3 ${audience === 'external' ? 'warn' : ''}">${audience === 'external' ? '外部報名模板會自動隱藏「單位」與「職稱」，且不列入單位／職稱統計。' : '內部報名模板會依內勤／外勤顯示不同職稱選項，並列入單位與職稱統計。'}</div>`;
  $('customFieldList').innerHTML = renderCustomFieldList();
  bindFieldSettingEvents();
}

function renderFieldSettingCard(def, setting, source) {
  const id = source === 'fixed' ? def.key : def.id;
  const active = setting?.active !== false;
  const expandable = OPTION_FIELD_TYPES.has(def.type) || source === 'custom';
  const isExpanded = expandedFieldId === `${source}:${id}`;
  const options = Array.isArray(setting?.options) ? setting.options : [];
  const optionEditor = isExpanded ? renderOptionEditor(source, id, def.type, options, setting) : '';
  return `<div class="field-setting-card ${active ? 'active' : 'inactive'}" data-field-source="${source}" data-field-id="${id}">
    <button class="pill field-toggle ${active ? '' : 'off'}" data-action="toggle-field" ${def.locked ? 'disabled title="姓名為必要欄位"' : ''}>${safe(def.label)}${def.locked ? '｜必要' : ''}</button>
    <button class="field-arrow" data-action="expand-field" type="button">${expandable ? (isExpanded ? '▴' : '▾') : ''}</button>
    ${source === 'custom' ? `<button class="field-delete" data-action="delete-custom-field" type="button">×</button>` : ''}
    ${optionEditor}
  </div>`;
}

function renderOptionEditor(source, id, type, options, setting = {}) {
  const editableOptions = OPTION_FIELD_TYPES.has(type);
  return `<div class="field-option-panel">
    ${source === 'custom' ? `<label>欄位名稱<input data-custom-prop="label" data-custom-id="${id}" value="${safe(setting.label)}" /></label>
      <div class="grid two compact"><label>欄位類型<select data-custom-prop="type" data-custom-id="${id}">${['text','textarea','number','date','select','radio','checkbox'].map(t => `<option value="${t}" ${type === t ? 'selected' : ''}>${fieldTypeText(t)}</option>`).join('')}</select></label>
      <label class="inline-check option-check"><input type="checkbox" data-custom-prop="required" data-custom-id="${id}" ${setting.required ? 'checked' : ''}/> 必填</label></div>` : ''}
    ${editableOptions ? `<div class="option-chip-list">${options.map((o, idx) => `<span class="option-chip">${safe(o)}<button data-action="remove-option" data-source="${source}" data-field-id="${id}" data-option-index="${idx}" type="button">×</button></span>`).join('')}</div>
      <button class="btn btn-outline mini" data-action="add-option" data-source="${source}" data-field-id="${id}" type="button">＋ 新增選項</button>` : `<div class="notice">此欄位沒有下拉選項；可停用或刪除此欄位。</div>`}
  </div>`;
}

function renderCustomFieldList() {
  const list = normalizeCustomFields(editorCustomFields);
  editorCustomFields = list;
  if (!list.length) return '<div class="notice mt-3">尚未新增自訂欄位。</div>';
  return `<div class="field-setting-list mt-3">${list.map(f => renderFieldSettingCard(f, f, 'custom')).join('')}</div>`;
}

function fieldTypeText(type) {
  return ({ text:'文字', textarea:'長文字', number:'數字', date:'日期', select:'下拉選單', radio:'單選', checkbox:'多選', email:'電子郵件' })[type] || type;
}

function bindFieldSettingEvents() {
  document.querySelectorAll('[data-action="toggle-field"]').forEach(btn => btn.addEventListener('click', (e) => {
    const card = e.target.closest('[data-field-source]');
    toggleEditorField(card.dataset.fieldSource, card.dataset.fieldId);
  }));
  document.querySelectorAll('[data-action="expand-field"]').forEach(btn => btn.addEventListener('click', (e) => {
    const card = e.target.closest('[data-field-source]');
    const key = `${card.dataset.fieldSource}:${card.dataset.fieldId}`;
    expandedFieldId = expandedFieldId === key ? '' : key;
    renderTemplatePreview();
  }));
  document.querySelectorAll('[data-action="delete-custom-field"]').forEach(btn => btn.addEventListener('click', (e) => {
    const id = e.target.closest('[data-field-source]').dataset.fieldId;
    editorCustomFields = editorCustomFields.filter(f => f.id !== id);
    renderTemplatePreview();
  }));
  document.querySelectorAll('[data-action="add-option"]').forEach(btn => btn.addEventListener('click', () => addOptionToEditorField(btn.dataset.source, btn.dataset.fieldId)));
  document.querySelectorAll('[data-action="remove-option"]').forEach(btn => btn.addEventListener('click', () => removeOptionFromEditorField(btn.dataset.source, btn.dataset.fieldId, Number(btn.dataset.optionIndex))));
  document.querySelectorAll('[data-custom-prop]').forEach(input => input.addEventListener('change', () => updateCustomFieldProp(input.dataset.customId, input.dataset.customProp, input.type === 'checkbox' ? input.checked : input.value)));
}

function toggleEditorField(source, id) {
  if (source === 'fixed') {
    const def = FIXED_FIELD_DEFS.find(f => f.key === id);
    if (def?.locked) return;
    editorFieldSettings[id].active = editorFieldSettings[id].active === false;
  } else {
    editorCustomFields = editorCustomFields.map(f => f.id === id ? { ...f, active: f.active === false } : f);
  }
  renderTemplatePreview();
}

function addOptionToEditorField(source, id) {
  const value = prompt('請輸入新增選項名稱');
  if (!value) return;
  if (source === 'fixed') editorFieldSettings[id].options = [...(editorFieldSettings[id].options || []), value.trim()];
  else editorCustomFields = editorCustomFields.map(f => f.id === id ? { ...f, options: [...(f.options || []), value.trim()] } : f);
  renderTemplatePreview();
}

function removeOptionFromEditorField(source, id, idx) {
  if (source === 'fixed') editorFieldSettings[id].options = (editorFieldSettings[id].options || []).filter((_, i) => i !== idx);
  else editorCustomFields = editorCustomFields.map(f => f.id === id ? { ...f, options: (f.options || []).filter((_, i) => i !== idx) } : f);
  renderTemplatePreview();
}

function updateCustomFieldProp(id, prop, value) {
  editorCustomFields = editorCustomFields.map(f => {
    if (f.id !== id) return f;
    const next = { ...f, [prop]: value };
    if (prop === 'type' && OPTION_FIELD_TYPES.has(value) && (!next.options || !next.options.length)) next.options = ['選項1','選項2'];
    return next;
  });
  renderTemplatePreview();
}

function addCustomFieldFromEditor() {
  const label = $('newFieldLabel').value.trim();
  const type = $('newFieldType').value;
  if (!label) return toast('請先輸入自訂欄位名稱。', 'warn');
  const id = 'custom_' + randomId(8);
  editorCustomFields.push({ id, label, type, required: $('newFieldRequired').checked, active: true, options: OPTION_FIELD_TYPES.has(type) ? ['選項1','選項2'] : [] });
  $('newFieldLabel').value = '';
  $('newFieldRequired').checked = false;
  expandedFieldId = `custom:${id}`;
  renderTemplatePreview();
}

function renderDashboard() {
  const openCases = cases.filter(c => c.status === 'open').length;
  const allRegs = registrations.length;
  const parking = registrations.filter(r => r.formData?.parkingNeed === '需要停車').length;
  const meals = registrations.filter(r => ['葷','素'].includes(r.formData?.meal)).length;
  $('statOpenCases').textContent = openCases;
  $('statRegistrations').textContent = allRegs;
  $('statParkingNeed').textContent = parking;
  $('statMealNeed').textContent = meals;

  $('recentCases').innerHTML = cases.slice(0, 6).map(c => {
    const count = countRegs(c.id);
    return `<div class="item"><div><strong>${safe(c.title)}</strong><br><small class="muted">${safe(c.agencyName)}｜${safe(c.type)}｜${c.audience === 'external' ? '外部' : '內部'}報名</small></div><div><span class="badge ${c.status}">${statusText(c.status)}</span><br><small class="muted">${count}/${c.quota || '不限'}</small></div></div>`;
  }).join('') || '<div class="notice">尚無案件。</div>';

  if (dashboardChart) dashboardChart.destroy();
  const ctx = $('dashboardChart');
  dashboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: cases.slice(0, 8).map(c => c.title.slice(0, 10)),
      datasets: [{ label: '報名數', data: cases.slice(0, 8).map(c => countRegs(c.id)), borderRadius: 8 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

function statusText(status) {
  return status === 'open' ? '開放中' : status === 'closed' ? '已截止' : '草稿';
}

function countRegs(caseId) { return registrations.filter(r => r.caseId === caseId).length; }

function renderCasesTable() {
  const keyword = $('caseSearch')?.value?.trim().toLowerCase() || '';
  const status = $('caseStatusFilter')?.value || '';
  const filtered = cases.filter(c => {
    const text = `${c.title} ${c.type} ${c.agencyName}`.toLowerCase();
    return (!keyword || text.includes(keyword)) && (!status || c.status === status);
  });
  $('caseTable').innerHTML = `<table class="data-table"><thead><tr><th>案件</th><th>模板</th><th>狀態</th><th>報名進度</th><th>停車位</th><th>截止日</th><th>操作</th></tr></thead><tbody>${filtered.map(c => {
    const count = countRegs(c.id);
    const ownReg = ownRegistrationFor(c.id);
    const manageBtn = canManageCase(c) ? `<button class="btn btn-secondary" data-report="${c.id}">案件管理</button>` : '';
    const reEditBtn = ownReg ? `<button class="btn btn-outline" data-reedit="${c.id}">重新編輯</button>` : `<button class="btn btn-outline" disabled>重新編輯</button>`;
    const fillBtn = c.status === 'open' ? `<button class="btn btn-outline" data-fill="${c.id}">填寫</button>` : `<button class="btn btn-outline" disabled>填寫</button>`;
    return `<tr><td><strong>${safe(c.title)}</strong><br><small class="muted">${safe(c.agencyName)}｜${safe(c.type)}｜承辦：${safe(c.createdByName || c.createdByEmail || '未記錄')}</small></td><td><span class="badge ${c.audience === 'external' ? 'orange' : 'blue'}">${c.audience === 'external' ? '外部' : '內部'}</span></td><td><span class="badge ${c.status}">${statusText(c.status)}</span></td><td>${count}/${c.quota || '不限'}</td><td>${c.parkingSlots || 0} 位</td><td>${safe(c.deadline)}</td><td><div class="case-action-group">${fillBtn}${reEditBtn}${manageBtn}</div></td></tr>`;
  }).join('') || '<tr><td colspan="7"><div class="notice">目前沒有符合條件的案件。</div></td></tr>'}</tbody></table>`;
  document.querySelectorAll('[data-fill]').forEach(btn => btn.addEventListener('click', () => { selectedCaseId = btn.dataset.fill; registrationEditingId = ''; renderCaseSelects(); renderRegistrationForm(); showPage('registration'); }));
  document.querySelectorAll('[data-reedit]').forEach(btn => btn.addEventListener('click', () => { selectedCaseId = btn.dataset.reedit; const reg = ownRegistrationFor(selectedCaseId); registrationEditingId = reg?.id || ''; renderCaseSelects(); renderRegistrationForm(); showPage('registration'); }));
  document.querySelectorAll('[data-report]').forEach(btn => btn.addEventListener('click', () => { reportCaseId = btn.dataset.report; renderCaseSelects(); renderReports(); showPage('reports'); }));
}

function renderCaseSelects() {
  const open = cases.filter(c => c.status === 'open');
  const list = open.length ? open : cases;
  const options = list.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
  $('registrationCaseSelect').innerHTML = options;
  const manageable = cases.filter(c => canManageCase(c));
  $('reportCaseSelect').innerHTML = manageable.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
  if (selectedCaseId) $('registrationCaseSelect').value = selectedCaseId;
  if (!reportCaseId || !manageable.some(c => c.id === reportCaseId)) reportCaseId = manageable[0]?.id || '';
  if (reportCaseId) $('reportCaseSelect').value = reportCaseId;
}

function getCase(id) { return cases.find(c => c.id === id); }

function renderRegistrationForm() {
  renderCaseSelects();
  const c = getCase(selectedCaseId) || cases[0];
  if (!c) {
    $('registrationHeader').innerHTML = '<div class="notice">尚無可報名案件，請先新增案件。</div>';
    $('registrationForm').innerHTML = '';
    return;
  }
  selectedCaseId = c.id;
  $('registrationCaseSelect').value = c.id;
  const count = countRegs(c.id);
  const existing = registrationEditingId ? registrations.find(r => r.id === registrationEditingId) : ownRegistrationFor(c.id);
  if (existing) registrationEditingId = existing.id;
  $('submitRegistrationBtn').textContent = existing ? '更新報名資料' : '送出報名';
  $('registrationHeader').innerHTML = `<h3>${safe(c.title)}</h3><p>${safe(c.agencyName)}｜${safe(c.type)}｜截止日：${safe(c.deadline)}｜名額：${count}/${c.quota || '不限'}${existing ? `｜目前序號：${safe(existing.serialNo)}` : ''}</p>`;
  $('parkingNotice').innerHTML = `本案承辦人設定停車位 <strong>${c.parkingSlots || 0}</strong> 位；需要停車者依送出時間先後分配，額滿後自動列為候補。`;

  const settings = normalizeFieldSettings(c.fieldSettings, c.audience);
  const activeDefs = visibleFixedFieldDefs(c.audience).filter(def => settings[def.key]?.active !== false);
  const fixedHtml = activeDefs.map(def => renderFixedInput(def, settings[def.key], c)).join('');
  const customHtml = normalizeCustomFields(c.customFields).filter(f => f.active !== false).map(f => renderCustomInput(f, existing?.formData)).join('');
  $('registrationForm').innerHTML = fixedHtml + customHtml;

  const form = $('registrationForm');
  if (form.unitGroup || form.dutyType) {
    const updateUnitOptions = () => {
      if (!form.unit) return;
      const group = form.unitGroup?.value === 'office' || form.unitGroup?.value === '內勤科室' ? 'office' : 'field';
      form.unit.innerHTML = FIREFIGHTER_UNITS[group].map(u => `<option>${u}</option>`).join('');
    };
    const updatePositionOptions = () => {
      if (!form.position) return;
      const duty = form.dutyType?.value === 'office' || form.dutyType?.value === '內勤' ? 'office' : 'field';
      form.position.innerHTML = POSITIONS[duty].map(p => `<option>${p}</option>`).join('');
    };
    form.unitGroup?.addEventListener('change', updateUnitOptions);
    form.dutyType?.addEventListener('change', updatePositionOptions);
    updateUnitOptions();
    updatePositionOptions();
  }

  if (existing) fillRegistrationForm(existing.formData || {}, c);
}

function renderFixedInput(def, setting, c) {
  const required = setting.required ? 'required' : '';
  const label = `${safe(setting.label || def.label)}${setting.required ? ' *' : ''}`;
  const cls = def.full || def.type === 'textarea' ? ' class="full"' : '';
  if (def.key === 'unitGroup') return `<label${cls}>${label}<select name="unitGroup" ${required}><option value="field">外勤單位</option><option value="office">內勤科室</option></select></label>`;
  if (def.key === 'unit') return `<label${cls}>${label}<select name="unit" ${required}></select></label>`;
  if (def.key === 'dutyType') return `<label${cls}>${label}<select name="dutyType" ${required}><option value="field">外勤</option><option value="office">內勤</option></select></label>`;
  if (def.key === 'position') return `<label${cls}>${label}<select name="position" ${required}></select></label>`;
  if (def.type === 'select') return `<label${cls}>${label}<select name="${def.key}" ${required}>${(setting.options || []).map(o => `<option>${safe(o)}</option>`).join('')}</select></label>`;
  if (def.type === 'textarea') return `<label${cls}>${label}<textarea name="${def.key}" rows="3" placeholder="${safe(setting.label)}"></textarea></label>`;
  const type = def.type === 'email' ? 'email' : def.type === 'number' ? 'number' : 'text';
  const value = def.key === 'email' ? ` value="${safe(currentUser?.email)}"` : '';
  return `<label${cls}>${label}<input name="${def.key}" type="${type}" ${required}${value} placeholder="請輸入${safe(setting.label || def.label)}" /></label>`;
}

function renderCustomInput(field, data = {}) {
  const name = `custom_${field.id}`;
  const label = `${safe(field.label)}${field.required ? ' *' : ''}`;
  const required = field.required ? 'required' : '';
  const value = data?.[name] || '';
  if (field.type === 'textarea') return `<label class="full">${label}<textarea name="${name}" rows="3" ${required}>${safe(value)}</textarea></label>`;
  if (field.type === 'select') return `<label>${label}<select name="${name}" ${required}>${(field.options || []).map(o => `<option ${value === o ? 'selected' : ''}>${safe(o)}</option>`).join('')}</select></label>`;
  if (field.type === 'radio') return `<label class="full">${label}<div class="radio-group">${(field.options || []).map(o => `<label><input type="radio" name="${name}" value="${safe(o)}" ${value === o ? 'checked' : ''} ${required}> ${safe(o)}</label>`).join('')}</div></label>`;
  if (field.type === 'checkbox') {
    const selected = Array.isArray(value) ? value : safe(value).split('、').filter(Boolean);
    return `<label class="full">${label}<div class="radio-group">${(field.options || []).map(o => `<label><input type="checkbox" name="${name}" value="${safe(o)}" ${selected.includes(o) ? 'checked' : ''}> ${safe(o)}</label>`).join('')}</div></label>`;
  }
  const type = ['number','date'].includes(field.type) ? field.type : 'text';
  return `<label>${label}<input name="${name}" type="${type}" ${required} value="${safe(value)}" placeholder="請輸入${safe(field.label)}" /></label>`;
}

function fillRegistrationForm(data, c) {
  const form = $('registrationForm');
  if (form.unitGroup && data.unitGroup) form.unitGroup.value = data.unitGroup;
  if (form.dutyType && data.dutyType) form.dutyType.value = data.dutyType;
  form.unitGroup?.dispatchEvent(new Event('change'));
  form.dutyType?.dispatchEvent(new Event('change'));
  Object.entries(data).forEach(([key, value]) => {
    const elements = form.querySelectorAll(`[name="${key}"]`);
    if (!elements.length) return;
    elements.forEach(el => {
      if (el.type === 'radio') el.checked = el.value === value;
      else if (el.type === 'checkbox') el.checked = Array.isArray(value) ? value.includes(el.value) : safe(value).split('、').includes(el.value);
      else el.value = value;
    });
  });
}

function renderAttachmentInfo() {
  const input = $('attachmentInput');
  const file = input.files?.[0];
  if (!file) {
    $('attachmentInfo').textContent = '尚未選擇附件。';
    return;
  }
  const c = getCase(selectedCaseId);
  const limit = (c?.attachmentLimitMB || 10) * 1024 * 1024;
  if (file.size > limit) {
    $('attachmentInfo').className = 'notice danger mt-3';
    $('attachmentInfo').textContent = `檔案大小超過 ${c?.attachmentLimitMB || 10} MB，請重新選擇。`;
    input.value = '';
    return;
  }
  $('attachmentInfo').className = 'notice ok mt-3';
  $('attachmentInfo').innerHTML = `已選擇：<strong>${file.name}</strong>（${(file.size / 1024 / 1024).toFixed(2)} MB）`;
}

async function submitRegistration() {
  const c = getCase(selectedCaseId);
  if (!c) return toast('找不到案件。', 'danger');
  if (c.status !== 'open') return toast('此案件目前未開放報名。', 'danger');
  const form = $('registrationForm');
  if (!form.reportValidity()) return;
  const existing = registrationEditingId ? registrations.find(r => r.id === registrationEditingId) : ownRegistrationFor(c.id);
  const formData = Object.fromEntries(new FormData(form).entries());
  normalizeCustomFields(c.customFields).filter(f => f.active !== false && f.type === 'checkbox').forEach(f => {
    formData[`custom_${f.id}`] = formOptionValues(`custom_${f.id}`);
  });
  if (c.audience === 'external') {
    formData.unitGroup = 'external';
    formData.unit = OUTSIDE_PLACEHOLDER;
    formData.subUnit = '';
    formData.dutyType = 'external';
    formData.position = '';
  }
  if (!formData.parkingNeed) formData.parkingNeed = '不需要停車';
  if (!formData.meal) formData.meal = '不需餐食';
  const file = $('attachmentInput').files?.[0] || null;
  if (c.attachmentMode === 'required' && !file && !existing?.attachment) return toast('本案要求上傳附件，請先選擇附件。', 'danger');
  const serialNo = existing?.serialNo || generateSerial(c);
  const parkingStatus = assignParkingStatus(c, formData.parkingNeed, existing?.id);
  formData.parkingStatus = parkingStatus;
  let attachment = existing?.attachment || null;
  if (file) attachment = await uploadAttachmentToDriveOrDemo(file, c, serialNo);

  const payload = {
    caseId: c.id,
    serialNo,
    applicantName: formData.applicantName || existing?.applicantName || '',
    applicantEmail: formData.email || currentUser?.email || existing?.applicantEmail || '',
    createdBy: existing?.createdBy || currentUser?.uid || '',
    createdByEmail: existing?.createdByEmail || currentUser?.email || '',
    formData,
    attachment,
    submittedAtMillis: existing?.submittedAtMillis || Date.now(),
    updatedAtMillis: Date.now()
  };

  if (usingFirebase && db) {
    if (existing?.id) {
      await updateDoc(doc(db, 'registrations', existing.id), { ...payload, updatedAt: serverTimestamp() });
      registrations = registrations.map(r => r.id === existing.id ? { ...r, ...payload } : r);
    } else {
      const docRef = await addDoc(collection(db, 'registrations'), { ...payload, submittedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      registrations.unshift({ id: docRef.id, ...payload });
      registrationEditingId = docRef.id;
    }
  } else {
    const store = loadStore();
    store.registrations = store.registrations || [];
    if (existing?.id) {
      store.registrations = store.registrations.map(r => r.id === existing.id ? { ...r, ...payload } : r);
      registrationEditingId = existing.id;
    } else {
      const id = 'reg_' + randomId(8);
      store.registrations.unshift({ id, ...payload });
      registrationEditingId = id;
    }
    saveStore(store);
    registrations = store.registrations;
  }
  $('attachmentInput').value = '';
  renderAttachmentInfo();
  await loadAllData();
  renderAll();
  await exportRegistrationPdf(payload, c);
  toast(`${existing ? '報名資料已更新' : '報名完成'}，序號：${serialNo}；${parkingStatus}`, 'ok');
  if (canManageCase(c)) {
    reportCaseId = c.id;
    showPage('reports');
  } else {
    showPage('cases');
  }
}

function generateSerial(c) {
  const date = new Date().toISOString().slice(0,10).replaceAll('-', '');
  return `${c.serialPrefix || 'NTP-FIRE'}-${c.caseCode || 'CASE'}-${date}-${randomId(4)}`;
}

function assignParkingStatus(c, parkingNeed, excludeRegId = '') {
  if (parkingNeed !== '需要停車') return '不需停車';
  const slots = Number(c.parkingSlots || 0);
  const usedBefore = registrations.filter(r => r.caseId === c.id && r.id !== excludeRegId && r.formData?.parkingNeed === '需要停車').length;
  if (slots <= 0) return `候補第 ${usedBefore + 1} 位（本案未設定可用車位）`;
  if (usedBefore < slots) return `正取第 ${usedBefore + 1} 車位`;
  return `候補第 ${usedBefore - slots + 1} 位`;
}

async function requestDriveAccess() {
  if (usingDemoMode || !validGoogleClient()) {
    $('driveStatus').className = 'notice warn mt-3';
    $('driveStatus').innerHTML = 'Demo 模式或尚未填入 Google OAuth Client ID：附件將以模擬方式記錄，不會真正上傳。';
    toast('Drive 尚未正式連接，使用 Demo 模式。', 'warn');
    return null;
  }
  if (!window.google?.accounts?.oauth2) {
    toast('Google Identity Services 尚未載入，請稍後再試。', 'warn');
    return null;
  }
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleOAuthClientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          reject(tokenResponse);
          return;
        }
        driveAccessToken = tokenResponse.access_token;
        $('driveStatus').className = 'notice ok mt-3';
        $('driveStatus').innerHTML = '已取得 Google Drive 授權。附件會上傳至承辦人自己的 Google Drive。';
        toast('Google Drive 已連接。', 'ok');
        resolve(driveAccessToken);
      }
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }).catch(err => {
    console.error(err);
    toast('Drive 授權失敗。', 'danger');
    return null;
  });
}

async function uploadAttachmentToDriveOrDemo(file, c, serialNo) {
  if (c.uploadMode === 'appsScript' && c.uploadEndpoint) {
    return uploadAttachmentToAppsScript(file, c, serialNo);
  }
  if (c.uploadMode === 'appsScript' && !c.uploadEndpoint) {
    toast('本案設定為承辦人 Drive，但尚未填 Apps Script 上傳網址；已改用 Demo 記錄。', 'warn');
    return { mode: 'demo', fileName: file.name, size: file.size, uploadedAt: nowText(), reason: 'missing_apps_script_endpoint' };
  }
  if (!driveAccessToken) await requestDriveAccess();
  if (!driveAccessToken) {
    return { mode: 'demo', fileName: file.name, size: file.size, uploadedAt: nowText() };
  }
  const metadata = {
    name: `${sanitizeFilename(c.title)}_${serialNo}_${sanitizeFilename(file.name)}`,
    mimeType: file.type || 'application/octet-stream'
  };
  const boundary = 'fire_registration_boundary_' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const reader = await file.arrayBuffer();
  const multipartRequestBody = new Blob([
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    reader,
    closeDelimiter
  ], { type: `multipart/related; boundary=${boundary}` });

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driveAccessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipartRequestBody
  });
  if (!res.ok) throw new Error('Google Drive 上傳失敗：' + await res.text());
  const data = await res.json();
  return { mode: 'drive', fileName: file.name, size: file.size, driveFileId: data.id, webViewLink: data.webViewLink || '', uploadedAt: nowText() };
}


async function uploadAttachmentToAppsScript(file, c, serialNo) {
  const base64 = await fileToBase64(file);
  const payload = {
    serialNo,
    caseTitle: c.title,
    folderName: c.driveFolderName || '消防局報名系統附件',
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileBase64: base64.split(',')[1] || base64,
    uploadedAt: nowText()
  };
  try {
    const res = await fetch(c.uploadEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Apps Script 上傳失敗');
    return { mode: 'appsScript', fileName: file.name, size: file.size, driveFileId: data.fileId || '', webViewLink: data.webViewLink || '', uploadedAt: nowText() };
  } catch (err) {
    console.warn(err);
    toast('Apps Script 上傳未取得確認，已保留本次附件紀錄。請承辦人檢查 Drive 資料夾。', 'warn');
    return { mode: 'appsScript_unconfirmed', fileName: file.name, size: file.size, uploadedAt: nowText(), error: err.message };
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function registrationsFor(caseId) { return registrations.filter(r => r.caseId === caseId); }

function renderReports() {
  renderCaseSelects();
  const manageable = cases.filter(c => canManageCase(c));
  const c = getCase(reportCaseId) || manageable[0];
  if (!c) {
    $('registrationsTable').innerHTML = '<div class="notice warn">目前沒有您可管理的案件。</div>';
    return;
  }
  if (!canManageCase(c)) return;
  reportCaseId = c.id;
  $('reportCaseSelect').value = c.id;
  $('toggleCaseStatusBtn').textContent = c.status === 'open' ? '將案件改為已截止' : '重新開放案件';
  const regs = registrationsFor(c.id);
  $('reportTotal').textContent = regs.length;
  $('reportParking').textContent = regs.filter(r => r.formData?.parkingNeed === '需要停車').length;
  $('reportMealMeat').textContent = regs.filter(r => r.formData?.meal === '葷').length;
  $('reportMealVeg').textContent = regs.filter(r => r.formData?.meal === '素').length;
  renderRegistrationsTable(regs, c);
  renderReportCharts(regs, c);
}

function renderRegistrationsTable(regs, c) {
  $('registrationsTable').innerHTML = `<table class="data-table"><thead><tr><th>序號</th><th>姓名</th><th>單位</th><th>職稱</th><th>性別</th><th>年齡</th><th>停車</th><th>餐食</th><th>附件</th></tr></thead><tbody>${regs.map(r => `<tr><td><small>${safe(r.serialNo)}</small></td><td><strong>${safe(r.formData?.applicantName)}</strong></td><td>${c.audience === 'external' ? '<span class="badge gray">外部不統計</span>' : safe(r.formData?.unit)}</td><td>${safe(r.formData?.position)}</td><td>${safe(r.formData?.gender)}</td><td>${safe(r.formData?.age)}</td><td>${safe(r.formData?.parkingStatus)}</td><td>${safe(r.formData?.meal)}</td><td>${r.attachment ? '有' : '無'}</td></tr>`).join('')}</tbody></table>`;
}

function renderReportCharts(regs, c) {
  reportCharts.forEach(ch => ch.destroy());
  reportCharts = [];
  const chartDefs = [
    ['genderChart', '性別', countBy(regs, r => r.formData?.gender || '未填')],
    ['unitChart', '單位', c.audience === 'external' ? { '外部單位不統計': regs.length } : countBy(regs, r => r.formData?.unit || '未填')],
    ['positionChart', '職稱', c.audience === 'external' ? { '外部人員不填職稱': regs.length } : countBy(regs, r => `${r.formData?.dutyType === 'office' ? '內勤' : '外勤'}-${r.formData?.position || '未填'}`)],
    ['ageChart', '年齡', countBy(regs, r => ageBucket(Number(r.formData?.age || 0), c))]
  ];
  chartDefs.forEach(([id, label, obj]) => {
    const labels = Object.keys(obj);
    const values = Object.values(obj);
    const chart = new Chart($(id), {
      type: id === 'unitChart' || id === 'positionChart' || id === 'ageChart' ? 'bar' : 'doughnut',
      data: { labels, datasets: [{ label, data: values, borderWidth: 1, borderRadius: 8 }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: id === 'genderChart' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
    reportCharts.push(chart);
  });
}

function countBy(list, getter) {
  return list.reduce((acc, item) => {
    const key = getter(item) || '未填';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function ageBucket(age, c) {
  if (!age) return '未填';
  if (c.ageBucketMode === 'custom' && c.customAgeBuckets) {
    const parts = c.customAgeBuckets.split(',').map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (p.endsWith('+')) {
        const min = Number(p.replace('+',''));
        if (age >= min) return p;
      } else if (p.includes('-')) {
        const [min, max] = p.split('-').map(Number);
        if (age >= min && age <= max) return p;
      }
    }
    return '其他';
  }
  const start = Math.floor(age / 5) * 5;
  return `${start}-${start + 4}歲`;
}

function exportExcelWorkbook() {
  const c = getCase(reportCaseId);
  if (!c) return toast('請先選擇案件。', 'danger');
  const regs = registrationsFor(c.id);
  const wb = XLSX.utils.book_new();
  const main = regs.map((r, i) => rowForExport(r, c, i + 1));
  const sign = regs.map((r, i) => ({ 序號: i + 1, 單位: unitText(r, c), 職稱: r.formData?.position || '', 姓名: r.formData?.applicantName || '', 簽到: '', 簽退: '' }));
  const meal = regs.filter(r => ['葷','素'].includes(r.formData?.meal)).map((r, i) => ({ 序號: i + 1, 單位: unitText(r, c), 職稱: r.formData?.position || '', 姓名: r.formData?.applicantName || '', 餐食: r.formData?.meal || '', 簽收欄位: '' }));
  const parking = regs.filter(r => r.formData?.parkingNeed === '需要停車').map((r, i) => ({ 序號: i + 1, 姓名: r.formData?.applicantName || '', 單位: unitText(r, c), 電話: r.formData?.phone || '', 停車序位: r.formData?.parkingStatus || '' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(main), '報名名冊');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sign), '簽到表');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meal), '餐食簽收');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parking), '停車名冊');
  XLSX.writeFile(wb, `${sanitizeFilename(c.title)}_名冊.xlsx`);
  toast('Excel 已產出。', 'ok');
}

function rowForExport(r, c, index) {
  const row = {
    序號: index,
    系統序號: r.serialNo,
    姓名: r.formData?.applicantName || '',
    電話: r.formData?.phone || '',
    電子郵件: r.formData?.email || '',
    性別: r.formData?.gender || '',
    年齡: r.formData?.age || '',
    單位: unitText(r, c),
    分隊科室: r.formData?.subUnit || '',
    內外勤: dutyText(r.formData?.dutyType),
    職稱: r.formData?.position || '',
    停車需求: r.formData?.parkingNeed || '',
    停車序位: r.formData?.parkingStatus || '',
    餐食: r.formData?.meal || '',
    備註: r.formData?.note || '',
    附件: r.attachment?.webViewLink || r.attachment?.fileName || '',
    報名時間: r.submittedAtMillis ? new Date(r.submittedAtMillis).toLocaleString('zh-TW', { hour12: false }) : ''
  };
  normalizeCustomFields(c.customFields).filter(f => f.active !== false).forEach(f => {
    const val = r.formData?.[`custom_${f.id}`];
    row[f.label] = Array.isArray(val) ? val.join('、') : safe(val);
  });
  return row;
}

function rowsForRegistration(reg, c) {
  const settings = normalizeFieldSettings(c.fieldSettings, c.audience);
  const rows = [['系統序號', reg.serialNo]];
  const add = (key, value) => {
    if (settings[key]?.active !== false) rows.push([settings[key]?.label || FIELD[key] || key, value]);
  };
  add('applicantName', reg.formData.applicantName);
  add('phone', reg.formData.phone);
  add('email', reg.formData.email);
  add('gender', reg.formData.gender);
  add('age', reg.formData.age);
  if (c.audience !== 'external') {
    add('unit', unitText(reg, c));
    add('dutyType', dutyText(reg.formData.dutyType));
    add('position', reg.formData.position);
  }
  add('parkingNeed', reg.formData.parkingNeed);
  if (settings.parkingNeed?.active !== false) rows.push(['停車序位', reg.formData.parkingStatus]);
  add('meal', reg.formData.meal);
  normalizeCustomFields(c.customFields).filter(f => f.active !== false).forEach(f => {
    const val = reg.formData?.[`custom_${f.id}`];
    rows.push([f.label, Array.isArray(val) ? val.join('、') : safe(val)]);
  });
  add('note', reg.formData.note || '');
  return rows;
}

function unitText(r, c) {
  if (c.audience === 'external') return OUTSIDE_PLACEHOLDER;
  return [r.formData?.unit, r.formData?.subUnit].filter(Boolean).join('／');
}
function dutyText(v) { return v === 'office' ? '內勤' : v === 'field' ? '外勤' : ''; }

async function exportRegistrationPdf(reg, c) {
  const rows = rowsForRegistration(reg, c);
  await renderPdfPage({ title: `${c.title}｜正式報名表`, agency: c.agencyName, serial: reg.serialNo, rows, note: c.note, footer: '本文件由消防局多功能報名系統自動產出，可作為公文系統附件。', filename: `${sanitizeFilename(c.title)}_${reg.serialNo}_報名表.pdf`, signature: true });
}

async function exportSimplePdf(type) {
  const c = getCase(reportCaseId);
  if (!c) return;
  const regs = registrationsFor(c.id);
  const isMeal = type === 'meal';
  const list = isMeal ? regs.filter(r => ['葷','素'].includes(r.formData?.meal)) : regs;
  const rows = list.map((r, i) => isMeal
    ? [`${i + 1}`, unitText(r, c), r.formData?.position || '', r.formData?.applicantName || '', r.formData?.meal || '', '']
    : [`${i + 1}`, unitText(r, c), r.formData?.position || '', r.formData?.applicantName || '', '', '']
  );
  const headers = isMeal ? ['序號','單位','職稱','姓名','餐食（葷素）','簽收欄位'] : ['序號','單位','職稱','姓名','簽到','簽退'];
  await renderListPdf({ agency: c.agencyName, title: `${c.title}｜${isMeal ? '餐食簽收表' : '簽到表'}`, headers, rows, filename: `${sanitizeFilename(c.title)}_${isMeal ? '餐食簽收表' : '簽到表'}.pdf` });
}

async function exportStatsPdf() {
  const c = getCase(reportCaseId);
  if (!c) return;
  const regs = registrationsFor(c.id);
  const stats = buildStatsRows(regs, c);
  await renderPdfPage({ title: `${c.title}｜統計報告`, agency: c.agencyName, serial: '統計輸出', rows: stats, note: '本統計排除外部單位之單位／職稱分析；外部報名案件不顯示單位與職稱欄位。', footer: `產出時間：${nowText()}`, filename: `${sanitizeFilename(c.title)}_統計報告.pdf`, signature: false });
}

function buildStatsRows(regs, c) {
  const gender = countBy(regs, r => r.formData?.gender || '未填');
  const meals = countBy(regs, r => r.formData?.meal || '未填');
  const parking = countBy(regs, r => r.formData?.parkingStatus?.startsWith('正取') ? '停車正取' : r.formData?.parkingStatus?.startsWith('候補') ? '停車候補' : '不需停車');
  const age = countBy(regs, r => ageBucket(Number(r.formData?.age || 0), c));
  return [
    ['報名總人數', String(regs.length)],
    ['性別統計', objText(gender)],
    ['餐食需求', objText(meals)],
    ['停車需求', objText(parking)],
    ['年齡區間', objText(age)],
    ['單位統計', c.audience === 'external' ? '外部報名案件：不統計單位。' : objText(countBy(regs, r => r.formData?.unit || '未填'))],
    ['職稱統計', c.audience === 'external' ? '外部報名案件：不填寫職稱。' : objText(countBy(regs, r => `${dutyText(r.formData?.dutyType)}-${r.formData?.position || '未填'}`))]
  ];
}

function objText(obj) { return Object.entries(obj).map(([k,v]) => `${k}：${v}`).join('；'); }

async function renderPdfPage({ title, agency, serial, rows, note, footer, filename, signature }) {
  const box = $('pdfCanvas');
  box.innerHTML = `<div class="pdf-page"><div class="pdf-header"><div><small>${safe(agency)}</small><h1>${safe(title)}</h1></div><div class="serial-box"><div style="font-size:11px;opacity:.8">序號</div><div>${safe(serial)}</div></div></div><table class="pdf-table"><tbody>${rows.map(([k,v]) => `<tr><th>${safe(k)}</th><td>${safe(v)}</td></tr>`).join('')}</tbody></table><div class="notice mt-4">${safe(note)}</div>${signature ? `<div class="signature-grid"><div class="signature-line">報名人簽名</div><div class="signature-line">承辦人核章</div><div class="signature-line">單位主管批示</div></div>` : ''}<div class="pdf-footer"><span>產出日期：${todayISO()}</span><span>${safe(footer)}</span></div></div>`;
  await savePdfFromElement(box.firstElementChild, filename);
}

async function renderListPdf({ agency, title, headers, rows, filename }) {
  const box = $('pdfCanvas');
  const displayRows = rows.length ? rows : [['', '', '', '目前尚無報名資料', '', '']];
  box.innerHTML = `<div class="pdf-page"><div class="pdf-header"><div><small>${safe(agency)}</small><h1>${safe(title)}</h1></div><div class="serial-box"><div>${todayISO()}</div></div></div><table class="pdf-table list-pdf-table"><thead><tr>${headers.map(h => `<th>${safe(h)}</th>`).join('')}</tr></thead><tbody>${displayRows.map(row => `<tr>${row.map(v => `<td style="height:38px">${safe(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="pdf-footer"><span>產出日期：${todayISO()}</span><span>消防局多功能報名系統</span></div></div>`;
  await savePdfFromElement(box.firstElementChild, filename);
}

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function preparePdfCanvas() {
  const box = $('pdfCanvas');
  box.classList.remove('hidden');
  box.style.display = 'block';
  box.style.position = 'fixed';
  box.style.left = '0';
  box.style.top = '0';
  box.style.width = '794px';
  box.style.opacity = '0';
  box.style.pointerEvents = 'none';
  box.style.zIndex = '-1';
  box.setAttribute('aria-hidden', 'true');
  return box;
}

function hidePdfCanvas() {
  const box = $('pdfCanvas');
  box.classList.add('hidden');
  box.removeAttribute('style');
}

function openPrintablePreview(el, filename) {
  const css = Array.from(document.styleSheets)
    .map(sheet => {
      try { return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'); }
      catch (_) { return ''; }
    })
    .join('\n');
  const win = window.open('', '_blank');
  if (!win) {
    toast('瀏覽器阻擋 PDF 預覽視窗。請允許彈出式視窗，或改用桌機瀏覽器下載。', 'warn');
    return;
  }
  win.document.open();
  win.document.write(`<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safe(filename)}</title><style>${css} body{background:#f3f4f6;margin:0;padding:20px}.pdf-page{margin:0 auto;box-shadow:0 16px 40px rgba(0,0,0,.18)}.print-actions{max-width:794px;margin:0 auto 16px;display:flex;gap:8px}.print-actions button{font-size:16px;padding:10px 14px;border-radius:10px;border:1px solid #d0d5dd;background:#fff}@media print{body{background:#fff;padding:0}.print-actions{display:none}.pdf-page{box-shadow:none;margin:0}}</style></head><body><div class="print-actions"><button onclick="window.print()">列印／另存 PDF</button><button onclick="window.close()">關閉</button></div>${el.outerHTML}</body></html>`);
  win.document.close();
  toast('已開啟 PDF 預覽頁，可使用瀏覽器列印／另存 PDF。', 'ok');
}

function downloadOrPreviewPdf(pdf, filename) {
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  if (!isIOS) a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function savePdfFromElement(el, filename) {
  if (!el) return toast('PDF 內容尚未建立，請重新操作一次。', 'danger');
  const box = preparePdfCanvas();
  try {
    toast('正在產出 PDF，請稍候。');
    await waitFrame();
    if (!window.html2canvas || !window.jspdf?.jsPDF) {
      openPrintablePreview(el, filename);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) throw new Error('PDF 版面尺寸為 0，已改用預覽模式。');
    const scale = Math.min(2, Math.max(1.35, window.devicePixelRatio || 1.5));
    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: Math.ceil(el.scrollWidth || rect.width),
      height: Math.ceil(el.scrollHeight || rect.height),
      windowWidth: Math.ceil(el.scrollWidth || rect.width),
      windowHeight: Math.ceil(el.scrollHeight || rect.height)
    });
    if (!canvas.width || !canvas.height) throw new Error('PDF 轉圖失敗，已改用預覽模式。');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = canvas.height * imgW / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.96);
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
    let heightLeft = imgH - pageH;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
      heightLeft -= pageH;
    }
    downloadOrPreviewPdf(pdf, filename);
    toast('PDF 已產出；手機瀏覽器可能會以預覽頁開啟，桌機通常會直接下載。', 'ok');
  } catch (err) {
    console.error(err);
    openPrintablePreview(el, filename);
  } finally {
    setTimeout(() => hidePdfCanvas(), 300);
  }
}

function renderEnvStatus() {
  const rows = [
    ['Firebase 狀態', usingFirebase ? '已設定' : '未設定／Demo 模式'],
    ['Google Drive OAuth', validGoogleClient() ? '已填入 Client ID' : '尚未填入 Client ID'],
    ['目前模式', usingDemoMode ? 'Demo/localStorage' : 'Firebase/Firestore'],
    ['系統管理員', ADMIN_EMAIL],
    ['Firestore 專案', CONFIG.firebaseConfig?.projectId || '未填寫']
  ];
  $('envStatus').innerHTML = rows.map(([k,v]) => `<div class="setting-row"><strong>${k}</strong><span>${v}</span></div>`).join('');
}

function renderPositionRules() {
  $('positionRuleBox').innerHTML = `<div><strong>外勤：</strong>${POSITIONS.field.join('、')}</div><div><strong>內勤：</strong>${POSITIONS.office.join('、')}</div><div><strong>外部人員：</strong>不填寫單位與職稱，不列入單位／職稱統計。</div>`;
}

function seedDemoData(showToast = true) {
  const demoCase = {
    id: 'case_demo_001', agencyName: '新北市政府消防局', title: '114年度進階搶救技術訓練報名', type: '訓練報名', audience: 'internal', status: 'open', deadline: todayISO(), quota: 30, parkingSlots: 5, attachmentLimitMB: 10, attachmentMode: 'optional', ageBucketMode: 'five', customAgeBuckets: '', note: '請報名人確認資料正確。', uploadMode: 'appsScript', uploadEndpoint: '', driveFolderName: '消防局報名系統附件', serialPrefix: 'NTP-FIRE', caseCode: 'TRAIN', createdByEmail: ADMIN_EMAIL, createdAtMillis: Date.now()
  };
  const demoCase2 = {
    id: 'case_demo_002', agencyName: '新北市政府消防局', title: '外部講習報名測試', type: '講習報名', audience: 'external', status: 'open', deadline: todayISO(), quota: 80, parkingSlots: 2, attachmentLimitMB: 10, attachmentMode: 'none', ageBucketMode: 'custom', customAgeBuckets: '18-24,25-29,30-34,35-39,40+', note: '外部人員不需填寫單位與職稱。', uploadMode: 'appsScript', uploadEndpoint: '', driveFolderName: '消防局報名系統附件', serialPrefix: 'NTP-FIRE', caseCode: 'LECTURE', createdByEmail: ADMIN_EMAIL, createdAtMillis: Date.now() - 1000
  };
  const demoRegs = [
    { id:'reg_demo_1', caseId: demoCase.id, serialNo:'NTP-FIRE-TRAIN-20260520-A7K3', applicantName:'陳志遠', formData:{ applicantName:'陳志遠', phone:'0912-000-001', email:'chen@example.com', gender:'男', age:'33', unitGroup:'field', unit:'第三救災救護大隊', subUnit:'三重分隊', dutyType:'field', position:'小隊長', parkingNeed:'需要停車', parkingStatus:'正取第 1 車位', meal:'葷', note:'' }, submittedAtMillis:Date.now()-50000 },
    { id:'reg_demo_2', caseId: demoCase.id, serialNo:'NTP-FIRE-TRAIN-20260520-B8Q2', applicantName:'林美珍', formData:{ applicantName:'林美珍', phone:'0912-000-002', email:'lin@example.com', gender:'女', age:'29', unitGroup:'office', unit:'緊急救護科', subUnit:'救護股', dutyType:'office', position:'科員', parkingNeed:'不需要停車', parkingStatus:'不需停車', meal:'素', note:'' }, submittedAtMillis:Date.now()-40000 },
    { id:'reg_demo_3', caseId: demoCase2.id, serialNo:'NTP-FIRE-LECTURE-20260520-C9L1', applicantName:'王大明', formData:{ applicantName:'王大明', phone:'0912-000-003', email:'wang@example.com', gender:'男', age:'42', unitGroup:'external', unit:OUTSIDE_PLACEHOLDER, dutyType:'external', position:'', parkingNeed:'需要停車', parkingStatus:'正取第 1 車位', meal:'葷', note:'' }, submittedAtMillis:Date.now()-30000 }
  ];
  const store = loadStore();
  store.cases = [demoCase, demoCase2];
  store.registrations = demoRegs;
  saveStore(store);
  cases = store.cases;
  registrations = store.registrations;
  selectedCaseId = demoCase.id;
  reportCaseId = demoCase.id;
  renderAll();
  if (showToast) toast('已建立示範資料。', 'ok');
}

function clearDemoData() {
  localStorage.removeItem(STORAGE_KEY);
  cases = [];
  registrations = [];
  selectedCaseId = '';
  reportCaseId = '';
  renderAll();
  toast('本機 Demo 資料已清除。', 'ok');
}

function toast(message, type = '') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast ${type ? 'toast-' + type : ''}`;
  el.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add('hidden'), 3800);
}

init();
