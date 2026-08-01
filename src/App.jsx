import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Newspaper, GitBranch, CalendarDays, Users, UserCircle2,
  Search, Plus, X, MapPin, Briefcase,
  Link2, ChevronDown, ChevronUp, Check,
  Baby, HeartHandshake, Megaphone, Cross, Loader2,
  FileText, Phone, Cake, Shield, UserPlus, Trash2, Save, Pencil
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
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${T.goldLight}` }}
    />
  );
}

function mapMemberRow(row) {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    name: row.first_name,
    fatherId: row.father_id,
    gender: row.gender,
    isAlive: row.is_alive !== false,
    birthDate: row.birth_date || "",
    birthDatePrecision: row.birth_date_precision || "day",
    deathDate: row.death_date || "",
    deathDatePrecision: row.death_date_precision || "day",
    region: row.region || "",
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
    .select("id, legacy_id, first_name, father_id, gender, is_alive, birth_date, birth_date_precision, death_date, death_date_precision, region, occupation, bio, photo_url, phone, user_account_id")
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchMembers failed", error); return []; }
  return data.map(mapMemberRow);
}

async function fetchMemberProfiles() {
  const { data, error } = await supabase.from("member_profiles").select("member_id, social_links, visibility");
  if (error) { console.error("fetchMemberProfiles failed", error); return {}; }
  const map = {};
  data.forEach((row) => {
    map[row.member_id] = { socialLinks: row.social_links || {}, visibility: row.visibility || {} };
  });
  return map;
}

async function insertMember(form) {
  const { data, error } = await supabase
    .from("members")
    .insert({ first_name: form.name, father_id: form.fatherId || null, gender: form.gender, region: form.region || null, phone: form.phone || null })
    .select()
    .single();
  if (error) { console.error("insertMember failed", error); return null; }
  return mapMemberRow(data);
}

async function updateMemberCore(id, patch) {
  const { error } = await supabase
    .from("members")
    .update({ occupation: patch.job, bio: patch.bio, region: patch.region, photo_url: patch.photoUrl })
    .eq("id", id);
  if (error) console.error("updateMemberCore failed", error);
}

async function updateMemberDeathStatus(id, isAlive, deathDate) {
  const { error } = await supabase
    .from("members")
    .update({ is_alive: isAlive, death_date: isAlive ? null : (deathDate || null) })
    .eq("id", id);
  if (error) throw error;
}

async function upsertMemberProfile(memberId, { socialLinks, extendedVisible }) {
  const vis = extendedVisible ? "public" : "private";
  const { error } = await supabase.from("member_profiles").upsert({
    member_id: memberId,
    social_links: socialLinks || {},
    visibility: { bio: vis, photo_url: vis, occupation: vis, social_links: vis },
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
      extendedVisible: profile ? profile.visibility?.bio === "public" : false,
    };
  });
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

function Avatar({ name, photoUrl, size = 44 }) {
  if (photoUrl) {
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

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: `1px solid ${T.line}`, fontFamily: "inherit", fontSize: 13.5, background: T.sand, color: T.text };
const primaryBtnStyle = { background: T.ink, color: T.sand, border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" };

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

// نظام ألوان الشجرة الموثقة (Tree.html) — يطبَّق هنا على البيانات الحية
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

function TreeTab({ members }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const canvasRef = useRef(null);

  // تحميل مكتبة PDF.js من CDN مرة واحدة فقط، ورسم الصفحة الأولى داخل canvas
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

    ensurePdfJs()
      .then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        return pdfjsLib.getDocument("/Family-Tree.pdf").promise;
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
      })
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
      if (m.fatherId) {
        childrenMap[m.fatherId] = childrenMap[m.fatherId] || [];
        childrenMap[m.fatherId].push(m.id);
      }
    });
    const root = members.find((m) => !m.fatherId);
    return { byId, childrenMap, rootId: root ? root.id : null };
  }, [members]);

  // بالبداية: الجذر مفتوح فقط
  useEffect(() => {
    if (rootId) setExpanded(new Set([rootId]));
  }, [rootId]);

  // البحث: يفتح تلقائيًا مسار الأجداد لأول عضو مطابق
  useEffect(() => {
    if (!query.trim() || !rootId) return;
    const match = members.find((m) => m.name.includes(query.trim()) || m.nasab?.includes(query.trim()));
    if (!match) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let cur = match;
      while (cur) {
        next.add(cur.id);
        cur = cur.fatherId ? byId[cur.fatherId] : null;
      }
      return next;
    });
    setSelectedNode(match.id);
  }, [query]);

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
      <SectionTitle>شجرة العائلة</SectionTitle>
      <div style={{ background: "linear-gradient(160deg, #123838, #0d2b2b)", border: "1px solid #c9a227", borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <FileText size={16} color="#dab94a" />
          <span style={{ color: "#F4EFE3", fontSize: 13.5, fontWeight: 700 }}>الشجرة المصورة (الطبعة الثالثة، ١٤٤٧هـ)</span>
        </div>
        <button
          onClick={() => setPdfOpen(true)}
          style={{
            width: "100%",
            padding: "9px 0",
            background: "#c9a227",
            color: "#0d2b2b",
            border: "none",
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 12.5,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          عرض
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
                تعذّر عرض الشجرة. حاول التحميل بدل العرض.
              </div>
            )}
            <canvas ref={canvasRef} style={{ display: pdfLoading || pdfError ? "none" : "block", margin: "0 auto" }} />
          </div>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} style={{ position: "absolute", right: 12, top: 11, color: T.muted }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن فرد بالاسم..." style={{ ...inputStyle, padding: "9px 38px 9px 12px" }} />
      </div>

      {/* شريط زخرفي أعلى الشجرة */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10, opacity: 0.8 }}>
        {[0, 1, 2, 3, 4].map((i) => <Rosette key={i} size={18} color={T.gold} />)}
      </div>

      {!rootId ? (
        <EmptyState text="تعذّر تحديد جذر الشجرة." />
      ) : (
        <div style={{ overflow: "auto", border: `1.5px solid ${TT.gold500}`, borderRadius: 14, background: TT.sand100, padding: 16 }}>
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

function MemberDetailModal({ member, canManageTree, onClose, onSaved }) {
  const [isAlive, setIsAlive] = useState(member.isAlive);
  const [deathDate, setDeathDate] = useState(member.deathDate || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
            <Avatar name={member.name} photoUrl={member.photoUrl} size={84} />
          </div>
          <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 19, color: T.ink, fontWeight: 700, marginTop: 10 }}>
            {member.fullNasab || member.name}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: T.text }}>
          {member.region && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><MapPin size={15} color={T.gold} /> {member.region}</div>}
          {member.birthDate && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Cake size={15} color={T.gold} /> {formatDate(member.birthDate, member.birthDatePrecision)}</div>}
          {member.isAlive && member.phone && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Phone size={15} color={T.gold} /> {member.phone}</div>}
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
                {Object.entries(member.socialLinks).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11.5, color: T.gold, display: "flex", alignItems: "center", gap: 3 }}><Link2 size={11} /> {v}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${T.line}`, fontSize: 12, color: T.muted, textAlign: "center" }}>
            الملف الموسّع (السيرة والتواصل) مخفي — العضو لم يفعّل عرضه للعائلة.
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

