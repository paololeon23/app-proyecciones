/**
 * Q Berries · Proyecciones — Google Apps Script
 * ------------------------------------------------------------
 * - LockService: un POST a la vez
 * - CacheService + Client ID: anti-duplicado en reintento de red
 * - Marca caché SOLO después de escribir en Sheet
 * - Cada cartilla = N filas (una por muestra), nunca pisa
 * - Hoja 1 Evaluadores: acceso (DNI + Activo). Sin DNI se simula uno.
 * - Hoja 2 Proyecciones: registros. N° Muestra = 1..N automático por cartilla.
 * - POST action=addEvaluador | setAcceso | deleteEvaluador | deleteRegistro: alta / activar / borrar desde la web
 * - Yemas: Cerradas → Abierta → Muertas (sin Yema Productiva)
 * - Columna Tipo (Fenología|Proyecciones) justo DESPUÉS de Observación
 * - placeTipoColumn(): UNA VEZ si Tipo quedó al final / hay columna vacía
 * - repairProyeccionesLayout(): realinea data si se movieron columnas
 * - fixHoraYArea(): Hora solo HH:mm:ss + Area por lote
 *
 * SETUP:
 * 1) Sheet destino → Extensiones → Apps Script → pega este archivo (incluye catálogo de Area)
 * 2) Ejecuta UNA vez: placeTipoColumn()  (Tipo después de Observación; borra vacías)
 * 3) Si Hora/Area mal: ejecuta fixHoraYArea() (o POST action=fixHoraArea)
 * 4) La 1ª foto crea la carpeta Drive "QBerries-Proyecciones-Fotos"
 * 5) Implementar → Nueva implementación → Web App (Yo + Cualquier persona)
 * 6) URL …/exec → meta qberries-api en index.html
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
  'Yemas Cerradas',
  'Yema Abierta',
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
  'Tipo',
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

var CACHE_TTL_SEC = 86400;
var DRIVE_ROOT_NAME = 'QBerries-Proyecciones-Fotos';
var PROP_DRIVE_ROOT = 'qb_proy_drive_root_id';

var SAMPLE_DATA_HEADERS = [
  'N° Ramas', 'Yemas Cerradas', 'Yema Abierta', 'Yemas Muertas',
  'Botón Floral', 'Flor', 'Cuaja', 'E1 (Verde)', 'E2 (Rosado)', 'E3 (Guinda)',
  'E4 (50%-70%)', 'E5 (Maduro)'
];

var NUMERIC_HEADERS = {
  'N° Muestra': true,
  'N° Ramas': true,
  'Yemas Cerradas': true,
  'Yema Abierta': true,
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
    ensureTipoAfterObservacion_(sheet);
    ensureHeaders_(sheet, HEADERS);
  }
  try {
    ss.setActiveSheet(evalSheet);
    ss.moveActiveSheet(1);
  } catch (_) {}
}

/**
 * UNA VEZ desde el editor: Tipo justo después de Observación + borra columnas vacías al final.
 */
function placeTipoColumn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No existe hoja Proyecciones');
  return ensureTipoAfterObservacion_(sheet);
}

/** Deja UNA columna Tipo inmediatamente después de Observación; quita vacías finales. */
function ensureTipoAfterObservacion_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var obsIdx = -1;
  var tipoIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h === 'Observación') obsIdx = i;
    else if (h === 'Tipo') tipoIdx = i;
  }
  if (obsIdx < 0) {
    return { ok: false, error: 'No está columna Observación' };
  }

  // Ya está: Observación | Tipo
  if (tipoIdx === obsIdx + 1) {
    var cleaned = deleteTrailingBlankCols_(sheet);
    styleHeader_(sheet, Math.max(sheet.getLastColumn(), HEADERS.length));
    return { ok: true, moved: false, cleaned: cleaned, message: 'Tipo ya está después de Observación' };
  }

  var tipoVals = null;
  if (tipoIdx >= 0) {
    tipoVals = sheet.getRange(2, tipoIdx + 1, Math.max(lastRow - 1, 1), 1).getValues();
    sheet.deleteColumn(tipoIdx + 1);
    // Si Tipo estaba a la izquierda de Observación, el índice de Observación baja 1
    if (tipoIdx < obsIdx) obsIdx -= 1;
    lastCol = Math.max(sheet.getLastColumn(), 1);
  }

  sheet.insertColumnAfter(obsIdx + 1);
  var tipoCol = obsIdx + 2; // 1-based
  sheet.getRange(1, tipoCol).setValue('Tipo');
  if (tipoVals && tipoVals.length && lastRow > 1) {
    sheet.getRange(2, tipoCol, tipoVals.length, 1).setValues(tipoVals);
  }
  var cleaned2 = deleteTrailingBlankCols_(sheet);
  styleHeader_(sheet, Math.max(sheet.getLastColumn(), HEADERS.length));
  return {
    ok: true,
    moved: true,
    col: tipoCol,
    cleaned: cleaned2,
    message: 'Tipo colocado después de Observación'
  };
}

function deleteTrailingBlankCols_(sheet) {
  var removed = 0;
  for (var guard = 0; guard < 20; guard++) {
    var lc = sheet.getLastColumn();
    if (lc < 2) break;
    var h = String(sheet.getRange(1, lc).getValue() || '').trim();
    if (h) break;
    try {
      sheet.deleteColumn(lc);
      removed += 1;
    } catch (_) {
      break;
    }
  }
  return removed;
}

/**
 * UNA VEZ: reordena la hoja Proyecciones al layout correcto.
 * - Quita Yema Productiva
 * - Orden yemas: Cerradas → Abierta → Muertas
 * - Corrige filas corridas 1 columna (Modulo vacío / Turno=M7 / doble Hora)
 * Ejecutar desde el editor: repairProyeccionesLayout
 */
function repairProyeccionesLayout() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No existe hoja Proyecciones');
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastRow < 1) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    styleHeader_(sheet, HEADERS.length);
    return { ok: true, rows: 0, message: 'Solo encabezados' };
  }
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var rebuilt = [HEADERS];
  var fixedShift = 0;
  var fixedOld = 0;
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    if (!rowHasAny_(raw)) continue;
    var obj = extractProyeccionRow_(raw);
    if (obj._shift) fixedShift += 1;
    if (obj._old) fixedOld += 1;
    var line = [];
    enrichRowMeta_(obj);
    var line = [];
    for (var c = 0; c < HEADERS.length; c++) {
      var h = HEADERS[c];
      var v = obj[h];
      line.push(v == null ? '' : v);
    }
    rebuilt.push(line);
  }
  sheet.clear();
  if (rebuilt.length > 1) {
    sheet.getRange(1, 1, rebuilt.length, HEADERS.length).setValues(rebuilt);
  } else {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  // Quitar columnas sobrantes (p.ej. segunda "Hora subida" / Yema Productiva)
  var maxCol = sheet.getMaxColumns();
  if (maxCol > HEADERS.length) {
    try { sheet.deleteColumns(HEADERS.length + 1, maxCol - HEADERS.length); } catch (_) {}
  }
  styleHeader_(sheet, HEADERS.length);
  try { sheet.getRange(2, 2, Math.max(rebuilt.length - 1, 1), 1).setNumberFormat('@'); } catch (_) {}
  var idxHoraFmt = HEADERS.indexOf('Hora subida');
  if (idxHoraFmt >= 0 && rebuilt.length > 1) {
    try { sheet.getRange(2, idxHoraFmt + 1, rebuilt.length - 1, 1).setNumberFormat('@'); } catch (_) {}
  }
  return {
    ok: true,
    rows: rebuilt.length - 1,
    fixedShift: fixedShift,
    fixedOldLayout: fixedOld,
    headers: HEADERS,
    message: 'Layout reparado: Yemas Cerradas → Abierta → Muertas (sin Productiva)'
  };
}

