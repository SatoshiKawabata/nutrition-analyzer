import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error('Supabase 接続情報が未設定です。VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false
  }
});
