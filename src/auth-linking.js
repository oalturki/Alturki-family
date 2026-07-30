// auth-linking.js
// منطق ربط حساب الدخول (بعد Email OTP) بسجل العضو في members
// يُستخدم في تطبيق alturki.family (React + Supabase)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xvbilckeuihurozfshzg.supabase.co',
  'YOUR_PUBLISHABLE_KEY' // من Supabase Dashboard → Settings → API
);

// ============================================================
// 1) إرسال رمز الدخول للإيميل
// ============================================================
export async function sendLoginCode(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
  return true; // تحقق الرمز بالبريد
}

// ============================================================
// 2) تأكيد الرمز الذي وصل بالبريد
// ============================================================
export async function verifyLoginCode(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) throw error;
  return data.user; // يحتوي user.id (auth_user_id)
}

// ============================================================
// 3) بعد الدخول: هل هذا المستخدم مربوط بعضو أصلاً؟
// ============================================================
export async function getLinkedMember() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('member_accounts')
    .select('member_id, members(*)')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data?.members ?? null; // null يعني: أول دخول، محتاج ربط
}

// ============================================================
// 4) أول دخول: يحاول يلاقي تطابق تلقائي برقم الجوال
// ============================================================
export async function tryAutoLinkByPhone(phone) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('غير مسجّل دخول');

  // ابحث عن عضو غير مربوط بحساب آخر، بنفس رقم الجوال
  const { data: candidate, error: searchErr } = await supabase
    .from('members')
    .select('id, first_name, phone')
    .eq('phone', phone)
    .is('user_account_id', null)
    .maybeSingle();

  if (searchErr) throw searchErr;

  if (candidate) {
    // تطابق موجود → اربط فورًا
    const { error: linkErr } = await supabase
      .from('member_accounts')
      .insert({ auth_user_id: user.id, member_id: candidate.id, linked_via: 'email_otp' });
    if (linkErr) throw linkErr;

    await supabase
      .from('members')
      .update({ user_account_id: user.id })
      .eq('id', candidate.id);

    return { status: 'linked', member: candidate };
  }

  return { status: 'no_match' }; // العضو يحتاج يقدّم طلب انضمام يدوي
}

// ============================================================
// 5) ما فيه تطابق تلقائي → قدّم طلب انضمام (بانتظار موافقة مشرف)
// ============================================================
export async function submitJoinRequest({ phone, email, fullName, region }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('غير مسجّل دخول');

  const { error } = await supabase.from('join_requests').insert({
    auth_user_id: user.id,
    phone,
    email,
    claimed_full_name: fullName,
    claimed_region: region,
  });
  if (error) throw error;
  return true;
}

// ============================================================
// مثال تدفق كامل (React component pseudo-code):
// ============================================================
//
// 1. sendLoginCode(email) → المستخدم يستلم الرمز
// 2. verifyLoginCode(email, token) → دخول ناجح
// 3. const member = await getLinkedMember()
//    - لو موجود → روح للصفحة الرئيسية، عرّفه بنفسه
//    - لو null:
//        const result = await tryAutoLinkByPhone(enteredPhone)
//        - status === 'linked' → روح للصفحة الرئيسية
//        - status === 'no_match' → اعرض فورم "قدّم طلب انضمام"
//          submitJoinRequest({...}) → "طلبك قيد المراجعة من المشرف"