function FatherPicker({ members, fatherId, onSelect }) {
  const [q, setQ] = useState("");
  const father = members.find((m) => m.id === fatherId);
  const matches = q.trim().length >= 2 ? members.filter((m) => m.name.includes(q)).slice(0, 6) : [];
  return (
    <div>
      {father ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...inputStyle }}>
          <span>الأب: {father.name} ({father.nasab})</span>
          <button onClick={() => onSelect(null)} style={{ border: "none", background: "none", cursor: "pointer", color: T.clay }}><X size={14} /></button>
        </div>
      ) : (
        <>
          <input placeholder="ابحث عن اسم الأب لربط العضو الجديد..." value={q} onChange={(e) => setQ(e.target.value)} style={inputStyle} />
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
        <Avatar name={m.name} photoUrl={m.photoUrl} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{m.name}</div>
          <div style={{ fontSize: 11.5, color: T.muted }}>{m.branch} · {m.nasab}</div>
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
        ) : m.phone ? (
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
  const [form, setForm] = useState({ name: "", fatherId: null, gender: "male", region: "", phone: "" });
  const [selected, setSelected] = useState(null);

  const filtered = members.filter((m) => !query || m.name.includes(query) || m.branch.includes(query));

  const submit = async () => {
    if (!form.name.trim()) return;
    const created = await insertMember(form);
    if (created) {
      const enrichedAll = enrichMembers([...members, created], profilesMap);
      setMembers(enrichedAll);
    }
    setForm({ name: "", fatherId: null, gender: "male", region: "", phone: "" });
    setOpen(false);
  };

  return (
    <div>
      <SectionTitle action={<IconButton onClick={() => setOpen((v) => !v)} active={open}><Plus size={14} /> عضو جديد</IconButton>}>
        الأعضاء ({members.length})
      </SectionTitle>
      {open && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "grid", gap: 8 }}>
          <input placeholder="الاسم الأول" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <FatherPicker members={members} fatherId={form.fatherId} onSelect={(id) => setForm({ ...form, fatherId: id })} />
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

function AdminsTab() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [newPerms, setNewPerms] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRemoveAdmin, setConfirmRemoveAdmin] = useState(null);

  const loadAdmins = async () => {
    setLoading(true);
    const { data: roles, error } = await supabase.from("member_roles").select("id, user_id, role, permissions").neq("role", "owner");
    if (error || !roles) { setLoading(false); return; }
    const userIds = roles.map((r) => r.user_id);
    let namesByUserId = {};
    if (userIds.length > 0) {
      const { data: memberRows } = await supabase.from("members").select("user_account_id, first_name").in("user_account_id", userIds);
      (memberRows || []).forEach((m) => { namesByUserId[m.user_account_id] = m.first_name; });
    }
    setAdmins(roles.map((r) => ({ ...r, memberName: namesByUserId[r.user_id] || "عضو" })));
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
    </div>
  );
}

