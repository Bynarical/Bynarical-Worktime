// Supabase 클라이언트. 설정 전(키 없음)에는 null 을 반환해 앱이 로컬 모드로 계속 동작.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './supabaseConfig';

let client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = client;
export { isSupabaseConfigured };
