/**
 * Q Berries · Proyecciones — Google Apps Script
 * ------------------------------------------------------------
 * - LockService: un POST a la vez
 * - CacheService + Client ID: anti-duplicado en reintento de red
 * - Marca caché SOLO después de escribir en Sheet
 * - Cada cartilla = 2 filas (una por muestra), nunca pisa
 *
 * SETUP:
 * 1) Sheet destino → Extensiones → Apps Script → pega este archivo
 * 2) Ejecuta UNA vez: setupSheets()
 * 3) Implementar → Nueva implementación → Web App (Yo + Cualquier persona)
 * 4) URL …/exec → js/config.js → API_URL o _ep (base64)
 */

var SHEET_NAME = 'Proyecciones';

var HEADERS = [
  'Lote',
  'Fecha',
  'Evaluador',
  'N° Muestra',
  'N° Ramas',
  'Yema Productiva',
  'Yema Abierta',
  'Botón Floral',
  'Flor',
  'Cuaja',
  'E1 (Verde)',
  'E2 (Rosado)',
  'E3 (Guinda)',
  'E4 (50%-70%)',
  'E5 (Maduro)',
  'Observación',
  'Foto cabecera',
  'Modulo',
  'Turno',
  'Lotes',
  'Semana',
  'Etapa',
  'Variedad',
  'Area'
];

var CACHE_TTL_SEC = 21600; // 6 h

/** Columnas numéricas del Excel "Dta proyecciones" */
var NUMERIC_HEADERS = {
  'N° Muestra': true,
  'N° Ramas': true,
  'Yema Productiva': true,
  'Yema Abierta': true,
  'Botón Floral': true,
  Flor: true,
  Cuaja: true,
  'E1 (Verde)': true,
  'E2 (Rosado)': true,
  'E3 (Guinda)': true,
  'E4 (50%-70%)': true,
  'E5 (Maduro)': true,
  Turno: true,
  Lotes: true,
  Semana: true,
  Area: true
};

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
          if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    styleHeader_(sheet, HEADERS.length);
          } else {
    ensureHeaders_(sheet, HEADERS);
  }
}

