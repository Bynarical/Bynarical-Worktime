// 디자인 시스템 — 라이트/다크 팔레트 + 토큰(그래디언트/그림자/radius/타이포)
//
// ⚠ 색 코딩 규칙(2026-08 재정비) — 의미가 다른 것은 색상(hue)도 반드시 다르게.
//   근무 상태  : success 초록 = 정상 근무·충족 / danger 빨강 = 이상(지각·부족·미기록·결근)
//                warning 주황 = 대기·주의(승인 대기, 근무지 밖 등)
//   휴가        : leaveAnnual 보라 = 연차 / leavePaid 파랑 = 유급휴가 / leaveUnpaid 회색 = 무급휴가
//                → 유급휴가를 초록으로 쓰면 "정상 근무"와 헷갈리므로 절대 초록 계열을 쓰지 않는다.
//   출장        : trip 청록 = 출장(근무의 한 형태라 초록 인접, 대신 ✈ 아이콘으로 구분)
//   primary/accent(인디고·바이올렛)는 브랜드·UI 강조 전용 — 데이터 상태 색으로 쓰지 않는다.
//   화면에서 색을 직접 고르지 말고 lib/palette.ts 의 tone 헬퍼를 쓸 것(단일 출처).
import { useColorScheme, ViewStyle } from 'react-native';

export interface Theme {
  dark: boolean;
  // 배경/표면
  bg: string;
  bgElevated: string;
  card: string;
  cardAlt: string;
  glass: string; // 반투명 오버레이 카드
  border: string;
  borderStrong: string;
  // 텍스트
  text: string;
  textDim: string;
  textFaint: string;
  // 강조
  primary: string;
  primaryText: string;
  primarySoft: string;
  accent: string;
  // 시맨틱
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  // 휴가 계열 (근무 상태 색과 분리)
  leaveAnnual: string; // 연차
  leaveAnnualSoft: string;
  leavePaid: string; // 유급휴가(예비군·공가·경조사 등)
  leavePaidSoft: string;
  leaveUnpaid: string; // 무급휴가
  leaveUnpaidSoft: string;
  trip: string; // 출장
  tripSoft: string;
  // 그래디언트
  brand: [string, string];
  hero: [string, string, string];
  onHero: string; // 그래디언트 위 텍스트
  onHeroDim: string;
  // 그림자
  shadowSm: ViewStyle;
  shadowMd: ViewStyle;
  shadowLg: ViewStyle;
}

// 반경/여백 토큰
export const RADIUS = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const SPACE = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28 } as const;

function shadow(color: string, opacity: number, radius: number, y: number, elevation: number): ViewStyle {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: y },
    elevation,
  };
}

const light: Theme = {
  dark: false,
  bg: '#f4f5f8',
  bgElevated: '#ffffff',
  card: '#ffffff',
  cardAlt: '#f1f2f6',
  glass: 'rgba(255,255,255,0.72)',
  border: '#e9ebef',
  borderStrong: '#d7dae0',
  text: '#0b0c11',
  textDim: '#5a616e',
  textFaint: '#9aa0ac',
  primary: '#4f46e5',
  primaryText: '#ffffff',
  primarySoft: '#ecedfe',
  accent: '#7c3aed',
  success: '#0ea05a',
  successSoft: '#e4f6ec',
  danger: '#e11d48',
  dangerSoft: '#fde8ec',
  warning: '#c2660a',
  warningSoft: '#fbf0e0',
  leaveAnnual: '#7c3aed',
  leaveAnnualSoft: '#f0eafe',
  leavePaid: '#0369a1',
  leavePaidSoft: '#e0f2fe',
  leaveUnpaid: '#5b6472',
  leaveUnpaidSoft: '#eceff3',
  trip: '#0f766e',
  tripSoft: '#dcf5f1',
  brand: ['#4f46e5', '#7c3aed'],
  hero: ['#4f46e5', '#6d28d9', '#7c3aed'],
  onHero: '#ffffff',
  onHeroDim: 'rgba(255,255,255,0.78)',
  shadowSm: shadow('#1a1f36', 0.06, 8, 2, 2),
  shadowMd: shadow('#1a1f36', 0.1, 20, 8, 6),
  shadowLg: shadow('#1a1f36', 0.16, 36, 16, 12),
};

const dark: Theme = {
  dark: true,
  bg: '#070709',
  bgElevated: '#101017',
  card: '#121219',
  cardAlt: '#1b1c25',
  glass: 'rgba(20,20,28,0.6)',
  border: '#25262f',
  borderStrong: '#33343f',
  text: '#f3f4f7',
  textDim: '#9ea3b0',
  textFaint: '#666a76',
  primary: '#7c78ff',
  primaryText: '#ffffff',
  primarySoft: '#191a2e',
  accent: '#a78bfa',
  success: '#22c55e',
  successSoft: '#0e2318',
  danger: '#fb7185',
  dangerSoft: '#2a1420',
  warning: '#fbbf24',
  warningSoft: '#2a1f0b',
  leaveAnnual: '#a78bfa',
  leaveAnnualSoft: '#1d1830',
  leavePaid: '#38bdf8',
  leavePaidSoft: '#0a2130',
  leaveUnpaid: '#94a3b8',
  leaveUnpaidSoft: '#1b1f27',
  trip: '#2dd4bf',
  tripSoft: '#08211f',
  brand: ['#6d5efc', '#9333ea'],
  hero: ['#4f46e5', '#6d28d9', '#7e22ce'],
  onHero: '#ffffff',
  onHeroDim: 'rgba(255,255,255,0.82)',
  shadowSm: shadow('#000000', 0.4, 8, 2, 2),
  shadowMd: shadow('#000000', 0.5, 22, 10, 6),
  shadowLg: shadow('#000000', 0.6, 40, 18, 12),
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}
