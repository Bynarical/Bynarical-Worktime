import React from 'react';
import { View, Text } from 'react-native';
import { Card, Row, Body, Muted, Badge, StatTile, Divider } from './ui';
import { useTheme } from '@/lib/theme';
import { AttendanceScore, Grade, SCORE_WEIGHTS } from '@/lib/attendanceScore';

export function gradeColor(t: any, grade: Grade): string {
  return grade === 'S' ? t.trip : grade === 'A' ? t.success : grade === 'B' ? t.primary : grade === 'C' ? t.warning : t.danger;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function DedRow({ label, detail, points }: { label: string; detail?: string; points: number }) {
  const t = useTheme();
  if (points <= 0) return null;
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Muted size={12}>
        {label}
        {detail ? <Text style={{ color: t.textFaint }}> {detail}</Text> : null}
      </Muted>
      <Text style={{ fontSize: 12, fontWeight: '700', color: t.danger }}>-{r1(points)}</Text>
    </Row>
  );
}

export function AttendanceScoreCard({ name, score }: { name: string; score: AttendanceScore }) {
  const t = useTheme();
  const w = SCORE_WEIGHTS;
  const gc = gradeColor(t, score.grade);
  const otH = r1(score.overtimeMinutes / 60);
  const hasData = score.scheduledDays > 0;
  const anyDeduction = score.deductionTotal > 0;

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Body style={{ fontWeight: '800' }}>{name} · {score.year}년 근태 점수</Body>
        {hasData && <Badge text={`${score.grade}등급`} color={gc} />}
      </Row>
      <Row style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ fontSize: 40, fontWeight: '800', color: gc, letterSpacing: -1 }}>{hasData ? score.score : '-'}</Text>
        <Text style={{ fontSize: 14, color: t.textFaint, marginBottom: 7 }}>/ 100점</Text>
        {score.overtimeBonus > 0 ? (
          <Text style={{ fontSize: 13, color: t.success, marginBottom: 8, fontWeight: '700' }}>초과근무 +{r1(score.overtimeBonus)}</Text>
        ) : null}
      </Row>

      {!hasData ? (
        <Muted size={12}>이 해에 집계할 근태 데이터가 없습니다.</Muted>
      ) : (
        <>
          <Row style={{ gap: 8 }}>
            <StatTile label="소정근로" value={`${score.scheduledDays}일`} />
            <StatTile label="정상근무" value={`${score.normalDays}일`} color={t.success} />
            <StatTile label="출근율" value={score.ratePct != null ? `${Math.round(score.ratePct)}%` : '-'} />
          </Row>

          <Divider />
          <Text style={{ fontWeight: '700', color: t.textDim, fontSize: 12.5 }}>가점</Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted size={12}>초과근무 {otH}h</Muted>
            <Text style={{ fontSize: 12, fontWeight: '700', color: score.overtimeBonus > 0 ? t.success : t.textFaint }}>+{r1(score.overtimeBonus)}</Text>
          </Row>

          <Text style={{ fontWeight: '700', color: t.textDim, fontSize: 12.5, marginTop: 4 }}>감점</Text>
          {anyDeduction ? (
            <>
              <DedRow label={`무단결근 ${score.absentDays}일`} points={score.absentDays * w.absentPerDay} />
              <DedRow label={`근로부족 ${score.shortfallDays}회`} detail={`${score.shortfallMinutes}분`} points={(score.shortfallMinutes * w.shortfallPerHour) / 60} />
              <DedRow label={`지각 ${score.lateCount}회`} detail={`${score.lateMinutes}분`} points={(score.lateMinutes * w.latePerHour) / 60} />
              <DedRow label={`조기퇴근 ${score.earlyLeaveCount}회`} detail={`${score.earlyLeaveMinutes}분`} points={(score.earlyLeaveMinutes * w.earlyLeavePerHour) / 60} />
              <DedRow
                label={`무단이탈 ${score.awayCount}건`}
                detail={`${score.awayMinutes}분${score.awayCount > w.awayFreeCount ? ' · 잦음 가중' : ''}`}
                points={(score.awayMinutes * w.awayPerHour) / 60 + Math.max(0, score.awayCount - w.awayFreeCount) * w.awayRepeatPenalty}
              />
              <DedRow label={`코어타임 미충족 ${score.coreViolationCount}회`} points={score.coreViolationCount * w.coreViolation} />
              <DedRow label={`퇴근 미기록 ${score.missingCount}회`} points={score.missingCount * w.missing} />
            </>
          ) : (
            <Muted size={12}>감점 없음 — 성실 근무 👍</Muted>
          )}
          <Muted size={11} style={{ marginTop: 4 }}>
            지각·부족·조기퇴근은 시간(분)에 비례, 무단이탈은 시간 + 잦을수록 가중 감점. 연차·유급휴가는 정상. 100점 = A, 초과근무 가점 시 100 초과(S).
          </Muted>
        </>
      )}
    </Card>
  );
}