function doGet(e) {
  e = e || { parameter: {} };
  var action = String((e.parameter && e.parameter.action) || 'ping').trim();
  try {
    if (action === 'ping' || action === 'help') {
      return json_({
        ok: true,
        api: 'proyecciones',
        version: '1.0.0',
        sheet: SHEET_NAME,
        headers: HEADERS,
        ts: nowIso_()
      });
    }
    return json_({ ok: true, api: 'proyecciones', version: '1.0.0' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    var action = String(body.action || 'save').trim();
    if (action === 'ping') {
      return json_({ ok: true, api: 'proyecciones', ts: nowIso_() });
    }
    if (action === 'batchSave' || action === 'batch') {
      return json_(saveBatch_(body));
    }
    return json_(saveCartilla_(body));
  } catch (err) {
    var msg = String(err && err.message ? err.message : err).replace(/^Error:\s*/i, '');
    return json_({ ok: false, error: msg });
  }
}

function clientIdKey_(clientId) {
  return 'qbproy:' + String(clientId || '').trim();
}

function isDuplicateClient_(clientId) {
  var id = String(clientId || '').trim();
  if (!id) return false;
  try {
    if (CacheService.getScriptCache().get(clientIdKey_(id))) return true;
  } catch (_) {}
  return false;
}

function markClientIdDone_(clientId) {
  var id = String(clientId || '').trim();
  if (!id) return;
  try {
    CacheService.getScriptCache().put(clientIdKey_(id), '1', CACHE_TTL_SEC);
  } catch (_) {}
}

function saveCartilla_(body) {
  var clientId = String((body && body.clientId) || '').trim();
  if (!clientId) throw new Error('Falta clientId (idempotencia)');

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(20000);
    if (!got) throw new Error('El servidor está ocupado. Intente de nuevo.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = appendCartilla_(ss, body);
    result.api = 'proyecciones';
    return result;
  } finally {
    if (got) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

function appendCartilla_(ss, body) {
  body = body || {};
  var clientId = String(body.clientId || '').trim();
  if (!clientId) throw new Error('Falta clientId (idempotencia)');

  if (isDuplicateClient_(clientId)) {
    return { ok: true, created: false, duplicate: true, clientId: clientId };
  }

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ensureSheet_(ss, SHEET_NAME, HEADERS);

  var matrix = buildMatrix_(body);
  if (!matrix.length) throw new Error('Sin filas de muestras');

  var startRow = Math.max(sheet.getLastRow() + 1, 2);
  var endRow = startRow + matrix.length - 1;
  // Fecha como texto (columna 2)
  sheet.getRange(startRow, 2, endRow, 2).setNumberFormat('@');
  sheet.getRange(startRow, 1, endRow, HEADERS.length).setValues(matrix);
  markClientIdDone_(clientId);

  return {
    ok: true,
    created: true,
    duplicate: false,
    sheet: SHEET_NAME,
    row: startRow,
    rowsWritten: matrix.length,
    clientId: clientId,
    fecha: matrix[0][1]
  };
}

function toSheetValue_(header, value) {
  if (value == null || value === '') return '';
  if (!NUMERIC_HEADERS[header]) return value;
  if (typeof value === 'number' && isFinite(value)) return value;
  var s = String(value).trim().replace(',', '.');
  if (!s || s === '#N/A') return '';
  var n = Number(s);
  return isFinite(n) ? n : String(value);
}

function buildMatrix_(body) {
  var data = body.data || {};
  var stamp = new Date();
  var fechaISO = canonFechaSave_(data.fecha, body.submittedAt || stamp);
  var rowsIn = Array.isArray(body.rows) ? body.rows : [];
  if (!rowsIn.length && Array.isArray(data.samples)) {
    rowsIn = data.samples.map(function (s, i) {
      return Object.assign({}, s, { 'N° Muestra': i + 1 });
    });
  }
  if (!rowsIn.length) {
    rowsIn = [{ 'N° Muestra': 1 }];
  }

  var matrix = [];
  for (var i = 0; i < rowsIn.length; i++) {
    var src = rowsIn[i] || {};
    var map = {};
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) map[k] = src[k];
    }
    // Meta: Lote | Fecha | Evaluador | … | Modulo | Turno | Lotes | Semana | Etapa | Variedad | Area
    if (!map.Lote) map.Lote = data.lote || data.loteCode || '';
    if (!map.Fecha) map.Fecha = fechaISO;
    else map.Fecha = canonFechaSave_(map.Fecha, body.submittedAt || stamp);
    if (!map.Evaluador) map.Evaluador = data.evaluador || '';
    if (map['N° Muestra'] == null || map['N° Muestra'] === '') map['N° Muestra'] = i + 1;
    if (!map.Observación && data.observacion) map.Observación = data.observacion;
    if (map['Foto cabecera'] == null) map['Foto cabecera'] = '';
    if (!map.Modulo) map.Modulo = data.modulo || '';
    if (map.Turno == null || map.Turno === '') map.Turno = data.turno || '';
    if (map.Lotes == null || map.Lotes === '') map.Lotes = data.loteNum || data.lotes || '';
    if (map.Semana == null || map.Semana === '') map.Semana = data.semana || isoWeek_(map.Fecha);
    if (!map.Etapa) map.Etapa = data.etapa || '';
    if (!map.Variedad) map.Variedad = data.variedad || '';
    if (map.Area == null || map.Area === '') map.Area = data.area != null ? data.area : '';

    var row = [];
    for (var c = 0; c < HEADERS.length; c++) {
      var h = HEADERS[c];
      var v = map.hasOwnProperty(h) ? map[h] : '';
      row.push(toSheetValue_(h, v));
    }
    matrix.push(row);
  }
  return matrix;
}

function saveBatch_(body) {
  body = body || {};
  var records = body.records;
  if (!records || !records.length) throw new Error('Faltan records');
  if (records.length > 10) records = records.slice(0, 10);

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(20000);
    if (!got) throw new Error('El servidor está ocupado. Intente de nuevo.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var results = [];
    for (var i = 0; i < records.length; i++) {
      var rec = records[i] || {};
      var cid = String(rec.clientId || '').trim();
      if (!cid) {
        results.push({ clientId: 'idx_' + i, ok: false, error: 'Falta clientId' });
        continue;
      }
      try {
        var r = appendCartilla_(ss, rec);
        results.push(r);
      } catch (err) {
        results.push({
          clientId: cid,
          ok: false,
          error: String(err && err.message ? err.message : err)
        });
      }
    }
    return { ok: true, api: 'proyecciones', results: results };
  } finally {
    if (got) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

/* ——— helpers ——— */

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    return {};
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function nowIso_() {
  return Utilities.formatDate(new Date(), 'America/Lima', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function fechaKey_(value) {
  if (value === '' || value == null) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'America/Lima', 'yyyy-MM-dd');
  }
  var s = String(value).trim();
  var mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return mIso[1] + '-' + mIso[2] + '-' + mIso[3];
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    var dd = ('0' + m[1]).slice(-2);
    var mm = ('0' + m[2]).slice(-2);
    return m[3] + '-' + mm + '-' + dd;
  }
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'America/Lima', 'yyyy-MM-dd');
  }
  return '';
}

function canonFechaSave_(rawFecha, submittedAt) {
  var s = String(rawFecha || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var fromClient = fechaKey_(rawFecha);
  if (fromClient) return fromClient;
  var fromSubmit = fechaKey_(submittedAt);
  if (fromSubmit) return fromSubmit;
  return Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
}

function isoWeek_(fechaYYYYMMDD) {
  var s = String(fechaYYYYMMDD || '');
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      }

      function ensureSheet_(ss, name, headers) {
        var sheet = ss.getSheetByName(name);
  if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        styleHeader_(sheet, headers.length);
  } else {
    ensureHeaders_(sheet, headers);
  }
        return sheet;
      }

function getHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() < 1) return [];
  var lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
  var values = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var h = String(values[i] || '').trim();
    if (!h && i >= HEADERS.length) break;
    out.push(h);
  }
  return out;
}

function ensureHeaders_(sheet, headers) {
          var current = getHeaders_(sheet);
  var need = false;
  if (current.length < headers.length) need = true;
  else {
    for (var i = 0; i < headers.length; i++) {
      if (String(current[i] || '').trim() !== headers[i]) {
        need = true;
        break;
      }
    }
  }
  if (need) {
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sheet, headers.length);
  }
}

function styleHeader_(sheet, colCount) {
  var range = sheet.getRange(1, 1, 1, colCount);
  range.setFontWeight('bold');
  range.setBackground('#1F3D2A');
  range.setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
}
