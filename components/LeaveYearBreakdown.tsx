import React from 'react';
import { View, Text } from 'react-native';
import { Card, Muted, Body, Badge, Row, Divider } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { LeaveYearBucket, hoursToDayLabel } from '@/lib/leave';

// 연차 연도별(버킷) 내역. 직원 본인 화면과 관리자 직원 상세에서 공용.
export function LeaveYearBreakdown({
  buckets,
  fullDay,
  title = '연차 연도별 내역',
}: {
  buckets: LeaveYearBucket[];
  fullDay: number;
  title?: string;
}) {
  const t = useTheme();
  const ordered = [...buckets].sort((a, b) => b.index - a.index); // 최신 연차년도 먼저
  return (
    <Card>
      <Text style={{ fontWeight: '700', color: t.text }}>{title}</Text>
      <Muted size={12}>입사일 기준 1년 단위로 관리됩니다. 사용은 그 날짜가 속한 연차년도에서 차감되고, 미사용분은 소멸일에 사라집니다.</Muted>
      {ordered.map((b) => {
        const expired = b.status === 'expired';
        const unusedExpired = expired ? Math.max(0, b.grantedHours - b.usedHours) : 0;
        return (
          <View key={b.key} style={{ gap: 4 }}>
            <Divider />
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Body style={{ fontWeight: '700', color: expired ? t.textFaint : t.text }}>{b.label}</Body>
              {b.status === 'active' ? (
                <Badge text="사용 중" color={t.success} />
              ) : expired ? (
                <Badge text="소멸" color={t.textFaint} />
              ) : (
                <Badge text="예정" color={t.textDim} />
              )}
            </Row>
            <Muted size={11}>유효기간 {b.start} ~ {b.lastValidDate}</Muted>
            {b.attendance && (
              <Muted size={11} style={{ color: b.attendance.downgraded ? t.danger : t.textDim }}>
                {b.attendance.judged
                  ? `자격연도 출근율 ${b.attendance.ratePct?.toFixed(0)}% (${b.attendance.attended}/${b.attendance.scheduled}일)` +
                    (b.attendance.downgraded ? ` · 80% 미달 → ${b.attendance.fullDays}일 대신 개근월 ${Math.round(b.grantedHours / fullDay)}일` : ' · 80% 충족')
                  : '출근율 판정 데이터 부족 → 충족 간주(전액 발생)'}
              </Muted>
            )}
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              <Mini k="발생" v={hoursToDayLabel(b.grantedHours, fullDay)} />
              <Mini k="사용" v={hoursToDayLabel(b.usedHours, fullDay)} />
              {b.pendingHours > 0 && <Mini k="대기" v={hoursToDayLabel(b.pendingHours, fullDay)} />}
              {expired ? (
                <Mini k="소멸" v={hoursToDayLabel(unusedExpired, fullDay)} color={unusedExpired > 0 ? t.danger : t.textFaint} />
              ) : (
                <Mini k="잔여" v={hoursToDayLabel(b.remainingHours, fullDay)} color={b.remainingHours < 0 ? t.danger : t.trip} />
              )}
            </Row>
          </View>
        );
      })}
    </Card>
  );
}

function Mini({ k, v, color }: { k: string; v: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ fontSize: 11, color: t.textDim }}>{k}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: color || t.text }}>{v}</Text>
    </View>
  );
}
