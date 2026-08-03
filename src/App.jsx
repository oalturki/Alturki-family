import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Newspaper, GitBranch, CalendarDays, Users, UserCircle2,
  Search, Plus, X, MapPin, Briefcase,
  Link2, ChevronDown, ChevronUp, Check,
  Baby, HeartHandshake, Megaphone, Cross, Loader2,
  FileText, Phone, Cake, Shield, UserPlus, Trash2, Save, Pencil,
  BookOpen, ChevronRight, ChevronLeft, Upload
} from "lucide-react";
import { supabase } from "./supabaseClient";
import AuthGate from "./AuthGate";

const T = {
  ink: "#173634",
  inkSoft: "#20504C",
  sand: "#F4EFE3",
  sandDark: "#E7DFC9",
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

function Rosette({ size = 40, color = T.gold, spin = false }) {
  const petals = Array.from({ length: 8 });
  const r = size * 0.27;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={spin ? { animation: "rosette-spin 40s linear infinite" } : undefined}>
      <circle cx={cx} cy={cy} r={size * 0.46} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
      {petals.map((_, i) => {
        const angle = (i * 360) / petals.length;
        const rad = (angle * Math.PI) / 180;
        const px = cx + r * Math.cos(rad);
        const py = cy + r * Math.sin(rad);
        return <circle key={i} cx={px} cy={py} r={size * 0.16} fill="none" stroke={color} strokeWidth={1.1} opacity={0.85} />;
      })}
      <circle cx={cx} cy={cy} r={size * 0.055} fill={color} />
    </svg>
  );
}

function Logo({ size = 44 }) {
  return (
    <img
      src="/logo.jpg"
      alt="شعار عائلة آل تركي"
      style={{ width: size, height: size, borderRadius: 12, objectFit: "contain", border: `1.5px solid ${T.goldLight}` }}
    />
  );
}

function mapMemberRow(row) {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    memberNumber: row.member_number,
    name: row.first_name,
    fatherId: row.father_id,
    spouseOf: row.spouse_of || null,
    prefilledEmail: row.prefilled_email || "",
    gender: row.gender,
    isAlive: row.is_alive !== false,
    birthDate: row.birth_date || "",
    birthDatePrecision: row.birth_date_precision || "day",
    deathDate: row.death_date || "",
    deathDatePrecision: row.death_date_precision || "day",
    region: row.region || "",
    birthPlace: row.birth_place || "",
    job: row.occupation || "",
    bio: row.bio || "",
    photoUrl: row.photo_url || "",
    phone: row.phone || "",
    userAccountId: row.user_account_id || null,
  };
}

async function fetchMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("id, legacy_id, member_number, first_name, father_id, spouse_of, prefilled_email, gender, is_alive, birth_date, birth_date_precision, death_date, death_date_precision, region, birth_place, occupation, bio, photo_url, phone, user_account_id")
    .order("created_at", { ascending: true })
    .range(0, 4999);
  if (error) { console.error("fetchMembers failed", error); return []; }
  return data.map(mapMemberRow);
}

async function fetchMemberProfiles() {
  const { data, error } = await supabase.from("member_profiles").select("member_id, social_links, visibility, cv_url");
  if (error) { console.error("fetchMemberProfiles failed", error); return {}; }
  const map = {};
  data.forEach((row) => {
    map[row.member_id] = { socialLinks: row.social_links || {}, visibility: row.visibility || {}, cvUrl: row.cv_url || "" };
  });
  return map;
}

async function sendFamilyEmail(payload) {
  try {
    const { error } = await supabase.functions.invoke("send-family-email", { body: payload });
    if (error) console.error("sendFamilyEmail failed", error);
  } catch (e) {
    console.error("sendFamilyEmail failed", e);
  }
}

async function insertMember(form) {
  const { data, error } = await supabase
    .from("members")
    .insert({ first_name: form.name, father_id: form.fatherId || null, spouse_of: form.spouseOf || null, prefilled_email: form.prefilledEmail || null, gender: form.gender, region: form.region || null, phone: form.phone || null })
    .select()
    .single();
  if (error) {
    console.error("insertMember failed", error);
    if (error.code === "23505") {
      throw new Error("هذا البريد الإلكتروني مستخدم مسبقًا لعضو آخر بالعائلة.");
    }
    throw new Error("تعذّرت الإضافة، حاول مرة أخرى.");
  }
  return mapMemberRow(data);
}

async function updateMemberCore(id, patch) {
  const { error } = await supabase
    .from("members")
    .update({ occupation: patch.job, bio: patch.bio, region: patch.region, photo_url: patch.photoUrl, birth_place: patch.birthPlace })
    .eq("id", id);
  if (error) console.error("updateMemberCore failed", error);
}

async function updateMemberAdmin(id, patch) {
  const { error } = await supabase
    .from("members")
    .update({ first_name: patch.name, region: patch.region || null, birth_date: patch.birthDate || null, birth_place: patch.birthPlace || null })
    .eq("id", id);
  if (error) { console.error("updateMemberAdmin failed", error); return false; }
  return true;
}

async function updateMemberPhone(id, phone) {
  const { error } = await supabase.from("members").update({ phone: phone || null }).eq("id", id);
  if (error) { console.error("updateMemberPhone failed", error); return false; }
  return true;
}

async function deleteMember(id) {
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) { console.error("deleteMember failed", error); return false; }
  return true;
}

async function unlinkSpouse(id) {
  const { error } = await supabase.from("members").update({ spouse_of: null }).eq("id", id);
  if (error) { console.error("unlinkSpouse failed", error); return false; }
  return true;
}

async function updateMemberDeathStatus(id, isAlive, deathDate) {
  const { error } = await supabase
    .from("members")
    .update({ is_alive: isAlive, death_date: isAlive ? null : (deathDate || null) })
    .eq("id", id);
  if (error) throw error;
}

async function upsertMemberProfile(memberId, { socialLinks, extendedVisible, phoneVisible, emailVisible, cvUrl }) {
  const vis = extendedVisible ? "public" : "private";
  const { error } = await supabase.from("member_profiles").upsert({
    member_id: memberId,
    social_links: socialLinks || {},
    cv_url: cvUrl || null,
    visibility: {
      bio: vis, photo_url: vis, occupation: vis, social_links: vis,
      phone: phoneVisible ? "public" : "private",
      email: emailVisible ? "public" : "private",
    },
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("upsertMemberProfile failed", error);
}

async function fetchNews() {
  const { data, error } = await supabase.from("news").select("*").order("date", { ascending: false });
  if (error) { console.error("fetchNews failed", error); return []; }
  return data;
}

async function insertNews(item) {
  const { data, error } = await supabase.from("news").insert(item).select().single();
  if (error) { console.error("insertNews failed", error); return null; }
  return data;
}

async function updateNews(id, patch) {
  const { data, error } = await supabase.from("news").update(patch).eq("id", id).select().single();
  if (error) { console.error("updateNews failed", error); return null; }
  return data;
}

async function deleteNews(id) {
  const { error } = await supabase.from("news").delete().eq("id", id);
  if (error) { console.error("deleteNews failed", error); return false; }
  return true;
}

async function fetchEvents() {
  const { data, error } = await supabase.from("events").select("*, event_attendees(member_id)").order("date", { ascending: true });
  if (error) { console.error("fetchEvents failed", error); return []; }
  return data.map((ev) => ({ ...ev, attendees: (ev.event_attendees || []).map((a) => a.member_id) }));
}

async function insertEvent(form) {
  const { data, error } = await supabase.from("events").insert(form).select().single();
  if (error) { console.error("insertEvent failed", error); return null; }
  return { ...data, attendees: [] };
}

async function updateEvent(id, patch) {
  const { data, error } = await supabase.from("events").update(patch).eq("id", id).select().single();
  if (error) { console.error("updateEvent failed", error); return null; }
  return data;
}

async function deleteEvent(id) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) { console.error("deleteEvent failed", error); return false; }
  return true;
}

async function setAttendance(eventId, memberId, attending) {
  if (attending) {
    const { error } = await supabase.from("event_attendees").delete().eq("event_id", eventId).eq("member_id", memberId);
    if (error) console.error("removeAttendance failed", error);
  } else {
    const { error } = await supabase.from("event_attendees").insert({ event_id: eventId, member_id: memberId });
    if (error) console.error("addAttendance failed", error);
  }
}

async function checkPermission(key) {
  const { data, error } = await supabase.rpc("has_permission", { p_permission: key });
  if (error) { console.error("checkPermission failed", key, error); return false; }
  return !!data;
}

async function fetchMagazineIndexFile() {
  const { data, error } = await supabase.from("magazine_index_file").select("*").order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
  if (error) { console.error("fetchMagazineIndexFile failed", error); return null; }
  return data;
}

async function uploadMagazineIndexFile(file) {
  const path = `index/${Date.now()}_${file.name}`;
  const { error: uploadErr } = await supabase.storage.from("magazine").upload(path, file);
  if (uploadErr) { console.error("uploadMagazineIndexFile upload failed", uploadErr); return null; }
  const { data: urlData } = supabase.storage.from("magazine").getPublicUrl(path);
  const { data, error } = await supabase
    .from("magazine_index_file")
    .insert({ file_url: urlData.publicUrl, file_name: file.name })
    .select()
    .single();
  if (error) { console.error("uploadMagazineIndexFile insert failed", error); return null; }
  return data;
}

async function fetchMagazineIssues() {
  const { data, error } = await supabase.from("magazine_issues").select("*").order("issue_number", { ascending: false });
  if (error) { console.error("fetchMagazineIssues failed", error); return []; }
  return data;
}

async function fetchMagazineArticles() {
  const { data, error } = await supabase.from("magazine_articles").select("*, magazine_issues(issue_number, title)").order("created_at", { ascending: false });
  if (error) { console.error("fetchMagazineArticles failed", error); return []; }
  return data;
}

async function uploadMagazinePdf(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from("magazine").upload(path, file, { contentType: file.type || "application/pdf" });
  if (error) {
    console.error("uploadMagazinePdf failed", error);
    throw new Error(error.message || "تعذّر رفع الملف.");
  }
  const { data } = supabase.storage.from("magazine").getPublicUrl(path);
  return data.publicUrl;
}

async function insertMagazineIssue(issue) {
  const { data, error } = await supabase.from("magazine_issues").upsert(issue, { onConflict: "issue_number" }).select().single();
  if (error) { console.error("insertMagazineIssue failed", error); return null; }
  return data;
}

async function deleteMagazineIssue(id) {
  const { error } = await supabase.from("magazine_issues").delete().eq("id", id);
  if (error) { console.error("deleteMagazineIssue failed", error); return false; }
  return true;
}

async function updateMagazineIssueOffset(id, offset) {
  const { error } = await supabase.from("magazine_issues").update({ page_offset: offset }).eq("id", id);
  if (error) { console.error("updateMagazineIssueOffset failed", error); return false; }
  return true;
}

async function insertMagazineArticle(article) {
  const { data, error } = await supabase.from("magazine_articles").insert(article).select().single();
  if (error) { console.error("insertMagazineArticle failed", error); return null; }
  return data;
}

async function deleteMagazineArticle(id) {
  const { error } = await supabase.from("magazine_articles").delete().eq("id", id);
  if (error) { console.error("deleteMagazineArticle failed", error); return false; }
  return true;
}

async function submitBirthRequest({ name, gender, birthDate, birthPlace, fatherId }) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return false;
  const { error } = await supabase.from("edit_requests").insert({
    requested_by: uid,
    status: "pending",
    proposed_changes: { name, gender, birth_date: birthDate || null, birth_place: birthPlace || null, father_id: fatherId },
  });
  if (error) { console.error("submitBirthRequest failed", error); return false; }
  return true;
}

async function fetchPendingBirthRequests() {
  const { data, error } = await supabase.from("edit_requests").select("id, proposed_changes, created_at, member_id, requested_by").eq("status", "pending").is("member_id", null);
  if (error) { console.error("fetchPendingBirthRequests failed", error); return []; }
  return data;
}

async function fetchMyBirthRequests() {
  const { data, error } = await supabase.from("edit_requests").select("id, proposed_changes, status, created_at, member_id").is("member_id", null).order("created_at", { ascending: false });
  if (error) { console.error("fetchMyBirthRequests failed", error); return []; }
  return data;
}

async function approveBirthRequest(request) {
  const c = request.proposed_changes;
  const { data: existing } = await supabase
    .from("members")
    .select("id")
    .eq("father_id", c.father_id)
    .eq("first_name", c.name)
    .maybeSingle();
  if (existing) {
    console.error("approveBirthRequest: duplicate name for this father, skipped insert");
    return { duplicate: true };
  }
  const { data: userData } = await supabase.auth.getUser();
  const { data: memberData, error: insertErr } = await supabase
    .from("members")
    .insert({ first_name: c.name, father_id: c.father_id, gender: c.gender, birth_date: c.birth_date || null, birth_place: c.birth_place || null })
    .select()
    .single();
  if (insertErr) { console.error("approveBirthRequest insert failed", insertErr); return null; }
  const { error: updateErr } = await supabase.from("edit_requests").update({ status: "approved", reviewed_by: userData?.user?.id }).eq("id", request.id);
  if (updateErr) console.error("approveBirthRequest update failed", updateErr);
  return mapMemberRow(memberData);
}

async function rejectBirthRequest(requestId) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("edit_requests").update({ status: "rejected", reviewed_by: userData?.user?.id }).eq("id", requestId);
  if (error) { console.error("rejectBirthRequest failed", error); return false; }
  return true;
}

async function deleteBirthRequest(requestId) {
  const { error } = await supabase.from("edit_requests").delete().eq("id", requestId);
  if (error) { console.error("deleteBirthRequest failed", error); return false; }
  return true;
}

function buildAncestryHelper(members) {
  const byId = {};
  members.forEach((m) => { byId[m.id] = m; });
  function ancestorChain(member) {
    const chain = [];
    let current = member;
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      chain.push(current);
      seen.add(current.id);
      current = current.fatherId ? byId[current.fatherId] : null;
    }
    return chain;
  }
  return { byId, ancestorChain };
}

function nasabString(chain, maxGen = 4) {
  return chain.slice(0, maxGen).map((m) => m.name).join(" بن ");
}

function fullNasabString(chain) {
  return chain.map((m) => m.name).join(" بن ");
}

function mainBranchOf(chain) {
  const rootToMember = [...chain].reverse();
  if (rootToMember.length <= 4) return "الجذع الرئيسي";
  return rootToMember[4].name;
}

