import React, { useState, useEffect, useMemo } from "react";
import {
  Newspaper, GitBranch, CalendarDays, Users, UserCircle2,
  Search, Plus, X, MapPin, Briefcase, GraduationCap,
  Link2, Phone, Mail, ChevronDown, ChevronUp, Check,
  Baby, HeartHandshake, Megaphone, Cross, Loader2, ImageIcon
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ---------------------------------------------------------
   Design tokens
--------------------------------------------------------- */
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

/* ---------------------------------------------------------
   Signature motif: an 8-fold rosette (ختم العائلة)
--------------------------------------------------------- */
function Rosette({ size = 40, color = T.gold, spin = false }) {
  const petals = Array.from({ length: 8 });
  const r = size * 0.27;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={spin ? { animation: "rosette-spin 40s linear infinite" } : undefined}
    >
      <circle cx={cx} cy={cy} r={size * 0.46} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
      {petals.map((_, i) => {
        const angle = (i * 360) / petals.length;
        const rad = (angle * Math.PI) / 180;
        const px = cx + r * Math.cos(rad);
        const py = cy + r * Math.sin(rad);
        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={size * 0.16}
            fill="none"
            stroke={color}
            strokeWidth={1.1}
            opacity={0.85}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={size * 0.055} fill={color} />
    </svg>
  );
}

/* ---------------------------------------------------------
   Data layer — real shared Supabase database. Every visitor
   reads and writes the same rows, unlike the earlier local-only
   prototype. Field names are mapped between the DB's snake_case
   columns and the app's camelCase shape.
--------------------------------------------------------- */
function mapMemberRow(row) {
  return {
    id: row.id,
    name: row.name,
    branch: row.branch,
    relation: row.relation || "",
    city: row.city || "",
    job: row.job || "",
    education: row.education || "",
    bio: row.bio || "",
    social: row.social || {},
    extendedVisible: !!row.extended_visible,
  };
}

async function fetchMembers() {
  const { data, error } = await supabase.from("members").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error("fetchMembers failed", error);
    return [];
  }
  return data.map(mapMemberRow);
}

async function insertMember(form) {
  const { data, error } = await supabase
    .from("members")
    .insert({ name: form.name, branch: form.branch, relation: form.relation })
    .select()
    .single();
  if (error) {
    console.error("insertMember failed", error);
    return null;
  }
  return mapMemberRow(data);
}

async function updateMember(id, patch) {
  const { error } = await supabase
    .from("members")
    .update({
      job: patch.job,
      education: patch.education,
      city: patch.city,
      bio: patch.bio,
      social: patch.social,
      extended_visible: patch.extendedVisible,
    })
    .eq("id", id);
  if (error) console.error("updateMember failed", error);
}

async function fetchNews() {
  const { data, error } = await supabase.from("news").select("*").order("date", { ascending: false });
  if (error) {
    console.error("fetchNews failed", error);
    return [];
  }
  return data;
}

async function insertNews(item) {
  const { data, error } = await supabase.from("news").insert(item).select().single();
  if (error) {
    console.error("insertNews failed", error);
    return null;
  }
  return data;
}

async function fetchEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*, event_attendees(member_id)")
    .order("date", { ascending: true });
  if (error) {
    console.error("fetchEvents failed", error);
    return [];
  }
  return data.map((ev) => ({
    ...ev,
    attendees: (ev.event_attendees || []).map((a) => a.member_id),
  }));
}

async function insertEvent(form) {
  const { data, error } = await supabase.from("events").insert(form).select().single();
  if (error) {
    console.error("insertEvent failed", error);
    return null;
  }
  return { ...data, attendees: [] };
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

const SEED_MEMBERS = [
  { id: "m1", name: "سالم عبدالله", branch: "فرع الجد الأول", relation: "الجد الأكبر", city: "الرياض", job: "", education: "", bio: "", social: {}, extendedVisible: false },
  { id: "m2", name: "منيرة سالم", branch: "فرع الجد الأول", relation: "زوجة", city: "الرياض", job: "", education: "", bio: "", social: {}, extendedVisible: false },
  { id: "m3", name: "فهد سالم", branch: "فرع فهد", relation: "ابن", city: "جدة", job: "مهندس مدني", education: "بكالوريوس هندسة", bio: "أعمل في مشاريع البنية التحتية.", social: { twitter: "@fahd_s" }, extendedVisible: true },
  { id: "m4", name: "نورة فهد", branch: "فرع فهد", relation: "ابنة", city: "جدة", job: "طالبة جامعية", education: "", bio: "", social: {}, extendedVisible: false },
];

const SEED_NEWS = [
  { id: "n1", type: "مولود", text: "بشّرت أسرة فهد سالم بمولودة جديدة، سمّتها لينا.", date: "2026-07-10" },
  { id: "n2", type: "عام", text: "تذكير: اجتماع اللجنة العامة للعائلة نهاية الشهر.", date: "2026-07-15" },
];

const SEED_EVENTS = [
  { id: "e1", title: "اللقاء السنوي للعائلة", date: "2026-08-20", location: "استراحة الروضة", description: "اللقاء السنوي لجميع الفروع، بمشاركة العائلة الكبيرة.", attendees: ["m1", "m3"] },
];

const NEWS_TYPES = {
  "مولود": { icon: Baby, color: T.gold },
  "وفاة": { icon: Cross, color: T.clay },
  "زواج": { icon: HeartHandshake, color: T.gold },
  "عام": { icon: Megaphone, color: T.inkSoft },
};

/* ---------------------------------------------------------
   Small UI atoms
--------------------------------------------------------- */
function Avatar({ name, size = 44 }) {
  const initials = name.trim().split(" ").slice(0, 2).map((w) => w[0]).join("");
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(155deg, ${T.inkSoft}, ${T.ink})`,
        color: T.goldLight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.36,
        flexShrink: 0,
        border: `1.5px solid ${T.gold}`,
      }}
    >
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
  return (
    <div style={{ textAlign: "center", padding: "36px 20px", color: T.muted, fontSize: 13.5 }}>
      {text}
    </div>
  );
}

function IconButton({ onClick, children, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? T.gold : T.line}`,
        background: active ? T.sandDark : T.card,
        color: T.ink,
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 12.5,
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------
   News Tab
--------------------------------------------------------- */
function NewsTab({ news, setNews }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("عام");
  const [text, setText] = useState("");

  const submit = async () => {
    if (!text.trim()) return;
    const created = await insertNews({ type, text: text.trim(), date: new Date().toISOString().slice(0, 10) });
    if (created) setNews([created, ...news]);
    setText("");
    setOpen(false);
  };

  return (
    <div>
      <SectionTitle
        action={
          <IconButton onClick={() => setOpen((v) => !v)} active={open}>
            <Plus size={14} /> إضافة خبر
          </IconButton>
        }
      >
        الأخبار
      </SectionTitle>

      {open && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {Object.keys(NEWS_TYPES).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  border: `1px solid ${type === t ? T.gold : T.line}`,
                  background: type === t ? T.sandDark : "transparent",
                  borderRadius: 999,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontFamily: "inherit",
                  color: T.text,
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب نص الخبر هنا..."
            rows={3}
            style={{
              width: "100%",
              border: `1px solid ${T.line}`,
              borderRadius: 10,
              padding: 10,
              fontFamily: "inherit",
              fontSize: 13.5,
              resize: "none",
              boxSizing: "border-box",
              background: T.sand,
              color: T.text,
            }}
          />
          <button
            onClick={submit}
            style={{
              marginTop: 8,
              background: T.ink,
              color: T.sand,
              border: "none",
              borderRadius: 10,
              padding: "8px 16px",
              fontSize: 13,
              fontFamily: "inherit",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            نشر الخبر
          </button>
        </div>
      )}

      {news.length === 0 && <EmptyState text="لا توجد أخبار بعد. كونوا أول من ينشر خبرًا للعائلة." />}

      {news.map((n) => {
        const meta = NEWS_TYPES[n.type] || NEWS_TYPES["عام"];
        const Icon = meta.icon;
        return (
          <div
            key={n.id}
            style={{
              display: "flex",
              gap: 12,
              background: T.card,
              border: `1px solid ${T.line}`,
              borderRadius: 14,
              padding: 13,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: T.sandDark,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: meta.color,
              }}
            >
              <Icon size={17} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>{n.text}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                {n.type} · {n.date}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------
   Tree Tab
--------------------------------------------------------- */
function TreeTab({ members }) {
  const [openBranch, setOpenBranch] = useState(null);
  const [query, setQuery] = useState("");

  const branches = useMemo(() => {
    const map = {};
    members
      .filter((m) => !query || m.name.includes(query))
      .forEach((m) => {
        map[m.branch] = map[m.branch] || [];
        map[m.branch].push(m);
      });
    return map;
  }, [members, query]);

  return (
    <div>
      <SectionTitle>شجرة العائلة</SectionTitle>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} style={{ position: "absolute", right: 12, top: 11, color: T.muted }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن فرد بالاسم..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "9px 38px 9px 12px",
            borderRadius: 10,
            border: `1px solid ${T.line}`,
            fontFamily: "inherit",
            fontSize: 13.5,
            background: T.card,
            color: T.text,
          }}
        />
      </div>

      {Object.keys(branches).length === 0 && <EmptyState text="لا نتائج مطابقة." />}

      {Object.entries(branches).map(([branch, list]) => {
        const isOpen = openBranch === branch || query;
        return (
          <div key={branch} style={{ marginBottom: 10, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", background: T.card }}>
            <button
              onClick={() => setOpenBranch(isOpen && !query ? null : branch)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                background: T.sandDark,
                border: "none",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                <GitBranch size={15} color={T.gold} /> {branch}
                <span style={{ color: T.muted, fontWeight: 500 }}>({list.length})</span>
              </span>
              {isOpen ? <ChevronUp size={16} color={T.muted} /> : <ChevronDown size={16} color={T.muted} />}
            </button>
            {isOpen && (
              <div style={{ padding: 10 }}>
                {list.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px" }}>
                    <Avatar name={m.name} size={34} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>{m.relation}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------
   Events Tab
--------------------------------------------------------- */
function EventsTab({ events, setEvents, members, meId }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", location: "", description: "" });

  const submit = async () => {
    if (!form.title.trim() || !form.date) return;
    const created = await insertEvent(form);
    if (created) setEvents([created, ...events]);
    setForm({ title: "", date: "", location: "", description: "" });
    setOpen(false);
  };

  const toggleRSVP = async (eventId) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const attending = ev.attendees.includes(meId);
    await setAttendance(eventId, meId, attending);
    const updated = events.map((e) =>
      e.id !== eventId
        ? e
        : { ...e, attendees: attending ? e.attendees.filter((a) => a !== meId) : [...e.attendees, meId] }
    );
    setEvents(updated);
  };

  return (
    <div>
      <SectionTitle
        action={
          <IconButton onClick={() => setOpen((v) => !v)} active={open}>
            <Plus size={14} /> مناسبة جديدة
          </IconButton>
        }
      >
        المناسبات
      </SectionTitle>

      {open && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "grid", gap: 8 }}>
          <input placeholder="عنوان المناسبة" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} />
          <input placeholder="المكان" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={inputStyle} />
          <textarea placeholder="تفاصيل مختصرة" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, resize: "none" }} />
          <button onClick={submit} style={primaryBtnStyle}>إضافة المناسبة</button>
        </div>
      )}

      {events.length === 0 && <EmptyState text="لا توجد مناسبات مجدولة حاليًا." />}

      {events.map((ev) => {
        const attending = ev.attendees.includes(meId);
        return (
          <div key={ev.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>{ev.title}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><CalendarDays size={13} /> {ev.date}</span>
                  {ev.location && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={13} /> {ev.location}</span>}
                </div>
              </div>
            </div>
            {ev.description && <div style={{ fontSize: 12.5, color: T.text, marginTop: 8, lineHeight: 1.6 }}>{ev.description}</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <span style={{ fontSize: 11.5, color: T.muted }}>{ev.attendees.length} من العائلة سيحضرون</span>
              <button
                onClick={() => toggleRSVP(ev.id)}
                style={{
                  border: `1px solid ${attending ? T.gold : T.line}`,
                  background: attending ? T.ink : "transparent",
                  color: attending ? T.sand : T.ink,
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontFamily: "inherit",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                }}
              >
                {attending && <Check size={13} />} {attending ? "مؤكّد الحضور" : "تأكيد الحضور"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  borderRadius: 10,
  border: `1px solid ${T.line}`,
  fontFamily: "inherit",
  fontSize: 13.5,
  background: T.sand,
  color: T.text,
};
const primaryBtnStyle = {
  background: T.ink,
  color: T.sand,
  border: "none",
  borderRadius: 10,
  padding: "9px 16px",
  fontSize: 13,
  fontFamily: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

/* ---------------------------------------------------------
   Members Tab
--------------------------------------------------------- */
function MemberCard({ m }) {
  const [expanded, setExpanded] = useState(false);
  const hasExtended = m.extendedVisible && (m.bio || m.job || m.education || m.city || Object.keys(m.social || {}).length);
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 13, marginBottom: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, cursor: hasExtended ? "pointer" : "default" }} onClick={() => hasExtended && setExpanded((v) => !v)}>
        <Avatar name={m.name} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{m.name}</div>
          <div style={{ fontSize: 11.5, color: T.muted }}>{m.branch} · {m.relation}</div>
        </div>
        {hasExtended && (expanded ? <ChevronUp size={16} color={T.muted} /> : <ChevronDown size={16} color={T.muted} />)}
        {!m.extendedVisible && (
          <span style={{ fontSize: 10.5, color: T.muted, border: `1px solid ${T.line}`, borderRadius: 999, padding: "2px 8px" }}>ملف مخفي</span>
        )}
      </div>
      {expanded && hasExtended && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.line}`, display: "grid", gap: 6 }}>
          {m.job && <Row icon={<Briefcase size={13} />} text={m.job} />}
          {m.education && <Row icon={<GraduationCap size={13} />} text={m.education} />}
          {m.city && <Row icon={<MapPin size={13} />} text={m.city} />}
          {m.bio && <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>{m.bio}</div>}
          {m.social && Object.keys(m.social).length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(m.social).map(([k, v]) => (
                <span key={k} style={{ fontSize: 11.5, color: T.gold, display: "flex", alignItems: "center", gap: 3 }}>
                  <Link2 size={11} /> {v}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function Row({ icon, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.text }}>
      <span style={{ color: T.gold }}>{icon}</span> {text}
    </div>
  );
}

function MembersTab({ members, setMembers }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", branch: "", relation: "" });

  const filtered = members.filter((m) => !query || m.name.includes(query) || m.branch.includes(query));

  const submit = async () => {
    if (!form.name.trim() || !form.branch.trim()) return;
    const created = await insertMember(form);
    if (created) setMembers([created, ...members]);
    setForm({ name: "", branch: "", relation: "" });
    setOpen(false);
  };

  return (
    <div>
      <SectionTitle
        action={
          <IconButton onClick={() => setOpen((v) => !v)} active={open}>
            <Plus size={14} /> عضو جديد
          </IconButton>
        }
      >
        الأعضاء ({members.length})
      </SectionTitle>

      {open && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14, display: "grid", gap: 8 }}>
          <input placeholder="الاسم الكامل" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <input placeholder="الفرع (مثال: فرع فهد)" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} style={inputStyle} />
          <input placeholder="صلة القرابة (مثال: ابن، حفيدة)" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} style={inputStyle} />
          <button onClick={submit} style={primaryBtnStyle}>إضافة العضو</button>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} style={{ position: "absolute", right: 12, top: 11, color: T.muted }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم أو الفرع..."
          style={{ ...inputStyle, padding: "9px 38px 9px 12px" }}
        />
      </div>

      {filtered.length === 0 && <EmptyState text="لا يوجد أعضاء مطابقون." />}
      {filtered.map((m) => <MemberCard key={m.id} m={m} />)}
    </div>
  );
}

/* ---------------------------------------------------------
   Profile Tab (self, with privacy control demo)
--------------------------------------------------------- */
function ProfileTab({ members, setMembers, meId, setMeId }) {
  const me = members.find((m) => m.id === meId) || members[0];
  const [form, setForm] = useState(me);

  useEffect(() => setForm(me), [meId]);

  const save = async () => {
    await updateMember(form.id, form);
    const updated = members.map((m) => (m.id === form.id ? form : m));
    setMembers(updated);
  };

  if (!me) return <EmptyState text="لا يوجد أعضاء بعد." />;

  return (
    <div>
      <SectionTitle>ملفي الشخصي</SectionTitle>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>عرض التطبيق كأنك (للتجربة فقط):</div>
        <select
          value={meId}
          onChange={(e) => setMeId(e.target.value)}
          style={{ ...inputStyle }}
        >
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Avatar name={form.name} size={56} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{form.name}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{form.branch} · {form.relation}</div>
        </div>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>البيانات الموسّعة (سيرة، وظيفة، تواصل)</span>
          <button
            onClick={() => setForm({ ...form, extendedVisible: !form.extendedVisible })}
            style={{
              border: `1px solid ${form.extendedVisible ? T.gold : T.line}`,
              background: form.extendedVisible ? T.sandDark : "transparent",
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 11.5,
              fontFamily: "inherit",
              cursor: "pointer",
              color: T.text,
            }}
          >
            {form.extendedVisible ? "مرئية للعائلة" : "مخفية"}
          </button>
        </div>
        <input placeholder="المسمى الوظيفي" value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} style={inputStyle} />
        <input placeholder="المؤهل العلمي" value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} style={inputStyle} />
        <input placeholder="مدينة الإقامة" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
        <textarea placeholder="نبذة مختصرة" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} style={{ ...inputStyle, resize: "none" }} />
        <input
          placeholder="حساب تويتر/X (اختياري)"
          value={form.social?.twitter || ""}
          onChange={(e) => setForm({ ...form, social: { ...form.social, twitter: e.target.value } })}
          style={inputStyle}
        />
        <button onClick={save} style={primaryBtnStyle}>حفظ التغييرات</button>
        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
          هذه البيانات لا تظهر لأحد إلا إذا فعّلتَ "مرئية للعائلة" أعلاه — تحكّمك بها كامل.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   App shell
--------------------------------------------------------- */
const TABS = [
  { key: "news", label: "الأخبار", icon: Newspaper },
  { key: "tree", label: "الشجرة", icon: GitBranch },
  { key: "events", label: "المناسبات", icon: CalendarDays },
  { key: "members", label: "الأعضاء", icon: Users },
  { key: "profile", label: "ملفي", icon: UserCircle2 },
];

export default function FamilyApp() {
  const [tab, setTab] = useState("news");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [news, setNews] = useState([]);
  const [events, setEvents] = useState([]);
  const [meId, setMeId] = useState(null);

  useEffect(() => {
    (async () => {
      const [m, n, e] = await Promise.all([fetchMembers(), fetchNews(), fetchEvents()]);
      setMembers(m);
      setNews(n);
      setEvents(e);
      if (m.length) setMeId(m[0].id);
      setLoading(false);
    })();
  }, []);

  return (
    <div dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif", background: T.sand, minHeight: "100vh" }}>
      <style>{`
        ${FONTS}
        * { box-sizing: border-box; }
        ::placeholder { color: ${T.muted}; opacity: 0.8; }
        @keyframes rosette-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
        button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
          outline: 2px solid ${T.gold};
          outline-offset: 1px;
        }
      `}</style>

      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: T.sand, position: "relative", paddingBottom: 78 }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(160deg, ${T.ink}, ${T.inkSoft})`, padding: "22px 18px 20px", borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Rosette size={44} color={T.goldLight} spin />
            <div>
              <div style={{ fontFamily: "'Aref Ruqaa', serif", fontSize: 22, color: T.goldLight, fontWeight: 700 }}>عائلتنا</div>
              <div style={{ fontSize: 11, color: "#CFE0DC" }}>نموذج تجريبي — بيانات العرض تجريبية</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "16px 16px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "70px 0", color: T.muted }}>
              <Loader2 size={22} style={{ animation: "rosette-spin 1.2s linear infinite" }} />
              <span style={{ fontSize: 13 }}>جارِ تحميل بيانات العائلة...</span>
            </div>
          ) : (
            <>
              {tab === "news" && <NewsTab news={news} setNews={setNews} />}
              {tab === "tree" && <TreeTab members={members} />}
              {tab === "events" && <EventsTab events={events} setEvents={setEvents} members={members} meId={meId} />}
              {tab === "members" && <MembersTab members={members} setMembers={setMembers} />}
              {tab === "profile" && <ProfileTab members={members} setMembers={setMembers} meId={meId} setMeId={setMeId} />}
            </>
          )}
        </div>

        {/* Bottom nav */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 430,
            background: T.card,
            borderTop: `1px solid ${T.line}`,
            display: "flex",
            padding: "8px 4px",
          }}
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  padding: "6px 0",
                  cursor: "pointer",
                  color: active ? T.ink : T.muted,
                  fontFamily: "inherit",
                }}
              >
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
