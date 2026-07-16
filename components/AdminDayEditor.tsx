import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable } from 'react-native';
import { Card, Button, Field, Chip, Row, Badge, Divider, Muted, Body } from './ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { timeHM, hmToMinutes, minutesToHM, ceilToStep } from '@/lib/time';
import { AttendanceType, LeaveSegment, LeaveUnit } from '@/lib/types';

// 'HH:MM' → 해당 날짜(KST)의 ISO 문자열. 빈값=null(지움), 형식오류=undefined.
function hmToIso(date: string, hm: string): string | null | undefined {
  const s = hm.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh > 23 || mm > 59) return undefined;
  return new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`).toISOString();
}

// 'HH:MM' → 자정 기준 분. 형식 오류면 null.
function parseHM(hm: string): number | null {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

const SEG_LABEL: Record<string, string> = { FULL: '종일', AM: '오전', PM: '오후', CUSTOM: '지정' };

export function AdminDayEditor({
  userId,
  userName,
  date,
  onClose,
}: {
  userId: string;
  userName: string;
  date: string;
  onClose: () => void;
}) {
  const s = useStore();
  const t = useTheme();
  const policy = s.settings.workPolicy;
  const step = policy.clockInStepMinutes || 30;

  const rec = s.records.find((r) => r.userId === userId && r.date === date);
  const dayLeaves = s.leaves.filter((l) => l.userId === userId && l.date === date && l.status === 'APPROVED');
  const dayAways = s.awayLogs.filter((a) => a.userId === userId && a.date === date);

  const [cin, setCin] = useState(rec?.checkIn ? timeHM(Date.parse(rec.checkIn)) : '');
  const [cout, setCout] = useState(rec?.checkOut ? timeHM(Date.parse(rec.checkOut)) : '');
  const [type, setType] = useState<AttendanceType>(rec?.type ?? 'WORK');
  const [aStart, setAStart] = useState('');
  const [aEnd, setAEnd] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setMsg('');
    const inIso = hmToIso(date, cin);
    const outIso = hmToIso(date, cout);
    if (inIso === undefined || outIso === undefined) {
      setMsg('시각 형식은 HH:MM 입니다 (예: 09:00).');
      return;
    }
    if (inIso && outIso && Date.parse(outIso) <= Date.parse(inIso)) {
      setMsg('퇴근이 출근보다 빠릅니다.');
      return;
    }
    setBusy(true);
    const plannedStart = cin.trim() ? minutesToHM(ceilToStep(hmToMinutes(cin.trim()), step)) : undefined;
    await s.adminSaveRecord(userId, date, { checkIn: inIso, checkOut: outIso, plannedStart, type });
    setBusy(false);
    setMsg('✓ 저장되었습니다.');
  }

  async function del() {
    if (!rec) return;
    setBusy(true);
    await s.adminDeleteRecord(rec.id);
    setBusy(false);
    onClose();
  }

  async function addLeave(segment: LeaveSegment, hours: LeaveUnit) {
    setBusy(true);
    await s.adminAddLeave(userId, { date, segment, hours });
    setBusy(false);
    setMsg('✓ 연차가 등록되었습니다.');
  }

  async function delLeave(id: string) {
    setBusy(true);
    await s.adminDeleteLeave(id);
    setBusy(false);
  }

  async function addAway() {
    setMsg('');
    const sMin = parseHM(aStart);
    const eMin = parseHM(aEnd);
    if (sMin == null || eMin == null) {
      setMsg('무단이탈 시각 형식은 HH:MM 입니다.');
      return;
    }
    const minutes = eMin - sMin;
    if (minutes <= 0) {
      setMsg('무단이탈 종료가 시작보다 늦어야 합니다.');
      return;
    }
    setBusy(true);
    await s.adminAddAway(userId, { date, startTime: aStart.trim(), endTime: aEnd.trim(), minutes });
    setBusy(false);
    setAStart('');
    setAEnd('');
    setMsg('✓ 무단이탈이 기록되었습니다.');
  }
  async function delAway(id: string) {
    setBusy(true);
    await s.adminDeleteAway(id);
    setBusy(false);
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}
      >
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 460, alignSelf: 'center', maxHeight: '88%' }}>
          <Card>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Body style={{ fontWeight: '800' }}>{date} · {userName}</Body>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Text style={{ fontSize: 20, color: t.textDim }}>✕</Text>
                </Pressable>
              </Row>
              <Muted size={12}>관리자가 직원 대신 근태를 수정/추가합니다. 시각은 24시간 HH:MM.</Muted>

              <Divider />
              <Text style={{ fontWeight: '700', color: t.text }}>근무기록</Text>
              <Row>
                <Chip label="근무" active={type === 'WORK'} onPress={() => setType('WORK')} small />
                <Chip label="출장" active={type === 'TRIP'} onPress={() => setType('TRIP')} small />
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Field label="출근 (HH:MM)" value={cin} onChangeText={setCin} placeholder="09:00" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="퇴근 (HH:MM)" value={cout} onChangeText={setCout} placeholder="18:00" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                </View>
              </Row>
              <Muted size={11}>시각을 비워두면 해당 값을 지웁니다.</Muted>
              {msg ? (
                <Muted size={12} style={{ color: msg.startsWith('✓') ? t.success : t.danger }}>{msg}</Muted>
              ) : null}
              <Row>
                <View style={{ flex: 1 }}>
                  <Button label={rec ? '기록 저장' : '기록 추가'} variant="primary" small loading={busy} onPress={save} />
                </View>
                {rec ? <Button label="기록 삭제" variant="danger" small onPress={del} /> : null}
              </Row>

              <Divider />
              <Text style={{ fontWeight: '700', color: t.text }}>연차</Text>
              {dayLeaves.length === 0 ? (
                <Muted size={12}>이 날 등록된 연차가 없습니다.</Muted>
              ) : (
                dayLeaves.map((l) => (
                  <Row key={l.id} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Badge text={`${SEG_LABEL[l.segment] || l.segment} ${l.hours}h${l.category === 'PAID' ? ' 유급' : ''}`} color={t.trip} />
                    <Button label="취소" variant="neutral" small onPress={() => delLeave(l.id)} />
                  </Row>
                ))
              )}
              <Muted size={11}>연차 추가 (즉시 승인)</Muted>
              <Row style={{ flexWrap: 'wrap' }}>
                <Chip label="종일 8h" color={t.trip} onPress={() => addLeave('FULL', 8)} small />
                <Chip label="오전 4h" color={t.trip} onPress={() => addLeave('AM', 4)} small />
                <Chip label="오후 4h" color={t.trip} onPress={() => addLeave('PM', 4)} small />
                <Chip label="오전 2h" color={t.trip} onPress={() => addLeave('AM', 2)} small />
                <Chip label="오후 2h" color={t.trip} onPress={() => addLeave('PM', 2)} small />
              </Row>

              <Divider />
              <Text style={{ fontWeight: '700', color: t.text }}>무단이탈 <Text style={{ color: t.textFaint, fontWeight: '400', fontSize: 13 }}>(점수 감점)</Text></Text>
              {dayAways.length === 0 ? (
                <Muted size={12}>기록된 무단이탈이 없습니다.</Muted>
              ) : (
                dayAways.map((a) => (
                  <Row key={a.id} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Badge text={`${a.startTime && a.endTime ? `${a.startTime}~${a.endTime} · ` : ''}${a.minutes}분`} color={t.danger} />
                    <Button label="삭제" variant="neutral" small onPress={() => delAway(a.id)} />
                  </Row>
                ))
              )}
              <Muted size={11}>20분 이상 무통보 임의 이석 시 시간대를 입력하세요(HH:MM). 점수에서 감점되며, 잦을수록 가중됩니다. (근로자 화면에는 표시되지 않음)</Muted>
              <Row style={{ alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <Field label="시작" value={aStart} onChangeText={setAStart} placeholder="14:00" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="종료" value={aEnd} onChangeText={setAEnd} placeholder="14:40" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                </View>
                <Button label="추가" variant="danger" small onPress={addAway} />
              </Row>

              <Divider />
              <Button label="닫기" variant="neutral" small onPress={onClose} />
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