function rowHasAny_(arr) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] !== '' && arr[i] != null) return true;
  }
  return false;
}

function isModuloToken_(v) {
  return /^T?M\s*0*\d+$/i.test(String(v == null ? '' : v).replace(/\s+/g, ''));
}

function isLikelyTurno_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return false;
  if (isModuloToken_(s)) return false;
  return /^\d{1,2}$/.test(s);
}

function isTimeLike_(v) {
  if (v == null || v === '') return false;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return true;
  var s = String(v).trim();
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) ||
    /^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(s);
}

function isUrlLike_(v) {
  return /^https?:\/\//i.test(String(v == null ? '' : v).trim());
}

/** Anexo / Hora cuando puede haber timestamp duplicado por corrimiento. */
function assignAnexoHora_(o, anex, hora) {
  if (isUrlLike_(anex)) {
    o.Anexo = anex;
    o['Hora subida'] = onlyTimeSheet_(hora || '');
    return;
  }
  if (isTimeLike_(anex) && isTimeLike_(hora)) {
    o.Anexo = '';
    o['Hora subida'] = onlyTimeSheet_(hora || anex);
    return;
  }
  if (isTimeLike_(anex) && (hora == null || hora === '')) {
    o.Anexo = '';
    o['Hora subida'] = onlyTimeSheet_(anex);
    return;
  }
  o.Anexo = anex == null ? '' : anex;
  o['Hora subida'] = onlyTimeSheet_(hora == null ? '' : hora);
}

/**
 * Interpreta una fila cruda (posible layout viejo con Yema Productiva
 * o fila corrida: Modulo vacío y M# en Turno).
 * Viejo: Productiva, Abierta, Cerradas, Muertas → se reordena y se descarta Productiva.
 */
