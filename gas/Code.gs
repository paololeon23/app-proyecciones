/**
 * Q Berries · Proyecciones — Google Apps Script
 * ------------------------------------------------------------
 * - LockService: un POST a la vez
 * - CacheService + Client ID: anti-duplicado en reintento de red
 * - Marca caché SOLO después de escribir en Sheet
 * - Cada cartilla = N filas (una por muestra), nunca pisa
 * - Hoja 1 Evaluadores: acceso (DNI + Activo). Sin DNI se simula uno.
 * - Hoja 2 Proyecciones: registros. N° Muestra = 1..N automático por cartilla.
 *
 * SETUP:
 * 1) Sheet destino → Extensiones → Apps Script → pega este archivo
 * 2) Ejecuta UNA vez: setupSheets()  (crea columnas Anexo + Hora subida)
 * 3) La 1ª foto crea la carpeta Drive "QBerries-Proyecciones-Fotos"
 * 4) Implementar → Nueva implementación → Web App (Yo + Cualquier persona)
 * 5) URL …/exec → js/config.js → API_URL o _ep (base64)
 */

var SHEET_EVAL = 'Evaluadores';
var SHEET_NAME = 'Proyecciones';

/** DNI, Nombre, Rol, Modulo, Activo (checkbox) */
var EVAL_HEADERS = ['DNI', 'Nombre', 'Rol', 'Modulo', 'Activo'];

var HEADERS = [
  'Lote',
  'Fecha',
  'DNI',
  'Nombre',
  'N° Muestra',
  'N° Ramas',
  'Yema Productiva',
  'Yema Abierta',
  'Yemas Cerradas',
  'Yemas Muertas',
  'Botón Floral',
  'Flor',
  'Cuaja',
  'E1 (Verde)',
  'E2 (Rosado)',
  'E3 (Guinda)',
  'E4 (50%-70%)',
  'E5 (Maduro)',
  'Observación',
  'Modulo',
  'Turno',
  'Lotes',
  'Semana',
  'Etapa',
  'Variedad',
  'Area',
  'Campaña',
  'Anexo',
  'Hora subida'
];

var CACHE_TTL_SEC = 86400; // 24 h anti-duplicado en reintentos 3G/H+
var DRIVE_ROOT_NAME = 'QBerries-Proyecciones-Fotos';
var PROP_DRIVE_ROOT = 'qb_proy_drive_root_id';

/** Columnas que cuentan como “muestra con datos” */
var SAMPLE_DATA_HEADERS = [
  'N° Ramas', 'Yema Productiva', 'Yema Abierta', 'Yemas Cerradas', 'Yemas Muertas',
  'Botón Floral', 'Flor', 'Cuaja', 'E1 (Verde)', 'E2 (Rosado)', 'E3 (Guinda)',
  'E4 (50%-70%)', 'E5 (Maduro)'
];

/** Columnas numéricas del Excel "Dta proyecciones" */
var NUMERIC_HEADERS = {
  'N° Muestra': true,
  'N° Ramas': true,
  'Yema Productiva': true,
  'Yema Abierta': true,
  'Yemas Cerradas': true,
  'Yemas Muertas': true,
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
  var evalSheet = ensureEvalSheet_(ss);
  var sheet = ss.getSheetByName(SHEET_NAME);
          if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    styleHeader_(sheet, HEADERS.length);
          } else {
    splitEvaluadorColumn_(sheet);
    ensureHeaders_(sheet, HEADERS);
  }
  // Evaluadores queda como primera hoja (accesos)
  try {
    ss.setActiveSheet(evalSheet);
    ss.moveActiveSheet(1);
  } catch (_) {}
}

