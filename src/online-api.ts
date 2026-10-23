export type OnlineHealth = {
  ok: boolean;
  user?: string;
  sheetId?: string;
  rootFolderId?: string;
  timestamp?: string;
};

export type ApprovalMarker = {
  id: string;
  page: number;
  signerKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  includeCompanyStamp?: boolean;
  showApprovalTimestamp?: boolean;
};

export type ApprovalRequestRecord = {
  id: string;
  requestNo: string;
  companyCode: string;
  department: string;
  requesterName: string;
  title: string;
  status: string;
  urgent?: boolean;
  originalFileId?: string;
  approvedFileId?: string;
  returnedComment?: string;
  markers?: ApprovalMarker[];
  createdAt?: string;
  updatedAt?: string;
};

export type ApprovalPacketRecord = {
  id: string;
  packetNo: string;
  signerKey: string;
  requestIds: string[];
  mode: 'executive' | 'secretary_proxy';
  proxyReason?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

const STORAGE_KEY = 'approvalApiUrl';

export function getApprovalApiUrl() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setApprovalApiUrl(value: string) {
  const clean = value.trim();
  if (clean) localStorage.setItem(STORAGE_KEY, clean);
  else localStorage.removeItem(STORAGE_KEY);
}

function apiUrl(action: string) {
  const base = getApprovalApiUrl();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่า Apps Script Web App URL');
  const url = new URL(base);
  url.searchParams.set('action', action);
  return url.toString();
}

export async function apiGet<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(apiUrl(action));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow'
  });
  if (!response.ok) throw new Error('Online API HTTP ' + response.status);
  const data = await response.json();
  if (data?.ok === false) throw new Error(data.error || 'Online API error');
  return data as T;
}

export async function apiPost<T>(action: string, payload: unknown): Promise<T> {
  const response = await fetch(apiUrl(action), {
    method: 'POST',
    credentials: 'include',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  if (!response.ok) throw new Error('Online API HTTP ' + response.status);
  const data = await response.json();
  if (data?.ok === false) throw new Error(data.error || 'Online API error');
  return data as T;
}

export async function testApprovalApi() {
  return apiGet<OnlineHealth>('health');
}
