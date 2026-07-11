// 앱 전역 상태 — Supabase Auth + Postgres(RLS) 백엔드. localStorage는 오프라인 캐시.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './config';
import { getItem, setItem } from './storage';
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
import { chainHash } from './hash';
import { dateKey, ceilTimeToStep } from './time';
import { supabase, isSupabaseConfigured } from './supabase';
import * as api from './supabaseApi';

function uid(prefix: string): string {
  return `${prefix}_${new Date().getTime().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

interface RegisterArgs {
  email: string;
  password: string;
  name: string;
  empNo?: string;
  hireDate?: string;
}
interface AuthResult {
  ok: boolean;
  error?: string;
  needConfirm?: boolean;
}

interface StoreValue {
  ready: boolean;
  needsConfig: boolean;
  authed: boolean;
  busy: boolean;
  user: User | null;
  settings: Settings;
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  adjustments: LeaveAdjustment[];
  confirmations: Confirmation[];
  profilesById: Record<string, { name: string; empNo?: string }>;
  adminUnlocked: boolean;

  register: (a: RegisterArgs) => Promise<AuthResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  changePassword: (newPw: string) => Promise<AuthResult>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  refresh: () => Promise<void>;

  checkIn: (args: { type: AttendanceType; point?: GeoPoint; workplace?: Workplace | null; within?: boolean }) => Promise<void>;
  checkOut: (args: { point?: GeoPoint; within?: boolean }) => Promise<void>;
  clearAllRecords: () => Promise<void>;

  requestLeave: (req: { date: string; hours: LeaveUnit; segment: LeaveSegment; startTime?: string; endTime?: string; reason?: string }) => Promise<void>;
  cancelLeave: (id: string) => Promise<void>;
  decideLeave: (id: string, approve: boolean, note?: string) => Promise<void>;
  addAdjustment: (userId: string, hours: number, note?: string) => Promise<void>;

  addConfirmation: (c: Omit<Confirmation, 'id' | 'prevHash' | 'hash'>) => Promise<void>;

  addWorkplace: (wp: Omit<Workplace, 'id'>) => Promise<void>;
  removeWorkplace: (id: string) => Promise<void>;
  updateWorkPolicy: (patch: Partial<WorkPolicy>) => Promise<void>;
  updateLeavePolicy: (patch: Partial<LeavePolicy>) => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);
export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [adjustments, setAdjustments] = useState<LeaveAdjustment[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, { name: string; empNo?: string }>>({});

  const needsConfig = !isSupabaseConfigured;

  // 오프라인 캐시 로드(즉시 페인트용)
  useEffect(() => {
    (async () => {
      const [u, cRec, cLv, cConf, cSet, cAdj] = await Promise.all([
        getItem<User>(STORAGE_KEYS.USER),
        getItem<AttendanceRecord[]>(STORAGE_KEYS.RECORDS),
        getItem<LeaveRequest[]>(STORAGE_KEYS.LEAVES),
        getItem<Confirmation[]>(STORAGE_KEYS.CONFIRMATIONS),
        getItem<Settings>(STORAGE_KEYS.SETTINGS),
        getItem<LeaveAdjustment[]>(STORAGE_KEYS.LEAVE_ADJUSTMENTS),
      ]);
      if (u) setUser(u);
      if (cRec) setRecords(cRec);
      if (cLv) setLeaves(cLv);
      if (cConf) setConfirmations(cConf);
      if (cSet) setSettings({ ...DEFAULT_SETTINGS, ...cSet });
      if (cAdj) setAdjustments(cAdj);

      if (!supabase) {
        setReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        await loadAll(data.session.user.id).catch(() => {});
        setAuthed(true);
      }
      setReady(true);

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await loadAll(session.user.id).catch(() => {});
          setAuthed(true);
        } else if (event === 'SIGNED_OUT') {
          setAuthed(false);
          setUser(null);
          setRecords([]);
          setLeaves([]);
          setConfirmations([]);
          setAdjustments([]);
        }
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll(userId: string) {
    const [me, pmap, recs, lvs, confs, wps, pol, adjs] = await Promise.all([
      api.fetchProfile(userId),
      api.fetchProfilesMap(),
      api.fetchRecords(),
      api.fetchLeaves(),
      api.fetchConfirmations(),
      api.fetchWorkplaces(),
      api.fetchPolicies(),
      api.fetchAdjustments(),
    ]);
    const recs2 = recs.map((r) => ({ ...r, userName: pmap[r.userId]?.name, empNo: pmap[r.userId]?.empNo }));
    const lvs2 = lvs.map((l) => ({ ...l, userName: pmap[l.userId]?.name, empNo: pmap[l.userId]?.empNo }));
    const nextSettings: Settings = { workplaces: wps, workPolicy: pol.workPolicy, leavePolicy: pol.leavePolicy };
    setUser(me);
    setProfilesById(pmap);
    setRecords(recs2);
    setLeaves(lvs2);
    setConfirmations(confs);
    setSettings(nextSettings);
    setAdjustments(adjs);
    // 캐시
    if (me) await setItem(STORAGE_KEYS.USER, me);
    await setItem(STORAGE_KEYS.RECORDS, recs2);
    await setItem(STORAGE_KEYS.LEAVES, lvs2);
    await setItem(STORAGE_KEYS.CONFIRMATIONS, confs);
    await setItem(STORAGE_KEYS.SETTINGS, nextSettings);
    await setItem(STORAGE_KEYS.LEAVE_ADJUSTMENTS, adjs);
  }

  const refresh = async () => {
    if (supabase && user) await loadAll(user.id).catch(() => {});
  };

  // ---- auth ----
  const register = async (a: RegisterArgs): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: '백엔드가 설정되지 않았습니다.' };
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: a.email.trim(),
        password: a.password,
        options: { data: { name: a.name.trim(), emp_no: a.empNo?.trim() || '', hire_date: a.hireDate || '' } },
      });
      if (error) return { ok: false, error: error.message };
      if (!data.session) return { ok: true, needConfirm: true }; // 이메일 확인 필요 설정
      // onAuthStateChange가 loadAll 처리
      return { ok: true };
    } finally {
      setBusy(false);
    }
  };

  const login = async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: '백엔드가 설정되지 않았습니다.' };
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setAuthed(false);
    setUser(null);
  };

  const changePassword = async (newPw: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: '백엔드 미설정' };
    const { error } = await supabase.auth.updateUser({ password: newPw });
    return error ? { ok: false, error: error.message } : { ok: true };
  };

  const updateProfile = async (patch: Partial<User>) => {
    if (!user) return;
    const u = { ...user, ...patch };
    setUser(u);
    await setItem(STORAGE_KEYS.USER, u);
    if (supabase) await api.updateProfileRow(user.id, patch).catch(() => {});
  };

  // ---- helpers ----
  const myRecords = () => records.filter((r) => r.userId === user?.id);
  const myLeavesArr = () => leaves.filter((l) => l.userId === user?.id);
  const myConfs = () => confirmations.filter((c) => c.userId === user?.id);
  const lastHash = (arr: { hash?: string }[]) => (arr.length ? arr[arr.length - 1].hash || '' : '');

  async function persistRecord(rec: AttendanceRecord) {
    setRecords((prev) => {
      const others = prev.filter((r) => r.id !== rec.id);
      return [...others, rec];
    });
    if (supabase && user) await api.upsertRecord(rec, user.id).catch((e) => console.warn('record sync', e));
  }

  // ---- attendance ----
  const checkIn: StoreValue['checkIn'] = async ({ type, point, workplace, within }) => {
    if (!user) return;
    const d = dateKey();
    const nowMsVal = new Date().getTime();
    const nowIso = new Date(nowMsVal).toISOString();
    const existing = records.find((r) => r.userId === user.id && r.date === d);
    const base0: AttendanceRecord =
      existing || {
        id: uid('rec'),
        userId: user.id,
        userName: user.name,
        empNo: user.empNo,
        date: d,
        type,
        updatedAt: nowIso,
      };
    const step = settings.workPolicy.clockInStepMinutes || 30;
    const plannedStart = base0.plannedStart || ceilTimeToStep(nowMsVal, step);
    const rec: AttendanceRecord = {
      ...base0,
      type,
      checkIn: base0.checkIn || nowIso,
      plannedStart,
      inLocation: point,
      inVerified: within,
      workplaceId: workplace?.id,
      workplaceName: workplace?.name,
      updatedAt: nowIso,
    };
    rec.prevHash = lastHash(myRecords().filter((r) => r.id !== rec.id));
    rec.hash = chainHash(rec.prevHash, rec as any);
    await persistRecord(rec);
  };

  const checkOut: StoreValue['checkOut'] = async ({ point, within }) => {
    if (!user) return;
    const d = dateKey();
    const existing = records.find((r) => r.userId === user.id && r.date === d);
    if (!existing) return;
    const nowIso = new Date().toISOString();
    const rec: AttendanceRecord = { ...existing, checkOut: nowIso, outLocation: point, outVerified: within, updatedAt: nowIso };
    rec.prevHash = lastHash(myRecords().filter((r) => r.id !== rec.id));
    rec.hash = chainHash(rec.prevHash, rec as any);
    await persistRecord(rec);
  };

  const clearAllRecords = async () => {
    setRecords((prev) => prev.filter((r) => r.userId !== user?.id));
    if (supabase && user) await api.deleteRecordsOf(user.id).catch(() => {});
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
    lv.prevHash = lastHash(myLeavesArr());
    lv.hash = chainHash(lv.prevHash, lv as any);
    setLeaves((prev) => [...prev, lv]);
    if (supabase && user) await api.upsertLeave(lv, user.id).catch((e) => console.warn('leave sync', e));
  };

  const cancelLeave = async (id: string) => {
    const target = leaves.find((l) => l.id === id);
    if (!target || !user) return;
    const upd: LeaveRequest = { ...target, status: 'CANCELED', decidedAt: new Date().toISOString() };
    setLeaves((prev) => prev.map((l) => (l.id === id ? upd : l)));
    if (supabase) await api.upsertLeave(upd, target.userId).catch(() => {});
  };

  const decideLeave = async (id: string, approve: boolean, note?: string) => {
    const target = leaves.find((l) => l.id === id);
    if (!target) return;
    const upd: LeaveRequest = {
      ...target,
      status: approve ? 'APPROVED' : 'REJECTED',
      decidedAt: new Date().toISOString(),
      decidedBy: user?.name,
      decisionNote: note,
    };
    setLeaves((prev) => prev.map((l) => (l.id === id ? upd : l)));
    if (supabase) await api.upsertLeave(upd, target.userId).catch((e) => console.warn('decide sync', e));
  };

  const addAdjustment = async (userId: string, hours: number, note?: string) => {
    const adj: LeaveAdjustment = { userId, hours, note, at: new Date().toISOString() };
    setAdjustments((prev) => [...prev, adj]);
    if (supabase && user) await api.insertAdjustment(userId, hours, note || '', user.id).catch((e) => console.warn('adj sync', e));
  };

  // ---- confirmation ----
  const addConfirmation: StoreValue['addConfirmation'] = async (c) => {
    if (!user) return;
    const conf: Confirmation = { ...c, id: uid('cf') } as Confirmation;
    conf.prevHash = lastHash(myConfs());
    conf.hash = chainHash(conf.prevHash, conf as any);
    setConfirmations((prev) => [...prev, conf]);
    if (supabase) await api.upsertConfirmation(conf, user.id).catch((e) => console.warn('conf sync', e));
  };

  // ---- workplaces / policy (admin) ----
  const addWorkplace = async (wp: Omit<Workplace, 'id'>) => {
    const full: Workplace = { ...wp, id: uid('wp') };
    setSettings((prev) => ({ ...prev, workplaces: [...prev.workplaces, full] }));
    if (supabase) await api.insertWorkplace(full).catch((e) => console.warn('wp add', e));
  };
  const removeWorkplace = async (id: string) => {
    setSettings((prev) => ({ ...prev, workplaces: prev.workplaces.filter((w) => w.id !== id) }));
    if (supabase) await api.deleteWorkplace(id).catch((e) => console.warn('wp del', e));
  };
  const updateWorkPolicy = async (patch: Partial<WorkPolicy>) => {
    const wpNext = { ...settings.workPolicy, ...patch };
    setSettings((prev) => ({ ...prev, workPolicy: wpNext }));
    if (supabase) await api.savePolicies({ workPolicy: wpNext }).catch((e) => console.warn('policy', e));
  };
  const updateLeavePolicy = async (patch: Partial<LeavePolicy>) => {
    const lpNext = { ...settings.leavePolicy, ...patch };
    setSettings((prev) => ({ ...prev, leavePolicy: lpNext }));
    if (supabase) await api.savePolicies({ leavePolicy: lpNext }).catch((e) => console.warn('policy', e));
  };

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      needsConfig,
      authed,
      busy,
      user,
      settings,
      records,
      leaves,
      adjustments,
      confirmations,
      profilesById,
      adminUnlocked: !!user?.isAdmin,
      register,
      login,
      logout,
      changePassword,
      updateProfile,
      refresh,
      checkIn,
      checkOut,
      clearAllRecords,
      requestLeave,
      cancelLeave,
      decideLeave,
      addAdjustment,
      addConfirmation,
      addWorkplace,
      removeWorkplace,
      updateWorkPolicy,
      updateLeavePolicy,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, needsConfig, authed, busy, user, settings, records, leaves, adjustments, confirmations, profilesById]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