function doGet(e) {
  e = e || { parameter: {} };
  var p = e.parameter || {};
  var action = String(p.action || 'ping').trim().toLowerCase();
  try {
    if (action === 'ping' || action === 'help') {
      return json_({
        ok: true,
        api: 'proyecciones',
        version: '1.2.0',
        sheets: [SHEET_EVAL, SHEET_NAME],
        headers: HEADERS,
        evalHeaders: EVAL_HEADERS,
        acciones: ['proyecciones', 'evaluadores', 'hojas', 'acceso'],
        ts: nowIso_()
      });
    }
    if (action === 'evaluadores' || action === 'usuarios') {
      return json_(listEvaluadores_(String(p.soloActivos || '') === '1'));
    }
    if (action === 'acceso' || action === 'check') {
      return json_(checkAcceso_(p.dni || p.DNI || ''));
    }
    if (action === 'proyecciones' || action === 'registros' || action === 'list' || action === 'export') {
      return json_(listProyecciones_(p));
    }
    if (action === 'hojas' || action === 'all') {
      return json_({
        ok: true,
        api: 'proyecciones',
        version: '1.2.0',
        evaluadores: listEvaluadores_(String(p.soloActivos || '') === '1'),
        proyecciones: listProyecciones_(p)
      });
    }
    return json_({ ok: false, error: 'Acción GET desconocida: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * El POST de la app llega AQUÍ. Si trae filas, se agregan en la hoja Proyecciones.
 * No hay función aparte: doPost es el que escribe.
 */
function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!body || body._empty) {
      Logger.log('POST sin cuerpo');
      return json_({ ok: false, error: 'POST vacío: no llegó el JSON' });
    }
    if (body._parseError) {
      Logger.log('POST no es JSON: ' + body._raw);
      return json_({ ok: false, error: 'POST no es JSON', raw: body._raw });
    }

    var action = String(body.action || 'save').trim();
    Logger.log('POST action=' + action + ' clientId=' + (body.clientId || '') + ' rows=' + (body.rows ? body.rows.length : 0));

    if (action === 'ping') {
      return json_({ ok: true, api: 'proyecciones', ts: nowIso_() });
    }
    if (action === 'batchSave' || action === 'batch') {
      var batch = saveBatch_(body);
      Logger.log('POST batch escrito ' + JSON.stringify(batch));
      return json_(batch);
    }
    if (action === 'setAcceso' || action === 'setActivo') {
      return json_(setAcceso_(body));
    }
    if (action === 'uploadPhoto' || action === 'foto') {
      return json_(uploadPhotoOnly_(body));
    }

    if (!String(body.clientId || '').trim()) {
      return json_({ ok: false, error: 'Falta clientId: no se guarda nada' });
    }
    var saved = saveCartilla_(body);
    Logger.log('POST escrito en ' + saved.sheet + ' fila ' + saved.row + ' n=' + saved.rowsWritten);
    return json_(saved);
  } catch (err) {
    var msg = String(err && err.message ? err.message : err).replace(/^Error:\s*/i, '');
    Logger.log('POST error: ' + msg);
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

  attachPhotosToMatrix_(body, matrix);

  var startRow = Math.max(sheet.getLastRow() + 1, 2);
  // getRange(fila, col, CANTIDAD de filas, CANTIDAD de columnas)
  sheet.getRange(startRow, 2, matrix.length, 1).setNumberFormat('@');
  sheet.getRange(startRow, 1, matrix.length, HEADERS.length).setValues(matrix);
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

/** Carpeta raíz en Drive (se crea una vez y se guarda el id). */
function driveRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_DRIVE_ROOT);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (_) {}
  }
  var root = DriveApp.createFolder(DRIVE_ROOT_NAME);
  props.setProperty(PROP_DRIVE_ROOT, root.getId());
  return root;
}

function ensureChildFolder_(parent, name) {
  var safe = String(name || 'sin-nombre').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'sin-nombre';
  var it = parent.getFoldersByName(safe);
  if (it.hasNext()) return it.next();
  return parent.createFolder(safe);
}

function limaStamp_() {
  return Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd HH:mm:ss');
}

function limaFileStamp_() {
  return Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd_HHmmss');
}

/**
 * Guarda JPEG en Drive:
 * QBerries-Proyecciones-Fotos / {fecha} / {DNI-Nombre} / M{n}_{stamp}.jpg
 * Devuelve { url, id, hora }
 */
