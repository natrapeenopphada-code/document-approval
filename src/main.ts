import './styles.css';

declare global {
  interface Window {
    PDFLib: any;
    pdfjsLib: any;
    showSaveFilePicker?: any;
  }
}

type Q = { id: string; file: File };
type Obj = {
  id: string;
  page: number;
  type: 'image' | 'text';
  kind: string;
  src?: string;
  text?: string;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  rot: number;
  opacity: number;
  font: number;
  color: string;
};
type AssetMap = Record<string, string>;
type Hist = { id?: string; date: string; company: string; fileName: string; signers: string };

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const $$ = (s: string) => Array.from(document.querySelectorAll(s)) as HTMLElement[];
const uid = () => Math.random().toString(36).slice(2);

let view = 'approve';
let company = 'NSF';
let tool = 'merge';
let queue: Q[] = [];
let currentPdf: File | null = null;
let approvalBytes: ArrayBuffer | null = null;
let previewDoc: any = null;
let page = 1;
let zoom = 0.8;
let zoomMode = 'fit';
let deletePages = new Set<number>();
let objects: Obj[] = [];
let selected: string | null = null;
let clipboard: Obj | null = null;
let assets: AssetMap = JSON.parse(localStorage.getItem('approvalAssets') || '{}');
let history: Hist[] = JSON.parse(localStorage.getItem('approvalHistory') || '[]');
let sizes: Record<string, { w: number; h: number }> = JSON.parse(localStorage.getItem('approvalSizes') || '{}');

const companies = [
  { code: 'NSF', name: 'Nopphada Superfoods Co.,Ltd', signers: [['sig1', 'นพดา'], ['sig2', 'กานต์']] },
  { code: 'NSS', name: 'Nopphada Seasoning Co.,Ltd', signers: [['sig1', 'นพดา'], ['sig2', 'กานต์']] },
  { code: 'NCR', name: 'NCR Product Co.,Ltd', signers: [['sig3', 'ชลกนก']] }
];

const toolGroups = [
  ['PDF งานประจำ', [
    ['merge', 'รวม PDF', 'รวมเอกสารหลายฉบับเป็นไฟล์เดียว'],
    ['arrange', 'จัดหน้า PDF', 'ย้าย / ลบ / หมุน และเรียงหน้าใหม่'],
    ['extract', 'เลือกหน้าออก', 'สร้าง PDF ใหม่จากหน้าที่ต้องการ'],
    ['compress', 'ลดขนาด PDF', 'ลดขนาดสำหรับอีเมลและเว็บราชการ'],
    ['pagenum', 'ใส่เลขหน้า', 'ใส่เลขหน้าทุกหน้าแบบอัตโนมัติ'],
    ['watermark', 'คาดเอกสารหลายหน้า', 'ใส่ข้อความคาดเอกสารทุกหน้า'],
    ['insert', 'แทรก PDF', 'แทรกเอกสารอีกฉบับในตำแหน่งที่กำหนด']
  ]],
  ['จัดการรูปภาพ', [
    ['resize', 'รีไซส์รูปภาพ', 'ปรับด้านกว้างสูงสุดโดยรักษาสัดส่วน'],
    ['jpgpng', 'JPG → PNG', 'แปลงหลายไฟล์พร้อมกัน']
  ]],
  ['แปลงไฟล์', [
    ['imgpdf', 'รูป → PDF', 'รวม JPG/PNG เป็น PDF'],
    ['pdfimg', 'PDF → JPG/PNG', 'แปลงหน้า PDF เป็นรูป']
  ]]
] as const;

const tools = toolGroups.flatMap(g => g[1]);
const toolAction: Record<string, string> = {
  merge: 'รวม PDF',
  arrange: 'สร้าง PDF ที่จัดหน้าแล้ว',
  extract: 'บันทึกหน้าที่เลือก',
  compress: 'ลดขนาด PDF',
  pagenum: 'ใส่เลขหน้าและบันทึก',
  watermark: 'คาดเอกสารและบันทึก',
  insert: 'แทรก PDF และบันทึก',
  resize: 'รีไซส์รูปทั้งหมด',
  jpgpng: 'แปลงทั้งหมดเป็น PNG',
  imgpdf: 'สร้าง PDF จากรูป',
  pdfimg: 'แปลงเป็นรูปทั้งหมด'
};

const comp = () => companies.find(c => c.code === company)!;
const current = () => objects.find(o => o.id === selected) || null;
const persist = () => {
  localStorage.setItem('approvalAssets', JSON.stringify(assets));
  localStorage.setItem('approvalHistory', JSON.stringify(history.slice(0, 200)));
  localStorage.setItem('approvalSizes', JSON.stringify(sizes));
};

