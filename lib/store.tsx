// 앱 전역 상태 관리 (React Context). storage 영속 + 백엔드 동기화 연동.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LEAVE_POLICY,
  DEFAULT_SETTINGS,
  DEFAULT_WORK_POLICY,
  DEFAULT_WORKPLACES,
  STORAGE_KEYS,
} from './config';
import { getItem, setItem, removeItem } from './storage';
import {
  AttendanceRecord,
  AttendanceType,
  Confirmation,
  GeoPoint,
  LeaveAdjustment,
  LeaveRequest,
  LeaveSegment,
  LeaveUnit,
  Settings,
  User,
  Workplace,
  WorkPolicy,
  LeavePolicy,
} from './types';
import { chainHash, sha256 } from './hash';
import { dateKey } from './time';
import * as backend from './backend';

function uid(prefix: string): string {
  return `${prefix}_${new Date().getTime().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function slugId(name: string, empNo?: string): string {
  if (empNo && empNo.trim()) return `u_${empNo.trim()}`;
  return `u_${sha256(name.trim()).slice(0, 10)}`;
}

interface StoreValue {
  ready: boolean;
  user: User | null;
  settings: Settings;
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  adjustments: LeaveAdjustment[];
  confirmations: Confirmation[];
  adminUnlocked: boolean;
  hasAdminPassword: boolean;
  pendingSync: number;

  // auth
  login: (name: string, empNo?: string, hireDate?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;

  // attendance
  todayRecord: () => AttendanceRecord | undefined;
  setPlannedStart: (hm: string) => Promise<void>;
  checkIn: (args: { type: AttendanceType; point?: GeoPoint; workplace?: Workplace | null; within?: boolean }) => Promise<void>;
  checkOut: (args: { point?: GeoPoint; within?: boolean }) => Promise<void>;
  clearAllRecords: () => Promise<void>;

  // leave
  requestLeave: (req: { date: string; hours: LeaveUnit; segment: LeaveSegment; startTime?: string; endTime?: string; reason?: string }) => Promise<void>;
  cancelLeave: (id: string) => Promise<void>;
  decideLeave: (id: string, approve: boolean, note?: string) => Promise<void>;
  addAdjustment: (userId: string, hours: number, note?: string) => Promise<void>;

  // confirmation
  addConfirmation: (c: Omit<Confirmation, 'id' | 'prevHash' | 'hash'>) => Promise<void>;

  // settings
  addWorkplace: (wp: Omit<Workplace, 'id'>) => Promise<void>;
  updateWorkplace: (id: string, patch: Partial<Workplace>) => Promise<void>;
  removeWorkplace: (id: string) => Promise<void>;
  updateWorkPolicy: (patch: Partial<WorkPolicy>) => Promise<void>;
  updateLeavePolicy: (patch: Partial<LeavePolicy>) => Promise<void>;
  setSheetsUrl: (url: string) => Promise<void>;

  // admin
  setAdminPassword: (pw: string) => Promise<void>;
  verifyAdmin: (pw: string) => Promise<boolean>;
  lockAdmin: () => void;

  // sync
  sync: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [adjustments, setAdjustments] = useState<LeaveAdjustment[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [adminPwHash, setAdminPwHash] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);

  // 최초 로드
  useEffect(() => {
    (async () => {
      const [u, sRaw, rec, lv, adj, conf, pw, sheetsUrl] = await Promise.all([
        getItem<User>(STORAGE_KEYS.USER),
        getItem<any>(STORAGE_KEYS.SETTINGS),
        getItem<AttendanceRecord[]>(STORAGE_KEYS.RECORDS),
        getItem<LeaveRequest[]>(STORAGE_KEYS.LEAVES),
        getItem<LeaveAdjustment[]>(STORAGE_KEYS.LEAVE_ADJUSTMENTS),
        getItem<Confirmation[]>(STORAGE_KEYS.CONFIRMATIONS),
        getItem<string>(STORAGE_KEYS.ADMIN_PASSWORD),
        getItem<string>(STORAGE_KEYS.SHEETS_URL),
      ]);

      // 기존 데이터 호환: settings가 workplaces 배열만 갖고 있던 경우 보정
      const merged: Settings = {
        workplaces: sRaw?.workplaces?.length ? sRaw.workplaces : DEFAULT_WORKPLACES,
        workPolicy: { ...DEFAULT_WORK_POLICY, ...(sRaw?.workPolicy || {}) },
        leavePolicy: { ...DEFAULT_LEAVE_POLICY, ...(sRaw?.leavePolicy || {}) },
        sheetsUrl: sheetsUrl || sRaw?.sheetsUrl,
      };

      setUser(u);
      setSettings(merged);
      setRecords(rec || []);
      setLeaves(lv || []);
      setAdjustments(adj || []);
      setConfirmations(conf || []);
      setAdminPwHash(pw || null);
      setPendingSync(await backend.pendingCount());
      setReady(true);

      // 서버 설정 병합(있으면)
      backend.fetchServerSettings().then(async (srv) => {
        if (!srv) return;
        const patch: Partial<Settings> = {};
        if (srv.workplaces?.length) patch.workplaces = srv.workplaces;
        if (srv.workPolicy) patch.workPolicy = { ...merged.workPolicy, ...srv.workPolicy };
        if (srv.leavePolicy) patch.leavePolicy = { ...merged.leavePolicy, ...srv.leavePolicy };
        if (Object.keys(patch).length) {
          const next = { ...merged, ...patch };
          setSettings(next);
          await setItem(STORAGE_KEYS.SETTINGS, next);
        }
        if (srv.adminPasswordHash) {
          setAdminPwHash(srv.adminPasswordHash);
          await setItem(STORAGE_KEYS.ADMIN_PASSWORD, srv.adminPasswordHash);
        }
      });
    })();
  }, []);

  // 영속 헬퍼
  const persistRecords = async (next: AttendanceRecord[]) => {
    setRecords(next);
    await setItem(STORAGE_KEYS.RECORDS, next);
  };
  const persistLeaves = async (next: LeaveRequest[]) => {
    setLeaves(next);
    await setItem(STORAGE_KEYS.LEAVES, next);
  };
  const persistSettings = async (next: Settings) => {
    setSettings(next);
    await setItem(STORAGE_KEYS.SETTINGS, next);
  };
  const bumpPending = async () => setPendingSync(await backend.pendingCount());

  // ---- auth ----
  const login = async (name: string, empNo?: string, hireDate?: string) => {
    const admins = (empNo || '').toLowerCase() === 'admin';
    const u: User = {
      id: slugId(name, empNo),
      name: name.trim(),
      empNo: empNo?.trim() || undefined,
      hireDate: hireDate || undefined,
      isAdmin: admins,
      createdAt: new Date().toISOString(),
    };
    setUser(u);
    await setItem(STORAGE_KEYS.USER, u);
  };
  const logout = async () => {
    setUser(null);
    setAdminUnlocked(false);
    await removeItem(STORAGE_KEYS.USER);
  };
  const updateProfile = async (patch: Partial<User>) => {
    if (!user) return;
    const u = { ...user, ...patch };
    setUser(u);
    await setItem(STORAGE_KEYS.USER, u);
  };

  // ---- attendance ----
  const todayRecord = () => {
    const d = dateKey();
    return records.find((r) => r.userId === user?.id && r.date === d);
  };

  const lastHash = (arr: { hash?: string }[]) => (arr.length ? arr[arr.length - 1].hash || '' : '');

  const setPlannedStart = async (hm: string) => {
    if (!user) return;
    const d = dateKey();
    const idx = records.findIndex((r) => r.userId === user.id && r.date === d);
    let next = [...records];
    if (idx >= 0) {
      next[idx] = { ...next[idx], plannedStart: hm, updatedAt: new Date().toISOString() };
    } else {
      next.push({
        id: uid('rec'),
        userId: user.id,
        userName: user.name,
        empNo: user.empNo,
        date: d,
        plannedStart: hm,
        type: 'WORK',
        updatedAt: new Date().toISOString(),
      });
    }
    await persistRecords(next);
    await setItem(STORAGE_KEYS.PLANNED_START, hm);
  };

  const checkIn: StoreValue['checkIn'] = async ({ type, point, workplace, within }) => {
    if (!user) return;
    const d = dateKey();
    const nowIso = new Date().toISOString();
    const idx = records.findIndex((r) => r.userId === user.id && r.date === d);
    let base: AttendanceRecord =
      idx >= 0
        ? { ...records[idx] }
        : {
            id: uid('rec'),
            userId: user.id,
            userName: user.name,
            empNo: user.empNo,
            date: d,
            type,
            updatedAt: nowIso,
          };
    base = {
      ...base,
      type,
      checkIn: base.checkIn || nowIso, // 이미 출근했으면 유지
      inLocation: point,
      inVerified: within,
      workplaceId: workplace?.id,
      workplaceName: workplace?.name,
      updatedAt: nowIso,
    };
    const others = records.filter((r) => !(r.userId === user.id && r.date === d));
    base.prevHash = lastHash(others);
    base.hash = chainHash(base.prevHash, base as any);
    const next = idx >= 0 ? records.map((r) => (r.id === base.id ? base : r)) : [...records, base];
    await persistRecords(next);
    await backend.enqueue('upsertRecord', base);
    await bumpPending();
  };

  const checkOut: StoreValue['checkOut'] = async ({ point, within }) => {
    if (!user) return;
    const d = dateKey();
    const idx = records.findIndex((r) => r.userId === user.id && r.date === d);
    if (idx < 0) return;
    const nowIso = new Date().toISOString();
    const rec: AttendanceRecord = {
      ...records[idx],
      checkOut: nowIso,
      outLocation: point,
      outVerified: within,
      updatedAt: nowIso,
    };
    const others = records.filter((_, i) => i !== idx);
    rec.prevHash = lastHash(others);
    rec.hash = chainHash(rec.prevHash, rec as any);
    const next = records.map((r, i) => (i === idx ? rec : r));
    await persistRecords(next);
    await backend.enqueue('upsertRecord', rec);
    await bumpPending();
  };

  const clearAllRecords = async () => {
    const mine = records.filter((r) => r.userId !== user?.id);
    await persistRecords(mine);
  };

  // ---- leave ----
  const requestLeave: StoreValue['requestLeave'] = async (req) => {
    if (!user) return;
    const lv: LeaveRequest = {
      id: uid('lv'),
      userId: user.id,
      userName: user.name,
      empNo: user.empNo,
      date: req.date,
      hours: req.hours,
      segment: req.segment,
      startTime: req.startTime,
      endTime: req.endTime,
      reason: req.reason,
      status: 'REQUESTED',
      requestedAt: new Date().toISOString(),
    };
    lv.prevHash = lastHash(leaves);
    lv.hash = chainHash(lv.prevHash, lv as any);
    const next = [...leaves, lv];
    await persistLeaves(next);
    await backend.enqueue('upsertLeave', lv);
    await bumpPending();
  };

  const cancelLeave = async (id: string) => {
    const next = leaves.map((l) =>
      l.id === id ? { ...l, status: 'CANCELED' as const, decidedAt: new Date().toISOString() } : l
    );
    await persistLeaves(next);
    const changed = next.find((l) => l.id === id);
    if (changed) await backend.enqueue('upsertLeave', changed);
    await bumpPending();
  };

  const decideLeave = async (id: string, approve: boolean, note?: string) => {
    const next = leaves.map((l) =>
      l.id === id
        ? {
            ...l,
            status: (approve ? 'APPROVED' : 'REJECTED') as LeaveRequest['status'],
            decidedAt: new Date().toISOString(),
            decidedBy: user?.name,
            decisionNote: note,
          }
        : l
    );
    await persistLeaves(next);
    const changed = next.find((l) => l.id === id);
    if (changed) await backend.enqueue('upsertLeave', changed);
    await bumpPending();
  };

  const addAdjustment = async (userId: string, hours: number, note?: string) => {
    const next = [...adjustments, { userId, hours, note, at: new Date().toISOString() }];
    setAdjustments(next);
    await setItem(STORAGE_KEYS.LEAVE_ADJUSTMENTS, next);
  };

  // ---- confirmation ----
  const addConfirmation: StoreValue['addConfirmation'] = async (c) => {
    const conf: Confirmation = { ...c, id: uid('cf') } as Confirmation;
    conf.prevHash = lastHash(confirmations);
    conf.hash = chainHash(conf.prevHash, conf as any);
    const next = [...confirmations, conf];
    setConfirmations(next);
    await setItem(STORAGE_KEYS.CONFIRMATIONS, next);
    await backend.enqueue('upsertConfirmation', conf);
    await bumpPending();
  };

  // ---- settings ----
  const addWorkplace = async (wp: Omit<Workplace, 'id'>) => {
    const next = { ...settings, workplaces: [...settings.workplaces, { ...wp, id: uid('wp') }] };
    await persistSettings(next);
    await backend.enqueue('saveSettings', { workplaces: next.workplaces });
    await bumpPending();
  };
  const updateWorkplace = async (id: string, patch: Partial<Workplace>) => {
    const next = {
      ...settings,
      workplaces: settings.workplaces.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    };
    await persistSettings(next);
  };
  const removeWorkplace = async (id: string) => {
    const next = { ...settings, workplaces: settings.workplaces.filter((w) => w.id !== id) };
    await persistSettings(next);
    await backend.enqueue('saveSettings', { workplaces: next.workplaces });
    await bumpPending();
  };
  const updateWorkPolicy = async (patch: Partial<WorkPolicy>) => {
    const next = { ...settings, workPolicy: { ...settings.workPolicy, ...patch } };
    await persistSettings(next);
  };
  const updateLeavePolicy = async (patch: Partial<LeavePolicy>) => {
    const next = { ...settings, leavePolicy: { ...settings.leavePolicy, ...patch } };
    await persistSettings(next);
  };
  const setSheetsUrl = async (url: string) => {
    const next = { ...settings, sheetsUrl: url };
    await persistSettings(next);
    await setItem(STORAGE_KEYS.SHEETS_URL, url);
  };

  // ---- admin ----
  const setAdminPassword = async (pw: string) => {
    const h = sha256(pw);
    setAdminPwHash(h);
    setAdminUnlocked(true);
    await setItem(STORAGE_KEYS.ADMIN_PASSWORD, h);
    await backend.enqueue('saveSettings', { adminPasswordHash: h });
    await bumpPending();
  };
  const verifyAdmin = async (pw: string) => {
    if (!adminPwHash) {
      // 미설정 시 최초 설정으로 처리
      await setAdminPassword(pw);
      return true;
    }
    const ok = sha256(pw) === adminPwHash;
    if (ok) setAdminUnlocked(true);
    return ok;
  };
  const lockAdmin = () => setAdminUnlocked(false);

  // ---- sync ----
  const sync = async () => {
    await backend.flushQueue();
    await bumpPending();
  };

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      user,
      settings,
      records,
      leaves,
      adjustments,
      confirmations,
      adminUnlocked,
      hasAdminPassword: !!adminPwHash,
      pendingSync,
      login,
      logout,
      updateProfile,
      todayRecord,
      setPlannedStart,
      checkIn,
      checkOut,
      clearAllRecords,
      requestLeave,
      cancelLeave,
      decideLeave,
      addAdjustment,
      addConfirmation,
      addWorkplace,
      updateWorkplace,
      removeWorkplace,
      updateWorkPolicy,
      updateLeavePolicy,
      setSheetsUrl,
      setAdminPassword,
      verifyAdmin,
      lockAdmin,
      sync,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, user, settings, records, leaves, adjustments, confirmations, adminUnlocked, adminPwHash, pendingSync]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