function savePhotoToDrive_(meta, base64, mime) {
  meta = meta || {};
  var data = String(base64 || '').replace(/^data:image\/\w+;base64,/, '');
  if (!data) return null;
  var blob;
  try {
    blob = Utilities.newBlob(Utilities.base64Decode(data), mime || 'image/jpeg', 'foto.jpg');
  } catch (err) {
    throw new Error('Foto inválida: ' + String(err && err.message ? err.message : err));
  }
  var fecha = String(meta.fecha || Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd'));
  var dni = String(meta.dni || '').replace(/\D/g, '') || 'sin-dni';
  var nombre = String(meta.nombre || 'evaluador').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'evaluador';
  var evalFolder = (dni + '-' + nombre).slice(0, 80);
  var n = Number(meta.n) || 1;
  var stamp = limaFileStamp_();
  var fileName = 'M' + String(n).padStart(2, '0') + '_' + stamp + '.jpg';

  var root = driveRootFolder_();
  var fFecha = ensureChildFolder_(root, fecha);
  var fEval = ensureChildFolder_(fFecha, evalFolder);
  // Reemplazo: borra foto previa de la misma muestra si se indica
  if (meta.replaceId) {
    try {
      DriveApp.getFileById(String(meta.replaceId)).setTrashed(true);
    } catch (_) {}
  }
  var file = fEval.createFile(blob.setName(fileName));
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (_) {}
  return {
    id: file.getId(),
    url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    hora: limaStamp_(),
    name: fileName
  };
}

function photosIndex_(body) {
  var map = {};
  var list = Array.isArray(body && body.photos) ? body.photos : [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (!p || !p.data) continue;
    var n = Number(p.n);
    if (!n || n < 1) continue;
    // Una foto por N° Muestra: no mezclar entre filas
    if (!map[n]) map[n] = p;
  }
  return map;
}

function attachPhotosToMatrix_(body, matrix) {
  var data = (body && body.data) || {};
  var byN = photosIndex_(body);
  var idxAnexo = HEADERS.indexOf('Anexo');
  var idxHora = HEADERS.indexOf('Hora subida');
  var idxN = HEADERS.indexOf('N° Muestra');
  var idxDni = HEADERS.indexOf('DNI');
  var idxNom = HEADERS.indexOf('Nombre');
  var idxFecha = HEADERS.indexOf('Fecha');
  if (idxAnexo < 0 || idxHora < 0) return;

  for (var r = 0; r < matrix.length; r++) {
    var n = idxN >= 0 ? Number(matrix[r][idxN]) || (r + 1) : (r + 1);
    var photo = byN[n];
    if (!photo || !photo.data) continue;
    // Adjunta SOLO a esta fila (mismo N° Muestra)
    var saved = savePhotoToDrive_({
      fecha: idxFecha >= 0 ? matrix[r][idxFecha] : data.fecha,
      dni: idxDni >= 0 ? matrix[r][idxDni] : data.evaluadorId,
      nombre: idxNom >= 0 ? matrix[r][idxNom] : data.nombre,
      n: n,
      replaceId: photo.replaceId || ''
    }, photo.data, photo.mime || 'image/jpeg');
    if (!saved) continue;
    matrix[r][idxAnexo] = saved.url;
    matrix[r][idxHora] = saved.hora;
    // Consumir para no reutilizar en otra fila
    delete byN[n];
  }
}

function uploadPhotoOnly_(body) {
  body = body || {};
  if (!body.data && !body.photo) {
    return { ok: false, error: 'Falta foto' };
  }
  var photo = body.photo || body;
  if (!photo.data) return { ok: false, error: 'Falta data de foto' };
  var saved = savePhotoToDrive_({
    fecha: body.fecha || (body.data && body.data.fecha) || '',
    dni: body.dni || (body.data && body.data.evaluadorId) || '',
    nombre: body.nombre || (body.data && body.data.nombre) || '',
    n: body.n || photo.n || 1,
    replaceId: photo.replaceId || body.replaceId || ''
  }, photo.data, photo.mime || 'image/jpeg');
  return { ok: true, photo: saved };
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
  // Solo muestras con al menos un dato. Nunca escribir filas vacías.
  rowsIn = rowsIn.filter(function (r) {
    return r && SAMPLE_DATA_HEADERS.some(function (h) {
      return r[h] !== '' && r[h] != null;
    });
  });
  if (!rowsIn.length) throw new Error('Sin muestras con datos: no se guardó nada');

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
    splitPersona_(data, map);
    // N° Muestra siempre automático: 1, 2, 3… según las evaluaciones de esta cartilla
    map['N° Muestra'] = i + 1;
    if (!map.Observación && data.observacion) map.Observación = data.observacion;
    if (!map.Modulo) map.Modulo = data.modulo || '';
    delete map['Foto cabecera'];
    if (map.Turno == null || map.Turno === '') map.Turno = data.turno || '';
    if (map.Lotes == null || map.Lotes === '') map.Lotes = data.loteNum || data.lotes || '';
    if (map.Semana == null || map.Semana === '') map.Semana = data.semana || isoWeek_(map.Fecha);
    if (!map.Etapa) map.Etapa = data.etapa || '';
    if (!map.Variedad) map.Variedad = data.variedad || '';
    if (map.Area == null || map.Area === '') map.Area = data.area != null ? data.area : '';
    if (!map['Campaña']) map['Campaña'] = data.campana || data.campaña || '';
    // Solo año en celda: "2026 - II" / "2026-II" → "2026"
    (function () {
      var raw = String(map['Campaña'] || '').trim();
      var m = raw.match(/(20\d{2})/);
      map['Campaña'] = m ? m[1] : raw;
    })();
    if (map.Anexo == null) map.Anexo = map.Anexo || '';
    if (map['Hora subida'] == null) map['Hora subida'] = '';
    // No escribir base64 en Sheets
    delete map.photoBase64;
    delete map._photo;
    delete map.photoDataUrl;

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

/* ——— Evaluadores (acceso) ——— */

function ensureEvalSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_EVAL);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_EVAL, 0);
    sheet.getRange(1, 1, 1, EVAL_HEADERS.length).setValues([EVAL_HEADERS]);
    styleHeader_(sheet, EVAL_HEADERS.length);
  } else {
    var current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), EVAL_HEADERS.length)).getValues()[0];
    var need = false;
    for (var i = 0; i < EVAL_HEADERS.length; i++) {
      if (String(current[i] || '').trim() !== EVAL_HEADERS[i]) { need = true; break; }
    }
    if (need) {
      sheet.getRange(1, 1, 1, EVAL_HEADERS.length).setValues([EVAL_HEADERS]);
      styleHeader_(sheet, EVAL_HEADERS.length);
    }
  }
  return sheet;
}

