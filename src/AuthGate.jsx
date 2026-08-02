import React, { useState, useEffect, useRef } from "react";
import { Loader2, Phone, ShieldCheck, Mail, Fingerprint, UserPlus, LogIn } from "lucide-react";
import {
  checkPhoneEligibility,
  checkEmailEligibility,
  registerAccount,
  requestPhoneVerification,
  confirmPhoneVerification,
  requestEmailVerification,
  confirmEmailVerification,
  linkAccountToMember,
  getLinkedMember,
  signInWithPassword,
  requestPasswordReset,
  updatePassword,
  registerPasskey,
  signInWithPasskey,
} from "./auth-linking";
import { supabase } from "./supabaseClient";

/* ---------------------------------------------------------
   بوابة الدخول — ثلاثة تدفقات رئيسية:
   1) تسجيل عضو جديد بالجوال: جوال+بريد+كلمة مرور → تحقق جوال
      (مرة واحدة، حد 5 محاولات) → ربط الحساب بملف العضو → عرض
      اختياري لتفعيل دخول سريع بالبصمة (Passkey).
   2) تسجيل عضو أُضيف بدون جوال (بنات/زوجات): بريد+كلمة مرور فقط
      → تحقق برمز يُرسل لنفس البريد → ربط الحساب بملف العضو →
      نفس عرض تفعيل البصمة.
   3) دخول عضو سابق: بصمة (Passkey) كطريقة افتراضية، أو بريد+كلمة
      مرور كبديل دائم.
   بعد نجاح أي مسار: <AuthGate>{(me) => <App meId={me.id} />}</AuthGate>
--------------------------------------------------------- */

