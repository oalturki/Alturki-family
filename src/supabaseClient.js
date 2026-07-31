// supabaseClient.js
// عميل Supabase الموحّد المستخدم بكل أنحاء التطبيق (App.jsx, AuthGate.jsx, auth-linking.js)
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://xvbilckeuihurozfshzg.supabase.co',
  'sb_publishable_iS95LUZ314blsxh15oP4BA_jxIYhm8l',
  {
    auth: {
      // مطلوب لتفعيل Passkeys (ميزة تجريبية بيتا من Supabase)
      experimental: { passkey: true },
    },
  }
);