/** Si no hay DNI de 8 dígitos, arma uno estable que empieza en 9. */
function simularDni_(nombre, usados) {
  var s = String(nombre || 'EVAL');
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  var n = 0;
  var dni = '';
  do {
    dni = '9' + ('0000000' + String((h + n) % 10000000)).slice(-7);
    n++;
  } while (usados[dni] && n < 50);
  usados[dni] = true;
  return dni;
}

function dniOk_(v) {
  return /^\d{8}$/.test(String(v || '').trim());
}

function activoDe_(v) {
  if (v === true || v === 1) return true;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === 'si' || s === 'sí' || s === '1' || s === 'activo' || s === 'x';
}

/** Separa "70667311 — NOMBRE" en columnas DNI y Nombre. */
function splitPersona_(data, map) {
  data = data || {};
  var dni = String(data.evaluadorId || data.dni || map.DNI || '').replace(/\D/g, '');
  var nombre = String(data.nombre || data.evaluadorNombre || map.Nombre || '').trim();
  var combo = String(data.evaluador || map.Evaluador || '').trim();
  var m = combo.match(/^(\d{8})\s*[—–\-]\s*(.+)$/);
  if (m) {
    if (!dniOk_(dni)) dni = m[1];
    if (!nombre) nombre = String(m[2] || '').trim();
  } else if (!nombre && combo && !dniOk_(combo)) {
    nombre = combo;
  }
  if (!dniOk_(dni)) dni = '';
  map.DNI = dni;
  map.Nombre = nombre;
}

