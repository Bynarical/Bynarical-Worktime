import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Card, Button, Field, Chip, Row, Muted } from './ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { dateKey, addDaysKey } from '@/lib/time';
import { computeBalance, hoursToDayLabel, leaveCategoryLabel, LEAVE_CATEGORY_ICONS, LEAVE_CATEGORY_NOTES } from '@/lib/leave';
import { leaveStyle } from '@/lib/palette';
import { planPeriod, planPeriodClear, PeriodKind } from '@/lib/period';
import { User } from '@/lib/types';

const KINDS: PeriodKind[] = ['ANNUAL', 'PAID', 'UNPAID', 'TRIP'];

// 관리자: 휴가(연차·유급·무급) / 출장을 시작~종료일로 한 번에 등록·취소.
// 근무일마다 종일 건으로 들어가며, 주말·공휴일·서명 잠금 주·이미 휴가가 있는 날은 건너뛴다.
export function AdminPeriodEditor({ userId, userName }: { userId: string; userName: string }) {
  const s = useStore();
  const t = useTheme();
  const today = dateKey();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PeriodKind>('ANNUAL');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const kindLabel = (k: PeriodKind) => (k === 'TRIP' ? '출장' : leaveCategoryLabel(k));
  const kindIcon = (k: PeriodKind) => (k === 'TRIP' ? '✈️' : LEAVE_CATEGORY_ICONS[k]);
  const kindColor = (k: PeriodKind) => (k === 'TRIP' ? t.trip : leaveStyle(t, k).color);

  const ctx = useMemo(
    () => ({ records: s.records, leaves: s.leaves, confirmations: s.confirmations, workPolicy: s.settings.workPolicy, holidays: s.holidaySet }),
    [s.records, s.leaves, s.confirmations, s.settings.workPolicy, s.holidaySet]
  );
  const plan = useMemo(() => planPeriod(userId, kind, from.trim(), to.trim(), ctx), [userId, kind, from, to, ctx]);
  const clear = useMemo(() => planPeriodClear(userId, kind, from.trim(), to.trim(), ctx), [userId, kind, from, to, ctx]);
  const addDays = plan.days.filter((d) => !d.skip);
  const skipped = plan.days.filter((d) => d.skip);
  const convertDays = kind === 'TRIP' ? addDays.filter((d) => d.record?.checkIn).length : 0;
  const clearCount = clear.leaveIds.length + clear.tripDeletes.length + clear.tripReverts.length;

  // 연차는 잔여에서 차감되므로 등록 전후 잔여를 보여준다(관리자 등록은 부족해도 진행).
  const annualAfter = useMemo(() => {
    const p = s.profilesById[userId];
    if (kind !== 'ANNUAL' || !p?.hireDate) return null;
    const bal = computeBalance(
      { id: userId, name: p.name, hireDate: p.hireDate, resignDate: p.resignDate, createdAt: '' } as User,
      s.leaves,
      s.adjustments,
      s.settings.leavePolicy,
      undefined,
      { records: s.records, workPolicy: s.settings.workPolicy, holidays: s.holidaySet }
    );
    return { before: bal.remainingHours, after: bal.remainingHours - addDays.length * 8 };
  }, [kind, userId, s.profilesById, s.leaves, s.adjustments, s.settings, s.records, s.holidaySet, addDays.length]);

  function setRange(a: string, b: string) {
    setFrom(a);
    setTo(b);
    setConfirmClear(false);
    setMsg('');
  }

  async function apply() {
    if (plan.error || addDays.length === 0) return;
    setBusy(true);
    setMsg('');
    const r = await s.adminApplyPeriod(userId, kind, plan.days, note.trim() || undefined);
    setBusy(false);
    setMsg(
      r.failed
        ? `${kindLabel(kind)} ${r.saved}일 등록, ${r.failed}일은 저장 실패 — 다시 시도해 주세요.`
        : `✓ ${userName}님 ${kindLabel(kind)} ${r.saved}일 등록했습니다.`
    );
  }

  async function doClear() {
    setBusy(true);
    setMsg('');
    const r = await s.adminClearPeriod(userId, clear);
    setBusy(false);
    setConfirmClear(false);
    setMsg(
      r.failed
        ? `${r.saved}일 취소, ${r.failed}일은 실패 — 다시 시도해 주세요.`
        : `✓ ${kindLabel(kind)} ${r.saved}일을 취소했습니다.`
    );
  }

  return (
    <Card>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', color: t.text }}>📅 기간 등록 <Text style={{ color: t.textFaint, fontWeight: '400', fontSize: 13 }}>(휴가 · 출장)</Text></Text>
          <Text style={{ color: t.primary, fontWeight: '700' }}>{open ? '접기 ▴' : '열기 ▾'}</Text>
        </Row>
      </Pressable>
      {!open ? (
        <Muted size={12}>휴가·출장을 시작일~종료일로 한 번에 등록하거나 취소합니다.</Muted>
      ) : (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <Chip
                key={k}
                label={`${kindIcon(k)} ${kindLabel(k)}`}
                active={kind === k}
                color={kindColor(k)}
                onPress={() => {
                  setKind(k);
                  setConfirmClear(false);
                  setMsg('');
                }}
                small
              />
            ))}
          </Row>
          <Muted size={11} style={{ color: kindColor(kind) }}>
            {kind === 'TRIP'
              ? `종일 출장(인정)으로 등록 — 출근 기록이 없어도 그날 소정근로 ${s.settings.workPolicy.dailyWorkMinutes / 60}시간을 근무로 인정합니다. 이미 출근한 날은 출퇴근 시각을 그대로 두고 출장으로 바꿉니다.`
              : `종일(8h) ${kindLabel(kind)}로 즉시 승인 등록. ${LEAVE_CATEGORY_NOTES[kind]}`}
          </Muted>

          <Row>
            <View style={{ flex: 1 }}>
              <Field label="시작일" value={from} onChangeText={(v) => setRange(v, to)} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="종료일" value={to} onChangeText={(v) => setRange(from, v)} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            </View>
          </Row>
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip label="하루" onPress={() => setRange(from, from)} small />
            <Chip label="+1주" onPress={() => setRange(from, addDaysKey(from, 6))} small />
            <Chip label="+2주" onPress={() => setRange(from, addDaysKey(from, 13))} small />
          </Row>
          <Field
            label={kind === 'TRIP' ? '출장지 · 사유 (선택)' : '사유 (선택)'}
            value={note}
            onChangeText={setNote}
            placeholder={kind === 'TRIP' ? '예: 고객사 현장 설치' : kind === 'PAID' ? '예: 예비군 훈련' : '예: 여름휴가'}
          />

          {plan.error ? (
            <Muted size={12} style={{ color: t.danger }}>{plan.error}</Muted>
          ) : (
            <View style={{ backgroundColor: t.cardAlt, borderRadius: 10, padding: 10, gap: 4 }}>
              <Text style={{ fontWeight: '700', color: t.text, fontSize: 13 }}>
                근무일 {addDays.length}일 등록
                {plan.offDays > 0 ? <Text style={{ color: t.textFaint, fontWeight: '400' }}> · 주말·공휴일 {plan.offDays}일 제외</Text> : null}
              </Text>
              {convertDays > 0 ? <Muted size={12}>그중 {convertDays}일은 이미 출근 기록이 있어 출장으로 바꿉니다.</Muted> : null}
              {skipped.length > 0 ? (
                <Muted size={12}>
                  건너뜀 {skipped.length}일:{' '}
                  {skipped
                    .slice(0, 8)
                    .map((d) => `${d.date.slice(5)}(${d.skip})`)
                    .join(', ')}
                  {skipped.length > 8 ? ` 외 ${skipped.length - 8}일` : ''}
                </Muted>
              ) : null}
              {annualAfter ? (
                <Muted size={12} style={{ color: annualAfter.after < 0 ? t.danger : t.textDim }}>
                  연차 잔여 {hoursToDayLabel(annualAfter.before)} → 등록 후 {hoursToDayLabel(annualAfter.after)}
                  {annualAfter.after < 0 ? ' (잔여 초과 — 관리자 등록이라 그대로 진행됩니다)' : ''}
                </Muted>
              ) : null}
            </View>
          )}

          {msg ? <Muted size={12} style={{ color: msg.startsWith('✓') ? t.success : t.danger }}>{msg}</Muted> : null}

          <Button
            label={`${kindIcon(kind)} ${kindLabel(kind)} ${addDays.length}일 등록`}
            variant={kind === 'TRIP' ? 'trip' : kind === 'PAID' ? 'paid' : kind === 'UNPAID' ? 'unpaid' : 'annual'}
            small
            loading={busy}
            disabled={!!plan.error || addDays.length === 0}
            onPress={apply}
          />

          {!plan.error && (clearCount > 0 || clear.lockedDays > 0) ? (
            confirmClear ? (
              <View style={{ backgroundColor: t.dangerSoft, borderRadius: 10, padding: 10, gap: 6 }}>
                <Text style={{ color: t.danger, fontWeight: '700', fontSize: 13 }}>
                  {from}~{to} 사이 종일 {kindLabel(kind)} {clearCount}일을 지웁니다.
                </Text>
                {clear.tripReverts.length > 0 ? (
                  <Muted size={12}>출근 기록이 있는 {clear.tripReverts.length}일은 기록을 남기고 일반 근무로 되돌립니다.</Muted>
                ) : null}
                <Row>
                  <View style={{ flex: 1 }}>
                    <Button label="취소 확정" variant="danger" small loading={busy} onPress={doClear} />
                  </View>
                  <Button label="그만두기" variant="neutral" small onPress={() => setConfirmClear(false)} />
                </Row>
              </View>
            ) : (
              <>
                {clearCount > 0 ? (
                  <Button label={`이 기간 ${kindLabel(kind)} 취소 (${clearCount}일)`} variant="outline" small onPress={() => setConfirmClear(true)} />
                ) : null}
                {clear.lockedDays > 0 ? (
                  <Muted size={11}>🔒 서명 잠금 주에 든 {clear.lockedDays}일은 취소할 수 없습니다.</Muted>
                ) : null}
              </>
            )
          ) : null}
          <Muted size={11}>반일 휴가·반일 출장은 아래 일별 기록에서 날짜를 눌러 수정하세요.</Muted>
        </>
      )}
    </Card>
  );
}
