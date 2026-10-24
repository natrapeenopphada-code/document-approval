const OA_APPROVAL_HISTORY_SHEET_ID = '1PC7pGX-28NqCak_5bKdSRNT23LNUdACZDC4j1qb-Tj8';
const OA_REQUESTS_SHEET = 'Requests';
const OA_PACKETS_SHEET = 'Packets';
const OA_AUDIT_SHEET = 'Audit';
const OA_CONFIG_SHEET = 'Config';
const OA_COMPANIES_SHEET = 'Companies';
const OA_SIGNERS_SHEET = 'Signers';
const OA_DELEGATIONS_SHEET = 'Delegations';

function oa_approvalApiDoGet_(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'health');
    if (action === 'health') return oa_json_({
      ok: true,
      user: oa_currentUser_(),
      sheetId: OA_APPROVAL_HISTORY_SHEET_ID,
      rootFolderId: oa_getRootFolderId_(),
      timestamp: new Date().toISOString()
    });
    if (action === 'listRequests') return oa_json_({ ok: true, requests: oa_listRecords_(OA_REQUESTS_SHEET) });
    if (action === 'listPackets') return oa_json_({ ok: true, packets: oa_listRecords_(OA_PACKETS_SHEET) });
    if (action === 'listCompanies') return oa_json_({ ok: true, companies: oa_listActiveCompanies_() });
    if (action === 'listSigners') return oa_json_({ ok: true, signers: oa_listActiveSigners_(String(e.parameter.companyCode || '')) });
    if (action === 'listDelegations') return oa_json_({ ok: true, delegations: oa_listActiveDelegations_(String(e.parameter.signerKey || ''), String(e.parameter.companyCode || '')) });
    if (action === 'getConfig') return oa_json_({ ok: true, config: oa_configMap_() });
    if (action === 'getRequest') return oa_json_({ ok: true, request: oa_getRecord_(OA_REQUESTS_SHEET, String(e.parameter.id || '')) });
    throw new Error('Unsupported action: ' + action);
  } catch (err) {
    return oa_json_({ ok: false, error: String(err && err.message || err) });
  }
}

function oa_approvalApiDoPost_(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    const payload = body.payload || {};
    if (action === 'saveRequest') return oa_json_({ ok: true, request: oa_saveRequest_(payload) });
    if (action === 'saveMarkers') return oa_json_({ ok: true, request: oa_saveMarkers_(payload) });
    if (action === 'createPacket') return oa_json_({ ok: true, packet: oa_createPacket_(payload) });
    if (action === 'proxyApprovePacket') return oa_json_({ ok: true, packet: oa_proxyApprovePacket_(payload) });
    if (action === 'returnRequest') return oa_json_({ ok: true, request: oa_returnRequest_(payload) });
    if (action === 'uploadOriginal') return oa_json_({ ok: true, file: oa_uploadOriginal_(payload) });
    if (action === 'uploadApproved') return oa_json_({ ok: true, file: oa_uploadApproved_(payload) });
    throw new Error('Unsupported action: ' + action);
  } catch (err) {
    return oa_json_({ ok: false, error: String(err && err.message || err) });
  }
}

function oa_json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function oa_db_() {
  return SpreadsheetApp.openById(OA_APPROVAL_HISTORY_SHEET_ID);
}

function oa_ensureSheet_(name) {
  const ss = oa_db_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function oa_ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  headers.forEach((header, i) => {
    if (String(current[i] || '') !== header) sheet.getRange(1, i + 1).setValue(header);
  });
}

function oa_requestHeaders_() {
  return ['id','requestNo','companyCode','department','requesterName','title','status','urgent','originalFileId','approvedFileId','returnedComment','markersJson','createdAt','updatedAt'];
}

function oa_packetHeaders_() {
  return ['id','packetNo','signerKey','requestIdsJson','mode','proxyReason','status','createdAt','updatedAt'];
}

