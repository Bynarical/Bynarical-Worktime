// 재사용 UI 컴포넌트 — 모던/빅테크 디자인 시스템
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { RADIUS, useTheme, Theme } from '@/lib/theme';

export { useTheme } from '@/lib/theme';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820; // 데스크탑/태블릿 가로
  const inner = (
    <View style={{ width: '100%', maxWidth: wide ? 960 : undefined, padding: wide ? 24 : 16, gap: 14, paddingBottom: 56 }}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center' }}>{inner}</View>
      )}
    </SafeAreaView>
  );
}

// 그래디언트 히어로 헤더
export function Hero({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <LinearGradient
      colors={t.hero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: RADIUS.xl, padding: 20, gap: 12, overflow: 'hidden' }, t.shadowMd, style]}
    >
      {children}
    </LinearGradient>
  );
}

export function Card({
  children,
  style,
  elevated = true,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.card,
    borderRadius: RADIUS.lg,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    gap: 12,
    ...(elevated ? t.shadowSm : {}),
  };
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}>
        {children}
      </Pressable>
    );
  return <View style={[base, style]}>{children}</View>;
}

export function Title({ children, style }: { children: React.ReactNode; style?: any }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 24, fontWeight: '800', color: t.text, letterSpacing: -0.5 }, style]}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: t.textFaint, letterSpacing: 0.6, textTransform: 'uppercase' }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Muted({ children, size = 13, style }: { children: React.ReactNode; size?: number; style?: any }) {
  const t = useTheme();
  return <Text style={[{ color: t.textDim, fontSize: size, lineHeight: size * 1.45 }, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: React.ReactNode; style?: any }) {
  const t = useTheme();
  return <Text style={[{ color: t.text, fontSize: 15, lineHeight: 22 }, style]}>{children}</Text>;
}

type BtnVariant = 'primary' | 'success' | 'danger' | 'warning' | 'neutral' | 'trip' | 'outline';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const solid: Record<string, string> = {
    success: t.success,
    danger: t.danger,
    warning: t.warning,
    trip: t.trip,
  };
  const isGradient = variant === 'primary';
  const isOutline = variant === 'outline';
  const isNeutral = variant === 'neutral';
  const fg = isOutline ? t.primary : isNeutral ? t.text : '#fff';
  const solidBg = isNeutral ? t.cardAlt : isOutline ? 'transparent' : solid[variant];

  const base: ViewStyle = {
    paddingVertical: small ? 10 : 15,
    paddingHorizontal: 18,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    overflow: 'hidden',
    borderWidth: isOutline ? 1.5 : 0,
    borderColor: isOutline ? t.borderStrong : undefined,
    backgroundColor: isGradient ? 'transparent' : solidBg,
    ...(isGradient || (!isOutline && !isNeutral) ? t.shadowSm : {}),
  };

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [base, { opacity: disabled ? 0.45 : pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }, style]}
    >
      {isGradient && (
        <LinearGradient colors={t.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      {loading && <ActivityIndicator size="small" color={fg} />}
      {icon && !loading ? <Text style={{ fontSize: small ? 14 : 16 }}>{icon}</Text> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16, letterSpacing: 0.2 }}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  ...rest
}: { label?: string; value: string; onChangeText: (s: string) => void } & TextInputProps) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      {label ? (
        <Text style={{ color: t.textDim, fontSize: 12.5, fontWeight: '600', letterSpacing: 0.2 }}>{label}</Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={t.textFaint}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          backgroundColor: t.dark ? t.cardAlt : t.bg,
          borderWidth: 1.5,
          borderColor: focus ? t.primary : t.border,
          borderRadius: RADIUS.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: t.text,
          fontSize: 15.5,
        }}
        {...rest}
      />
    </View>
  );
}