function render() {
  document.querySelector('#app')!.innerHTML = `<div class='shell'>
    <aside class='side'>
      <div class='brand'>
        <div class='brandmark'>${assets['logo_' + company] ? `<img src='${assets['logo_' + company]}' alt='Company logo'>` : '✓'}</div>
        <div><h1>อนุมัติเอกสาร</h1><div class='sub'>DOCUMENT WORKSPACE</div></div>
      </div>
      <div class='nav'>
        <button data-view='approve' class='${view === 'approve' ? 'active' : ''}'>อนุมัติเอกสาร</button>
        <button data-view='tools' class='${view === 'tools' ? 'active' : ''}'>เครื่องมือเอกสาร</button>
        <button id='historyBtn'>ประวัติการอนุมัติ</button>
        <button id='settingsBtn'>ตั้งค่า</button>
      </div>
      <div class='field'>
        <label>บริษัท</label>
        <select id='company'>${companies.map(c => `<option value='${c.code}' ${c.code === company ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
      </div>
      ${view === 'approve' ? `<div class='field'><label>PDF ต้นฉบับ</label><input id='pdfFile' type='file' accept='.pdf,application/pdf'></div><div class='thumbTitle'>หน้าเอกสาร</div><div id='thumbs' class='thumbs'></div>` : ''}
    </aside>
    <main class='main'>${view === 'tools' ? toolsHtml() : approveHtml()}</main>
    ${view === 'approve' ? `<aside id='inspector' class='inspect'></aside>` : ''}
  </div>`;

  $$('[data-view]').forEach(b => b.onclick = () => {
    view = b.dataset.view || 'approve';
    render();
  });

  ($('#company') as HTMLSelectElement).onchange = e => {
    company = (e.target as HTMLSelectElement).value;
    render();
  };

  $('#settingsBtn').onclick = showSettings;
  $('#historyBtn').onclick = showHistory;
  if (view === 'tools') wireTools();
  else wireApprove();
}

function toolsHtml() {
  const groups = toolGroups.map(g => `<section class='toolGroup'><div class='groupTitle'>${g[0]}</div><div class='cards'>${g[1].map(t => `<button class='toolcard ${tool === t[0] ? 'primary' : ''}' data-tool='${t[0]}'><b>${t[1]}</b><span>${t[2]}</span></button>`).join('')}</div></section>`).join('');
  return `<div class='top toolTop'><div><div class='eyebrow'>OFFICE & SALES DOCUMENT TOOLS</div><h1>เครื่องมือเอกสาร</h1><div class='sub'>เลือกเฉพาะงานที่ใช้จริง — เพิ่มไฟล์ได้หลายรอบแม้อยู่คนละโฟลเดอร์</div></div></div><div class='toolScroll'>${groups}<div class='panel toolPanel'><div class='selectedTool'><span>กำลังใช้</span><b>${tools.find(t => t[0] === tool)?.[1] || ''}</b></div><input id='picker' type='file' class='hidden' multiple accept='${['resize', 'jpgpng', 'imgpdf'].includes(tool) ? 'image/jpeg,image/png' : '.pdf,application/pdf'}'><div class='row fileActions'><button id='add' class='btn'>+ เพิ่มไฟล์</button><button id='clear' class='btn'>ล้างรายการ</button></div><div id='queue' class='queue'></div>${tool === 'extract' ? `<div class='field'><label>หน้าที่ต้องการ</label><input id='pages' value='1' placeholder='เช่น 1,3,5-8'></div>` : ''}${tool === 'arrange' ? `<div class='field'><label>ลำดับหน้าที่ต้องการ</label><input id='order' value='1' placeholder='เช่น 1,3,2,4'></div><div class='field'><label>หมุนหน้าที่เลือก 90°</label><input id='rotatePages' placeholder='เช่น 2,4'></div>` : ''}${tool === 'resize' ? `<div class='field'><label>ความกว้างสูงสุด (px)</label><input id='maxW' type='number' value='1400'></div>` : ''}${tool === 'compress' ? `<div class='field'><label>คุณภาพ</label><select id='quality'><option value='55'>ไฟล์เล็ก</option><option value='70' selected>สมดุล</option><option value='85'>คุณภาพสูง</option></select></div>` : ''}${tool === 'pagenum' ? `<div class='optionGrid'><div class='field'><label>เริ่มเลขหน้า</label><input id='pageStart' type='number' min='1' value='1'></div><div class='field'><label>ตำแหน่ง</label><select id='pagePos'><option value='bottom-center'>ล่างกลาง</option><option value='bottom-right'>ล่างขวา</option><option value='top-right'>บนขวา</option></select></div></div>` : ''}${tool === 'watermark' ? `<div class='optionGrid'><div class='field'><label>ข้อความคาดเอกสาร</label><input id='wmText' value='ใช้สำหรับประกอบเอกสารเท่านั้น'></div><div class='field'><label>ความเข้ม</label><select id='wmOpacity'><option value='.12'>จาง</option><option value='.2' selected>ปกติ</option><option value='.32'>เข้ม</option></select></div></div>` : ''}${tool === 'insert' ? `<div class='field'><label>แทรกไฟล์ที่ 2 หลังหน้าที่</label><input id='insertAfter' type='number' min='0' value='1'><small>ไฟล์แรก = เอกสารหลัก, ไฟล์ที่สอง = เอกสารที่จะแทรก</small></div>` : ''}${tool === 'pdfimg' ? `<div class='field'><label>ชนิดรูป</label><select id='fmt'><option value='jpeg'>JPG</option><option value='png'>PNG</option></select></div>` : ''}<div class='runRow'><button id='run' class='btn primary'>${toolAction[tool] || 'ประมวลผล'}</button><div id='status' class='status'>พร้อมใช้งาน</div></div></div></div>`;
}

function approveHtml() {
  const c = comp();
  return `<div class='appTop'><div><div class='eyebrow'>DOCUMENT WORKSPACE</div><h2>จัดเตรียมและลงนามเอกสาร</h2><p>รวมเอกสาร จัดหน้า ลบหน้า และลงนามได้ในหน้าเดียว</p></div><div class='savePrint'><button id='saveApproved' class='primary'>Save As</button><button id='printApproved' class='printBtn'>🖨 Print</button></div></div><div class='docbar'><input id='appendPdf' class='hidden' type='file' accept='.pdf,application/pdf' multiple><button id='appendPdfBtn'>+ เพิ่มเอกสาร</button><button id='selectAllPages'>เลือกทุกหน้า</button><button id='clearPageSelection'>ยกเลิกเลือก</button><button id='deleteSelectedPages' class='danger'>ลบหน้าที่เลือก <span id='deleteCount'></span></button><span class='docHint'>ติ๊กหน้าในแถบซ้ายเพื่อลบหลายหน้าพร้อมกัน</span></div><div class='toolbar'>${c.signers.map(s => `<button data-img='signature_${s[0]}'>${s[1]}</button>`).join('')}${c.signers.map(s => `<button data-img='combined_${company}_${s[0]}' class='soft'>${s[1]}+ตรา</button>`).join('')}<button data-img='stamp_${company}' class='soft'>ตราปั๊ม</button><button data-img='logo_${company}' class='soft'>โลโก้</button><button id='addText'>ข้อความ</button><button id='addDate'>วันที่</button><button id='addWatermark'>คาดเอกสาร</button><button id='copyBtn'>คัดลอก</button><button id='pasteBtn'>วาง</button><button id='deleteBtn' class='danger'>ลบ</button></div><div id='status' class='status'>${previewDoc ? `หน้า ${page} / ${previewDoc.numPages}` : 'พร้อมรับเอกสาร'}</div><div class='zoombar'><button id='fitBtn'>พอดีหน้า</button><button id='widthBtn'>พอดีกว้าง</button><button data-z='.75'>75%</button><button data-z='1'>100%</button><button data-z='1.25'>125%</button><span id='zoomText'>${Math.round(zoom * 100)}%</span><div class='spacer'></div><button id='prev'>‹</button><button id='next'>›</button></div><div id='workarea' class='workarea'><div id='stage' class='stage'><canvas id='preview'></canvas><div id='overlay' class='overlay'></div></div><div id='quick' class='quick'><button id='qCopy'>คัดลอก</button><button id='qPaste'>วาง</button><button id='qDelete' class='danger'>ลบ</button></div></div>`;
}

function wireApprove() {
  const input = $('#pdfFile') as HTMLInputElement;
  input.onchange = async () => {
    currentPdf = input.files?.[0] || null;
    if (!currentPdf) return;
    approvalBytes = (await currentPdf.arrayBuffer()).slice(0);
    deletePages.clear();
    previewDoc = await window.pdfjsLib.getDocument({ data: approvalBytes.slice(0) }).promise;
    page = 1;
    objects = [];
    selected = null;
    zoomMode = 'fit';
    await drawPreview();
    await renderThumbs();
    updateInspector();
  };

  const append = $('#appendPdf') as HTMLInputElement;
  $('#appendPdfBtn').onclick = () => append.click();
  append.onchange = async () => {
    const files = Array.from(append.files || []);
    append.value = '';
    if (!files.length) return;
    await appendApprovalFiles(files);
  };

  $('#selectAllPages').onclick = () => {
    if (!previewDoc) return;
    deletePages = new Set(Array.from({ length: previewDoc.numPages }, (_, i) => i + 1));
    renderThumbs();
    updateDeleteCount();
  };
  $('#clearPageSelection').onclick = () => {
    deletePages.clear();
    renderThumbs();
    updateDeleteCount();
  };
  $('#deleteSelectedPages').onclick = deleteSelectedApprovalPages;
  $('#printApproved').onclick = printAsPdf;

  // FIX: bind every signature / stamp / logo button, not only the first one.
  $$('[data-img]').forEach(b => b.onclick = () => addImage(b.dataset.img || ''));

  $('#addText').onclick = () => addText('text', 'ข้อความ');
  $('#addDate').onclick = () => addText('date', new Date().toLocaleDateString('th-TH'));
  $('#addWatermark').onclick = () => addText('watermark', 'ใช้สำหรับประกอบเอกสารเท่านั้น');
  $('#copyBtn').onclick = copyObj;
  $('#pasteBtn').onclick = pasteObj;
  $('#deleteBtn').onclick = deleteObj;
  $('#qCopy').onclick = copyObj;
  $('#qPaste').onclick = pasteObj;
  $('#qDelete').onclick = deleteObj;
  $('#saveApproved').onclick = saveAsPdf;
  $('#fitBtn').onclick = async () => { zoomMode = 'fit'; await drawPreview(); };
  $('#widthBtn').onclick = async () => { zoomMode = 'width'; await drawPreview(); };
  $$('[data-z]').forEach(b => b.onclick = async () => {
    zoomMode = 'manual';
    zoom = +(b.dataset.z || '.8');
    await drawPreview();
  });
  $('#prev').onclick = async () => { if (previewDoc && page > 1) { page--; await drawPreview(); markThumb(); } };
  $('#next').onclick = async () => { if (previewDoc && page < previewDoc.numPages) { page++; await drawPreview(); markThumb(); } };
  if (previewDoc) { drawPreview(); renderThumbs(); } else updateInspector();
  window.onresize = () => { if (view === 'approve' && previewDoc && zoomMode !== 'manual') drawPreview(); };
}

async function drawPreview() {
  if (!previewDoc) return;
  const p = await previewDoc.getPage(page);
  const base = p.getViewport({ scale: 1 });
  const wa = $('#workarea');
  if (zoomMode === 'fit') zoom = Math.max(.35, Math.min(1.25, Math.min((wa.clientWidth - 42) / base.width, (wa.clientHeight - 34) / base.height)));
  if (zoomMode === 'width') zoom = Math.max(.35, Math.min(1.5, (wa.clientWidth - 42) / base.width));
  const v = p.getViewport({ scale: zoom });
  const c = $('#preview') as HTMLCanvasElement;
  c.width = v.width;
  c.height = v.height;
  const st = $('#stage');
  st.style.width = v.width + 'px';
  st.style.height = v.height + 'px';
  await p.render({ canvasContext: c.getContext('2d')!, viewport: v }).promise;
  $('#zoomText').textContent = Math.round(zoom * 100) + '%';
  $('#status').textContent = `หน้า ${page} / ${previewDoc.numPages}`;
  drawObjects();
}

function remembered(kind: string) {
  return sizes[kind] || {
    w: kind.startsWith('combined') ? .30 : kind.startsWith('logo') ? .18 : kind.startsWith('stamp') ? .18 : .24,
    h: kind.startsWith('combined') ? .13 : kind.startsWith('logo') ? .08 : kind.startsWith('stamp') ? .16 : .10
  };
}

function addImage(kind: string) {
  if (!previewDoc) return alert('กรุณาเลือก PDF ก่อน');
  const src = assets[kind];
  if (!src) return alert('ยังไม่ได้ตั้งค่าไฟล์นี้ ไปที่เมนู “ตั้งค่า” ก่อน');
  const s = remembered(kind);
  const o: Obj = { id: uid(), page, type: 'image', kind, src, nx: .69, ny: .76, nw: s.w, nh: s.h, rot: 0, opacity: 100, font: 20, color: '#34454c' };
  objects.push(o);
  selected = o.id;
  drawObjects();
  updateInspector();
}

function addText(kind: string, text: string) {
  if (!previewDoc) return alert('กรุณาเลือก PDF ก่อน');
  const wm = kind === 'watermark';
  const o: Obj = { id: uid(), page, type: 'text', kind, text, nx: wm ? .18 : .12, ny: wm ? .43 : .16, nw: wm ? .64 : .30, nh: wm ? .10 : .08, rot: wm ? -30 : 0, opacity: wm ? 18 : 100, font: wm ? 28 : 20, color: wm ? '#6f7d82' : '#283b43' };
  objects.push(o);
  selected = o.id;
  drawObjects();
  updateInspector();
}

function drawObjects() {
  const ov = $('#overlay');
  if (!ov) return;
  ov.innerHTML = '';
  objects.filter(o => o.page === page).forEach(o => {
    const el = document.createElement('div');
    el.className = 'obj' + (o.id === selected ? ' selected' : '');
    Object.assign(el.style, { left: o.nx * 100 + '%', top: o.ny * 100 + '%', width: o.nw * 100 + '%', height: o.nh * 100 + '%', transform: `rotate(${o.rot}deg)`, opacity: String(o.opacity / 100), fontSize: o.font * zoom + 'px', color: o.color });
    if (o.type === 'image') {
      const im = document.createElement('img');
      im.src = o.src || '';
      el.append(im);
    } else el.textContent = o.text || '';
    el.onclick = e => { e.stopPropagation(); selected = o.id; drawObjects(); updateInspector(); };
    el.onpointerdown = e => dragObj(e, o, el);
    if (o.id === selected) {
      const r = document.createElement('span');
      r.className = 'resizeHandle';
      r.onpointerdown = e => resizeObj(e, o, r);
      el.append(r);
      const rt = document.createElement('span');
      rt.className = 'rotateHandle';
      rt.onpointerdown = e => rotateObj(e, o, rt);
      el.append(rt);
    }
    ov.append(el);
  });
  $('#quick').classList.toggle('show', !!current());
}

function dragObj(e: PointerEvent, o: Obj, el: HTMLElement) {
  if ((e.target as HTMLElement).classList.contains('resizeHandle') || (e.target as HTMLElement).classList.contains('rotateHandle')) return;
  e.preventDefault();
  e.stopPropagation();
  selected = o.id;
  el.classList.add('dragging');
  const st = $('#stage').getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY, ox = o.nx, oy = o.ny;
  let lx = sx, ly = sy, raf = 0;
  const apply = () => {
    raf = 0;
    o.nx = Math.max(0, Math.min(1 - o.nw, ox + (lx - sx) / st.width));
    o.ny = Math.max(0, Math.min(1 - o.nh, oy + (ly - sy) / st.height));
    el.style.left = o.nx * 100 + '%';
    el.style.top = o.ny * 100 + '%';
  };
  el.setPointerCapture(e.pointerId);
  el.onpointermove = ev => { lx = ev.clientX; ly = ev.clientY; if (!raf) raf = requestAnimationFrame(apply); };
  const end = () => {
    if (raf) { cancelAnimationFrame(raf); apply(); }
    el.classList.remove('dragging');
    el.onpointermove = null;
    el.onpointerup = null;
    el.onpointercancel = null;
    drawObjects();
    updateInspector();
  };
  el.onpointerup = end;
  el.onpointercancel = end;
}

function resizeObj(e: PointerEvent, o: Obj, h: HTMLElement) {
  e.preventDefault(); e.stopPropagation();
  const el = h.parentElement as HTMLElement;
  const st = $('#stage').getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY, ow = o.nw, oh = o.nh;
  let lx = sx, ly = sy, raf = 0;
  const apply = () => {
    raf = 0;
    o.nw = Math.max(.05, Math.min(.9 - o.nx, ow + (lx - sx) / st.width));
    o.nh = Math.max(.03, Math.min(.9 - o.ny, oh + (ly - sy) / st.height));
    el.style.width = o.nw * 100 + '%';
    el.style.height = o.nh * 100 + '%';
  };
  h.setPointerCapture(e.pointerId);
  h.onpointermove = ev => { lx = ev.clientX; ly = ev.clientY; if (!raf) raf = requestAnimationFrame(apply); };
  const end = () => {
    if (raf) { cancelAnimationFrame(raf); apply(); }
    sizes[o.kind] = { w: o.nw, h: o.nh };
    persist();
    h.onpointermove = null; h.onpointerup = null; h.onpointercancel = null;
    drawObjects(); updateInspector();
  };
  h.onpointerup = end; h.onpointercancel = end;
}

function rotateObj(e: PointerEvent, o: Obj, h: HTMLElement) {
  e.preventDefault(); e.stopPropagation();
  const el = h.parentElement as HTMLElement;
  const box = el.getBoundingClientRect();
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  let lx = e.clientX, ly = e.clientY, raf = 0;
  const apply = () => {
    raf = 0;
    o.rot = ((Math.atan2(ly - cy, lx - cx) * 180 / Math.PI) + 90 + 360) % 360;
    el.style.transform = `rotate(${o.rot}deg)`;
  };
  h.setPointerCapture(e.pointerId);
  h.onpointermove = ev => { lx = ev.clientX; ly = ev.clientY; if (!raf) raf = requestAnimationFrame(apply); };
  const end = () => {
    if (raf) { cancelAnimationFrame(raf); apply(); }
    h.onpointermove = null; h.onpointerup = null; h.onpointercancel = null;
    drawObjects(); updateInspector();
  };
  h.onpointerup = end; h.onpointercancel = end;
}

function copyObj() { const o = current(); if (o) clipboard = JSON.parse(JSON.stringify(o)); }
function pasteObj() {
  if (!clipboard || !previewDoc) return;
  const o = { ...JSON.parse(JSON.stringify(clipboard)), id: uid(), page, nx: Math.min(.92, clipboard.nx + .02), ny: Math.min(.92, clipboard.ny + .02) };
  objects.push(o); selected = o.id; drawObjects(); updateInspector();
}
function deleteObj() { if (!selected) return; objects = objects.filter(o => o.id !== selected); selected = null; drawObjects(); updateInspector(); }

function updateInspector() {
  const box = $('#inspector');
  if (!box) return;
  const o = current();
  box.innerHTML = `<div class='inspectHead'><span>OBJECT</span><h3>ปรับวัตถุ</h3></div>${!o ? `<div class='emptyInspect'>เลือกวัตถุบนเอกสารเพื่อปรับรายละเอียด</div>` : `${o.type === 'text' ? `<label>ข้อความ<textarea id='iText'>${o.text || ''}</textarea></label>` : ''}<label>ความกว้าง<input id='iW' type='range' min='5' max='90' value='${o.nw * 100}'></label><label>ความสูง<input id='iH' type='range' min='3' max='70' value='${o.nh * 100}'></label>${o.type === 'text' ? `<label>ขนาดตัวอักษร<input id='iFont' type='range' min='10' max='72' value='${o.font}'></label><label>สี<input id='iColor' type='color' value='${o.color}'></label>` : ''}<label>หมุน 0–360°<input id='iRot' type='range' min='0' max='360' value='${o.rot}'></label><label>ความโปร่งใส<input id='iOpacity' type='range' min='10' max='100' value='${o.opacity}'></label>`}`;
  if (!o) return;
  const bind = (id: string, fn: (v: string) => void) => {
    const el = document.querySelector(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) el.oninput = () => { fn(el.value); drawObjects(); };
  };
  bind('#iText', v => { o.text = v; });
  bind('#iW', v => { o.nw = +v / 100; sizes[o.kind] = { w: o.nw, h: o.nh }; persist(); });
  bind('#iH', v => { o.nh = +v / 100; sizes[o.kind] = { w: o.nw, h: o.nh }; persist(); });
  bind('#iFont', v => { o.font = +v; });
  bind('#iColor', v => { o.color = v; });
  bind('#iRot', v => { o.rot = +v; });
  bind('#iOpacity', v => { o.opacity = +v; });
}

async function renderThumbs() {
  if (!previewDoc) return;
  const box = $('#thumbs');
  box.innerHTML = '';
  for (let n = 1; n <= previewDoc.numPages; n++) {
    const wrap = document.createElement('div');
    wrap.className = 'thumbCard';
    wrap.dataset.page = String(n);
    const pick = document.createElement('label');
    pick.className = 'pagePick';
    pick.innerHTML = `<input type='checkbox' ${deletePages.has(n) ? 'checked' : ''}><span>เลือก</span>`;
    const cb = pick.querySelector('input') as HTMLInputElement;
    cb.onchange = () => { cb.checked ? deletePages.add(n) : deletePages.delete(n); wrap.classList.toggle('marked', cb.checked); updateDeleteCount(); };
    wrap.draggable = true;
    wrap.ondragstart = e => { e.dataTransfer?.setData('text/plain', String(n)); wrap.classList.add('dragSource'); };
    wrap.ondragend = () => wrap.classList.remove('dragSource');
    wrap.ondragover = e => { e.preventDefault(); wrap.classList.add('dragOver'); };
    wrap.ondragleave = () => wrap.classList.remove('dragOver');
    wrap.ondrop = async e => {
      e.preventDefault(); wrap.classList.remove('dragOver');
      const from = +(e.dataTransfer?.getData('text/plain') || 0);
      if (from && from !== n) await moveApprovalPage(from, n);
    };
    const preview = document.createElement('button');
    preview.className = 'thumb' + (n === page ? ' active' : '');
    const c = document.createElement('canvas');
    const lab = document.createElement('small');
    lab.textContent = 'หน้า ' + n;
    preview.append(c, lab);
    preview.onclick = async () => { page = n; await drawPreview(); markThumb(); };
    const move = document.createElement('div');
    move.className = 'pageMove';
    move.innerHTML = `<button title='ย้ายขึ้น' ${n === 1 ? 'disabled' : ''}>↑</button><span>ลากจัดหน้า</span><button title='ย้ายลง' ${n === previewDoc.numPages ? 'disabled' : ''}>↓</button>`;
    const moveButtons = move.querySelectorAll('button');
    moveButtons[0].onclick = () => moveApprovalPage(n, n - 1);
    moveButtons[1].onclick = () => moveApprovalPage(n, n + 1);
    wrap.append(pick, preview, move);
    wrap.classList.toggle('marked', deletePages.has(n));
    box.append(wrap);
    const p = await previewDoc.getPage(n);
    const v = p.getViewport({ scale: .16 });
    c.width = v.width; c.height = v.height;
    await p.render({ canvasContext: c.getContext('2d')!, viewport: v }).promise;
  }
  markThumb(); updateDeleteCount();
}

function markThumb() {
  // FIX: update all thumbnails, not only the first one.
  $$('.thumbCard').forEach(t => {
    const b = t.querySelector('.thumb');
    if (b) b.classList.toggle('active', +(t.dataset.page || '0') === page);
  });
}

function updateDeleteCount() {
  const el = document.querySelector('#deleteCount');
  if (el) el.textContent = deletePages.size ? `(${deletePages.size})` : '';
}

async function moveApprovalPage(from: number, to: number) {
  if (!approvalBytes || !previewDoc || from === to || from < 1 || to < 1 || from > previewDoc.numPages || to > previewDoc.numPages) return;
  const P = window.PDFLib;
  const src = await P.PDFDocument.load(approvalBytes.slice(0));
  const order = src.getPageIndices();
  const moved = order.splice(from - 1, 1)[0];
  order.splice(to - 1, 0, moved);
  const out = await P.PDFDocument.create();
  const pages = await out.copyPages(src, order);
  pages.forEach((p: any) => out.addPage(p));
  const map = new Map<number, number>();
  order.forEach((oldIndex: number, newIndex: number) => map.set(oldIndex + 1, newIndex + 1));
  objects = objects.map(o => ({ ...o, page: map.get(o.page) || o.page }));
  deletePages = new Set(Array.from(deletePages).map(p => map.get(p) || p));
  page = map.get(page) || page;
  selected = null;
  const bytes = await out.save();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  await reloadApproval(buf);
}

async function reloadApproval(bytes: ArrayBuffer) {
  approvalBytes = bytes.slice(0);
  previewDoc = await window.pdfjsLib.getDocument({ data: approvalBytes.slice(0) }).promise;
  page = Math.min(Math.max(1, page), previewDoc.numPages);
  zoomMode = 'fit';
  await drawPreview(); await renderThumbs(); updateInspector();
}

async function appendApprovalFiles(files: File[]) {
  const P = window.PDFLib;
  const out = await P.PDFDocument.create();
  if (approvalBytes) {
    const base = await P.PDFDocument.load(approvalBytes.slice(0));
    const pages = await out.copyPages(base, base.getPageIndices());
    pages.forEach((p: any) => out.addPage(p));
  }
  for (const f of files) {
    const src = await P.PDFDocument.load(await f.arrayBuffer());
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p: any) => out.addPage(p));
    if (!currentPdf) currentPdf = f;
  }
  const bytes = await out.save();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  deletePages.clear();
  await reloadApproval(buf);
}

async function deleteSelectedApprovalPages() {
  if (!approvalBytes || !previewDoc || !deletePages.size) return;
  if (deletePages.size >= previewDoc.numPages) { alert('ต้องเหลือเอกสารอย่างน้อย 1 หน้า'); return; }
  const P = window.PDFLib;
  const src = await P.PDFDocument.load(approvalBytes.slice(0));
  const keep = src.getPageIndices().filter((i: number) => !deletePages.has(i + 1));
  const out = await P.PDFDocument.create();
  const pages = await out.copyPages(src, keep);
  pages.forEach((p: any) => out.addPage(p));
  const pageMap = new Map<number, number>();
  keep.forEach((old: number, newIndex: number) => pageMap.set(old + 1, newIndex + 1));
  objects = objects.filter(o => pageMap.has(o.page)).map(o => ({ ...o, page: pageMap.get(o.page)! }));
  const bytes = await out.save();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  deletePages.clear();
  page = Math.min(page, out.getPageCount());
  selected = null;
  await reloadApproval(buf);
}

function showSettings() {
  const rows: [string, string][] = [['signature_sig1', 'ลายเซ็น คุณนพดา'], ['signature_sig2', 'ลายเซ็น คุณกานต์'], ['signature_sig3', 'ลายเซ็น คุณชลกนก']];
  companies.forEach(c => {
    rows.push(['stamp_' + c.code, 'ตราปั๊ม — ' + c.name], ['logo_' + c.code, 'โลโก้ — ' + c.name]);
    c.signers.forEach(s => rows.push(['combined_' + c.code + '_' + s[0], s[1] + ' + ตรา — ' + c.name]));
  });
  showModal('ตั้งค่าลายเซ็น / ตรา / โลโก้', `<div class='settingGrid'>${rows.map(r => `<label class='assetRow'><div><b>${r[1]}</b><small>${assets[r[0]] ? '✓ บันทึกแล้ว' : 'ยังไม่มีไฟล์'}</small></div><input data-asset='${r[0]}' type='file' accept='image/png,image/jpeg'></label>`).join('')}</div>`);
  $$('[data-asset]').forEach(el => (el as HTMLInputElement).onchange = async () => {
    const f = (el as HTMLInputElement).files?.[0];
    if (!f) return;
    assets[el.dataset.asset || ''] = await normalizeImage(f);
    persist();
    showSettings();
  });
}

async function normalizeImage(f: File) {
  const im = await loadImg(f);
  const max = 1200;
  const ratio = Math.min(1, max / im.naturalWidth, max / im.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * ratio);
  c.height = Math.round(im.naturalHeight * ratio);
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

async function showHistory() {
  showModal('ประวัติการอนุมัติ', history.length ? `<div class='history'>${history.map((h, i) => `<div class='historyRow'><div><b>${h.fileName}</b><small>${h.company}</small></div><div>${h.signers || '-'}</div><time>${new Date(h.date).toLocaleString('th-TH')}</time><div class='historyActions'>${h.id ? `<button data-openhist='${i}'>เปิดดู</button><button data-savehist='${i}'>บันทึกอีกครั้ง</button>` : `<span class='historyMissing'>รายการเก่า — ไม่มีไฟล์เก็บไว้</span>`}</div></div>`).join('')}</div>` : `<div class='emptyInspect'>ยังไม่มีประวัติการอนุมัติ</div>`);
  // FIX: bind every history action row.
  $$('[data-openhist]').forEach(b => b.onclick = () => openHistoryDoc(history[+(b.dataset.openhist || '0')]));
  $$('[data-savehist]').forEach(b => b.onclick = () => saveHistoryDoc(history[+(b.dataset.savehist || '0')]));
}

function showModal(title: string, body: string) {
  document.querySelector('#modal')?.remove();
  const m = document.createElement('div');
  m.id = 'modal'; m.className = 'modal';
  m.innerHTML = `<div class='modalBox'><div class='modalHead'><div><span>DOCUMENT WORKSPACE</span><h3>${title}</h3></div><button id='closeModal'>ปิด</button></div>${body}</div>`;
  document.body.append(m);
  $('#closeModal').onclick = () => m.remove();
  m.onclick = e => { if (e.target === m) m.remove(); };
}

function historyDb() {
  return new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('DocumentWorkspaceArchive', 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function storeHistoryBlob(id: string, blob: Blob, name: string) {
  const db = await historyDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction('docs', 'readwrite');
    tx.objectStore('docs').put({ id, blob, name });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

async function getHistoryBlob(id: string) {
  const db = await historyDb();
  const row = await new Promise<any>((res, rej) => {
    const tx = db.transaction('docs', 'readonly');
    const r = tx.objectStore('docs').get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return row;
}

async function openHistoryDoc(h: Hist) {
  if (!h.id) return;
  const row = await getHistoryBlob(h.id);
  if (!row?.blob) return alert('ไม่พบไฟล์ในเครื่องนี้ อาจถูกล้างข้อมูล Browser ไปแล้ว');
  const url = URL.createObjectURL(row.blob);
  const w = window.open(url, '_blank');
  if (!w) { URL.revokeObjectURL(url); return alert('Browser บล็อกการเปิดไฟล์ กรุณาอนุญาต Pop-up สำหรับแอปนี้'); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function saveHistoryDoc(h: Hist) {
  if (!h.id) return;
  const row = await getHistoryBlob(h.id);
  if (!row?.blob) return alert('ไม่พบไฟล์ในเครื่องนี้ อาจถูกล้างข้อมูล Browser ไปแล้ว');
  await saveAsFile(row.blob, h.fileName || row.name || 'Approved.pdf');
}

async function saveAsFile(blob: Blob, name: string) {
  if (window.showSaveFilePicker && window.isSecureContext) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }] });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return 'saved';
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'AbortError') return 'cancelled';
    }
  }
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
  return 'downloaded';
}

function loadDataImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
  });
}

async function buildSignedPdfBlob() {
  if (!currentPdf) throw new Error('กรุณาเลือก PDF ก่อน');
  const P = window.PDFLib;
  const pdf = await P.PDFDocument.load(approvalBytes ? approvalBytes.slice(0) : await currentPdf.arrayBuffer());
  const scale = 2;
  for (let n = 1; n <= pdf.getPageCount(); n++) {
    const list = objects.filter(o => o.page === n);
    if (!list.length) continue;
    const pg = pdf.getPage(n - 1);
    const sz = pg.getSize();
    const cw = Math.round(sz.width * scale), ch = Math.round(sz.height * scale);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d')!;
    for (const o of list) {
      const x = o.nx * cw, y = o.ny * ch, bw = o.nw * cw, bh = o.nh * ch;
      g.save(); g.globalAlpha = o.opacity / 100; g.translate(x + bw / 2, y + bh / 2); g.rotate(o.rot * Math.PI / 180);
      if (o.type === 'image' && o.src) {
        const im = await loadDataImage(o.src);
        const f = Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
        const iw = im.naturalWidth * f, ih = im.naturalHeight * f;
        g.drawImage(im, -iw / 2, -ih / 2, iw, ih);
      } else {
        g.fillStyle = o.color;
        g.font = `${o.kind === 'watermark' ? '700' : '400'} ${o.font * scale}px "Noto Sans Thai","Segoe UI",Arial,sans-serif`;
        g.textBaseline = 'top';
        const lines = (o.text || '').split('\n'), lh = o.font * scale * 1.2;
        lines.forEach((ln, i) => g.fillText(ln, -bw / 2 + 8, -bh / 2 + 8 + i * lh, bw - 16));
      }
      g.restore();
    }
    const data = c.toDataURL('image/png');
    const raw = Uint8Array.from(atob(data.split(',')[1]), z => z.charCodeAt(0));
    const overlay = await pdf.embedPng(raw);
    pg.drawImage(overlay, { x: 0, y: 0, width: sz.width, height: sz.height });
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

async function saveAsPdf() {
  const st = $('#status');
  const btn = $('#saveApproved') as HTMLButtonElement;
  if (!currentPdf) { st.textContent = 'กรุณาเลือก PDF ก่อน'; return; }
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; st.textContent = 'กำลังสร้าง PDF...';
  try {
    const blob = await buildSignedPdfBlob();
    const name = currentPdf.name.replace(/\.pdf$/i, '') + '_Signed.pdf';
    const result = await saveAsFile(blob, name);
    if (result === 'cancelled') { st.textContent = 'ยกเลิกการบันทึก'; return; }
    const names = [...new Set(objects.filter(o => o.kind.startsWith('signature_') || o.kind.startsWith('combined_')).map(o => o.kind.includes('sig1') ? 'นพดา' : o.kind.includes('sig2') ? 'กานต์' : 'ชลกนก'))];
    const histId = 'doc_' + Date.now() + '_' + uid();
    await storeHistoryBlob(histId, blob, name);
    history.unshift({ id: histId, date: new Date().toISOString(), company: comp().name, fileName: name, signers: names.join(', ') });
    persist(); st.textContent = '✓ บันทึกไฟล์เรียบร้อยแล้ว';
  } catch (e: unknown) {
    console.error(e); st.textContent = 'บันทึกไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e));
  } finally {
    btn.disabled = false; btn.textContent = 'Save As';
  }
}

async function printAsPdf() {
  const st = $('#status');
  const btn = $('#printApproved') as HTMLButtonElement;
  if (!currentPdf) { st.textContent = 'กรุณาเลือก PDF ก่อน'; return; }
  btn.disabled = true; btn.textContent = 'กำลังเตรียมพิมพ์...'; st.textContent = 'กำลังสร้างเอกสารสำหรับพิมพ์...';
  try {
    const blob = await buildSignedPdfBlob();
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', opacity: '0' });
    frame.src = url; document.body.appendChild(frame);
    frame.onload = () => setTimeout(() => {
      frame.contentWindow?.focus(); frame.contentWindow?.print();
      setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 30000);
    }, 350);
    st.textContent = '✓ เปิดหน้าต่างพิมพ์แล้ว';
  } catch (e: unknown) {
    console.error(e); st.textContent = 'พิมพ์ไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e));
  } finally {
    btn.disabled = false; btn.textContent = '🖨 Print';
  }
}

function wireTools() {
  $$('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool || 'merge'; queue = []; render(); });
  const picker = $('#picker') as HTMLInputElement;
  $('#add').onclick = () => picker.click();
  $('#clear').onclick = () => { queue = []; renderQueue(); };
  picker.onchange = () => { Array.from(picker.files || []).forEach(file => queue.push({ id: uid(), file })); picker.value = ''; renderQueue(); };
  $('#run').onclick = processTool;
  renderQueue();
}

function renderQueue() {
  const q = $('#queue'); if (!q) return;
  q.innerHTML = queue.map((x, i) => `<div class='qrow'><div><b>${i + 1}. ${x.file.name}</b><div class='sub'>${Math.max(1, Math.round(x.file.size / 1024))} KB</div></div><div class='qact'><button data-up='${i}'>↑</button><button data-down='${i}'>↓</button><button class='danger' data-del='${i}'>ลบ</button></div></div>`).join('');
  q.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => move(+((b as HTMLElement).dataset.up || '0'), -1)));
  q.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => move(+((b as HTMLElement).dataset.down || '0'), 1)));
  q.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { queue.splice(+((b as HTMLElement).dataset.del || '0'), 1); renderQueue(); }));
}

function move(i: number, d: number) {
  const j = i + d; if (j < 0 || j >= queue.length) return;
  [queue[i], queue[j]] = [queue[j], queue[i]]; renderQueue();
}

async function save(blob: Blob, name: string) {
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name });
      const w = await h.createWritable(); await w.write(blob); await w.close(); return;
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'AbortError') return;
    }
  }
  const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

function parsePages(s: string, total: number) {
  const out: number[] = [];
  s.split(',').map(v => v.trim()).filter(Boolean).forEach(p => {
    if (p.includes('-')) {
      let [a, b] = p.split('-').map(Number); if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) if (i >= 1 && i <= total && !out.includes(i - 1)) out.push(i - 1);
    } else {
      const n = +p; if (n >= 1 && n <= total && !out.includes(n - 1)) out.push(n - 1);
    }
  });
  return out;
}

async function processTool() {
  const st = $('#status');
  if (!queue.length) { st.textContent = 'กรุณาเพิ่มไฟล์ก่อน'; return; }
  st.textContent = 'กำลังประมวลผล...';
  const P = window.PDFLib;
  try {
    if (tool === 'merge') {
      if (queue.length < 2) throw new Error('กรุณาเพิ่มอย่างน้อย 2 PDF');
      const out = await P.PDFDocument.create();
      for (const x of queue) { const d = await P.PDFDocument.load(await x.file.arrayBuffer()), ps = await out.copyPages(d, d.getPageIndices()); ps.forEach((p: any) => out.addPage(p)); }
      await save(new Blob([await out.save()], { type: 'application/pdf' }), 'Merged_Document.pdf');
    } else if (tool === 'extract') {
      const spec = ($('#pages') as HTMLInputElement).value;
      for (const x of queue) { const d = await P.PDFDocument.load(await x.file.arrayBuffer()), idx = parsePages(spec, d.getPageCount()), out = await P.PDFDocument.create(), ps = await out.copyPages(d, idx); ps.forEach((p: any) => out.addPage(p)); await save(new Blob([await out.save()], { type: 'application/pdf' }), x.file.name.replace(/\.pdf$/i, '') + '_Selected.pdf'); }
    } else if (tool === 'arrange') {
      for (const x of queue) { const d = await P.PDFDocument.load(await x.file.arrayBuffer()), order = parsePages(($('#order') as HTMLInputElement).value, d.getPageCount()), rot = parsePages(($('#rotatePages') as HTMLInputElement).value, d.getPageCount()).map(v => v + 1), out = await P.PDFDocument.create(), ps = await out.copyPages(d, order); ps.forEach((p: any, i: number) => { const original = order[i] + 1; if (rot.includes(original)) p.setRotation(P.degrees(90)); out.addPage(p); }); await save(new Blob([await out.save()], { type: 'application/pdf' }), x.file.name.replace(/\.pdf$/i, '') + '_Arranged.pdf'); }
    } else if (tool === 'pagenum') {
      for (const x of queue) { const d = await P.PDFDocument.load(await x.file.arrayBuffer()), start = Math.max(1, +($('#pageStart') as HTMLInputElement).value || 1), pos = ($('#pagePos') as HTMLSelectElement).value, font = await d.embedFont(P.StandardFonts.Helvetica); d.getPages().forEach((pg: any, i: number) => { const sz = pg.getSize(), txt = String(start + i), tw = font.widthOfTextAtSize(txt, 10); let px = (sz.width - tw) / 2, py = 18; if (pos === 'bottom-right') px = sz.width - tw - 24; if (pos === 'top-right') { px = sz.width - tw - 24; py = sz.height - 28; } pg.drawText(txt, { x: px, y: py, size: 10, font, color: P.rgb(.35, .4, .42) }); }); await save(new Blob([await d.save()], { type: 'application/pdf' }), x.file.name.replace(/\.pdf$/i, '') + '_Numbered.pdf'); }
    } else if (tool === 'watermark') {
      const text = ($('#wmText') as HTMLInputElement).value.trim() || 'ใช้สำหรับประกอบเอกสารเท่านั้น'; const alpha = +($('#wmOpacity') as HTMLSelectElement).value;
      for (const x of queue) { const d = await P.PDFDocument.load(await x.file.arrayBuffer()); for (const pg of d.getPages()) { const sz = pg.getSize(), scale = 2, c = document.createElement('canvas'); c.width = Math.round(sz.width * scale); c.height = Math.round(sz.height * scale); const g = c.getContext('2d')!; g.globalAlpha = alpha; g.fillStyle = '#5f6d72'; g.font = '700 42px Noto Sans Thai,Segoe UI,Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.translate(c.width / 2, c.height / 2); g.rotate(-28 * Math.PI / 180); g.fillText(text, 0, 0, c.width * .8); const raw = Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]), z => z.charCodeAt(0)), im = await d.embedPng(raw); pg.drawImage(im, { x: 0, y: 0, width: sz.width, height: sz.height }); } await save(new Blob([await d.save()], { type: 'application/pdf' }), x.file.name.replace(/\.pdf$/i, '') + '_Watermarked.pdf'); }
    } else if (tool === 'insert') {
      if (queue.length < 2) throw new Error('กรุณาเพิ่ม PDF อย่างน้อย 2 ไฟล์');
      const base = await P.PDFDocument.load(await queue[0].file.arrayBuffer()), ins = await P.PDFDocument.load(await queue[1].file.arrayBuffer()), after = Math.max(0, Math.min(base.getPageCount(), +($('#insertAfter') as HTMLInputElement).value || 0)), out = await P.PDFDocument.create(), before = await out.copyPages(base, base.getPageIndices().slice(0, after)), middle = await out.copyPages(ins, ins.getPageIndices()), rest = await out.copyPages(base, base.getPageIndices().slice(after)); before.forEach((p: any) => out.addPage(p)); middle.forEach((p: any) => out.addPage(p)); rest.forEach((p: any) => out.addPage(p)); await save(new Blob([await out.save()], { type: 'application/pdf' }), queue[0].file.name.replace(/\.pdf$/i, '') + '_Inserted.pdf');
    } else if (tool === 'imgpdf') {
      const out = await P.PDFDocument.create();
      for (const x of queue) { const b = new Uint8Array(await x.file.arrayBuffer()), im = x.file.type === 'image/png' ? await out.embedPng(b) : await out.embedJpg(b), p = out.addPage([im.width, im.height]); p.drawImage(im, { x: 0, y: 0, width: im.width, height: im.height }); }
      await save(new Blob([await out.save()], { type: 'application/pdf' }), 'Images_Document.pdf');
    } else if (tool === 'resize' || tool === 'jpgpng') {
      for (const x of queue) { const im = await loadImg(x.file), ratio = tool === 'resize' ? Math.min(1, +($('#maxW') as HTMLInputElement).value / im.naturalWidth) : 1, c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * ratio); c.height = Math.round(im.naturalHeight * ratio); c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); const mime = tool === 'jpgpng' ? 'image/png' : x.file.type === 'image/png' ? 'image/png' : 'image/jpeg'; const blob = await new Promise<Blob>(r => c.toBlob(v => r(v || new Blob()), mime, .85)); await save(blob, tool === 'jpgpng' ? x.file.name.replace(/\.jpe?g$/i, '.png') : x.file.name.replace(/(\.[^.]+)$/, '_resized$1')); }
    } else if (tool === 'pdfimg' || tool === 'compress') {
      for (const x of queue) {
        const doc = await window.pdfjsLib.getDocument({ data: await x.file.arrayBuffer() }).promise;
        if (tool === 'pdfimg') {
          const fmt = ($('#fmt') as HTMLSelectElement).value;
          for (let n = 1; n <= doc.numPages; n++) { const p = await doc.getPage(n), v = p.getViewport({ scale: 1.5 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; await p.render({ canvasContext: c.getContext('2d')!, viewport: v }).promise; const mime = fmt === 'png' ? 'image/png' : 'image/jpeg'; const blob = await new Promise<Blob>(r => c.toBlob(vv => r(vv || new Blob()), mime, .9)); await save(blob, x.file.name.replace(/\.pdf$/i, '') + `_page${n}.${fmt === 'png' ? 'png' : 'jpg'}`); }
        } else {
          const q = Math.max(.4, Math.min(.9, +($('#quality') as HTMLInputElement).value / 100));
          const out = await P.PDFDocument.create();
          for (let n = 1; n <= doc.numPages; n++) { const p = await doc.getPage(n), v = p.getViewport({ scale: 1.15 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; await p.render({ canvasContext: c.getContext('2d')!, viewport: v }).promise; const data = c.toDataURL('image/jpeg', q), raw = Uint8Array.from(atob(data.split(',')[1]), z => z.charCodeAt(0)), im = await out.embedJpg(raw), pg = out.addPage([v.width, v.height]); pg.drawImage(im, { x: 0, y: 0, width: v.width, height: v.height }); }
          await save(new Blob([await out.save()], { type: 'application/pdf' }), x.file.name.replace(/\.pdf$/i, '') + '_Compressed.pdf');
        }
      }
    }
    st.textContent = '✓ เสร็จเรียบร้อย';
  } catch (e: unknown) {
    st.textContent = 'ผิดพลาด: ' + (e instanceof Error ? e.message : String(e));
  }
}

function loadImg(file: File) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const u = URL.createObjectURL(file), i = new Image();
    i.onload = () => { URL.revokeObjectURL(u); res(i); };
    i.onerror = rej;
    i.src = u;
  });
}

render();
