import {
  apiGet,
  apiPost,
  getApprovalApiUrl,
  listOnlineSigners,
  type ApprovalPacketRecord,
  type ApprovalRequestRecord,
  type SignerMaster
} from './online-api';

let requests: ApprovalRequestRecord[] = [];
let packets: ApprovalPacketRecord[] = [];
let signers: SignerMaster[] = [];
let selected = new Set<string>();
let loadedCompany = '';
let loaded = false;
let loading = false;

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, function(ch) {
    const map: Record<string,string> = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
    return map[ch] || ch;
  });
}

export function invalidateOnlineWorkspace() {
  loaded = false;
  loadedCompany = '';
  signers = [];
}

export function onlineWorkspaceHtml(mode: 'inbox' | 'packets', companyCode: string) {
  const api = getApprovalApiUrl();
  const banner = '<div class="onlineBanner ' + (api ? 'configured' : 'missing') + '"><div><b>' +
    (api ? 'ONLINE BACKEND' : 'ยังไม่ได้เชื่อม Online Backend') + '</b><span>' +
    (api ? 'ข้อมูลกลาง: Google Sheet + Drive' : 'ไปที่ “ตั้งค่า” เพื่อใส่ Web App URL ของระบบอนุมัติเอกสาร') +
    '</span></div><button id="refreshOnline">รีเฟรชข้อมูล</button></div>';

  if (mode === 'inbox') {
    const options = signers
      .filter(function(s) { return !s.companyCodes || s.companyCodes.includes(companyCode); })
      .map(function(s) { return '<option value="' + esc(s.signerKey) + '">' + esc(s.displayName) + '</option>'; })
      .join('');
    return '<div class="appTop"><div><div class="eyebrow">SECRETARY APPROVAL INBOX</div><h2>กล่องเอกสารรออนุมัติ</h2><p>ตรวจเอกสาร เลือกหลายรายการ และสร้าง Approval Packet</p></div></div>' +
      banner +
      '<div id="onlineStatus" class="status">' + (loading ? 'กำลังโหลดข้อมูล...' : (loaded ? '✓ ข้อมูลออนไลน์พร้อมใช้งาน' : 'พร้อมโหลดข้อมูล')) + '</div>' +
      '<div class="packetBar"><label><input id="selectAllRequests" type="checkbox"> เลือกทั้งหมด</label>' +
      '<select id="packetSigner">' + (options || '<option value="">ยังไม่มีผู้ลงนามสำหรับบริษัทนี้</option>') + '</select>' +
      '<button id="createPacketBtn" class="primary">สร้างชุดอนุมัติ <span id="packetCount">' + (selected.size ? '(' + selected.size + ')' : '') + '</span></button></div>' +
      '<div id="requestGrid" class="requestGrid">' + requestRows(companyCode) + '</div>';
  }

  return '<div class="appTop"><div><div class="eyebrow">APPROVAL PACKETS</div><h2>ชุดอนุมัติ</h2><p>ส่งให้ผู้บริหาร หรืออนุมัติแทนเป็นชุด โดยแต่ละเอกสารเก็บ Marker ของตัวเอง</p></div></div>' +
    banner +
    '<div id="onlineStatus" class="status">' + (loading ? 'กำลังโหลดข้อมูล...' : (loaded ? '✓ ข้อมูลออนไลน์พร้อมใช้งาน' : 'พร้อมโหลดข้อมูล')) + '</div>' +
    '<div id="packetGrid" class="packetGrid">' + packetRows(companyCode) + '</div>';
}

