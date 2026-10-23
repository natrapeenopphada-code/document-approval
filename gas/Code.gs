const APPROVAL_HISTORY_SHEET_ID = '1PC7pGX-28NqCak_5bKdSRNT23LNUdACZDC4j1qb-Tj8';
const REQUESTS_SHEET = 'Requests';
const PACKETS_SHEET = 'Packets';
const AUDIT_SHEET = 'Audit';
const CONFIG_SHEET = 'Config';

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'health');
    if (action === 'health') return json_({
      ok: true,
      user: currentUser_(),
      sheetId: APPROVAL_HISTORY_SHEET_ID,
      rootFolderId: getRootFolderId_(),
      timestamp: new Date().toISOString()
    });
    if (action === 'listRequests') return json_({ ok: true, requests: listRecords_(REQUESTS_SHEET) });
    if (action === 'listPackets') return json_({ ok: true, packets: listRecords_(PACKETS_SHEET) });
    if (action === 'getRequest') return json_({ ok: true, request: getRecord_(REQUESTS_SHEET, String(e.parameter.id || '')) });
    throw new Error('Unsupported action: ' + action);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    const payload = body.payload || {};
    if (action === 'saveRequest') return json_({ ok: true, request: saveRequest_(payload) });
    if (action === 'saveMarkers') return json_({ ok: true, request: saveMarkers_(payload) });
    if (action === 'createPacket') return json_({ ok: true, packet: createPacket_(payload) });
    if (action === 'proxyApprovePacket') return json_({ ok: true, packet: proxyApprovePacket_(payload) });
    if (action === 'returnRequest') return json_({ ok: true, request: returnRequest_(payload) });
    if (action === 'uploadOriginal') return json_({ ok: true, file: uploadOriginal_(payload) });
    if (action === 'uploadApproved') return json_({ ok: true, file: uploadApproved_(payload) });
    throw new Error('Unsupported action: ' + action);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function db_() {
  return SpreadsheetApp.openById(APPROVAL_HISTORY_SHEET_ID);
}

function ensureSheet_(name) {
  const ss = db_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  headers.forEach((header, i) => {
    if (String(current[i] || '') !== header) sheet.getRange(1, i + 1).setValue(header);
  });
}

function requestHeaders_() {
  return ['id','requestNo','companyCode','department','requesterName','title','status','urgent','originalFileId','approvedFileId','returnedComment','markersJson','createdAt','updatedAt'];
}

function packetHeaders_() {
  return ['id','packetNo','signerKey','requestIdsJson','mode','proxyReason','status','createdAt','updatedAt'];
}

function auditHeaders_() {
  return ['id','entityType','entityId','action','detail','actorEmail','at'];
}

function listRecords_(sheetName) {
  const sh = ensureSheet_(sheetName);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);
  return rows.slice(1).filter(row => row.some(v => String(v) !== '')).map(row => {
    const out = {};
    headers.forEach((h, i) => out[h] = row[i]);
    if (out.markersJson) {
      try { out.markers = JSON.parse(out.markersJson); } catch (_) { out.markers = []; }
      delete out.markersJson;
    }
    if (out.requestIdsJson) {
      try { out.requestIds = JSON.parse(out.requestIdsJson); } catch (_) { out.requestIds = []; }
      delete out.requestIdsJson;
    }
    return out;
  });
}

function getRecord_(sheetName, id) {
  if (!id) return null;
  return listRecords_(sheetName).find(r => String(r.id) === String(id)) || null;
}

function saveRequest_(input) {
  const sh = ensureSheet_(REQUESTS_SHEET);
  const headers = requestHeaders_();
  ensureHeaders_(sh, headers);
  const now = new Date().toISOString();
  const record = {
    id: String(input.id || Utilities.getUuid()),
    requestNo: String(input.requestNo || makeNo_('REQ')),
    companyCode: String(input.companyCode || ''),
    department: String(input.department || ''),
    requesterName: String(input.requesterName || currentUser_()),
    title: String(input.title || ''),
    status: String(input.status || 'new'),
    urgent: Boolean(input.urgent),
    originalFileId: String(input.originalFileId || ''),
    approvedFileId: String(input.approvedFileId || ''),
    returnedComment: String(input.returnedComment || ''),
    markersJson: JSON.stringify(input.markers || []),
    createdAt: String(input.createdAt || now),
    updatedAt: now
  };
  upsertRow_(sh, headers, record);
  audit_('request', record.id, 'SAVE_REQUEST', record.title);
  record.markers = input.markers || [];
  delete record.markersJson;
  return record;
}

function saveMarkers_(input) {
  const existing = getRecord_(REQUESTS_SHEET, String(input.id || ''));
  if (!existing) throw new Error('Request not found');
  existing.markers = input.markers || [];
  existing.status = input.status || 'ready_for_approval';
  const saved = saveRequest_(existing);
  audit_('request', saved.id, 'SAVE_MARKERS', 'Marker count: ' + saved.markers.length);
  return saved;
}

