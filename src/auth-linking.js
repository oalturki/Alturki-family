// auth-linking.js
// منطق التسجيل والدخول لتطبيق alturki.family
// التصميم: الجوال يثبت عضوية العائلة (مرة واحدة عند التسجيل)
//          البريد + كلمة المرور طريقة دخول احتياطية دائمة
//          Passkeys (بصمة/وجه) طريقة الدخول السريعة المفضّلة بعد أول تسجيل

import { supabase } from './supabaseClient';

// ============================================================
// 1) التحقق: هل رقم الجوال موجود بقائمة العائلة وغير مربوط بعد؟
// ============================================================
export async function checkPhoneEligibility(phone) {
  const { data, error } = await supabase
    .from('members')
    .select('id, first_name, phone, user_account_id')
    .eq('phone', phone)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { status: 'not_found' };
  if (data.user_account_id) return { status: 'already_claimed' };
  return { status: 'eligible', member: data };
}

// ============================================================
// 2) إنشاء حساب جديد ببريد + كلمة مرور
//    (الحساب يُنشأ ويُفعّل فورًا لأن Confirm email معطّل عمدًا)
// ============================================================
export async function registerAccount(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

// ============================================================
// 3) طلب إرسال رمز تحقق للجوال (بحد أقصى 5 محاولات لكل رقم)
// ============================================================
export async function requestPhoneVerification(phone) {
  // تحقق من الحد عبر دالة آمنة بقاعدة البيانات (RPC)
  const { data: allowed, error: rpcErr } = await supabase.rpc(
    'check_and_increment_phone_attempts',
    { p_phone: phone }
  );
  if (rpcErr) throw rpcErr;
  if (!allowed) {
    throw new Error('تجاوزت الحد المسموح لمحاولات إرسال رمز التحقق لهذا الرقم (5 محاولات).');
  }

  // ربط رقم الجوال بالحساب الحالي وإرسال رمز تحقق له
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) throw error;
  return true;
}

// ============================================================
// 4) تأكيد رمز التحقق المرسل للجوال
// ============================================================
export async function confirmPhoneVerification(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'phone_change',
  });
  if (error) throw error;
  return data.user;
}

// ============================================================
// 5) ربط الحساب المُتحقق منه بملف العضو بجدول members
//    (يُستدعى فقط بعد نجاح تأكيد رمز الجوال)
// ============================================================
export async function linkAccountToMember(memberId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('غير مسجّل دخول');

  const { error: linkErr } = await supabase
    .from('member_accounts')
    .insert({ auth_user_id: user.id, member_id: memberId, linked_via: 'phone_otp' });
  if (linkErr) throw linkErr;

  const { error: updateErr } = await supabase
    .from('members')
    .update({ user_account_id: user.id })
    .eq('id', memberId);
  if (updateErr) throw updateErr;

  return true;
}

// ============================================================
// 6) بعد الدخول: هل هذا المستخدم مربوط بعضو أصلاً؟
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
  return data?.members ?? null;
}

// ============================================================
// 7) تسجيل الدخول ببريد + كلمة مرور (الطريقة الاحتياطية الدائمة)
// ============================================================
export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

// ============================================================
// 8) استعادة كلمة المرور
// ============================================================
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  // ملاحظة: Supabase لا يفصح إن كان البريد موجودًا أو مؤكدًا لأسباب أمنية،
  // فالرسالة العامة "تحقق من بريدك" تظهر دائمًا بغض النظر عن الحالة الفعلية.
  if (error) throw error;
  return true;
}

// ============================================================
// 9) Passkeys — تسجيل بصمة/وجه جديدة للحساب الحالي
// ============================================================
export async function registerPasskey() {
  const { data, error } = await supabase.auth.registerPasskey();
  if (error) throw error;
  return data;
}

// ============================================================
// 10) Passkeys — تسجيل الدخول ببصمة/وجه (بدون بريد أو رقم مسبق)
// ============================================================
export async function signInWithPasskey() {
  const { data, error } = await supabase.auth.signInWithPasskey();
  if (error) throw error;
  return data.user;
}

// ============================================================
// مثال تدفق التسجيل الكامل (React component pseudo-code):
// ============================================================
//
// 1. checkPhoneEligibility(phone)
//    - not_found / already_claimed → اعرض رسالة خطأ مناسبة
//    - eligible → تابع للخطوة 2
// 2. registerAccount(email, password) → حساب مُنشأ ومفعّل فورًا
// 3. requestPhoneVerification(phone) → إرسال رمز (أو خطأ تجاوز الحد)
// 4. confirmPhoneVerification(phone, token) → تأكيد الرمز
// 5. linkAccountToMember(member.id) → الملف صار مربوطًا بالحساب
// 6. (اختياري) registerPasskey() → لتفعيل الدخول السريع بالبصمة لاحقًا
// 7. روح للصفحة الرئيسية
//
// تدفق الدخول اللاحق:
// - جرب signInWithPasskey() أولًا (زر "دخول سريع")
// - أو signInWithPassword(email, password) كبديل دائم