const T = {
  ink: "#173634",
  sand: "#F4EFE3",
  card: "#FFFDF8",
  gold: "#B4894A",
  clay: "#A24936",
  text: "#1F2A28",
  muted: "#6B7370",
  line: "#DCD4BE",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=Aref+Ruqaa:wght@700&display=swap');
`;

const box = {
  maxWidth: 430,
  margin: "0 auto",
  minHeight: "100vh",
  background: T.sand,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "24px 20px",
  boxSizing: "border-box",
  fontFamily: "'Tajawal', sans-serif",
};

const cardStyle = {
  background: T.card,
  border: `1px solid ${T.line}`,
  borderRadius: 16,
  padding: 22,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 14px",
  borderRadius: 10,
  border: `1px solid ${T.line}`,
  fontFamily: "inherit",
  fontSize: 16,
  background: T.sand,
  color: T.text,
  marginTop: 10,
};

const btnStyle = {
  width: "100%",
  background: T.ink,
  color: T.sand,
  border: "none",
  borderRadius: 10,
  padding: "11px 16px",
  fontSize: 14,
  fontFamily: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const ghostBtnStyle = {
  ...btnStyle,
  background: "transparent",
  color: T.ink,
  border: `1px solid ${T.line}`,
  marginTop: 8,
};

const goldBtnStyle = {
  ...btnStyle,
  background: T.gold,
  color: T.ink,
};

const linkTextStyle = {
  color: T.gold,
  fontSize: 12.5,
  textAlign: "center",
  marginTop: 12,
  cursor: "pointer",
  background: "none",
  border: "none",
  width: "100%",
  fontFamily: "inherit",
};

function Spinner() {
  return <Loader2 size={15} style={{ animation: "authgate-spin 1s linear infinite" }} />;
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return <div style={{ color: T.clay, fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }}>{msg}</div>;
}

function SuccessMsg({ msg }) {
  if (!msg) return null;
  return <div style={{ color: "#3A7D5C", fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }}>{msg}</div>;
}

export default function AuthGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [member, setMember] = useState(null);

  // mode: landing | register | register-email | login
  const [mode, setMode] = useState(() => (window.location.hash === "#register-email" ? "register-email" : "landing"));
  // registerStep: info | phone | passkey-offer
  const [registerStep, setRegisterStep] = useState("info");
  // registerEmailStep: info | otp | passkey-offer
  const [registerEmailStep, setRegisterEmailStep] = useState("info");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingMember, setPendingMember] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [isRecovery, setIsRecovery] = useState(false);
  const isRecoveryRef = useRef(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  // عند فتح التطبيق: تحقق هل توجد جلسة سابقة مربوطة بعضو
  // أو هل هذه جلسة "استعادة كلمة مرور" مؤقتة (من رابط البريد)
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        isRecoveryRef.current = true;
        setIsRecovery(true);
        setChecking(false);
      }
    });

    (async () => {
      try {
        const m = await getLinkedMember();
        if (m && !isRecoveryRef.current) {
          setMember(m);
        } else if (!isRecoveryRef.current) {
          // جلسة موجودة لكن غير مربوطة (تسجيل لم يكتمل) — نظّف واعرض البداية
          // إلا إذا كانت هذه جلسة استعادة كلمة مرور
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await supabase.auth.signOut();
        }
      } catch (e) {
        // لا توجد جلسة سابقة
      }
      if (!isRecoveryRef.current) setChecking(false);
    })();

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  /* ---------------- تسجيل عضو جديد بالجوال ---------------- */

  const handleCheckPhoneAndRegister = async () => {
    resetMessages();
    if (!phone.trim() || !email.trim() || !password.trim()) {
      return setError("الرجاء تعبئة رقم الجوال والبريد وكلمة المرور.");
    }
    if (password.length < 6) {
      return setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
    }
    setBusy(true);
    try {
      const result = await checkPhoneEligibility(phone.trim());
      if (result.status === "not_found") {
        setError("رقم الجوال غير موجود بقائمة العائلة المسجّلة. تأكد من الرقم أو تواصل مع أحد أفراد العائلة.");
        setBusy(false);
        return;
      }
      if (result.status === "already_claimed") {
        setError("هذا الرقم مرتبط بحساب مسبقًا. جرّب تسجيل الدخول بدلًا من ذلك.");
        setBusy(false);
        return;
      }

      setPendingMember(result.member);
      await registerAccount(email.trim(), password);
      await requestPhoneVerification(phone.trim());
      setRegisterStep("phone");
      setSuccess("تم إرسال رمز التحقق إلى جوالك.");
    } catch (e) {
      // نعرض رسالة الخطأ الفعلية القادمة من auth-linking.js بدل إخفائها
      // برسالة عامة — هذا هو ما يسمح لنا برؤية السبب الحقيقي لأي فشل.
      setError(e.message || "تعذّر إتمام التسجيل. تحقق من البيانات وحاول مجددًا.");
    }
    setBusy(false);
  };

  const handleResendPhoneCode = async () => {
    resetMessages();
    setBusy(true);
    try {
      await requestPhoneVerification(phone.trim());
      setSuccess("تم إرسال رمز جديد إلى جوالك.");
    } catch (e) {
      setError(e.message || "تعذّر إرسال الرمز.");
    }
    setBusy(false);
  };

  const handleConfirmPhone = async () => {
    resetMessages();
    if (!code.trim()) return setError("الرجاء إدخال رمز التحقق.");
    setBusy(true);
    try {
      await confirmPhoneVerification(phone.trim(), code.trim());
      await linkAccountToMember(pendingMember.id);
      setRegisterStep("passkey-offer");
    } catch (e) {
      setError(e.message || "الرمز غير صحيح أو منتهي الصلاحية. حاول مرة أخرى.");
    }
    setBusy(false);
  };

  /* ---------------- تسجيل عضو أُضيف بدون جوال (بالبريد) ---------------- */

  const handleCheckEmailAndRegister = async () => {
    resetMessages();
    if (!email.trim() || !password.trim()) {
      return setError("الرجاء تعبئة البريد وكلمة المرور.");
    }
    if (password.length < 6) {
      return setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
    }
    setBusy(true);
    try {
      const result = await checkEmailEligibility(email.trim());
      if (result.status === "not_found") {
        setError("هذا البريد غير مسجّل من قِبل أحد أفراد العائلة. تأكد من البريد أو تواصل مع من أضافك.");
        setBusy(false);
        return;
      }
      if (result.status === "already_claimed") {
        setError("هذا البريد مرتبط بحساب مسبقًا. جرّب تسجيل الدخول بدلًا من ذلك.");
        setBusy(false);
        return;
      }

      setPendingMember(result.member);
      await registerAccount(email.trim(), password);
      await requestEmailVerification(email.trim());
      setRegisterEmailStep("otp");
      setSuccess("تم إرسال رمز التحقق إلى بريدك.");
    } catch (e) {
      setError(e.message || "تعذّر إتمام التسجيل. تحقق من البيانات وحاول مجددًا.");
    }
    setBusy(false);
  };

  const handleResendEmailCode = async () => {
    resetMessages();
    setBusy(true);
    try {
      await requestEmailVerification(email.trim());
      setSuccess("تم إرسال رمز جديد إلى بريدك.");
    } catch (e) {
      setError(e.message || "تعذّر إرسال الرمز.");
    }
    setBusy(false);
  };

  const handleConfirmEmailOtp = async () => {
    resetMessages();
    if (!code.trim()) return setError("الرجاء إدخال رمز التحقق.");
    setBusy(true);
    try {
      await confirmEmailVerification(email.trim(), code.trim());
      await linkAccountToMember(pendingMember.id);
      setRegisterEmailStep("passkey-offer");
    } catch (e) {
      setError(e.message || "الرمز غير صحيح أو منتهي الصلاحية. حاول مرة أخرى.");
    }
    setBusy(false);
  };

  const finishRegistration = async () => {
    const m = await getLinkedMember();
    setMember(m);
  };

  const handleEnablePasskey = async () => {
    resetMessages();
    setBusy(true);
    try {
      await registerPasskey();
      setSuccess("تم تفعيل الدخول السريع بالبصمة.");
      setTimeout(finishRegistration, 800);
    } catch (e) {
      setError("تعذّر تفعيل البصمة على هذا الجهاز. يمكنك تفعيلها لاحقًا من إعدادات حسابك.");
    }
    setBusy(false);
  };

  /* ---------------- تسجيل الدخول ---------------- */

  const handlePasskeyLogin = async () => {
    resetMessages();
    setBusy(true);
    try {
      await signInWithPasskey();
      const m = await getLinkedMember();
      if (m) setMember(m);
      else setError("تم الدخول لكن الحساب غير مرتبط بملف عائلي. تواصل للمساعدة.");
    } catch (e) {
      setError("تعذّر الدخول بالبصمة. جرّب البريد وكلمة المرور.");
    }
    setBusy(false);
  };

  const handlePasswordLogin = async () => {
    resetMessages();
    if (!email.trim() || !password.trim()) return setError("الرجاء إدخال البريد وكلمة المرور.");
    setBusy(true);
    try {
      await signInWithPassword(email.trim(), password);
      const m = await getLinkedMember();
      if (m) setMember(m);
      else setError("تم الدخول لكن الحساب غير مرتبط بملف عائلي. تواصل للمساعدة.");
    } catch (e) {
      setError(e.message || "البريد أو كلمة المرور غير صحيحة.");
    }
    setBusy(false);
  };

  const handleForgotPassword = async () => {
    resetMessages();
    if (!email.trim()) return setError("أدخل بريدك أولًا لإرسال رابط الاستعادة.");
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setSuccess("إذا كان البريد مسجّلاً ومؤكدًا، ستصلك رسالة استعادة كلمة المرور.");
    } catch (e) {
      setError(e.message || "تعذّر إرسال رابط الاستعادة.");
    }
    setBusy(false);
  };

  const handleSetNewPassword = async () => {
    resetMessages();
    if (!newPassword.trim() || !newPassword2.trim()) {
      return setError("الرجاء تعبئة كلمة المرور الجديدة مرتين للتأكيد.");
    }
    if (newPassword !== newPassword2) {
      return setError("كلمتا المرور غير متطابقتين.");
    }
    setBusy(true);
    try {
      await updatePassword(newPassword);
      setSuccess("تم تغيير كلمة المرور بنجاح.");
      isRecoveryRef.current = false;
      setIsRecovery(false);
      const m = await getLinkedMember();
      if (m) setMember(m);
    } catch (e) {
      setError(e.message || "تعذّر تغيير كلمة المرور.");
    }
    setBusy(false);
  };

  if (checking) {
    return (
      <div style={{ ...box, alignItems: "center" }}>
        <style>{`@keyframes authgate-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
        <Loader2 size={22} color={T.gold} style={{ animation: "authgate-spin 1.2s linear infinite" }} />
      </div>
    );
  }

  if (member) {
    return children(member);
  }

  if (isRecovery) {
    return (
      <div dir="rtl" style={box}>
        <style>{`${FONTS} @keyframes authgate-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 26, color: T.ink, fontWeight: 700 }}>
            عائلة آل تركي
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>alturki.family</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>تعيين كلمة مرور جديدة</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
            أدخل كلمة المرور الجديدة لحسابك.
          </div>
          <input
            type="password"
            placeholder="كلمة المرور الجديدة (6 أحرف فأكثر)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="تأكيد كلمة المرور الجديدة"
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
            style={inputStyle}
          />
          <button style={btnStyle} onClick={handleSetNewPassword} disabled={busy}>
            {busy && <Spinner />} تغيير كلمة المرور
          </button>
          <ErrorMsg msg={error} />
          <SuccessMsg msg={success} />
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={box}>
      <style>{`${FONTS} @keyframes authgate-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 26, color: T.ink, fontWeight: 700 }}>
          عائلة آل تركي
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>alturki.family</div>
      </div>

      <div style={cardStyle}>
        {mode === "landing" && (
          <>
            <button style={btnStyle} onClick={() => { resetMessages(); setMode("register"); setRegisterStep("info"); }}>
              <UserPlus size={16} /> تسجيل عضو جديد
            </button>
            <button style={ghostBtnStyle} onClick={() => { resetMessages(); setMode("login"); }}>
              <LogIn size={16} /> لديّ حساب بالفعل
            </button>
            <button style={linkTextStyle} onClick={() => { resetMessages(); setMode("register-email"); setRegisterEmailStep("info"); }}>
              أُضفتِ بدون رقم جوال (بنت/زوجة)؟ فعّلي حسابك بالبريد
            </button>
          </>
        )}

        {mode === "register" && registerStep === "info" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>تسجيل عضو جديد</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
              أدخل رقم جوالك المسجّل بقائمة العائلة، وبريدك، وكلمة مرور تختارها.
            </div>
            <input type="tel" placeholder="رقم الجوال" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="كلمة المرور (6 أحرف فأكثر)" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            <button style={btnStyle} onClick={handleCheckPhoneAndRegister} disabled={busy}>
              {busy && <Spinner />} متابعة
            </button>
            <button style={ghostBtnStyle} onClick={() => { resetMessages(); setMode("landing"); }}>رجوع</button>
          </>
        )}

        {mode === "register" && registerStep === "phone" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
              <Phone size={16} color={T.gold} /> أدخل رمز التحقق المرسل إلى {phone}
            </div>
            <input type="text" inputMode="numeric" placeholder="رمز التحقق" value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
            <button style={btnStyle} onClick={handleConfirmPhone} disabled={busy}>
              {busy && <Spinner />} تأكيد الرمز
            </button>
            <button style={linkTextStyle} onClick={handleResendPhoneCode} disabled={busy}>إعادة إرسال الرمز</button>
          </>
        )}

        {mode === "register-email" && registerEmailStep === "info" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>تفعيل حساب بالبريد</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
              خاص بمن أضافها أحد أفراد العائلة (بنت أو زوجة) ببريدها فقط، بدون رقم جوال. أدخلي نفس البريد اللي سُجّل لك، وكلمة مرور تختارينها.
            </div>
            <input type="email" placeholder="البريد الإلكتروني المسجّل" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="كلمة المرور (6 أحرف فأكثر)" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            <button style={btnStyle} onClick={handleCheckEmailAndRegister} disabled={busy}>
              {busy && <Spinner />} متابعة
            </button>
            <button style={ghostBtnStyle} onClick={() => { resetMessages(); setMode("landing"); }}>رجوع</button>
          </>
        )}

        {mode === "register-email" && registerEmailStep === "otp" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
              <Mail size={16} color={T.gold} /> أدخلي رمز التحقق المرسل إلى {email}
            </div>
            <input type="text" inputMode="numeric" placeholder="رمز التحقق" value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
            <button style={btnStyle} onClick={handleConfirmEmailOtp} disabled={busy}>
              {busy && <Spinner />} تأكيد الرمز
            </button>
            <button style={linkTextStyle} onClick={handleResendEmailCode} disabled={busy}>إعادة إرسال الرمز</button>
          </>
        )}

        {((mode === "register" && registerStep === "passkey-offer") ||
          (mode === "register-email" && registerEmailStep === "passkey-offer")) && (
          <div style={{ textAlign: "center" }}>
            <ShieldCheck size={30} color={T.gold} />
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginTop: 10 }}>تم تفعيل ملفك بنجاح!</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6, lineHeight: 1.7 }}>
              فعّل الدخول السريع بالبصمة أو الوجه لهذا الجهاز، بدل كتابة كلمة المرور كل مرة.
            </div>
            <button style={goldBtnStyle} onClick={handleEnablePasskey} disabled={busy}>
              {busy ? <Spinner /> : <Fingerprint size={16} />} تفعيل الدخول بالبصمة
            </button>
            <button style={ghostBtnStyle} onClick={finishRegistration}>تخطّي الآن</button>
          </div>
        )}

        {mode === "login" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>تسجيل الدخول</div>
            <button style={goldBtnStyle} onClick={handlePasskeyLogin} disabled={busy}>
              {busy ? <Spinner /> : <Fingerprint size={16} />} دخول سريع بالبصمة
            </button>
            <div style={{ textAlign: "center", fontSize: 11.5, color: T.muted, margin: "14px 0" }}>— أو —</div>
            <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            <button style={btnStyle} onClick={handlePasswordLogin} disabled={busy}>
              {busy && <Spinner />} <Mail size={15} /> دخول بالبريد وكلمة المرور
            </button>
            <button style={linkTextStyle} onClick={handleForgotPassword}>نسيت كلمة المرور؟</button>
            <button style={ghostBtnStyle} onClick={() => { resetMessages(); setMode("landing"); }}>رجوع</button>
          </>
        )}

        <ErrorMsg msg={error} />
        <SuccessMsg msg={success} />
      </div>
    </div>
  );
}
