import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

type Toast = { id: string; text: string };

// leaves 테이블 실시간 구독 → 관리자(새 신청) / 직원(내 신청 승인·반려)에게 토스트.
// RLS로 관리자는 전체, 직원은 본인 것만 수신한다.
export function LeaveNotifier() {
  const s = useStore();
  const t = useTheme();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const ref = useRef(s);
  ref.current = s;
  const seq = useRef(0);

  function push(text: string) {
    seq.current += 1;
    const id = `n${seq.current}`;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
  }

  useEffect(() => {
    const sb = supabase;
    if (!sb || !s.authed || !s.user) return;
    const myId = s.user.id;
    const isAdmin = !!s.user.isAdmin;
    const ch = sb
      .channel('leaves-notif')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, (payload: any) => {
        const st = ref.current;
        st.refresh(); // 목록·배지 동기화
        const n = payload.new || {};
        const o = payload.old || {};
        if (payload.eventType === 'INSERT') {
          // 복귀 전(종료 미정) 외출은 아직 확정 전이라 알리지 않음
          if (isAdmin && !(n.segment === 'CUSTOM' && !n.end_time)) {
            const name = st.profilesById[n.user_id]?.name || '직원';
            const kind = n.segment === 'CUSTOM' ? '외출' : '연차';
            push(`🌴 새 ${kind} 신청 · ${name} · ${n.date}`);
          }
        } else if (payload.eventType === 'UPDATE' && n.user_id === myId) {
          const wasRequested = o?.status === 'REQUESTED' || o?.status === undefined;
          if (wasRequested && (n.status === 'APPROVED' || n.status === 'REJECTED')) {
            push(`${n.date} 연차가 ${n.status === 'APPROVED' ? '승인되었습니다 ✅' : '반려되었습니다'}`);
          }
        }
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.authed, s.user?.id]);

  if (toasts.length === 0) return null;
  return (
    <View
      style={{ position: 'absolute', top: 44, left: 0, right: 0, alignItems: 'center', gap: 8, zIndex: 9999 }}
      pointerEvents="box-none"
    >
      {toasts.map((x) => (
        <Pressable
          key={x.id}
          onPress={() => setToasts((prev) => prev.filter((y) => y.id !== x.id))}
          style={{
            maxWidth: 440,
            width: '92%',
            backgroundColor: t.card,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: t.borderStrong,
            ...t.shadowSm,
          }}
        >
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 13.5 }}>{x.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}