function enrichMembers(rawMembers, profilesMap) {
  const { ancestorChain } = buildAncestryHelper(rawMembers);
  return rawMembers.map((m) => {
    const chain = ancestorChain(m);
    const profile = profilesMap[m.id];
    return {
      ...m,
      nasab: nasabString(chain),
      fullNasab: fullNasabString(chain),
      branch: mainBranchOf(chain),
      socialLinks: profile?.socialLinks || {},
      cvUrl: profile?.cvUrl || "",
      extendedVisible: profile ? profile.visibility?.bio === "public" : false,
      phoneVisible: profile ? profile.visibility?.phone === "public" : false,
      emailVisible: profile ? profile.visibility?.email === "public" : false,
    };
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}

function formatDate(dateStr, precision) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (precision === "year") return String(d.getFullYear());
  if (precision === "month") return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}

const NEWS_TYPES = {
  "مولود": { icon: Baby, color: T.gold },
  "وفاة": { icon: Cross, color: T.clay },
  "زواج": { icon: HeartHandshake, color: T.gold },
  "عام": { icon: Megaphone, color: T.inkSoft },
};

function Avatar({ name, photoUrl, gender, size = 44 }) {
  if (photoUrl && gender !== "female") {
    return <img src={photoUrl} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${T.gold}`, flexShrink: 0 }} />;
  }
  const initials = (name || "").trim().split(" ").slice(0, 2).map((w) => w[0]).join("");
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(155deg, ${T.inkSoft}, ${T.ink})`, color: T.goldLight, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.36, flexShrink: 0, border: `1.5px solid ${T.gold}` }}>
      {initials}
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 4px 10px" }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: T.ink, margin: 0 }}>{children}</h2>
      {action}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ textAlign: "center", padding: "36px 20px", color: T.muted, fontSize: 13.5 }}>{text}</div>;
}

function IconButton({ onClick, children, active }) {
  return (
    <button onClick={onClick} style={{ border: `1px solid ${active ? T.gold : T.line}`, background: active ? T.sandDark : T.card, color: T.ink, borderRadius: 10, padding: "6px 10px", fontSize: 12.5, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
      {children}
    </button>
  );
}

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: `1px solid ${T.line}`, fontFamily: "inherit", fontSize: 16, background: T.sand, color: T.text };
const primaryBtnStyle = { background: T.ink, color: T.sand, border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" };

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [message]);
  if (!message) return null;
  const isError = type === "error";
  return (
    <div style={{ position: "fixed", top: 100, left: "50%", transform: "translateX(-50%)", zIndex: 90, width: "calc(100% - 32px)", maxWidth: 400 }}>
      <div
        onClick={onClose}
        style={{
          background: isError ? "#5A2323" : "#123838",
          color: isError ? "#F9D8D8" : "#F4EFE3",
          border: `1.5px solid ${isError ? "#A24936" : "#c9a227"}`,
          borderRadius: 12,
          padding: "14px 16px",
          fontSize: 13,
          fontWeight: 700,
          textAlign: "center",
          boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
          cursor: "pointer",
          lineHeight: 1.6,
        }}
      >
        {message}
      </div>
    </div>
  );
}

