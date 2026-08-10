/**
 * Ramani QR Studio - Google Apps Script tracking backend
 *
 * Bind this script to the Ramani-QR-Studio Google Sheet.
 * Run setupDatabase() once, then deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * IMPORTANT: The frontend uses JSONP because it is hosted on GitHub Pages.
 */

const QR_SHEET = 'QR_CODES';
const SCAN_SHEET = 'SCANS';

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let qr = ss.getSheetByName(QR_SHEET);
  let scans = ss.getSheetByName(SCAN_SHEET);

  if (!qr) qr = ss.insertSheet(QR_SHEET);
  if (!scans) scans = ss.insertSheet(SCAN_SHEET);

  if (qr.getLastRow() === 0) {
    qr.appendRow(['QR Name', 'QR Type', 'Token', 'Created At', 'Active']);
    qr.getRange(1, 1, 1, 5).setFontWeight('bold');
    qr.setFrozenRows(1);
  }

  if (scans.getLastRow() === 0) {
    scans.appendRow(['Scan ID', 'QR Name', 'QR Type', 'Timestamp']);
    scans.getRange(1, 1, 1, 4).setFontWeight('bold');
    scans.setFrozenRows(1);
  }

  return 'Ramani QR Studio database is ready.';
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
        result = registerQr_(p.name, p.type, p.token);
        break;
      case 'scan':
        result = recordScan_(p.name, p.token);
        break;
      case 'analytics':
        result = analytics_();
        break;
      case 'detail':
        result = detail_(p.name);
        break;
      default:
        result = { ok: false, message: 'Unknown action.' };
    }

    return respond_(result, p.callback);
  } catch (err) {
    return respond_({ ok: false, message: err && err.message ? err.message : String(err) }, e && e.parameter && e.parameter.callback);
  }
}

function checkName_(rawName) {
  const name = clean_(rawName);
  if (!name) return { ok: false, available: false, message: 'QR Name is required.' };
  if (!validName_(name)) return { ok: false, available: false, message: 'Invalid QR Name.' };
  return { ok: true, available: !findQrByName_(name), name: name };
}

function registerQr_(rawName, rawType, rawToken) {
  const name = clean_(rawName);
  const type = clean_(rawType).toLowerCase();
  const token = clean_(rawToken);

  if (!name || !validName_(name)) return { ok: false, message: 'Enter a valid unique QR Name.' };
  if (!['url', 'text', 'email', 'phone', 'sms', 'wifi'].includes(type)) return { ok: false, message: 'Invalid QR type.' };
  if (!token || token.length < 8) return { ok: false, message: 'Invalid tracking token.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const existing = findQrByName_(name);
    if (existing) return { ok: false, message: 'QR Name already exists. Choose another name.' };

    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QR_SHEET).appendRow([
      name,
      type,
      token,
      new Date(),
      true
    ]);

    return { ok: true, name: name, type: type };
  } finally {
    lock.releaseLock();
  }
}

function recordScan_(rawName, rawToken) {
  const name = clean_(rawName);
  const token = clean_(rawToken);
  if (!name || !token) return { ok: false, message: 'Invalid tracked QR.' };

  const qr = findQrByName_(name);
  if (!qr) return { ok: false, message: 'QR Name was not found.' };
  if (!qr.active) return { ok: false, message: 'This QR is inactive.' };
  if (qr.token !== token) return { ok: false, message: 'Invalid QR tracking token.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const scanId = 'SCAN-' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
    const timestamp = new Date();
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCAN_SHEET).appendRow([
      scanId,
      qr.name,
      qr.type,
      timestamp
    ]);
    return { ok: true, name: qr.name, type: qr.type, timestamp: timestamp.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function analytics_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qrRows = ss.getSheetByName(QR_SHEET).getDataRange().getValues();
  const scanRows = ss.getSheetByName(SCAN_SHEET).getDataRange().getValues();

  const counts = {};
  for (let i = 1; i < scanRows.length; i++) {
    const name = String(scanRows[i][1] || '');
    if (!name) continue;
    const key = normalize_(name);
    if (!counts[key]) counts[key] = { count: 0, last: null };
    counts[key].count++;
    const t = scanRows[i][3];
    if (t && (!counts[key].last || new Date(t) > new Date(counts[key].last))) counts[key].last = t;
  }

  const codes = [];
  for (let i = 1; i < qrRows.length; i++) {
    const name = String(qrRows[i][0] || '');
    if (!name) continue;
    const key = normalize_(name);
    const stat = counts[key] || { count: 0, last: null };
    codes.push({
      name: name,
      type: String(qrRows[i][1] || ''),
      createdAt: iso_(qrRows[i][3]),
      active: qrRows[i][4] !== false,
      scanCount: stat.count,
      lastScannedAt: iso_(stat.last)
    });
  }

  codes.sort(function(a, b) {
    return (b.scanCount - a.scanCount) || a.name.localeCompare(b.name);
  });

  return { ok: true, codes: codes };
}

function detail_(rawName) {
  const name = clean_(rawName);
  if (!name) return { ok: false, message: 'QR Name is required.' };

  const qr = findQrByName_(name);
  if (!qr) return { ok: false, message: 'QR Name not found.' };

  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCAN_SHEET).getDataRange().getValues();
  const scans = [];
  for (let i = 1; i < rows.length; i++) {
    if (normalize_(rows[i][1]) === normalize_(name)) {
      scans.push({ scanId: String(rows[i][0] || ''), timestamp: iso_(rows[i][3]) });
    }
  }
  scans.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });

  return {
    ok: true,
    name: qr.name,
    type: qr.type,
    createdAt: iso_(qr.createdAt),
    scanCount: scans.length,
    scans: scans
  };
}

function findQrByName_(rawName) {
  const target = normalize_(rawName);
  if (!target) return null;
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QR_SHEET).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normalize_(rows[i][0]) === target) {
      return {
        name: String(rows[i][0] || ''),
        type: String(rows[i][1] || ''),
        token: String(rows[i][2] || ''),
        createdAt: rows[i][3],
        active: rows[i][4] !== false
      };
    }
  }
  return null;
}

function clean_(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
}

function normalize_(v) {
  return clean_(v).toLowerCase();
}

function validName_(name) {
  return /^[A-Za-z0-9][A-Za-z0-9 _.-]{2,59}$/.test(name);
}

function iso_(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function respond_(data, callback) {
  const json = JSON.stringify(data);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
