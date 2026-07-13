import 'react-native-gesture-handler';
import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StoreProvider, useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

function Gate() {
  const { ready, authed, user } = useStore();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  const isAdmin = !!user?.isAdmin;

  React.useEffect(() => {
    if (!ready) return;
    const group = segments[0]; // '(auth)' | '(tabs)' | '(admin)' | undefined
    if (!authed) {
      if (group !== '(auth)') router.replace('/(auth)/login');
      return;
    }
    // 로그인 상태: 관리자는 전용 콘솔, 일반 직원은 탭 화면으로 고정
    if (isAdmin) {
      if (group !== '(admin)') router.replace('/(admin)');
    } else {
      if (group !== '(tabs)') router.replace('/(tabs)');
    }
  }, [ready, authed, isAdmin, segments]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    );
  }
  return <Slot />;
}

// 웹: 모던 한글 웹폰트(Pretendard) 전역 적용. RN Web가 각 텍스트에 font-family를 지정하므로 !important로 덮어씀.
function useWebFont() {
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('pretendard-font')) return;
    const link = document.createElement('link');
    link.id = 'pretendard-font';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
    document.head.appendChild(link);

    const stack =
      '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", Roboto, "Helvetica Neue", Arial, sans-serif';
    const style = document.createElement('style');
    style.id = 'pretendard-style';
    style.textContent = `
      html, body, #root, input, textarea, button, select, div, span, p, a, label, [class*="css-"] {
        font-family: ${stack} !important;
      }
      body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
    `;
    document.head.appendChild(style);
  }, []);
}

export default function RootLayout() {
  const t = useTheme();
  useWebFont();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <StatusBar style={t.dark ? 'light' : 'dark'} />
          <Gate />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