/** Si la hoja aún tiene la columna Evaluador junta, la parte en DNI + Nombre. */
function splitEvaluadorColumn_(sheet) {
  var headers = getHeaders_(sheet);
  if (String(headers[2] || '') !== 'Evaluador') return;
  sheet.insertColumnAfter(3);
  var last = sheet.getLastRow();
  if (last >= 2) {
    var n = last - 1;
    var vals = sheet.getRange(2, 3, n, 1).getValues();
    var dnis = [];
    var noms = [];
    for (var i = 0; i < vals.length; i++) {
      var s = String(vals[i][0] || '').trim();
      var m = s.match(/^(\d{8})\s*[—–\-]\s*(.+)$/);
      if (m) {
        dnis.push([m[1]]);
        noms.push([String(m[2] || '').trim()]);
      } else if (dniOk_(s)) {
        dnis.push([s]);
        noms.push(['']);
      } else {
        dnis.push(['']);
        noms.push([s]);
      }
    }
    sheet.getRange(2, 3, n, 1).setValues(dnis);
    sheet.getRange(2, 4, n, 1).setValues(noms);
  }
}

function paintChecks_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  try {
    sheet.getRange(2, 5, last - 1, 1).insertCheckboxes();
  } catch (_) {}
}

function readEvaluadores_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureEvalSheet_(ss);
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var vals = sheet.getRange(2, 1, last - 1, EVAL_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    var dni = String(vals[i][0] || '').trim();
    var nombre = String(vals[i][1] || '').trim();
    if (!dni && !nombre) continue;
    out.push({
      dni: dni,
      nombre: nombre,
      rol: String(vals[i][2] || 'Evaluador'),
      modulo: String(vals[i][3] || ''),
      activo: activoDe_(vals[i][4]),
      row: i + 2
    });
  }
  return out;
}

function listEvaluadores_(soloActivos) {
  var all = readEvaluadores_();
  var list = soloActivos ? all.filter(function (x) { return x.activo; }) : all;
  var activos = 0;
  for (var i = 0; i < all.length; i++) if (all[i].activo) activos++;
  return { ok: true, sheet: SHEET_EVAL, total: all.length, activos: activos, evaluadores: list };
}

/** Lee la hoja por sus encabezados reales (sirve con columna Evaluador vieja o DNI + Nombre). */
function readSheetRows_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { headers: [], rows: [] };
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { headers: [], rows: [] };
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = [];
  for (var c = 0; c < values[0].length; c++) {
    var h = String(values[0][c] || '').trim();
    if (h) headers.push(h);
  }
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var any = false;
    for (var i = 0; i < headers.length; i++) {
      var cell = values[r][i];
      if (Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime())) {
        cell = Utilities.formatDate(cell, 'America/Lima', 'yyyy-MM-dd');
      }
      if (cell !== '' && cell != null) any = true;
      obj[headers[i]] = cell == null ? '' : cell;
    }
    if (!any) continue;
    obj._row = r + 1;
    rows.push(obj);
  }
  return { headers: headers, rows: rows };
}

function rowHasSample_(row) {
  for (var i = 0; i < SAMPLE_DATA_HEADERS.length; i++) {
    var v = row[SAMPLE_DATA_HEADERS[i]];
    if (v !== '' && v != null) return true;
        }
        return false;
      }