function requestRows(companyCode: string) {
  const rows = requests.filter(function(item) { return !companyCode || item.companyCode === companyCode; });
  if (!rows.length) return '<div class="emptyOnline">ยังไม่มีเอกสารของบริษัทนี้</div>';
  return rows.map(function(item) {
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

function labelForSigner(key: string) {
  const found = signers.find(function(s) { return s.signerKey === key; });
  return found ? found.displayName : key || '-';
}

function packetRows(companyCode: string) {
  const rows = packets.filter(function(packet) {
    const docs = requests.filter(function(r) { return (packet.requestIds || []).includes(r.id); });
    return !companyCode || docs.some(function(r) { return r.companyCode === companyCode; });
  });
  if (!rows.length) return '<div class="emptyOnline">ยังไม่มี Approval Packet ของบริษัทนี้</div>';
  return rows.map(function(packet) {
    return '<article class="packetCard"><div><span class="packetNo">' + esc(packet.packetNo || packet.id) + '</span><strong>' +
      esc(labelForSigner(packet.signerKey)) + '</strong><small>' + String((packet.requestIds || []).length) + ' เอกสาร • ' + esc(packet.status || '-') +
      '</small></div><div class="packetActions"><button data-open-packet="' + esc(packet.id) + '">ดูรายการ</button>' +
      (packet.status !== 'completed' ? '<button data-proxy-packet="' + esc(packet.id) + '" class="primary">อนุมัติแทนทั้งชุด</button>' : '') +
      '</div></article>';
  }).join('');
}

async function loadOnline(companyCode: string) {
  if (!getApprovalApiUrl()) throw new Error('ยังไม่ได้ตั้งค่า Apps Script Web App URL');
  if (loading) return;
  loading = true;
  try {
    const [rr, pp, ss] = await Promise.all([
      apiGet<{ok:boolean;requests:ApprovalRequestRecord[]}>('listRequests'),
      apiGet<{ok:boolean;packets:ApprovalPacketRecord[]}>('listPackets'),
      listOnlineSigners(companyCode)
    ]);
    requests = rr.requests || [];
    packets = pp.packets || [];
    signers = ss || [];
    selected = new Set(Array.from(selected).filter(function(id) {
      return requests.some(function(r) { return r.id === id && (!companyCode || r.companyCode === companyCode); });
    }));
    loaded = true;
    loadedCompany = companyCode;
  } finally {
    loading = false;
  }
}

export function wireOnlineWorkspace(
  mode: 'inbox' | 'packets',
  companyCode: string,
  rerender: () => void,
  showPacket: (title:string, body:string) => void
) {
  const refresh = document.querySelector('#refreshOnline') as HTMLButtonElement | null;
  if (refresh) refresh.onclick = async function() {
    loaded = false;
    const st = document.querySelector('#onlineStatus') as HTMLElement | null;
    if (st) st.textContent = 'กำลังรีเฟรชข้อมูลออนไลน์...';
    try {
      await loadOnline(companyCode);
      rerender();
    } catch (err) {
      if (st) st.textContent = 'เชื่อม Online Backend ไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err));
    }
  };

  if (mode === 'inbox') {
    const visibleRequests = requests.filter(function(r) { return !companyCode || r.companyCode === companyCode; });
    const all = document.querySelector('#selectAllRequests') as HTMLInputElement | null;
    if (all) all.onchange = function() {
      selected = all.checked ? new Set(visibleRequests.map(function(r) { return r.id; })) : new Set();
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
      const chosen = requests.filter(function(r) { return ids.includes(r.id); });
      const wrongCompany = chosen.some(function(r) { return r.companyCode !== companyCode; });
      if (wrongCompany) return alert('Approval Packet หนึ่งชุดต้องเป็นบริษัทเดียวกัน');
      const blocked = chosen.filter(function(r) { return !(Array.isArray(r.markers) && r.markers.length); });
      if (blocked.length) return alert('ยังสร้างชุดไม่ได้ มี ' + blocked.length + ' เอกสารที่ยังไม่ได้วางจุดอนุมัติ');
      const signer = (document.querySelector('#packetSigner') as HTMLSelectElement | null)?.value || '';
      if (!signer) return alert('ยังไม่มีผู้ลงนามสำหรับบริษัทนี้');
      try {
        await apiPost('createPacket', { requestIds: ids, signerKey: signer, mode: 'executive', status: 'draft' });
        selected.clear();
        loaded = false;
        await loadOnline(companyCode);
        rerender();
      } catch (err) {
        alert('สร้างชุดไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err)));
      }
    };
  } else {
    Array.from(document.querySelectorAll('[data-proxy-packet]')).forEach(function(node) {
      const el = node as HTMLButtonElement;
      el.onclick = async function() {
        const id = el.dataset.proxyPacket || '';
        const reason = window.prompt('เหตุผลการอนุมัติแทน เช่น ผู้บริหารเดินทางต่างประเทศ');
        if (!reason?.trim()) return;
        if (!window.confirm('ยืนยันอนุมัติแทนทั้งชุดหรือไม่? ระบบจะบันทึกเหตุผลและ Audit Trail ทุกเอกสาร')) return;
        try {
          await apiPost('proxyApprovePacket', { id: id, reason: reason.trim() });
          loaded = false;
          await loadOnline(companyCode);
          rerender();
        } catch (err) {
          alert('อนุมัติแทนไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err)));
        }
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

  if (!loaded || loadedCompany !== companyCode) {
    const st = document.querySelector('#onlineStatus') as HTMLElement | null;
    if (st) st.textContent = 'กำลังโหลดข้อมูลออนไลน์...';
    void loadOnline(companyCode)
      .then(function() { rerender(); })
      .catch(function(err) {
        const status = document.querySelector('#onlineStatus') as HTMLElement | null;
        if (status) status.textContent = 'เชื่อม Online Backend ไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err));
      });
  }
}