export function Badge({ text, color, soft }: { text: string; color?: string; soft?: string }) {
  const t = useTheme();
  const c = color || t.textDim;
  return (
    <View
      style={{
        backgroundColor: soft || c + '1f',
        borderRadius: RADIUS.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: c, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 }}>{text}</Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  color,
  small,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  small?: boolean;
}) {
  const t = useTheme();
  const c = color || t.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: small ? 12 : 15,
        paddingVertical: small ? 8 : 10,
        borderRadius: RADIUS.pill,
        backgroundColor: active ? c : t.cardAlt,
        borderWidth: 1,
        borderColor: active ? c : t.border,
        opacity: pressed ? 0.85 : 1,
        ...(active ? t.shadowSm : {}),
      })}
    >
      <Text style={{ color: active ? '#fff' : t.text, fontWeight: '700', fontSize: small ? 13 : 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 2 }} />;
}

export function KV({ k, v, vColor }: { k: string; v: React.ReactNode; vColor?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Text style={{ color: t.textDim, fontSize: 14 }}>{k}</Text>
      <Text style={{ color: vColor || t.text, fontSize: 14.5, fontWeight: '700' }}>{v}</Text>
    </View>
  );
}

export function StatTile({
  label,
  value,
  sub,
  color,
  onHero,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  onHero?: boolean;
}) {
  const t = useTheme();
  const bg = onHero ? 'rgba(255,255,255,0.14)' : t.cardAlt;
  const labelC = onHero ? t.onHeroDim : t.textDim;
  const valueC = color || (onHero ? '#fff' : t.text);
  const subC = onHero ? t.onHeroDim : t.textFaint;
  return (
    <View style={{ flex: 1, minWidth: 92, backgroundColor: bg, borderRadius: RADIUS.md, padding: 13, gap: 3 }}>
      <Text style={{ color: labelC, fontSize: 11.5, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: valueC, fontSize: 19, fontWeight: '800', letterSpacing: -0.4 }}>{value}</Text>
      {sub ? <Text style={{ color: subC, fontSize: 11 }}>{sub}</Text> : null}
    </View>
  );
}

// 그래디언트 진행 바
export function ProgressBar({
  value,
  max,
  color,
  track,
}: {
  value: number;
  max: number;
  color?: [string, string] | string;
  track?: string;
}) {
  const t = useTheme();
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const colors: [string, string] = Array.isArray(color) ? color : color ? [color, color] : t.brand;
  return (
    <View style={{ height: 10, backgroundColor: track || t.cardAlt, borderRadius: RADIUS.pill, overflow: 'hidden' }}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: `${pct * 100}%`, height: '100%', borderRadius: RADIUS.pill }}
      />
    </View>
  );
}

// 원형 진행률 링
export function ProgressRing({
  size = 128,
  stroke = 12,
  progress,
  color,
  track,
  center,
}: {
  size?: number;
  stroke?: number;
  progress: number; // 0..1
  color?: string;
  track?: string;
  center?: React.ReactNode;
}) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track || (t.dark ? '#ffffff22' : '#ffffff40')} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color || '#fff'}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - p)}
          strokeLinecap="round"
        />
      </Svg>
      {center}
    </View>
  );
}

// 설정 등에서 쓰는 리스트 로우
export function ListRow({
  icon,
  label,
  sub,
  right,
  onPress,
}: {
  icon?: string;
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed && onPress ? 0.7 : 1 })}
    >
      {icon ? (
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 17 }}>{icon}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {sub ? <Text style={{ color: t.textFaint, fontSize: 12.5 }}>{sub}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

// 토글 스위치
export function Switch({ value, onValueChange, color }: { value: boolean; onValueChange: (v: boolean) => void; color?: string }) {
  const t = useTheme();
  const on = color || t.primary;
  return (
    <Pressable onPress={() => onValueChange(!value)}>
      <View
        style={{
          width: 52,
          height: 30,
          borderRadius: RADIUS.pill,
          backgroundColor: value ? on : t.borderStrong,
          padding: 3,
          alignItems: value ? 'flex-end' : 'flex-start',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: 24, height: 24, borderRadius: RADIUS.pill, backgroundColor: '#fff', ...t.shadowSm }} />
      </View>
    </Pressable>
  );
}

export type { Theme };
