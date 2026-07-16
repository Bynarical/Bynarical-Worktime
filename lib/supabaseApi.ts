// Supabase 데이터 계층 — 행(snake_case) ↔ 앱(camelCase) 매핑 + CRUD.
// RLS가 접근을 강제하므로 select('*')만 해도 관리자는 전체, 일반 사용자는 본인 것만 반환됨.
import { supabase } from './supabase';
import { DEFAULT_LEAVE_POLICY, DEFAULT_WORK_POLICY } from './config';
import {
  AttendanceRecord,
  Confirmation,
  LeaveAdjustment,
  LeavePolicy,
  LeaveRequest,
  User,
  WorkPolicy,
  Workplace,
  Holiday,
  MealAllowance,
  AwayLog,
  LocationConsent,
} from './types';

function sb() {
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.');
  return supabase;
}

// ---------- 매퍼 ----------
function recToRow(r: AttendanceRecord, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    date: r.date,
    planned_start: r.plannedStart ?? null,
    check_in: r.checkIn ?? null,
    check_out: r.checkOut ?? null,
    type: r.type,
    workplace_id: r.workplaceId ?? null,
    workplace_name: r.workplaceName ?? null,
    in_lat: r.inLocation?.lat ?? null,
    in_lng: r.inLocation?.lng ?? null,
    in_verified: r.inVerified ?? null,
    out_lat: r.outLocation?.lat ?? null,
    out_lng: r.outLocation?.lng ?? null,
    out_verified: r.outVerified ?? null,
    pending: r.pending ?? false,
    approved_by: r.approvedBy ?? null,
    approved_at: r.approvedAt ?? null,
    note: r.note ?? null,
    hash: r.hash ?? null,
    prev_hash: r.prevHash ?? null,
    updated_at: r.updatedAt,
  };
}
function recFromRow(row: any): AttendanceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    plannedStart: row.planned_start || undefined,
    checkIn: row.check_in || undefined,
    checkOut: row.check_out || undefined,
    type: row.type || 'WORK',
    workplaceId: row.workplace_id || undefined,
    workplaceName: row.workplace_name || undefined,
    inLocation: row.in_lat != null ? { lat: row.in_lat, lng: row.in_lng } : undefined,
    outLocation: row.out_lat != null ? { lat: row.out_lat, lng: row.out_lng } : undefined,
    inVerified: row.in_verified ?? undefined,
    outVerified: row.out_verified ?? undefined,
    pending: row.pending ?? undefined,
    approvedBy: row.approved_by || undefined,
    approvedAt: row.approved_at || undefined,
    note: row.note || undefined,
    updatedAt: row.updated_at || new Date().toISOString(),
    hash: row.hash || undefined,
    prevHash: row.prev_hash || undefined,
  };
}
function leaveToRow(l: LeaveRequest, userId: string) {
  return {
    id: l.id,
    user_id: userId,
    date: l.date,
    hours: l.hours,
    segment: l.segment,
    category: l.category ?? 'ANNUAL',
    start_time: l.startTime ?? null,
    end_time: l.endTime ?? null,
    reason: l.reason ?? null,
    status: l.status,
    requested_at: l.requestedAt,
    decided_at: l.decidedAt ?? null,
    decided_by: l.decidedBy ?? null,
    decision_note: l.decisionNote ?? null,
    hash: l.hash ?? null,
    prev_hash: l.prevHash ?? null,
  };
}
function leaveFromRow(row: any): LeaveRequest {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    hours: row.hours,
    segment: row.segment,
    category: row.category === 'PAID' ? 'PAID' : 'ANNUAL',
    startTime: row.start_time || undefined,
    endTime: row.end_time || undefined,
    reason: row.reason || undefined,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at || undefined,
    decidedBy: row.decided_by || undefined,
    decisionNote: row.decision_note || undefined,
    hash: row.hash || undefined,
    prevHash: row.prev_hash || undefined,
  };
}
function confToRow(c: Confirmation, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    week_start: c.weekStart,
    week_end: c.weekEnd,
    signature: c.signature,
    total_worked_minutes: c.totalWorkedMinutes,
    summary_hash: c.summaryHash ?? null,
    hash: c.hash ?? null,
    prev_hash: c.prevHash ?? null,
    confirmed_at: c.confirmedAt,
  };
}
function confFromRow(row: any): Confirmation {
  return {
    id: row.id,
    userId: row.user_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    signature: row.signature || '',
    totalWorkedMinutes: row.total_worked_minutes || 0,
    recordHashes: [],
    summaryHash: row.summary_hash || '',
    confirmedAt: row.confirmed_at,
    hash: row.hash || undefined,
    prevHash: row.prev_hash || undefined,
  };
}

