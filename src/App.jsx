import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Newspaper, GitBranch, CalendarDays, Users, UserCircle2,
  Search, Plus, X, MapPin, Briefcase,
  Link2, ChevronDown, ChevronUp, Check,
  Baby, HeartHandshake, Megaphone, Cross, Loader2,
  FileText, Phone, Cake, Shield, UserPlus, Trash2, Save, Pencil,
  BookOpen, ChevronRight, ChevronLeft, Upload, LogOut, KeyRound,
  Settings, Fingerprint, Lock, HelpCircle, MessageCircle, ChevronsRight, Video,
  Camera, ImagePlus, QrCode,
  Trophy, Sparkles, RotateCcw, Gamepad2
} from "lucide-react";
import { supabase } from "./supabaseClient";
import AuthGate from "./AuthGate";
import { updatePassword, registerPasskey, normalizeSaudiPhone } from "./auth-linking";

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
    faceConsent: row.face_consent || false,
    faceConsentAt: row.face_consent_at || null,
    faceEnrolled: row.face_enrolled || false,
  };
}

async function fetchMembers() {
  const cols = "id, legacy_id, member_number, first_name, father_id, spouse_of, gender, is_alive, birth_date, birth_date_precision, death_date, death_date_precision, region, birth_place, occupation, bio, photo_url, user_account_id, face_consent, face_consent_at, face_enrolled";
  const pageSize = 1000;
  const all = [];
  // جلب كل الأعضاء على صفحات بدل سقف ثابت (كان 5000) يُقتطع بصمت مع نمو العائلة
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("members")
      .select(cols)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) { console.error("fetchMembers failed", error); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all.map(mapMemberRow);
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

// الجوال والبريد لم يعودا يُقرآن من جدول members مباشرة (صلاحية SELECT عليهما مسحوبة
// على مستوى العمود). هذه الدالة تستدعي RPC آمنة ترجّع الرقم/البريد فقط لمن يحق له،
// و has_phone (وجود رقم فقط) للجميع لتظل علامة "جوال مسجّل" بالشجرة تعمل دون كشف الرقم.
async function fetchMemberContacts() {
  const { data, error } = await supabase.rpc("member_contacts");
  if (error) { console.error("fetchMemberContacts failed", error); return {}; }
  const map = {};
  (data || []).forEach((r) => {
    map[r.member_id] = { hasPhone: !!r.has_phone, phone: r.phone || "", email: r.email || "" };
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
    .select("id, legacy_id, member_number, first_name, father_id, spouse_of, gender, is_alive, birth_date, birth_date_precision, death_date, death_date_precision, region, birth_place, occupation, bio, photo_url, user_account_id")
    .single();
  if (error) {
    console.error("insertMember failed", error);
    if (error.code === "23505") {
      throw new Error("هذا البريد الإلكتروني مستخدم مسبقًا لعضو آخر بالعائلة.");
    }
    throw new Error("تعذّرت الإضافة، حاول مرة أخرى.");
  }
  // الجوال/البريد لا يعودان من الاستعلام (العمود مقفول)، فنعيد إرفاق ما أدخله المستخدم محليًا
  const row = mapMemberRow(data);
  if (form.phone) row.phone = form.phone;
  if (form.prefilledEmail) row.prefilledEmail = form.prefilledEmail;
  return row;
}

async function updateMemberCore(id, patch) {
  const { error } = await supabase
    .from("members")
    .update({ occupation: patch.job, bio: patch.bio, region: patch.region, photo_url: patch.photoUrl, birth_place: patch.birthPlace, face_consent: !!patch.faceConsent, face_consent_at: patch.faceConsent ? (patch.faceConsentAt || new Date().toISOString()) : null })
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

async function uploadNewsImage(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from("news-images").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) { console.error("uploadNewsImage failed", error); return null; }
  const { data } = supabase.storage.from("news-images").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadMemberPhoto(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from("member-photos").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) { console.error("uploadMemberPhoto failed", error); return null; }
  const { data } = supabase.storage.from("member-photos").getPublicUrl(path);
  return data.publicUrl;
}

// ===== التعرّف على الوجه (face-api.js يُحمَّل من CDN عند الحاجة فقط) =====
const FACE_LIB_URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
const FACE_MODELS_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
let _faceReady = null;
function ensureFaceApi() {
  if (_faceReady) return _faceReady;
  _faceReady = (async () => {
    if (!window.faceapi) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = FACE_LIB_URL; s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error("تعذّر تحميل مكتبة التعرّف على الوجه"));
        document.head.appendChild(s);
      });
    }
    const fa = window.faceapi;
    if (!fa) throw new Error("تعذّر تهيئة مكتبة التعرّف");
    await fa.nets.ssdMobilenetv1.loadFromUri(FACE_MODELS_URL);
    await fa.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL);
    await fa.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL);
    return fa;
  })().catch((e) => { _faceReady = null; throw e; });
  return _faceReady;
}
// يُعيد مصفوفة 128 من صورة، أو null إذا لم يُكتشف وجه
async function fileToFaceDescriptor(file) {
  const fa = await ensureFaceApi();
  const img = await fa.bufferToImage(file);
  const det = await fa.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
  return det ? Array.from(det.descriptor) : null;
}
// يحسب البصمة من صورة محفوظة (رابط) — لإعادة المحاولة دون رفع جديد
async function urlToFaceDescriptor(url) {
  const fa = await ensureFaceApi();
  const res = await fetch(url);
  const blob = await res.blob();
  const img = await fa.bufferToImage(blob);
  const det = await fa.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
  return det ? Array.from(det.descriptor) : null;
}
function descriptorToVector(d) { return "[" + d.join(",") + "]"; }
// المسافة 0 = تطابق تام، ~0.6 = الحد. نحوّلها لنسبة ثقة تقريبية
function distanceToConfidence(dist) {
  const c = Math.round((1 - dist / 0.6) * 100);
  return Math.max(0, Math.min(100, c));
}

async function uploadEventImage(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from("event-images").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) { console.error("uploadEventImage failed", error); return null; }
  const { data } = supabase.storage.from("event-images").getPublicUrl(path);
  return data.publicUrl;
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

async function sendContactMessage(memberId, message) {
  const { error } = await supabase.from("contact_messages").insert({ sender_member_id: memberId, message });
  if (error) { console.error("sendContactMessage failed", error); return false; }
  return true;
}

async function fetchContactMessages() {
  const { data, error } = await supabase
    .from("contact_messages")
    .select("id, message, status, created_at, sender_member_id, members(first_name)")
    .order("created_at", { ascending: false });
  if (error) { console.error("fetchContactMessages failed", error); return []; }
  return data;
}

async function markContactMessageRead(id) {
  const { error } = await supabase.from("contact_messages").update({ status: "read" }).eq("id", id);
  if (error) { console.error("markContactMessageRead failed", error); return false; }
  return true;
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
    .select("id, legacy_id, member_number, first_name, father_id, spouse_of, gender, is_alive, birth_date, birth_date_precision, death_date, death_date_precision, region, birth_place, occupation, bio, photo_url, user_account_id")
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

// توحيد الحروف ذات الصفة الواحدة حتى لا يفرّق البحث بينها:
// همزات القطع/الوصل (أ إ آ ٱ ← ا)، الواو/الياء المهموزة (ؤ ← و، ئ ← ي)،
// الهمزة المفردة تُحذف، التاء المربوطة (ة ← ه)، والألف المقصورة (ى ← ي)،
// مع إزالة التشكيل والتطويل.
function normalizeArabicLetters(s) {
  return (s || "")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
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

// يقبل روابط http/https فقط، ويرفض مثل javascript: — للروابط التي يدخلها المستخدم
function safeExternalUrl(url) {
  const u = (url || "").trim();
  return /^https?:\/\//i.test(u) ? u : null;
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

// حالة صورة/بصمة العضو (٣ حالات)
function faceState(member) {
  if (member && member.faceConsent && member.faceEnrolled) return { color: "#1b7a3d", sym: "✓", label: "وافق وبصمته محفوظة" };
  if (member && member.faceConsent) return { color: "#E08A2E", sym: "!", label: "وافق ولا توجد بصمة بعد" };
  return { color: "#c0392b", sym: "✕", label: "لم يوافق على استخدام صورته" };
}
// علامة حالة على الصورة: خضراء (وافق+بصمة) · برتقالية (وافق بلا بصمة) · حمراء (لم يوافق)
function FaceBadge({ member }) {
  if (!member || member.gender === "female") return null;
  const s = faceState(member);
  return (
    <span title={s.label}
      style={{ position: "absolute", bottom: -2, insetInlineStart: -2, width: 18, height: 18, borderRadius: "50%", background: s.color, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 900, lineHeight: 1 }}>
      {s.sym}
    </span>
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

function ConfirmModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={onCancel}>
      <div style={{ background: T.card, borderRadius: 16, padding: 20, width: "100%", maxWidth: 340, fontFamily: "'Tajawal', sans-serif" }} onClick={(e) => e.stopPropagation()} dir="rtl">
        <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.7, marginBottom: 16, textAlign: "center" }}>
          الحذف سيكون نهائيًا، ولا يمكن استرجاع المحذوف.
        </div>
        <button onClick={onConfirm} style={{ width: "100%", background: T.clay, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
          تأكيد الحذف
        </button>
        <button onClick={onCancel} style={{ width: "100%", background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
          تراجع
        </button>
      </div>
    </div>
  );
}

function NewsTab({ news, setNews, canManageNews, events, membersCount, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("عام");
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [existingImageUrl, setExistingImageUrl] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [uploadingImg, setUploadingImg] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const nextEvent = (events || []).filter((e) => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];

  const submit = async () => {
    if (!text.trim()) return;
    setUploadingImg(true);
    let imageUrl = existingImageUrl || null;
    if (imageFile) {
      const uploaded = await uploadNewsImage(imageFile);
      if (uploaded) imageUrl = uploaded;
    }
    const payload = { type, text: text.trim(), image_url: imageUrl, location_url: locationUrl.trim() || null };
    if (editingId) {
      const updated = await updateNews(editingId, payload);
      if (updated) setNews(news.map((n) => (n.id === editingId ? updated : n)));
    } else {
      const created = await insertNews({ ...payload, date: new Date().toISOString().slice(0, 10) });
      if (created) setNews([created, ...news]);
    }
    setText(""); setImageFile(null); setExistingImageUrl(""); setLocationUrl("");
    setType("عام");
    setEditingId(null);
    setOpen(false);
    setUploadingImg(false);
  };

  const startEdit = (n) => {
    setEditingId(n.id);
    setType(n.type);
    setText(n.text);
    setExistingImageUrl(n.image_url || "");
    setImageFile(null);
    setLocationUrl(n.location_url || "");
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
      <button
        onClick={() => onNavigate?.("tree")}
        style={{
          position: "relative",
          overflow: "hidden",
          display: "block",
          width: "100%",
          textAlign: "right",
          background: `linear-gradient(155deg, ${T.inkSoft}, ${T.ink})`,
          border: `1.5px solid ${T.gold}`,
          borderRadius: 16,
          padding: "18px 16px",
          cursor: "pointer",
          fontFamily: "inherit",
          marginBottom: 10,
        }}
      >
        <div style={{ position: "absolute", left: -14, top: "50%", transform: "translateY(-50%)", opacity: 0.16 }}>
          <Rosette size={92} color={T.goldLight} />
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 21, fontWeight: 700, color: T.goldLight }}>شجرة العائلة</div>
          <div style={{ fontSize: 11.5, color: "#CFE0DC", marginTop: 5 }}>نسب آل تركي كاملًا، ابحث وتصفّح</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, background: "rgba(217,184,118,0.16)", border: `1px solid ${T.gold}`, borderRadius: 999, padding: "5px 12px" }}>
            <GitBranch size={13} color={T.goldLight} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: T.goldLight }}>{membersCount ? `${membersCount} فردًا` : "استكشف الأنساب"}</span>
          </div>
        </div>
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <button
          onClick={() => onNavigate?.("magazine")}
          style={{ textAlign: "right", background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 12px", cursor: "pointer", fontFamily: "inherit" }}
        >
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.sandDark, border: `1.5px solid ${T.gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen size={16} color={T.gold} />
          </div>
          <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 15.5, fontWeight: 700, color: T.ink, marginTop: 10 }}>مجلة الصلة</div>
          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: T.gold, background: T.sandDark, border: `1px solid ${T.gold}`, borderRadius: 999, padding: "2px 9px", marginTop: 6 }}>
            ٢٥ عددًا
          </span>
        </button>
        <button
          onClick={() => onNavigate?.("events")}
          style={{ textAlign: "right", background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 12px", cursor: "pointer", fontFamily: "inherit" }}
        >
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.sandDark, border: `1.5px solid ${T.gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CalendarDays size={16} color={T.gold} />
          </div>
          <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 15.5, fontWeight: 700, color: T.ink, marginTop: 10 }}>المناسبات</div>
          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: nextEvent ? T.gold : T.muted, background: T.sandDark, border: `1px solid ${nextEvent ? T.gold : T.line}`, borderRadius: 999, padding: "2px 9px", marginTop: 6 }}>
            {nextEvent ? nextEvent.date : "لا شي قريب"}
          </span>
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 5, margin: "4px 0 16px", opacity: 0.55 }}>
        {[0, 1, 2, 3, 4].map((i) => <Rosette key={i} size={13} color={T.gold} />)}
      </div>

      <SectionTitle action={canManageNews && (
        <IconButton onClick={() => { setOpen((v) => !v); setEditingId(null); setText(""); setType("عام"); setImageFile(null); setExistingImageUrl(""); setLocationUrl(""); }} active={open}>
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
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب نص الخبر هنا..." rows={10} style={{ ...inputStyle, resize: "vertical", minHeight: 180, lineHeight: 1.7 }} />

          <div style={{ marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text, cursor: "pointer" }}>
              <Upload size={14} color={T.gold} />
              {imageFile ? imageFile.name : existingImageUrl ? "استبدال الصورة الحالية" : "إضافة صورة (اختياري)"}
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} style={{ display: "none" }} />
            </label>
            {existingImageUrl && !imageFile && (
              <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}>
                <img src={existingImageUrl} alt="" style={{ maxWidth: 140, borderRadius: 10, display: "block" }} />
                <button onClick={() => setExistingImageUrl("")} style={{ position: "absolute", top: -6, left: -6, background: T.clay, color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 11, lineHeight: 1 }}>×</button>
              </div>
            )}
          </div>

          <input type="url" placeholder="رابط الموقع من خرائط جوجل (اختياري)" value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} style={{ ...inputStyle, marginTop: 8 }} />

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={submit} disabled={uploadingImg} style={{ ...primaryBtnStyle, marginTop: 0, flex: 1 }}>
              {uploadingImg ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : editingId ? "حفظ التعديل" : "نشر الخبر"}
            </button>
            <button
              onClick={() => { setOpen(false); setEditingId(null); setText(""); setType("عام"); setImageFile(null); setExistingImageUrl(""); setLocationUrl(""); }}
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
                <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{n.text}</div>
                {n.image_url && (
                  <img src={n.image_url} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10, marginTop: 10, display: "block" }} />
                )}
                {n.location_url && (
                  <a
                    href={safeExternalUrl(n.location_url) || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 11.5, fontWeight: 700, color: T.gold, textDecoration: "none" }}
                  >
                    <MapPin size={13} /> عرض الموقع على الخريطة
                  </a>
                )}
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

