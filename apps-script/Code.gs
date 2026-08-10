const QR_SHEET = 'QR_CODES';
const SCAN_SHEET = 'SCANS';

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let qr = ss.getSheetByName(QR_SHEET);
  let scans = ss.getSheetByName(SCAN_SHEET);

  if (!qr) qr = ss.insertSheet(QR_SHEET);
  if (!scans) scans = ss.insertSheet(SCAN_SHEET);

  if (qr.getLastRow() === 0) {
    qr.appendRow(['QR ID', 'QR Name', 'QR Type', 'Payload', 'Created At', 'Active']);
    qr.getRange(1, 1, 1, 6).setFontWeight('bold');
    qr.setFrozenRows(1);
  }

  if (scans.getLastRow() === 0) {
    scans.appendRow(['Scan ID', 'QR ID', 'QR Name', 'QR Type', 'Scanned At']);
    scans.getRange(1, 1, 1, 5).setFontWeight('bold');
    scans.setFrozenRows(1);
  }

  return 'Database ready';
}

function doGet(e) {
  try {
    setupDatabase();
    const p = (e && e.parameter) || {};
    const action = String(p.action || 'health').toLowerCase();
    let result;

    switch (action) {
      case 'health':
        result = { ok: true, message: 'Ramani QR Studio API is running.' };
        break;
      case 'checkname':
        result = checkName_(p.name);
        break;
      case 'register':
      case 'create':
        result = registerQr_(p.qrName || p.name, p.qrType || p.type, p.payload);
        break;
      case 'scan':
        result = recordScan_(p.id);
        break;
      case 'analytics':
        result = analytics_();
        break;
      case 'details':
        result = details_(p.name);
        break;
      default:
        result = { ok: false, error: 'Unknown action: ' + action };
    }

    return output_(result, p.callback);
  } catch (err) {
    const cb = e && e.parameter ? e.parameter.callback : '';
    return output_({ ok: false, error: err && err.message ? err.message : String(err) }, cb);
  }
}

function doPost(e) {
  try {
    setupDatabase();
    const data = parseBody_(e);
    const action = String(data.action || '').toLowerCase();
    let result;
    if (action === 'register' || action === 'create') {
      result = registerQr_(data.qrName || data.name, data.qrType || data.type, data.payload);
    } else {
      result = { ok: false, error: 'Unknown POST action.' };
    }
    return output_(result, data.callback);
  } catch (err) {
    return output_({ ok: false, error: err && err.message ? err.message : String(err) }, '');
  }
}

function checkName_(name) {
  const clean = clean_(name);
  if (!clean) return { ok: false, available: false, error: 'QR Name is required.' };
  return { ok: true, available: !findByName_(clean), name: clean };
}

function registerQr_(qrName, qrType, payload) {
  qrName = clean_(qrName);
  qrType = clean_(qrType).toLowerCase();
  payload = String(payload || '').trim();

  if (!qrName) return { ok: false, error: 'QR Name is required.' };
  if (!qrType) return { ok: false, error: 'QR Type is required.' };
  if (!payload) return { ok: false, error: 'QR content is required.' };
  if (payload.length > 5000) return { ok: false, error: 'QR content is too long for tracking. Keep it below 5,000 characters.' };
  if (findByName_(qrName)) return { ok: false, error: 'QR Name already exists. Please use a unique name.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (findByName_(qrName)) return { ok: false, error: 'QR Name already exists. Please use a unique name.' };
    const id = 'QR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QR_SHEET).appendRow([
      id, qrName, qrType, payload, new Date(), true
    ]);
    return { ok: true, qrId: id, qrName: qrName, qrType: qrType };
  } finally {
    lock.releaseLock();
  }
}

function recordScan_(id) {
  id = clean_(id);
  if (!id) return { ok: false, error: 'QR ID is required.' };
  const qr = findById_(id);
  if (!qr) return { ok: false, error: 'QR code was not found.' };
  if (!qr.active) return { ok: false, error: 'This QR code is inactive.' };

  const scanId = 'SCAN-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCAN_SHEET).appendRow([
    scanId, qr.qrId, qr.qrName, qr.qrType, new Date()
  ]);

  return {
    ok: true,
    qrId: qr.qrId,
    qrName: qr.qrName,
    qrType: qr.qrType,
    payload: qr.payload,
    scannedAt: new Date().toISOString()
  };
}

function analytics_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qrs = ss.getSheetByName(QR_SHEET).getDataRange().getValues();
  const scans = ss.getSheetByName(SCAN_SHEET).getDataRange().getValues();
  const stats = {};
  const todayKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  let scansToday = 0;

  for (let i = 1; i < scans.length; i++) {
    const id = String(scans[i][1] || '');
    if (!id) continue;
    if (!stats[id]) stats[id] = { total: 0, lastScan: null };
    stats[id].total++;
    const d = scans[i][4] ? new Date(scans[i][4]) : null;
    if (d && (!stats[id].lastScan || d > stats[id].lastScan)) stats[id].lastScan = d;
    if (d && Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') === todayKey) scansToday++;
  }

  const items = [];
  for (let i = 1; i < qrs.length; i++) {
    if (!qrs[i][0]) continue;
    const id = String(qrs[i][0]);
    const s = stats[id] || { total: 0, lastScan: null };
    items.push({
      qrId: id,
      qrName: String(qrs[i][1] || ''),
      qrType: String(qrs[i][2] || ''),
      createdAt: iso_(qrs[i][4]),
      active: qrs[i][5] !== false,
      totalScans: s.total,
      lastScan: iso_(s.lastScan)
    });
  }
  items.sort((a, b) => b.totalScans - a.totalScans || a.qrName.localeCompare(b.qrName));
  return { ok: true, totalQrCodes: items.length, totalScans: Math.max(0, scans.length - 1), scansToday: scansToday, items: items };
}

function details_(name) {
  name = clean_(name);
  if (!name) return { ok: false, error: 'QR Name is required.' };
  const qr = findByName_(name);
  if (!qr) return { ok: false, error: 'QR Name not found.' };

  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCAN_SHEET).getDataRange().getValues();
  const scans = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === qr.qrId) scans.push({ scanId: String(rows[i][0]), scannedAt: iso_(rows[i][4]) });
  }
  scans.sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));
  return {
    ok: true,
    qr: { qrId: qr.qrId, qrName: qr.qrName, qrType: qr.qrType, payload: qr.payload, createdAt: iso_(qr.createdAt), active: qr.active },
    totalScans: scans.length,
    lastScan: scans.length ? scans[0].scannedAt : null,
    scans: scans
  };
}

function findById_(id) {
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QR_SHEET).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === id) return rowToQr_(rows[i]);
  }
  return null;
}

function findByName_(name) {
  const target = normalize_(name);
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QR_SHEET).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normalize_(rows[i][1]) === target) return rowToQr_(rows[i]);
  }
  return null;
}

function rowToQr_(r) {
  return { qrId: String(r[0] || ''), qrName: String(r[1] || ''), qrType: String(r[2] || ''), payload: String(r[3] || ''), createdAt: r[4], active: r[5] !== false };
}

function parseBody_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (_) {}
  }
  return e.parameter || {};
}

function output_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function clean_(v) { return String(v || '').trim().replace(/\s+/g, ' '); }
function normalize_(v) { return clean_(v).toLowerCase(); }
function iso_(v) { if (!v) return null; try { return new Date(v).toISOString(); } catch (_) { return String(v); } }