// ---------- 프로필 ----------
export async function fetchProfile(userId: string): Promise<User | null> {
  const { data } = await sb().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    empNo: data.emp_no || undefined,
    hireDate: data.hire_date || undefined,
    isAdmin: !!data.is_admin,
    createdAt: data.created_at,
  };
}

export interface ProfileBrief {
  name: string;
  empNo?: string;
  hireDate?: string;
  isAdmin?: boolean;
}
export async function fetchProfilesMap(): Promise<Record<string, ProfileBrief>> {
  const { data } = await sb().from('profiles').select('id,name,emp_no,hire_date,is_admin');
  const map: Record<string, ProfileBrief> = {};
  (data || []).forEach(
    (p: any) => (map[p.id] = { name: p.name, empNo: p.emp_no || undefined, hireDate: p.hire_date || undefined, isAdmin: !!p.is_admin })
  );
  return map;
}

export async function updateProfileRow(userId: string, patch: Partial<User>) {
  const row: any = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.empNo !== undefined) row.emp_no = patch.empNo || null;
  if (patch.hireDate !== undefined) row.hire_date = patch.hireDate || null;
  if (patch.isAdmin !== undefined) row.is_admin = patch.isAdmin;
  const { error } = await sb().from('profiles').update(row).eq('id', userId);
  if (error) throw error;
}

// ---------- 근태 기록 ----------
export async function fetchRecords(): Promise<AttendanceRecord[]> {
  const { data } = await sb().from('records').select('*').order('date', { ascending: false });
  return (data || []).map(recFromRow);
}
export async function upsertRecord(r: AttendanceRecord, userId: string) {
  const { error } = await sb().from('records').upsert(recToRow(r, userId), { onConflict: 'id' });
  if (error) throw error;
}
export async function deleteRecordsOf(userId: string) {
  await sb().from('records').delete().eq('user_id', userId);
}

// ---------- 연차 ----------
export async function fetchLeaves(): Promise<LeaveRequest[]> {
  const { data } = await sb().from('leaves').select('*').order('date', { ascending: false });
  return (data || []).map(leaveFromRow);
}
export async function upsertLeave(l: LeaveRequest, userId: string) {
  const { error } = await sb().from('leaves').upsert(leaveToRow(l, userId), { onConflict: 'id' });
  if (error) throw error;
}
export async function deleteLeave(id: string) {
  const { error } = await sb().from('leaves').delete().eq('id', id);
  if (error) throw error;
}

// ---------- 확인(전자서명) ----------
export async function fetchConfirmations(): Promise<Confirmation[]> {
  const { data } = await sb().from('confirmations').select('*');
  return (data || []).map(confFromRow);
}
export async function upsertConfirmation(c: Confirmation, userId: string) {
  const { error } = await sb().from('confirmations').upsert(confToRow(c, userId), { onConflict: 'id' });
  if (error) throw error;
}

// ---------- 근무지 ----------
export async function fetchWorkplaces(): Promise<Workplace[]> {
  const { data } = await sb().from('workplaces').select('*').order('name');
  return (data || []).map((w: any) => ({ id: w.id, name: w.name, lat: w.lat, lng: w.lng, radius: w.radius }));
}
export async function insertWorkplace(w: Workplace) {
  const { error } = await sb().from('workplaces').insert({ id: w.id, name: w.name, lat: w.lat, lng: w.lng, radius: w.radius });
  if (error) throw error;
}
export async function deleteWorkplace(id: string) {
  const { error } = await sb().from('workplaces').delete().eq('id', id);
  if (error) throw error;
}

// ---------- 공휴일 ----------
export async function fetchHolidays(): Promise<Holiday[]> {
  const { data } = await sb().from('company_holidays').select('*').order('day');
  return (data || []).map((h: any) => ({ day: h.day, name: h.name }));
}
export async function insertHoliday(h: Holiday) {
  const { error } = await sb().from('company_holidays').upsert({ day: h.day, name: h.name }, { onConflict: 'day' });
  if (error) throw error;
}
export async function deleteHoliday(day: string) {
  const { error } = await sb().from('company_holidays').delete().eq('day', day);
  if (error) throw error;
}