function ProfileTab({ members, setMembers, profilesMap, setProfilesMap, meId }) {
  const me = members.find((m) => m.id === meId);
  const [form, setForm] = useState(me);

  useEffect(() => setForm(me), [meId, members.length]);

  const save = async () => {
    await updateMemberCore(form.id, form);
    await upsertMemberProfile(form.id, { socialLinks: form.socialLinks, extendedVisible: form.extendedVisible });
    const newProfilesMap = { ...profilesMap, [form.id]: { socialLinks: form.socialLinks, visibility: { bio: form.extendedVisible ? "public" : "private" } } };
    setProfilesMap(newProfilesMap);
    const rawUpdated = members.map((m) => (m.id === form.id ? { ...m, ...form } : m));
    setMembers(enrichMembers(rawUpdated, newProfilesMap));
  };

  if (!form) return <EmptyState text="جارِ تحميل ملفك الشخصي..." />;

  return (
    <div>
      <SectionTitle>ملفي الشخصي</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Avatar name={form.name} photoUrl={form.photoUrl} size={56} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{form.name}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{form.branch} · {form.nasab}</div>
        </div>
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>البيانات الموسّعة (سيرة، وظيفة، تواصل)</span>
          <button onClick={() => setForm({ ...form, extendedVisible: !form.extendedVisible })} style={{ border: `1px solid ${form.extendedVisible ? T.gold : T.line}`, background: form.extendedVisible ? T.sandDark : "transparent", borderRadius: 999, padding: "4px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", color: T.text }}>
            {form.extendedVisible ? "مرئية للعائلة" : "مخفية"}
          </button>
        </div>
        <input placeholder="المسمى الوظيفي" value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} style={inputStyle} />
        <input placeholder="مدينة الإقامة" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={inputStyle} />
        <textarea placeholder="نبذة مختصرة" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} style={{ ...inputStyle, resize: "none" }} />
        <input placeholder="حساب تويتر/X (اختياري)" value={form.socialLinks?.twitter || ""} onChange={(e) => setForm({ ...form, socialLinks: { ...form.socialLinks, twitter: e.target.value } })} style={inputStyle} />
        <button onClick={save} style={primaryBtnStyle}>حفظ التغييرات</button>
        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>هذه البيانات لا تظهر لأحد إلا إذا فعّلتَ "مرئية للعائلة" أعلاه — تحكّمك بها كامل.</div>
      </div>
    </div>
  );
}

