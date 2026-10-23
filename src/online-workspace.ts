
import { apiGet, apiPost, getApprovalApiUrl, type ApprovalPacketRecord, type ApprovalRequestRecord } from './online-api';

let requests: ApprovalRequestRecord[] = [];
let packets: ApprovalPacketRecord[] = [];
let selected = new Set<string>();

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, function(ch) {
    const map: Record<string,string> = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
    return map[ch] || ch;
  });
}

export function onlineWorkspaceHtml(mode: 'inbox' | 'packets', signerOptions: Array<[string,string]>) {
  const api = getApprovalApiUrl();
  const banner = '<div class="onlineBanner ' + (api ? 'configured' : 'missing') + '"><div><b>' +
    (api ? 'ONLINE BACKEND' : 'ยังไม่ได้เชื่อม Online Backend') + '</b><span>' +
    (api ? 'Apps Script API ถูกตั้งค่าแล้ว' : 'ไปที่ “ตั้งค่า” เพื่อใส่ Web App URL ของระบบอนุมัติเอกสาร') +
    '</span></div><button id="refreshOnline">รีเฟรชข้อมูล</button></div>';
  if (mode === 'inbox') {
    const options = signerOptions.map(function(s) { return '<option value="' + esc(s[0]) + '">' + esc(s[1]) + '</option>'; }).join('');
    return '<div class="appTop"><div><div class="eyebrow">SECRETARY APPROVAL INBOX</div><h2>กล่องเอกสารรออนุมัติ</h2><p>ตรวจเอกสาร เลือกหลายรายการ และสร้าง Approval Packet</p></div></div>' +
      banner +
      '<div id="onlineStatus" class="status">พร้อมโหลดข้อมูล</div>' +
      '<div class="packetBar"><label><input id="selectAllRequests" type="checkbox"> เลือกทั้งหมด</label>' +
      '<select id="packetSigner">' + options + '</select><button id="createPacketBtn" class="primary">สร้างชุดอนุมัติ <span id="packetCount"></span></button></div>' +
      '<div id="requestGrid" class="requestGrid">' + requestRows() + '</div>';
  }
  return '<div class="appTop"><div><div class="eyebrow">APPROVAL PACKETS</div><h2>ชุดอนุมัติ</h2><p>ส่งให้ผู้บริหาร หรืออนุมัติแทนเป็นชุด โดยแต่ละเอกสารยังเก็บ Marker ของตัวเอง</p></div></div>' +
    banner +
    '<div id="onlineStatus" class="status">พร้อมโหลดข้อมูล</div>' +
    '<div id="packetGrid" class="packetGrid">' + packetRows(signerOptions) + '</div>';
}

function requestRows() {
  if (!requests.length) return '<div class="emptyOnline">ยังไม่มีรายการ หรือยังไม่ได้เชื่อม Online Backend</div>';
  return requests.map(function(item) {
    const checked = selected.has(item.id);
    const ready = Array.isArray(item.markers) && item.markers.length > 0;
    return '<article class="requestCard ' + (checked ? 'selected' : '') + '">' +
      '<label class="requestPick"><input type="checkbox" data-request-pick="' + esc(item.id) + '" ' + (checked ? 'checked' : '') + '></label>' +
      '<div class="requestInfo"><div class="requestTop"><strong>' + esc(item.title || item.requestNo || item.id) + '</strong>' +
      (item.urgent ? '<b class="urgentTag">ด่วน</b>' : '') + '</div><span>' + esc(item.requestNo || '-') + ' • ' + esc(item.companyCode || '-') + ' • ' + esc(item.department || '-') +
      '</span><small>' + esc(item.requesterName || '-') + '</small></div>' +
      '<div class="requestState ' + (ready ? 'ready' : 'needsMarker') + '">' + (ready ? '✓ พร้อมอนุมัติ' : '⚠ ต้องวางจุดอนุมัติ') + '</div></article>';
  }).join('');
}

function labelForSigner(key: string, signerOptions: Array<[string,string]>) {
  const found = signerOptions.find(function(s) { return s[0] === key; });
  return found ? found[1] : key || '-';
}

function packetRows(signerOptions: Array<[string,string]>) {
  if (!packets.length) return '<div class="emptyOnline">ยังไม่มี Approval Packet</div>';
  return packets.map(function(packet) {
    return '<article class="packetCard"><div><span class="packetNo">' + esc(packet.packetNo || packet.id) + '</span><strong>' +
      esc(labelForSigner(packet.signerKey, signerOptions)) + '</strong><small>' + String((packet.requestIds || []).length) + ' เอกสาร • ' + esc(packet.status || '-') +
      '</small></div><div class="packetActions"><button data-open-packet="' + esc(packet.id) + '">ดูรายการ</button>' +
      (packet.status !== 'completed' ? '<button data-proxy-packet="' + esc(packet.id) + '" class="primary">อนุมัติแทนทั้งชุด</button>' : '') +
      '</div></article>';
  }).join('');
}