// ---------- 위치정보 동의 ----------
export async function fetchConsents(): Promise<LocationConsent[]> {
  const { data } = await sb().from('location_consents').select('*');
  return (data || []).map((c: any) => ({ userId: c.user_id, agreedAt: c.agreed_at, ip: c.ip || undefined, userAgent: c.user_agent || undefined, version: c.version || undefined }));
}

// ---------- 근태 승인(관리자) ----------
export async function adminApproveRecord(id: string, approvedBy: string) {
  const { error } = await sb()
    .from('records')
    .update({ pending: false, approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
export async function adminDeleteRecord(id: string) {
  const { error } = await sb().from('records').delete().eq('id', id);
  if (error) throw error;
}

// ---------- 저녁식대 ----------
export async function fetchMeals(): Promise<MealAllowance[]> {
  const { data } = await sb().from('meal_allowances').select('*').order('date', { ascending: false });
  return (data || []).map((m: any) => ({ id: m.id, userId: m.user_id, date: m.date, amount: Number(m.amount) || 0, note: m.note || undefined, createdAt: m.created_at }));
}
export async function upsertMeal(m: MealAllowance, userId: string) {
  const { error } = await sb()
    .from('meal_allowances')
    .upsert({ id: m.id, user_id: userId, date: m.date, amount: m.amount, note: m.note ?? null }, { onConflict: 'user_id,date' });
  if (error) throw error;
}
export async function deleteMeal(id: string) {
  const { error } = await sb().from('meal_allowances').delete().eq('id', id);
  if (error) throw error;
}

// ---------- 자리비움(관리자 기록) ----------
export async function fetchAwayLogs(): Promise<AwayLog[]> {
  const { data } = await sb().from('away_logs').select('*').order('date', { ascending: false });
  return (data || []).map((a: any) => ({
    id: a.id,
    userId: a.user_id,
    date: a.date,
    startTime: a.start_time || undefined,
    endTime: a.end_time || undefined,
    minutes: Number(a.minutes) || 0,
    note: a.note || undefined,
    createdBy: a.created_by || undefined,
    createdAt: a.created_at || undefined,
  }));
}
export async function upsertAwayLog(a: AwayLog, userId: string) {
  const { error } = await sb()
    .from('away_logs')
    .upsert(
      {
        id: a.id,
        user_id: userId,
        date: a.date,
        start_time: a.startTime ?? null,
        end_time: a.endTime ?? null,
        minutes: a.minutes,
        note: a.note ?? null,
        created_by: a.createdBy ?? null,
      },
      { onConflict: 'id' }
    );
  if (error) throw error;
}
export async function deleteAwayLog(id: string) {
  const { error } = await sb().from('away_logs').delete().eq('id', id);
  if (error) throw error;
}

// ---------- 정책 ----------
export async function fetchPolicies(): Promise<{ workPolicy: WorkPolicy; leavePolicy: LeavePolicy }> {
  const { data } = await sb().from('app_settings').select('*').eq('id', 1).maybeSingle();
  return {
    workPolicy: { ...DEFAULT_WORK_POLICY, ...((data?.work_policy as object) || {}) },
    leavePolicy: { ...DEFAULT_LEAVE_POLICY, ...((data?.leave_policy as object) || {}) },
  };
}
export async function savePolicies(patch: { workPolicy?: WorkPolicy; leavePolicy?: LeavePolicy }) {
  const row: any = { id: 1, updated_at: new Date().toISOString() };
  if (patch.workPolicy) row.work_policy = patch.workPolicy;
  if (patch.leavePolicy) row.leave_policy = patch.leavePolicy;
  const { error } = await sb().from('app_settings').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

// ---------- 연차 조정 ----------
export async function fetchAdjustments(): Promise<LeaveAdjustment[]> {
  const { data } = await sb().from('leave_adjustments').select('*');
  return (data || []).map((a: any) => ({ userId: a.user_id, hours: Number(a.hours), note: a.note || undefined, at: a.at }));
}
export async function insertAdjustment(userId: string, hours: number, note: string, createdBy: string) {
  const { error } = await sb().from('leave_adjustments').insert({ user_id: userId, hours, note, created_by: createdBy });
  if (error) throw error;
}
