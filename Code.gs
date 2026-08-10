/**
 * Ramani QR Studio - Google Apps Script backend
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1p56ZtDlNgadG6X90Zc7faQfllidoFrEYmOE8Wi018yg/edit
 *
 * Deploy as Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1p56ZtDlNgadG6X90Zc7faQfllidoFrEYmOE8Wi018yg',
  QR_SHEET: 'QR_Codes',
  SCAN_SHEET: 'QR_Scans',
  QR_HEADERS: [
    'QR Name',
    'Type',
    'Token',
    'Created At',
    'Scan Count',
    'Last Scanned At'
  ],
  SCAN_HEADERS: [
    'Scan ID',
    'QR Name',
    'Token',
    'Timestamp',
    'Device',
    'Browser',
    'OS',
    'Referrer',
    'IP Address',
    'Country',
    'Region',
    'City',
    'Latitude',
    'Longitude',
    'User Agent'
  ],
  VALID_TYPES: ['url', 'text', 'email', 'phone', 'sms', 'wifi']
});

/** Run this once manually from the Apps Script editor before deployment. */
function setup() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const qr = ensureSheet_(ss, CONFIG.QR_SHEET, CONFIG.QR_HEADERS);
  const scans = ensureSheet_(ss, CONFIG.SCAN_SHEET, CONFIG.SCAN_HEADERS);

  qr.setFrozenRows(1);
  scans.setFrozenRows(1);
  qr.autoResizeColumns(1, CONFIG.QR_HEADERS.length);
  scans.autoResizeColumns(1, CONFIG.SCAN_HEADERS.length);

  // Make the important columns easier to read.
  qr.setColumnWidth(1, 220);
  qr.setColumnWidth(2, 90);
  qr.setColumnWidth(3, 260);
  qr.setColumnWidth(4, 175);
  qr.setColumnWidth(5, 100);
  qr.setColumnWidth(6, 175);

  scans.setColumnWidth(1, 190);
  scans.setColumnWidth(2, 220);
  scans.setColumnWidth(3, 260);
  scans.setColumnWidth(4, 175);
  scans.setColumnWidth(8, 260);
  scans.setColumnWidth(9, 145);
  scans.setColumnWidth(15, 340);

  return 'Ramani QR Studio sheets are ready.';
}

function doGet(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};
    const action = String(p.action || 'health').toLowerCase();
    let result;

    switch (action) {
      case 'health':
        result = { ok: true, service: 'Ramani QR Studio', timestamp: iso_(new Date()) };
        break;
      case 'checkname':
        result = handleCheckName_(p);
        break;
      case 'register':
        result = handleRegister_(p);
        break;
      case 'scan':
        result = handleScan_(p);
        break;
      case 'analytics':
        result = handleAnalytics_();
        break;
      case 'detail':
        result = handleDetail_(p);
        break;
      case 'delete':
        result = handleDelete_(p);
        break;
      default:
        result = { ok: false, message: 'Unknown action.' };
    }

    return output_(result, p.callback);
  } catch (err) {
    return output_({
      ok: false,
      message: err && err.message ? err.message : String(err)
    }, e && e.parameter ? e.parameter.callback : '');
  }
}

function handleCheckName_(p) {
  const name = cleanName_(p.name);
  if (!isValidName_(name)) {
    return { ok: false, available: false, message: 'Invalid QR Name.' };
  }

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const qrSheet = ensureSheet_(ss, CONFIG.QR_SHEET, CONFIG.QR_HEADERS);
  const found = findQrByName_(qrSheet, name);

  return {
    ok: true,
    available: !found,
    name: name,
    message: found ? 'This QR Name is already in use.' : 'QR Name is available.'
  };
}

function handleRegister_(p) {
  const name = cleanName_(p.name);
  const type = String(p.type || '').toLowerCase().trim();
  const token = clean_(p.token, 200);

  if (!isValidName_(name)) return { ok: false, message: 'Invalid QR Name.' };
  if (CONFIG.VALID_TYPES.indexOf(type) === -1) return { ok: false, message: 'Invalid QR type.' };
  if (!token) return { ok: false, message: 'Missing QR token.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const qrSheet = ensureSheet_(ss, CONFIG.QR_SHEET, CONFIG.QR_HEADERS);
    const found = findQrByName_(qrSheet, name);

    if (found) {
      const existingToken = String(found.values[2] || '');
      const existingType = String(found.values[1] || '').toLowerCase();

      // Idempotent retry for the same QR registration.
      if (existingToken === token && existingType === type) {
        return {
          ok: true,
          registered: true,
          existing: true,
          name: String(found.values[0]),
          type: existingType,
          token: existingToken
        };
      }

      return {
        ok: false,
        registered: false,
        message: 'This QR Name is already registered. Delete it first if you want to reuse the name.'
      };
    }

    const now = new Date();
    qrSheet.appendRow([name, type, token, now, 0, '']);

    return {
      ok: true,
      registered: true,
      name: name,
      type: type,
      token: token,
      createdAt: iso_(now)
    };
  } finally {
    lock.releaseLock();
  }
}

