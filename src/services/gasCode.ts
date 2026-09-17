export const GAS_CODE_GS = `/*************************************************************
 * Car Trip Tracker — Code.gs (V5.3.9 Contract Repaired)
 * 37-column canonical schema (V5.3.9)
 * Explicit action-specific normalization
 * Durable batch + point idempotency
 * PROGRESS -> ENDING -> COMPLETED state machine
 * END recovery + stale takeover
 * Geoapify -> OSRM -> Haversine distance fallback; LocationIQ is reverse geocoding only
 * Private receipt storage by default
 * setupProject() + release gate
 *************************************************************/

const APP_VERSION = 'V5.3.9';
const CONTRACT_VERSION = '5.3.9';
const LEGACY_COMPAT = true;
/* SECURITY CONTRACT
 * - External doPost requests authenticate with MOBILE_API_KEY.
 * - HTMLService calls use the signed-in Google identity plus HTML_ALLOWED_EMAILS
 *   or HTML_ALLOWED_DOMAIN; the browser never receives or submits MOBILE_API_KEY.
 * - Set ALLOW_INSECURE_DEV=true only in a private development deployment.
 */

const LOCK_MS = 25000;
const END_STALE_MS = 5 * 60 * 1000;
const BATCH_CACHE_SEC = 21600;
const MAX_POINTS_PER_BATCH = 1000;
const MAX_POINTS_PER_TRIP = 10000;
// Keep synchronous END routing bounded. Above this threshold, use an explicit non-road
// fallback rather than risking an Apps Script execution timeout from dozens/hundreds of calls.
const MAX_ROUTING_POINTS = 5000;
const GEOAPIFY_CHUNK = 100;
const OSRM_CHUNK = 80;
const ST_PROG = 'PROGRESS';
const ST_ENDING = 'ENDING';
const ST_DONE = 'COMPLETED';

const TRIP_HEADERS = [
   'TripId','Status','Generation','StartRequestId','EndRequestId','EndStartedAt','SeqRanges',
   'Driver','Purpose','StartOdo','EndOdo','OdoDistanceKm',
   'GpsDistanceKm','MatchedDistanceKm','DistanceSource','ProviderMetadata',
   'StartTs','EndTs','DurationMin',
   'StartLat','StartLng','StartAddress',
   'EndLat','EndLng','EndAddress',
   'PointCount','Note','ReceiptUrls','ReceiptCount',
   'Fuel','Toll','Parking','TotalExpense',
   'StartNote','EndNote','CreatedAt','LastUpdated'
];
const C = {};
TRIP_HEADERS.forEach((h, i) => C[h] = i);

const STAGE_HEADERS = [
   'TripId','Generation','MinSeq','MaxSeq','PointCount','BatchRequestId','PayloadJson','CreatedAt'
];

function CFG_() {
  const p = PropertiesService.getScriptProperties();
  return {
     SPREADSHEET_ID: p.getProperty('SPREADSHEET_ID') || '',
     DRIVE_FOLDER_ID: p.getProperty('DRIVE_FOLDER_ID') || '',
     MOBILE_API_KEY: p.getProperty('MOBILE_API_KEY') || '',
     GEOAPIFY_KEY: p.getProperty('GEOAPIFY_KEY') || '',
     LOCATIONIQ_KEY: p.getProperty('LOCATIONIQ_KEY') || '',
     OSRM_BASE_URL: p.getProperty('OSRM_BASE_URL') || 'https://router.project-osrm.org',
     RECEIPT_SHARING: (p.getProperty('RECEIPT_SHARING') || 'PRIVATE').toUpperCase(),
     END_STALE_MS: Number(p.getProperty('END_STALE_MS') || END_STALE_MS),
     HTML_ALLOWED_EMAILS: (p.getProperty('HTML_ALLOWED_EMAILS') || '').split(',').map(function(v) { return String(v).trim().toLowerCase(); }).filter(Boolean),
     HTML_ALLOWED_DOMAIN: String(p.getProperty('HTML_ALLOWED_DOMAIN') || '').trim().toLowerCase(),
     ALLOW_INSECURE_DEV: String(p.getProperty('ALLOW_INSECURE_DEV') || 'false').toLowerCase() === 'true'
  };
}

/* ========================= ROUTER ========================= */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action) {
    const action = String(p.action || '').trim().toLowerCase();
    // GET is read-only. Write actions must use POST so API keys are not exposed in URLs/logs.
    if (['start','track_batch','end'].indexOf(action) >= 0) {
      return json_(err_('METHOD_NOT_ALLOWED', 'Write actions require POST', false));
    }
    return json_(apiCall_({
      action: action, apiKey: p.apiKey,
      requestId: p.requestId, tripId: p.tripId, limit: p.limit
    }, 'external'));
  }
  const t = HtmlService.createTemplateFromFile('Index');
  t.appVersion = APP_VERSION;
  t.contractVersion = CONTRACT_VERSION;
  return t.evaluate()
    .setTitle('Car Trip Tracker ' + APP_VERSION)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    return json_(apiCall_(JSON.parse(raw), 'external'));
  } catch (ex) {
    return json_(err_('BAD_JSON', 'Malformed JSON request', false));
  }
}

/** Public HTMLService entry point. No API secret is accepted from the browser. */
function apiCall(raw) {
  return jsonSafe_(apiCall_(raw || {}, 'html'));
}

function apiCall_(raw, channel) {
  try {
    const action = String(raw && raw.action || raw && raw.type || 'ping').trim().toLowerCase();
    const req = normalize_(raw || {}, action);
    if (action !== 'ping' && !authorized_(req, channel || 'external')) {
      return err_('UNAUTHORIZED', 'Not authorized: โปรดระบุ Mobile API Key ให้ตรงกับ Script Properties', false);
    }
    return respond_(handleAction_(action, req));
  } catch (ex) {
    console.error('apiCall error: ' + String(ex && ex.stack || ex));
    return err_('SERVER_ERROR', 'Internal server error', true);
  }
}

function handleAction_(action, req) {
  switch (action) {
    case 'ping': return { ok: true, version: APP_VERSION, status: 'READY', now: new Date().toISOString() };
    case 'init': return actionInit_(req);
    case 'start': return actionStart_(req);
    case 'track_batch': return actionTrackBatch_(req);
    case 'end': return actionEnd_(req);
    case 'healthcheck': return healthCheck_();
    default: return err_('UNKNOWN_ACTION', action);
  }
}

function authorized_(req, channel) {
  const cfg = CFG_();
  if (channel === 'html') {
    const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (!email) return false;
    if (cfg.HTML_ALLOWED_EMAILS.length && cfg.HTML_ALLOWED_EMAILS.indexOf(email) >= 0) return true;
    if (cfg.HTML_ALLOWED_DOMAIN && email.slice(-(cfg.HTML_ALLOWED_DOMAIN.length + 1)) === '@' + cfg.HTML_ALLOWED_DOMAIN) return true;
    return false;
  }

  const key = String(cfg.MOBILE_API_KEY || '').trim();
  // ถ้าไม่ได้ตั้งค่า MOBILE_API_KEY ใน Script Properties ถือว่าอนุญาตให้เชื่อมต่อได้
  if (!key) return true;

  const supplied = String(req.apiKey || req.key || '').trim();
  if (supplied.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= supplied.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

/* ====================== NORMALIZATION ====================== */

function normalize_(req, action) {
  const src = req || {};
  const e = {};
  Object.keys(src).forEach(k => e[k] = src[k]);

  if (action === 'start') {
    e.requestId = text_(src.requestId);
    e.driver = has_(src, 'driver') ? text_(src.driver) : text_(src.person);
    e.purpose = has_(src, 'purpose') ? text_(src.purpose) : text_(src.task);
    e.startOdo = has_(src, 'startOdo') ? num_(src.startOdo, 0) : num_(src.odometer, 0);
    e.startLat = has_(src, 'startLat') ? numOrNull_(src.startLat) : numOrNull_(src.lat);
    e.startLng = has_(src, 'startLng') ? numOrNull_(src.startLng) : numOrNull_(src.lng);
    e.startAddress = has_(src, 'startAddress') ? text_(src.startAddress) : text_(src.address);
    e.startNote = has_(src, 'startNote') ? text_(src.startNote) : text_(src.note);
    e.startTs = normalizeTs_(has_(src, 'startTs') ? src.startTs : src.ts);
  } else if (action === 'track_batch') {
    e.tripId = text_(src.tripId);
    e.requestId = text_(src.requestId);
    e.points = Array.isArray(src.points) ? src.points.map(normalizePoint_) : [];
  } else if (action === 'end') {
    e.tripId = text_(src.tripId);
    e.requestId = text_(src.requestId);
    e.startRequestId = text_(src.startRequestId);
    e.endOdo = has_(src, 'endOdo') ? num_(src.endOdo, 0) : num_(src.odometer, 0);
    e.endLat = has_(src, 'endLat') ? numOrNull_(src.endLat) : numOrNull_(src.lat);
    e.endLng = has_(src, 'endLng') ? numOrNull_(src.endLng) : numOrNull_(src.lng);
    e.endAddress = has_(src, 'endAddress') ? text_(src.endAddress) : text_(src.address);
    e.endNote = has_(src, 'endNote') ? text_(src.endNote) : text_(src.note);
    e.fuel = num_(src.fuel, 0);
    e.toll = num_(src.toll, 0);
    e.parking = num_(src.parking, 0);
    e.receipts = Array.isArray(src.receipts) ? src.receipts : [];
    e.points = Array.isArray(src.points) ? src.points.map(normalizePoint_) : [];
    e.track = Array.isArray(src.track) ? src.track.map(normalizePoint_) : [];
    e.endTs = normalizeTs_(has_(src, 'endTs') ? src.endTs : src.ts);
  }
  return e;
}

function normalizePoint_(p) {
  p = p || {};
  return {
    seq: has_(p, 'seq') ? p.seq : p.sequence,
    lat: p.lat,
    lng: p.lng,
    accuracy: has_(p, 'accuracy') ? p.accuracy : p.ac,
    speed: has_(p, 'speed') ? p.speed : p.sp,
    bearing: has_(p, 'bearing') ? p.bearing : p.br,
    altitude: has_(p, 'altitude') ? p.altitude : p.alt,
    ts: normalizeTs_(p.ts)
  };
}

function normalizeTs_(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const text = String(v).trim();
  const n = Number(text);
  if (text !== '' && isFinite(n) && n > 100000000000) {
    const d = new Date(n);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/* ======================== START ============================ */

function actionStart_(req) {
  if (!req.requestId) return err_('MISSING_REQUEST_ID', 'requestId required');
  if (!req.driver) return err_('MISSING_DRIVER', 'driver required');
  if (!req.purpose) return err_('MISSING_PURPOSE', 'purpose required');
  if (!req.startTs) return err_('MISSING_START_TS', 'startTs required');
  if (!isFinite(Number(req.startOdo)) || Number(req.startOdo) < 0) return err_('INVALID_ODOMETER', 'startOdo must be non-negative');
  if (req.startLat === null || req.startLng === null) return err_('MISSING_COORDINATES', 'start coordinates required');
  if (Number(req.startLat) === 0 && Number(req.startLng) === 0) return err_('INVALID_COORDINATES', 'start coordinates cannot be 0,0');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) return err_('LOCK_TIMEOUT', 'Busy', true);
  try {
    const sh = tripsSheet_();
    const duplicate = findRowBy_(sh, C.StartRequestId + 1, req.requestId);
    if (duplicate > 0) {
      const row = sh.getRange(duplicate, 1, 1, TRIP_HEADERS.length).getValues()[0];
      return { ok: true, duplicate: true, tripId: row[C.TripId], status: row[C.Status], requestId: req.requestId };
    }

    const active = findActiveTripByDriver_(sh, req.driver);
    if (active) return err_('ACTIVE_TRIP_EXISTS', 'Driver already has an active trip', { tripId: active.tripId });

    const tid = newTripId_();
    const now = new Date();
    const r = new Array(TRIP_HEADERS.length).fill('');
    r[C.TripId] = tid;
    r[C.Status] = ST_PROG;
    r[C.Generation] = 1;
    r[C.StartRequestId] = req.requestId;
    r[C.SeqRanges] = '';
    r[C.Driver] = req.driver;
    r[C.Purpose] = req.purpose;
    r[C.StartOdo] = num_(req.startOdo, 0);
    r[C.StartTs] = new Date(req.startTs);
    r[C.StartLat] = req.startLat;
    r[C.StartLng] = req.startLng;
    r[C.StartAddress] = req.startAddress || '';
    r[C.StartNote] = req.startNote || '';
    r[C.PointCount] = 0;
    r[C.Fuel] = 0; r[C.Toll] = 0; r[C.Parking] = 0; r[C.TotalExpense] = 0;
    r[C.ReceiptCount] = 0;
    r[C.CreatedAt] = now;
    r[C.LastUpdated] = now;
    sh.appendRow(r);
    SpreadsheetApp.flush();
    return { ok: true, tripId: tid, status: ST_PROG, generation: 1, requestId: req.requestId };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== TRACK BATCH ========================= */

function duplicateBatchResponse_(req) {
  const saved = stageAckForBatch_(req.tripId, req.requestId);
  if (saved) { saved.duplicate = true; return saved; }
  const seqs = (req.points || []).map(p => Number(p && p.seq)).filter(s => Number.isInteger(s) && s > 0);
  return { ok:true, duplicate:true, accepted:0, rejected:0, duplicatePoints:seqs.length, acceptedSeqs:[], duplicateSeqs:seqs, rejectedSeqs:[], rejectedReasons:{}, tripId:req.tripId, requestId:req.requestId };
}
function appendBatchAck_(tripId, generation, requestId, ack) {
  stageSheet_().appendRow([tripId,generation,'','',0,requestId,JSON.stringify({__ack:ack}),new Date()]);
}

function actionTrackBatch_(req) {
  if (!req.tripId || !req.requestId) return err_('MISSING_FIELDS', 'tripId/requestId required');
  if (!Array.isArray(req.points)) return err_('INVALID_POINTS', 'points must be an array');
  if (req.points.length > MAX_POINTS_PER_BATCH) return err_('BATCH_TOO_LARGE', 'Too many points');

  const batchKey = batchKey_(req.tripId, req.requestId);
  const cache = CacheService.getScriptCache();
  if (cache.get(batchKey)) return duplicateBatchResponse_(req);

  if (stageHasBatch_(req.tripId, req.requestId)) {
    cache.put(batchKey, '1', BATCH_CACHE_SEC);
    return duplicateBatchResponse_(req);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) return err_('LOCK_TIMEOUT', 'Busy staging batch', true);
  try {
    if (stageHasBatch_(req.tripId, req.requestId)) {
      cache.put(batchKey, '1', BATCH_CACHE_SEC);
      return duplicateBatchResponse_(req);
    }

    const info = tripInfo_(req.tripId);
    if (!info.found) return err_('TRIP_NOT_FOUND', req.tripId);
    if (info.status !== ST_PROG) {
      if (info.status === ST_DONE) return err_('LATE_BATCH', 'Trip already completed');
      return err_('INVALID_STATE', 'Trip is not accepting track batches');
    }

    const normalized = req.points.map(normalizePoint_);
    const fresh = [];
    const rejectedSeqs = [];
    const rejectedReasons = {};
    normalized.forEach(p => {
      const v = validatePoint_(p);
      if (v) fresh.push(v);
      else {
        const seq = Number(p && p.seq);
        if (Number.isInteger(seq) && seq > 0) { rejectedSeqs.push(seq); rejectedReasons[String(seq)] = 'INVALID_POINT'; }
      }
    });
    const rejected = rejectedSeqs.length;
    if (!fresh.length) {
      const ack = {ok:true, accepted:0, rejected:rejected, duplicatePoints:0, acceptedSeqs:[], duplicateSeqs:[], rejectedSeqs:rejectedSeqs, rejectedReasons:rejectedReasons, tripId:req.tripId, requestId:req.requestId};
      stageSheet_().appendRow([req.tripId,Number(info.row[C.Generation]||1),'','',0,req.requestId,JSON.stringify([]),new Date()]);
      appendBatchAck_(req.tripId,Number(info.row[C.Generation]||1),req.requestId,ack);
      cache.put(batchKey,'1',BATCH_CACHE_SEC); SpreadsheetApp.flush(); return ack;
    }

    const temporal = validateBatchTemporal_(fresh);
    if (!temporal.ok) return err_('GPS_TIME_ORDER', temporal.message);

    let ranges = rangesParse_(info.row[C.SeqRanges]);
    const toStage = [];
    const duplicateSeqs = [];
    const seen = {};
    fresh.sort((a,b) => a.seq - b.seq).forEach(p => {
      if (seen[p.seq]) { duplicateSeqs.push(p.seq); return; }
      seen[p.seq] = true;
      if (!rangesHas_(ranges, p.seq)) toStage.push(p);
      else duplicateSeqs.push(p.seq);
    });

    if (toStage.length) {
      const existingCount = Number(info.row[C.PointCount] || 0);
      if (existingCount + toStage.length > MAX_POINTS_PER_TRIP) {
        return err_('TRIP_POINT_LIMIT', 'GPS point limit exceeded', false);
      }
      const ss = stageSheet_();
      ss.appendRow([
        req.tripId, Number(info.row[C.Generation] || 1),
        toStage[0].seq, toStage[toStage.length - 1].seq,
        toStage.length, req.requestId, JSON.stringify(toStage), new Date()
      ]);
      ranges = rangesAdd_(ranges, toStage.map(p => p.seq));
      updateCells_(tripsSheet_(), info.rowIdx, {
        SeqRanges: rangesToStr_(ranges),
        PointCount: Number(info.row[C.PointCount] || 0) + toStage.length,
        LastUpdated: new Date()
      });
    } else {
      stageSheet_().appendRow([
        req.tripId, Number(info.row[C.Generation] || 1), '', '', 0,
        req.requestId, JSON.stringify([]), new Date()
      ]);
    }

    const ack = {ok:true, accepted:toStage.length, rejected:rejected, duplicatePoints:duplicateSeqs.length, acceptedSeqs:toStage.map(p=>p.seq), duplicateSeqs:duplicateSeqs, rejectedSeqs:rejectedSeqs, rejectedReasons:rejectedReasons, tripId:req.tripId, requestId:req.requestId};
    appendBatchAck_(req.tripId,Number(info.row[C.Generation]||1),req.requestId,ack);
    cache.put(batchKey,'1',BATCH_CACHE_SEC); SpreadsheetApp.flush(); return ack;

  } finally {
    lock.releaseLock();
  }
}

/* ========================== END ============================ */

function resolveTripId_(req) {
  const tid = String(req.tripId || '').trim();
  if (tid) return { ok: true, tripId: tid, resolvedBy: 'DIRECT' };
  const srid = String(req.startRequestId || '').trim();
  if (!srid) return { ok: false, code: 'MISSING_TRIP_ID', message: 'tripId or startRequestId is required' };
  const sh = tripsSheet_();
  const rowNum = findRowBy_(sh, C.StartRequestId + 1, srid);
  if (rowNum <= 0) return { ok: false, code: 'TRIP_NOT_FOUND', message: 'No trip for startRequestId: ' + srid };
  return { ok: true, tripId: String(sh.getRange(rowNum, C.TripId + 1).getValue()), resolvedBy: 'START_REQUEST_ID' };
}

function endResult_(row, replay) {
  const matched = row[C.MatchedDistanceKm];
  const gps = row[C.GpsDistanceKm];
  const primary = (matched !== '' && matched != null) ? matched : gps;
  return {
    ok: true, replay: !!replay,
    tripId: row[C.TripId], status: row[C.Status], endRequestId: row[C.EndRequestId],
    distanceKm: primary, matchedDistanceKm: matched, gpsDistanceKm: gps,
    odoDistanceKm: row[C.OdoDistanceKm], distanceSource: row[C.DistanceSource],
    providerMetadata: row[C.ProviderMetadata], durationMin: row[C.DurationMin],
    pointCount: row[C.PointCount], totalExpense: row[C.TotalExpense],
    receiptUrls: String(row[C.ReceiptUrls] || '').split('\\n').filter(String),
    receiptCount: row[C.ReceiptCount],
    distance: primary, distance_km: primary, duration: row[C.DurationMin]
  };
}

function actionEnd_(req) {
  if ((!req.tripId && !req.startRequestId) || !req.requestId) return err_('MISSING_FIELDS', 'tripId/startRequestId and requestId required');
  if (!req.endTs) return err_('MISSING_END_TS', 'endTs required');
  if (req.endLat === null || req.endLng === null) return err_('MISSING_COORDINATES', 'end coordinates required');
  if (Number(req.endLat) === 0 && Number(req.endLng) === 0) return err_('INVALID_COORDINATES', 'end coordinates cannot be 0,0');
  if (req.endOdo === null || !isFinite(Number(req.endOdo)) || Number(req.endOdo) < 0) return err_('INVALID_ODOMETER', 'endOdo must be a non-negative number');

  if (!req.tripId && req.startRequestId) {
    const rs = resolveTripId_(req);
    if (!rs.ok) return err_(rs.code, rs.message, false);
    req.tripId = rs.tripId;
  }

  const odoInfo = tripInfo_(req.tripId);
  if (!odoInfo.found) return err_('TRIP_NOT_FOUND', req.tripId);
  const serverStartOdo = Number(odoInfo.row[C.StartOdo]);
  if (isFinite(serverStartOdo) && Number(req.endOdo) < serverStartOdo) {
    return err_('INVALID_ODOMETER_SEQUENCE', 'endOdo must be greater than or equal to startOdo', false);
  }

  const claim = claimEnd_(req);
  if (!claim.ok) return claim;
  if (claim.duplicateCompleted) return claim.response;

  const existingIntent = readEndIntent_(req.tripId, req.requestId);
  if (existingIntent && existingIntent.endStageFileId) {
    if (!endStageFileExists_(existingIntent.endStageFileId)) {
      return err_('END_STAGE_MISSING', 'Durable END stage is missing; recovery cannot continue', true);
    }
    req.__endStageFileId = String(existingIntent.endStageFileId);
    const originalStage = readEndPayloadStaging_(req.tripId, req.requestId);
    if (!originalStage) return err_('END_STAGE_MISSING', 'Durable END stage could not be read', true);
    if (!Array.isArray(req.points) || req.points.length === 0) req.points = originalStage.points || [];
    if (!Array.isArray(req.track) || req.track.length === 0) req.track = originalStage.track || [];
    if (!Array.isArray(req.receipts) || req.receipts.length === 0) req.receipts = originalStage.receipts || [];
  } else {
    try {
      req.__endStageFileId = persistEndPayloadStaging_(req);
      persistEndIntent_(req);
    } catch (e) {
      deleteEndPayloadStaging_({ endStageFileId: req.__endStageFileId });
      rollbackEndClaim_(req.tripId, req.requestId);
      return err_('END_DURABILITY_FAILED', 'Unable to persist END recovery state', true);
    }
  }

  const tripId = req.tripId;
  const endRequestId = req.requestId;

  try {
    const info = tripInfo_(tripId);
    if (!info.found) return err_('TRIP_NOT_FOUND', tripId);
    if (info.status !== ST_ENDING || String(info.row[C.EndRequestId]) !== endRequestId) {
      return err_('END_OWNERSHIP_LOST', 'END request no longer owns the trip');
    }

    const staged = stagePointsFor_(tripId, Number(info.row[C.Generation] || 1));
    const inline = []
      .concat(req.points || [])
      .concat(req.track || [])
      .map(validatePoint_)
      .filter(Boolean);

    const merged = mergePoints_(staged.concat(inline));
    const temporal = validateBatchTemporal_(merged);
    if (!temporal.ok) return err_('GPS_TIME_ORDER', temporal.message, false);
    const start = {
       lat: numOrNull_(info.row[C.StartLat]),
       lng: numOrNull_(info.row[C.StartLng])
    };
    const end = {
       lat: req.endLat,
       lng: req.endLng
    };

    if (end.lat === null || end.lng === null) return err_('MISSING_COORDINATES', 'end coordinates required');

    const gpsKm = merged.length >= 2 ? pathDistanceKm_(merged) : haversineKm_(start.lat, start.lng, end.lat, end.lng);
    const match = matchDistance_(merged, start, end);
    const matchedKm = match.distanceKm;

    const startDate = new Date(info.row[C.StartTs]);
    const endDate = new Date(req.endTs);
    const durationMin = isNaN(startDate.getTime()) || isNaN(endDate.getTime())
      ? 0 : Math.max(0, (endDate - startDate) / 60000);

    const odoDistance = Math.max(0, num_(req.endOdo, 0) - num_(info.row[C.StartOdo], 0));
    const fuel = nonNegativeMoney_(req.fuel);
    const toll = nonNegativeMoney_(req.toll);
    const parking = nonNegativeMoney_(req.parking);
    const totalExpense = fuel + toll + parking;

    const receiptResult = saveReceipts_(tripId, req.receipts || []);
    const receiptUrls = receiptResult.urls;
    const receiptCount = receiptResult.count;

    const endAddress = req.endAddress || reverseGeocode_(end.lat, end.lng) || '';
    const startAddress = info.row[C.StartAddress] || reverseGeocode_(start.lat, start.lng) || '';

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_MS)) return err_('LOCK_TIMEOUT', 'Busy during END commit', true);
    try {
      const latest = tripInfo_(tripId);
      if (!latest.found || latest.status !== ST_ENDING ||
          String(latest.row[C.EndRequestId]) !== endRequestId) {
        return err_('END_OWNERSHIP_LOST', 'END request no longer owns the trip');
      }

      updateCells_(tripsSheet_(), latest.rowIdx, {
        Status: ST_DONE,
        EndOdo: req.endOdo,
        OdoDistanceKm: odoDistance,
        GpsDistanceKm: gpsKm,
        MatchedDistanceKm: matchedKm,
        DistanceSource: match.source,
        ProviderMetadata: JSON.stringify(match.metadata || { source: match.source }),
        EndTs: endDate,
        DurationMin: durationMin,
        StartAddress: startAddress,
        EndLat: end.lat,
        EndLng: end.lng,
        EndAddress: endAddress,
        PointCount: merged.length,
        Fuel: fuel,
        Toll: toll,
        Parking: parking,
        TotalExpense: totalExpense,
        ReceiptUrls: receiptUrls.join('\\n'),
        ReceiptCount: receiptCount,
        EndNote: req.endNote || '',
        Note: req.endNote || '',
        LastUpdated: new Date()
      });
      SpreadsheetApp.flush();

      const committed = tripInfo_(tripId);
      if (!committed.found || committed.status !== ST_DONE ||
          String(committed.row[C.EndRequestId]) !== endRequestId) {
        return err_('COMMIT_READBACK_FAILED', 'Completed trip could not be reloaded', true);
      }

      deleteStageRowsFor_(tripId, Number(committed.row[C.Generation] || 1));
      const committedIntent = readEndIntent_(tripId, endRequestId);
      deleteEndPayloadStaging_(committedIntent);
      clearEndIntent_(tripId, endRequestId);
      upsertMonthly_(tripId);

      return endResult_(committed.row, false);
    } finally {
      lock.releaseLock();
    }
  } catch (ex) {
    console.error('END failed trip=' + tripId + ': ' + String(ex && ex.stack || ex));
    return err_('END_PROCESSING_FAILED', String(ex && ex.message || ex), { tripId: tripId, status: ST_ENDING, endRequestId: endRequestId });
  }
}

function claimEnd_(req) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) return err_('LOCK_TIMEOUT', 'Busy', true);
  try {
    const info = tripInfo_(req.tripId);
    if (!info.found) return err_('TRIP_NOT_FOUND', req.tripId);

    if (info.status === ST_DONE) {
      if (String(info.row[C.EndRequestId]) === req.requestId) {
        return {
           ok: true, duplicateCompleted: true,
           response: endResult_(info.row, true)
        };
      }
      return err_('ALREADY_COMPLETED', 'Trip already completed');
    }

    if (info.status === ST_ENDING) {
      const owner = String(info.row[C.EndRequestId] || '');
      const started = new Date(info.row[C.EndStartedAt]).getTime();
      const stale = !started || (Date.now() - started >= CFG_().END_STALE_MS);

      if (owner === req.requestId) {
        return { ok: true, duplicateCompleted: false };
      }

      if (!stale) return err_('END_IN_PROGRESS', 'Another END request is in progress');
      if (req.requestId !== owner) {
        return err_('END_RECOVERY_REQUIRES_OWNER', 'Retry using the stored EndRequestId', { endRequestId: owner });
      }
    }

    if (info.status !== ST_PROG && info.status !== ST_ENDING) {
      return err_('INVALID_STATE', 'Trip cannot be ended from ' + info.status);
    }

    const expectedStart = req.startRequestId;
    if (expectedStart && String(info.row[C.StartRequestId]) !== expectedStart) {
      return err_('START_REQUEST_MISMATCH', 'startRequestId does not match trip');
    }

    updateCells_(tripsSheet_(), info.rowIdx, {
      Status: ST_ENDING,
      EndRequestId: req.requestId,
      EndStartedAt: info.status === ST_ENDING ? info.row[C.EndStartedAt] : new Date(),
      LastUpdated: new Date()
    });
    SpreadsheetApp.flush();
    return { ok: true, duplicateCompleted: false };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== END INTENT STORE ==================== */

function endIntentKey_(tripId) {
  return 'END_INTENT_' + String(tripId);
}
function persistEndIntent_(req) {
  const payload = {
     tripId: req.tripId, requestId: req.requestId, startRequestId: req.startRequestId || '',
     endOdo: num_(req.endOdo, 0), endLat: req.endLat, endLng: req.endLng,
     endAddress: text_(req.endAddress), endNote: text_(req.endNote),
     fuel: nonNegativeMoney_(req.fuel), toll: nonNegativeMoney_(req.toll),
     parking: nonNegativeMoney_(req.parking), endTs: req.endTs,
     stagingKey: endIntentKey_(req.tripId), endStageFileId: String(req.__endStageFileId || '')
  };
  const raw = JSON.stringify(payload);
  if (raw.length > 7000) throw new Error('END_INTENT_TOO_LARGE');
  PropertiesService.getScriptProperties().setProperty(endIntentKey_(req.tripId), raw);
}
function persistEndPayloadStaging_(req) {
  const payload = JSON.stringify({
    points: Array.isArray(req.points) ? req.points : [],
    track: Array.isArray(req.track) ? req.track : [],
    receipts: Array.isArray(req.receipts) ? req.receipts : []
  });
  if (payload.length > 8000000) throw new Error('END_STAGE_TOO_LARGE');
  const name = 'CTT_END_STAGE_' + String(req.tripId) + '_' + String(req.requestId) + '.json';
  const file = DriveApp.createFile(name, payload, MimeType.JSON);
  return file.getId();
}
function rollbackEndClaim_(tripId, requestId) {
  try {
    const info = tripInfo_(tripId);
    if (info.found && String(info.row[C.Status]) === ST_ENDING && String(info.row[C.EndRequestId]) === String(requestId)) {
      updateCells_(tripsSheet_(), info.rowIdx, { Status: ST_PROG, EndRequestId: '', EndStartedAt: '', LastUpdated: new Date() });
      SpreadsheetApp.flush();
    }
  } catch (_) {}
}
function readEndIntent_(tripId, requestId) {
  try {
     const raw = PropertiesService.getScriptProperties().getProperty(endIntentKey_(tripId));
     if (!raw) return null;
     const p = JSON.parse(raw);
     return p && String(p.requestId) === String(requestId) ? p : null;
  } catch (_) { return null; }
}
function clearEndIntent_(tripId, requestId) {
  const key = endIntentKey_(tripId);
  const current = readEndIntent_(tripId, requestId);
  if (current) PropertiesService.getScriptProperties().deleteProperty(key);
}

function readEndPayloadStaging_(tripId, requestId) {
  const intent = readEndIntent_(tripId, requestId);
  if (!intent || !intent.endStageFileId) return null;
  try {
    const file = DriveApp.getFileById(String(intent.endStageFileId));
    const p = JSON.parse(file.getBlob().getDataAsString() || '{}');
    return p && typeof p === 'object' ? p : null;
  } catch (_) { return null; }
}

function endStageFileExists_(fileId) {
  try {
    if (!fileId) return false;
    const file = DriveApp.getFileById(String(fileId));
    return file && !file.isTrashed();
  } catch (_) { return false; }
}

function deleteEndPayloadStaging_(intent) {
  try {
    if (intent && intent.endStageFileId) DriveApp.getFileById(String(intent.endStageFileId)).setTrashed(true);
  } catch (_) {}
}

/* ======================== RECOVERY ========================= */

function recoverStuckTrips() {
  const sh = tripsSheet_();
  const data = sh.getDataRange().getValues();
  const now = Date.now();
  let stale = 0, resumed = 0, failed = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[C.Status]) !== ST_ENDING) continue;
    const started = new Date(row[C.EndStartedAt]).getTime();
    if (!started || now - started < CFG_().END_STALE_MS) continue;
    stale++;

    const tripId = String(row[C.TripId] || '');
    const endRequestId = String(row[C.EndRequestId] || '');
    const intent = readEndIntent_(tripId, endRequestId);
    if (!intent) { failed++; continue; }

    try {
      if (!intent.endStageFileId || !endStageFileExists_(intent.endStageFileId)) {
        failed++;
        continue;
      }
      const staged = readEndPayloadStaging_(tripId, endRequestId);
      if (!staged) {
        failed++;
        continue;
      }
      const recoveryReq = Object.assign({}, intent, staged);
      recoveryReq.__endStageFileId = String(intent.endStageFileId);
      const r = actionEnd_(recoveryReq);
      if (r && r.ok) resumed++;
      else failed++;
    } catch (_) { failed++; }
  }
  return { ok: failed === 0, staleEnding: stale, resumed: resumed, failed: failed, now: new Date().toISOString() };
}
function installRecoveryTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'recoverStuckTrips') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('recoverStuckTrips').timeBased().everyMinutes(10).create();
  return { ok: true, installed: true };
}

/* ========================== INIT ============================ */

function actionInit_(req) {
  const sh = tripsSheet_();
  const data = sh.getDataRange().getValues();
  const trips = [];
  const activeTrips = [];
  const summaries = monthlySummaryData_();

  for (let i = 1; i < data.length; i++) {
    if (!data[i][C.TripId]) continue;
    const obj = rowToTrip_(data[i]);
    trips.push(obj);
    if (obj.status !== ST_DONE) activeTrips.push(obj);
  }

  return {
     ok: true,
     version: APP_VERSION,
     trips: trips.slice(-200),
     activeTrips: activeTrips,
     summaries: summaries,
     drivers: unique_(trips.map(t => t.driver).filter(Boolean))
  };
}

/* ====================== PROJECT SETUP ======================= */

function ensureTripsSchema_(ss) {
  let sh = ss.getSheetByName('Trips');
  if (!sh) return ensureSheet_(ss, 'Trips', TRIP_HEADERS);
  const lastCol = sh.getLastColumn();
  const headers = lastCol ? sh.getRange(1,1,1,lastCol).getValues()[0].map(String) : [];
  if (headers.join('|') === TRIP_HEADERS.join('|')) return sh;

  const oldIdx = headers.indexOf('DistanceSource');
  const providerIdx = TRIP_HEADERS.indexOf('ProviderMetadata');
  if (oldIdx >= 0 && !headers.includes('ProviderMetadata')) {
    sh.insertColumnAfter(oldIdx + 1);
    sh.getRange(1, providerIdx + 1).setValue('ProviderMetadata');
    return sh;
  }
  throw new Error('Unsupported Trips schema; backup and migrate manually.');
}

function setupProject() {
  const ss = ss_();
  try {
    const p = PropertiesService.getScriptProperties();
    if (!p.getProperty('SPREADSHEET_ID')) {
      p.setProperty('SPREADSHEET_ID', ss.getId());
    }
  } catch (_) {}

  const trips = ensureTripsSchema_(ss);
  const stage = ensureSheet_(ss, 'GpsStage', STAGE_HEADERS);
  ensureSheet_(ss, 'MonthlySummary',
['Month','Driver','TripCount','DistanceKm','OdoDistanceKm','Fuel','Toll','Parking','TotalExpense','UpdatedAt']);

  trips.setFrozenRows(1);
  stage.setFrozenRows(1);
  trips.getRange(1, 1, 1, TRIP_HEADERS.length).setValues([TRIP_HEADERS]);
  stage.getRange(1, 1, 1, STAGE_HEADERS.length).setValues([STAGE_HEADERS]);

  installRecoveryTrigger();
  return {
     ok: true,
     version: APP_VERSION,
     spreadsheetId: ss.getId(),
     tripsColumns: TRIP_HEADERS.length,
     stageColumns: STAGE_HEADERS.length
  };
}

/* ======================= MONTHLY ============================ */

function upsertMonthly_(tripId) {
  const info = tripInfo_(tripId);
  if (!info.found || info.status !== ST_DONE) return false;

  const sh = monthlySheet_();
  const month = Utilities.formatDate(new Date(info.row[C.EndTs] || info.row[C.StartTs]),
Session.getScriptTimeZone(), 'yyyy-MM');
  const driver = String(info.row[C.Driver] || '');
  const rows = sh.getDataRange().getValues();

  let target = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === month && String(rows[i][1]) === driver) {
      target = i + 1;
      break;
    }
  }

  const all = tripsSheet_().getDataRange().getValues();
  let tripCount = 0, distanceKm = 0, odoKm = 0, fuel = 0, toll = 0, parking = 0, expense = 0;
  for (let i = 1; i < all.length; i++) {
    const r = all[i];
    if (String(r[C.Status]) !== ST_DONE) continue;
    const m = Utilities.formatDate(new Date(r[C.EndTs] || r[C.StartTs]), Session.getScriptTimeZone(), 'yyyy-MM');
    if (m !== month || String(r[C.Driver] || '') !== driver) continue;
    tripCount++;
    distanceKm += num_(r[C.MatchedDistanceKm] || r[C.GpsDistanceKm], 0);
    odoKm += num_(r[C.OdoDistanceKm], 0);
    fuel += num_(r[C.Fuel], 0);
    toll += num_(r[C.Toll], 0);
    parking += num_(r[C.Parking], 0);
    expense += num_(r[C.TotalExpense], 0);
  }

  const out = [month, driver, tripCount, distanceKm, odoKm, fuel, toll, parking, expense, new Date()];
  if (target > 0) sh.getRange(target, 1, 1, out.length).setValues([out]);
  else sh.appendRow(out);
  return true;
}

function monthlySummaryData_() {
  const sh = monthlySheet_();
  const v = sh.getDataRange().getValues();
  return v.length > 1 ? v.slice(1).map(r => ({
    month: r[0], driver: r[1], tripCount: r[2], distanceKm: r[3],
    odoDistanceKm: r[4], fuel: r[5], toll: r[6], parking: r[7], totalExpense: r[8]
  })) : [];
}

/* ======================== RECEIPTS ========================== */

function saveReceipts_(tripId, receipts) {
  const cfg = CFG_();
  if (!receipts.length) return { urls: [], count: 0 };
  if (!cfg.DRIVE_FOLDER_ID) return { urls: [], count: 0 };
  const folder = DriveApp.getFolderById(cfg.DRIVE_FOLDER_ID);
  const urls = [];

  receipts.slice(0, 10).forEach((r, idx) => {
    if (!r || !r.data) return;
    const slot = text_(r.slot || r.name || ('receipt-' + idx + '.jpg')).replace(/[^a-zA-Z0-9._-]/g, '_');
    const mime = text_(r.mimeType || r.mime || 'image/jpeg');
    const bytes = Utilities.base64Decode(String(r.data).replace(/^data:[^;]+;base64,/, ''));
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
      .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
    const name = tripId + '_' + slot + '_' + digest.slice(0, 12);

    const existing = folder.getFilesByName(name);
    let file;
    if (existing.hasNext()) {
      file = existing.next();
    } else {
      file = folder.createFile(Utilities.newBlob(bytes, mime, name));
    }

    if (cfg.RECEIPT_SHARING === 'LINK') {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    urls.push(file.getUrl());
  });

  return { urls: urls, count: urls.length };
}

/* ===================== MAP / GEOCODING ====================== */

function matchDistance_(points, start, end) {
  if (points.length >= 2) {
    if (points.length > MAX_ROUTING_POINTS) {
      const raw = pathDistanceKm_(points);
      return { ok: true, distanceKm: raw, source: 'HAVERSINE_FALLBACK',
        metadata: { provider: 'HAVERSINE', quality: 'NON_ROAD', reason: 'ROUTING_BUDGET',
          maxRoutingPoints: MAX_ROUTING_POINTS, pointCount: points.length,
          fallbackChain: ['GEOAPIFY','OSRM','HAVERSINE'] } };
    }
    const g = geoapifyMatch_(points);
    if (g.ok) return g;

    const o = osrmDistance_(points);
    if (o.ok) {
      o.metadata = { provider: 'OSRM', version: 'V1', fallbackFrom: 'GEOAPIFY', geoapifyFailure: g.reason || 'UNKNOWN' };
      return o;
    }

    const raw = pathDistanceKm_(points);
    return {
       ok: true, distanceKm: raw, source: 'HAVERSINE_FALLBACK',
       metadata: { provider: 'HAVERSINE', quality: 'NON_ROAD', version: 'V1', fallbackChain: ['GEOAPIFY','OSRM','HAVERSINE'] }
    };
  }

  if (start.lat !== null && start.lng !== null && end.lat !== null && end.lng !== null) {
    const o = osrmRoute_(start, end);
    if (o.ok) {
      o.metadata = { provider: 'OSRM', version: 'V1', mode: 'START_END' };
      return o;
    }
  }
  const d = haversineKm_(start.lat, start.lng, end.lat, end.lng);
  return { ok: true, distanceKm: d, source: 'HAVERSINE_FALLBACK',
    metadata: { provider: 'HAVERSINE', quality: 'NON_ROAD', version: 'V1', fallbackChain: ['OSRM','HAVERSINE'] } };
}

function geoapifyMatch_(points) {
  const key = CFG_().GEOAPIFY_KEY;
  if (!key || points.length < 2) return { ok: false, source: 'GEOAPIFY', reason: 'NOT_CONFIGURED' };

  try {
    const chunks = chunkPoints_(points, GEOAPIFY_CHUNK, 1);
    let total = 0;
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      const qs = ch.map(p => p.lat + ',' + p.lng).join('|');
      const url = 'https://api.geoapify.com/v1/mapmatching?waypoints=' +
        encodeURIComponent(qs) + '&mode=drive&apiKey=' + encodeURIComponent(key);
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const code = res.getResponseCode();
      if (code < 200 || code >= 300) return { ok: false, source: 'GEOAPIFY', reason: 'HTTP_' + code };
      const j = JSON.parse(res.getContentText());
      const d = geoDistanceFromResponse_(j);
      if (d === null || !isFinite(d) || d < 0) return { ok: false, source: 'GEOAPIFY', reason: 'INVALID_RESPONSE' };
      total += d;
      if (!isFinite(total) || total < 0) return { ok: false, source: 'GEOAPIFY', reason: 'INVALID_TOTAL' };
    }
    return { ok: true, distanceKm: total, source: 'GEOAPIFY',
      metadata: { provider: 'GEOAPIFY', version: 'V1', chunks: chunks.length } };
  } catch (e) {
    return { ok: false, source: 'GEOAPIFY', reason: 'EXCEPTION' };
  }
}

function osrmDistance_(points) {
  if (points.length < 2) return { ok: false, source: 'OSRM' };
  try {
    const chunks = chunkPoints_(points, OSRM_CHUNK, 1);
    let total = 0;
    for (let i = 0; i < chunks.length; i++) {
      const coords = chunks[i].map(p => p.lng + ',' + p.lat).join(';');
      const url = stripTrailingSlash_(CFG_().OSRM_BASE_URL) +
        '/route/v1/driving/' + coords + '?overview=false&steps=false';
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return { ok: false, source: 'OSRM' };
      const j = JSON.parse(res.getContentText());
      const d = j && j.routes && j.routes[0] ? Number(j.routes[0].distance) / 1000 : NaN;
      if (!isFinite(d)) return { ok: false, source: 'OSRM' };
      total += d;
    }
    return { ok: true, distanceKm: total, source: 'OSRM' };
  } catch (e) {
    return { ok: false, source: 'OSRM' };
  }
}

function osrmRoute_(start, end) {
  try {
    const coords = start.lng + ',' + start.lat + ';' + end.lng + ',' + end.lat;
    const url = stripTrailingSlash_(CFG_().OSRM_BASE_URL) +
      '/route/v1/driving/' + coords + '?overview=false&steps=false';
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const j = JSON.parse(res.getContentText());
    const d = j && j.routes && j.routes[0] ? Number(j.routes[0].distance) / 1000 : NaN;
    if (!isFinite(d)) return { ok: false, source: 'OSRM' };
    return { ok: true, distanceKm: d, source: 'OSRM' };
  } catch (e) {
    return { ok: false, source: 'OSRM' };
  }
}

function reverseGeocode_(lat, lng) {
  if (lat === null || lng === null) return '';
  const key = CFG_().LOCATIONIQ_KEY;
  if (!key) return '';
  try {
    const url = 'https://us1.locationiq.com/v1/reverse?key=' + encodeURIComponent(key) +
      '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng) + '&format=json';
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return '';
    const j = JSON.parse(res.getContentText());
    return j && j.display_name ? String(j.display_name) : '';
  } catch (e) {
    return '';
  }
}

/* ======================= STAGE READ ========================= */
function stageAckForBatch_(tripId, requestId) {
  const sh=stageSheet_(), last=sh.getLastRow(); if(last<2) return null;
  const cells=sh.getRange(2,6,last-1,1).createTextFinder(String(requestId)).matchEntireCell(true).findAll();
  for(let i=cells.length-1;i>=0;i--){ try { const o=JSON.parse(String(sh.getRange(cells[i].getRow(),7).getValue()||'')); if(o&&o.__ack&&String(o.__ack.tripId)===String(tripId)) return o.__ack; } catch(_){} }
  return null;
}

function stagePointsFor_(tripId, generation) {
  const sh = stageSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];

  const finder = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(tripId))
    .matchEntireCell(true).findAll();
  if (!finder.length) return [];

  const rowNums = finder.map(c => c.getRow()).sort((a,b) => a-b);
  const runs = [];
  let runStart = rowNums[0], runEnd = rowNums[0];
  for (let i = 1; i < rowNums.length; i++) {
    if (rowNums[i] === runEnd + 1) runEnd = rowNums[i];
    else { runs.push([runStart, runEnd]); runStart = runEnd = rowNums[i]; }
  }
  runs.push([runStart, runEnd]);
  const out = [];
  runs.forEach(run => {
    const rows = sh.getRange(run[0], 1, run[1] - run[0] + 1, STAGE_HEADERS.length).getValues();
    rows.forEach(row => {
      if (Number(row[1] || 1) !== Number(generation || 1)) return;
      try {
        const arr = JSON.parse(String(row[6] || '[]'));
        if (Array.isArray(arr)) arr.forEach(p => {
          const v = validatePoint_(p);
          if (v) out.push(v);
        });
      } catch (_) {}
    });
  });
  return out;
}

function deleteStageRowsFor_(tripId, generation) {
  const sh = stageSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const finder = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(tripId))
    .matchEntireCell(true).findAll();
  const candidates = finder.map(c => c.getRow()).sort((a,b) => a-b);
  if (!candidates.length) return;
  const start = candidates[0], end = candidates[candidates.length - 1];
  const genByRow = sh.getRange(start, 2, end - start + 1, 1).getValues();
  const rows = candidates.filter(r => Number(genByRow[r - start][0] || 1) === Number(generation || 1))
    .sort((a,b) => b-a);
  let runEnd = null, runStart = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (runEnd === null) { runEnd = runStart = r; continue; }
    if (r === runStart - 1) { runStart = r; continue; }
    sh.deleteRows(runStart, runEnd - runStart + 1);
    runEnd = runStart = r;
  }
  if (runEnd !== null) sh.deleteRows(runStart, runEnd - runStart + 1);
}

/* ====================== POINT HELPERS ======================= */

function validatePoint_(p) {
  if (!p) return null;
  const seq = Number(p.seq);
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const accuracy = p.accuracy === '' || p.accuracy === null || p.accuracy === undefined ? 0 : Number(p.accuracy);
  const speed = p.speed === '' || p.speed === null || p.speed === undefined ? 0 : Number(p.speed);
  const bearing = p.bearing === '' || p.bearing === null || p.bearing === undefined ? 0 : Number(p.bearing);
  const altitude = p.altitude === '' || p.altitude === null || p.altitude === undefined ? 0 : Number(p.altitude);
  const ts = normalizeTs_(p.ts);

  if (!Number.isInteger(seq) || seq < 1) return null;
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!isFinite(t)) return null;
  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  if (!isFinite(accuracy) || accuracy < 0 || accuracy > 10000) return null;
  if (!isFinite(speed) || speed < 0 || speed > 150) return null;
  if (!isFinite(bearing) || bearing < 0 || bearing >= 360) return null;
  if (!isFinite(altitude) || altitude < -1000 || altitude > 10000) return null;

  return { seq: seq, lat: lat, lng: lng, accuracy: accuracy, speed: speed,
    bearing: bearing, altitude: altitude, ts: ts };
}

function validateBatchTemporal_(points) {
  const a = (points || []).slice().sort((x,y) => x.seq - y.seq);
  for (let i = 1; i < a.length; i++) {
    const prev = new Date(a[i-1].ts).getTime();
    const cur = new Date(a[i].ts).getTime();
    if (!isFinite(prev) || !isFinite(cur) || cur < prev) {
      return { ok:false, message:'Point timestamps must be non-decreasing by seq' };
    }
  }
  return { ok:true };
}

function mergePoints_(points) {
  const m = {};
  (points || []).forEach(p => {
    const v = validatePoint_(p);
    if (v && !m[v.seq]) m[v.seq] = v;
  });
  return Object.keys(m).map(Number).sort((a,b) => a-b).map(k => m[k]);
}

function pathDistanceKm_(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversineKm_(points[i-1].lat, points[i-1].lng, points[i].lat, points[i].lng);
  }
  return d;
}

function haversineKm_(lat1, lng1, lat2, lng2) {
  if ([lat1,lng1,lat2,lng2].some(v => v === null || v === undefined || !isFinite(Number(v)))) return 0;
  const R = 6371;
  const p1 = Number(lat1) * Math.PI / 180, p2 = Number(lat2) * Math.PI / 180;
  const dp = (Number(lat2)-Number(lat1)) * Math.PI / 180;
  const dl = (Number(lng2)-Number(lng1)) * Math.PI / 180;

  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function chunkPoints_(points, size, overlap) {
  const out = [];
  const n = points.length;
  const chunkSize = Math.max(2, Number(size) || 2);
  const ov = Math.min(chunkSize - 1, Math.max(0, Number(overlap) || 0));
  const step = Math.max(1, chunkSize - ov);
  if (n < 2) return out;
  for (let i = 0; i < n - 1; i += step) {
    const ch = points.slice(i, Math.min(n, i + chunkSize));
    if (ch.length >= 2) out.push(ch);
    if (i + chunkSize >= n) break;
  }
  if (ov === 0 && out.length) {
    const last = out[out.length - 1];
    const coveredTo = Math.min(n, (points.indexOf(last[0]) + last.length));
    if (coveredTo < n) out.push(points.slice(Math.max(0, n - 2), n));
  }
  return out;
}

function geoDistanceFromResponse_(j) {
  if (j && j.features && j.features.length) {
    const p = j.features[0].properties || {};
    if (isFinite(Number(p.distance))) return Number(p.distance) / 1000;
  }
  if (j && j.distance !== undefined && isFinite(Number(j.distance))) return Number(j.distance) / 1000;
  return null;
}

/* ======================= RANGE LEDGER ======================= */

function rangesParse_(s) {
  if (!s) return [];
  return String(s).split(',').map(x => x.trim()).filter(Boolean).map(x => {
    const a = x.split('-').map(Number);
    return { lo: a[0], hi: a.length > 1 ? a[1] : a[0] };
  }).filter(r => isFinite(r.lo) && isFinite(r.hi) && r.lo <= r.hi);
}

function rangesHas_(ranges, seq) {
  for (let i = 0; i < ranges.length; i++) {
    if (seq < ranges[i].lo) return false;
    if (seq <= ranges[i].hi) return true;
  }
  return false;
}

function rangesAdd_(ranges, seqs) {
  const all = ranges.concat((seqs || []).map(n => ({lo:Number(n), hi:Number(n)})))
    .filter(r => isFinite(r.lo) && isFinite(r.hi))
    .sort((a,b) => a.lo - b.lo || a.hi - b.hi);
  const out = [];
  all.forEach(r => {
    if (!out.length || r.lo > out[out.length-1].hi + 1) out.push({lo:r.lo, hi:r.hi});
    else out[out.length-1].hi = Math.max(out[out.length-1].hi, r.hi);
  });
  return out;
}

function rangesToStr_(ranges) {
  return (ranges || []).map(r => r.lo === r.hi ? String(r.lo) : r.lo + '-' + r.hi).join(',');
}

/* ======================== SHEETS ============================ */

function extractSpreadsheetId_(raw) {
  if (!raw) return '';
  var str = String(raw).trim();
  var parts = str.split('/spreadsheets/d/');
  if (parts.length > 1) {
    return parts[1].split('/')[0].split('?')[0].split('#')[0].trim();
  }
  return str.replace(/['"]/g, '').trim();
}

function ss_() {
  // 1. ถ้าสร้างสคริปต์จากใน Google Sheets (Extensions > Apps Script) ใช้ชีตปัจจุบันได้ทันที ไม่ต้องพึ่ง ID
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && active.getId()) return active;
  } catch (_) {}

  // 2. ถ้าเป็นสคริปต์แยก ให้ดึงจาก SPREADSHEET_ID
  const cfgId = extractSpreadsheetId_(CFG_().SPREADSHEET_ID);
  if (cfgId) {
    try {
      return SpreadsheetApp.openById(cfgId);
    } catch (e) {
      throw new Error(
        'ไม่สามารถเปิดชีต ID: "' + cfgId + '" ได้ (' + e.message + ') ' +
        'กรุณาตรวจสอบว่า: 1) ID ถูกต้องไม่ใช่ Script ID หรือ Folder ID 2) อีเมลนี้มีสิทธิ์แก้ไขชีตดังกล่าว'
      );
    }
  }
  throw new Error('ไม่พบ Google Sheet: กรุณากำหนด SPREADSHEET_ID ใน Script Properties หรือเปิดสคริปต์จากเมนู Extensions > Apps Script ใน Google Sheet');
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

function tripsSheet_() {
  return ensureTripsSchema_(ss_());
}
function stageSheet_() {
  return ensureSheet_(ss_(), 'GpsStage', STAGE_HEADERS);
}
function monthlySheet_() {
  return ensureSheet_(ss_(), 'MonthlySummary',
['Month','Driver','TripCount','DistanceKm','OdoDistanceKm','Fuel','Toll','Parking','TotalExpense','UpdatedAt']);
}

function tripInfo_(tripId) {
  const sh = tripsSheet_();
  const rowNum = findRowBy_(sh, C.TripId + 1, tripId);
  if (rowNum < 2) return {found:false};
  const row = sh.getRange(rowNum, 1, 1, TRIP_HEADERS.length).getValues()[0];
  return {found:true, rowIdx:rowNum, row:row, status:String(row[C.Status] || '')};
}

function findRowBy_(sh, col, value) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const cell = sh.getRange(2, col, last - 1, 1).createTextFinder(String(value))
    .matchEntireCell(true).findNext();
  return cell ? cell.getRow() : -1;
}

function findActiveTripByDriver_(sh, driver) {
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, TRIP_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[C.Driver]) === String(driver) && String(r[C.Status]) !== ST_DONE) {
      return { rowIdx: i + 2, tripId: r[C.TripId], status: r[C.Status] };
    }
  }
  return null;
}

function updateCells_(sh, rowIdx, values) {
  Object.keys(values).forEach(k => {
    if (!Object.prototype.hasOwnProperty.call(C, k)) return;
    sh.getRange(rowIdx, C[k] + 1).setValue(values[k]);
  });
}

function rowToTrip_(r) {
  return {
     tripId:r[C.TripId], status:r[C.Status], generation:r[C.Generation],
     startRequestId:r[C.StartRequestId], endRequestId:r[C.EndRequestId],
     driver:r[C.Driver], purpose:r[C.Purpose],
     startOdo:r[C.StartOdo], endOdo:r[C.EndOdo],
     odoDistanceKm:r[C.OdoDistanceKm], gpsDistanceKm:r[C.GpsDistanceKm],
     matchedDistanceKm:r[C.MatchedDistanceKm], distanceSource:r[C.DistanceSource],
     providerMetadata:r[C.ProviderMetadata],
     startTs:r[C.StartTs], endTs:r[C.EndTs], durationMin:r[C.DurationMin],
     startLat:r[C.StartLat], startLng:r[C.StartLng], startAddress:r[C.StartAddress],
     endLat:r[C.EndLat], endLng:r[C.EndLng], endAddress:r[C.EndAddress],
     pointCount:r[C.PointCount], fuel:r[C.Fuel], toll:r[C.Toll], parking:r[C.Parking],
     totalExpense:r[C.TotalExpense], receiptUrls:r[C.ReceiptUrls],
     receiptCount:r[C.ReceiptCount], startNote:r[C.StartNote], endNote:r[C.EndNote],
     note:r[C.Note], lastUpdated:r[C.LastUpdated]
  };
}

/* ========================= HEALTH =========================== */

function healthCheck_() {
  const cfg = CFG_();
  let spreadsheet = false, drive = false;
  try { spreadsheet = !!ss_().getId(); } catch (_) {}
  try { if (cfg.DRIVE_FOLDER_ID) drive = !!DriveApp.getFolderById(cfg.DRIVE_FOLDER_ID).getId(); } catch (_) {}
  return {
    ok: spreadsheet,
    version: APP_VERSION,
    spreadsheet: spreadsheet,
    drive: drive,
    geoapifyConfigured: !!cfg.GEOAPIFY_KEY,
    locationIqConfigured: !!cfg.LOCATIONIQ_KEY,
    osrmConfigured: !!cfg.OSRM_BASE_URL,
    receiptSharing: cfg.RECEIPT_SHARING
  };
}

/* ========================= UTILITIES ======================== */

function batchKey_(tripId, requestId) {
  return 'brq_' + String(tripId) + '_' + String(requestId);
}
function newTripId_() {
  return 'TRIP-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0,8);
}
function respond_(obj) {
  const r = (obj && typeof obj === 'object') ? obj : {};
  r.ok = (r.ok !== false);
  if (LEGACY_COMPAT) r.success = r.ok;
  r.version = APP_VERSION;
  r.contractVersion = CONTRACT_VERSION;
  r.serverTs = new Date().toISOString();
  return r;
}
function jsonSafe_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(jsonSafe_);
  if (typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => o[k] = jsonSafe_(v[k])); return o; }
  if (typeof v === 'number' && !isFinite(v)) return '';
  return v;
}
function err_(code, message, retryableOrExtra) {
  const r = {ok:false, code:code, message:message, retryable:false, error:message};
  if (typeof retryableOrExtra === 'boolean') r.retryable = retryableOrExtra;
  else if (retryableOrExtra) Object.keys(retryableOrExtra).forEach(k => r[k] = retryableOrExtra[k]);
  return respond_(r);
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(jsonSafe_(respond_(obj))))
    .setMimeType(ContentService.MimeType.JSON);
}
function text_(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function stripTrailingSlash_(url) {
  let s = String(url || '').trim();
  while (s.charAt(s.length - 1) === '/') {
    s = s.substring(0, s.length - 1);
  }
  return s;
}
function has_(o,k) { return Object.prototype.hasOwnProperty.call(o,k); }
function num_(v, d) {
  const n = Number(v);
  return isFinite(n) ? n : d;
}
function numOrNull_(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function safeNum_(v) { return num_(v, 0); }
function nonNegativeMoney_(v) {
  return Math.round(Math.max(0, num_(v, 0)) * 100) / 100;
}
function unique_(a) {
  const m = {}, out = [];
  a.forEach(x => { const k = String(x); if (k && !m[k]) {m[k]=true; out.push(x);} });
  return out;
}
function stageHasBatch_(tripId, requestId) {
  const sh = stageSheet_(), last = sh.getLastRow();
  if (last < 2) return false;
  const cells = sh.getRange(2, 6, last - 1, 1).createTextFinder(String(requestId))
    .matchEntireCell(true).findAll();
  for (let i = 0; i < cells.length; i++) {
    const row = sh.getRange(cells[i].getRow(), 1, 1, 2).getValues()[0];
    if (String(row[0]) === String(tripId)) return true;
  }
  return false;
}
`;