function extractProyeccionRow_(raw) {
  var row = raw || [];
  // Layout viejo (29 cols): … Ramas, Productiva, Abierta, Cerradas, Muertas, Botón…
  var oldMod = row[19];
  var oldTurn = row[20];
  var newMod = row[18];
  var newTurn = row[19];

  var mode = 'new';
  // Encabezados nuevos pero data vieja: Modulo vacío y M# en columna Turno
  if (!String(newMod || '').trim() && isModuloToken_(newTurn)) mode = 'old';
  else if (isModuloToken_(oldMod) && isLikelyTurno_(oldTurn)) mode = 'old';
  else if (isModuloToken_(newMod) && (isLikelyTurno_(newTurn) || String(newTurn || '').trim() === '')) mode = 'new';
  else if (row.length >= 29 || isModuloToken_(oldMod)) mode = 'old';

  function g(i) { return i >= 0 && i < row.length ? row[i] : ''; }

  var o = { _shift: false, _old: mode === 'old' };
  if (mode === 'old') {
    o.Lote = g(0); o.Fecha = g(1); o.DNI = g(2); o.Nombre = g(3);
    o['N° Muestra'] = g(4); o['N° Ramas'] = g(5);
    // Productiva g(6) se descarta; orden destino: Cerradas → Abierta → Muertas
    o['Yema Abierta'] = g(7);
    o['Yemas Cerradas'] = g(8);
    o['Yemas Muertas'] = g(9);
    o['Botón Floral'] = g(10); o.Flor = g(11); o.Cuaja = g(12);
    o['E1 (Verde)'] = g(13); o['E2 (Rosado)'] = g(14); o['E3 (Guinda)'] = g(15);
    o['E4 (50%-70%)'] = g(16); o['E5 (Maduro)'] = g(17);
    o.Tipo = '';
    o['Observación'] = g(18); o.Modulo = g(19); o.Turno = g(20); o.Lotes = g(21);
    o.Semana = g(22); o.Etapa = g(23); o.Variedad = g(24); o.Area = g(25);
    o['Campaña'] = g(26);
    assignAnexoHora_(o, g(27), g(28));
    o._shift = true;
  } else {
    // Layout nuevo: Cerradas → Abierta → Muertas (sin Productiva)
    // Destino: Observación @17, Tipo @18, Modulo @19…
    o.Lote = g(0); o.Fecha = g(1); o.DNI = g(2); o.Nombre = g(3);
    o['N° Muestra'] = g(4); o['N° Ramas'] = g(5);
    o['Yemas Cerradas'] = g(6); o['Yema Abierta'] = g(7); o['Yemas Muertas'] = g(8);
    o['Botón Floral'] = g(9); o.Flor = g(10); o.Cuaja = g(11);
    o['E1 (Verde)'] = g(12); o['E2 (Rosado)'] = g(13); o['E3 (Guinda)'] = g(14);
    o['E4 (50%-70%)'] = g(15); o['E5 (Maduro)'] = g(16);
    o['Observación'] = g(17);
    var afterObs = String(g(18) == null ? '' : g(18)).trim();
    if (isModuloToken_(afterObs)) {
      // Sin columna Tipo todavía: Observación → Modulo
      o.Tipo = '';
      o.Modulo = g(18); o.Turno = g(19); o.Lotes = g(20);
      o.Semana = g(21); o.Etapa = g(22); o.Variedad = g(23); o.Area = g(24);
      o['Campaña'] = g(25);
      assignAnexoHora_(o, g(26), g(27));
    } else {
      // Con Tipo después de Observación
      o.Tipo = g(18);
      o.Modulo = g(19); o.Turno = g(20); o.Lotes = g(21);
      o.Semana = g(22); o.Etapa = g(23); o.Variedad = g(24); o.Area = g(25);
      o['Campaña'] = g(26);
      assignAnexoHora_(o, g(27), g(28));
    }
  }
  return o;
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
        version: '1.4.8',
        sheets: [SHEET_EVAL, SHEET_NAME],
        headers: HEADERS,
        evalHeaders: EVAL_HEADERS,
        acciones: ['proyecciones', 'evaluadores', 'hojas', 'acceso', 'addEvaluador', 'deleteEvaluador', 'deleteRegistro', 'fixHoraArea', 'placeTipo'],
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
        version: '1.4.8',
        evaluadores: listEvaluadores_(String(p.soloActivos || '') === '1'),
        proyecciones: listProyecciones_(p)
      });
    }
    return json_({ ok: false, error: 'Acción GET desconocida: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!body || body._empty) {
      return json_({ ok: false, error: 'POST vacío: no llegó el JSON' });
    }
    if (body._parseError) {
      return json_({ ok: false, error: 'POST no es JSON', raw: body._raw });
    }

    var action = String(body.action || 'save').trim();

    if (action === 'ping') {
      return json_({ ok: true, api: 'proyecciones', version: '1.4.8', ts: nowIso_() });
    }
    if (action === 'placeTipo' || action === 'placeTipoColumn') {
      return json_(placeTipoColumn());
    }
    if (action === 'repairLayout' || action === 'repairProyeccionesLayout') {
      return json_(repairProyeccionesLayout());
    }
    if (action === 'fixHoraArea' || action === 'fixHoraYArea') {
      return json_(fixHoraYArea());
    }
    if (action === 'batchSave' || action === 'batch') {
      return json_(saveBatch_(body));
    }
    if (action === 'setAcceso' || action === 'setActivo') {
      return json_(setAcceso_(body));
    }
    if (action === 'addEvaluador' || action === 'crearEvaluador' || action === 'nuevoEvaluador') {
      return json_(addEvaluador_(body));
    }
    if (action === 'deleteEvaluador' || action === 'eliminarEvaluador' || action === 'borrarEvaluador') {
      return json_(deleteEvaluador_(body));
    }
    if (action === 'deleteRegistro' || action === 'eliminarRegistro' || action === 'borrarFila') {
      return json_(deleteRegistro_(body));
    }
    if (action === 'uploadPhoto' || action === 'foto') {
      return json_(uploadPhotoOnly_(body));
    }

    if (!String(body.clientId || '').trim()) {
      return json_({ ok: false, error: 'Falta clientId: no se guarda nada' });
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

  attachPhotosToMatrix_(body, matrix);

  var startRow = Math.max(sheet.getLastRow() + 1, 2);
  writeMatrixByHeaders_(sheet, startRow, matrix);
  markClientIdDone_(clientId);

  return {
    ok: true,
    created: true,
    duplicate: false,
    sheet: SHEET_NAME,
    row: startRow,
    rowsWritten: matrix.length,
    clientId: clientId,
    fecha: matrix[0][HEADERS.indexOf('Fecha')]
  };
}

/** Escribe filas alineadas a los encabezados REALES de la hoja (por nombre). */
function writeMatrixByHeaders_(sheet, startRow, matrix) {
  ensureTipoAfterObservacion_(sheet);
  ensureHeaders_(sheet, HEADERS);
  var sheetHeaders = getHeaders_(sheet);
  var colCount = Math.max(sheetHeaders.length, HEADERS.length);
  var out = [];
  for (var r = 0; r < matrix.length; r++) {
    var src = matrix[r] || [];
    var line = [];
    for (var c = 0; c < colCount; c++) {
      var h = String(sheetHeaders[c] || '').trim();
      if (!h) {
        line.push('');
        continue;
      }
      // No escribir Yema Productiva aunque exista columna vieja
      if (/^yema\s*productiva$/i.test(h)) {
        line.push('');
        continue;
      }
      var idx = HEADERS.indexOf(h);
      line.push(idx >= 0 ? (src[idx] == null ? '' : src[idx]) : '');
    }
    out.push(line);
  }
  var fechaCol = -1;
  for (var i = 0; i < sheetHeaders.length; i++) {
    if (sheetHeaders[i] === 'Fecha') { fechaCol = i; break; }
  }
  if (fechaCol >= 0) {
    sheet.getRange(startRow, fechaCol + 1, matrix.length, 1).setNumberFormat('@');
  }
  sheet.getRange(startRow, 1, matrix.length, colCount).setValues(out);
}

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

/** Solo hora para columna «Hora subida» (sin fecha). */
function limaStamp_() {
  return Utilities.formatDate(new Date(), 'America/Lima', 'HH:mm:ss');
}

function limaFileStamp_() {
  return Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd_HHmmss');
}

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
  rowsIn = rowsIn.filter(function (r) {
    if (!r) return false;
    if (SAMPLE_DATA_HEADERS.some(function (h) { return r[h] !== '' && r[h] != null; })) return true;
    // App vieja / aliases
    var aliases = ['yemasCerradas', 'yemaAbierta', 'yemasMuertas', 'Yema Productiva', 'yemaProductiva',
      'botonFloral', 'Botón Floral', 'Flor', 'Cuaja'];
    return aliases.some(function (h) { return r[h] !== '' && r[h] != null; });
  });
  if (!rowsIn.length) throw new Error('Sin muestras con datos: no se guardó nada');

  var matrix = [];
  for (var i = 0; i < rowsIn.length; i++) {
    var src = rowsIn[i] || {};
    var map = {};
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) map[k] = src[k];
    }
    // Aliases yemas (app vieja) → orden canónico; Yema Productiva se ignora
    if (map['Yemas Cerradas'] == null || map['Yemas Cerradas'] === '') {
      map['Yemas Cerradas'] = map.yemasCerradas != null ? map.yemasCerradas : map['Yema Cerrada'];
    }
    if (map['Yema Abierta'] == null || map['Yema Abierta'] === '') {
      map['Yema Abierta'] = map.yemaAbierta != null ? map.yemaAbierta : map['Yemas Abiertas'];
    }
    if (map['Yemas Muertas'] == null || map['Yemas Muertas'] === '') {
      map['Yemas Muertas'] = map.yemasMuertas != null ? map.yemasMuertas : map['Yema Muerta'];
    }
    delete map['Yema Productiva'];
    delete map.yemaProductiva;
    if (!map.Lote) map.Lote = data.lote || data.loteCode || '';
    if (!map.Fecha) map.Fecha = fechaISO;
    else map.Fecha = canonFechaSave_(map.Fecha, body.submittedAt || stamp);
    splitPersona_(data, map);
    map['N° Muestra'] = i + 1;
    // Tipo (después de Observación): Fenología | Proyecciones — lo elige SIGUIENTE en la web
    if (!map.Tipo) {
      map.Tipo = data.tipo || data.tipoLabel || data.cartillaLabel || '';
    }
    if (!map.Tipo && data.type) {
      var t = String(data.type).toLowerCase();
      if (t === 'fenologia' || t === 'fenología') map.Tipo = 'Fenología';
      else if (t === 'proyecciones' || t === 'proyeccion') map.Tipo = 'Proyecciones';
    }
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
    (function () {
      var raw = String(map['Campaña'] || '').trim();
      var m = raw.match(/(20\d{2})/);
      map['Campaña'] = m ? m[1] : raw;
    })();
    if (map.Anexo == null) map.Anexo = map.Anexo || '';
    if (map['Hora subida'] == null) map['Hora subida'] = '';
    enrichRowMeta_(map);
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
        results.push(appendCartilla_(ss, rec));
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

function dniOk_(v) {
  return /^\d{8}$/.test(String(v || '').trim());
}