const TREE_NODE_W = 78;
const TREE_NODE_H = 58;
const TREE_H_GAP = 14;
const TREE_V_GAP = 50;

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

// بطاقة سريعة تظهر عند لمس أي فرد بالشجرة: صورة + اسم أول + مدينة + جوال (إن أتيح) + أزرار
function TreeMemberPopup({ member, onClose, onOpenProfile, onLocate }) {
  const phone = (member.isAlive && member.phone && member.phoneVisible) ? member.phone : "";
  const waDigits = phone ? phone.replace(/[^0-9]/g, "") : "";
  const btn = (bg, color, border) => ({
    flex: 1, minWidth: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    borderRadius: 12, padding: "11px 8px", fontSize: 12.5, fontWeight: 800, fontFamily: "inherit",
    cursor: "pointer", border: border ? `1px solid ${border}` : "none", background: bg, color,
  });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 55 }} onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ background: T.card, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", fontFamily: "'Tajawal', sans-serif" }}>
        <div style={{ background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, padding: "20px 18px 16px", textAlign: "center", position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", left: 12, top: 12, background: "none", border: "none", color: "#e9e2d0", cursor: "pointer" }}><X size={20} /></button>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <Avatar name={member.name} photoUrl={member.photoUrl} gender={member.gender} size={82} />
          </div>
          <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 20, fontWeight: 700, color: "#fff" }}>{member.name}</div>
          {member.nasab && member.nasab !== member.name && (
            <div style={{ fontSize: 11.5, color: "#CFE0DC", marginTop: 3 }}>{member.nasab}</div>
          )}
          {!member.isAlive && <div style={{ fontSize: 12, color: TT.gold400, fontWeight: 700, marginTop: 6 }}>متوفّى رحمه الله</div>}
        </div>
        <div style={{ padding: "14px 18px 18px" }}>
          {member.region && <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, color: T.text, padding: "8px 0", borderBottom: `1px dashed ${T.line}` }}><MapPin size={16} color={T.gold} /> {member.region}</div>}
          {phone && <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, color: T.text, padding: "8px 0", borderBottom: `1px dashed ${T.line}` }}><Phone size={16} color={T.gold} /> <span style={{ direction: "ltr" }}>{phone}</span></div>}
          {!member.region && !phone && (
            <div style={{ fontSize: 12.5, color: T.muted, textAlign: "center", padding: "8px 0" }}>
              {member.isAlive ? "لا تتوفّر مدينة أو جوال ظاهر لهذا الفرد." : "—"}
            </div>
          )}
          <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={onOpenProfile} style={btn(TT.teal800, "#fff")}><FileText size={15} /> الملف الشخصي</button>
            <button onClick={onLocate} style={btn(T.sandDark, T.ink, T.line)}><MapPin size={15} /> موقعه بالشجرة</button>
          </div>
          {phone && (
            <div style={{ display: "flex", gap: 9, marginTop: 9 }}>
              <a href={`tel:${phone}`} style={{ ...btn(T.gold, "#fff"), textDecoration: "none" }}><Phone size={15} /> اتصال</a>
              <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer" style={{ ...btn("#25863f", "#fff"), textDecoration: "none" }}>واتساب</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// شاشة «مَن هذا؟» — تعرّف على فرد بصورة/كاميرا بمقارنتها ببصمات العائلة
// ===== الخريطة الجغرافية (Leaflet من CDN) =====
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
let _leafletReady = null;
function ensureLeaflet() {
  if (_leafletReady) return _leafletReady;
  _leafletReady = (async () => {
    if (!document.querySelector('link[data-leaflet]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = LEAFLET_CSS; l.setAttribute('data-leaflet', '1'); document.head.appendChild(l);
    }
    if (!window.L) {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = LEAFLET_JS; s.onload = res; s.onerror = () => rej(new Error('تعذّر تحميل مكتبة الخريطة')); document.head.appendChild(s); });
    }
    return window.L;
  })().catch((e) => { _leafletReady = null; throw e; });
  return _leafletReady;
}
const CITY_COORD = {
  "الرياض": [24.7136, 46.6753], "الدمام": [26.4207, 50.0888], "المجمعة": [25.9039, 45.345],
  "المدينة": [24.5247, 39.5692], "المدينة المنورة": [24.5247, 39.5692], "جلاجل": [25.6862, 45.1719],
  "حرمة": [25.93, 45.32], "حفر الباطن": [28.4342, 45.9636], "الخرج": [24.1554, 47.312],
  "الظهران": [26.2861, 50.1146], "جدة": [21.4858, 39.1925], "الخبر": [26.2794, 50.2083],
  "تبوك": [28.3838, 36.555], "الكويت": [29.3759, 47.9774], "البحرين": [26.0667, 50.5577],
  "مكة": [21.3891, 39.8579], "مكة المكرمة": [21.3891, 39.8579], "بريدة": [26.3599, 43.9818],
  "عنيزة": [26.0843, 43.9935], "الأحساء": [25.3833, 49.5867], "الهفوف": [25.3833, 49.5867],
  "ينبع": [24.0895, 38.0618], "الطائف": [21.2703, 40.4158], "القصيم": [26.2078, 43.9836],
};
function FamilyMapModal({ members, onClose }) {
  const ref = useRef(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const counts = useMemo(() => {
    const c = {};
    members.forEach((m) => { const r = (m.region || "").trim(); if (r) c[r] = (c[r] || 0) + 1; });
    return c;
  }, [members]);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const totalPlaced = sorted.filter(([c]) => CITY_COORD[c]).reduce((s, [, n]) => s + n, 0);
  useEffect(() => {
    let map, cancelled = false;
    ensureLeaflet().then((L) => {
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: true, attributionControl: false }).setView([25.0, 45.5], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12 }).addTo(map);
      const mx = Math.max(1, ...Object.values(counts));
      sorted.forEach(([city, n]) => {
        const c = CITY_COORD[city]; if (!c) return;
        const r = 9 + 26 * Math.sqrt(n / mx);
        L.circleMarker(c, { radius: r, color: "#123838", weight: 1.5, fillColor: "#B4894A", fillOpacity: 0.72 })
          .addTo(map).bindPopup(`<b>${city}</b><br>${n} فرداً`).bindTooltip(`${city} · ${n}`);
      });
      setLoading(false);
      setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 250);
    }).catch((e) => { setErr(e.message || "تعذّر تحميل الخريطة"); setLoading(false); });
    return () => { cancelled = true; if (map) { try { map.remove(); } catch (e) {} } };
  }, [counts]);
  return (
    <div style={{ position: "fixed", inset: 0, background: TT.tealDark, zIndex: 70, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, borderBottom: `2px solid ${TT.gold500}` }}>
        <span style={{ color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "'Aref Ruqaa', serif" }}>خريطة توزيع العائلة</span>
        <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(244,239,227,0.12)", border: "none", borderRadius: 999, color: "#F4EFE3", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 12px" }}><X size={16} /> إغلاق</button>
      </div>
      <div style={{ flex: 1, position: "relative", background: TT.sand100 }}>
        <div ref={ref} style={{ position: "absolute", inset: 0 }} />
        {loading && !err && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: TT.teal800 }}>
            <Loader2 size={26} style={{ animation: "rosette-spin 1.1s linear infinite" }} /> <span style={{ fontSize: 13 }}>جارِ تحميل الخريطة...</span>
          </div>
        )}
        {err && (
          <div style={{ position: "absolute", inset: 0, overflow: "auto", padding: 18, background: T.sand }}>
            <div style={{ fontSize: 13, color: T.clay, marginBottom: 12 }}>{err} — إليك التوزيع كقائمة:</div>
            {sorted.map(([c, n]) => (
              <div key={c} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${T.line}`, padding: "7px 4px", fontSize: 13, color: T.text }}><span>{c}</span><b>{n}</b></div>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: "8px 14px", background: TT.teal900, color: "#CFE0DC", fontSize: 11.5, textAlign: "center" }}>
        {totalPlaced} فرداً موزّعين على {sorted.filter(([c]) => CITY_COORD[c]).length} مدينة · المس أي دائرة لعدد أفرادها
      </div>
    </div>
  );
}

// ===== لوحة الإحصاءات داخل الصفحة =====
function StatsModal({ members, onClose }) {
  const s = useMemo(() => {
    const males = members.filter((m) => m.gender !== "female");
    const byId = Object.fromEntries(males.map((m) => [m.id, m]));
    const ch = {}; males.forEach((m) => { if (m.fatherId) (ch[m.fatherId] = ch[m.fatherId] || []).push(m.id); });
    const leaves = males.filter((m) => !ch[m.id]);
    const depth = (m) => { let d = 1, c = m, seen = new Set(); while (c && c.fatherId && byId[c.fatherId] && !seen.has(c.id)) { seen.add(c.id); c = byId[c.fatherId]; d++; } return d; };
    const alive = leaves.filter((m) => m.isAlive).length;
    const maxg = males.length ? Math.max(...males.map(depth)) : 0;
    const cnt = (arr, key) => { const o = {}; arr.forEach((m) => { const v = key(m); if (v) o[v] = (o[v] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
    const names = cnt(leaves, (m) => m.name).slice(0, 8);
    const cities = cnt(leaves, (m) => (m.region || "").trim()).slice(0, 8);
    const withphone = leaves.filter((m) => m.hasPhone).length;
    const distinct = new Set(leaves.map((m) => m.name)).size;
    return { total: members.length, males: males.length, leaves: leaves.length, alive, maxg, names, cities, withphone, distinct };
  }, [members]);
  const bar = (data, color) => {
    const mx = Math.max(1, ...data.map((d) => d[1]));
    return data.map(([l, v]) => (
      <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, margin: "5px 0", fontSize: 12.5 }}>
        <span style={{ width: 78, flexShrink: 0, textAlign: "right", fontWeight: 700, color: T.ink }}>{l}</span>
        <span style={{ flex: 1, height: 13, background: T.sandDark, borderRadius: 999, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${v / mx * 100}%`, background: color, borderRadius: 999 }} /></span>
        <span style={{ width: 34, flexShrink: 0, fontSize: 11.5, color: T.muted }}>{v}</span>
      </div>
    ));
  };
  const sc = (v, l, c = T.ink) => (<div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div><div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>{l}</div></div>);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ background: T.sand, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", fontFamily: "'Tajawal', sans-serif" }}>
        <div style={{ background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0 }}>
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "'Aref Ruqaa', serif" }}>إحصاءات العائلة</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#e9e2d0", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {sc(s.leaves, "الأطراف", T.gold)}{sc(s.alive, "الأحياء", "#1b7a3d")}{sc(s.maxg, "الأجيال")}
            {sc(s.males, "الذكور")}{sc(s.withphone, "بجوال", TT.teal800)}{sc(s.distinct, "تنوّع الأسماء", T.gold)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: "16px 0 6px" }}>أكثر أسماء الأطراف</div>
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 12px" }}>{bar(s.names, T.gold)}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: "16px 0 6px" }}>مدن الأطراف</div>
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 12px" }}>{bar(s.cities, TT.teal800)}</div>
        </div>
      </div>
    </div>
  );
}

