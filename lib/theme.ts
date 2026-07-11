// 라이트/다크 테마 팔레트 (useColorScheme 기반)
import { useColorScheme } from 'react-native';
import { COLORS } from './config';

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  success: string;
  danger: string;
  warning: string;
  trip: string;
  accentSoft: string;
}

const light: Theme = {
  dark: false,
  bg: COLORS.gray50,
  card: COLORS.white,
  cardAlt: COLORS.gray100,
  border: COLORS.gray200,
  text: COLORS.gray900,
  textDim: COLORS.gray600,
  textFaint: COLORS.gray400,
  primary: COLORS.primary,
  primaryText: COLORS.white,
  success: COLORS.success,
  danger: COLORS.danger,
  warning: COLORS.warning,
  trip: COLORS.tripMode,
  accentSoft: '#eff6ff',
};

const dark: Theme = {
  dark: true,
  bg: '#0b1220',
  card: '#111827',
  cardAlt: '#1f2937',
  border: '#273244',
  text: '#f3f4f6',
  textDim: '#9ca3af',
  textFaint: '#6b7280',
  primary: '#3b82f6',
  primaryText: '#ffffff',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  trip: '#a78bfa',
  accentSoft: '#172554',
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}