function activoDe_(v) {
  if (v === true || v === 1) return true;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === 'si' || s === 'sí' || s === '1' || s === 'activo' || s === 'x';
}

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
      var header = headers[i];
      if (Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime())) {
        // Hora subida: SOLO hora (Sheets guarda Time/DateTime como Date)
        if (header === 'Hora subida' || header === 'Hora Subida') {
          cell = onlyTimeSheet_(cell);
        } else if (header === 'Fecha') {
          cell = Utilities.formatDate(cell, 'America/Lima', 'yyyy-MM-dd');
        } else {
          var withTime = Utilities.formatDate(cell, 'America/Lima', 'HH:mm:ss');
          if (withTime !== '00:00:00') {
            cell = Utilities.formatDate(cell, 'America/Lima', 'yyyy-MM-dd HH:mm:ss');
          } else {
            cell = Utilities.formatDate(cell, 'America/Lima', 'yyyy-MM-dd');
          }
        }
      } else if (header === 'Hora subida' || header === 'Hora Subida') {
        cell = onlyTimeSheet_(cell);
      }
      if (cell !== '' && cell != null) any = true;
      obj[header] = cell == null ? '' : cell;
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
    if (row['Yema Productiva'] != null) delete row['Yema Productiva'];
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
  var on = activoDe_(body.activo != null ? body.activo : true);
  if (body.activo === false || body.activo === 0 || body.activo === '0' || body.activo === 'false') on = false;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureEvalSheet_(ss);
  var all = readEvaluadores_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].dni === dni) {
      sheet.getRange(all[i].row, 5).setValue(on);
      if (body.nombre) sheet.getRange(all[i].row, 2).setValue(String(body.nombre).trim());
      try { sheet.getRange(all[i].row, 5).insertCheckboxes(); } catch (_) {}
      return { ok: true, dni: dni, activo: on, updated: true };
    }
  }
  var nombre = String(body.nombre || '').trim() || ('EVAL ' + dni);
  var row = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(row, 1, 1, EVAL_HEADERS.length).setValues([[dni, nombre, body.rol || 'Evaluador', body.modulo || '', on]]);
  try { sheet.getRange(row, 5).insertCheckboxes(); } catch (_) {}
  return { ok: true, dni: dni, activo: on, created: true, nombre: nombre };
}

