import React, { useState, useEffect } from "react";
import { Loader2, Mail, Phone, ShieldCheck, Send } from "lucide-react";
import {
  sendLoginCode,
  verifyLoginCode,
  getLinkedMember,
  tryAutoLinkByPhone,
  submitJoinRequest,
} from "./auth-linking";

/* ---------------------------------------------------------
   بوابة الدخول — تدير تدفق: بريد → رمز OTP → ربط تلقائي
   برقم الجوال → طلب انضمام (لو ما فيه تطابق). بعد نجاح
   الربط تُظهر التطبيق فعليًا عبر render-prop:
     <AuthGate>{(me) => <App meId={me.id} />}</AuthGate>
--------------------------------------------------------- */

const T = {
  ink: "#173634",
  sand: "#F4EFE3",
  card: "#FFFDF8",
  gold: "#B4894A",
  goldLight: "#D9B876",
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
  fontSize: 14,
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

function Spinner() {
  return <Loader2 size={15} style={{ animation: "authgate-spin 1s linear infinite" }} />;
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return <div style={{ color: T.clay, fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }}>{msg}</div>;
}

export default function AuthGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [member, setMember] = useState(null);

  const [step, setStep] = useState("email"); // email | code | phone | join | pending
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [joinForm, setJoinForm] = useState({ fullName: "", region: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // عند فتح التطبيق: تحقق هل توجد جلسة دخول سابقة مربوطة بعضو
  useEffect(() => {
    (async () => {
      try {
        const m = await getLinkedMember();
        if (m) setMember(m);
      } catch (e) {
        // لا توجد جلسة سابقة — يبقى على شاشة الدخول
      }
      setChecking(false);
    })();
  }, []);

  const handleSendCode = async () => {
    setError("");
    if (!email.trim()) return setError("الرجاء إدخال بريد إلكتروني صحيح.");
    setBusy(true);
    try {
      await sendLoginCode(email.trim());
      setStep("code");
    } catch (e) {
      setError("تعذّر إرسال الرمز. تأكد من البريد وحاول مجددًا.");
    }
    setBusy(false);
  };

  const handleVerifyCode = async () => {
    setError("");
    if (!code.trim()) return setError("الرجاء إدخال الرمز المرسل لبريدك.");
    setBusy(true);
    try {
      await verifyLoginCode(email.trim(), code.trim());
      const m = await getLinkedMember();
      if (m) {
        setMember(m);
      } else {
        setStep("phone");
      }
    } catch (e) {
      setError("الرمز غير صحيح أو منتهي الصلاحية. حاول مرة أخرى.");
    }
    setBusy(false);
  };

  const handlePhoneMatch = async () => {
    setError("");
    if (!phone.trim()) return setError("الرجاء إدخال رقم الجوال المسجل بقائمة العائلة.");
    setBusy(true);
    try {
      const result = await tryAutoLinkByPhone(phone.trim());
      if (result.status === "linked") {
        const m = await getLinkedMember();
        setMember(m);
      } else {
        setStep("join");
      }
    } catch (e) {
      setError("حدث خطأ أثناء البحث. حاول مرة أخرى.");
    }
    setBusy(false);
  };

  const handleJoinRequest = async () => {
    setError("");
    if (!joinForm.fullName.trim()) return setError("الرجاء إدخال الاسم الكامل.");
    setBusy(true);
    try {
      await submitJoinRequest({
        phone: phone.trim(),
        email: email.trim(),
        fullName: joinForm.fullName.trim(),
        region: joinForm.region.trim(),
      });
      setStep("pending");
    } catch (e) {
      setError("تعذّر إرسال الطلب. حاول مرة أخرى.");
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

  // نجح الدخول والربط — سلّم التحكم للتطبيق الفعلي
  if (member) {
    return children(member);
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
        {step === "email" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
              <Mail size={16} color={T.gold} /> سجّل الدخول ببريدك الإلكتروني
            </div>
            <input
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <button onClick={handleSendCode} disabled={busy} style={btnStyle}>
              {busy ? <Spinner /> : <Send size={15} />}
              إرسال رمز الدخول
            </button>
          </>
        )}

        {step === "code" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} color={T.gold} /> أدخل الرمز المرسل إلى {email}
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="رمز التحقق"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={inputStyle}
            />
            <button onClick={handleVerifyCode} disabled={busy} style={btnStyle}>
              {busy && <Spinner />} تأكيد الرمز
            </button>
            <button
              onClick={() => { setStep("email"); setCode(""); setError(""); }}
              style={ghostBtnStyle}
            >
              تغيير البريد
            </button>
          </>
        )}

        {step === "phone" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
              <Phone size={16} color={T.gold} /> أدخل رقم جوالك لربط ملفك العائلي
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
              نستخدم رقم الجوال المسجل بقائمة العائلة لإيجاد ملفك تلقائيًا.
            </div>
            <input
              type="tel"
              placeholder="05xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
            />
            <button onClick={handlePhoneMatch} disabled={busy} style={btnStyle}>
              {busy && <Spinner />} بحث وربط
            </button>
          </>
        )}

        {step === "join" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>ما لقينا تطابقًا تلقائيًا</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
              قدّم طلب انضمام وسيراجعه أحد مشرفي العائلة قريبًا.
            </div>
            <input
              placeholder="الاسم الكامل"
              value={joinForm.fullName}
              onChange={(e) => setJoinForm({ ...joinForm, fullName: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="المنطقة (اختياري)"
              value={joinForm.region}
              onChange={(e) => setJoinForm({ ...joinForm, region: e.target.value })}
              style={inputStyle}
            />
            <button onClick={handleJoinRequest} disabled={busy} style={btnStyle}>
              {busy && <Spinner />} إرسال طلب الانضمام
            </button>
          </>
        )}

        {step === "pending" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <ShieldCheck size={30} color={T.gold} />
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginTop: 10 }}>طلبك قيد المراجعة</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6, lineHeight: 1.7 }}>
              سيتواصل معك أحد مشرفي العائلة بعد مراجعة طلبك. يمكنك إغلاق الصفحة والعودة لاحقًا.
            </div>
          </div>
        )}

        <ErrorMsg msg={error} />
      </div>
    </div>
  );
}
