// 앱 전역 상태 — Supabase Auth + Postgres(RLS) 백엔드. localStorage는 오프라인 캐시.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, STORAGE_KEYS, MEAL_DAILY_LIMIT, CONSENT_VERSION } from './config';
import { getItem, setItem } from './storage';
import {
  AttendanceRecord,
  AttendanceType,
  Confirmation,
  GeoPoint,
  LeaveAdjustment,
  LeaveRequest,
  LeaveSegment,
  LeaveCategory,
  LeaveUnit,
  Settings,
  User,
  Workplace,
  WorkPolicy,
  LeavePolicy,
  Holiday,
  MealAllowance,
  AwayLog,
  LocationConsent,
} from './types';
import { chainHash } from './hash';
import { dateKey, ceilTimeToStep, timeHM, hmToMinutes } from './time';
import { supabase, isSupabaseConfigured, makeTempClient } from './supabase';
import * as api from './supabaseApi';

function uid(prefix: string): string {
  return `${prefix}_${new Date().getTime().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// 직원 계정 여부. 관리자 전용 계정(관리자 권한 + 입사일 없음)은 직원이 아니므로
// 직원 선택/목록/입력 UI에서 제외한다. (근무하는 직원이 관리자 권한을 받은 경우엔
// 입사일이 있으므로 계속 직원으로 취급된다.)
export function isEmployeeAccount(p: { isAdmin?: boolean; hireDate?: string }): boolean {
  return !(p.isAdmin && !p.hireDate);
}

interface CreateEmployeeArgs {
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
  profilesById: Record<string, { name: string; empNo?: string; hireDate?: string; isAdmin?: boolean }>;
  holidays: Holiday[];
  holidaySet: Set<string>;
  meals: MealAllowance[];
  awayLogs: AwayLog[];
  consents: LocationConsent[];
  adminUnlocked: boolean;

  login: (name: string, password: string) => Promise<AuthResult>;
  adminCreateEmployee: (a: CreateEmployeeArgs) => Promise<AuthResult>;
  logout: () => Promise<void>;
  changePassword: (newPw: string) => Promise<AuthResult>;
  verifyPassword: (password: string) => Promise<boolean>;
  passwordChanged: boolean; // 초기 비밀번호에서 변경했는지
  updateProfile: (patch: Partial<User>) => Promise<void>;
  adminUpdateProfile: (userId: string, patch: { name?: string; empNo?: string; hireDate?: string; isAdmin?: boolean }) => Promise<void>;
  refresh: () => Promise<void>;

  checkIn: (args: { type: AttendanceType; point?: GeoPoint; workplace?: Workplace | null; within?: boolean; pending?: boolean }) => Promise<void>;
  checkOut: (args: { point?: GeoPoint; within?: boolean }) => Promise<void>;
  clearAllRecords: () => Promise<void>;
  adminApproveAttendance: (recordId: string) => Promise<void>;
  adminRejectAttendance: (recordId: string) => Promise<void>;
  // 관리자 대리 편집(직원 근태)
  adminSaveRecord: (userId: string, date: string, fields: { checkIn?: string | null; checkOut?: string | null; plannedStart?: string; type?: AttendanceType; note?: string }) => Promise<void>;
  adminDeleteRecord: (id: string) => Promise<void>;

  requestLeave: (req: { date: string; hours: LeaveUnit; segment: LeaveSegment; category?: LeaveCategory; startTime?: string; endTime?: string; reason?: string }) => Promise<void>;
  cancelLeave: (id: string) => Promise<void>;
  decideLeave: (id: string, approve: boolean, note?: string) => Promise<void>;
  // 관리자 대리 편집(직원 연차)
  adminAddLeave: (userId: string, req: { date: string; hours: LeaveUnit; segment: LeaveSegment; category?: LeaveCategory; startTime?: string; endTime?: string; reason?: string }) => Promise<void>;
  adminDeleteLeave: (id: string) => Promise<void>;
  // 근무 중 실시간 외출(중간 연차) — 시작/복귀/취소
  startOuting: () => Promise<void>;
  endOuting: () => Promise<void>;
  cancelOuting: () => Promise<void>;
  addAdjustment: (userId: string, hours: number, note?: string) => Promise<void>;

  addConfirmation: (c: Omit<Confirmation, 'id' | 'prevHash' | 'hash'>) => Promise<void>;

  addWorkplace: (wp: Omit<Workplace, 'id'>) => Promise<void>;
  removeWorkplace: (id: string) => Promise<void>;
  adminAddHoliday: (day: string, name: string) => Promise<void>;
  adminRemoveHoliday: (day: string) => Promise<void>;
  adminSyncHolidays: (fromYear: number, toYear: number) => Promise<{ ok: boolean; count?: number; error?: string }>;
  setMeal: (date: string, amount: number, note?: string) => Promise<void>;
  removeMeal: (id: string) => Promise<void>;
  // 관리자: 자리비움 기록 추가/삭제
  adminAddAway: (userId: string, a: { date: string; startTime?: string; endTime?: string; minutes: number; note?: string }) => Promise<void>;
  adminDeleteAway: (id: string) => Promise<void>;
  recordConsent: () => Promise<{ ok: boolean; error?: string }>;
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
  const [profilesById, setProfilesById] = useState<Record<string, { name: string; empNo?: string; hireDate?: string; isAdmin?: boolean }>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [meals, setMeals] = useState<MealAllowance[]>([]);
  const [awayLogs, setAwayLogs] = useState<AwayLog[]>([]);
  const [consents, setConsents] = useState<LocationConsent[]>([]);
  // 초기 비밀번호에서 한 번이라도 변경했는지 (auth user_metadata.password_changed)
  const [passwordChanged, setPasswordChanged] = useState(true);

  const needsConfig = !isSupabaseConfigured;

  // 오프라인 캐시 로드(즉시 페인트용)
  useEffect(() => {
    (async () => {
      const [u, cRec, cLv, cConf, cSet, cAdj, cHol, cMeal, cCon] = await Promise.all([
        getItem<User>(STORAGE_KEYS.USER),
        getItem<AttendanceRecord[]>(STORAGE_KEYS.RECORDS),
        getItem<LeaveRequest[]>(STORAGE_KEYS.LEAVES),
        getItem<Confirmation[]>(STORAGE_KEYS.CONFIRMATIONS),
        getItem<Settings>(STORAGE_KEYS.SETTINGS),
        getItem<LeaveAdjustment[]>(STORAGE_KEYS.LEAVE_ADJUSTMENTS),
        getItem<Holiday[]>(STORAGE_KEYS.HOLIDAYS),
        getItem<MealAllowance[]>(STORAGE_KEYS.MEALS),
        getItem<LocationConsent[]>(STORAGE_KEYS.CONSENTS),
      ]);
      if (u) setUser(u);
      if (cRec) setRecords(cRec);
      if (cLv) setLeaves(cLv);
      if (cHol) setHolidays(cHol);
      if (cMeal) setMeals(cMeal);
      if (cCon) setConsents(cCon);
      if (cConf) setConfirmations(cConf);
      if (cSet) setSettings({ ...DEFAULT_SETTINGS, ...cSet });
      if (cAdj) setAdjustments(cAdj);
      const cAway = await getItem<AwayLog[]>(STORAGE_KEYS.AWAY);
      if (cAway) setAwayLogs(cAway);

      if (!supabase) {
        setReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        await loadAll(data.session.user.id).catch(() => {});
        setPasswordChanged(!!data.session.user.user_metadata?.password_changed);
        setAuthed(true);
      }
      setReady(true);

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await loadAll(session.user.id).catch(() => {});
          setPasswordChanged(!!session.user.user_metadata?.password_changed);
          setAuthed(true);
        } else if (event === 'SIGNED_OUT') {
          setAuthed(false);
          setUser(null);
          setRecords([]);
          setLeaves([]);
          setConfirmations([]);
          setAdjustments([]);
          setMeals([]);
          setAwayLogs([]);
          setConsents([]);
        }
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll(userId: string) {
    const [me, pmap, recs, lvs, confs, wps, pol, adjs, hols, mealsData, consentsData, awayData] = await Promise.all([
      api.fetchProfile(userId),
      api.fetchProfilesMap(),
      api.fetchRecords(),
      api.fetchLeaves(),
      api.fetchConfirmations(),
      api.fetchWorkplaces(),
      api.fetchPolicies(),
      api.fetchAdjustments(),
      api.fetchHolidays().catch(() => [] as Holiday[]),
      api.fetchMeals().catch(() => [] as MealAllowance[]),
      api.fetchConsents().catch(() => [] as LocationConsent[]),
      api.fetchAwayLogs().catch(() => [] as AwayLog[]),
    ]);
    const recs2 = recs.map((r) => ({ ...r, userName: pmap[r.userId]?.name, empNo: pmap[r.userId]?.empNo }));
    const lvs2 = lvs.map((l) => ({ ...l, userName: pmap[l.userId]?.name, empNo: pmap[l.userId]?.empNo }));
    const meals2 = mealsData.map((m) => ({ ...m, userName: pmap[m.userId]?.name }));
    const away2 = awayData.map((a) => ({ ...a, userName: pmap[a.userId]?.name }));
    const nextSettings: Settings = { workplaces: wps, workPolicy: pol.workPolicy, leavePolicy: pol.leavePolicy };
    setUser(me);
    setProfilesById(pmap);
    setRecords(recs2);
    setLeaves(lvs2);
    setConfirmations(confs);
    setSettings(nextSettings);
    setAdjustments(adjs);
    setHolidays(hols);
    setMeals(meals2);
    setAwayLogs(away2);
    setConsents(consentsData);
    // 캐시
    if (me) await setItem(STORAGE_KEYS.USER, me);
    await setItem(STORAGE_KEYS.CONSENTS, consentsData);
    await setItem(STORAGE_KEYS.MEALS, meals2);
    await setItem(STORAGE_KEYS.AWAY, away2);
    await setItem(STORAGE_KEYS.HOLIDAYS, hols);
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
  // 직원 로그인: 이름 → (서버 함수로) 이메일 조회 → 비밀번호 인증
  const login = async (name: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: '백엔드가 설정되지 않았습니다.' };
    setBusy(true);
    try {
      const { data: email, error: rerr } = await supabase.rpc('login_email_for_name', { p_name: name.trim() });
      if (rerr) return { ok: false, error: rerr.message };
      if (!email) return { ok: false, error: '이름을 찾을 수 없거나 동명이인이 있습니다. 관리자에게 문의하세요.' };
      const { error } = await supabase.auth.signInWithPassword({ email: email as string, password });
      if (error) return { ok: false, error: '비밀번호가 올바르지 않습니다.' };
      return { ok: true };
    } finally {
      setBusy(false);
    }
  };

  // 관리자: 신규 직원 계정 생성. Edge Function이 service 권한으로 생성하며 호출자가 관리자인지 서버에서 검증.
  // (공개 가입 OFF 상태에서도 동작 → 일반 직원은 계정을 만들 수 없음)
  const adminCreateEmployee = async (a: CreateEmployeeArgs): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: '백엔드가 설정되지 않았습니다.' };
    const dupe = Object.values(profilesById).some((p) => (p.name || '').trim() === a.name.trim());
    if (dupe) return { ok: false, error: '같은 이름의 직원이 이미 있습니다. 이름을 구분해서 입력하세요.' };
    const { data, error } = await supabase.functions.invoke('create-employee', {
      body: {
        email: a.email.trim(),
        password: a.password,
        name: a.name.trim(),
        emp_no: a.empNo?.trim() || '',
        hire_date: a.hireDate || '',
      },
    });
    if (error) return { ok: false, error: '직원 등록 함수를 호출하지 못했습니다. (Edge Function 배포 확인)' };
    if (data && (data as any).ok === false) return { ok: false, error: (data as any).error || '등록 실패' };
    await refresh(); // 새 직원이 목록에 반영되도록
    return { ok: true };
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setAuthed(false);
    setUser(null);
  };

  const changePassword = async (newPw: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, error: '백엔드 미설정' };
    const { error } = await supabase.auth.updateUser({ password: newPw, data: { password_changed: true } });
    if (error) return { ok: false, error: error.message };
    setPasswordChanged(true);
    return { ok: true };
  };

  // 현재 로그인 사용자의 비밀번호 확인. 임시 클라이언트로 재인증해 본 세션에 영향 없음.
  const verifyPassword = async (password: string): Promise<boolean> => {
    if (!supabase) return false;
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) return false;
    const temp = makeTempClient();
    if (!temp) return false;
    const { error } = await temp.auth.signInWithPassword({ email, password });
    await temp.auth.signOut().catch(() => {});
    return !error;
  };

  const updateProfile = async (patch: Partial<User>) => {
    if (!user) return;
    const u = { ...user, ...patch };
    setUser(u);
    await setItem(STORAGE_KEYS.USER, u);
    if (supabase) await api.updateProfileRow(user.id, patch).catch(() => {});
  };

  // 관리자: 다른 직원(또는 본인)의 프로필 수정 (입사일/권한 등). RLS + 트리거가 is_admin 변경을 관리자만 허용.
  const adminUpdateProfile = async (
    userId: string,
    patch: { name?: string; empNo?: string; hireDate?: string; isAdmin?: boolean }
  ) => {
    if (supabase) await api.updateProfileRow(userId, patch).catch((e) => console.warn('admin profile', e));
    setProfilesById((prev) => ({
      ...prev,
      [userId]: {
        name: patch.name ?? prev[userId]?.name ?? '',
        empNo: patch.empNo ?? prev[userId]?.empNo,
        hireDate: patch.hireDate ?? prev[userId]?.hireDate,
        isAdmin: patch.isAdmin ?? prev[userId]?.isAdmin,
      },
    }));
    if (userId === user?.id) {
      const u = { ...user!, ...patch };
      setUser(u);
      await setItem(STORAGE_KEYS.USER, u);
    }
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
  const checkIn: StoreValue['checkIn'] = async ({ type, point, workplace, within, pending }) => {
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
      pending: base0.pending || !!pending,
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

  // 관리자: 근무지 밖 출근(승인 대기) 처리
  const adminApproveAttendance = async (recordId: string) => {
    const by = user?.name || 'admin';
    setRecords((prev) => prev.map((r) => (r.id === recordId ? { ...r, pending: false, approvedBy: by, approvedAt: new Date().toISOString() } : r)));
    if (supabase) await api.adminApproveRecord(recordId, by).catch((e) => console.warn('approve rec', e));
  };
  const adminRejectAttendance = async (recordId: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
    if (supabase) await api.adminDeleteRecord(recordId).catch((e) => console.warn('reject rec', e));
  };

  // 관리자 대리 편집: 직원 근무기록 추가/수정 (대상 직원 id로 저장)
  const adminSaveRecord: StoreValue['adminSaveRecord'] = async (targetUserId, date, fields) => {
    const targetName = profilesById[targetUserId]?.name;
    const existing = records.find((r) => r.userId === targetUserId && r.date === date);
    const nowIso = new Date().toISOString();
    const rec: AttendanceRecord = {
      ...existing,
      id: existing?.id || uid('rec'),
      userId: targetUserId,
      userName: targetName,
      date,
      type: fields.type ?? existing?.type ?? 'WORK',
      checkIn: fields.checkIn === null ? undefined : fields.checkIn ?? existing?.checkIn,
      checkOut: fields.checkOut === null ? undefined : fields.checkOut ?? existing?.checkOut,
      plannedStart: fields.plannedStart ?? existing?.plannedStart,
      pending: false,
      note: fields.note !== undefined ? fields.note : existing?.note ?? '관리자 수정',
      updatedAt: nowIso,
    };
    const chain = records.filter((r) => r.userId === targetUserId && r.id !== rec.id);
    rec.prevHash = lastHash(chain);
    rec.hash = chainHash(rec.prevHash, rec as any);
    setRecords((prev) => [...prev.filter((r) => r.id !== rec.id), rec]);
    if (supabase) await api.upsertRecord(rec, targetUserId).catch((e) => console.warn('admin save rec', e));
  };
  const adminDeleteRecord: StoreValue['adminDeleteRecord'] = async (id) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    if (supabase) await api.adminDeleteRecord(id).catch((e) => console.warn('admin del rec', e));
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
      category: req.category ?? 'ANNUAL',
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

  // 관리자 대리 편집: 직원 연차 등록(즉시 승인) / 삭제
  const adminAddLeave: StoreValue['adminAddLeave'] = async (targetUserId, req) => {
    const nowIso = new Date().toISOString();
    const lv: LeaveRequest = {
      id: uid('lv'),
      userId: targetUserId,
      userName: profilesById[targetUserId]?.name,
      date: req.date,
      hours: req.hours,
      segment: req.segment,
      category: req.category ?? 'ANNUAL',
      startTime: req.startTime,
      endTime: req.endTime,
      reason: req.reason ?? '관리자 등록',
      status: 'APPROVED',
      requestedAt: nowIso,
      decidedAt: nowIso,
      decidedBy: user?.name,
    };
    const chain = leaves.filter((l) => l.userId === targetUserId);
    lv.prevHash = lastHash(chain);
    lv.hash = chainHash(lv.prevHash, lv as any);
    setLeaves((prev) => [...prev, lv]);
    if (supabase) await api.upsertLeave(lv, targetUserId).catch((e) => console.warn('admin add leave', e));
  };
  const adminDeleteLeave: StoreValue['adminDeleteLeave'] = async (id) => {
    setLeaves((prev) => prev.filter((l) => l.id !== id));
    if (supabase) await api.deleteLeave(id).catch((e) => console.warn('admin del leave', e));
  };

  // 근무 중 외출(중간 연차): 진행 중인 외출 = 오늘자 CUSTOM·종료없음·승인대기
  const openOuting = () => {
    const d = dateKey();
    return leaves.find(
      (l) => l.userId === user?.id && l.date === d && l.segment === 'CUSTOM' && !l.endTime && l.status === 'REQUESTED'
    );
  };
  const startOuting = async () => {
    if (!user || openOuting()) return;
    const lv: LeaveRequest = {
      id: uid('lv'),
      userId: user.id,
      userName: user.name,
      empNo: user.empNo,
      date: dateKey(),
      hours: 2,
      segment: 'CUSTOM',
      category: 'ANNUAL',
      startTime: timeHM(Date.now()),
      reason: '외출(중간 연차)',
      status: 'REQUESTED',
      requestedAt: new Date().toISOString(),
    };
    lv.prevHash = lastHash(myLeavesArr());
    lv.hash = chainHash(lv.prevHash, lv as any);
    setLeaves((prev) => [...prev, lv]);
    if (supabase) await api.upsertLeave(lv, user.id).catch((e) => console.warn('outing start', e));
  };
  const endOuting = async () => {
    if (!user) return;
    const open = openOuting();
    if (!open) return;
    const endHM = timeHM(Date.now());
    const diffMin = Math.max(0, hmToMinutes(endHM) - hmToMinutes(open.startTime || endHM));
    const hours = Math.min(8, Math.max(2, Math.ceil(diffMin / 120) * 2)) as LeaveUnit; // 2시간 단위 올림
    const upd: LeaveRequest = { ...open, endTime: endHM, hours };
    upd.hash = chainHash(upd.prevHash || '', upd as any);
    setLeaves((prev) => prev.map((l) => (l.id === open.id ? upd : l)));
    if (supabase) await api.upsertLeave(upd, user.id).catch((e) => console.warn('outing end', e));
  };
  const cancelOuting = async () => {
    if (!user) return;
    const open = openOuting();
    if (!open) return;
    setLeaves((prev) => prev.filter((l) => l.id !== open.id));
    if (supabase) await api.deleteLeave(open.id).catch((e) => console.warn('outing cancel', e));
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
  const adminAddHoliday = async (day: string, name: string) => {
    setHolidays((prev) => {
      const next = [...prev.filter((h) => h.day !== day), { day, name }].sort((a, b) => (a.day < b.day ? -1 : 1));
      setItem(STORAGE_KEYS.HOLIDAYS, next);
      return next;
    });
    if (supabase) await api.insertHoliday({ day, name }).catch((e) => console.warn('holiday add', e));
  };
  const adminRemoveHoliday = async (day: string) => {
    setHolidays((prev) => {
      const next = prev.filter((h) => h.day !== day);
      setItem(STORAGE_KEYS.HOLIDAYS, next);
      return next;
    });
    if (supabase) await api.deleteHoliday(day).catch((e) => console.warn('holiday del', e));
  };
  // 관리자: 공공데이터포털 특일정보 API에서 공휴일을 가져와 DB에 반영(Edge Function).
  const adminSyncHolidays = async (fromYear: number, toYear: number) => {
    if (!supabase) return { ok: false, error: '백엔드가 설정되지 않았습니다.' };
    const { data, error } = await supabase.functions.invoke('sync-holidays', { body: { fromYear, toYear } });
    if (error) return { ok: false, error: '공휴일 동기화 함수를 호출하지 못했습니다. (Edge Function 배포 확인)' };
    if (data && (data as any).ok === false) return { ok: false, error: (data as any).error || '동기화 실패' };
    // 서버 반영분을 다시 로드
    const hols = await api.fetchHolidays().catch(() => holidays);
    setHolidays(hols);
    await setItem(STORAGE_KEYS.HOLIDAYS, hols);
    return { ok: true, count: (data as any)?.count };
  };

  // 저녁식대 기록(하루 1건, 한도 적용). 같은 날짜면 갱신.
  const setMeal = async (date: string, amount: number, note?: string) => {
    if (!user) return;
    const amt = Math.max(0, Math.min(Math.round(amount) || 0, MEAL_DAILY_LIMIT));
    const existing = meals.find((m) => m.userId === user.id && m.date === date);
    const m: MealAllowance = {
      id: existing?.id || uid('meal'),
      userId: user.id,
      userName: user.name,
      date,
      amount: amt,
      note: note?.trim() || undefined,
      createdAt: existing?.createdAt,
    };
    setMeals((prev) => {
      const next = [...prev.filter((x) => x.id !== m.id), m];
      setItem(STORAGE_KEYS.MEALS, next);
      return next;
    });
    if (supabase) await api.upsertMeal(m, user.id).catch((e) => console.warn('meal sync', e));
  };
  const removeMeal = async (id: string) => {
    setMeals((prev) => {
      const next = prev.filter((m) => m.id !== id);
      setItem(STORAGE_KEYS.MEALS, next);
      return next;
    });
    if (supabase) await api.deleteMeal(id).catch((e) => console.warn('meal del', e));
  };

  // 관리자: 자리비움 기록 추가/삭제
  const adminAddAway: StoreValue['adminAddAway'] = async (targetUserId, a) => {
    const rec: AwayLog = {
      id: uid('away'),
      userId: targetUserId,
      userName: profilesById[targetUserId]?.name,
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      minutes: Math.max(0, Math.round(a.minutes) || 0),
      note: a.note,
      createdBy: user?.name,
      createdAt: new Date().toISOString(),
    };
    setAwayLogs((prev) => {
      const next = [...prev, rec];
      setItem(STORAGE_KEYS.AWAY, next);
      return next;
    });
    if (supabase) await api.upsertAwayLog(rec, targetUserId).catch((e) => console.warn('away add', e));
  };
  const adminDeleteAway: StoreValue['adminDeleteAway'] = async (id) => {
    setAwayLogs((prev) => {
      const next = prev.filter((x) => x.id !== id);
      setItem(STORAGE_KEYS.AWAY, next);
      return next;
    });
    if (supabase) await api.deleteAwayLog(id).catch((e) => console.warn('away del', e));
  };

  // 위치정보 수집·이용 동의 기록 (IP는 Edge Function이 서버에서 캡처)
  const recordConsent = async () => {
    if (!supabase || !user) return { ok: false, error: '백엔드가 설정되지 않았습니다.' };
    const { data, error } = await supabase.functions.invoke('record-consent', { body: { version: CONSENT_VERSION } });
    if (error) return { ok: false, error: '동의 기록 함수를 호출하지 못했습니다. (Edge Function 배포 확인)' };
    if (data && (data as any).ok === false) return { ok: false, error: (data as any).error || '동의 기록 실패' };
    const list = await api.fetchConsents().catch(() => consents);
    setConsents(list);
    await setItem(STORAGE_KEYS.CONSENTS, list);
    return { ok: true };
  };

  // 관리자가 앱을 열면 공휴일을 자동 동기화(하루 1회, 백그라운드). 버튼 없이 최신 유지.
  const autoSyncRef = useRef(false);
  useEffect(() => {
    if (!ready || !authed || !user?.isAdmin || autoSyncRef.current) return;
    autoSyncRef.current = true;
    (async () => {
      try {
        const last = (await getItem<number>(STORAGE_KEYS.HOLIDAYS_SYNCED)) || 0;
        const now = new Date().getTime();
        if (now - last < 24 * 60 * 60 * 1000) return; // 24시간 내 이미 동기화됨
        const year = new Date().getFullYear();
        const r = await adminSyncHolidays(year, year + 1);
        if (r.ok) await setItem(STORAGE_KEYS.HOLIDAYS_SYNCED, now);
      } catch {
        // 네트워크/미배포 등은 조용히 무시(수동 버튼으로 재시도 가능)
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authed, user?.isAdmin]);

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
      holidays,
      holidaySet: new Set(holidays.map((h) => h.day)),
      meals,
      awayLogs,
      consents,
      adminUnlocked: !!user?.isAdmin,
      login,
      adminCreateEmployee,
      logout,
      changePassword,
      verifyPassword,
      passwordChanged,
      updateProfile,
      adminUpdateProfile,
      refresh,
      checkIn,
      checkOut,
      clearAllRecords,
      adminApproveAttendance,
      adminRejectAttendance,
      adminSaveRecord,
      adminDeleteRecord,
      requestLeave,
      cancelLeave,
      decideLeave,
      adminAddLeave,
      adminDeleteLeave,
      startOuting,
      endOuting,
      cancelOuting,
      addAdjustment,
      addConfirmation,
      addWorkplace,
      removeWorkplace,
      adminAddHoliday,
      adminRemoveHoliday,
      adminSyncHolidays,
      setMeal,
      removeMeal,
      adminAddAway,
      adminDeleteAway,
      recordConsent,
      updateWorkPolicy,
      updateLeavePolicy,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, needsConfig, authed, busy, user, settings, records, leaves, adjustments, confirmations, profilesById, holidays, meals, awayLogs, consents, passwordChanged]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