function handleScan_(p) {
  const name = cleanName_(p.name);
  const token = clean_(p.token, 200);

  if (!name || !token) return { ok: false, message: 'Missing QR Name or token.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const qrSheet = ensureSheet_(ss, CONFIG.QR_SHEET, CONFIG.QR_HEADERS);
    const scanSheet = ensureSheet_(ss, CONFIG.SCAN_SHEET, CONFIG.SCAN_HEADERS);
    const found = findQrByName_(qrSheet, name);

    if (!found) return { ok: false, message: 'QR Name not found.' };
    if (String(found.values[2] || '') !== token) return { ok: false, message: 'Invalid QR token.' };

    const now = new Date();
    const currentCount = Number(found.values[4] || 0);
    const nextCount = currentCount + 1;

    qrSheet.getRange(found.row, 5, 1, 2).setValues([[nextCount, now]]);

    const scanId = Utilities.getUuid();
    scanSheet.appendRow([
      scanId,
      String(found.values[0]),
      token,
      now,
      clean_(p.device, 120),
      clean_(p.browser, 120),
      clean_(p.os, 120),
      clean_(p.referrer, 1000),
      clean_(p.ip, 120),
      clean_(p.country, 120),
      clean_(p.region, 160),
      clean_(p.city, 160),
      numberOrBlank_(p.latitude),
      numberOrBlank_(p.longitude),
      clean_(p.userAgent, 1000)
    ]);

    return {
      ok: true,
      recorded: true,
      name: String(found.values[0]),
      type: String(found.values[1]),
      scanCount: nextCount,
      timestamp: iso_(now),
      scanId: scanId
    };
  } finally {
    lock.releaseLock();
  }
}

