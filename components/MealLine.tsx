import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '@/lib/theme';
import { minutesToKor } from '@/lib/time';
import { DayComputation } from '@/lib/attendance';
import { MealAllowance } from '@/lib/types';

// 그날 쓴 야근식대 한 줄 — 달력 상세와 목록 카드가 같이 쓴다.
// 초과근무가 없는 날에 식대가 올라와 있으면 주황으로 짚어 준다(야근 대체 명목이므로).
export function MealLine({ meal, comp }: { meal: MealAllowance; comp: DayComputation }) {
  const t = useTheme();
  const overtime = comp.diffMinutes > 0 ? comp.diffMinutes : 0;
  const odd = overtime <= 0;
  return (
    <View
      style={{
        backgroundColor: odd ? t.warningSoft : t.cardAlt,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
        gap: 2,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.text }}>🍚 야근식대</Text>
      <Text style={{ fontSize: 11, color: odd ? t.warning : t.textDim }}>
        {odd ? '이날 초과근무 없음 — 확인 필요' : `초과근무 ${minutesToKor(overtime)}`}
        {meal.note ? ` · ${meal.note}` : ''}
      </Text>
    </View>
  );
}