// ===== بطاقة النسب بـQR =====
function NasabCardModal({ member, onClose }) {
  const link = (typeof window !== "undefined" ? window.location.origin : "") + "/?m=" + member.id;
  const qr = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=" + encodeURIComponent(link);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} dir="rtl" style={{ width: "100%", maxWidth: 360, fontFamily: "'Tajawal', sans-serif" }}>
        <div style={{ background: T.card, borderRadius: 18, overflow: "hidden", border: `2px solid ${TT.gold500}`, boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
          <div style={{ background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, padding: "18px 16px", textAlign: "center" }}>
            <div style={{ color: TT.gold400, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>عائلة آل تركي</div>
            <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 8px" }}><Avatar name={member.name} photoUrl={member.photoUrl} gender={member.gender} size={78} /></div>
            <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 20, color: "#fff", fontWeight: 700 }}>{member.name}</div>
          </div>
          <div style={{ padding: "16px" }}>
            <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.9, textAlign: "center", wordBreak: "break-word" }}>{member.fullNasab || member.nasab}</div>
            {member.memberNumber && <div style={{ textAlign: "center", fontSize: 11.5, color: T.gold, fontWeight: 700, marginTop: 8 }}>الرقم التعريفي: {member.memberNumber}</div>}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <img src={qr} alt="QR" width={150} height={150} style={{ borderRadius: 10, border: `1px solid ${T.line}` }} />
            </div>
            <div style={{ textAlign: "center", fontSize: 10.5, color: T.muted, marginTop: 8 }}>امسح الرمز لفتح صفحته في الموقع</div>
          </div>
        </div>
        <button onClick={onClose} style={{ width: "100%", marginTop: 12, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>إغلاق · (لحفظها: التقط لقطة شاشة)</button>
      </div>
    </div>
  );
}

// ===== تصدير الكشوف (CSV) =====
function ExportModal({ members, onClose }) {
  const dl = (name, rows) => {
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  const males = members.filter((m) => m.gender !== "female");
  const ch = {}; males.forEach((m) => { if (m.fatherId) ch[m.fatherId] = true; });
  const leaves = males.filter((m) => !ch[m.id]);
  const H = ["الاسم / النسب", "الرقم التعريفي", "المدينة", "الجوال", "الحالة"];
  const row = (m) => [m.fullNasab || m.nasab || m.name, m.memberNumber || "", m.region || "", (m.isAlive && m.phone && m.phoneVisible) ? m.phone : "", m.isAlive ? "حي" : "متوفى"];
  const btns = [
    ["كل الأعضاء", () => dl("كل_الأعضاء.csv", [H, ...males.map(row)]), males.length],
    ["كشف الأطراف", () => dl("كشف_الأطراف.csv", [H, ...leaves.map(row)]), leaves.length],
    ["كشف الأحياء", () => dl("كشف_الأحياء.csv", [H, ...males.filter((m) => m.isAlive).map(row)]), males.filter((m) => m.isAlive).length],
    ["دليل الهاتف", () => dl("دليل_الهاتف.csv", [["الاسم", "الجوال", "المدينة"], ...males.filter((m) => m.phone && m.phoneVisible).map((m) => [m.fullNasab || m.name, m.phone, m.region || ""])]), males.filter((m) => m.phone && m.phoneVisible).length],
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ background: T.card, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 420, fontFamily: "'Tajawal', sans-serif" }}>
        <div style={{ background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "'Aref Ruqaa', serif" }}>تقارير وإحصاءات</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#e9e2d0", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>تنزيل ملف Excel/CSV (يفتح بالعربية). الجوال يظهر فقط لِمن أتاحه.</div>
          <div style={{ display: "grid", gap: 9 }}>
            {btns.map(([label, fn, n]) => (
              <button key={label} onClick={fn} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.sand, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: T.ink }}><FileText size={15} color={T.gold} /> {label}</span>
                <span style={{ fontSize: 11.5, color: T.muted }}>{n} · تنزيل</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== لعبة «اختبر صلتك» — خمّن الشخص =====
function fourPartName(m) {
  return (m.fullNasab || m.nasab || m.name).split(" بن ").slice(0, 4).join(" بن ");
}
function shuffleArr(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
const WIN_PHRASES = ["أحسنت! صلةٌ موصولة 🎉", "عين الصواب! 👏", "ما شاء الله، تعرفهم حق المعرفة 🌿", "إجابة موفّقة! ✨", "بارك الله فيك، صحيحة! 🎯"];
const LOSE_PHRASES = ["للأسف! 🥴", "قريبة… لكن ليست هي 😅", "لا بأس، تُعرف الرجال بمجالسها 🤍", "خانك التوفيق هذه المرة 🙈"];

function RelationGameModal({ members, onClose }) {
  const pools = useMemo(() => {
    const males = members.filter((m) => m.gender !== "female");
    const photoMembers = males.filter((m) => m.photoUrl && m.faceConsent);
    return { males, photoMembers };
  }, [members]);

  const [q, setQ] = useState(null);
  const [phase, setPhase] = useState("play"); // play | correct | wrong
  const [chosen, setChosen] = useState(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [rounds, setRounds] = useState(0);
  const lastRef = useRef(null);

  const buildQuestion = () => {
    const { males, photoMembers } = pools;
    if (photoMembers.length === 0) return null;
    // اختيار الشخص الصحيح (تجنّب تكرار نفس الشخص مباشرةً)
    let answer = photoMembers[Math.floor(Math.random() * photoMembers.length)];
    if (photoMembers.length > 1 && lastRef.current) {
      let guard = 0;
      while (answer.id === lastRef.current && guard < 8) { answer = photoMembers[Math.floor(Math.random() * photoMembers.length)]; guard++; }
    }
    lastRef.current = answer.id;
    const canFaces = photoMembers.length >= 3;
    const mode = canFaces && Math.random() < 0.5 ? "faces" : "names";
    if (mode === "faces") {
      const others = shuffleArr(photoMembers.filter((m) => m.id !== answer.id)).slice(0, 2);
      const opts = shuffleArr([answer, ...others]).map((m) => ({ member: m, correct: m.id === answer.id }));
      return { mode, answer, prompt: fourPartName(answer), options: opts };
    }
    // mode names: نعرض الصورة ونطلب الاسم الرباعي الصحيح
    const correctName = fourPartName(answer);
    const distractors = [];
    const seen = new Set([correctName]);
    const shuffledMales = shuffleArr(males);
    for (const m of shuffledMales) {
      if (distractors.length >= 2) break;
      const nm = fourPartName(m);
      if (!seen.has(nm)) { seen.add(nm); distractors.push(nm); }
    }
    const opts = shuffleArr([correctName, ...distractors]).map((t) => ({ text: t, correct: t === correctName }));
    return { mode, answer, options: opts };
  };

  useEffect(() => { setQ(buildQuestion()); /* eslint-disable-next-line */ }, []);

  const choose = (opt) => {
    if (phase !== "play") return;
    setChosen(opt);
    setRounds((r) => r + 1);
    if (opt.correct) {
      setPhase("correct");
      setStreak((s) => { const n = s + 1; setBest((b) => Math.max(b, n)); return n; });
    } else {
      setPhase("wrong");
      setBest((b) => Math.max(b, streak));
    }
  };
  const next = () => { setChosen(null); setPhase("play"); setQ(buildQuestion()); };
  const restart = () => { setStreak(0); setRounds(0); lastRef.current = null; setChosen(null); setPhase("play"); setQ(buildQuestion()); };

  const winPhrase = useMemo(() => WIN_PHRASES[Math.floor(Math.random() * WIN_PHRASES.length)], [phase === "correct" ? rounds : 0]);
  const losePhrase = useMemo(() => LOSE_PHRASES[Math.floor(Math.random() * LOSE_PHRASES.length)], [phase === "wrong" ? rounds : 0]);

  const shell = (inner) => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }} onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ background: T.sand, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto", fontFamily: "'Tajawal', sans-serif" }}>
        <div style={{ background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 2 }}>
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "'Aref Ruqaa', serif", display: "flex", alignItems: "center", gap: 8 }}><Gamepad2 size={18} color={TT.gold400} /> اختبر صلتك</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: TT.gold400, fontSize: 13, fontWeight: 800 }}><Sparkles size={14} /> {streak}</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#e9e2d0", cursor: "pointer" }}><X size={20} /></button>
          </div>
        </div>
        <div style={{ padding: 16 }}>{inner}</div>
      </div>
    </div>
  );

  if (!q) {
    return shell(
      <div style={{ textAlign: "center", padding: "24px 8px" }}>
        <Camera size={40} color={T.gold} />
        <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, margin: "12px 0 6px" }}>لا توجد صور كافية بعد</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.8 }}>تحتاج اللعبة صوراً لأفراد العائلة. شجّع الجميع على رفع صورهم (بموافقتهم) من الملف الشخصي، وستُفتح اللعبة تلقائياً 🌿</div>
      </div>
    );
  }

  const optBg = (opt) => {
    if (phase === "play") return T.card;
    if (opt.correct) return "#e7f6ec";
    if (chosen === opt) return "#fbe6e2";
    return T.card;
  };
  const optBorder = (opt) => {
    if (phase === "play") return T.line;
    if (opt.correct) return "#1b7a3d";
    if (chosen === opt) return "#c0392b";
    return T.line;
  };

  return shell(
    <div>
      {/* الاحتفاء / خيبة الأمل */}
      {phase === "correct" && (
        <div style={{ textAlign: "center", background: "linear-gradient(160deg,#1b7a3d,#12602f)", color: "#fff", borderRadius: 14, padding: "12px 14px", marginBottom: 14, border: `1px solid ${TT.gold500}` }}>
          <div style={{ fontSize: 26, marginBottom: 2 }}>🎉</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{winPhrase}</div>
          <div style={{ fontSize: 12, color: "#d9f2e1", marginTop: 3 }}>سلسلتك الآن: {streak} {streak >= 5 ? "🔥" : ""}</div>
        </div>
      )}
      {phase === "wrong" && (
        <div style={{ textAlign: "center", background: "linear-gradient(160deg,#a24936,#7d3627)", color: "#fff", borderRadius: 14, padding: "12px 14px", marginBottom: 14, border: `1px solid ${TT.gold500}` }}>
          <div style={{ fontSize: 26, marginBottom: 2 }}>😅</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{losePhrase}</div>
          <div style={{ fontSize: 12.5, color: "#f4ded7", marginTop: 4 }}>الصحيح: <b>{fourPartName(q.answer)}</b></div>
        </div>
      )}

      {/* السؤال */}
      {q.mode === "names" ? (
        <>
          <div style={{ textAlign: "center", fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 12 }}>مَن هذا؟ اختر اسمه الرباعي:</div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ borderRadius: "50%", border: `3px solid ${TT.gold500}`, padding: 3, background: T.card, boxShadow: "0 4px 14px rgba(13,43,43,0.18)" }}>
              <Avatar name={q.answer.name} photoUrl={q.answer.photoUrl} gender={q.answer.gender} size={130} />
            </div>
          </div>
          <div style={{ display: "grid", gap: 9 }}>
            {q.options.map((opt, i) => (
              <button key={i} onClick={() => choose(opt)} disabled={phase !== "play"} style={{ textAlign: "right", background: optBg(opt), border: `1.5px solid ${optBorder(opt)}`, borderRadius: 12, padding: "13px 15px", cursor: phase === "play" ? "pointer" : "default", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ wordBreak: "break-word" }}>{opt.text}</span>
                {phase !== "play" && opt.correct && <Check size={18} color="#1b7a3d" />}
                {phase !== "play" && chosen === opt && !opt.correct && <X size={18} color="#c0392b" />}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ textAlign: "center", fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 4 }}>أيّ الصور لـ:</div>
          <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: TT.teal800, marginBottom: 14, fontFamily: "'Aref Ruqaa', serif", wordBreak: "break-word" }}>{q.prompt}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {q.options.map((opt, i) => (
              <button key={i} onClick={() => choose(opt)} disabled={phase !== "play"} style={{ background: optBg(opt), border: `2px solid ${optBorder(opt)}`, borderRadius: 14, padding: 8, cursor: phase === "play" ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <Avatar name={opt.member.name} photoUrl={opt.member.photoUrl} gender={opt.member.gender} size={78} />
                {phase !== "play" && opt.correct && <span style={{ fontSize: 11, fontWeight: 800, color: "#1b7a3d" }}>هو ✓</span>}
                {phase !== "play" && chosen === opt && !opt.correct && <span style={{ fontSize: 11, fontWeight: 800, color: "#c0392b" }}>ليس هو</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {/* أزرار المتابعة */}
      <div style={{ marginTop: 18 }}>
        {phase === "correct" && (
          <button onClick={next} style={{ width: "100%", background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, color: "#fff", border: `1px solid ${TT.gold500}`, borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            التالي <ChevronLeft size={18} />
          </button>
        )}
        {phase === "wrong" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: T.card, border: `1px solid ${TT.gold500}`, borderRadius: 12, padding: "10px", marginBottom: 10 }}>
              <Trophy size={18} color={T.gold} />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: T.ink }}>انتهت الجولة · أطول سلسلة: {best}</span>
            </div>
            <button onClick={restart} style={{ width: "100%", background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, color: "#fff", border: `1px solid ${TT.gold500}`, borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <RotateCcw size={17} /> العب مجدّداً
            </button>
          </div>
        )}
        {phase === "play" && (
          <div style={{ textAlign: "center", fontSize: 11.5, color: T.muted }}>سلسلتك الحالية: {streak} · أطول سلسلة: {best}</div>
        )}
      </div>
    </div>
  );
}

// ===== حاسبة القرابة =====
function chainIds(id, byId) {
  const s = []; let c = id; const seen = new Set();
  while (c && !seen.has(c)) { seen.add(c); s.push(c); c = byId[c] ? byId[c].fatherId : null; }
  return s; // [id, الأب, ... الجذر]
}
function kinTerm(xu, yu) {
  const anc = ["", "الأب", "الجدّ", "جدّ الأب", "الجدّ الأعلى"];
  const desc = ["", "الابن", "الحفيد", "ابن الحفيد", "حفيد الحفيد"];
  if (xu === 0) return yu < anc.length ? anc[yu] : `جدّ أعلى (${yu} أجيال)`;
  if (yu === 0) return xu < desc.length ? desc[xu] : `من الذرّية (${xu} أجيال)`;
  if (xu === 1 && yu === 1) return "الأخ";
  if (xu === 1 && yu === 2) return "العمّ";
  if (xu === 2 && yu === 1) return "ابن الأخ";
  if (xu === 1 && yu >= 3) { const of = ["", "", "", "الأب", "الجدّ", "جدّ الأب"][yu]; return of ? `عمّ ${of}` : "عمّ الجدّ الأعلى"; }
  if (yu === 1 && xu >= 3) return `من ذرّية الأخ (${xu - 1} أجيال)`;
  const deg = Math.min(xu, yu) - 1;
  if (xu === yu) return deg === 1 ? "ابن العمّ" : `ابن العمّ من الدرجة ${deg}`;
  const diff = Math.abs(xu - yu);
  if (xu < yu) { const of = ["", "", "الأب", "الجدّ", "جدّ الأب"][diff + 1] || "جدّه"; return deg === 1 ? `ابن عمّ ${of}` : `ابن عمّ ${of} (درجة ${deg})`; }
  return `من ذرّية ابن العمّ (${diff} أجيال · درجة ${deg})`;
}
function computeKinship(idA, idB, byId) {
  if (!idA || !idB) return null;
  if (idA === idB) return { same: true };
  const A = chainIds(idA, byId), B = chainIds(idB, byId);
  const Bi = new Map(B.map((x, i) => [x, i]));
  let ua = -1, ub = -1, lca = null;
  for (let i = 0; i < A.length; i++) { if (Bi.has(A[i])) { ua = i; ub = Bi.get(A[i]); lca = A[i]; break; } }
  if (!lca) return { none: true };
  return { lca, ua, ub, aToB: kinTerm(ua, ub), bToA: kinTerm(ub, ua) };
}

function KinshipPicker({ members, value, onPick, placeholder }) {
  const [q, setQ] = useState("");
  const normA = (s) => normalizeArabicLetters(s).split(/\s+/).filter((w) => w && w !== "بن").join(" ").trim();
  const matches = q.trim().length >= 2 ? members.filter((m) => normA(m.nasab || m.name).includes(normA(q))).slice(0, 7) : [];
  if (value) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: T.sandDark, borderRadius: 10, padding: "9px 12px" }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, wordBreak: "break-word" }}>{value.nasab || value.name}</span>
      <button onClick={() => { onPick(null); setQ(""); }} style={{ background: "none", border: "none", color: T.clay, cursor: "pointer", flexShrink: 0 }}><X size={16} /></button>
    </div>
  );
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} style={inputStyle} />
      {q.trim().length >= 2 && (
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, marginTop: 6, maxHeight: 200, overflow: "auto", background: T.card }}>
          {matches.length === 0 ? <div style={{ padding: 10, fontSize: 12, color: T.muted, textAlign: "center" }}>لا نتائج.</div> :
            matches.map((m) => (
              <div key={m.id} onClick={() => onPick(m)} style={{ padding: "8px 12px", borderBottom: `1px solid ${T.line}`, cursor: "pointer", fontSize: 12.5, color: T.text }}>
                {m.nasab || m.name}{m.memberNumber ? ` ‹${m.memberNumber}›` : ""}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function KinshipModal({ members, onClose }) {
  const byId = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const [A, setA] = useState(null);
  const [B, setB] = useState(null);
  const res = (A && B) ? computeKinship(A.id, B.id, byId) : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ background: T.card, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", fontFamily: "'Tajawal', sans-serif" }}>
        <div style={{ background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "'Aref Ruqaa', serif" }}>حاسبة القرابة</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#e9e2d0", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12, lineHeight: 1.7 }}>اختر شخصين، فتُحسب صلتهما، والجدّ المشترك، ودرجة القرابة.</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 5 }}>الشخص الأول</div>
          <KinshipPicker members={members} value={A} onPick={setA} placeholder="ابحث عن الشخص الأول..." />
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, margin: "12px 0 5px" }}>الشخص الثاني</div>
          <KinshipPicker members={members} value={B} onPick={setB} placeholder="ابحث عن الشخص الثاني..." />

          {res && (
            <div style={{ marginTop: 16, background: T.sand, border: `1px solid ${TT.gold500}`, borderRadius: 14, padding: 16, textAlign: "center" }}>
              {res.same ? (
                <div style={{ fontSize: 14, color: T.clay, fontWeight: 700 }}>الشخصان واحد.</div>
              ) : res.none ? (
                <div style={{ fontSize: 14, color: T.clay }}>لا يوجد جدّ مشترك في الشجرة.</div>
              ) : (
                <>
                  <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 17, color: TT.teal800, lineHeight: 1.8 }}>
                    <b>{A.name}</b> هو <span style={{ color: TT.teal900, fontWeight: 800 }}>{res.aToB}</span> لـ <b>{B.name}</b>
                  </div>
                  <div style={{ fontSize: 13, color: T.text, marginTop: 4 }}>و <b>{B.name}</b> هو <span style={{ fontWeight: 800 }}>{res.bToA}</span> لـ <b>{A.name}</b></div>
                  <div style={{ borderTop: `1px dashed ${T.line}`, marginTop: 12, paddingTop: 12, fontSize: 13, color: T.text }}>
                    <div>الجدّ المشترك: <b style={{ color: T.gold }}>{byId[res.lca] ? byId[res.lca].name : ""}</b></div>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, wordBreak: "break-word" }}>{byId[res.lca] ? byId[res.lca].nasab : ""}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>يلتقيان عنده: {A.name} يبعد {res.ua} {res.ua === 1 ? "جيلاً" : "أجيال"}، و{B.name} يبعد {res.ub} {res.ub === 1 ? "جيلاً" : "أجيال"}.</div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WhoIsThisModal({ members, onClose, onOpenMember }) {
  const [phase, setPhase] = useState("idle"); // idle | working | done | error
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState("");
  const [results, setResults] = useState([]);
  const byId = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const handleImage = async (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) { setPhase("error"); setMsg("اختر صورة صحيحة."); return; }
    try { setPreview(URL.createObjectURL(file)); } catch (e) {}
    setResults([]); setPhase("working"); setMsg("جارِ تحميل نموذج التعرّف وتحليل الوجه...");
    try {
      const desc = await fileToFaceDescriptor(file);
      if (!desc) { setPhase("error"); setMsg("لم يُكتشف وجه واضح — جرّب صورة أقرب وأوضح للوجه، بإضاءة جيدة."); return; }
      const { data, error } = await supabase.rpc("match_faces", { query_embedding: descriptorToVector(desc), match_count: 3, max_distance: 0.6 });
      if (error) { console.error(error); setPhase("error"); setMsg("تعذّر البحث في القاعدة. حاول مجدداً."); return; }
      const cands = (data || []).map((r) => ({ member: byId[r.member_id], confidence: distanceToConfidence(r.distance) })).filter((c) => c.member);
      setResults(cands); setPhase("done");
      setMsg(cands.length ? "" : "لم يُتعرّف على الوجه — قد لا يكون الشخص قد رفع صورته وفعّل موافقته بعد.");
    } catch (e) {
      console.error(e); setPhase("error"); setMsg((e && e.message) ? e.message : "حدث خطأ أثناء التحليل.");
    }
  };

  const pickBtn = (label, icon, capture) => (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "16px 10px", background: T.sand, border: `1px solid ${T.line}`, borderRadius: 14, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: T.ink }}>
      {icon}
      {label}
      <input type="file" accept="image/*" {...(capture ? { capture } : {})} onChange={(e) => { handleImage(e.target.files && e.target.files[0]); e.target.value = ""; }} style={{ display: "none" }} />
    </label>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ background: T.card, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", fontFamily: "'Tajawal', sans-serif" }}>
        <div style={{ background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "'Aref Ruqaa', serif" }}>مَن هذا؟</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#e9e2d0", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ padding: 18 }}>
          {preview && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <img src={preview} alt="الصورة" style={{ width: 120, height: 120, borderRadius: 14, objectFit: "cover", border: `2px solid ${TT.gold500}` }} />
            </div>
          )}

          {phase === "idle" && (
            <>
              <div style={{ fontSize: 12.5, color: T.muted, textAlign: "center", marginBottom: 14, lineHeight: 1.7 }}>التقط صورة للوجه أو اخترها، ويُقارَن بصور العائلة لعرض الأرجح. القرار النهائي لك.</div>
              <div style={{ display: "flex", gap: 10 }}>
                {pickBtn("التقاط بالكاميرا", <Camera size={22} color={T.gold} />, "environment")}
                {pickBtn("اختيار صورة", <ImagePlus size={22} color={T.gold} />)}
              </div>
            </>
          )}

          {phase === "working" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "24px 0", color: T.muted }}>
              <Loader2 size={26} style={{ animation: "rosette-spin 1.1s linear infinite", color: T.gold }} />
              <span style={{ fontSize: 12.5 }}>{msg}</span>
              <span style={{ fontSize: 10.5, color: T.muted }}>أول مرة قد تأخذ لحظات لتحميل النموذج.</span>
            </div>
          )}

          {phase === "error" && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 13, color: T.clay, marginBottom: 14, lineHeight: 1.7 }}>{msg}</div>
              <button onClick={() => { setPhase("idle"); setPreview(""); setMsg(""); }} style={{ background: TT.teal800, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>حاول مجدداً</button>
            </div>
          )}

          {phase === "done" && (
            <>
              {results.length === 0 ? (
                <div style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: "10px 0", lineHeight: 1.8 }}>{msg}</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 12, color: T.muted, textAlign: "center" }}>الأرجح (اضغط للتأكيد وفتح الملف):</div>
                  {results.map(({ member: m, confidence }, i) => (
                    <button key={m.id} onClick={() => onOpenMember(m)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "right", background: i === 0 ? TT.hasPhoneFill : T.sand, border: `1px solid ${i === 0 ? "#2e9c63" : T.line}`, borderRadius: 14, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                      <Avatar name={m.name} photoUrl={m.photoUrl} gender={m.gender} size={48} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: T.ink }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: T.muted, wordBreak: "break-word" }}>{m.nasab}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 999, background: T.sandDark, overflow: "hidden" }}>
                            <div style={{ width: `${confidence}%`, height: "100%", background: confidence >= 70 ? "#1b7a3d" : confidence >= 45 ? TT.gold500 : T.clay }} />
                          </div>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.muted }}>{confidence}%</span>
                        </div>
                      </div>
                    </button>
                  ))}
                  <div style={{ fontSize: 10.5, color: T.muted, textAlign: "center", lineHeight: 1.7 }}>ملاحظة: التشابه العائلي قد يخلط بين الأقارب — تأكّد بنفسك قبل الاعتماد على النتيجة.</div>
                </div>
              )}
              <button onClick={() => { setPhase("idle"); setPreview(""); setMsg(""); setResults([]); }} style={{ width: "100%", marginTop: 14, background: "transparent", color: TT.teal800, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>صورة أخرى</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeTab({ members, setMembers, profilesMap, canManageTree }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [profileMember, setProfileMember] = useState(null);
  const [whoOpen, setWhoOpen] = useState(false);
  const [kinOpen, setKinOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const centeredRef = useRef(false);
  const [expandedResults, setExpandedResults] = useState(() => new Set());
  const [pdfOpen, setPdfOpen] = useState(false);
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

    return () => {
      cancelled = true;
      // تحرير ذاكرة الكانفاس فور إغلاق العارض — ضروري بوضع "التطبيق المستقل" بآيفون
      // اللي يدير الذاكرة بصرامة أكبر من المتصفح العادي
      const canvas = canvasRef.current;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    };
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

  // نحذف «بن» ككلمة مستقلة فقط، حتى لا نُفسد أسماء تحتوي التتابع مثل «بندر» أو «لبنى»
  // ونوحّد الحروف ذات الصفة الواحدة (الهمزات، التاء المربوطة، الألف المقصورة) قبل المقارنة
  const norm = (s) => normalizeArabicLetters(s).split(/\s+/).filter((w) => w && w !== "بن").join(" ").trim();
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
    const willExpand = !expanded.has(id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // عند فتح الامتداد: نرفع العقدة تلقائياً نحو أعلى-وسط الإطار ليظهر الأبناء دون تمرير يدوي
    if (willExpand) {
      setTimeout(() => {
        const container = svgWrapRef.current;
        const el = container?.querySelector(`[data-node-id="${id}"]`);
        if (container && el) {
          const elRect = el.getBoundingClientRect();
          const contRect = container.getBoundingClientRect();
          container.scrollBy({
            left: (elRect.left + elRect.width / 2) - (contRect.left + contRect.width / 2),
            top: (elRect.top + elRect.height / 2) - (contRect.top + contRect.height * 0.28),
            behavior: "smooth",
          });
        }
      }, 90);
    }
  };

  const layout = useMemo(() => {
    if (!rootId || !byId[rootId]) return { nodes: [], edges: [], width: 0, height: 0 };

    // نحفظ عرض كل شجرة فرعية (memoization) لتفادي إعادة الحساب O(n²) في الأشجار الكبيرة
    const widthCache = new Map();
    const subtreeWidth = (id) => {
      if (widthCache.has(id)) return widthCache.get(id);
      const kids = expanded.has(id) ? (childrenMap[id] || []) : [];
      const w = kids.length === 0
        ? TREE_NODE_W + TREE_H_GAP
        : kids.reduce((sum, kidId) => sum + subtreeWidth(kidId), 0);
      widthCache.set(id, w);
      return w;
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
    const rawWidth = subtreeWidth(rootId);
    const canvasW = Math.max(rawWidth, 260);
    // نُزيح الشجرة أفقياً بحيث يقع «تركي» تماماً في منتصف اللوحة
    const rootNode = nodes.find((n) => n.id === rootId);
    const offset = rootNode ? canvasW / 2 - rootNode.x : 0;
    if (offset) {
      nodes.forEach((n) => { n.x += offset; });
      edges.forEach((e) => { e.x1 += offset; e.x2 += offset; });
    }
    const height = (maxDepth + 1) * (TREE_NODE_H + TREE_V_GAP);
    return { nodes, edges, width: canvasW, height };
  }, [rootId, byId, childrenMap, expanded]);

  // تمركز الجذر «تركي» أفقياً في منتصف الصفحة عند أول عرض
  useEffect(() => {
    if (centeredRef.current) return;
    const c = svgWrapRef.current;
    if (c && layout.width > 0) {
      c.scrollLeft = (c.scrollWidth - c.clientWidth) / 2;
      centeredRef.current = true;
    }
  }, [layout.width]);

  return (
    <div>
      {/* المربّع الزخرفي */}
      <div style={{ marginTop: 4, marginBottom: 10, borderRadius: 14, overflow: "hidden", border: `1px solid ${TT.gold500}`, boxShadow: "0 3px 10px rgba(13,43,43,0.15)" }}>
        <img
          src="/Nasab-Frame.jpeg"
          alt="نسب آل تركي من ذرية تركي بن إبراهيم بن سليمان بن حماد بن عامر البدراني الدوسري، المتوفى عام ١١١٧هـ رحمه الله"
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>

      {/* مستطيل البحث */}
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={15} style={{ position: "absolute", right: 12, top: 11, color: T.muted }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن فرد بالاسم..." style={{ ...inputStyle, padding: "9px 38px 9px 36px" }} />
        {query && (
          <button onClick={() => setQuery("")} title="مسح البحث" aria-label="مسح البحث" style={{ position: "absolute", left: 8, top: 7, background: "transparent", border: "none", cursor: "pointer", color: T.muted, padding: 4, display: "flex", alignItems: "center" }}>
            <X size={15} />
          </button>
        )}
      </div>

      {/* تبويبان: التفاعلية (نشطة) + المصوّرة (زر يفتح النافذة) */}
      <div style={{ display: "flex", gap: 5, background: T.sandDark, borderRadius: 12, padding: 4, marginBottom: 12 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 8px", background: TT.teal800, color: "#fff", borderRadius: 9, fontSize: 12.5, fontWeight: 800, boxShadow: "0 1px 3px rgba(13,43,43,0.2)" }}>
          <GitBranch size={16} color={TT.gold400} /> الشجرة التفاعلية
        </div>
        <button onClick={() => setPdfOpen(true)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 8px", background: "transparent", color: T.ink, border: "none", borderRadius: 9, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
          <FileText size={16} color={T.gold} /> الشجرة المصوّرة
        </button>
      </div>

      {/* أدوات: التعرّف بالصورة + حاسبة القرابة */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setWhoOpen(true)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 8px", background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, color: "#fff", border: `1px solid ${TT.gold500}`, borderRadius: 12, fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
          <Camera size={16} color={TT.gold400} /> مَن هذا؟
        </button>
        <button onClick={() => setKinOpen(true)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 8px", background: `linear-gradient(160deg, ${TT.teal800}, ${TT.teal900})`, color: "#fff", border: `1px solid ${TT.gold500}`, borderRadius: 12, fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
          <GitBranch size={16} color={TT.gold400} /> حاسبة القرابة
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setMapOpen(true)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 6px", background: T.card, color: T.ink, border: `1px solid ${T.gold}`, borderRadius: 12, fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
          <MapPin size={15} color={T.gold} /> الخريطة
        </button>
        <button onClick={() => setStatsOpen(true)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 6px", background: T.card, color: T.ink, border: `1px solid ${T.gold}`, borderRadius: 12, fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
          <Newspaper size={15} color={T.gold} /> الإحصاءات
        </button>
        <button onClick={() => setExportOpen(true)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 6px", background: T.card, color: T.ink, border: `1px solid ${T.gold}`, borderRadius: 12, fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
          <FileText size={15} color={T.gold} /> تصدير
        </button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => setGameOpen(true)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 8px", background: `linear-gradient(160deg, ${T.gold}, #9c7238)`, color: "#fff", border: `1px solid ${TT.gold500}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 2px 8px rgba(180,137,74,0.3)" }}>
          <Gamepad2 size={17} color="#fff" /> اختبر صلتك — لعبة خمّن الشخص
        </button>
      </div>

      {/* نتائج البحث */}
      {query.trim() && (
        <div style={{ border: `1px solid ${TT.gold500}`, borderRadius: 14, background: T.card, marginBottom: 12, overflow: "auto", maxHeight: "50vh" }}>
          {searchResults.length === 0 ? (
            <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: T.muted }}>لا نتائج مطابقة.</div>
          ) : (
            searchResults.map(({ member: rm, label }) => (
              <div key={rm.id} style={{ padding: "10px 12px", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, wordBreak: "break-word" }}>{label}</span>
                  {rm.fullNasab && rm.fullNasab !== label && (
                    <button onClick={() => setExpandedResults((prev) => { const n = new Set(prev); n.has(rm.id) ? n.delete(rm.id) : n.add(rm.id); return n; })} title="إظهار النسب كامل" style={{ border: `1px solid ${T.line}`, background: "transparent", borderRadius: 8, padding: "2px 5px", cursor: "pointer", color: T.muted, display: "flex", alignItems: "center" }}>
                      <ChevronDown size={13} style={{ transform: expandedResults.has(rm.id) ? "rotate(180deg)" : "none" }} />
                    </button>
                  )}
                </div>
                <button onClick={() => goToMember(rm.id)} title="الذهاب لمكانه بالشجرة" style={{ border: "none", background: TT.teal800, color: "#fff", borderRadius: 8, padding: "4px 9px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 10.5 }}>
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

      {/* الشجرة التفاعلية — «تركي» في المنتصف */}
      {!rootId ? (
        <EmptyState text="تعذّر تحديد جذر الشجرة." />
      ) : (
        <div ref={svgWrapRef} style={{ overflow: "auto", border: `1.5px solid ${TT.gold500}`, borderRadius: 14, background: TT.sand100, padding: 16, maxHeight: "62vh" }}>
          <div style={{ position: "relative", width: Math.max(layout.width, 260), height: layout.height + 30, margin: "0 auto" }}>
            <svg width={Math.max(layout.width, 260)} height={layout.height + 30} style={{ position: "absolute", top: 0, right: 0, pointerEvents: "none" }}>
              {layout.edges.map((e, i) => (
                <path key={i} d={`M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}`} stroke={TT.line} strokeWidth={1.6} fill="none" />
              ))}
            </svg>
            {layout.nodes.map((n) => {
              const m = byId[n.id];
              const isRoot = n.id === rootId;
              const hasPhone = m?.isAlive !== false && !!m?.hasPhone;
              const isDeceased = m?.isAlive === false;
              const isSelected = selectedNode === n.id;
              const av = isRoot ? 56 : 46;
              let ring = TT.teal800;
              if (isRoot) ring = TT.gold500;
              else if (hasPhone) ring = "#2e9c63";
              if (isSelected) ring = TT.gold500;
              const nm = m?.name || "";
              return (
                <div key={n.id} data-node-id={n.id} style={{ position: "absolute", left: n.x - TREE_NODE_W / 2, top: n.y, width: TREE_NODE_W, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div onClick={() => { setSelectedNode(n.id); setDetailId(n.id); }} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: "100%" }}>
                    <div style={{ width: av, height: av, borderRadius: "50%", background: isRoot ? TT.teal900 : T.card, border: `2px ${isDeceased ? "dashed" : "solid"} ${ring}`, boxShadow: hasPhone && !isSelected && !isRoot ? `0 0 0 3px ${TT.hasPhoneFill}` : "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                      {m?.photoUrl && m?.gender !== "female" ? (
                        <img src={m.photoUrl} alt={nm} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: `linear-gradient(155deg, ${T.inkSoft}, ${T.ink})`, color: T.goldLight, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: av * 0.42 }}>
                          {nm ? nm[0] : ""}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: isRoot ? 12.5 : 11.5, fontWeight: isRoot ? 800 : 700, color: isDeceased ? T.muted : T.ink, textAlign: "center", lineHeight: 1.25, maxWidth: TREE_NODE_W, wordBreak: "break-word" }}>
                      {nm.length > 12 ? nm.slice(0, 11) + "…" : nm}
                    </div>
                  </div>
                  {n.hasChildren && (
                    <div onClick={(ev) => { ev.stopPropagation(); setSelectedNode(n.id); toggle(n.id); }} title={expanded.has(n.id) ? "طيّ الأبناء" : "عرض الأبناء"} style={{ cursor: "pointer", width: 20, height: 20, borderRadius: "50%", background: expanded.has(n.id) ? TT.teal800 : T.sandDark, border: `1px solid ${expanded.has(n.id) ? TT.teal800 : T.line}`, color: expanded.has(n.id) ? "#fff" : T.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, lineHeight: 1, marginTop: 1 }}>
                      {expanded.has(n.id) ? "▴" : "▾"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* المفتاح */}
      <div style={{ textAlign: "center", fontSize: 11, color: T.muted, marginTop: 10 }}>المس صورة أي فرد لعرض بطاقته · اضغط ▾ لعرض الأبناء</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 8, fontSize: 11, color: T.muted }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 13, height: 13, borderRadius: "50%", background: T.card, border: `2px solid #2e9c63`, boxShadow: `0 0 0 2px ${TT.hasPhoneFill}` }} /> جوال مسجّل
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 13, height: 13, borderRadius: "50%", background: T.card, border: `2px solid ${TT.teal800}` }} /> على قيد الحياة
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 13, height: 13, borderRadius: "50%", background: T.card, border: `2px dashed ${TT.deceasedLine}` }} /> متوفى رحمه الله
        </span>
      </div>

      {/* نافذة الشجرة المصوّرة */}
      {pdfOpen && (
        <div style={{ position: "fixed", inset: 0, background: "#0d2b2b", zIndex: 70, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "linear-gradient(160deg, #123838, #0d2b2b)", borderBottom: "2px solid #c9a227" }}>
            <button onClick={handleDownloadPdf} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(244,239,227,0.12)", border: "none", borderRadius: 999, color: "#F4EFE3", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 12px" }}>
              تحميل
            </button>
            <span style={{ color: "#dab94a", fontSize: 13, fontWeight: 700 }}>الشجرة المصوّرة</span>
            <button onClick={() => setPdfOpen(false)} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(244,239,227,0.12)", border: "none", borderRadius: 999, color: "#F4EFE3", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 12px" }}>
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
                <a href="/Family-Tree.pdf" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "9px 18px", background: "#c9a227", color: "#0d2b2b", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
                  فتح ملف PDF مباشرة
                </a>
              </div>
            )}
            <canvas ref={canvasRef} style={{ display: pdfLoading || pdfError ? "none" : "block", margin: "0 auto" }} />
          </div>
        </div>
      )}

      {detailId && byId[detailId] && (
        <TreeMemberPopup member={byId[detailId]} onClose={() => setDetailId(null)} onOpenProfile={() => { const mm = byId[detailId]; setDetailId(null); setProfileMember(mm); }} onLocate={() => { const id = detailId; setDetailId(null); goToMember(id); }} />
      )}
      {profileMember && (
        <MemberDetailModal member={profileMember} members={members} canManageTree={canManageTree} onClose={() => setProfileMember(null)} onSaved={(updated) => { setMembers((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))); setProfileMember(null); }} />
      )}
      {whoOpen && (
        <WhoIsThisModal members={members} onClose={() => setWhoOpen(false)} onOpenMember={(m) => { setWhoOpen(false); setProfileMember(m); }} />
      )}
      {kinOpen && (
        <KinshipModal members={members} onClose={() => setKinOpen(false)} />
      )}
      {mapOpen && (
        <FamilyMapModal members={members} onClose={() => setMapOpen(false)} />
      )}
      {statsOpen && (
        <StatsModal members={members} onClose={() => setStatsOpen(false)} />
      )}
      {exportOpen && (
        <ExportModal members={members} onClose={() => setExportOpen(false)} />
      )}
      {gameOpen && (
        <RelationGameModal members={members} onClose={() => setGameOpen(false)} />
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
    // تحرير مستند الـPDF بالكامل من الذاكرة عند تحميل عدد جديد أو إغلاق العارض —
    // ضروري بوضع "التطبيق المستقل" بآيفون اللي يقتل الصفحة كلها لو الذاكرة امتلأت
    return () => { pdfDoc?.destroy?.(); };
  }, [pdfDoc]);

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    const safePage = Math.min(Math.max(pageNum, 1), pdfDoc.numPages);
    pdfDoc.getPage(safePage).then((page) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const viewport = page.getViewport({ scale: 1.6 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      const ctx = canvas.getContext("2d");
      page.render({ canvasContext: ctx, viewport });
    });
    return () => {
      cancelled = true;
      // تفريغ محتوى الكانفاس بين كل صفحة وأخرى (وعند الإغلاق) لتفادي تراكم الذاكرة
      const canvas = canvasRef.current;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    };
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
  const [imageFile, setImageFile] = useState(null);
  const [existingImageUrl, setExistingImageUrl] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadingImg, setUploadingImg] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const resetForm = () => {
    setForm({ title: "", date: "", location: "", description: "" });
    setImageFile(null); setExistingImageUrl(""); setLocationUrl(""); setVideoUrl("");
  };

  const submit = async () => {
    if (!form.title.trim() || !form.date) return;
    setUploadingImg(true);
    let imageUrl = existingImageUrl || null;
    if (imageFile) {
      const uploaded = await uploadEventImage(imageFile);
      if (uploaded) imageUrl = uploaded;
    }
    const payload = { ...form, image_url: imageUrl, location_url: locationUrl.trim() || null, video_url: videoUrl.trim() || null };
    if (editingId) {
      const updated = await updateEvent(editingId, payload);
      if (updated) {
        const old = events.find((e) => e.id === editingId);
        setEvents(events.map((e) => (e.id === editingId ? { ...updated, attendees: old.attendees } : e)));
      }
    } else {
      const created = await insertEvent(payload);
      if (created) setEvents([created, ...events]);
    }
    resetForm();
    setEditingId(null);
    setOpen(false);
    setUploadingImg(false);
  };

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setForm({ title: ev.title, date: ev.date, location: ev.location || "", description: ev.description || "" });
    setExistingImageUrl(ev.image_url || "");
    setImageFile(null);
    setLocationUrl(ev.location_url || "");
    setVideoUrl(ev.video_url || "");
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
        <IconButton onClick={() => { setOpen((v) => !v); setEditingId(null); resetForm(); }} active={open}>
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
          <textarea placeholder="تفاصيل مختصرة" rows={8} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, resize: "vertical", minHeight: 140, lineHeight: 1.7 }} />

          <input type="url" placeholder="رابط الموقع من خرائط جوجل (اختياري)" value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} style={inputStyle} />
          <input type="url" placeholder="رابط فيديو (يوتيوب مثلًا، اختياري)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} style={inputStyle} />

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text, cursor: "pointer" }}>
              <Upload size={14} color={T.gold} />
              {imageFile ? imageFile.name : existingImageUrl ? "استبدال الصورة الحالية" : "إضافة صورة (اختياري)"}
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} style={{ display: "none" }} />
            </label>
            {existingImageUrl && !imageFile && (
              <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}>
                <img src={existingImageUrl} alt="" style={{ maxWidth: 140, borderRadius: 10, display: "block" }} />
                <button onClick={() => setExistingImageUrl("")} style={{ position: "absolute", top: -6, left: -6, background: T.clay, color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 11, lineHeight: 1 }}>×</button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submit} disabled={uploadingImg} style={{ ...primaryBtnStyle, flex: 1 }}>
              {uploadingImg ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : editingId ? "حفظ التعديل" : "إضافة المناسبة"}
            </button>
            <button
              onClick={() => { setOpen(false); setEditingId(null); resetForm(); }}
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
            {ev.description && <div style={{ fontSize: 12.5, color: T.text, marginTop: 8, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ev.description}</div>}
            {ev.image_url && (
              <img src={ev.image_url} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10, marginTop: 10, display: "block" }} />
            )}
            {(ev.location_url || ev.video_url) && (
              <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                {ev.location_url && (
                  <a href={safeExternalUrl(ev.location_url) || undefined} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: T.gold, textDecoration: "none" }}>
                    <MapPin size={13} /> عرض الموقع على الخريطة
                  </a>
                )}
                {ev.video_url && (
                  <a href={safeExternalUrl(ev.video_url) || undefined} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: T.gold, textDecoration: "none" }}>
                    <Video size={13} /> مشاهدة الفيديو
                  </a>
                )}
              </div>
            )}
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
  const [showCard, setShowCard] = useState(false);

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
          <button onClick={() => setShowCard(true)} style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, background: T.sandDark, border: `1px solid ${T.gold}`, borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 700, color: T.ink, fontFamily: "inherit", cursor: "pointer" }}>
            <QrCode size={14} color={T.gold} /> بطاقة النسب
          </button>
          {showCard && <NasabCardModal member={member} onClose={() => setShowCard(false)} />}
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
              <a href={safeExternalUrl(member.cvUrl) || undefined} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "7px 14px", background: T.sandDark, border: `1px solid ${T.line}`, borderRadius: 999, color: T.ink, textDecoration: "none", fontSize: 11.5, fontWeight: 700 }}>
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

function AdminsTab({ members, setMembers, profilesMap, canManageTree, canManageAdmins, canManageRegistrations }) {
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
  const [actEmail, setActEmail] = useState("");
  const [actQuery, setActQuery] = useState("");
  const [actMember, setActMember] = useState(null);
  const [actBusy, setActBusy] = useState(false);
  const [actMsg, setActMsg] = useState("");
  const [actErr, setActErr] = useState("");

  const handleActivateAccount = async () => {
    setActErr(""); setActMsg("");
    if (!actEmail.trim()) { setActErr("أدخل بريد الحساب."); return; }
    if (!actMember) { setActErr("اختر العضو المراد ربطه."); return; }
    setActBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_activate_account", { p_email: actEmail.trim(), p_member_id: actMember.id });
      if (error) throw new Error(error.message || "تعذّر التفعيل.");
      setActMsg((data && data.message) || "تم تفعيل الحساب.");
      setActEmail(""); setActQuery(""); setActMember(null);
    } catch (e) {
      setActErr(e.message || "تعذّر التفعيل.");
    }
    setActBusy(false);
  };

  const normA = (s) => normalizeArabicLetters(s).split(/\s+/).filter((w) => w && w !== "بن").join(" ").trim();
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

  const [contactMessages, setContactMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const loadContactMessages = async () => {
    setLoadingMessages(true);
    const rows = await fetchContactMessages();
    setContactMessages(rows);
    setLoadingMessages(false);
  };
  useEffect(() => { if (canManageRegistrations) loadContactMessages(); }, [canManageRegistrations]);
  const handleMarkRead = async (id) => {
    await markContactMessageRead(id);
    setContactMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: "read" } : m)));
  };

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
      const normalizedPhone = normalizeSaudiPhone(phone.trim());
      const { data: rows, error: findErr } = await supabase.rpc("admin_find_member_by_phone", { p_phone: normalizedPhone });
      if (findErr) throw findErr;
      const member = Array.isArray(rows) ? rows[0] : rows;
      if (!member) { setBusy(false); return setError("ما فيه عضو بهذا الرقم بقائمة العائلة."); }
      if (!member.user_account_id) { setBusy(false); return setError("هذا العضو لسه ما سجّل حساب بالموقع، لازم يسجّل أول."); }
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

      {canManageRegistrations && (
        <>
      <SectionTitle>رسائل التواصل {contactMessages.filter((m) => m.status === "new").length > 0 && `(${contactMessages.filter((m) => m.status === "new").length} جديدة)`}</SectionTitle>
      {loadingMessages ? (
        <Loader2 size={18} style={{ animation: "rosette-spin 1s linear infinite" }} />
      ) : contactMessages.length === 0 ? (
        <EmptyState text="ما فيه رسائل تواصل حاليًا." />
      ) : (
        contactMessages.map((m) => (
          <div key={m.id} style={{ background: T.card, border: `1px solid ${m.status === "new" ? T.gold : T.line}`, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{m.members?.first_name || "عضو"}{(members.find((x) => x.id === m.sender_member_id)?.phone) ? ` — ${members.find((x) => x.id === m.sender_member_id).phone}` : ""}</span>
              {m.status === "new" && <span style={{ fontSize: 9.5, fontWeight: 700, color: T.gold, background: T.sandDark, borderRadius: 999, padding: "1px 8px" }}>جديدة</span>}
            </div>
            <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{m.message}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <span style={{ fontSize: 10, color: T.muted }}>{new Date(m.created_at).toLocaleDateString("ar-SA")}</span>
              {m.status === "new" && (
                <button onClick={() => handleMarkRead(m.id)} style={{ border: `1px solid ${T.line}`, background: "transparent", color: T.ink, borderRadius: 8, padding: "3px 10px", fontSize: 10.5, fontFamily: "inherit", cursor: "pointer" }}>
                  تمييز كمقروءة
                </button>
              )}
            </div>
          </div>
        ))
      )}
        </>
      )}

      {canManageTree && (
        <>
      <SectionTitle>إدارة الشجرة (بحث، تعديل، حذف)</SectionTitle>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={15} style={{ position: "absolute", right: 12, top: 11, color: T.muted }} />
        <input value={treeQuery} onChange={(e) => setTreeQuery(e.target.value)} placeholder="ابحث عن عضو لتعديله أو حذفه..." style={{ ...inputStyle, padding: "9px 38px 9px 12px" }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 10.5, color: T.muted, marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1b7a3d" }} /> وافق وبصمته محفوظة</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: "#E08A2E" }} /> وافق بلا بصمة</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: "#c0392b" }} /> لم يوافق</span>
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
                {m.gender !== "female" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, fontSize: 10, color: T.muted }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: faceState(m).color, flexShrink: 0 }} />
                    {faceState(m).label}{m.photoUrl ? " · له صورة" : " · بلا صورة"}
                  </div>
                )}
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

      {canManageRegistrations && (
        <>
      <SectionTitle>تفعيل حساب عضو (بدون رسائل)</SectionTitle>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.7 }}>يربط حساباً مسجّلاً (بالبريد) بملف عضو مباشرةً دون رمز تحقق — للتجارب قبل تفعيل الرسائل.</div>
        <input type="email" placeholder="بريد الحساب المسجّل" value={actEmail} onChange={(e) => setActEmail(e.target.value)} style={inputStyle} />
        {actMember ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, background: T.sandDark, borderRadius: 10, padding: "8px 12px" }}>
            <span style={{ fontSize: 12.5, color: T.ink, fontWeight: 700, wordBreak: "break-word" }}>{actMember.nasab || actMember.name}</span>
            <button onClick={() => { setActMember(null); setActQuery(""); }} style={{ background: "none", border: "none", color: T.clay, cursor: "pointer", flexShrink: 0 }}><X size={16} /></button>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <input placeholder="ابحث عن العضو بالاسم..." value={actQuery} onChange={(e) => setActQuery(e.target.value)} style={inputStyle} />
            {actQuery.trim().length >= 2 && (
              <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, marginTop: 6, maxHeight: 220, overflow: "auto", background: T.card }}>
                {members.filter((m) => normA(m.nasab || m.name).includes(normA(actQuery))).slice(0, 8).map((m) => (
                  <div key={m.id} onClick={() => setActMember(m)} style={{ padding: "8px 12px", borderBottom: `1px solid ${T.line}`, cursor: "pointer", fontSize: 12.5, color: T.text }}>
                    {m.nasab || m.name}{m.memberNumber ? ` ‹${m.memberNumber}›` : ""}
                  </div>
                ))}
                {members.filter((m) => normA(m.nasab || m.name).includes(normA(actQuery))).length === 0 && (
                  <div style={{ padding: 10, fontSize: 12, color: T.muted, textAlign: "center" }}>لا نتائج.</div>
                )}
              </div>
            )}
          </div>
        )}
        <button onClick={handleActivateAccount} disabled={actBusy} style={{ ...primaryBtnStyle, marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          {actBusy ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : <Check size={14} />} تفعيل الحساب
        </button>
        {actErr && <div style={{ color: T.clay, fontSize: 12, marginTop: 8 }}>{actErr}</div>}
        {actMsg && <div style={{ color: "#3A7D5C", fontSize: 12, marginTop: 8 }}>{actMsg}</div>}
      </div>
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

// ⚠️ عدّل الرقم والبريد هنا لما يجهزان عندك — هذي قيم مؤقتة للعرض بس
const CONTACT_WHATSAPP = "+966555466973";
const CONTACT_EMAIL = "oalturki@gmail.com";

function ContactUsView({ onBack, meId }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const handleSend = async () => {
    setErr("");
    if (!message.trim()) return setErr("اكتب رسالتك أول.");
    setSending(true);
    const ok = await sendContactMessage(meId, message.trim());
    if (ok) { setSent(true); setMessage(""); } else setErr("تعذّر إرسال الرسالة، حاول مرة أخرى.");
    setSending(false);
  };

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.gold, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
        <ChevronsRight size={16} /> رجوع
      </button>
      <SectionTitle>تواصل معنا</SectionTitle>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <a
          href={`https://wa.me/${CONTACT_WHATSAPP.replace(/[^0-9]/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textDecoration: "none", background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 8px" }}
        >
          <Phone size={18} color={T.gold} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>واتساب الإشراف</span>
        </a>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textDecoration: "none", background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 8px" }}
        >
          <Link2 size={18} color={T.gold} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>البريد الإلكتروني</span>
        </a>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, marginBottom: 8 }}>أو أرسل رسالة مباشرة للإشراف من هنا</div>
        {sent ? (
          <div style={{ color: "#2F7D4F", fontSize: 12.5, fontWeight: 700, textAlign: "center", padding: "10px 0" }}>
            وصلت رسالتك، بيتواصلون معك قريبًا إن شاء الله.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="اكتب رسالتك أو استفسارك هنا..." rows={5} style={{ ...inputStyle, resize: "vertical", minHeight: 110, lineHeight: 1.7 }} />
            {err && <div style={{ color: T.clay, fontSize: 11.5, fontWeight: 700 }}>{err}</div>}
            <button onClick={handleSend} disabled={sending} style={primaryBtnStyle}>
              {sending ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : "إرسال"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileTab({ members, setMembers, profilesMap, setProfilesMap, meId }) {
  const me = members.find((m) => m.id === meId);
  const [profileView, setProfileView] = useState("menu"); // menu | info | settings
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
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [openFaq, setOpenFaq] = useState(null); // نُقل هنا لأعلى المكوّن (منع مخالفة قواعد الـHooks)
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const [faceStatus, setFaceStatus] = useState("");

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) { setPhotoErr("اختر ملف صورة."); return; }
    if (file.size > 5 * 1024 * 1024) { setPhotoErr("حجم الصورة كبير — الحد ٥ ميغابايت."); return; }
    setPhotoErr(""); setFaceStatus(""); setPhotoUploading(true);
    const url = await uploadMemberPhoto(file);
    if (url) {
      setForm((f) => ({ ...f, photoUrl: url }));
      // تجهيز بصمة الوجه للتعرّف — أفضل جهد، لا يمنع نجاح الرفع
      try {
        setFaceStatus("جارِ تجهيز التعرّف على الوجه...");
        const desc = await fileToFaceDescriptor(file);
        if (desc) { setForm((f) => ({ ...f, faceDescriptor: desc })); setFaceStatus("تم تجهيز التعرّف على وجهك ✓"); }
        else { setForm((f) => ({ ...f, faceDescriptor: null })); setFaceStatus("لم يُكتشف وجه واضح — ستظهر صورتك لكن قد لا تُستخدم للتعرّف. جرّب صورة أوضح."); }
      } catch (e) { setForm((f) => ({ ...f, faceDescriptor: null })); setFaceStatus("تعذّر تجهيز التعرّف الآن: " + ((e && e.message) || "خطأ") + " — صورتك حُفظت، جرّب «إعادة المحاولة» بعد الحفظ."); }
    } else setPhotoErr("تعذّر رفع الصورة، حاول مجدداً.");
    setPhotoUploading(false);
  };

  // إعادة حساب البصمة من الصورة المحفوظة (يُظهر سبب الفشل الحقيقي)
  const handleReEnroll = async () => {
    if (!form.photoUrl) { setFaceStatus("لا توجد صورة."); return; }
    if (!form.faceConsent) { setFaceStatus("فعّل الموافقة أولاً."); return; }
    setPhotoErr(""); setPhotoUploading(true); setFaceStatus("جارِ إعادة تجهيز التعرّف...");
    try {
      const desc = await urlToFaceDescriptor(form.photoUrl);
      if (!desc) { setFaceStatus("لم يُكتشف وجه واضح في الصورة — جرّب صورة أوضح للوجه."); setPhotoUploading(false); return; }
      const { error } = await supabase.rpc("save_my_face_embedding", { p_embedding: descriptorToVector(desc) });
      if (error) { setFaceStatus("تعذّر حفظ البصمة: " + (error.message || "خطأ")); setPhotoUploading(false); return; }
      setForm((f) => ({ ...f, faceEnrolled: true, faceDescriptor: desc }));
      setFaceStatus("تم حفظ بصمة وجهك ✓");
    } catch (e) {
      setFaceStatus("تعذّر: " + ((e && e.message) || "خطأ غير معروف"));
    }
    setPhotoUploading(false);
  };

  const handleChangePassword = async () => {
    setPwError(""); setPwSuccess("");
    if (!currentPassword.trim()) return setPwError("أدخل كلمة المرور الحالية للتأكد إنها فعلاً حسابك.");
    if (!newPassword.trim() || !newPassword2.trim()) return setPwError("عبّي حقلي كلمة المرور الجديدة.");
    if (newPassword.length < 6) return setPwError("كلمة المرور الجديدة لازم تكون 6 أحرف على الأقل.");
    if (newPassword !== newPassword2) return setPwError("كلمتا المرور الجديدتان غير متطابقتين.");
    setSavingPw(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("تعذّر التحقق من الحساب، حاول تسجيل الدخول من جديد.");
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (verifyErr) throw new Error("كلمة المرور الحالية غير صحيحة.");
      await updatePassword(newPassword);
      setPwSuccess("تم تغيير كلمة المرور بنجاح.");
      setCurrentPassword(""); setNewPassword(""); setNewPassword2("");
      setTimeout(() => { setShowChangePassword(false); setPwSuccess(""); }, 1500);
    } catch (e) {
      setPwError(e.message || "تعذّر تغيير كلمة المرور.");
    }
    setSavingPw(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const [faceIdMsg, setFaceIdMsg] = useState("");
  const [enablingFaceId, setEnablingFaceId] = useState(false);
  const handleEnableFaceId = async () => {
    setFaceIdMsg("");
    setEnablingFaceId(true);
    try {
      await registerPasskey();
      setFaceIdMsg("تم تفعيل الدخول السريع بالبصمة على هذا الجهاز.");
    } catch (e) {
      setFaceIdMsg("تعذّر التفعيل على هذا الجهاز. جرّب من إعدادات جهازك إن كانت البصمة مفعّلة أصلًا.");
    }
    setEnablingFaceId(false);
  };

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
    // مزامنة بصمة الوجه: حفظ عند وجود موافقة+صورة+بصمة جديدة، وحذف عند سحب الموافقة أو إزالة الصورة
    let enrolled = form.faceEnrolled;
    try {
      if (!form.faceConsent || !form.photoUrl) {
        await supabase.from("face_embeddings").delete().eq("member_id", form.id);
        enrolled = false;
      } else if (form.faceDescriptor) {
        const { error: eErr } = await supabase.rpc("save_my_face_embedding", { p_embedding: descriptorToVector(form.faceDescriptor) });
        if (eErr) console.error("face embedding save failed", eErr);
        enrolled = !eErr;
      }
    } catch (e) { console.error("face embedding sync failed", e); }
    form.faceEnrolled = enrolled;
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

  const MenuRow = ({ icon: Icon, label, sublabel, onClick, disabled, danger }) => (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none",
        padding: "13px 2px", cursor: disabled ? "default" : "pointer", fontFamily: "inherit", textAlign: "right",
        borderBottom: `1px solid ${T.line}`, opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: danger ? "#FBEAEA" : T.sandDark, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={15} color={danger ? T.clay : T.gold} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: danger ? T.clay : T.text }}>{label}</div>
        {sublabel && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{sublabel}</div>}
      </div>
      {!disabled && !danger && <ChevronLeft size={15} color={T.muted} />}
      {disabled && <span style={{ fontSize: 10, color: T.muted, background: T.sand, border: `1px solid ${T.line}`, borderRadius: 999, padding: "2px 8px" }}>قريبًا</span>}
    </button>
  );

  if (!form) return <EmptyState text="جارِ تحميل ملفك الشخصي..." />;

  if (profileView === "menu") {
    return (
      <div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "10px 0 20px" }}>
          <Avatar name={form.name} photoUrl={form.photoUrl} gender={form.gender} size={76} />
          <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginTop: 10 }}>{form.name}</div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{form.nasab}</div>
          {form.memberNumber && (
            <div style={{ fontSize: 10.5, color: T.gold, fontWeight: 700, marginTop: 5, background: T.sandDark, borderRadius: 999, padding: "2px 10px" }}>
              رقم العضوية: {form.memberNumber}
            </div>
          )}
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "2px 14px", marginBottom: 14 }}>
          <MenuRow icon={UserCircle2} label="ملفي" sublabel="المعلومات الشخصية، السيرة، الأبناء والبنات" onClick={() => setProfileView("info")} />
          <MenuRow icon={Settings} label="الإعدادات" sublabel="الخصوصية، الإشعارات، وأكثر" onClick={() => setProfileView("settings")} />
          <MenuRow icon={Fingerprint} label="بصمة الوجه / الإصبع" sublabel={faceIdMsg || "دخول سريع بدون كلمة مرور"} onClick={handleEnableFaceId} />
          <MenuRow icon={KeyRound} label="رمز المرور السريع" disabled />
          <MenuRow icon={Lock} label="تغيير كلمة المرور والبريد" onClick={() => { setProfileView("info"); setShowChangePassword(true); }} />
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "2px 14px", marginBottom: 14 }}>
          <MenuRow icon={FileText} label="دليل المستخدم" disabled />
          <MenuRow icon={HelpCircle} label="الأسئلة الشائعة" onClick={() => setProfileView("faq")} />
          <MenuRow icon={Shield} label="سياسة الخصوصية" onClick={() => setProfileView("privacy-policy")} />
          <MenuRow icon={MessageCircle} label="تواصل معنا" onClick={() => setProfileView("contact")} />
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "2px 14px" }}>
          <button
            onClick={() => setConfirmLogout(true)}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none", padding: "13px 2px", cursor: "pointer", fontFamily: "inherit", textAlign: "right" }}
          >
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#FBEAEA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <LogOut size={15} color={T.clay} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.clay }}>تسجيل الخروج</span>
          </button>
        </div>

        {confirmLogout && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(23,54,52,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={() => setConfirmLogout(false)}>
            <div style={{ background: T.card, borderRadius: 16, padding: 20, width: "100%", maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 13, color: T.text, marginBottom: 16, textAlign: "center" }}>تأكيد تسجيل الخروج من حسابك؟</div>
              <button onClick={handleLogout} style={{ width: "100%", background: T.clay, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                تسجيل الخروج
              </button>
              <button onClick={() => setConfirmLogout(false)} style={{ width: "100%", background: "transparent", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
                تراجع
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (profileView === "settings") {
    return (
      <div>
        <button onClick={() => setProfileView("menu")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.gold, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
          <ChevronsRight size={16} /> رجوع
        </button>
        <SectionTitle>الإعدادات</SectionTitle>
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "2px 14px" }}>
          <MenuRow icon={Lock} label="الخصوصية" sublabel="التحكم فيما يظهر من بياناتك للعائلة" onClick={() => { setProfileView("info"); setMode("edit"); }} />
          <MenuRow icon={Settings} label="حجم الخط" disabled />
          <MenuRow icon={MessageCircle} label="الرسائل الجماعية" disabled />
          <MenuRow icon={HelpCircle} label="الإشعارات" disabled />
        </div>
      </div>
    );
  }

  if (profileView === "faq") {
    const FAQ_ITEMS = [
      { q: "كيف أسجّل حساب جديد؟", a: "إذا كان رقم جوالك مسجّلاً بقائمة العائلة، اختر \"تسجيل عضو جديد\" وأدخل جوالك وبريدك وكلمة مرور. أما البنات والزوجات المُضافات بدون رقم جوال، فيستخدمن رابط \"أُضفتِ بدون رقم جوال؟\" من نفس شاشة الدخول." },
      { q: "نسيت كلمة المرور، وش أسوي؟", a: "من شاشة الدخول اضغط \"نسيت كلمة المرور؟\"، ويوصلك رابط استعادة على بريدك المؤكّد." },
      { q: "كيف أضيف بناتي أو زوجتي؟", a: "من تبويب \"ملفي\" ← \"ملفي\"، فيه قسمان مستقلان للبنات والزوجة (أو الزوجات)، تضيف الاسم والبريد وتُرسل لها دعوة تفعيل تلقائيًا." },
      { q: "ليش ما تظهر البنات برسم الشجرة؟", a: "البنات عضوات كاملات بالتطبيق، لكن لا يظهرن بالرسم المرئي للشجرة حفاظًا على شكل اللوحة التقليدية. يظهرن ضمن ملف الأب أو الزوج." },
      { q: "كيف أسجّل مولودًا جديدًا؟", a: "من ملفك الشخصي، قسم \"تسجيل مولود جديد\" — يمر الطلب على اعتماد المشرف قبل ما يدخل الشجرة رسميًا." },
      { q: "مين يشوف رقم جوالي أو بريدي؟", a: "أنت المتحكم الوحيد. من \"ملفي\" ← تعديل، كل من الجوال والبريد له مفتاح خصوصية مستقل (ظاهر للعائلة / مخفي)." },
      { q: "كيف أثبّت الموقع كتطبيق كامل الشاشة؟", a: "بآيفون: من Safari تحديدًا (مو كروم) اضغط زر المشاركة ← \"إضافة إلى الشاشة الرئيسية\"." },
      { q: "كيف أبحث بمجلة الصلة؟", a: "من تبويب \"المجلة\" ← \"الفهرس\"، ابحث بعنوان الموضوع أو اسم الكاتب، ويفتح لك المقالة مباشرة عند صفحتها الصحيحة." },
    ];
    return (
      <div>
        <button onClick={() => setProfileView("menu")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.gold, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
          <ChevronsRight size={16} /> رجوع
        </button>
        <SectionTitle>الأسئلة الشائعة</SectionTitle>
        <div style={{ display: "grid", gap: 8 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "right" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{item.q}</span>
                <ChevronDown size={15} color={T.muted} style={{ transform: openFaq === i ? "rotate(180deg)" : "none", flexShrink: 0, marginRight: 8 }} />
              </button>
              {openFaq === i && <div style={{ fontSize: 12, color: T.text, lineHeight: 1.8, marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.line}` }}>{item.a}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (profileView === "privacy-policy") {
    return (
      <div>
        <button onClick={() => setProfileView("menu")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.gold, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
          <ChevronsRight size={16} /> رجوع
        </button>
        <SectionTitle>سياسة الخصوصية</SectionTitle>
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 16, fontSize: 12.5, color: T.text, lineHeight: 1.9, display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 4 }}>البيانات اللي نجمعها</div>
            الاسم، صلة النسب، الجوال والبريد الإلكتروني، تاريخ ومكان الميلاد (اختياري)، الصورة الشخصية والسيرة الذاتية (اختياري). كل هذي البيانات يُدخلها العضو بنفسه أو والده/زوجها عند الإضافة.
          </div>
          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 4 }}>كيف تُستخدم</div>
            حصرًا لعرض شجرة النسب، وتسهيل التواصل بين أفراد العائلة، وإرسال إشعارات تخص الموقع (ترحيب، تهنئة مولود، تنبيهات إدارية). ما تُستخدم لأي غرض تجاري أو إعلاني.
          </div>
          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 4 }}>لا نبيع بياناتك</div>
            الموقع خاص بعائلة آل تركي حصرًا، مغلق عن العموم. ما نبيع بياناتك ولا نشاركها مع أي طرف ثالث أو جهة تسويقية أو "شركة شريكة" تحت أي مسمّى — هذي بياناتكم، تبقى بينكم.
          </div>
          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 4 }}>من يشوف بياناتك</div>
            الجوال والبريد مخفيان افتراضيًا عن باقي العائلة، وأنت المتحكم الوحيد بإظهارهما من "ملفي" ← تعديل. باقي بيانات الشجرة (الاسم والنسب) ظاهرة لكل أعضاء العائلة المسجّلين فقط، وليست عامة على الإنترنت.
          </div>
          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 4 }}>التخزين والأمان</div>
            تُخزَّن البيانات بقاعدة بيانات مشفّرة (Supabase)، بصلاحيات وصول دقيقة على مستوى كل سجل، تمنع أي عضو من الوصول لبيانات غير مصرّح له بها.
          </div>
          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 4 }}>حقوقك</div>
            تقدر تشوف وتعدّل أو تصحّح أو تحذف بياناتك (أو بيانات بناتك/زوجتك اللي أضفتها) بأي وقت من ملفك الشخصي، أو تتواصل مع الإشراف لأي استفسار أو طلب حذف كامل.
          </div>
          <div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 4 }}>تحديثات هذي السياسة</div>
            لو تغيّرت هذي السياسة بشكل جوهري، بيتم إشعاركم من تبويب "الأخبار" بالموقع.
          </div>
        </div>
      </div>
    );
  }

  if (profileView === "contact") {
    return <ContactUsView onBack={() => setProfileView("menu")} meId={meId} />;
  }

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
      <button onClick={() => setProfileView("menu")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.gold, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 4 }}>
        <ChevronsRight size={16} /> رجوع
      </button>
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
        <span style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
          <Avatar name={form.name} photoUrl={form.photoUrl} gender={form.gender} size={56} />
          <FaceBadge member={form} />
        </span>
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
            <a href={safeExternalUrl(form.cvUrl) || undefined} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "7px 14px", background: T.sandDark, border: `1px solid ${T.line}`, borderRadius: 999, color: T.ink, textDecoration: "none", fontSize: 11.5, fontWeight: 700 }}>
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
            {form.gender !== "female" && (
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: T.text, lineHeight: 1.7, cursor: "pointer", background: T.sand, border: `1px solid ${form.faceConsent ? T.gold : T.line}`, borderRadius: 10, padding: "10px 12px" }}>
                  <input type="checkbox" checked={!!form.faceConsent} onChange={(e) => setForm({ ...form, faceConsent: e.target.checked, faceConsentAt: e.target.checked ? (form.faceConsentAt || new Date().toISOString()) : null })} style={{ marginTop: 3, flexShrink: 0 }} />
                  <span>أوافق على استخدام صورتي داخل تطبيق العائلة: لعرضها في الشجرة وملفي، وللتعرّف الآلي على الوجه (مقارنةً بصور أفراد العائلة فقط) بهدف معرفة الأسماء في اللقاءات. لا تُشارك صوري أو بياناتي خارج التطبيق، ويمكنني سحب الموافقة وإزالة صورتي في أي وقت.</span>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
                    <Avatar name={form.name} photoUrl={form.photoUrl} gender={form.gender} size={54} />
                    <FaceBadge member={form} />
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.sandDark, border: `1px solid ${T.line}`, borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, color: T.ink, cursor: (photoUploading || !form.faceConsent) ? "not-allowed" : "pointer", opacity: (photoUploading || !form.faceConsent) ? 0.55 : 1 }}>
                      {photoUploading ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : <Upload size={14} />}
                      {photoUploading ? "جارِ الرفع..." : (form.photoUrl ? "تغيير الصورة" : "اختر صورة من جهازك")}
                      <input type="file" accept="image/*" disabled={photoUploading || !form.faceConsent} onChange={(e) => { handlePhotoUpload(e.target.files && e.target.files[0]); e.target.value = ""; }} style={{ display: "none" }} />
                    </label>
                    {!form.faceConsent && <span style={{ fontSize: 11, color: T.muted }}>فعّل الموافقة أعلاه لتتمكن من رفع صورتك.</span>}
                    {form.photoUrl && form.faceConsent && !form.faceEnrolled && !photoUploading && (
                      <button type="button" onClick={handleReEnroll} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#c0392b", border: "none", color: "#fff", fontSize: 11.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", borderRadius: 8, padding: "5px 10px", alignSelf: "flex-start" }}>
                        <Camera size={13} /> حفظ بصمة الوجه الآن
                      </button>
                    )}
                    {form.photoUrl && !photoUploading && (
                      <button type="button" onClick={() => setForm({ ...form, photoUrl: "" })} style={{ background: "none", border: "none", color: T.clay, fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", textAlign: "right", padding: 0 }}>إزالة الصورة</button>
                    )}
                    {photoErr && <span style={{ fontSize: 11, color: T.clay }}>{photoErr}</span>}
                    {faceStatus && <span style={{ fontSize: 11, color: faceStatus.includes("✓") ? "#1b7a3d" : T.muted }}>{faceStatus}</span>}
                  </div>
                </div>
              </div>
            )}
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

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${T.line}` }}>
        <SectionTitle>الحساب</SectionTitle>
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 8 }}>
          <button
            onClick={() => setShowChangePassword((v) => !v)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", padding: "6px 2px", cursor: "pointer", fontFamily: "inherit" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text, fontWeight: 700 }}>
              <KeyRound size={16} color={T.gold} /> تغيير كلمة المرور
            </span>
            <ChevronDown size={15} color={T.muted} style={{ transform: showChangePassword ? "rotate(180deg)" : "none" }} />
          </button>
          {showChangePassword && (
            <div style={{ display: "grid", gap: 6, paddingTop: 6, borderTop: `1px dashed ${T.line}` }}>
              <input type="password" placeholder="كلمة المرور الحالية" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={inputStyle} />
              <input type="password" placeholder="كلمة المرور الجديدة (6 أحرف فأكثر)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
              <input type="password" placeholder="تأكيد كلمة المرور الجديدة" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} style={inputStyle} />
              {pwError && <div style={{ color: T.clay, fontSize: 11.5, fontWeight: 700 }}>{pwError}</div>}
              {pwSuccess && <div style={{ color: "#2F7D4F", fontSize: 11.5, fontWeight: 700 }}>{pwSuccess}</div>}
              <button onClick={handleChangePassword} disabled={savingPw} style={primaryBtnStyle}>
                {savingPw ? <Loader2 size={14} style={{ animation: "rosette-spin 1s linear infinite" }} /> : "حفظ كلمة المرور الجديدة"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const BASE_TABS = [
  { key: "news", label: "الرئيسية", icon: Newspaper },
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
  const [canManageRegistrations, setCanManageRegistrations] = useState(false);
  const [magazineUploading, setMagazineUploading] = useState(false);
  const [magazineUploadMsg, setMagazineUploadMsg] = useState("");

  useEffect(() => {
    (async () => {
      const [rawMembers, profiles, contacts, n, e, treePerm, adminsPerm, newsPerm, eventsPerm, docsPerm, regPerm] = await Promise.all([
        fetchMembers(), fetchMemberProfiles(), fetchMemberContacts(), fetchNews(), fetchEvents(),
        checkPermission("manage_tree_profiles"), checkPermission("manage_admins"),
        checkPermission("manage_news"), checkPermission("manage_events"),
        checkPermission("manage_documents"), checkPermission("manage_registrations"),
      ]);
      // دمج الجوال/البريد المسموح بهما (من RPC الآمنة) مع بيانات الأعضاء قبل الإثراء
      const mergedMembers = rawMembers.map((m) => {
        const c = contacts[m.id];
        return c ? { ...m, phone: c.phone, prefilledEmail: c.email, hasPhone: c.hasPhone } : m;
      });
      setProfilesMap(profiles);
      setMembers(enrichMembers(mergedMembers, profiles));
      setNews(n);
      setEvents(e);
      setCanManageTree(treePerm);
      setCanManageAdmins(adminsPerm);
      setCanManageNews(newsPerm);
      setCanManageEvents(eventsPerm);
      setCanManageDocuments(docsPerm);
      setCanManageRegistrations(regPerm);
      setLoading(false);
    })();
  }, []);

  const me = members.find((m) => m.id === meId);
  const TABS = (canManageAdmins || canManageTree || canManageRegistrations) ? [...BASE_TABS, ADMINS_TAB] : BASE_TABS;

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
              {tab === "news" && <NewsTab news={news} setNews={setNews} canManageNews={canManageNews} events={events} membersCount={members.filter((m) => m.gender !== "female").length} onNavigate={setTab} />}
              {tab === "tree" && <TreeTab members={members} setMembers={setMembers} profilesMap={profilesMap} canManageTree={canManageTree} />}
              {tab === "magazine" && <MagazineTab canManageDocuments={canManageDocuments} onUploadingChange={setMagazineUploading} onUploadResult={setMagazineUploadMsg} />}
              {tab === "events" && <EventsTab events={events} setEvents={setEvents} meId={meId} canManageEvents={canManageEvents} />}
              {tab === "profile" && <ProfileTab members={members} setMembers={setMembers} profilesMap={profilesMap} setProfilesMap={setProfilesMap} meId={meId} />}
              {tab === "admins" && (canManageAdmins || canManageTree || canManageRegistrations) && <AdminsTab members={members} setMembers={setMembers} profilesMap={profilesMap} canManageTree={canManageTree} canManageAdmins={canManageAdmins} canManageRegistrations={canManageRegistrations} />}
            </>
          )}
        </div>
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: T.ink, borderTop: `2px solid ${TT.gold500}`, display: "flex", alignItems: "stretch", padding: "0 0 4px", overflow: "visible" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                position: "relative", flex: 1, cursor: "pointer", fontFamily: "inherit",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
                background: active ? T.sand : "transparent",
                border: "none",
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderBottomLeftRadius: active ? 16 : 0,
                borderBottomRightRadius: active ? 16 : 0,
                marginTop: active ? -2 : 0,
                paddingTop: active ? 10 : 8,
                paddingBottom: active ? 8 : 4,
              }}>
                <Icon size={19} color={active ? T.ink : T.goldLight} strokeWidth={active ? 2.4 : 2} />
                <span style={{ fontSize: 9.5, fontWeight: active ? 800 : 600, color: active ? T.ink : "#e7dfc9", marginTop: 3 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, background: T.sand, fontFamily: "'Tajawal', sans-serif", textAlign: "center" }}>
          <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 22, color: T.ink, fontWeight: 700 }}>عائلة آل تركي</div>
          <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.8, maxWidth: 320 }}>
            صار خطأ غير متوقع بالتطبيق. بياناتك محفوظة بأمان — اضغط الزر تحت لإعادة التحميل.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ background: T.ink, color: T.sand, border: "none", borderRadius: 10, padding: "11px 28px", fontSize: 14, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function FamilyApp() {
  return (
    <AppErrorBoundary>
      <AuthGate>{(me) => <FamilyAppInner meId={me.id} />}</AuthGate>
    </AppErrorBoundary>
  );
}