function handleAnalytics_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const qrSheet = ensureSheet_(ss, CONFIG.QR_SHEET, CONFIG.QR_HEADERS);
  const rows = dataRows_(qrSheet, CONFIG.QR_HEADERS.length);

  const codes = rows.map(function (r) {
    return {
      name: String(r[0] || ''),
      type: String(r[1] || ''),
      token: String(r[2] || ''),
      createdAt: iso_(r[3]),
      scanCount: Number(r[4] || 0),
      lastScannedAt: iso_(r[5])
    };
  }).filter(function (x) { return x.name; });

  codes.sort(function (a, b) {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const totalScans = codes.reduce(function (sum, x) { return sum + Number(x.scanCount || 0); }, 0);
  const scannedCodes = codes.filter(function (x) { return Number(x.scanCount || 0) > 0; }).length;
  const todayKey = dateKey_(new Date());
  const scanSheet = ensureSheet_(ss, CONFIG.SCAN_SHEET, CONFIG.SCAN_HEADERS);
  const scanRows = dataRows_(scanSheet, CONFIG.SCAN_HEADERS.length);
  const todayScans = scanRows.filter(function (r) { return dateKey_(r[3]) === todayKey; }).length;

  return {
    ok: true,
    codes: codes,
    totals: {
      totalCodes: codes.length,
      totalScans: totalScans,
      scannedCodes: scannedCodes,
      todayScans: todayScans
    },
    updatedAt: iso_(new Date())
  };
}

function handleDetail_(p) {
  const name = cleanName_(p.name);
  if (!name) return { ok: false, message: 'Missing QR Name.' };

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const qrSheet = ensureSheet_(ss, CONFIG.QR_SHEET, CONFIG.QR_HEADERS);
  const scanSheet = ensureSheet_(ss, CONFIG.SCAN_SHEET, CONFIG.SCAN_HEADERS);
  const found = findQrByName_(qrSheet, name);

  if (!found) return { ok: false, message: 'QR Name not found.' };

  const canonicalName = String(found.values[0]);
  const token = String(found.values[2] || '');
  const scanRows = dataRows_(scanSheet, CONFIG.SCAN_HEADERS.length);

  const scans = scanRows.filter(function (r) {
    return String(r[1] || '').toLowerCase() === canonicalName.toLowerCase() && String(r[2] || '') === token;
  }).map(function (r) {
    return {
      scanId: String(r[0] || ''),
      timestamp: iso_(r[3]),
      device: String(r[4] || ''),
      browser: String(r[5] || ''),
      os: String(r[6] || ''),
      referrer: String(r[7] || ''),
      ip: String(r[8] || ''),
      country: String(r[9] || ''),
      region: String(r[10] || ''),
      city: String(r[11] || ''),
      latitude: valueOrBlank_(r[12]),
      longitude: valueOrBlank_(r[13]),
      userAgent: String(r[14] || '')
    };
  });

  scans.sort(function (a, b) {
    return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
  });

  return {
    ok: true,
    name: canonicalName,
    type: String(found.values[1] || ''),
    token: token,
    createdAt: iso_(found.values[3]),
    scanCount: Number(found.values[4] || 0),
    lastScannedAt: iso_(found.values[5]),
    scans: scans
  };
}

function handleDelete_(p) {
  const name = cleanName_(p.name);
  const token = clean_(p.token, 200);

  if (!name) return { ok: false, message: 'Missing QR Name.' };
  if (!token) return { ok: false, message: 'Missing QR token.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const qrSheet = ensureSheet_(ss, CONFIG.QR_SHEET, CONFIG.QR_HEADERS);
    const scanSheet = ensureSheet_(ss, CONFIG.SCAN_SHEET, CONFIG.SCAN_HEADERS);
    const found = findQrByName_(qrSheet, name);

    if (!found) return { ok: false, message: 'QR Name not found.' };
    if (String(found.values[2] || '') !== token) return { ok: false, message: 'Invalid QR token.' };

    const canonicalName = String(found.values[0]);

    // Delete scan history bottom-up so row numbers do not shift underneath us.
    const scanLastRow = scanSheet.getLastRow();
    if (scanLastRow > 1) {
      const scanValues = scanSheet.getRange(2, 1, scanLastRow - 1, CONFIG.SCAN_HEADERS.length).getValues();
      for (let i = scanValues.length - 1; i >= 0; i--) {
        const rowName = String(scanValues[i][1] || '');
        const rowToken = String(scanValues[i][2] || '');
        if (rowName.toLowerCase() === canonicalName.toLowerCase() && rowToken === token) {
          scanSheet.deleteRow(i + 2);
        }
      }
    }

    qrSheet.deleteRow(found.row);

    return {
      ok: true,
      deleted: true,
      name: canonicalName,
      message: 'QR deleted. This QR Name can now be reused.'
    };
  } finally {
    lock.releaseLock();
  }
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sheet, headers.length);
  } else {
    const existing = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    let mismatch = false;
    for (let i = 0; i < headers.length; i++) {
      if (existing[i] !== headers[i]) {
        mismatch = true;
        break;
      }
    }
    if (mismatch) {
      throw new Error('Sheet "' + name + '" exists but its header row does not match the required structure.');
    }
  }

  return sheet;
}

function styleHeader_(sheet, width) {
  const range = sheet.getRange(1, 1, 1, width);
  range.setFontWeight('bold');
  range.setBackground('#0b7abd');
  range.setFontColor('#ffffff');
}

function findQrByName_(sheet, name) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, CONFIG.QR_HEADERS.length).getValues();
  const needle = String(name).toLowerCase();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toLowerCase() === needle) {
      return { row: i + 2, values: values[i] };
    }
  }
  return null;
}

function dataRows_(sheet, width) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

function cleanName_(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function isValidName_(name) {
  return /^[A-Za-z0-9][A-Za-z0-9 _.-]{2,59}$/.test(name);
}

function clean_(value, maxLength) {
  const s = String(value == null ? '' : value).trim();
  return maxLength ? s.slice(0, maxLength) : s;
}

function numberOrBlank_(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

function valueOrBlank_(value) {
  return value === '' || value == null ? '' : value;
}

function iso_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function dateKey_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function output_(payload, callback) {
  const json = JSON.stringify(payload);
  const cb = String(callback || '').trim();

  // JSONP for the static GitHub Pages frontend.
  if (cb && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(cb)) {
    return ContentService
      .createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