function listProyecciones_(p) {
  p = p || {};
  var pack = readSheetRows_(SHEET_NAME);
  var desde = fechaKey_(p.desde || p.from || '');
  var hasta = fechaKey_(p.hasta || p.to || '');
  var modulo = String(p.modulo || '').trim().toUpperCase();
  var turno = String(p.turno || '').trim();
  var lote = String(p.lote || '').trim().toUpperCase();
  var dni = String(p.dni || '').replace(/\D/g, '');
  var campana = String(p.campana || p.campaña || '').trim().toLowerCase();
  var q = String(p.q || '').trim().toLowerCase();

  var filtered = [];
  for (var i = 0; i < pack.rows.length; i++) {
    var row = pack.rows[i];
    if (!row.Lote && !rowHasSample_(row)) continue;
    var fecha = fechaKey_(row.Fecha);
    if (desde && fecha && fecha < desde) continue;
    if (hasta && fecha && fecha > hasta) continue;
    if (modulo && String(row.Modulo || '').toUpperCase().indexOf(modulo) === -1) continue;
    if (turno && String(row.Turno || '') !== turno) continue;
    if (lote && String(row.Lote || '').toUpperCase().indexOf(lote) === -1) continue;
    var rowDni = String(row.DNI || '').replace(/\D/g, '');
    if (!rowDni && row.Evaluador) {
      var m = String(row.Evaluador).match(/^(\d{8})/);
      if (m) rowDni = m[1];
    }
    if (dni && rowDni !== dni) continue;
    if (campana && String(row['Campaña'] || '').toLowerCase().indexOf(campana) === -1) continue;
    if (q) {
      var blob = [row.Lote, row.Nombre, row.Evaluador, row.DNI, row.Modulo, row.Variedad].join(' ').toLowerCase();
      if (blob.indexOf(q) === -1) continue;
    }
    filtered.push(row);
  }

  var total = filtered.length;
  var limit = Math.min(2000, Math.max(1, Number(p.limit || p.limite || 500) || 500));
  var offset = Math.max(0, Number(p.offset || 0) || 0);
  var page = filtered.slice(offset, offset + limit);
  return {
    ok: true,
    sheet: SHEET_NAME,
    headers: pack.headers,
    total: total,
    offset: offset,
    limit: limit,
    registros: page
  };
}

function checkAcceso_(dniRaw) {
  var dni = String(dniRaw || '').replace(/\D/g, '');
  if (!dniOk_(dni)) return { ok: false, error: 'DNI inválido', activo: false };
  var all = readEvaluadores_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].dni === dni) {
      return { ok: true, dni: dni, nombre: all[i].nombre, rol: all[i].rol, activo: all[i].activo };
    }
  }
  return { ok: true, dni: dni, activo: false, error: 'Sin acceso' };
}

function setAcceso_(body) {
  body = body || {};
  var dni = String(body.dni || body.DNI || '').replace(/\D/g, '');
  if (!dniOk_(dni)) throw new Error('DNI inválido');
  var on = activoDe_(body.activo != null ? body.activo : body.activo === false ? false : true);
  if (body.activo === false || body.activo === 0 || body.activo === '0' || body.activo === 'false') on = false;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureEvalSheet_(ss);
  var all = readEvaluadores_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].dni === dni) {
      sheet.getRange(all[i].row, 5).setValue(on);
      try { sheet.getRange(all[i].row, 5).insertCheckboxes(); } catch (_) {}
      return { ok: true, dni: dni, activo: on };
    }
  }
  var nombre = String(body.nombre || '').trim() || ('EVAL ' + dni);
  var row = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(row, 1, 1, EVAL_HEADERS.length).setValues([[dni, nombre, body.rol || 'Evaluador', body.modulo || '', on]]);
  try { sheet.getRange(row, 5).insertCheckboxes(); } catch (_) {}
  return { ok: true, dni: dni, activo: on, created: true };
}

/* ——— helpers ——— */

function parseBody_(e) {
  var raw = '';
  try {
    if (e && e.postData && e.postData.contents) raw = String(e.postData.contents);
  } catch (_) {}
  if (!raw && e && e.parameter) {
    raw = String(e.parameter.payload || e.parameter.body || e.parameter.data || '');
  }
  raw = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return { _empty: true };
  try {
    return JSON.parse(raw);
  } catch (_) {}
  try {
    return JSON.parse(decodeURIComponent(raw.replace(/\+/g, ' ')));
  } catch (_) {}
  return { _parseError: true, _raw: raw.slice(0, 400) };
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
