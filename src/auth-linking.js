// auth-linking.js
// منطق التسجيل والدخول لتطبيق alturki.family
// التصميم: الجوال يثبت عضوية العائلة (مرة واحدة عند التسجيل)
//          البريد + كلمة المرور طريقة دخول احتياطية دائمة
//          Passkeys (بصمة/وجه) طريقة الدخول السريعة المفضّلة بعد أول تسجيل

import { supabase } from './supabaseClient';

// ============================================================
// أداة مساعدة: تحويل رقم جوال سعودي لصيغة +966 القياسية
// تقبل: 0555466973 أو 555466973 أو +966555466973 وتُرجع دائمًا +966555466973
// ============================================================
function normalizeSaudiPhone(phone) {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, ''); // إزالة أي رموز غير أرقام
  if (phone.startsWith('+966')) return '+966' + digits.slice(3);
  if (digits.startsWith('966')) return '+' + digits;
  if (digits.startsWith('0')) return '+966' + digits.slice(1);
  return '+966' + digits; // بدون صفر ولا رمز دولة
}

// ============================================================
// 1) التحقق: هل رقم الجوال موجود بقائمة العائلة وغير مربوط بعد؟
//    (يستخدم دالة RPC آمنة بدل قراءة جدول members مباشرة،
//     لأن الزائر غير المسجّل (anon) ما له صلاحية قراءة من members)
// ============================================================
export async function checkPhoneEligibility(phone) {
  const normalizedPhone = normalizeSaudiPhone(phone);

  const { data, error } = await supabase.rpc('find_member_by_phone', {
    p_phone: normalizedPhone,
  });

  if (error) throw error;
  if (!data || data.length === 0) return { status: 'not_found' };

  const member = data[0];
  if (member.is_claimed) return { status: 'already_claimed' };

  return {
    status: 'eligible',
    member: { id: member.member_id, first_name: member.first_name },
  };
}

// ============================================================
// أداة مساعدة: تحويل رسائل خطأ Supabase الإنجليزية العامة
// لرسائل عربية دقيقة توضح المشكلة الفعلية للمستخدم
// ============================================================
function translateAuthError(error) {
  const msg = (error?.message || '').toLowerCase();

  if (msg.includes('already registered') || msg.includes('already exists') || error?.code === 'user_already_exists') {
    return new Error('هذا البريد الإلكتروني مسجّل مسبقًا بحساب آخر. جرّب تسجيل الدخول بدل التسجيل، أو استخدم بريدًا مختلفًا.');
  }
  if (msg.includes('password') && (msg.includes('short') || msg.includes('at least') || msg.includes('weak'))) {
    return new Error('كلمة المرور قصيرة جدًا. لازم تكون 6 أحرف على الأقل.');
  }
  if (msg.includes('invalid') && msg.includes('email')) {
    return new Error('صيغة البريد الإلكتروني غير صحيحة.');
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return new Error('محاولات كثيرة بوقت قصير. انتظر قليلًا وحاول مرة ثانية.');
  }
  if (msg.includes('phone') && msg.includes('already')) {
    return new Error('رقم الجوال هذا مسجّل مسبقًا بحساب آخر.');
  }
  // أي خطأ غير متوقع: نعرض رسالة Supabase الأصلية بدل إخفائها بالكامل
  return new Error(`تعذّر إتمام العملية: ${error?.message || 'خطأ غير معروف'}`);
}

// ============================================================
// 2) إنشاء حساب جديد ببريد + كلمة مرور
//    (الحساب يُنشأ ويُفعّل فورًا لأن Confirm email معطّل عمدًا)
// ============================================================
export async function registerAccount(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw translateAuthError(error);
  return data.user;
}

// ============================================================
// 3) طلب إرسال رمز تحقق للجوال (بحد أقصى 5 محاولات لكل رقم)
// ============================================================
export async function requestPhoneVerification(phone) {
  const normalizedPhone = normalizeSaudiPhone(phone);

  // تحقق من الحد عبر دالة آمنة بقاعدة البيانات (RPC)
  const { data: allowed, error: rpcErr } = await supabase.rpc(
    'check_and_increment_phone_attempts',
    { p_phone: normalizedPhone }
  );
  if (rpcErr) throw translateAuthError(rpcErr);
  if (!allowed) {
    throw new Error('تجاوزت الحد المسموح لمحاولات إرسال رمز التحقق لهذا الرقم (5 محاولات).');
  }

  // ربط رقم الجوال بالحساب الحالي وإرسال رمز تحقق له
  const { error } = await supabase.auth.updateUser({ phone: normalizedPhone });
  if (error) throw translateAuthError(error);
  return true;
}

// ============================================================
// 4) تأكيد رمز التحقق المرسل للجوال
// ============================================================
export async function confirmPhoneVerification(phone, token) {
  const normalizedPhone = normalizeSaudiPhone(phone);

  const { data, error } = await supabase.auth.verifyOtp({
    phone: normalizedPhone,
    token,
    type: 'phone_change',
  });
  if (error) {
    if ((error.message || '').toLowerCase().includes('expired')) {
      throw new Error('رمز التحقق منتهي الصلاحية. اطلب رمزًا جديدًا.');
    }
    if ((error.message || '').toLowerCase().includes('invalid')) {
      throw new Error('رمز التحقق غير صحيح. تأكد منه وحاول مرة ثانية.');
    }
    throw translateAuthError(error);
  }
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
  if (error) {
    if ((error.message || '').toLowerCase().includes('invalid')) {
      throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    }
    throw translateAuthError(error);
  }
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