async function loadOnline() {
  const status = document.querySelector('#onlineStatus') as HTMLElement | null;
  if (!getApprovalApiUrl()) {
    if (status) status.textContent = 'ยังไม่ได้ตั้งค่า Apps Script Web App URL';
    return;
  }
  if (status) status.textContent = 'กำลังโหลดข้อมูลออนไลน์...';
  try {
    const rr = await apiGet<{ok:boolean;requests:ApprovalRequestRecord[]}>('listRequests');
    const pp = await apiGet<{ok:boolean;packets:ApprovalPacketRecord[]}>('listPackets');
    requests = rr.requests || [];
    packets = pp.packets || [];
    selected = new Set(Array.from(selected).filter(function(id) { return requests.some(function(r) { return r.id === id; }); }));
    if (status) status.textContent = '✓ เชื่อม Online Backend แล้ว • ' + requests.length + ' เอกสาร • ' + packets.length + ' ชุด';
  } catch (err) {
    if (status) status.textContent = 'เชื่อม Online Backend ไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err));
  }
}

export function wireOnlineWorkspace(mode: 'inbox' | 'packets', signerOptions: Array<[string,string]>, rerender: () => void, showPacket: (title:string, body:string) => void) {
  const refresh = document.querySelector('#refreshOnline') as HTMLButtonElement | null;
  if (refresh) refresh.onclick = async function() { await loadOnline(); rerender(); };

  if (mode === 'inbox') {
    const all = document.querySelector('#selectAllRequests') as HTMLInputElement | null;
    if (all) all.onchange = function() {
      selected = all.checked ? new Set(requests.map(function(r) { return r.id; })) : new Set();
      rerender();
    };
    Array.from(document.querySelectorAll('[data-request-pick]')).forEach(function(node) {
      const el = node as HTMLInputElement;
      el.onchange = function() {
        const id = el.dataset.requestPick || '';
        if (el.checked) selected.add(id); else selected.delete(id);
        const count = document.querySelector('#packetCount');
        if (count) count.textContent = selected.size ? '(' + selected.size + ')' : '';
      };
    });
    const create = document.querySelector('#createPacketBtn') as HTMLButtonElement | null;
    if (create) create.onclick = async function() {
      const ids = Array.from(selected);
      if (!ids.length) return alert('กรุณาเลือกเอกสารอย่างน้อย 1 รายการ');
      const blocked = requests.filter(function(r) { return ids.includes(r.id) && !(Array.isArray(r.markers) && r.markers.length); });
      if (blocked.length) return alert('ยังสร้างชุดไม่ได้ มี ' + blocked.length + ' เอกสารที่ยังไม่ได้วางจุดอนุมัติ');
      const signer = (document.querySelector('#packetSigner') as HTMLSelectElement | null)?.value || '';
      await apiPost('createPacket', { requestIds: ids, signerKey: signer, mode: 'executive', status: 'draft' });
      selected.clear();
      await loadOnline();
      rerender();
    };
  } else {
    Array.from(document.querySelectorAll('[data-proxy-packet]')).forEach(function(node) {
      const el = node as HTMLButtonElement;
      el.onclick = async function() {
        const id = el.dataset.proxyPacket || '';
        const reason = window.prompt('เหตุผลการอนุมัติแทน เช่น ผู้บริหารเดินทางต่างประเทศ');
        if (!reason?.trim()) return;
        if (!window.confirm('ยืนยันอนุมัติแทนทั้งชุดหรือไม่? ระบบจะบันทึกเหตุผลและ Audit Trail ทุกเอกสาร')) return;
        await apiPost('proxyApprovePacket', { id: id, reason: reason.trim() });
        await loadOnline();
        rerender();
      };
    });
    Array.from(document.querySelectorAll('[data-open-packet]')).forEach(function(node) {
      const el = node as HTMLButtonElement;
      el.onclick = function() {
        const packet = packets.find(function(p) { return p.id === (el.dataset.openPacket || ''); });
        if (!packet) return;
        const docs = requests.filter(function(r) { return (packet.requestIds || []).includes(r.id); });
        const body = '<div class="packetModal">' + docs.map(function(r) {
          return '<div class="packetDoc"><b>' + esc(r.requestNo || r.id) + '</b><span>' + esc(r.title || '') + '</span><small>' +
            (Array.isArray(r.markers) && r.markers.length ? '✓ Marker พร้อม' : '⚠ ยังไม่มี Marker') + '</small></div>';
        }).join('') + '</div>';
        showPacket('Approval Packet ' + (packet.packetNo || ''), body);
      };
    });
  }

  void loadOnline().then(function() { rerender(); });
}