function foldName_(s) {
  var t = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  try {
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (_) {}
  return t;
}

function normLoteKey_(s) {
  var t = String(s || '').replace(/\s+/g, '').trim().toUpperCase();
  if (!t) return '';
  // M01T01LT004 / M1T1L4 → M1T1LT4
  var m = t.match(/^M0*(\d+)T0*(\d+)(?:LT|L)0*(\d+)$/i);
  if (m) return 'M' + Number(m[1]) + 'T' + Number(m[2]) + 'LT' + Number(m[3]);
  return t;
}

function rowNombre_(row) {
  var nom = foldName_(row.Nombre || '');
  if (nom) return nom;
  if (row.Evaluador) {
    var em2 = String(row.Evaluador).match(/^(\d{8})\s*[—–\-]\s*(.+)$/);
    if (em2) return foldName_(em2[2] || '');
    return foldName_(row.Evaluador);
  }
  return '';
}

function rowMuestra_(row) {
  var v = row['N° Muestra'];
  if (v === '' || v == null) v = row['Nº Muestra'];
  if (v === '' || v == null) {
    for (var k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (/muestra/i.test(k) && String(k).charAt(0) !== '_') {
        v = row[k];
        break;
      }
    }
  }
  var n = Number(v);
  return isFinite(n) ? n : NaN;
}

/**
 * Borra UNA sola fila de Proyecciones.
 * Preferencia: fila hoja (_row). Si no, Nombre + N° Muestra (+ Lote/Fecha/DNI flexibles).
 */
function deleteRegistro_(body) {
  body = body || {};
  var nombre = foldName_(body.nombre || body.Nombre || '');
  var muestra = Number(body.nMuestra != null ? body.nMuestra : body['N° Muestra']);
  if (!nombre) throw new Error('Falta Nombre para eliminar');
  if (!isFinite(muestra) || muestra < 1) throw new Error('Falta N° Muestra para eliminar');

  var lote = normLoteKey_(body.lote || body.Lote || '');
  var fecha = fechaKey_(body.fecha || body.Fecha || '');
  var dni = String(body.dni || body.DNI || '').replace(/\D/g, '');
  var wantRow = Number(body.row || body._row || body.sheetRow || 0) || 0;

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(20000);
    if (!got) throw new Error('El servidor está ocupado. Intente de nuevo.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('No existe hoja Proyecciones');

    var pack = readSheetRows_(SHEET_NAME);

    // 1) Si viene _row: borrar esa fila si coincide muestra (y nombre si se puede).
    if (wantRow > 1) {
      var direct = null;
      for (var d = 0; d < pack.rows.length; d++) {
        if (Number(pack.rows[d]._row) === wantRow) {
          direct = pack.rows[d];
          break;
        }
      }
      if (direct) {
        var dm = rowMuestra_(direct);
        var dn = rowNombre_(direct);
        if (dm === muestra && (!dn || dn === nombre || nombre.indexOf(dn) >= 0 || dn.indexOf(nombre) >= 0)) {
          sheet.deleteRow(wantRow);
          return {
            ok: true,
            deleted: true,
            sheet: SHEET_NAME,
            row: wantRow,
            nombre: String(body.nombre || body.Nombre || ''),
            nMuestra: muestra,
            lote: String(direct.Lote || ''),
            fecha: fechaKey_(direct.Fecha) || '',
            by: 'row'
          };
        }
      }
    }

    // 2) Candidatos por Nombre + N° Muestra
    var hits = [];
    for (var i = 0; i < pack.rows.length; i++) {
      var row = pack.rows[i];
      if (rowNombre_(row) !== nombre) continue;
      if (rowMuestra_(row) !== muestra) continue;
      hits.push(row);
    }

    // 3) Refinar con Lote/Fecha/DNI; si filtra todo, conservar hits
    if (hits.length > 1 && (lote || fecha || dni)) {
      var refined = [];
      for (var h = 0; h < hits.length; h++) {
        var r = hits[h];
        if (lote) {
          var rowLote = normLoteKey_(r.Lote || '');
          if (rowLote && rowLote !== lote) continue;
        }
        if (fecha) {
          var rowFecha = fechaKey_(r.Fecha);
          if (rowFecha && rowFecha !== fecha) continue;
        }
        if (dni) {
          var rowDni = String(r.DNI || '').replace(/\D/g, '');
          if (!rowDni && r.Evaluador) {
            var dm2 = String(r.Evaluador).match(/^(\d{8})/);
            if (dm2) rowDni = dm2[1];
          }
          if (rowDni && rowDni !== dni) continue;
        }
        refined.push(r);
      }
      if (refined.length) hits = refined;
    }

    if (!hits.length) {
      throw new Error('No se encontró la muestra ' + muestra + ' de ' + String(body.nombre || body.Nombre || ''));
    }

    var target = null;
    if (wantRow > 1) {
      for (var x = 0; x < hits.length; x++) {
        if (Number(hits[x]._row) === wantRow) {
          target = hits[x];
          break;
        }
      }
    }
    if (!target) {
      if (hits.length === 1) target = hits[0];
      else {
        // Última coincidencia (más reciente en hoja)
        target = hits[hits.length - 1];
      }
    }

    var sheetRow = Number(target._row);
    if (!(sheetRow > 1)) throw new Error('Fila inválida en hoja');
    sheet.deleteRow(sheetRow);
    return {
      ok: true,
      deleted: true,
      sheet: SHEET_NAME,
      row: sheetRow,
      nombre: String(body.nombre || body.Nombre || ''),
      nMuestra: muestra,
      lote: String(target.Lote || ''),
      fecha: fechaKey_(target.Fecha) || '',
      by: 'match'
    };
  } finally {
    if (got) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

/** Elimina la fila del DNI en hoja Evaluadores (quita acceso total). */
function deleteEvaluador_(body) {
  body = body || {};
  var dni = String(body.dni || body.DNI || '').replace(/\D/g, '');
  if (!dniOk_(dni)) throw new Error('DNI inválido (8 dígitos)');

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(15000);
    if (!got) throw new Error('El servidor está ocupado. Intente de nuevo.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ensureEvalSheet_(ss);
    var all = readEvaluadores_();
    for (var i = 0; i < all.length; i++) {
      if (all[i].dni === dni) {
        var nombre = all[i].nombre || '';
        sheet.deleteRow(all[i].row);
        return { ok: true, deleted: true, dni: dni, nombre: nombre };
      }
    }
    return { ok: false, error: 'DNI no encontrado en Evaluadores', dni: dni };
  } finally {
    if (got) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

/** Alta explícita desde la web: DNI + Nombre → hoja Evaluadores (activo). */
function addEvaluador_(body) {
  body = body || {};
  var dni = String(body.dni || body.DNI || '').replace(/\D/g, '');
  var nombre = String(body.nombre || body.Nombre || '').replace(/\s+/g, ' ').trim();
  if (!dniOk_(dni)) throw new Error('DNI inválido (8 dígitos)');
  if (!nombre || nombre.length < 3) throw new Error('Ingrese el nombre completo');

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(15000);
    if (!got) throw new Error('El servidor está ocupado. Intente de nuevo.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ensureEvalSheet_(ss);
    var all = readEvaluadores_();
    for (var i = 0; i < all.length; i++) {
      if (all[i].dni === dni) {
        sheet.getRange(all[i].row, 2).setValue(nombre);
        sheet.getRange(all[i].row, 5).setValue(true);
        if (body.rol) sheet.getRange(all[i].row, 3).setValue(String(body.rol));
        if (body.modulo != null) sheet.getRange(all[i].row, 4).setValue(String(body.modulo || ''));
        try { sheet.getRange(all[i].row, 5).insertCheckboxes(); } catch (_) {}
        return {
          ok: true,
          created: false,
          updated: true,
          dni: dni,
          nombre: nombre,
          activo: true,
          message: 'El DNI ya existía: se actualizó nombre y quedó activo'
        };
      }
    }
    var row = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(row, 1, 1, EVAL_HEADERS.length).setValues([[
      dni,
      nombre,
      body.rol || 'Evaluador',
      body.modulo || '',
      true
    ]]);
    try { sheet.getRange(row, 5).insertCheckboxes(); } catch (_) {}
    return {
      ok: true,
      created: true,
      updated: false,
      dni: dni,
      nombre: nombre,
      activo: true,
      row: row
    };
  } finally {
    if (got) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

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
  // No reescribe encabezados existentes (evita desalinear columnas viejas).
  // Tipo NUNCA se agrega al final: va con ensureTipoAfterObservacion_.
  var current = getHeaders_(sheet);
  if (!current.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sheet, headers.length);
    return;
  }
  var missing = [];
  for (var i = 0; i < headers.length; i++) {
    var want = headers[i];
    if (want === 'Tipo') continue;
    var found = false;
    for (var j = 0; j < current.length; j++) {
      if (String(current[j] || '').trim() === want) {
        found = true;
        break;
      }
    }
    if (!found) missing.push(want);
  }
  if (!missing.length) return;
  var startCol = current.length + 1;
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  styleHeader_(sheet, startCol + missing.length - 1);
}

function styleHeader_(sheet, colCount) {
  var range = sheet.getRange(1, 1, 1, colCount);
  range.setFontWeight('bold');
  range.setBackground('#1F3D2A');
  range.setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
}

/** Area ha por lote (Licapa). Preferir Modulo|Turno|Lote; fallback solo Lote. */
var LOTE_AREA_BY_KEY = {"M1|1|3":0.99,"M1|1|4":0.7,"M1|1|5":0.28,"M1|2|6":0.94,"M1|2|7":0.98,"M1|2|8":1.1,"M1|2|9":0.89,"M1|3|10":0.85,"M1|3|11":1.14,"M1|3|12":1.02,"M1|3|13":1.02,"M1|4|17":1.1,"M1|4|18":0.71,"M1|4|19":0.74,"M1|5|20":0.98,"M1|5|21":0.93,"M1|5|22":0.59,"M1|5|23":0.67,"M1|6|24":0.96,"M1|6|25":0.98,"M1|6|26":0.98,"M1|6|27":0.98,"M1|6|28":0.98,"M1|7|29":0.36,"M1|7|30":0.95,"M1|7|31":0.98,"M1|7|32":0.98,"M1|7|33":0.98,"M1|8|34":0.98,"M1|8|35":0.98,"M1|8|36":0.98,"M1|8|37":0.92,"M1|8|38":0.98,"M1|9|39":0.98,"M1|9|40":0.98,"M1|9|41":0.98,"M1|9|42":0.97,"M1|10|43":0.98,"M1|10|44":0.93,"M1|10|45":0.3,"M1|10|46":0.52,"M2|1|47":0.34,"M2|1|48":0.69,"M2|1|49":0.98,"M2|1|50":0.98,"M2|1|51":0.98,"M2|1|52":0.98,"M2|2|53":0.98,"M2|2|54":0.98,"M2|2|55":0.89,"M2|2|56":0.61,"M2|2|57":0.37,"M2|3|58":0.15,"M2|3|59":0.81,"M2|3|60":0.98,"M2|3|61":0.98,"M2|3|62":0.63,"M2|3|63":0.77,"M2|4|64":0.7,"M2|4|65":0.98,"M2|4|66":0.68,"M2|4|67":0.67,"M2|4|68":0.65,"M2|5|69":0.98,"M2|5|70":0.97,"M2|5|71":0.98,"M2|5|72":0.98,"M2|6|73":0.97,"M2|6|74":0.98,"M2|6|75":0.98,"M2|6|76":0.98,"M2|7|77":0.98,"M2|7|78":0.98,"M2|7|79":0.98,"M2|7|80":0.97,"M2|8|81":0.68,"M2|8|82":0.68,"M2|8|83":0.71,"M2|8|84":0.64,"M2|8|85":1.02,"M2|8|86":1.07,"M2|9|87":0.97,"M2|9|88":0.98,"M2|9|89":0.98,"M2|9|90":0.89,"M2|10|91":0.98,"M2|10|92":0.98,"M2|10|93":0.98,"M2|10|94":0.97,"M3|1|95":0.97,"M3|1|96":0.98,"M3|1|97":0.98,"M3|1|98":0.98,"M3|2|99":0.98,"M3|2|100":0.98,"M3|2|101":0.98,"M3|2|102":0.97,"M3|3|103":0.97,"M3|3|104":0.98,"M3|3|105":0.98,"M3|4|106":0.98,"M3|4|107":0.97,"M3|4|108":0.98,"M3|5|109":0.98,"M3|5|110":0.98,"M3|5|111":0.97,"M3|5|112":0.98,"M3|6|113":0.97,"M3|6|114":0.98,"M3|6|115":0.98,"M3|6|116":0.98,"M3|6|117":0.97,"M3|7|118":0.93,"M3|7|119":0.98,"M3|7|120":0.98,"M3|7|121":0.98,"M3|7|122":0.97,"M3|8|123":0.98,"M3|8|124":0.97,"M3|8|125":0.98,"M3|8|126":0.98,"M3|8|127":0.97,"M3|9|128":0.98,"M3|9|129":0.92,"M3|9|130":0.98,"M3|9|131":0.98,"M3|9|132":0.97,"M3|10|133":0.98,"M3|10|134":0.98,"M3|10|135":0.98,"M3|10|136":0.97,"M4|1|137":0.56,"M4|1|138":0.54,"M4|1|139":0.76,"M4|1|140":0.9,"M4|1|141":1.12,"M4|2|142":0.98,"M4|2|143":0.98,"M4|2|144":0.98,"M4|2|145":0.97,"M4|3|146":0.98,"M4|3|147":0.98,"M4|3|148":0.98,"M4|3|149":0.97,"M4|4|150":0.98,"M4|4|151":0.98,"M4|4|152":0.98,"M4|4|153":0.97,"M4|5|154":0.98,"M4|5|155":0.98,"M4|5|156":0.98,"M4|5|157":0.97,"M4|6|158":0.87,"M4|6|159":0.9,"M4|6|160":0.37,"M4|6|161":0.28,"M4|6|162":0.98,"M4|6|163":0.98,"M4|7|164":0.98,"M4|7|165":0.97,"M4|7|166":0.98,"M4|7|167":0.98,"M4|8|168":0.97,"M4|8|169":0.98,"M4|8|170":0.98,"M4|8|171":0.98,"M4|9|172":0.98,"M4|9|173":0.93,"M4|9|174":0.98,"M4|9|175":0.8,"M4|10|176":0.83,"M4|10|177":0.98,"M4|10|178":0.98,"M4|10|179":0.49,"M4|10|180":0.63,"M4|10|181":0.22,"M5|1|182":0.98,"M5|1|183":0.98,"M5|1|184":0.98,"M5|1|185":0.97,"M5|2|186":0.97,"M5|2|187":0.98,"M5|2|188":0.98,"M5|2|189":0.98,"M5|3|190":0.98,"M5|3|191":0.98,"M5|3|192":0.98,"M5|3|193":0.97,"M5|4|194":0.97,"M5|4|195":0.98,"M5|4|196":0.98,"M5|4|197":0.98,"M10|5|198":1.96,"M10|5|199":1.9,"M10|5|200":1.9,"M10|5|201":1.8,"M10|7|202":1.9,"M10|6|203":0.98,"M10|6|204":0.84,"M10|6|205":0.98,"M10|7|206":1.9,"M10|7|207":1.94,"M10|11|208 B":1.9,"M10|11|208A":0.46,"M10|11|209":1.94,"M10|11|210":0.7,"M10|11|211":2.0,"M10|11|212":1.9,"M10|8|213":2.13,"M10|8|214":2.48,"M10|8|215":2.23,"M10|8|216":2.16,"M5|9|217":0.98,"M5|9|218":0.98,"M5|9|219":0.98,"M5|9|220":0.97,"M5|10|221":0.98,"M5|10|222":0.73,"M10|10|223":1.12,"M10|10|224":1.16,"M6|1|225":0.11,"M5|11|225":0.87,"M6|1|226":0.98,"M6|1|227":0.98,"M6|1|228":0.98,"M6|1|229":0.98,"M5|11|230":0.93,"M5|12|231":0.98,"M5|13|232":0.98,"M5|14|233":0.98,"M5|11|234":0.98,"M5|12|235":0.98,"M5|13|236":0.98,"M5|14|237":0.98,"M5|15|238":0.98,"M5|15|239":0.98,"M5|15|240":0.98,"M5|15|241":0.98,"M5|15|242":0.81,"M5|15|243":0.31,"M5|16|244":0.9,"M5|16|245":0.37,"M5|16|246":0.98,"M5|16|247":0.98,"M6|7|254":0.98,"M6|7|255":0.98,"M6|7|256":0.98,"M6|7|257":0.97,"M6|8|258":0.98,"M6|8|259":0.98,"M6|8|260":0.98,"M6|8|261":0.98,"M6|8|262":1.0,"M6|9|263":0.98,"M6|9|266":1.0,"M6|9|267":0.76,"M6|9|268":0.74,"M6|10|269":0.75,"M6|10|270":0.98,"M6|10|271":0.98,"M6|10|272":0.63,"M6|10|273":0.65,"M6|10|274":0.98,"M2|4|275":0.98,"M2|8|276":0.53,"M4|1|277":0.6,"M4|9|278":0.98,"M4|9|279":0.97,"M7|1|280":0.94,"M7|1|281":0.97,"M7|1|282":0.99,"M7|1|283":0.97,"M7|1|284":0.34,"M7|2|285":0.64,"M7|2|286":0.98,"M7|2|287":0.36,"M7|2|288":0.5,"M7|2|289":0.47,"M7|2|290":0.29,"M7|2|291":0.13,"M7|3|292":0.97,"M7|3|293":0.98,"M7|3|294":0.98,"M7|3|295":0.98,"M7|4|296":0.94,"M7|4|297":0.98,"M7|4|298":0.98,"M7|4|299":0.97,"M7|5|300":0.97,"M7|5|301":0.98,"M7|5|302":0.98,"M7|5|303":0.98,"M7|6|304":0.98,"M7|6|305":0.92,"M7|6|306":0.98,"M7|6|307":0.75,"M7|7|308":0.98,"M7|7|309":0.98,"M7|7|310":0.73,"M7|7|311":0.3,"M7|7|312":0.13,"M7|8|313":0.41,"M7|8|314":0.91,"M7|8|315":0.98,"M7|8|316":0.98,"M7|9|317":0.37,"M7|9|318":1.27,"M7|9|319":0.21,"M7|9|320":0.89,"M7|9|321":0.9,"M7|10|322":1.12,"M7|10|323":1.19,"M8|1|324":0.95,"M8|1|325":0.67,"M8|1|326":1.0,"M8|1|327":0.46,"M8|1|328":0.92,"M8|1|328B":0.31,"M8|2|329":0.97,"M8|2|330":0.97,"M8|2|331":0.97,"M8|2|332":0.98,"M8|2|333":0.98,"M8|3|334":0.97,"M8|3|335":0.97,"M8|3|336":0.98,"M8|3|337":0.98,"M8|4|338":1.0,"M8|4|339":0.98,"M8|4|340":0.97,"M8|4|341":1.0,"M8|4|342":0.97,"M8|5|343":0.98,"M8|5|344":0.93,"M8|5|345":0.98,"M8|5|346":0.98,"M8|5|347":0.98,"M8|6|348":1.07,"M8|6|349":1.05,"M8|6|350":0.83,"M8|6|351":0.6,"M8|7|352":0.98,"M8|7|353":0.98,"M8|7|354":0.98,"M8|7|355":0.98,"M8|7|356":0.45,"M8|8|357":0.94,"M8|8|358":0.15,"M8|8|359":0.85,"M8|8|360":0.59,"M8|9|361":0.34,"M8|9|362":1.08,"M8|9|363":0.29,"M8|9|364":1.1,"M8|9|365":0.89,"M8|9|366":0.5,"M8|10|367":0.62,"M8|10|368":0.63,"M8|10|369":0.28,"M8|10|370":0.64,"M8|10|371":0.43,"M9|1|372":0.82,"M9|1|373":0.98,"M9|1|374":0.98,"M9|1|375":0.55,"M9|1|376":1.26,"M9|2|377":0.99,"M9|2|378":0.67,"M9|2|379":0.22,"M9|2|380":0.98,"M9|2|381":0.95,"M9|3|382":0.78,"M9|3|383":0.33,"M9|3|384":0.98,"M9|3|385":0.98,"M9|4|386":0.98,"M9|4|387":0.97,"M9|4|388":0.3,"M9|4|389":0.2,"M9|4|390":0.32,"M9|4|391":0.5,"M9|4|392":0.64,"M9|5|393":0.98,"M9|5|394":0.98,"M9|5|395":0.98,"M9|5|396":0.98,"M9|5|397":0.92,"M9|6|398":0.98,"M9|6|399":0.98,"M9|6|400":0.98,"M9|6|401":0.97,"M8|7|402":0.97,"M9|7|403":0.97,"M9|7|404":0.98,"M9|7|405":0.98,"M9|7|406":0.98,"M9|8|407":0.97,"M9|8|408":0.98,"M9|8|409":0.98,"M9|8|410":0.98,"M9|9|411":0.8,"M9|9|412":0.98,"M9|9|413":0.17,"M9|9|414":0.98,"M9|9|415":0.9,"M9|9|416":0.54,"M9|10|417":0.45,"M9|10|418":0.98,"M9|10|419":1.36,"M9|10|420":0.72,"M7|10|421":1.14,"M8|1|422":0.12};
var LOTE_AREA_BY_LOTE = {"3":0.99,"4":0.7,"5":0.28,"6":0.94,"7":0.98,"8":1.1,"9":0.89,"10":0.85,"11":1.14,"12":1.02,"13":1.02,"17":1.1,"18":0.71,"19":0.74,"20":0.98,"21":0.93,"22":0.59,"23":0.67,"24":0.96,"25":0.98,"26":0.98,"27":0.98,"28":0.98,"29":0.36,"30":0.95,"31":0.98,"32":0.98,"33":0.98,"34":0.98,"35":0.98,"36":0.98,"37":0.92,"38":0.98,"39":0.98,"40":0.98,"41":0.98,"42":0.97,"43":0.98,"44":0.93,"45":0.3,"46":0.52,"47":0.34,"48":0.69,"49":0.98,"50":0.98,"51":0.98,"52":0.98,"53":0.98,"54":0.98,"55":0.89,"56":0.61,"57":0.37,"58":0.15,"59":0.81,"60":0.98,"61":0.98,"62":0.63,"63":0.77,"64":0.7,"65":0.98,"66":0.68,"67":0.67,"68":0.65,"69":0.98,"70":0.97,"71":0.98,"72":0.98,"73":0.97,"74":0.98,"75":0.98,"76":0.98,"77":0.98,"78":0.98,"79":0.98,"80":0.97,"81":0.68,"82":0.68,"83":0.71,"84":0.64,"85":1.02,"86":1.07,"87":0.97,"88":0.98,"89":0.98,"90":0.89,"91":0.98,"92":0.98,"93":0.98,"94":0.97,"95":0.97,"96":0.98,"97":0.98,"98":0.98,"99":0.98,"100":0.98,"101":0.98,"102":0.97,"103":0.97,"104":0.98,"105":0.98,"106":0.98,"107":0.97,"108":0.98,"109":0.98,"110":0.98,"111":0.97,"112":0.98,"113":0.97,"114":0.98,"115":0.98,"116":0.98,"117":0.97,"118":0.93,"119":0.98,"120":0.98,"121":0.98,"122":0.97,"123":0.98,"124":0.97,"125":0.98,"126":0.98,"127":0.97,"128":0.98,"129":0.92,"130":0.98,"131":0.98,"132":0.97,"133":0.98,"134":0.98,"135":0.98,"136":0.97,"137":0.56,"138":0.54,"139":0.76,"140":0.9,"141":1.12,"142":0.98,"143":0.98,"144":0.98,"145":0.97,"146":0.98,"147":0.98,"148":0.98,"149":0.97,"150":0.98,"151":0.98,"152":0.98,"153":0.97,"154":0.98,"155":0.98,"156":0.98,"157":0.97,"158":0.87,"159":0.9,"160":0.37,"161":0.28,"162":0.98,"163":0.98,"164":0.98,"165":0.97,"166":0.98,"167":0.98,"168":0.97,"169":0.98,"170":0.98,"171":0.98,"172":0.98,"173":0.93,"174":0.98,"175":0.8,"176":0.83,"177":0.98,"178":0.98,"179":0.49,"180":0.63,"181":0.22,"182":0.98,"183":0.98,"184":0.98,"185":0.97,"186":0.97,"187":0.98,"188":0.98,"189":0.98,"190":0.98,"191":0.98,"192":0.98,"193":0.97,"194":0.97,"195":0.98,"196":0.98,"197":0.98,"198":1.96,"199":1.9,"200":1.9,"201":1.8,"202":1.9,"203":0.98,"204":0.84,"205":0.98,"206":1.9,"207":1.94,"208 B":1.9,"208A":0.46,"209":1.94,"210":0.7,"211":2.0,"212":1.9,"213":2.13,"214":2.48,"215":2.23,"216":2.16,"217":0.98,"218":0.98,"219":0.98,"220":0.97,"221":0.98,"222":0.73,"223":1.12,"224":1.16,"226":0.98,"227":0.98,"228":0.98,"229":0.98,"230":0.93,"231":0.98,"232":0.98,"233":0.98,"234":0.98,"235":0.98,"236":0.98,"237":0.98,"238":0.98,"239":0.98,"240":0.98,"241":0.98,"242":0.81,"243":0.31,"244":0.9,"245":0.37,"246":0.98,"247":0.98,"254":0.98,"255":0.98,"256":0.98,"257":0.97,"258":0.98,"259":0.98,"260":0.98,"261":0.98,"262":1.0,"263":0.98,"266":1.0,"267":0.76,"268":0.74,"269":0.75,"270":0.98,"271":0.98,"272":0.63,"273":0.65,"274":0.98,"275":0.98,"276":0.53,"277":0.6,"278":0.98,"279":0.97,"280":0.94,"281":0.97,"282":0.99,"283":0.97,"284":0.34,"285":0.64,"286":0.98,"287":0.36,"288":0.5,"289":0.47,"290":0.29,"291":0.13,"292":0.97,"293":0.98,"294":0.98,"295":0.98,"296":0.94,"297":0.98,"298":0.98,"299":0.97,"300":0.97,"301":0.98,"302":0.98,"303":0.98,"304":0.98,"305":0.92,"306":0.98,"307":0.75,"308":0.98,"309":0.98,"310":0.73,"311":0.3,"312":0.13,"313":0.41,"314":0.91,"315":0.98,"316":0.98,"317":0.37,"318":1.27,"319":0.21,"320":0.89,"321":0.9,"322":1.12,"323":1.19,"324":0.95,"325":0.67,"326":1.0,"327":0.46,"328":0.92,"328B":0.31,"329":0.97,"330":0.97,"331":0.97,"332":0.98,"333":0.98,"334":0.97,"335":0.97,"336":0.98,"337":0.98,"338":1.0,"339":0.98,"340":0.97,"341":1.0,"342":0.97,"343":0.98,"344":0.93,"345":0.98,"346":0.98,"347":0.98,"348":1.07,"349":1.05,"350":0.83,"351":0.6,"352":0.98,"353":0.98,"354":0.98,"355":0.98,"356":0.45,"357":0.94,"358":0.15,"359":0.85,"360":0.59,"361":0.34,"362":1.08,"363":0.29,"364":1.1,"365":0.89,"366":0.5,"367":0.62,"368":0.63,"369":0.28,"370":0.64,"371":0.43,"372":0.82,"373":0.98,"374":0.98,"375":0.55,"376":1.26,"377":0.99,"378":0.67,"379":0.22,"380":0.98,"381":0.95,"382":0.78,"383":0.33,"384":0.98,"385":0.98,"386":0.98,"387":0.97,"388":0.3,"389":0.2,"390":0.32,"391":0.5,"392":0.64,"393":0.98,"394":0.98,"395":0.98,"396":0.98,"397":0.92,"398":0.98,"399":0.98,"400":0.98,"401":0.97,"402":0.97,"403":0.97,"404":0.98,"405":0.98,"406":0.98,"407":0.97,"408":0.98,"409":0.98,"410":0.98,"411":0.8,"412":0.98,"413":0.17,"414":0.98,"415":0.9,"416":0.54,"417":0.45,"418":0.98,"419":1.36,"420":0.72,"421":1.14,"422":0.12};

/** Solo HH:mm:ss; descarta fechas puras. */
function onlyTimeSheet_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    var t = Utilities.formatDate(v, 'America/Lima', 'HH:mm:ss');
    return t === '00:00:00' ? '' : t;
  }
  var s = String(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return '';
  var m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return '';
  var hh = m[1].length < 2 ? '0' + m[1] : m[1];
  var ss = m[3] != null ? m[3] : '00';
  return hh + ':' + m[2] + ':' + ss;
}

function normalizeModuloKey_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
  var m = s.match(/^T?M0*(\d+)$/);
  return m ? ('M' + m[1]) : s;
}

function loteNumKey_(lotes, loteCode) {
  var n = String(lotes == null ? '' : lotes).replace(/\s+/g, '').toUpperCase();
  if (n) return n;
  var m = String(loteCode || '').match(/(?:LT|L)0*(\d+[A-Z]?)\s*$/i);
  return m ? String(m[1]).toUpperCase() : '';
}

function lookupAreaSheet_(mod, turno, lotes, loteCode) {
  var loteNum = loteNumKey_(lotes, loteCode);
  if (!loteNum) return '';
  var m = normalizeModuloKey_(mod);
  var t = String(turno == null ? '' : turno).trim();
  if (m && t !== '') {
    var hit = LOTE_AREA_BY_KEY[m + '|' + t + '|' + loteNum];
    if (hit != null && hit !== '') return Number(hit);
  }
  if (m) {
    var prefix = m + '|';
    var suffix = '|' + loteNum;
    for (var k in LOTE_AREA_BY_KEY) {
      if (!Object.prototype.hasOwnProperty.call(LOTE_AREA_BY_KEY, k)) continue;
      if (k.indexOf(prefix) === 0 && k.slice(-suffix.length) === suffix) return Number(LOTE_AREA_BY_KEY[k]);
    }
  }
  if (LOTE_AREA_BY_LOTE[loteNum] != null && LOTE_AREA_BY_LOTE[loteNum] !== '') {
    return Number(LOTE_AREA_BY_LOTE[loteNum]);
  }
  return '';
}

function enrichRowMeta_(o) {
  o = o || {};
  o['Hora subida'] = onlyTimeSheet_(o['Hora subida']);
  var area = o.Area;
  var empty = area === '' || area == null;
  if (empty) {
    var filled = lookupAreaSheet_(o.Modulo, o.Turno, o.Lotes, o.Lote);
    if (filled !== '' && filled != null) o.Area = filled;
  }
  return o;
}

/**
 * UNA VEZ / cuando haga falta: Hora=solo HH:mm:ss y Area desde catálogo de lotes.
 */
function fixHoraYArea() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No existe hoja Proyecciones');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, rows: 0, filledArea: 0, fixedHora: 0 };
  ensureHeaders_(sheet, HEADERS);
  var headers = getHeaders_(sheet);
  var idxHora = -1, idxArea = -1, idxMod = -1, idxTur = -1, idxLot = -1, idxLote = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === 'Hora subida') idxHora = i;
    else if (headers[i] === 'Area') idxArea = i;
    else if (headers[i] === 'Modulo') idxMod = i;
    else if (headers[i] === 'Turno') idxTur = i;
    else if (headers[i] === 'Lotes') idxLot = i;
    else if (headers[i] === 'Lote') idxLote = i;
  }
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var filledArea = 0, fixedHora = 0;
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    if (idxHora >= 0) {
      var before = row[idxHora];
      var after = onlyTimeSheet_(before);
      if (String(before) !== String(after)) fixedHora += 1;
      row[idxHora] = after;
    }
    if (idxArea >= 0) {
      var a = row[idxArea];
      var emptyA = a === '' || a == null;
      if (emptyA) {
        var fill = lookupAreaSheet_(
          idxMod >= 0 ? row[idxMod] : '',
          idxTur >= 0 ? row[idxTur] : '',
          idxLot >= 0 ? row[idxLot] : '',
          idxLote >= 0 ? row[idxLote] : ''
        );
        if (fill !== '' && fill != null) {
          row[idxArea] = fill;
          filledArea += 1;
        }
      }
    }
  }
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  if (idxHora >= 0) {
    try { sheet.getRange(2, idxHora + 1, values.length, 1).setNumberFormat('@'); } catch (_) {}
  }
  return {
    ok: true,
    rows: values.length,
    filledArea: filledArea,
    fixedHora: fixedHora,
    message: 'Hora solo HH:mm:ss; Area completada por lote'
  };
}