const BASE_TABS = [
  { key: "news", label: "الأخبار", icon: Newspaper },
  { key: "tree", label: "الشجرة", icon: GitBranch },
  { key: "events", label: "المناسبات", icon: CalendarDays },
  { key: "members", label: "الأعضاء", icon: Users },
  { key: "profile", label: "ملفي", icon: UserCircle2 },
];
const ADMINS_TAB = { key: "admins", label: "المشرفون", icon: Shield };

function FamilyAppInner({ meId }) {
  const [tab, setTab] = useState("news");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [news, setNews] = useState([]);
  const [events, setEvents] = useState([]);
  const [canManageTree, setCanManageTree] = useState(false);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [canManageNews, setCanManageNews] = useState(false);
  const [canManageEvents, setCanManageEvents] = useState(false);

  useEffect(() => {
    (async () => {
      const [rawMembers, profiles, n, e, treePerm, adminsPerm, newsPerm, eventsPerm] = await Promise.all([
        fetchMembers(), fetchMemberProfiles(), fetchNews(), fetchEvents(),
        checkPermission("manage_tree_profiles"), checkPermission("manage_admins"),
        checkPermission("manage_news"), checkPermission("manage_events"),
      ]);
      setProfilesMap(profiles);
      setMembers(enrichMembers(rawMembers, profiles));
      setNews(n);
      setEvents(e);
      setCanManageTree(treePerm);
      setCanManageAdmins(adminsPerm);
      setCanManageNews(newsPerm);
      setCanManageEvents(eventsPerm);
      setLoading(false);
    })();
  }, []);

  const me = members.find((m) => m.id === meId);
  const TABS = canManageAdmins ? [...BASE_TABS, ADMINS_TAB] : BASE_TABS;

  return (
    <div dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif", background: T.sand, minHeight: "100vh" }}>
      <style>{`
        ${FONTS}
        * { box-sizing: border-box; }
        ::placeholder { color: ${T.muted}; opacity: 0.8; }
        @keyframes rosette-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
        button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid ${T.gold}; outline-offset: 1px; }
      `}</style>
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: T.sand, position: "relative", paddingBottom: 78 }}>
        <div style={{ background: `linear-gradient(160deg, ${T.ink}, ${T.inkSoft})`, padding: "22px 18px 20px", borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Logo size={44} />
            <div>
              <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 22, color: T.goldLight, fontWeight: 700 }}>عائلتنا</div>
              <div style={{ fontSize: 11, color: "#CFE0DC" }}>{me ? `مرحبًا، ${me.name}` : "alturki.family"}</div>
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 16px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "70px 0", color: T.muted }}>
              <Loader2 size={22} style={{ animation: "rosette-spin 1.2s linear infinite" }} />
              <span style={{ fontSize: 13 }}>جارِ تحميل بيانات العائلة...</span>
            </div>
          ) : (
            <>
              {tab === "news" && <NewsTab news={news} setNews={setNews} canManageNews={canManageNews} />}
              {tab === "tree" && <TreeTab members={members} />}
              {tab === "events" && <EventsTab events={events} setEvents={setEvents} meId={meId} canManageEvents={canManageEvents} />}
              {tab === "members" && <MembersTab members={members} setMembers={setMembers} profilesMap={profilesMap} canManageTree={canManageTree} />}
              {tab === "profile" && <ProfileTab members={members} setMembers={setMembers} profilesMap={profilesMap} setProfilesMap={setProfilesMap} meId={meId} />}
              {tab === "admins" && canManageAdmins && <AdminsTab />}
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
