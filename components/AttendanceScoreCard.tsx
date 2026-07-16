import React from 'react';
import { View, Text } from 'react-native';
import { Card, Row, Body, Muted, Badge, StatTile, Divider } from './ui';
import { useTheme } from '@/lib/theme';
import { AttendanceScore, Grade, SCORE_WEIGHTS } from '@/lib/attendanceScore';

export function gradeColor(t: any, grade: Grade): string {
  return grade === 'S' ? t.trip : grade === 'A' ? t.success : grade === 'B' ? t.primary : grade === 'C' ? t.warning : t.danger;
}

function DedLine({ label, count, unit, points }: { label: string; count: number; unit: string; points: number }) {
  const t = useTheme();
  if (count <= 0) return null;
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Muted size={12}>{label} {count}{unit}</Muted>
      <Text style={{ fontSize: 12, fontWeight: '700', color: t.danger }}>-{points}</Text>
    </Row>
  );
}

export function AttendanceScoreCard({ name, score }: { name: string; score: AttendanceScore }) {
  const t = useTheme();
  const w = SCORE_WEIGHTS;
  const gc = gradeColor(t, score.grade);
  const otH = Math.round((score.overtimeMinutes / 60) * 10) / 10;
  const anyDeduction =
    score.absentDays || score.shortfallDays || score.coreViolationCount || score.lateCount || score.earlyLeaveCount || score.missingCount;

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Body style={{ fontWeight: '800' }}>{name} · {score.year}년 근태 점수</Body>
        <Badge text={`${score.grade}등급`} color={gc} />
      </Row>
      <Row style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ fontSize: 40, fontWeight: '800', color: gc, letterSpacing: -1 }}>{score.scheduledDays > 0 ? score.score : '-'}</Text>
        <Text style={{ fontSize: 14, color: t.textFaint, marginBottom: 7 }}>/ 100점</Text>
        {score.overtimeBonus > 0 ? (
          <Text style={{ fontSize: 13, color: t.success, marginBottom: 8, fontWeight: '700' }}>초과근무 +{score.overtimeBonus}</Text>
        ) : null}
      </Row>

      <Row style={{ gap: 8 }}>
        <StatTile label="소정근로" value={`${score.scheduledDays}일`} />
        <StatTile label="정상근무" value={`${score.normalDays}일`} color={t.success} />
        <StatTile label="출근율" value={score.ratePct != null ? `${Math.round(score.ratePct)}%` : '-'} />
      </Row>

      <Divider />
      <Text style={{ fontWeight: '700', color: t.textDim, fontSize: 12.5 }}>가점</Text>
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted size={12}>초과근무 {otH}h</Muted>
        <Text style={{ fontSize: 12, fontWeight: '700', color: score.overtimeBonus > 0 ? t.success : t.textFaint }}>+{score.overtimeBonus}</Text>
      </Row>

      <Text style={{ fontWeight: '700', color: t.textDim, fontSize: 12.5, marginTop: 4 }}>감점</Text>
      {anyDeduction ? (
        <>
          <DedLine label="무단결근" count={score.absentDays} unit="일" points={score.absentDays * w.absent} />
          <DedLine label="근로부족" count={score.shortfallDays} unit="일" points={score.shortfallDays * w.shortfall} />
          <DedLine label="코어타임 미충족" count={score.coreViolationCount} unit="회" points={score.coreViolationCount * w.coreViolation} />
          <DedLine label="지각" count={score.lateCount} unit="회" points={score.lateCount * w.late} />
          <DedLine label="조기퇴근" count={score.earlyLeaveCount} unit="회" points={score.earlyLeaveCount * w.earlyLeave} />
          <DedLine label="퇴근 미기록" count={score.missingCount} unit="회" points={score.missingCount * w.missing} />
        </>
      ) : (
        <Muted size={12}>감점 없음 — 성실 근무 👍</Muted>
      )}
      <Muted size={11} style={{ marginTop: 4 }}>연차·유급휴가는 정상으로 처리됩니다. 초과근무 8시간당 +1점(상한 +{w.overtimeCap}).</Muted>
    </Card>
  );
}