function createPacket_(input) {
  const sh = ensureSheet_(PACKETS_SHEET);
  const headers = packetHeaders_();
  ensureHeaders_(sh, headers);
  const ids = Array.isArray(input.requestIds) ? input.requestIds.map(String).filter(Boolean) : [];
  if (!ids.length) throw new Error('Packet must contain at least one request');
  const now = new Date().toISOString();
  const record = {
    id: String(input.id || Utilities.getUuid()),
    packetNo: String(input.packetNo || makeNo_('PKT')),
    signerKey: String(input.signerKey || ''),
    requestIdsJson: JSON.stringify(ids),
    mode: String(input.mode || 'executive'),
    proxyReason: String(input.proxyReason || ''),
    status: String(input.status || 'draft'),
    createdAt: String(input.createdAt || now),
    updatedAt: now
  };
  upsertRow_(sh, headers, record);
  audit_('packet', record.id, 'CREATE_PACKET', ids.join(','));
  record.requestIds = ids;
  delete record.requestIdsJson;
  return record;
}

function proxyApprovePacket_(input) {
  const id = String(input.id || '');
  const packet = getRecord_(PACKETS_SHEET, id);
  if (!packet) throw new Error('Packet not found');
  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('กรุณาระบุเหตุผลการอนุมัติแทน');
  const requests = Array.isArray(packet.requestIds) ? packet.requestIds : [];
  requests.forEach(requestId => {
    const req = getRecord_(REQUESTS_SHEET, String(requestId));
    if (!req) return;
    if (!Array.isArray(req.markers) || !req.markers.length) throw new Error('เอกสาร ' + req.requestNo + ' ยังไม่มีจุดอนุมัติ');
    req.status = 'approved_proxy';
    req.returnedComment = '';
    saveRequest_(req);
    audit_('request', req.id, 'PROXY_APPROVE', reason);
  });
  packet.mode = 'secretary_proxy';
  packet.proxyReason = reason;
  packet.status = 'completed';
  packet.updatedAt = new Date().toISOString();
  const sh = ensureSheet_(PACKETS_SHEET);
  const headers = packetHeaders_();
  ensureHeaders_(sh, headers);
  const stored = {
    id: packet.id,
    packetNo: packet.packetNo,
    signerKey: packet.signerKey,
    requestIdsJson: JSON.stringify(packet.requestIds || []),
    mode: packet.mode,
    proxyReason: packet.proxyReason,
    status: packet.status,
    createdAt: packet.createdAt,
    updatedAt: packet.updatedAt
  };
  upsertRow_(sh, headers, stored);
  audit_('packet', packet.id, 'PROXY_APPROVE_PACKET', reason);
  return packet;
}

function returnRequest_(input) {
  const req = getRecord_(REQUESTS_SHEET, String(input.id || ''));
  if (!req) throw new Error('Request not found');
  const comment = String(input.comment || '').trim();
  if (!comment) throw new Error('กรุณาระบุเหตุผลที่ตีกลับ');
  req.status = 'returned';
  req.returnedComment = comment;
  const saved = saveRequest_(req);
  audit_('request', saved.id, 'RETURN_REQUEST', comment);
  return saved;
}

function uploadOriginal_(input) {
  return uploadPdf_(input, 'Original');
}

function uploadApproved_(input) {
  return uploadPdf_(input, 'Approved');
}

function uploadPdf_(input, folderName) {
  const rootId = getRootFolderId_();
  if (!rootId) throw new Error('APPROVAL_ROOT_FOLDER_ID is not configured');
  const root = DriveApp.getFolderById(rootId);
  const folder = childFolder_(root, folderName);
  const name = String(input.name || (folderName + '_' + new Date().getTime() + '.pdf'));
  const base64 = String(input.base64 || '').replace(/^data:application\/pdf;base64,/, '');
  if (!base64) throw new Error('Missing PDF content');
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', name);
  const file = folder.createFile(blob);
  return { id: file.getId(), name: file.getName(), url: file.getUrl() };
}

function childFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getRootFolderId_() {
  return PropertiesService.getScriptProperties().getProperty('APPROVAL_ROOT_FOLDER_ID') || '';
}

function currentUser_() {
  return Session.getActiveUser().getEmail() || 'unknown';
}

function upsertRow_(sheet, headers, record) {
  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  if (values.length > 1) {
    const idCol = headers.indexOf('id');
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol] || '') === String(record.id)) { rowIndex = i + 1; break; }
    }
  }
  const row = headers.map(h => record[h] !== undefined ? record[h] : '');
  if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
  else sheet.appendRow(row);
}

function audit_(entityType, entityId, action, detail) {
  const sh = ensureSheet_(AUDIT_SHEET);
  const headers = auditHeaders_();
  ensureHeaders_(sh, headers);
  sh.appendRow([
    Utilities.getUuid(),
    entityType,
    entityId,
    action,
    detail || '',
    currentUser_(),
    new Date().toISOString()
  ]);
}

function makeNo_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss');
}
