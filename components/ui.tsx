// 재사용 UI 컴포넌트 (테마 대응)
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const t = useTheme();
  const inner = <View style={{ padding: 16, gap: 12, paddingBottom: 48 }}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.card,
          borderRadius: 16,
          padding: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.border,
          gap: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 20, fontWeight: '800', color: t.text }}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: t.textDim }}>{children}</Text>
      {right}
    </View>
  );
}

export function Muted({ children, size = 13 }: { children: React.ReactNode; size?: number }) {
  const t = useTheme();
  return <Text style={{ color: t.textDim, fontSize: size }}>{children}</Text>;
}

export function Body({ children, style }: { children: React.ReactNode; style?: any }) {
  const t = useTheme();
  return <Text style={[{ color: t.text, fontSize: 15 }, style]}>{children}</Text>;
}

type BtnVariant = 'primary' | 'success' | 'danger' | 'warning' | 'neutral' | 'trip' | 'outline';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const map: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: t.primary, fg: t.primaryText },
    success: { bg: t.success, fg: '#fff' },
    danger: { bg: t.danger, fg: '#fff' },
    warning: { bg: t.warning, fg: '#fff' },
    trip: { bg: t.trip, fg: '#fff' },
    neutral: { bg: t.cardAlt, fg: t.text },
    outline: { bg: 'transparent', fg: t.primary, border: t.primary },
  };
  const c = map[variant];
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: c.bg,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          paddingVertical: small ? 9 : 14,
          paddingHorizontal: 16,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: c.border ? 1.5 : 0,
          borderColor: c.border,
          flexDirection: 'row',
          gap: 8,
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={c.fg} />}
      <Text style={{ color: c.fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{label}</Text>
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
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: t.textDim, fontSize: 13, fontWeight: '600' }}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={t.textFaint}
        style={{
          backgroundColor: t.bg,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 11,
          color: t.text,
          fontSize: 15,
        }}
        {...rest}
      />
    </View>
  );
}

export function Badge({ text, color }: { text: string; color?: string }) {
  const t = useTheme();
  const c = color || t.textDim;
  return (
    <View
      style={{
        backgroundColor: c + '22',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: c, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  const t = useTheme();
  const c = color || t.primary;
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? c : t.cardAlt,
        borderWidth: 1,
        borderColor: active ? c : t.border,
      }}
    >
      <Text style={{ color: active ? '#fff' : t.text, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 4 }} />;
}

export function KV({ k, v, vColor }: { k: string; v: React.ReactNode; vColor?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
      <Text style={{ color: t.textDim, fontSize: 14 }}>{k}</Text>
      <Text style={{ color: vColor || t.text, fontSize: 14, fontWeight: '600' }}>{v}</Text>
    </View>
  );
}

export function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 90,
        backgroundColor: t.cardAlt,
        borderRadius: 12,
        padding: 12,
        gap: 2,
      }}
    >
      <Text style={{ color: t.textDim, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: color || t.text, fontSize: 18, fontWeight: '800' }}>{value}</Text>
      {sub ? <Text style={{ color: t.textFaint, fontSize: 11 }}>{sub}</Text> : null}
    </View>
  );
}