function NewsTab({ news, setNews, canManageNews }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("عام");
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const submit = async () => {
    if (!text.trim()) return;
    if (editingId) {
      const updated = await updateNews(editingId, { type, text: text.trim() });
      if (updated) setNews(news.map((n) => (n.id === editingId ? updated : n)));
    } else {
      const created = await insertNews({ type, text: text.trim(), date: new Date().toISOString().slice(0, 10) });
      if (created) setNews([created, ...news]);
    }
    setText("");
    setType("عام");
    setEditingId(null);
    setOpen(false);
  };

  const startEdit = (n) => {
    setEditingId(n.id);
    setType(n.type);
    setText(n.text);
    setOpen(true);
  };

  const remove = (id) => setConfirmDeleteId(id);

  const confirmRemove = async () => {
    const ok = await deleteNews(confirmDeleteId);
    if (ok) setNews(news.filter((n) => n.id !== confirmDeleteId));
    setConfirmDeleteId(null);
  };

  return (
    <div>
      <SectionTitle action={canManageNews && (
        <IconButton onClick={() => { setOpen((v) => !v); setEditingId(null); setText(""); setType("عام"); }} active={open}>
          <Plus size={14} /> إضافة خبر
        </IconButton>
      )}>
        الأخبار
      </SectionTitle>

      {open && canManageNews && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {Object.keys(NEWS_TYPES).map((t) => (
              <button key={t} onClick={() => setType(t)} style={{ border: `1px solid ${type === t ? T.gold : T.line}`, background: type === t ? T.sandDark : "transparent", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontFamily: "inherit", color: T.text, cursor: "pointer" }}>
                {t}
              </button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب نص الخبر هنا..." rows={3} style={{ ...inputStyle, resize: "none" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={submit} style={{ ...primaryBtnStyle, marginTop: 0, flex: 1 }}>{editingId ? "حفظ التعديل" : "نشر الخبر"}</button>
            <button
              onClick={() => { setOpen(false); setEditingId(null); setText(""); setType("عام"); }}
              style={{ background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}
            >
              تراجع
            </button>
          </div>
        </div>
      )}

      {news.length === 0 && <EmptyState text="لا توجد أخبار بعد. كونوا أول من ينشر خبرًا للعائلة." />}

      {news.map((n) => {
        const meta = NEWS_TYPES[n.type] || NEWS_TYPES["عام"];
        const Icon = meta.icon;
        return (
          <div key={n.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 13, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.sandDark, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: meta.color }}>
                <Icon size={17} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>{n.text}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{n.type} · {n.date}</div>
              </div>
            </div>
            {canManageNews && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
                <button onClick={() => startEdit(n)} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${T.line}`, background: "transparent", color: T.gold, borderRadius: 8, padding: "5px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
                  <Pencil size={12} /> تعديل
                </button>
                <button onClick={() => remove(n.id)} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${T.line}`, background: "transparent", color: T.clay, borderRadius: 8, padding: "5px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
                  <Trash2 size={12} /> حذف
                </button>
              </div>
            )}
          </div>
        );
      })}

      {confirmDeleteId && (
        <ConfirmModal
          onConfirm={confirmRemove}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

const TREE_NODE_W = 96;
const TREE_NODE_H = 58;
const TREE_H_GAP = 16;
const TREE_V_GAP = 54;

const TT = {
  tealDark: "#0d2b2b",
  teal900: "#123838",
  teal800: "#1a4d4d",
  teal700: "#1f6161",
  sand100: "#f6f1e6",
  sand200: "#efe6d2",
  gold500: "#c9a227",
  gold400: "#dab94a",
  line: "#8fae9f",
  hasPhoneFill: "#dff0e4",
  deceasedLine: "#a24936",
  text: "#16241f",
};

function TreeTab({ members, setMembers, profilesMap, canManageTree }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedResults, setExpandedResults] = useState(() => new Set());
  const [pdfOpen, setPdfOpen] = useState(false);
  const [showInteractive, setShowInteractive] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pdfOpen) return;
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(false);

    const ensurePdfJs = () =>
      new Promise((resolve, reject) => {
        if (window.pdfjsLib) return resolve(window.pdfjsLib);
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = () => resolve(window.pdfjsLib);
        script.onerror = reject;
        document.body.appendChild(script);
      });

    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000));

    Promise.race([
      ensurePdfJs()
        .then((pdfjsLib) => {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          return pdfjsLib.getDocument({ url: "/Family-Tree.pdf", cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/", cMapPacked: true }).promise;
        })
        .then((pdf) => pdf.getPage(1))
        .then((page) => {
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const scale = 2.2;
          const viewport = page.getViewport({ scale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          const ctx = canvas.getContext("2d");
          return page.render({ canvasContext: ctx, viewport }).promise;
        }),
      timeout,
    ])
      .then(() => { if (!cancelled) setPdfLoading(false); })
      .catch(() => { if (!cancelled) { setPdfLoading(false); setPdfError(true); } });

    return () => { cancelled = true; };
  }, [pdfOpen]);

  const handleDownloadPdf = async () => {
    try {
      const res = await fetch("/Family-Tree.pdf");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "شجرة_آل_تركي.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      window.open("/Family-Tree.pdf", "_blank");
    }
  };

  const { byId, childrenMap, rootId } = useMemo(() => {
    const byId = {};
    members.forEach((m) => { byId[m.id] = m; });
    const childrenMap = {};
    members.forEach((m) => {
      if (m.gender === "female") return;
      if (m.fatherId) {
        childrenMap[m.fatherId] = childrenMap[m.fatherId] || [];
        childrenMap[m.fatherId].push(m.id);
      }
    });
    const root = members.find((m) => !m.fatherId);
    return { byId, childrenMap, rootId: root ? root.id : null };
  }, [members]);

  useEffect(() => {
    if (rootId) setExpanded(new Set([rootId]));
  }, [rootId]);

  const svgWrapRef = useRef(null);

  const nasabAtDepth = (member, depth) => {
    const parts = [];
    let cur = member;
    let n = 0;
    while (cur && n < depth) {
      parts.push(cur.name);
      cur = cur.fatherId ? byId[cur.fatherId] : null;
      n++;
    }
    return parts.join(" بن ");
  };

  const goToMember = (id) => {
    const target = byId[id];
    if (!target) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let cur = target;
      while (cur) {
        next.add(cur.id);
        cur = cur.fatherId ? byId[cur.fatherId] : null;
      }
      return next;
    });
    setSelectedNode(id);
    setTimeout(() => {
      const container = svgWrapRef.current;
      const el = container?.querySelector(`[data-node-id="${id}"]`);
      if (container && el) {
        const elRect = el.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        container.scrollBy({
          left: (elRect.left + elRect.width / 2) - (contRect.left + contRect.width / 2),
          top: (elRect.top + elRect.height / 2) - (contRect.top + contRect.height / 2),
          behavior: "smooth",
        });
      }
    }, 60);
  };

  const norm = (s) => (s || "").replace(/بن/g, " ").replace(/\s+/g, " ").trim();
  const searchResults = useMemo(() => {
    const nq = norm(query);
    if (!nq) return [];
    const matched = members.filter((m) => m.gender !== "female" && norm(m.nasab).startsWith(nq));
    let display = matched.map((m) => ({ member: m, label: nasabAtDepth(m, 4) }));
    const counts = {};
    display.forEach((d) => { counts[d.label] = (counts[d.label] || 0) + 1; });
    display = display.map((d) => (counts[d.label] > 1 ? { ...d, label: nasabAtDepth(d.member, 5) } : d));
    display.sort((a, b) => a.label.localeCompare(b.label, "ar"));
    return display.slice(0, 100);
  }, [query, members, byId]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const layout = useMemo(() => {
    if (!rootId || !byId[rootId]) return { nodes: [], edges: [], width: 0, height: 0 };

    const subtreeWidth = (id) => {
      const kids = expanded.has(id) ? (childrenMap[id] || []) : [];
      if (kids.length === 0) return TREE_NODE_W + TREE_H_GAP;
      return kids.reduce((sum, kidId) => sum + subtreeWidth(kidId), 0);
    };

    const nodes = [];
    const edges = [];
    let maxDepth = 0;

    const assign = (id, x0, depth) => {
      maxDepth = Math.max(maxDepth, depth);
      const kids = expanded.has(id) ? (childrenMap[id] || []) : [];
      const y = depth * (TREE_NODE_H + TREE_V_GAP);
      if (kids.length === 0) {
        const cx = x0 + (TREE_NODE_W + TREE_H_GAP) / 2;
        nodes.push({ id, x: cx, y, depth, hasChildren: !!(childrenMap[id] && childrenMap[id].length) });
        return cx;
      }
      let cursor = x0;
      const centers = [];
      kids.forEach((kidId) => {
        const w = subtreeWidth(kidId);
        centers.push(assign(kidId, cursor, depth + 1));
        cursor += w;
      });
      const cx = (centers[0] + centers[centers.length - 1]) / 2;
      nodes.push({ id, x: cx, y, depth, hasChildren: true });
      centers.forEach((ccx) => {
        edges.push({ x1: cx, y1: y + TREE_NODE_H, x2: ccx, y2: y + TREE_NODE_H + TREE_V_GAP });
      });
      return cx;
    };

    assign(rootId, 0, 0);
    const width = subtreeWidth(rootId);
    const height = (maxDepth + 1) * (TREE_NODE_H + TREE_V_GAP);
    return { nodes, edges, width, height };
  }, [rootId, byId, childrenMap, expanded]);

  return (
    <div>
      <div style={{ marginTop: 4, marginBottom: 16, borderRadius: 14, overflow: "hidden", border: `1px solid ${TT.gold500}`, boxShadow: "0 3px 10px rgba(13,43,43,0.15)" }}>
        <img
          src="/Nasab-Frame.jpeg"
          alt="نسب آل تركي من ذرية تركي بن إبراهيم بن سليمان بن حماد بن عامر البدراني الدوسري، المتوفى عام ١١١٧هـ رحمه الله"
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => setPdfOpen(true)}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "14px 8px",
            background: "linear-gradient(160deg, #123838, #0d2b2b)",
            color: "#F4EFE3",
            border: "1px solid #c9a227",
            borderRadius: 14,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <FileText size={20} color="#dab94a" />
          <span style={{ fontSize: 12.5, fontWeight: 800 }}>الشجرة المصورة</span>
          <span style={{ fontSize: 10, color: "#c9b98a" }}>الطبعة الثالثة، ١٤٤٧هـ</span>
        </button>
        <button
          onClick={() => setShowInteractive((v) => !v)}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: "14px 8px",
            background: showInteractive ? T.sandDark : T.card,
            color: T.ink,
            border: `1px solid ${showInteractive ? T.gold : T.line}`,
            borderRadius: 14,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <GitBranch size={20} color={T.gold} />
          <span style={{ fontSize: 12.5, fontWeight: 800 }}>الشجرة التفاعلية</span>
          <span style={{ fontSize: 10, color: T.muted }}>{showInteractive ? "إخفاء" : "بيانات حية، بحث وتفرّع"}</span>
        </button>
      </div>

      {pdfOpen && (
        <div style={{ position: "fixed", inset: 0, background: "#0d2b2b", zIndex: 70, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "linear-gradient(160deg, #123838, #0d2b2b)", borderBottom: "2px solid #c9a227" }}>
            <button
              onClick={handleDownloadPdf}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(244,239,227,0.12)", border: "none", borderRadius: 999, color: "#F4EFE3", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 12px" }}
            >
              تحميل
            </button>
            <span style={{ color: "#dab94a", fontSize: 13, fontWeight: 700 }}>الشجرة المصورة</span>
            <button
              onClick={() => setPdfOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(244,239,227,0.12)", border: "none", borderRadius: 999, color: "#F4EFE3", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 12px" }}
            >
              <X size={16} /> إغلاق
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
            {pdfLoading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "80px 0", color: "#F4EFE3" }}>
                <Loader2 size={24} style={{ animation: "rosette-spin 1.2s linear infinite" }} />
                <span style={{ fontSize: 13 }}>جارِ تحميل الشجرة...</span>
              </div>
            )}
            {pdfError && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#F4EFE3" }}>
                <div style={{ marginBottom: 14 }}>تعذّر عرض الشجرة داخل الصفحة (قد يكون بسبب الشبكة أو المتصفح).</div>
                <a
                  href="/Family-Tree.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-block", padding: "9px 18px", background: "#c9a227", color: "#0d2b2b", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 13 }}
                >
                  فتح ملف PDF مباشرة
                </a>
              </div>
            )}
            <canvas ref={canvasRef} style={{ display: pdfLoading || pdfError ? "none" : "block", margin: "0 auto" }} />
          </div>
        </div>
      )}

      {showInteractive && (
        <>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} style={{ position: "absolute", right: 12, top: 11, color: T.muted }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن فرد بالاسم..." style={{ ...inputStyle, padding: "9px 38px 9px 12px" }} />
      </div>

      {query.trim() && (
        <div style={{ border: `1px solid ${TT.gold500}`, borderRadius: 14, background: T.card, marginBottom: 14, overflow: "auto", maxHeight: "50vh" }}>
          {searchResults.length === 0 ? (
            <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: T.muted }}>لا نتائج مطابقة.</div>
          ) : (
            searchResults.map(({ member: rm, label }) => (
              <div key={rm.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, wordBreak: "break-word" }}>{label}</span>
                  {rm.fullNasab && rm.fullNasab !== label && (
                    <button
                      onClick={() => setExpandedResults((prev) => { const n = new Set(prev); n.has(rm.id) ? n.delete(rm.id) : n.add(rm.id); return n; })}
                      title="إظهار النسب كامل"
                      style={{ border: `1px solid ${T.line}`, background: "transparent", borderRadius: 8, padding: "2px 5px", cursor: "pointer", color: T.muted, display: "flex", alignItems: "center" }}
                    >
                      <ChevronDown size={13} style={{ transform: expandedResults.has(rm.id) ? "rotate(180deg)" : "none" }} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => goToMember(rm.id)}
                  title="الذهاب لمكانه بالشجرة"
                  style={{ border: "none", background: TT.teal800, color: "#fff", borderRadius: 8, padding: "4px 9px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 10.5 }}
                >
                  <MapPin size={12} /> الموقع بالشجرة
                </button>
                {expandedResults.has(rm.id) && (
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 4, wordBreak: "break-word" }}>{rm.fullNasab}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10, opacity: 0.8 }}>
        {[0, 1, 2, 3, 4].map((i) => <Rosette key={i} size={18} color={T.gold} />)}
      </div>

      {!rootId ? (
        <EmptyState text="تعذّر تحديد جذر الشجرة." />
      ) : (
        <div ref={svgWrapRef} style={{ overflow: "auto", border: `1.5px solid ${TT.gold500}`, borderRadius: 14, background: TT.sand100, padding: 16, maxHeight: "60vh" }}>
          <svg width={Math.max(layout.width, 260)} height={layout.height + 20} style={{ display: "block", margin: "0 auto" }}>
            {layout.edges.map((e, i) => (
              <path
                key={i}
                d={`M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}`}
                stroke={TT.line}
                strokeWidth={1.6}
                fill="none"
              />
            ))}
            {layout.nodes.map((n) => {
              const m = byId[n.id];
              const isRoot = n.id === rootId;
              const hasPhone = m?.isAlive !== false && !!m?.phone;
              const isDeceased = m?.isAlive === false;
              const w = isRoot ? TREE_NODE_W + 20 : TREE_NODE_W;
              const h = isRoot ? TREE_NODE_H + 14 : TREE_NODE_H;
              const isSelected = selectedNode === n.id;

              let fill = TT.sand100;
              let stroke = TT.teal800;
              let strokeWidth = 1.6;
              let dash = "0";
              if (isRoot) {
                fill = TT.teal900;
                stroke = TT.gold500;
                strokeWidth = 2;
              } else if (hasPhone) {
                fill = TT.hasPhoneFill;
                stroke = TT.teal700;
              }
              if (isDeceased) {
                stroke = TT.deceasedLine;
                dash = "4 3";
              }
              if (isSelected) {
                stroke = TT.gold500;
                strokeWidth = 2.4;
              }

              return (
                <g
                  key={n.id}
                  data-node-id={n.id}
                  transform={`translate(${n.x - w / 2}, ${n.y})`}
                  onClick={() => { setSelectedNode(n.id); if (n.hasChildren) toggle(n.id); }}
                  style={{ cursor: n.hasChildren ? "pointer" : "default" }}
                >
                  <rect
                    width={w}
                    height={h}
                    rx={12}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dash}
                  />
                  <text
                    x={w / 2}
                    y={h / 2 - 2}
                    textAnchor="middle"
                    fontSize={isRoot ? 13.5 : 11.5}
                    fontWeight={isRoot ? 800 : 600}
                    fill={isRoot ? TT.gold400 : TT.text}
                    fontFamily="'Tajawal', sans-serif"
                  >
                    {(m?.name || "").length > 12 ? m.name.slice(0, 11) + "…" : m?.name}
                  </text>
                  {n.hasChildren && !expanded.has(n.id) && (
                    <text x={w / 2} y={h - 6} textAnchor="middle" fontSize={9} fill={TT.teal700} fontFamily="'Tajawal', sans-serif">
                      اضغط للتوسيع
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 10, fontSize: 11, color: T.muted }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: TT.hasPhoneFill, border: `1.4px solid ${TT.teal700}` }} /> جوال مسجّل
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.4px solid ${TT.teal800}` }} /> على قيد الحياة
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.4px dashed ${TT.deceasedLine}` }} /> متوفى رحمه الله
        </span>
      </div>
      </>
      )}
    </div>
  );
}

function MagazineReader({ pdfUrl, startPage, title, onClose }) {
  const canvasRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(startPage || 1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [flipDir, setFlipDir] = useState("forward");
  const prevPageRef = useRef(pageNum);

  const goToPage = (n) => {
    setFlipDir(n >= prevPageRef.current ? "forward" : "backward");
    prevPageRef.current = n;
    setPageNum(n);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const ensurePdfJs = () =>
      new Promise((resolve, reject) => {
        if (window.pdfjsLib) return resolve(window.pdfjsLib);
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = () => resolve(window.pdfjsLib);
        script.onerror = reject;
        document.body.appendChild(script);
      });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000));
    Promise.race([
      ensurePdfJs().then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        return pdfjsLib.getDocument({ url: pdfUrl, cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/", cMapPacked: true }).promise;
      }),
      timeout,
    ])
      .then((pdf) => {
        if (cancelled) return;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setLoading(false); setError(true); } });
    return () => { cancelled = true; };
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    const safePage = Math.min(Math.max(pageNum, 1), pdfDoc.numPages);
    pdfDoc.getPage(safePage).then((page) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const viewport = page.getViewport({ scale: 2 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      const ctx = canvas.getContext("2d");
      page.render({ canvasContext: ctx, viewport });
    });
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d2b2b", zIndex: 70, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "linear-gradient(160deg, #123838, #0d2b2b)", borderBottom: "2px solid #c9a227" }}>
        <a
          href={pdfUrl}
          download={`${title}.pdf`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(244,239,227,0.12)", border: "none", borderRadius: 999, color: "#F4EFE3", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 12px", textDecoration: "none" }}
        >
          تحميل
        </a>
        <span style={{ color: "#dab94a", fontSize: 12.5, fontWeight: 700, textAlign: "center", flex: 1, padding: "0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}{numPages ? ` — صفحة ${pageNum} من ${numPages}` : ""}
        </span>
        <button
          onClick={onClose}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(244,239,227,0.12)", border: "none", borderRadius: 999, color: "#F4EFE3", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 12px" }}
        >
          <X size={16} /> إغلاق
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "80px 0", color: "#F4EFE3" }}>
            <Loader2 size={24} style={{ animation: "rosette-spin 1.2s linear infinite" }} />
            <span style={{ fontSize: 13 }}>جارِ تحميل العدد...</span>
          </div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#F4EFE3" }}>
            <div style={{ marginBottom: 14 }}>تعذّر عرض العدد داخل الصفحة.</div>
            <a href={`${pdfUrl}#page=${pageNum}`} style={{ display: "inline-block", padding: "9px 18px", background: "#c9a227", color: "#0d2b2b", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
              فتح ملف PDF مباشرة{pageNum > 1 ? ` (صفحة ${pageNum})` : ""}
            </a>
            <div style={{ fontSize: 10.5, color: "#c9b98a", marginTop: 10 }}>يفتح بنفس الصفحة — اضغط سهم الرجوع بالمتصفح للعودة للتطبيق.</div>
          </div>
        )}
        <div style={{ perspective: "1600px", display: loading || error ? "none" : "block" }}>
          <canvas
            key={pageNum}
            ref={canvasRef}
            style={{
              display: "block",
              margin: "0 auto",
              transformOrigin: flipDir === "forward" ? "right center" : "left center",
              animation: `magazine-flip-${flipDir === "forward" ? "fwd" : "bwd"} 0.45s ease-out`,
            }}
          />
        </div>
        <style>{`
          @keyframes magazine-flip-fwd {
            0% { transform: rotateY(-35deg) scale(0.96); opacity: 0.4; }
            100% { transform: rotateY(0deg) scale(1); opacity: 1; }
          }
          @keyframes magazine-flip-bwd {
            0% { transform: rotateY(35deg) scale(0.96); opacity: 0.4; }
            100% { transform: rotateY(0deg) scale(1); opacity: 1; }
          }
        `}</style>
      </div>
      {!loading && !error && numPages > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px", background: "linear-gradient(160deg, #123838, #0d2b2b)", borderTop: "1px solid rgba(201,162,39,0.4)" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14 }}>
            <button onClick={() => goToPage(Math.max(pageNum - 1, 1))} disabled={pageNum <= 1} style={{ border: "1px solid #c9a227", background: "transparent", color: "#dab94a", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", opacity: pageNum <= 1 ? 0.4 : 1 }}>
              الصفحة السابقة
            </button>
            <span style={{ color: "#F4EFE3", fontSize: 12 }}>{pageNum} / {numPages}</span>
            <button onClick={() => goToPage(Math.min(pageNum + 1, numPages))} disabled={pageNum >= numPages} style={{ border: "1px solid #c9a227", background: "transparent", color: "#dab94a", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", opacity: pageNum >= numPages ? 0.4 : 1 }}>
              الصفحة التالية
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#c9b98a", fontSize: 11 }}>اذهب لصفحة:</span>
            <input
              key={pageNum}
              type="number"
              min={1}
              max={numPages}
              defaultValue={pageNum}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Math.min(Math.max(Number(e.target.value) || 1, 1), numPages);
                  goToPage(n);
                }
              }}
              onBlur={(e) => {
                const n = Math.min(Math.max(Number(e.target.value) || 1, 1), numPages);
                goToPage(n);
              }}
              style={{ width: 64, textAlign: "center", background: "rgba(244,239,227,0.1)", border: "1px solid rgba(201,162,39,0.5)", borderRadius: 8, color: "#F4EFE3", fontSize: 13, padding: "5px 4px" }}
            />
            <input
              type="range"
              min={1}
              max={numPages}
              value={pageNum}
              onChange={(e) => goToPage(Number(e.target.value))}
              style={{ flex: 1, maxWidth: 160 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MagazineTab({ canManageDocuments, onUploadingChange, onUploadResult }) {
  const [issues, setIssues] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [readerIssue, setReaderIssue] = useState(null);
  const [showAddIssue, setShowAddIssue] = useState(false);
  const [issueNumber, setIssueNumber] = useState("");
  const [issueTitle, setIssueTitle] = useState("الصلة");
  const [issueDate, setIssueDate] = useState("");
  const [issueFile, setIssueFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [addArticleFor, setAddArticleFor] = useState(null);
  const [editingOffsetFor, setEditingOffsetFor] = useState(null);
  const [offsetValue, setOffsetValue] = useState("");
  const saveOffset = async (issueId) => {
    const n = Number(offsetValue) || 0;
    const ok = await updateMagazineIssueOffset(issueId, n);
    if (ok) setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, page_offset: n } : i)));
    setEditingOffsetFor(null);
  };
  const [articleTitle, setArticleTitle] = useState("");
  const [articlePage, setArticlePage] = useState("");
  const [confirmDeleteIssue, setConfirmDeleteIssue] = useState(null);
  const [indexFile, setIndexFile] = useState(null);
  const [uploadingIndex, setUploadingIndex] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);

  const load = async () => {
    setLoading(true);
    const [i, a, idx] = await Promise.all([fetchMagazineIssues(), fetchMagazineArticles(), fetchMagazineIndexFile()]);
    setIssues(i);
    setArticles(a);
    setIndexFile(idx);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => () => onUploadingChange?.(false), []);

  const handleUploadIndex = async (file) => {
    if (!file) return;
    setUploadingIndex(true);
    const created = await uploadMagazineIndexFile(file);
    if (created) setIndexFile(created);
    setUploadingIndex(false);
  };

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return articles.filter((a) => a.title.includes(q) || (a.author || "").includes(q)).slice(0, 30);
  }, [query, articles]);

  const handleAddIssue = async () => {
    if (!issueNumber || !issueTitle.trim() || !issueFile) { setMsg("عبّي رقم العدد والعنوان واختر ملف PDF."); return; }
    const numForMsg = issueNumber;
    setUploading(true);
    onUploadingChange?.(true);
    setMsg("");
    let url;
    try {
      url = await uploadMagazinePdf(issueFile);
    } catch (e) {
      const failMsg = e.message || "تعذّر رفع الملف، حاول مرة أخرى.";
      setMsg(failMsg);
      setUploading(false);
      onUploadingChange?.(false);
      onUploadResult?.(`العدد ${numForMsg}: ${failMsg}`);
      return;
    }
    const created = await insertMagazineIssue({ issue_number: Number(issueNumber), title: issueTitle.trim(), pdf_url: url, published_date: issueDate || null });
    if (created) {
      setIssues((prev) => [created, ...prev.filter((i) => i.issue_number !== created.issue_number)].sort((a, b) => b.issue_number - a.issue_number));
      setIssueNumber(""); setIssueTitle("الصلة"); setIssueDate(""); setIssueFile(null); setShowAddIssue(false);
      setMsg("تمت إضافة العدد بنجاح.");
      onUploadResult?.(`✓ اكتمل رفع العدد ${numForMsg} بنجاح.`);
    } else {
      setMsg("تعذّرت الإضافة، حاول مرة أخرى.");
      onUploadResult?.(`العدد ${numForMsg}: تعذّرت الإضافة، حاول مرة أخرى.`);
    }
    setUploading(false);
    onUploadingChange?.(false);
  };

  const handleAddArticle = async (issueId) => {
    if (!articleTitle.trim()) return;
    const created = await insertMagazineArticle({ issue_id: issueId, title: articleTitle.trim(), page_number: articlePage ? Number(articlePage) : null });
    if (created) {
      setArticles((prev) => [{ ...created, magazine_issues: issues.find((i) => i.id === issueId) }, ...prev]);
      setArticleTitle(""); setArticlePage(""); setAddArticleFor(null);
    }
  };

  const handleDeleteArticle = async (id) => {
    await deleteMagazineArticle(id);
    setArticles((prev) => prev.filter((a) => a.id !== id));
  };

  const renderIssueCard = (issue, featured) => (
    <div
      key={issue.id}
      style={{
        background: featured ? `linear-gradient(160deg, ${T.ink}, ${T.inkSoft})` : T.card,
        border: featured ? `1.5px solid ${T.gold}` : `1px solid ${T.line}`,
        borderRadius: 14,
        padding: featured ? 18 : 14,
        marginBottom: 10,
      }}
    >
      {featured && (
        <div style={{ display: "inline-block", background: T.gold, color: T.ink, fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "3px 10px", marginBottom: 8 }}>
          العدد الحالي
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: featured ? 16 : 13.5, fontWeight: 800, color: featured ? T.goldLight : T.ink }}>مجلة {issue.title} {issue.issue_number}</div>
          {issue.published_date && <div style={{ fontSize: 10.5, color: featured ? "#CFE0DC" : T.muted, marginTop: 2 }}>{issue.published_date}</div>}
        </div>
        <BookOpen size={featured ? 24 : 20} color={T.gold} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={() => setReaderIssue({ pdfUrl: issue.pdf_url, startPage: 1, title: `${issue.title} ${issue.issue_number}` })} style={{ ...primaryBtnStyle, marginTop: 0, padding: "7px 14px", fontSize: 12, background: featured ? T.gold : T.ink, color: featured ? T.ink : T.sand }}>
          قراءة العدد
        </button>
        {canManageDocuments && (
          <>
            <button onClick={() => setAddArticleFor(addArticleFor === issue.id ? null : issue.id)} style={{ border: `1px solid ${featured ? T.goldLight : T.line}`, background: "transparent", color: featured ? T.goldLight : T.gold, borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
              + فهرس
            </button>
            <button onClick={() => { setEditingOffsetFor(editingOffsetFor === issue.id ? null : issue.id); setOffsetValue(String(issue.page_offset || 0)); }} style={{ border: `1px solid ${featured ? T.goldLight : T.line}`, background: "transparent", color: featured ? "#F4EFE3" : T.ink, borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
              فارق الصفحات ({issue.page_offset || 0})
            </button>
            <button onClick={() => setConfirmDeleteIssue({ id: issue.id, title: `${issue.title} ${issue.issue_number}` })} style={{ border: `1px solid ${featured ? T.clay : T.line}`, background: "transparent", color: T.clay, borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
              حذف
            </button>
          </>
        )}
      </div>
      {editingOffsetFor === issue.id && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${featured ? "rgba(244,239,227,0.3)" : T.line}`, display: "grid", gap: 6 }}>
          <div style={{ fontSize: 10.5, color: featured ? "#CFE0DC" : T.muted, lineHeight: 1.6 }}>
            الفارق بين رقم الصفحة المطبوع بالمجلة ورقم صفحة ملف الـPDF الفعلي. مثال: لو ص٥ بالمجلة هي فعليًا الصفحة ٨ بالملف (بسبب الغلاف والفهرس)، اكتب ٣.
          </div>
          <input type="number" placeholder="الفارق (مثال: 3)" value={offsetValue} onChange={(e) => setOffsetValue(e.target.value)} style={inputStyle} />
          <button onClick={() => saveOffset(issue.id)} style={primaryBtnStyle}>حفظ الفارق</button>
        </div>
      )}
      {addArticleFor === issue.id && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${featured ? "rgba(244,239,227,0.3)" : T.line}`, display: "grid", gap: 6 }}>
          <input placeholder="عنوان الموضوع" value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="رقم الصفحة (اختياري)" value={articlePage} onChange={(e) => setArticlePage(e.target.value)} style={inputStyle} />
          <button onClick={() => handleAddArticle(issue.id)} style={primaryBtnStyle}>إضافة للفهرس</button>
        </div>
      )}
      {articles.filter((a) => a.issue_id === issue.id).length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${featured ? "rgba(244,239,227,0.3)" : T.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, paddingBottom: 8, borderBottom: `2px solid ${T.clay}` }}>
            <span style={{ flexShrink: 0, width: 44, fontSize: 10.5, fontWeight: 700, color: featured ? "#CFE0DC" : T.muted }}>الصفحة</span>
            <span style={{ flex: 1, fontSize: 10.5, fontWeight: 700, color: featured ? "#CFE0DC" : T.muted }}>الموضوع</span>
          </div>
          {articles.filter((a) => a.issue_id === issue.id).map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: featured ? "#F4EFE3" : T.text, marginBottom: 6 }}>
              <button
                onClick={() => setReaderIssue({ pdfUrl: issue.pdf_url, startPage: (a.page_number || 1) + (issue.page_offset || 0), title: `${issue.title} ${issue.issue_number}` })}
                style={{ flexShrink: 0, width: 44, border: `1px solid ${T.gold}`, background: "transparent", color: featured ? T.goldLight : T.gold, borderRadius: 8, padding: "4px 4px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, textAlign: "center" }}
              >
                {a.page_number || "فتح"}
              </button>
              <span style={{ flex: 1 }}>{a.title}</span>
              {canManageDocuments && (
                <button onClick={() => handleDeleteArticle(a.id)} style={{ background: "none", border: "none", color: T.clay, cursor: "pointer", flexShrink: 0 }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const handleDeleteIssue = async () => {
    if (!confirmDeleteIssue) return;
    await deleteMagazineIssue(confirmDeleteIssue.id);
    setIssues((prev) => prev.filter((i) => i.id !== confirmDeleteIssue.id));
    setArticles((prev) => prev.filter((a) => a.issue_id !== confirmDeleteIssue.id));
    setConfirmDeleteIssue(null);
  };

  return (
    <div>
      <SectionTitle action={canManageDocuments && (
        <IconButton onClick={() => setShowAddIssue((v) => !v)} active={showAddIssue}><Plus size={14} /> عدد جديد</IconButton>
      )}>
        مجلة العائلة
      </SectionTitle>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={17} color={T.gold} />
          <span style={{ fontSize: 12, color: T.text }}>
            {indexFile ? "الفهرس الشامل لموضوعات كل الأعداد" : "ما فيه فهرس شامل مرفوع بعد"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {indexFile && (
            <a href={indexFile.file_url} target="_blank" rel="noopener noreferrer" style={{ border: "none", background: T.ink, color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontFamily: "inherit", fontWeight: 700, textDecoration: "none" }}>
              فتح الفهرس
            </a>
          )}
          {canManageDocuments && (
            <label style={{ border: `1px solid ${T.gold}`, color: T.gold, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
              {uploadingIndex ? "جارِ الرفع..." : indexFile ? "استبدال" : "رفع الفهرس"}
              <input type="file" accept="application/pdf,.doc,.docx" onChange={(e) => handleUploadIndex(e.target.files[0])} style={{ display: "none" }} disabled={uploadingIndex} />
            </label>
          )}
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} style={{ position: "absolute", right: 12, top: 11, color: T.muted }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بموضوع أو اسم الكاتب..." style={{ ...inputStyle, padding: "9px 38px 9px 12px" }} />
      </div>

      {query.trim() && (
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 14, background: T.card, marginBottom: 14, overflow: "auto", maxHeight: "40vh" }}>
          {searchResults.length === 0 ? (
            <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: T.muted }}>لا نتائج مطابقة بالفهرس.</div>
          ) : (
            searchResults.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${T.line}` }}>
                <button
                  onClick={() => {
                    const issue = issues.find((i) => i.id === a.issue_id);
                    if (issue) setReaderIssue({ pdfUrl: issue.pdf_url, startPage: (a.page_number || 1) + (issue.page_offset || 0), title: `${issue.title} ${issue.issue_number}` });
                  }}
                  style={{ flexShrink: 0, width: 44, border: "none", background: "#123838", color: "#dab94a", borderRadius: 8, padding: "6px 4px", fontSize: 11, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", textAlign: "center" }}
                >
                  {a.page_number || "فتح"}
                </button>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{a.title}</div>
                  <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>
                    {a.author ? `${a.author} · ` : ""}مجلة {a.magazine_issues?.title} {a.magazine_issues?.issue_number}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {msg && <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 8, background: "#E8F3EC", color: "#2F7D4F", fontSize: 11.5, fontWeight: 700 }}>{msg}</div>}

      {showAddIssue && canManageDocuments && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "grid", gap: 8 }}>
          <input type="number" placeholder="رقم العدد" value={issueNumber} onChange={(e) => setIssueNumber(e.target.value)} style={inputStyle} />
          <input placeholder="اسم المجلة (افتراضي: الصلة)" value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} style={inputStyle} />
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={{ ...inputStyle, minWidth: 0, maxWidth: "100%" }} />
          <label style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: issueFile ? T.text : T.muted }}>
            <Upload size={15} color={T.gold} /> {issueFile ? issueFile.name : "اختر ملف PDF للعدد"}
            <input type="file" accept="application/pdf" onChange={(e) => setIssueFile(e.target.files[0])} style={{ display: "none" }} />
          </label>
          <button onClick={handleAddIssue} disabled={uploading} style={primaryBtnStyle}>
            {uploading ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : "رفع العدد"}
          </button>
        </div>
      )}

      {loading ? (
        <Loader2 size={20} style={{ animation: "rosette-spin 1s linear infinite" }} />
      ) : issues.length === 0 ? (
        <EmptyState text="لا توجد أعداد مرفوعة بعد." />
      ) : (
        <>
          {renderIssueCard(issues[0], true)}
          {issues.length > 1 && (
            <button
              onClick={() => setShowPrevious((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, color: T.ink, cursor: "pointer", marginBottom: 14 }}
            >
              <BookOpen size={15} color={T.gold} />
              {showPrevious ? "إخفاء الأعداد السابقة" : `الأعداد السابقة (${issues.length - 1})`}
              {showPrevious ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
          {showPrevious && issues.slice(1).map((issue) => renderIssueCard(issue, false))}
        </>
      )}

      {readerIssue && (
        <MagazineReader pdfUrl={readerIssue.pdfUrl} startPage={readerIssue.startPage} title={readerIssue.title} onClose={() => setReaderIssue(null)} />
      )}

      {confirmDeleteIssue && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={() => setConfirmDeleteIssue(null)}>
          <div style={{ background: T.card, borderRadius: 16, padding: 20, width: "100%", maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 8 }}>حذف "{confirmDeleteIssue.title}"؟</div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 16 }}>سيُحذف العدد وكل عناصر فهرسه نهائيًا.</div>
            <button onClick={handleDeleteIssue} style={{ width: "100%", background: T.clay, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>تأكيد الحذف</button>
            <button onClick={() => setConfirmDeleteIssue(null)} style={{ width: "100%", background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>تراجع</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventsTab({ events, setEvents, meId, canManageEvents }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", location: "", description: "" });
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const submit = async () => {
    if (!form.title.trim() || !form.date) return;
    if (editingId) {
      const updated = await updateEvent(editingId, form);
      if (updated) {
        const old = events.find((e) => e.id === editingId);
        setEvents(events.map((e) => (e.id === editingId ? { ...updated, attendees: old.attendees } : e)));
      }
    } else {
      const created = await insertEvent(form);
      if (created) setEvents([created, ...events]);
    }
    setForm({ title: "", date: "", location: "", description: "" });
    setEditingId(null);
    setOpen(false);
  };

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setForm({ title: ev.title, date: ev.date, location: ev.location || "", description: ev.description || "" });
    setOpen(true);
  };

  const remove = (id) => setConfirmDeleteId(id);

  const confirmRemove = async () => {
    const ok = await deleteEvent(confirmDeleteId);
    if (ok) setEvents(events.filter((e) => e.id !== confirmDeleteId));
    setConfirmDeleteId(null);
  };

  const toggleRSVP = async (eventId) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const attending = ev.attendees.includes(meId);
    await setAttendance(eventId, meId, attending);
    const updated = events.map((e) => (e.id !== eventId ? e : { ...e, attendees: attending ? e.attendees.filter((a) => a !== meId) : [...e.attendees, meId] }));
    setEvents(updated);
  };

  return (
    <div>
      <SectionTitle action={canManageEvents && (
        <IconButton onClick={() => { setOpen((v) => !v); setEditingId(null); setForm({ title: "", date: "", location: "", description: "" }); }} active={open}>
          <Plus size={14} /> مناسبة جديدة
        </IconButton>
      )}>
        المناسبات
      </SectionTitle>

      {open && canManageEvents && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "grid", gap: 8 }}>
          <input placeholder="عنوان المناسبة" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} />
          <input placeholder="المكان" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={inputStyle} />
          <textarea placeholder="تفاصيل مختصرة" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, resize: "none" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submit} style={{ ...primaryBtnStyle, flex: 1 }}>{editingId ? "حفظ التعديل" : "إضافة المناسبة"}</button>
            <button
              onClick={() => { setOpen(false); setEditingId(null); setForm({ title: "", date: "", location: "", description: "" }); }}
              style={{ background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}
            >
              تراجع
            </button>
          </div>
        </div>
      )}

      {events.length === 0 && <EmptyState text="لا توجد مناسبات مجدولة حاليًا." />}

      {events.map((ev) => {
        const attending = ev.attendees.includes(meId);
        return (
          <div key={ev.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>{ev.title}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><CalendarDays size={13} /> {ev.date}</span>
              {ev.location && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={13} /> {ev.location}</span>}
            </div>
            {ev.description && <div style={{ fontSize: 12.5, color: T.text, marginTop: 8, lineHeight: 1.6 }}>{ev.description}</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <span style={{ fontSize: 11.5, color: T.muted }}>{ev.attendees.length} من العائلة سيحضرون</span>
              <button onClick={() => toggleRSVP(ev.id)} style={{ border: `1px solid ${attending ? T.gold : T.line}`, background: attending ? T.ink : "transparent", color: attending ? T.sand : T.ink, borderRadius: 999, padding: "6px 14px", fontSize: 12, fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                {attending && <Check size={13} />} {attending ? "مؤكّد الحضور" : "تأكيد الحضور"}
              </button>
            </div>
            {canManageEvents && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
                <button onClick={() => startEdit(ev)} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${T.line}`, background: "transparent", color: T.gold, borderRadius: 8, padding: "5px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
                  <Pencil size={12} /> تعديل
                </button>
                <button onClick={() => remove(ev.id)} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${T.line}`, background: "transparent", color: T.clay, borderRadius: 8, padding: "5px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
                  <Trash2 size={12} /> حذف
                </button>
              </div>
            )}
          </div>
        );
      })}

      {confirmDeleteId && (
        <ConfirmModal
          onConfirm={confirmRemove}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

function MemberDetailModal({ member, members, canManageTree, onClose, onSaved }) {
  const [isAlive, setIsAlive] = useState(member.isAlive);
  const [deathDate, setDeathDate] = useState(member.deathDate || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showFullNasab, setShowFullNasab] = useState(false);

  const daughters = members.filter((m) => m.fatherId === member.id && m.gender === "female");
  const wives = members.filter((m) => m.spouseOf === member.id);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateMemberDeathStatus(member.id, isAlive, deathDate);
      onSaved({ ...member, isAlive, deathDate: isAlive ? "" : deathDate });
    } catch (e) {
      setError(e.message || "تعذّر حفظ التعديل.");
    }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div style={{ background: T.card, borderRadius: "18px 18px 0 0", padding: 22, width: "100%", maxWidth: 430, maxHeight: "88vh", overflowY: "auto", fontFamily: "'Tajawal', sans-serif" }} onClick={(e) => e.stopPropagation()} dir="rtl">
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Avatar name={member.name} photoUrl={member.photoUrl} gender={member.gender} size={84} />
          </div>
          <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 19, color: T.ink, fontWeight: 700, marginTop: 10 }}>
            {(showFullNasab ? member.fullNasab : member.nasab) || member.name}
          </div>
          {member.fullNasab && member.fullNasab !== member.nasab && (
            <button onClick={() => setShowFullNasab((v) => !v)} style={{ background: "none", border: "none", color: T.gold, fontSize: 11, fontFamily: "inherit", cursor: "pointer", marginTop: 2 }}>
              {showFullNasab ? "إخفاء سلسلة النسب" : "إظهار سلسلة النسب كاملة"}
            </button>
          )}
          {member.memberNumber && (
            <div style={{ fontSize: 11, color: T.gold, fontWeight: 700, marginTop: 4 }}>
              رقم العضوية: {member.memberNumber}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: T.text }}>
          {member.region && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><MapPin size={15} color={T.gold} /> {member.region}</div>}
          {member.birthDate && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Cake size={15} color={T.gold} />
              {formatDate(member.birthDate, member.birthDatePrecision)}
              {member.birthPlace && <span> — {member.birthPlace}</span>}
            </div>
          )}
          {member.isAlive && member.phone && member.phoneVisible && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Phone size={15} color={T.gold} /> {member.phone}</div>}
          {member.isAlive && member.prefilledEmail && member.emailVisible && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Link2 size={15} color={T.gold} /> {member.prefilledEmail}</div>}
          {!member.isAlive && (
            <div style={{ color: T.clay, fontWeight: 700 }}>
              متوفى رحمه الله
              {member.deathDate && <span> — ت: {formatDate(member.deathDate, member.deathDatePrecision)}</span>}
            </div>
          )}
        </div>
        {member.extendedVisible ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${T.line}` }}>
            {member.job && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text, marginBottom: 6 }}><Briefcase size={14} color={T.gold} /> {member.job}</div>}
            {member.bio && <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.7 }}>{member.bio}</div>}
            {member.socialLinks && Object.keys(member.socialLinks).length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {Object.entries(member.socialLinks).map(([k, v]) => v && (
                  <span key={k} style={{ fontSize: 11.5, color: T.gold, display: "flex", alignItems: "center", gap: 3 }}><Link2 size={11} /> {v}</span>
                ))}
              </div>
            )}
            {member.cvUrl && (
              <a href={member.cvUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "7px 14px", background: T.sandDark, border: `1px solid ${T.line}`, borderRadius: 999, color: T.ink, textDecoration: "none", fontSize: 11.5, fontWeight: 700 }}>
                <FileText size={13} /> عرض السيرة الذاتية
              </a>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${T.line}`, fontSize: 12, color: T.muted, textAlign: "center" }}>
            الملف الموسّع (السيرة والتواصل) مخفي — العضو لم يفعّل عرضه للعائلة.
          </div>
        )}
        {(wives.length > 0 || daughters.length > 0) && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${T.line}` }}>
            {wives.length > 0 && (
              <div style={{ marginBottom: daughters.length > 0 ? 10 : 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: T.gold, marginBottom: 6 }}>{wives.length > 1 ? "الزوجات" : "الزوجة"}</div>
                {wives.map((w) => (
                  <div key={w.id} style={{ fontSize: 12.5, color: T.text, marginBottom: 3 }}>{w.name}</div>
                ))}
              </div>
            )}
            {daughters.length > 0 && (
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: T.gold, marginBottom: 6 }}>{daughters.length > 1 ? "البنات" : "الابنة"}</div>
                {daughters.map((d) => (
                  <div key={d.id} style={{ fontSize: 12.5, color: T.text, marginBottom: 3 }}>{d.name}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {canManageTree && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${T.line}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 8 }}>تعديل حالة الوفاة</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.text, marginBottom: 8 }}>
              <input type="checkbox" checked={!isAlive} onChange={(e) => setIsAlive(!e.target.checked)} /> متوفى
            </label>
            {!isAlive && <input type="date" value={deathDate || ""} onChange={(e) => setDeathDate(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />}
            <button onClick={handleSave} disabled={saving} style={{ ...primaryBtnStyle, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {saving ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : <Save size={14} />} حفظ
            </button>
            {error && <div style={{ color: T.clay, fontSize: 12, marginTop: 6 }}>{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function FatherPicker({ members, fatherId, onSelect, label = "الأب", placeholder = "ابحث عن اسم الأب لربط العضو الجديد..." }) {
  const [q, setQ] = useState("");
  const father = members.find((m) => m.id === fatherId);
  const matches = q.trim().length >= 2 ? members.filter((m) => m.name.includes(q)).slice(0, 6) : [];
  return (
    <div>
      {father ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...inputStyle }}>
          <span>{label}: {father.name} ({father.nasab})</span>
          <button onClick={() => onSelect(null)} style={{ border: "none", background: "none", cursor: "pointer", color: T.clay }}><X size={14} /></button>
        </div>
      ) : (
        <>
          <input placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} style={inputStyle} />
          {matches.length > 0 && (
            <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, marginTop: 4, overflow: "hidden" }}>
              {matches.map((m) => (
                <button key={m.id} onClick={() => { onSelect(m.id); setQ(""); }} style={{ display: "block", width: "100%", textAlign: "right", padding: "8px 12px", border: "none", background: T.card, borderBottom: `1px solid ${T.line}`, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>
                  {m.name} — {m.nasab}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MemberCard({ m, onOpen }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 13, marginBottom: 9, position: "relative" }}>
      <button onClick={() => onOpen(m)} title="عرض الملف الكامل" style={{ position: "absolute", top: 10, left: 10, width: 28, height: 28, borderRadius: 8, background: T.sandDark, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.ink, cursor: "pointer" }}>
        <FileText size={13} />
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <Avatar name={m.name} photoUrl={m.photoUrl} gender={m.gender} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{m.name}</div>
          <div style={{ fontSize: 11.5, color: T.muted }}>{m.nasab}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        {m.region && <span style={{ fontSize: 11.5, color: T.text, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={12} color={T.gold} /> {m.region}</span>}
        {m.birthDate && <span style={{ fontSize: 11.5, color: T.text, display: "flex", alignItems: "center", gap: 4 }}><Cake size={12} color={T.gold} /> {formatDate(m.birthDate, m.birthDatePrecision)}</span>}
      </div>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
        {!m.isAlive ? (
          <div style={{ fontSize: 11.5, color: T.clay, lineHeight: 1.5 }}>
            متوفى رحمه الله
            {m.deathDate && <span> — ت: {formatDate(m.deathDate, m.deathDatePrecision)}</span>}
          </div>
        ) : m.phone && m.phoneVisible ? (
          <div style={{ fontSize: 11.5, color: T.ink, display: "flex", alignItems: "center", gap: 4 }}><Phone size={12} color={T.gold} /> {m.phone}</div>
        ) : (
          <div style={{ fontSize: 11, color: T.muted }}>—</div>
        )}
      </div>
    </div>
  );
}

function MembersTab({ members, setMembers, profilesMap, canManageTree }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", fatherId: null, spouseOf: null, gender: "male", region: "", phone: "" });
  const [selected, setSelected] = useState(null);

  const visibleMembers = members.filter((m) => m.gender !== "female");
  const filtered = visibleMembers.filter((m) => !query || m.name.includes(query) || m.branch.includes(query) || (m.memberNumber && m.memberNumber.includes(query)));

  const submit = async () => {
    if (!form.name.trim()) return;
    const created = await insertMember(form);
    if (created) {
      const enrichedAll = enrichMembers([...members, created], profilesMap);
      setMembers(enrichedAll);
    }
    setForm({ name: "", fatherId: null, spouseOf: null, gender: "male", region: "", phone: "" });
    setOpen(false);
  };

  return (
    <div>
      <SectionTitle action={<IconButton onClick={() => setOpen((v) => !v)} active={open}><Plus size={14} /> عضو جديد</IconButton>}>
        الأعضاء ({visibleMembers.length})
      </SectionTitle>
      {open && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "grid", gap: 8 }}>
          <input placeholder="الاسم الأول" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <FatherPicker members={members} fatherId={form.fatherId} onSelect={(id) => setForm({ ...form, fatherId: id })} />
          <FatherPicker
            members={members}
            fatherId={form.spouseOf}
            onSelect={(id) => setForm({ ...form, spouseOf: id, gender: id ? "female" : form.gender })}
            label="زوجة لـ"
            placeholder="اختياري: ابحث عن اسم الزوج لو العضو زوجة قادمة من خارج العائلة..."
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setForm({ ...form, gender: "male" })} style={{ ...inputStyle, cursor: "pointer", background: form.gender === "male" ? T.sandDark : T.sand, textAlign: "center" }}>ذكر</button>
            <button onClick={() => setForm({ ...form, gender: "female" })} style={{ ...inputStyle, cursor: "pointer", background: form.gender === "female" ? T.sandDark : T.sand, textAlign: "center" }}>أنثى</button>
          </div>
          <input placeholder="المنطقة (اختياري)" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={inputStyle} />
          <input placeholder="رقم الجوال (اختياري)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
          <button onClick={submit} style={primaryBtnStyle}>إضافة العضو</button>
        </div>
      )}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} style={{ position: "absolute", right: 12, top: 11, color: T.muted }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الفرع..." style={{ ...inputStyle, padding: "9px 38px 9px 12px" }} />
      </div>
      {filtered.length === 0 && <EmptyState text="لا يوجد أعضاء مطابقون." />}
      {filtered.map((m) => <MemberCard key={m.id} m={m} onOpen={setSelected} />)}
      {selected && (
        <MemberDetailModal
          member={selected}
          members={members}
          canManageTree={canManageTree}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            const rawUpdated = members.map((m) => (m.id === updated.id ? { ...m, isAlive: updated.isAlive, deathDate: updated.deathDate } : m));
            setMembers(enrichMembers(rawUpdated, profilesMap));
            setSelected({ ...selected, isAlive: updated.isAlive, deathDate: updated.deathDate });
          }}
        />
      )}
    </div>
  );
}

const ADMIN_PERMISSIONS = [
  { key: "manage_registrations", label: "إدارة تسجيل الأعضاء ومشكلاته" },
  { key: "manage_news", label: "إضافة/تعديل الأخبار وإرسالها كإشعار" },
  { key: "manage_events", label: "إدارة الفعاليات والمناسبات" },
  { key: "manage_documents", label: "رفع وإدارة الوثائق" },
  { key: "manage_tree_profiles", label: "تعديل الشجرة وصفحات الأعضاء (بما فيها حالة الوفاة)" },
  { key: "manage_admins", label: "إضافة/حذف مشرفين آخرين" },
];

function normalizeSaudiPhoneLocal(p) {
  const digits = p.replace(/\D/g, "");
  if (p.startsWith("+966")) return "+966" + digits.slice(3);
  if (digits.startsWith("966")) return "+" + digits;
  if (digits.startsWith("0")) return "+966" + digits.slice(1);
  return "+966" + digits;
}

function AdminsTab({ members, setMembers, profilesMap, canManageTree, canManageAdmins }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [newPerms, setNewPerms] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRemoveAdmin, setConfirmRemoveAdmin] = useState(null);
  const [pendingBirths, setPendingBirths] = useState([]);
  const [loadingBirths, setLoadingBirths] = useState(true);
  const [birthBusyId, setBirthBusyId] = useState(null);
  const [treeQuery, setTreeQuery] = useState("");
  const [confirmDeleteMember, setConfirmDeleteMember] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [savingMember, setSavingMember] = useState(false);

  const normA = (s) => (s || "").replace(/بن/g, " ").replace(/\s+/g, " ").trim();
  const treeSearchResults = useMemo(() => {
    const nq = normA(treeQuery);
    if (!nq) return [];
    return members
      .filter((m) => normA(m.nasab || "").startsWith(nq))
      .sort((a, b) => (a.nasab || "").localeCompare(b.nasab || "", "ar"))
      .slice(0, 50);
  }, [treeQuery, members]);

  const handleDeleteMember = async () => {
    if (!confirmDeleteMember) return;
    await deleteMember(confirmDeleteMember.id);
    setMembers(members.filter((m) => m.id !== confirmDeleteMember.id));
    setConfirmDeleteMember(null);
  };

  const saveEditMember = async () => {
    if (!editingMember) return;
    setSavingMember(true);
    const ok = await updateMemberAdmin(editingMember.id, editingMember);
    if (ok) {
      const rawUpdated = members.map((m) => (m.id === editingMember.id ? { ...m, name: editingMember.name, region: editingMember.region, birthDate: editingMember.birthDate, birthPlace: editingMember.birthPlace } : m));
      setMembers(enrichMembers(rawUpdated, profilesMap));
    }
    setSavingMember(false);
    setEditingMember(null);
  };

  const loadPendingBirths = async () => {
    setLoadingBirths(true);
    const rows = await fetchPendingBirthRequests();
    setPendingBirths(rows);
    setLoadingBirths(false);
  };

  useEffect(() => { loadPendingBirths(); }, []);

  const [birthAdminMsg, setBirthAdminMsg] = useState("");

  const handleApproveBirth = async (req) => {
    setBirthBusyId(req.id);
    setBirthAdminMsg("");
    const created = await approveBirthRequest(req);
    if (created && created.duplicate) {
      setBirthAdminMsg(`"${req.proposed_changes?.name}" مسجّل مسبقًا بنفس الاسم لنفس الأب — راجع الطلب مع مقدّمه قبل الاعتماد.`);
      setBirthBusyId(null);
      return;
    }
    if (created) {
      setMembers(enrichMembers([...members, created], profilesMap));
    }
    if (req.requested_by) {
      sendFamilyEmail({
        type: "congrats",
        requestedByUserId: req.requested_by,
        childName: req.proposed_changes?.name,
        gender: req.proposed_changes?.gender,
      });
    }
    setPendingBirths((prev) => prev.filter((r) => r.id !== req.id));
    setBirthBusyId(null);
  };

  const handleRejectBirth = async (req) => {
    setBirthBusyId(req.id);
    await rejectBirthRequest(req.id);
    setPendingBirths((prev) => prev.filter((r) => r.id !== req.id));
    setBirthBusyId(null);
  };

  const loadAdmins = async () => {
    setLoading(true);
    const { data: roles, error } = await supabase.from("member_roles").select("id, user_id, role, permissions").neq("role", "owner");
    if (error || !roles) { setLoading(false); return; }
    setAdmins(roles.map((r) => {
      const m = members.find((mm) => mm.userAccountId === r.user_id);
      return { ...r, memberName: m?.nasab || m?.name || "عضو" };
    }));
    setLoading(false);
  };

  useEffect(() => { loadAdmins(); }, []);

  const handleAddAdmin = async () => {
    setError(""); setSuccess("");
    if (!phone.trim()) return setError("أدخل رقم جوال العضو أول.");
    setBusy(true);
    try {
      const normalizedPhone = normalizeSaudiPhoneLocal(phone.trim());
      const { data: member, error: findErr } = await supabase.from("members").select("id, user_account_id, first_name").eq("phone", normalizedPhone).maybeSingle();
      if (findErr) throw findErr;
      if (!member) return setError("ما فيه عضو بهذا الرقم بقائمة العائلة.");
      if (!member.user_account_id) return setError("هذا العضو لسه ما سجّل حساب بالموقع، لازم يسجّل أول.");
      const permsObj = {};
      ADMIN_PERMISSIONS.forEach((p) => { permsObj[p.key] = !!newPerms[p.key]; });
      const { error: insertErr } = await supabase.from("member_roles").insert({ user_id: member.user_account_id, role: "admin", permissions: permsObj });
      if (insertErr) throw insertErr;
      setSuccess(`تمت إضافة ${member.first_name} كمشرف.`);
      setPhone("");
      setNewPerms({});
      loadAdmins();
    } catch (e) {
      setError(e.message || "تعذّر إضافة المشرف.");
    }
    setBusy(false);
  };

  const handleTogglePermission = async (adminRow, key) => {
    const updated = { ...adminRow.permissions, [key]: !adminRow.permissions?.[key] };
    const { error } = await supabase.from("member_roles").update({ permissions: updated }).eq("id", adminRow.id);
    if (!error) setAdmins((prev) => prev.map((a) => (a.id === adminRow.id ? { ...a, permissions: updated } : a)));
  };

  const handleRemoveAdmin = (adminRow) => setConfirmRemoveAdmin(adminRow);

  const doRemoveAdmin = async () => {
    const { error } = await supabase.from("member_roles").delete().eq("id", confirmRemoveAdmin.id);
    if (!error) setAdmins((prev) => prev.filter((a) => a.id !== confirmRemoveAdmin.id));
    setConfirmRemoveAdmin(null);
  };

  return (
    <div>
      <div style={{ background: `linear-gradient(160deg, ${T.ink}, ${T.inkSoft})`, borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <Shield size={22} color={T.goldLight} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: T.goldLight }}>لوحة الإشراف</div>
          <div style={{ fontSize: 10.5, color: "#CFE0DC", marginTop: 2 }}>
            {canManageAdmins ? "مشرف عام — كل الصلاحيات" : "الأقسام المتاحة لك حسب صلاحيتك"}
          </div>
        </div>
      </div>

      {canManageTree && (
        <>
      <SectionTitle>إدارة الشجرة (بحث، تعديل، حذف)</SectionTitle>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={15} style={{ position: "absolute", right: 12, top: 11, color: T.muted }} />
        <input value={treeQuery} onChange={(e) => setTreeQuery(e.target.value)} placeholder="ابحث عن عضو لتعديله أو حذفه..." style={{ ...inputStyle, padding: "9px 38px 9px 12px" }} />
      </div>
      {treeQuery.trim() && (
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 12, background: T.card, marginBottom: 16, overflow: "auto", maxHeight: "45vh" }}>
          {treeSearchResults.length === 0 ? (
            <div style={{ padding: 12, textAlign: "center", fontSize: 11.5, color: T.muted }}>لا نتائج مطابقة.</div>
          ) : (
            treeSearchResults.map((m) => (
              <div key={m.id} style={{ padding: "8px 10px", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, wordBreak: "break-word" }}>{m.nasab}</div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>
                  {m.memberNumber ? `#${m.memberNumber}` : ""}{m.gender === "female" ? " · أنثى" : ""}{m.region ? ` · ${m.region}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button
                    onClick={() => setEditingMember({ id: m.id, name: m.name, region: m.region || "", birthDate: m.birthDate || "", birthPlace: m.birthPlace || "" })}
                    style={{ border: `1px solid ${T.gold}`, background: "transparent", color: T.gold, borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontSize: 10.5, fontFamily: "inherit", fontWeight: 700 }}
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => {
                      const childrenCount = members.filter((mm) => mm.fatherId === m.id).length;
                      setConfirmDeleteMember({ id: m.id, name: m.name, childrenCount });
                    }}
                    style={{ border: `1px solid ${T.clay}`, background: "transparent", color: T.clay, borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontSize: 10.5, fontFamily: "inherit", fontWeight: 700 }}
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {editingMember && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} onClick={() => setEditingMember(null)}>
          <div style={{ background: T.card, borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 430 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 10 }}>تعديل بيانات {editingMember.name}</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input placeholder="الاسم" value={editingMember.name} onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })} style={inputStyle} />
              <input placeholder="المنطقة" value={editingMember.region} onChange={(e) => setEditingMember({ ...editingMember, region: e.target.value })} style={inputStyle} />
              <div style={{ fontSize: 11, color: T.muted }}>تاريخ الميلاد</div>
              <input type="date" value={editingMember.birthDate} onChange={(e) => setEditingMember({ ...editingMember, birthDate: e.target.value })} style={{ ...inputStyle, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }} />
              <input placeholder="مكان الميلاد" value={editingMember.birthPlace} onChange={(e) => setEditingMember({ ...editingMember, birthPlace: e.target.value })} style={inputStyle} />
              <button onClick={saveEditMember} disabled={savingMember} style={primaryBtnStyle}>
                {savingMember ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : "حفظ"}
              </button>
              <button onClick={() => setEditingMember(null)} style={{ background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteMember && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={() => setConfirmDeleteMember(null)}>
          <div style={{ background: T.card, borderRadius: 16, padding: 20, width: "100%", maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 8 }}>حذف {confirmDeleteMember.name}؟</div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 16 }}>
              الحذف نهائي ولا يمكن التراجع عنه.
              {confirmDeleteMember.childrenCount > 0 && (
                <span style={{ color: T.clay, fontWeight: 700 }}> تنبيه: لهذا العضو {confirmDeleteMember.childrenCount} من الأبناء المرتبطين به بالشجرة — حذفه سيقطع ارتباطهم بجدّهم.</span>
              )}
            </div>
            <button onClick={handleDeleteMember} style={{ width: "100%", background: T.clay, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
              تأكيد الحذف
            </button>
            <button onClick={() => setConfirmDeleteMember(null)} style={{ width: "100%", background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
              تراجع
            </button>
          </div>
        </div>
      )}

      <SectionTitle>طلبات تسجيل مواليد بانتظار الاعتماد</SectionTitle>
      {birthAdminMsg && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "#FBEAEA", color: T.clay, fontSize: 11.5, fontWeight: 700 }}>
          {birthAdminMsg}
        </div>
      )}
      {loadingBirths ? (
        <Loader2 size={18} style={{ animation: "rosette-spin 1s linear infinite" }} />
      ) : pendingBirths.length === 0 ? (
        <EmptyState text="لا توجد طلبات معلّقة حاليًا." />
      ) : (
        pendingBirths.map((req) => (
          <div key={req.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{req.proposed_changes?.name}</div>
            <div style={{ fontSize: 10.5, color: T.muted, marginTop: 1 }}>
              مولود {req.proposed_changes?.gender === "female" ? "أنثى" : "ذكر"}{req.proposed_changes?.birth_date ? ` · ${req.proposed_changes.birth_date}` : ""}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={() => handleApproveBirth(req)} disabled={birthBusyId === req.id} style={{ ...primaryBtnStyle, flex: 1, marginTop: 0, padding: "6px 10px", fontSize: 11.5 }}>اعتماد</button>
              <button onClick={() => handleRejectBirth(req)} disabled={birthBusyId === req.id} style={{ background: "transparent", color: T.clay, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", flex: 1 }}>رفض</button>
            </div>
          </div>
        ))
      )}
        </>
      )}

      {canManageAdmins && (
        <>
      <SectionTitle>إدارة المشرفين</SectionTitle>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><UserPlus size={15} /> إضافة مشرف جديد</div>
        <input type="tel" placeholder="رقم جوال العضو (لازم يكون مسجّل بالموقع مسبقًا)" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
        <div style={{ marginTop: 12 }}>
          {ADMIN_PERMISSIONS.map((p) => (
            <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.text, marginBottom: 6 }}>
              <input type="checkbox" checked={!!newPerms[p.key]} onChange={(e) => setNewPerms((prev) => ({ ...prev, [p.key]: e.target.checked }))} />
              {p.label}
            </label>
          ))}
        </div>
        <button onClick={handleAddAdmin} disabled={busy} style={{ ...primaryBtnStyle, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
          {busy ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : <Save size={14} />} إضافة المشرف
        </button>
        {error && <div style={{ color: T.clay, fontSize: 12, marginTop: 8 }}>{error}</div>}
        {success && <div style={{ color: "#3A7D5C", fontSize: 12, marginTop: 8 }}>{success}</div>}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 8 }}>المشرفون الحاليون</div>
      {loading ? (
        <Loader2 size={20} style={{ animation: "rosette-spin 1s linear infinite" }} />
      ) : admins.length === 0 ? (
        <EmptyState text="ما فيه مشرفين مضافين حاليًا." />
      ) : (
        admins.map((a) => (
          <div key={a.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{a.memberName}</div>
              <button onClick={() => handleRemoveAdmin(a)} style={{ background: "none", border: "none", color: T.clay, cursor: "pointer" }} title="إزالة الإشراف"><Trash2 size={16} /></button>
            </div>
            {ADMIN_PERMISSIONS.map((p) => (
              <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.text, marginBottom: 6 }}>
                <input type="checkbox" checked={!!a.permissions?.[p.key]} onChange={() => handleTogglePermission(a, p.key)} />
                {p.label}
              </label>
            ))}
          </div>
        ))
      )}

      {confirmRemoveAdmin && (
        <ConfirmModal
          onConfirm={doRemoveAdmin}
          onCancel={() => setConfirmRemoveAdmin(null)}
        />
      )}
        </>
      )}
    </div>
  );
}

function ProfileTab({ members, setMembers, profilesMap, setProfilesMap, meId }) {
  const me = members.find((m) => m.id === meId);
  const [mode, setMode] = useState("view");
  const [form, setForm] = useState(me);
  const [daughterName, setDaughterName] = useState("");
  const [daughterEmail, setDaughterEmail] = useState("");
  const [wifeName, setWifeName] = useState("");
  const [wifeEmail, setWifeEmail] = useState("");
  const [addingDaughter, setAddingDaughter] = useState(false);
  const [addingWife, setAddingWife] = useState(false);
  const [showAddDaughter, setShowAddDaughter] = useState(false);
  const [showAddWife, setShowAddWife] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // { type: 'daughter'|'wife', id, name }
  const [showAddBirth, setShowAddBirth] = useState(false);
  const [birthName, setBirthName] = useState("");
  const [birthGender, setBirthGender] = useState("male");
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [addingBirth, setAddingBirth] = useState(false);
  const [birthMsg, setBirthMsg] = useState("");
  const [myRequests, setMyRequests] = useState([]);
  const [editingRel, setEditingRel] = useState(null); // { id, name, prefilledEmail, birthDate, birthPlace }
  const [savingRel, setSavingRel] = useState(false);

  const loadMyRequests = async () => {
    const rows = await fetchMyBirthRequests();
    setMyRequests(rows);
  };

  useEffect(() => setForm(me), [meId, members.length]);
  useEffect(() => { loadMyRequests(); }, []);

  const save = async () => {
    await updateMemberCore(form.id, form);
    await updateMemberPhone(form.id, form.phone);
    await upsertMemberProfile(form.id, {
      socialLinks: form.socialLinks,
      extendedVisible: form.extendedVisible,
      phoneVisible: form.phoneVisible,
      emailVisible: form.emailVisible,
      cvUrl: form.cvUrl,
    });
    const newProfilesMap = {
      ...profilesMap,
      [form.id]: {
        socialLinks: form.socialLinks,
        cvUrl: form.cvUrl,
        visibility: {
          bio: form.extendedVisible ? "public" : "private",
          phone: form.phoneVisible ? "public" : "private",
          email: form.emailVisible ? "public" : "private",
        },
      },
    };
    setProfilesMap(newProfilesMap);
    const rawUpdated = members.map((m) => (m.id === form.id ? { ...m, ...form } : m));
    setMembers(enrichMembers(rawUpdated, newProfilesMap));
    setMode("view");
  };

  const [relError, setRelError] = useState("");
  const [relSuccess, setRelSuccess] = useState("");

  const addDaughter = async () => {
    if (!daughterName.trim()) return setRelError("اكتب اسم الابنة رباعيًا.");
    if (!isValidEmail(daughterEmail)) return setRelError("صيغة البريد الإلكتروني غير صحيحة (تأكد من وجود @ ونطاق صحيح).");
    setAddingDaughter(true);
    setRelError(""); setRelSuccess("");
    try {
      const created = await insertMember({ name: daughterName.trim(), fatherId: meId, gender: "female", prefilledEmail: daughterEmail.trim() });
      setMembers(enrichMembers([...members, created], profilesMap));
      setRelSuccess(`تمت إضافة ${created.name} بنجاح.`);
      sendFamilyEmail({ type: "welcome", email: daughterEmail.trim(), name: daughterName.trim() });
      setDaughterName("");
      setDaughterEmail("");
      setShowAddDaughter(false);
    } catch (e) {
      setRelError(e.message || "تعذّرت الإضافة، حاول مرة أخرى.");
    }
    setAddingDaughter(false);
  };

  const addWife = async () => {
    if (!wifeName.trim()) return setRelError("اكتب اسم الزوجة رباعيًا.");
    if (!isValidEmail(wifeEmail)) return setRelError("صيغة البريد الإلكتروني غير صحيحة (تأكد من وجود @ ونطاق صحيح).");
    setAddingWife(true);
    setRelError(""); setRelSuccess("");
    try {
      const created = await insertMember({ name: wifeName.trim(), spouseOf: meId, gender: "female", prefilledEmail: wifeEmail.trim() });
      setMembers(enrichMembers([...members, created], profilesMap));
      setRelSuccess(`تمت إضافة ${created.name} بنجاح.`);
      sendFamilyEmail({ type: "welcome", email: wifeEmail.trim(), name: wifeName.trim() });
      setWifeName("");
      setWifeEmail("");
      setShowAddWife(false);
    } catch (e) {
      setRelError(e.message || "تعذّرت الإضافة، حاول مرة أخرى.");
    }
    setAddingWife(false);
  };

  const confirmRemoveAction = async () => {
    const { type, id } = confirmRemove;
    if (type === "daughter" || type === "son") {
      await deleteMember(id);
      setMembers(members.filter((m) => m.id !== id));
    } else {
      await unlinkSpouse(id);
      const rawUpdated = members.map((m) => (m.id === id ? { ...m, spouseOf: null } : m));
      setMembers(enrichMembers(rawUpdated, profilesMap));
    }
    setConfirmRemove(null);
  };

  const [editingSon, setEditingSon] = useState(null);
  const [savingSon, setSavingSon] = useState(false);
  const saveEditSon = async () => {
    if (!editingSon) return;
    setSavingSon(true);
    const ok = await updateMemberAdmin(editingSon.id, editingSon);
    if (ok) {
      const rawUpdated = members.map((m) => (m.id === editingSon.id ? { ...m, name: editingSon.name, region: editingSon.region, birthDate: editingSon.birthDate, birthPlace: editingSon.birthPlace } : m));
      setMembers(enrichMembers(rawUpdated, profilesMap));
    }
    setSavingSon(false);
    setEditingSon(null);
  };

  const addBirth = async () => {
    if (!birthName.trim()) return;
    const nameTrim = birthName.trim();
    const dupExisting = members.some((m) => m.fatherId === meId && m.name.trim() === nameTrim);
    const dupPending = myRequests.some((r) => r.status === "pending" && (r.proposed_changes?.name || "").trim() === nameTrim);
    if (dupExisting || dupPending) {
      setBirthMsg(`يوجد مولود بالاسم "${nameTrim}" مسجّل مسبقًا لديك بنفس الاسم — لو تقصد شخصًا مختلفًا، أضف اسمًا مميزًا (مثلًا اسم الجد).`);
      return;
    }
    setAddingBirth(true);
    setBirthMsg("");
    const ok = await submitBirthRequest({ name: nameTrim, gender: birthGender, birthDate, birthPlace, fatherId: meId });
    setBirthMsg(ok ? "أُرسل طلب تسجيل المولود لاعتماد المشرف." : "تعذّر إرسال الطلب، حاول مرة أخرى.");
    if (ok) {
      setBirthName(""); setBirthDate(""); setBirthPlace(""); setShowAddBirth(false);
      loadMyRequests();
    }
    setAddingBirth(false);
  };

  const [editRelError, setEditRelError] = useState("");

  const saveRelEdit = async () => {
    if (!editingRel) return;
    if (editingRel.prefilledEmail?.trim() && !isValidEmail(editingRel.prefilledEmail)) {
      setEditRelError("صيغة البريد الإلكتروني غير صحيحة (تأكد من وجود @ ونطاق صحيح).");
      return;
    }
    setEditRelError("");
    setSavingRel(true);
    const before = members.find((m) => m.id === editingRel.id);
    await supabase.from("members").update({
      first_name: editingRel.name,
      prefilled_email: editingRel.prefilledEmail || null,
      birth_date: editingRel.birthDate || null,
      birth_place: editingRel.birthPlace || null,
    }).eq("id", editingRel.id);
    const rawUpdated = members.map((m) => (m.id === editingRel.id ? { ...m, name: editingRel.name, prefilledEmail: editingRel.prefilledEmail, birthDate: editingRel.birthDate, birthPlace: editingRel.birthPlace } : m));
    setMembers(enrichMembers(rawUpdated, profilesMap));
    if (!before?.prefilledEmail && editingRel.prefilledEmail?.trim()) {
      sendFamilyEmail({ type: "welcome", email: editingRel.prefilledEmail.trim(), name: editingRel.name });
    }
    setSavingRel(false);
    setEditingRel(null);
  };

  if (!form) return <EmptyState text="جارِ تحميل ملفك الشخصي..." />;

  const myDaughters = members.filter((m) => m.fatherId === meId && m.gender === "female");
  const mySons = members.filter((m) => m.fatherId === meId && m.gender !== "female");
  const myWives = members.filter((m) => m.spouseOf === meId);
  const pendingSons = myRequests.filter((r) => r.status === "pending" && r.proposed_changes?.gender !== "female");
  const pendingDaughters = myRequests.filter((r) => r.status === "pending" && r.proposed_changes?.gender === "female");

  const PrivacyToggle = ({ label, checked, onToggle }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12.5, color: T.text }}>{label}</span>
      <button onClick={onToggle} style={{ border: `1px solid ${checked ? T.gold : T.line}`, background: checked ? T.sandDark : "transparent", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", color: T.text }}>
        {checked ? "ظاهر للعائلة" : "مخفي"}
      </button>
    </div>
  );

  const InfoRow = ({ icon: Icon, text }) => text ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text, marginBottom: 8 }}>
      <Icon size={15} color={T.gold} /> {text}
    </div>
  ) : null;

  return (
    <div>
      <SectionTitle
        action={
          <IconButton onClick={() => setMode(mode === "view" ? "edit" : "view")} active={mode === "edit"}>
            {mode === "view" ? <><Pencil size={13} /> تعديل</> : "عرض"}
          </IconButton>
        }
      >
        ملفي الشخصي
      </SectionTitle>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Avatar name={form.name} photoUrl={form.photoUrl} gender={form.gender} size={56} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{form.name}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{form.nasab}</div>
          {form.memberNumber && <div style={{ fontSize: 11, color: T.gold, fontWeight: 700, marginTop: 3 }}>رقم العضوية: {form.memberNumber}</div>}
        </div>
      </div>

      {mode === "view" ? (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14 }}>
          <InfoRow icon={Briefcase} text={form.job} />
          <InfoRow icon={MapPin} text={[form.region, form.birthPlace && `مكان الميلاد: ${form.birthPlace}`].filter(Boolean).join(" · ")} />
          <InfoRow icon={Cake} text={form.birthDate && formatDate(form.birthDate, form.birthDatePrecision)} />
          <InfoRow icon={Phone} text={form.phone} />
          <InfoRow icon={Link2} text={form.prefilledEmail} />
          {form.bio && <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.7, marginTop: 6, paddingTop: 10, borderTop: `1px dashed ${T.line}` }}>{form.bio}</div>}
          {form.socialLinks && Object.values(form.socialLinks).some(Boolean) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {Object.entries(form.socialLinks).map(([k, v]) => v && (
                <span key={k} style={{ fontSize: 11.5, color: T.gold, display: "flex", alignItems: "center", gap: 3 }}><Link2 size={11} /> {v}</span>
              ))}
            </div>
          )}
          {form.cvUrl && (
            <a href={form.cvUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "7px 14px", background: T.sandDark, border: `1px solid ${T.line}`, borderRadius: 999, color: T.ink, textDecoration: "none", fontSize: 11.5, fontWeight: 700 }}>
              <FileText size={13} /> السيرة الذاتية
            </a>
          )}
          <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${T.line}`, fontSize: 10.5, color: T.muted }}>
            <span>الجوال: {form.phoneVisible ? "ظاهر للعائلة" : "مخفي"}</span>
            <span>البريد: {form.emailVisible ? "ظاهر للعائلة" : "مخفي"}</span>
          </div>
        </div>
      ) : (
        <>
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>البيانات الأساسية</div>
            {form.gender !== "female" && <input placeholder="رابط الصورة الشخصية (اختياري)" value={form.photoUrl || ""} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} style={inputStyle} />}
            <input type="date" placeholder="تاريخ الميلاد" value={form.birthDate || ""} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} style={{ ...inputStyle, minWidth: 0, maxWidth: "100%" }} />
            <input placeholder="مكان الميلاد" value={form.birthPlace || ""} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} style={inputStyle} />
            <input placeholder="مدينة الإقامة الحالية" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={inputStyle} />
            <input type="tel" placeholder="رقم الجوال (اختياري)" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 10, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>البيانات الموسّعة (سيرة، وظيفة)</span>
              <button onClick={() => setForm({ ...form, extendedVisible: !form.extendedVisible })} style={{ border: `1px solid ${form.extendedVisible ? T.gold : T.line}`, background: form.extendedVisible ? T.sandDark : "transparent", borderRadius: 999, padding: "4px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", color: T.text }}>
                {form.extendedVisible ? "مرئية للعائلة" : "مخفية"}
              </button>
            </div>
            <input placeholder="المسمى الوظيفي" value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} style={inputStyle} />
            <textarea placeholder="نبذة مختصرة" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} style={{ ...inputStyle, resize: "none" }} />
            <div style={{ fontSize: 11, color: T.muted }}>وسائل التواصل الاجتماعي (اختياري):</div>
            <input placeholder="حساب تويتر/X" value={form.socialLinks?.twitter || ""} onChange={(e) => setForm({ ...form, socialLinks: { ...form.socialLinks, twitter: e.target.value } })} style={inputStyle} />
            <input placeholder="حساب انستقرام" value={form.socialLinks?.instagram || ""} onChange={(e) => setForm({ ...form, socialLinks: { ...form.socialLinks, instagram: e.target.value } })} style={inputStyle} />
            <input placeholder="لينكدإن" value={form.socialLinks?.linkedin || ""} onChange={(e) => setForm({ ...form, socialLinks: { ...form.socialLinks, linkedin: e.target.value } })} style={inputStyle} />
            <input placeholder="رابط السيرة الذاتية (PDF من Google Drive مثلًا)" value={form.cvUrl || ""} onChange={(e) => setForm({ ...form, cvUrl: e.target.value })} style={inputStyle} />
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>خصوصية معلومات التواصل</div>
            <PrivacyToggle label="رقم الجوال" checked={!!form.phoneVisible} onToggle={() => setForm({ ...form, phoneVisible: !form.phoneVisible })} />
            <PrivacyToggle label="البريد الإلكتروني" checked={!!form.emailVisible} onToggle={() => setForm({ ...form, emailVisible: !form.emailVisible })} />
          </div>

          <button onClick={save} style={{ ...primaryBtnStyle, width: "100%" }}>حفظ كل التغييرات</button>
        </>
      )}

      <Toast message={relSuccess} type="success" onClose={() => setRelSuccess("")} />
      <Toast message={relError} type="error" onClose={() => setRelError("")} />

      {form.gender !== "female" && (
        <div style={{ marginTop: 14 }}>
          <SectionTitle action={<IconButton onClick={() => setShowAddBirth((v) => !v)} active={showAddBirth}><Plus size={13} /> إضافة مولود</IconButton>}>تسجيل مولود جديد</SectionTitle>
          {(birthMsg || showAddBirth) && (
            <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              {birthMsg && <div style={{ fontSize: 12, color: T.gold, fontWeight: 700, marginBottom: showAddBirth ? 10 : 0 }}>{birthMsg}</div>}
              {showAddBirth && (
                <div style={{ display: "grid", gap: 6 }}>
                  <input placeholder="اسم المولود" value={birthName} onChange={(e) => setBirthName(e.target.value)} style={inputStyle} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setBirthGender("male")} style={{ ...inputStyle, cursor: "pointer", background: birthGender === "male" ? T.sandDark : T.sand, textAlign: "center" }}>ذكر</button>
                    <button onClick={() => setBirthGender("female")} style={{ ...inputStyle, cursor: "pointer", background: birthGender === "female" ? T.sandDark : T.sand, textAlign: "center" }}>أنثى</button>
                  </div>
                  <div style={{ width: "100%", overflow: "hidden" }}>
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>تاريخ الميلاد (اختياري)</div>
                    <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={{ ...inputStyle, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", display: "block" }} />
                  </div>
                  <input placeholder="مكان الميلاد (اختياري)" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} style={inputStyle} />
                  <button onClick={addBirth} disabled={addingBirth || !birthName.trim()} style={primaryBtnStyle}>
                    {addingBirth ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : "إرسال لاعتماد المشرف"}
                  </button>
                  <div style={{ fontSize: 10.5, color: T.muted }}>يظهر المولود فورًا بقائمة الأبناء أو البنات تحت، بعلامة "بانتظار الاعتماد" لحد ما يعتمده المشرف.</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {form.gender !== "female" && (
        <div style={{ marginTop: 14 }}>
          <SectionTitle>الأبناء</SectionTitle>
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14 }}>
            {mySons.length === 0 && pendingSons.length === 0 && <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "8px 0" }}>لا يوجد أبناء مضافون بعد.</div>}
            {pendingSons.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: T.text, fontWeight: 700 }}>{r.proposed_changes?.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 9px", color: T.gold, background: T.sandDark }}>بانتظار الاعتماد</span>
                </div>
                <button onClick={async () => { await deleteBirthRequest(r.id); loadMyRequests(); }} style={{ background: "none", border: "none", color: T.clay, cursor: "pointer" }} title="حذف الطلب">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {mySons.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                <div>
                  <div style={{ fontSize: 12.5, color: T.text, fontWeight: 700 }}>{s.name}</div>
                  {s.memberNumber && <div style={{ fontSize: 10.5, color: T.muted }}>رقم العضوية: {s.memberNumber}</div>}
                </div>
                {s.userAccountId ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#2F7D4F" }}>لديه حساب مستقل</span>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setEditingSon({ id: s.id, name: s.name, region: s.region || "", birthDate: s.birthDate || "", birthPlace: s.birthPlace || "" })} style={{ background: "none", border: "none", color: T.gold, cursor: "pointer" }} title="تعديل">
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => {
                        const childrenCount = members.filter((m) => m.fatherId === s.id).length;
                        setConfirmRemove({ type: "son", id: s.id, name: s.name, childrenCount });
                      }}
                      style={{ background: "none", border: "none", color: T.clay, cursor: "pointer" }}
                      title="حذف"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

          {editingSon && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} onClick={() => setEditingSon(null)}>
              <div style={{ background: T.card, borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 430 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 10 }}>تعديل بيانات {editingSon.name}</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <input placeholder="الاسم" value={editingSon.name} onChange={(e) => setEditingSon({ ...editingSon, name: e.target.value })} style={inputStyle} />
                  <input placeholder="مدينة الإقامة" value={editingSon.region} onChange={(e) => setEditingSon({ ...editingSon, region: e.target.value })} style={inputStyle} />
                  <div style={{ fontSize: 11, color: T.muted }}>تاريخ الميلاد</div>
                  <input type="date" value={editingSon.birthDate} onChange={(e) => setEditingSon({ ...editingSon, birthDate: e.target.value })} style={{ ...inputStyle, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }} />
                  <input placeholder="مكان الميلاد" value={editingSon.birthPlace} onChange={(e) => setEditingSon({ ...editingSon, birthPlace: e.target.value })} style={inputStyle} />
                  <button onClick={saveEditSon} disabled={savingSon} style={primaryBtnStyle}>
                    {savingSon ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : "حفظ"}
                  </button>
                  <button onClick={() => setEditingSon(null)} style={{ background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>إلغاء</button>
                </div>
              </div>
            </div>
          )}


      {form.gender !== "female" && (
        <div style={{ marginTop: 14 }}>
          <SectionTitle action={<IconButton onClick={() => setShowAddDaughter((v) => !v)} active={showAddDaughter}><Plus size={13} /> إضافة</IconButton>}>البنات</SectionTitle>
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14 }}>
            {myDaughters.length === 0 && pendingDaughters.length === 0 && !showAddDaughter && <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "8px 0" }}>لا يوجد بنات مضافات بعد.</div>}
            {pendingDaughters.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: T.text, fontWeight: 700 }}>{r.proposed_changes?.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 9px", color: T.gold, background: T.sandDark }}>بانتظار الاعتماد</span>
                </div>
                <button onClick={async () => { await deleteBirthRequest(r.id); loadMyRequests(); }} style={{ background: "none", border: "none", color: T.clay, cursor: "pointer" }} title="حذف الطلب">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {myDaughters.map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                <div>
                  <div style={{ fontSize: 12.5, color: T.text, fontWeight: 700 }}>{d.name}</div>
                  <div style={{ fontSize: 10.5, color: T.muted }}>{d.prefilledEmail}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: d.userAccountId ? "#2F7D4F" : T.muted, marginTop: 2 }}>
                    الحساب: {d.userAccountId ? "مفعّل" : "غير مفعّل"}
                  </div>
                </div>
                {!d.userAccountId && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setEditingRel({ id: d.id, name: d.name, prefilledEmail: d.prefilledEmail || "", birthDate: d.birthDate || "", birthPlace: d.birthPlace || "" })} style={{ background: "none", border: "none", color: T.gold, cursor: "pointer" }} title="تعديل">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => setConfirmRemove({ type: "daughter", id: d.id, name: d.name })} style={{ background: "none", border: "none", color: T.clay, cursor: "pointer" }} title="حذف">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {showAddDaughter && (
              <div style={{ display: "grid", gap: 6, marginTop: 10, paddingTop: 10, borderTop: (myDaughters.length || pendingDaughters.length) ? `1px dashed ${T.line}` : "none" }}>
                <input placeholder="اسم الابنة" value={daughterName} onChange={(e) => setDaughterName(e.target.value)} style={inputStyle} />
                <input type="email" placeholder="بريدها الإلكتروني (إجباري للتفعيل)" value={daughterEmail} onChange={(e) => setDaughterEmail(e.target.value)} style={inputStyle} />
                <button onClick={addDaughter} disabled={addingDaughter} style={primaryBtnStyle}>
                  {addingDaughter ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : "إضافة"}
                </button>
                <div style={{ fontSize: 10.5, color: T.muted }}>تُربط تلقائيًا بك كأب. الجوال تقدر تضيفه هي بنفسها لاحقًا من ملفها.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {form.gender !== "female" && (
        <div style={{ marginTop: 14, marginBottom: 14 }}>
          <SectionTitle action={<IconButton onClick={() => setShowAddWife((v) => !v)} active={showAddWife}><Plus size={13} /> إضافة</IconButton>}>{myWives.length > 1 ? "الزوجات" : "الزوجة"}</SectionTitle>
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14 }}>
            {myWives.length === 0 && !showAddWife && <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "8px 0" }}>لا توجد زوجة مضافة بعد.</div>}
            {myWives.map((w) => (
              <div key={w.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                <div>
                  <div style={{ fontSize: 12.5, color: T.text, fontWeight: 700 }}>{w.name}</div>
                  <div style={{ fontSize: 10.5, color: T.muted }}>{w.prefilledEmail}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: w.userAccountId ? "#2F7D4F" : T.muted, marginTop: 2 }}>
                    الحساب: {w.userAccountId ? "مفعّل" : "غير مفعّل"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditingRel({ id: w.id, name: w.name, prefilledEmail: w.prefilledEmail || "", birthDate: w.birthDate || "", birthPlace: w.birthPlace || "" })} style={{ background: "none", border: "none", color: T.gold, cursor: "pointer" }} title="تعديل">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setConfirmRemove({ type: "wife", id: w.id, name: w.name })} style={{ background: "none", border: "none", color: T.clay, cursor: "pointer" }} title="إزالة الارتباط">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            {showAddWife && (
              <div style={{ display: "grid", gap: 6, marginTop: 10, paddingTop: 10, borderTop: myWives.length ? `1px dashed ${T.line}` : "none" }}>
                <input placeholder="الاسم رباعي" value={wifeName} onChange={(e) => setWifeName(e.target.value)} style={inputStyle} />
                <input type="email" placeholder="بريدها الإلكتروني (إجباري للتفعيل)" value={wifeEmail} onChange={(e) => setWifeEmail(e.target.value)} style={inputStyle} />
                <button onClick={addWife} disabled={addingWife} style={primaryBtnStyle}>
                  {addingWife ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : "إضافة"}
                </button>
                <div style={{ fontSize: 10.5, color: T.muted }}>اسمها كامل بما إنها من خارج شجرة العائلة. الجوال تقدر تضيفه هي بنفسها لاحقًا. يدعم إضافة أكثر من زوجة.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmRemove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={() => setConfirmRemove(null)}>
          <div style={{ background: T.card, borderRadius: 16, padding: 20, width: "100%", maxWidth: 340 }} onClick={(e) => e.stopPropagation()} dir="rtl">
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 8 }}>
              {confirmRemove.type === "wife" ? `فك الارتباط بـ${confirmRemove.name}؟` : `حذف ${confirmRemove.name}؟`}
            </div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 16 }}>
              {confirmRemove.type === "wife"
                ? "يزيل رابط الزوجية بس، وحسابها وبياناتها تبقى محفوظة."
                : "الحذف نهائي ولا يمكن التراجع عنه."}
              {confirmRemove.childrenCount > 0 && (
                <span style={{ color: T.clay, fontWeight: 700 }}> تنبيه: له {confirmRemove.childrenCount} من الأبناء المرتبطين به بالشجرة — حذفه سيقطع ارتباطهم بجدّهم.</span>
              )}
            </div>
            <button onClick={confirmRemoveAction} style={{ width: "100%", background: T.clay, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
              {confirmRemove.type === "wife" ? "تأكيد فك الارتباط" : "تأكيد الحذف"}
            </button>
            <button onClick={() => setConfirmRemove(null)} style={{ width: "100%", background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
              تراجع
            </button>
          </div>
        </div>
      )}

      {editingRel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} onClick={() => setEditingRel(null)}>
          <div style={{ background: T.card, borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 430 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 10 }}>تعديل بيانات {editingRel.name}</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input placeholder="الاسم" value={editingRel.name} onChange={(e) => setEditingRel({ ...editingRel, name: e.target.value })} style={inputStyle} />
              <input type="email" placeholder="البريد الإلكتروني (لتفعيل حسابها)" value={editingRel.prefilledEmail} onChange={(e) => setEditingRel({ ...editingRel, prefilledEmail: e.target.value })} style={inputStyle} />
              <div style={{ fontSize: 11, color: T.muted }}>تاريخ الميلاد</div>
              <input type="date" value={editingRel.birthDate} onChange={(e) => setEditingRel({ ...editingRel, birthDate: e.target.value })} style={{ ...inputStyle, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }} />
              <input placeholder="مكان الميلاد" value={editingRel.birthPlace} onChange={(e) => setEditingRel({ ...editingRel, birthPlace: e.target.value })} style={inputStyle} />
              {editRelError && <div style={{ color: T.clay, fontSize: 12, fontWeight: 700 }}>{editRelError}</div>}
              <button onClick={saveRelEdit} disabled={savingRel} style={primaryBtnStyle}>
                {savingRel ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : "حفظ"}
              </button>
              <button onClick={() => { setEditingRel(null); setEditRelError(""); }} style={{ background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const BASE_TABS = [
  { key: "news", label: "الأخبار", icon: Newspaper },
  { key: "tree", label: "الشجرة", icon: GitBranch },
  { key: "magazine", label: "المجلة", icon: BookOpen },
  { key: "events", label: "المناسبات", icon: CalendarDays },
  { key: "profile", label: "ملفي", icon: UserCircle2 },
];
const ADMINS_TAB = { key: "admins", label: "الإشراف", icon: Shield };

function FamilyAppInner({ meId }) {
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.replace("#", "");
    return ["news", "tree", "magazine", "events", "profile", "admins"].includes(h) ? h : "news";
  });

  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [news, setNews] = useState([]);
  const [events, setEvents] = useState([]);
  const [canManageTree, setCanManageTree] = useState(false);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [canManageNews, setCanManageNews] = useState(false);
  const [canManageEvents, setCanManageEvents] = useState(false);
  const [canManageDocuments, setCanManageDocuments] = useState(false);
  const [magazineUploading, setMagazineUploading] = useState(false);
  const [magazineUploadMsg, setMagazineUploadMsg] = useState("");

  useEffect(() => {
    (async () => {
      const [rawMembers, profiles, n, e, treePerm, adminsPerm, newsPerm, eventsPerm, docsPerm] = await Promise.all([
        fetchMembers(), fetchMemberProfiles(), fetchNews(), fetchEvents(),
        checkPermission("manage_tree_profiles"), checkPermission("manage_admins"),
        checkPermission("manage_news"), checkPermission("manage_events"),
        checkPermission("manage_documents"),
      ]);
      setProfilesMap(profiles);
      setMembers(enrichMembers(rawMembers, profiles));
      setNews(n);
      setEvents(e);
      setCanManageTree(treePerm);
      setCanManageAdmins(adminsPerm);
      setCanManageNews(newsPerm);
      setCanManageEvents(eventsPerm);
      setCanManageDocuments(docsPerm);
      setLoading(false);
    })();
  }, []);

  const me = members.find((m) => m.id === meId);
  const TABS = (canManageAdmins || canManageTree) ? [...BASE_TABS, ADMINS_TAB] : BASE_TABS;

  return (
    <div dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif", background: T.sand, minHeight: "100vh" }}>
      <style>{`
        ${FONTS}
        * { box-sizing: border-box; }
        html, body { max-width: 100vw; overflow-x: hidden; position: relative; }
        ::placeholder { color: ${T.muted}; opacity: 0.8; }
        @keyframes rosette-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
        button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid ${T.gold}; outline-offset: 1px; }
      `}</style>
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: T.sand, position: "relative", paddingBottom: 78, overflowX: "hidden" }}>
        <div
          onClick={() => setTab("news")}
          style={{
            height: 88,
            background: "rgb(250,250,250)",
            backgroundImage: "url(/Header-Final.jpeg)",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right center",
            borderBottomLeftRadius: 22,
            borderBottomRightRadius: 22,
            cursor: "pointer",
            position: "sticky",
            top: 0,
            zIndex: 40,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
          title="الرجوع للرئيسية"
        />
        {(magazineUploading || magazineUploadMsg) && (
          <div style={{ position: "fixed", top: 96, left: "50%", transform: "translateX(-50%)", zIndex: 55, width: "calc(100% - 32px)", maxWidth: 400 }}>
            <div
              onClick={() => !magazineUploading && setMagazineUploadMsg("")}
              style={{
                background: magazineUploading ? "#123838" : "#123838",
                color: "#F4EFE3",
                border: `1.5px solid ${T.gold}`,
                borderRadius: 12,
                padding: "12px 16px",
                fontSize: 12.5,
                fontWeight: 700,
                textAlign: "center",
                boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: magazineUploading ? "default" : "pointer",
              }}
            >
              {magazineUploading ? (
                <>
                  <Loader2 size={15} style={{ animation: "rosette-spin 1s linear infinite" }} />
                  جارِ رفع عدد المجلة... تقدر تتصفح باقي التطبيق بحرية، وبتوصلك رسالة هنا لما يخلص.
                </>
              ) : (
                magazineUploadMsg
              )}
            </div>
          </div>
        )}
        <div style={{ padding: "16px 16px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "70px 0", color: T.muted }}>
              <Loader2 size={22} style={{ animation: "rosette-spin 1.2s linear infinite" }} />
              <span style={{ fontSize: 13 }}>جارِ تحميل بيانات العائلة...</span>
            </div>
          ) : (
            <>
              {tab === "news" && <NewsTab news={news} setNews={setNews} canManageNews={canManageNews} />}
              {tab === "tree" && <TreeTab members={members} setMembers={setMembers} profilesMap={profilesMap} canManageTree={canManageTree} />}
              {tab === "magazine" && <MagazineTab canManageDocuments={canManageDocuments} onUploadingChange={setMagazineUploading} onUploadResult={setMagazineUploadMsg} />}
              {tab === "events" && <EventsTab events={events} setEvents={setEvents} meId={meId} canManageEvents={canManageEvents} />}
              {tab === "profile" && <ProfileTab members={members} setMembers={setMembers} profilesMap={profilesMap} setProfilesMap={setProfilesMap} meId={meId} />}
              {tab === "admins" && (canManageAdmins || canManageTree) && <AdminsTab members={members} setMembers={setMembers} profilesMap={profilesMap} canManageTree={canManageTree} canManageAdmins={canManageAdmins} />}
            </>
          )}
        </div>
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: T.card, borderTop: `1px solid ${T.line}`, display: "flex", padding: "8px 4px" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0", cursor: "pointer", color: active ? T.ink : T.muted, fontFamily: "inherit" }}>
                <Icon size={19} color={active ? T.gold : T.muted} strokeWidth={active ? 2.4 : 2} />
                <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function FamilyApp() {
  return <AuthGate>{(me) => <FamilyAppInner meId={me.id} />}</AuthGate>;
}
