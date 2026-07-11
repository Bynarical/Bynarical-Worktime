// Google Apps Script 백엔드 클라이언트 + 오프라인 동기화 큐.
// - 서버가 없어도 앱은 완전히 동작(localStorage). 서버 URL이 있으면 큐를 비동기 전송.
// - Apps Script CORS 회피: POST는 text/plain 로 전송(프리플라이트 없음).
import { APPS_SCRIPT_URL, STORAGE_KEYS } from './config';
import { getItem, setItem } from './storage';

export type SyncAction =
  | 'upsertRecord'
  | 'upsertLeave'
  | 'upsertConfirmation'
  | 'saveSettings';

export interface SyncOp {
  id: string;
  action: SyncAction;
  payload: unknown;
  queuedAt: string;
}

async function resolveUrl(): Promise<string> {
  const custom = await getItem<string>(STORAGE_KEYS.SHEETS_URL);
  return (custom && custom.trim()) || APPS_SCRIPT_URL;
}

// ---- 서버 설정 조회 (관리자 비번 해시 / 근무지 / 정책) ----
export async function fetchServerSettings(): Promise<any | null> {
  try {
    const url = await resolveUrl();
    if (!url) return null;
    const res = await fetch(`${url}?action=getSettings`, { method: 'GET' });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.ok !== false ? data : null;
  } catch {
    return null;
  }
}

// ---- 사용자 데이터(기록/연차/확인) 조회 ----
export async function fetchUserData(userId: string): Promise<any | null> {
  try {
    const url = await resolveUrl();
    if (!url) return null;
    const res = await fetch(
      `${url}?action=getUserData&userId=${encodeURIComponent(userId)}`,
      { method: 'GET' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.ok !== false ? data : null;
  } catch {
    return null;
  }
}

// ---- 오프라인 큐 ----
async function loadQueue(): Promise<SyncOp[]> {
  return (await getItem<SyncOp[]>(STORAGE_KEYS.SYNC_QUEUE)) || [];
}
async function saveQueue(q: SyncOp[]): Promise<void> {
  await setItem(STORAGE_KEYS.SYNC_QUEUE, q);
}

export async function enqueue(action: SyncAction, payload: unknown): Promise<void> {
  const q = await loadQueue();
  q.push({
    id: `${action}_${new Date().getTime()}_${q.length}`,
    action,
    payload,
    queuedAt: new Date().toISOString(),
  });
  await saveQueue(q);
}

// 큐를 서버로 전송. 성공 개수 반환. 실패 항목은 큐에 남긴다.
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const url = await resolveUrl();
  const q = await loadQueue();
  if (!url || q.length === 0) return { sent: 0, remaining: q.length };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'sync', ops: q }),
    });
    if (!res.ok) return { sent: 0, remaining: q.length };
    const data = await res.json().catch(() => ({ ok: true }));
    if (data && data.ok !== false) {
      await saveQueue([]);
      return { sent: q.length, remaining: 0 };
    }
    return { sent: 0, remaining: q.length };
  } catch {
    return { sent: 0, remaining: q.length };
  }
}

export async function pendingCount(): Promise<number> {
  return (await loadQueue()).length;
}