function oa_auditHeaders_() {
  return ['id','entityType','entityId','action','detail','actorEmail','at'];
}

function oa_configMap_() {
  const sh = oa_ensureSheet_(OA_CONFIG_SHEET);
  const rows = sh.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '').trim();
    if (key) out[key] = rows[i][1];
  }
  return out;
}

function oa_listActiveCompanies_() {
  return oa_listRecords_(OA_COMPANIES_SHEET).filter(r => r.active === true || String(r.active).toUpperCase() === 'TRUE');
}

function oa_listActiveSigners_(companyCode) {
  return oa_listRecords_(OA_SIGNERS_SHEET).filter(r => {
    const active = r.active === true || String(r.active).toUpperCase() === 'TRUE';
    if (!active) return false;
    let codes = [];
    try { codes = JSON.parse(String(r.companyCodesJson || '[]')); } catch (_) { codes = []; }
    if (!companyCode) return true;
    return codes.map(String).includes(String(companyCode));
  }).map(r => {
    let codes = [];
    try { codes = JSON.parse(String(r.companyCodesJson || '[]')); } catch (_) { codes = []; }
    r.companyCodes = codes;
    delete r.companyCodesJson;
    return r;
  });
}

function oa_signerByKey_(key) {
  return oa_listActiveSigners_('').find(r => String(r.signerKey) === String(key)) || null;
}

function oa_companyByCode_(code) {
  return oa_listActiveCompanies_().find(r => String(r.companyCode) === String(code)) || null;
}

function oa_listActiveDelegations_(signerKey, companyCode) {
  const now = new Date().getTime();
  return oa_listRecords_(OA_DELEGATIONS_SHEET).filter(r => {
    const active = r.active === true || String(r.active).toUpperCase() === 'TRUE';
    if (!active) return false;
    if (signerKey && String(r.signerKey) !== String(signerKey)) return false;
    const start = r.startAt ? new Date(r.startAt).getTime() : -Infinity;
    const end = r.endAt ? new Date(r.endAt).getTime() : Infinity;
    if (Number.isFinite(start) && now < start) return false;
    if (Number.isFinite(end) && now > end) return false;
    let codes = [];
    try { codes = JSON.parse(String(r.companyCodesJson || '[]')); } catch (_) { codes = []; }
    if (companyCode && codes.length && !codes.map(String).includes(String(companyCode))) return false;
    r.companyCodes = codes;
    delete r.companyCodesJson;
    return true;
  });
}

function oa_requireDelegation_(signerKey, companyCode) {
  const actor = String(oa_currentUser_() || '').trim().toLowerCase();
  if (!actor || actor === 'unknown') throw new Error('ไม่สามารถยืนยันผู้ใช้งานสำหรับ Proxy Approval ได้');
  const delegation = oa_listActiveDelegations_(signerKey, companyCode).find(r => String(r.delegateEmail || '').trim().toLowerCase() === actor);
  if (!delegation) throw new Error('บัญชีนี้ไม่มี Delegation ที่ใช้งานได้สำหรับผู้บริหาร/บริษัทนี้');
  return delegation;
}

function oa_listRecords_(sheetName) {
  const sh = oa_ensureSheet_(sheetName);
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

function oa_getRecord_(sheetName, id) {
  if (!id) return null;
  return oa_listRecords_(sheetName).find(r => String(r.id) === String(id)) || null;
}

function oa_saveRequest_(input) {
  const sh = oa_ensureSheet_(OA_REQUESTS_SHEET);
  const headers = oa_requestHeaders_();
  oa_ensureHeaders_(sh, headers);
  const now = new Date().toISOString();
  const companyCode = String(input.companyCode || '').trim();
  if (!companyCode) throw new Error('กรุณาระบุบริษัท');
  if (!oa_companyByCode_(companyCode)) throw new Error('ไม่พบบริษัทใน Company Master: ' + companyCode);
  const record = {
    id: String(input.id || Utilities.getUuid()),
    requestNo: String(input.requestNo || oa_makeNo_('REQ')),
    companyCode: companyCode,
    department: String(input.department || ''),
    requesterName: String(input.requesterName || oa_currentUser_()),
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
  oa_upsertRow_(sh, headers, record);
  oa_audit_('request', record.id, 'SAVE_REQUEST', record.title);
  record.markers = input.markers || [];
  delete record.markersJson;
  return record;
}

function oa_saveMarkers_(input) {
  const existing = oa_getRecord_(OA_REQUESTS_SHEET, String(input.id || ''));
  if (!existing) throw new Error('Request not found');
  existing.markers = input.markers || [];
  existing.status = input.status || 'ready_for_approval';
  const saved = oa_saveRequest_(existing);
  oa_audit_('request', saved.id, 'SAVE_MARKERS', 'Marker count: ' + saved.markers.length);
  return saved;
}

function oa_createPacket_(input) {
  const sh = oa_ensureSheet_(OA_PACKETS_SHEET);
  const headers = oa_packetHeaders_();
  oa_ensureHeaders_(sh, headers);
  const ids = Array.isArray(input.requestIds) ? input.requestIds.map(String).filter(Boolean) : [];
  if (!ids.length) throw new Error('Packet must contain at least one request');
  const signerKey = String(input.signerKey || '').trim();
  const signer = oa_signerByKey_(signerKey);
  if (!signer) throw new Error('ไม่พบผู้ลงนามใน Signer Master');
  const packetRequests = ids.map(requestId => oa_getRecord_(OA_REQUESTS_SHEET, requestId));
  const missing = packetRequests.filter(r => !r);
  if (missing.length) throw new Error('มีเอกสารในชุดที่ไม่พบข้อมูล');
  packetRequests.forEach(req => {
    if (!Array.isArray(req.markers) || !req.markers.length) throw new Error('เอกสาร ' + req.requestNo + ' ยังไม่มีจุดอนุมัติ');
    const allowed = Array.isArray(signer.companyCodes) ? signer.companyCodes : [];
    if (!allowed.map(String).includes(String(req.companyCode))) throw new Error('ผู้ลงนามนี้ไม่ได้รับอนุญาตสำหรับบริษัท ' + req.companyCode);
  });
  const now = new Date().toISOString();
  const record = {
    id: String(input.id || Utilities.getUuid()),
    packetNo: String(input.packetNo || oa_makeNo_('PKT')),
    signerKey: signerKey,
    requestIdsJson: JSON.stringify(ids),
    mode: String(input.mode || 'executive'),
    proxyReason: String(input.proxyReason || ''),
    status: String(input.status || 'draft'),
    createdAt: String(input.createdAt || now),
    updatedAt: now
  };
  oa_upsertRow_(sh, headers, record);
  oa_audit_('packet', record.id, 'CREATE_PACKET', ids.join(','));
  record.requestIds = ids;
  delete record.requestIdsJson;
  return record;
}

function oa_proxyApprovePacket_(input) {
  const id = String(input.id || '');
  const packet = oa_getRecord_(OA_PACKETS_SHEET, id);
  if (!packet) throw new Error('Packet not found');
  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('กรุณาระบุเหตุผลการอนุมัติแทน');
  const signer = oa_signerByKey_(String(packet.signerKey || ''));
  if (!signer) throw new Error('ไม่พบผู้ลงนามของชุดนี้ใน Signer Master');
  const requests = Array.isArray(packet.requestIds) ? packet.requestIds : [];
  requests.forEach(requestId => {
    const req = oa_getRecord_(OA_REQUESTS_SHEET, String(requestId));
    if (!req) return;
    if (!Array.isArray(req.markers) || !req.markers.length) throw new Error('เอกสาร ' + req.requestNo + ' ยังไม่มีจุดอนุมัติ');
    const allowed = Array.isArray(signer.companyCodes) ? signer.companyCodes : [];
    if (!allowed.map(String).includes(String(req.companyCode))) throw new Error('ผู้ลงนามนี้ไม่ได้รับอนุญาตสำหรับบริษัท ' + req.companyCode);
    const delegation = oa_requireDelegation_(String(packet.signerKey || ''), String(req.companyCode || ''));
    req.status = 'approved_proxy';
    req.proxyDelegationId = delegation.id;
    req.returnedComment = '';
    oa_saveRequest_(req);
    oa_audit_('request', req.id, 'PROXY_APPROVE', reason + ' | delegation=' + String(delegation.id || ''));
  });
  packet.mode = 'secretary_proxy';
  packet.proxyReason = reason;
  packet.status = 'completed';
  packet.updatedAt = new Date().toISOString();
  const sh = oa_ensureSheet_(OA_PACKETS_SHEET);
  const headers = oa_packetHeaders_();
  oa_ensureHeaders_(sh, headers);
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
  oa_upsertRow_(sh, headers, stored);
  oa_audit_('packet', packet.id, 'PROXY_APPROVE_PACKET', reason);
  return packet;
}

function oa_returnRequest_(input) {
  const req = oa_getRecord_(OA_REQUESTS_SHEET, String(input.id || ''));
  if (!req) throw new Error('Request not found');
  const comment = String(input.comment || '').trim();
  if (!comment) throw new Error('กรุณาระบุเหตุผลที่ตีกลับ');
  req.status = 'returned';
  req.returnedComment = comment;
  const saved = oa_saveRequest_(req);
  oa_audit_('request', saved.id, 'RETURN_REQUEST', comment);
  return saved;
}

function oa_uploadOriginal_(input) {
  return oa_uploadPdf_(input, 'Original');
}

function oa_uploadApproved_(input) {
  return oa_uploadPdf_(input, 'Approved');
}

function oa_uploadPdf_(input, folderName) {
  const cfg = oa_configMap_();
  let folder = null;
  if (folderName === 'Approved' && cfg.APPROVED_FOLDER_ID) folder = DriveApp.getFolderById(String(cfg.APPROVED_FOLDER_ID));
  if (folderName === 'Original' && cfg.ORIGINAL_FOLDER_ID) folder = DriveApp.getFolderById(String(cfg.ORIGINAL_FOLDER_ID));
  if (!folder) {
    const rootId = oa_getRootFolderId_();
    if (!rootId) throw new Error('ROOT_FOLDER_ID is not configured');
    const root = DriveApp.getFolderById(rootId);
    folder = oa_childFolder_(root, folderName);
  }
  const name = String(input.name || (folderName + '_' + new Date().getTime() + '.pdf'));
  const base64 = String(input.base64 || '').replace(/^data:application\/pdf;base64,/, '');
  if (!base64) throw new Error('Missing PDF content');
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', name);
  const file = folder.createFile(blob);
  return { id: file.getId(), name: file.getName(), url: file.getUrl() };
}

function oa_childFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function oa_getRootFolderId_() {
  const cfg = oa_configMap_();
  return String(cfg.ROOT_FOLDER_ID || PropertiesService.getScriptProperties().getProperty('APPROVAL_ROOT_FOLDER_ID') || '');
}

function oa_currentUser_() {
  return Session.getActiveUser().getEmail() || 'unknown';
}

function oa_upsertRow_(sheet, headers, record) {
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

function oa_audit_(entityType, entityId, action, detail) {
  const sh = oa_ensureSheet_(OA_AUDIT_SHEET);
  const headers = oa_auditHeaders_();
  oa_ensureHeaders_(sh, headers);
  sh.appendRow([
    Utilities.getUuid(),
    entityType,
    entityId,
    action,
    detail || '',
    oa_currentUser_(),
    new Date().toISOString()
  ]);
}

function oa_makeNo_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd-HHmmss');
}
