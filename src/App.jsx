import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase.js";
import { uploadAttachment, deleteAttachment } from "./lib/attachments.js";
import { LOGO_B64 } from "./logo.js";

// ─── ZENITH Projekte – Design-System (Dark, angelehnt an Moco) ────────────
// Dunkles Dashboard mit kräftigen Akzentfarben je Bereich, orientiert an
// Moco: dunkle Karten auf fast-schwarzem Grund, Icon-Kreise, klare Zahlen.
// Gold bleibt die Markenfarbe für Primär-Aktionen und aktive Zustände.
const Z = {
  gold: "#C9A227",
  goldLight: "#E0BE5C",
  bg: "#121212",
  panel: "#1C1C1E",
  panelAlt: "#222224",
  border: "rgba(255,255,255,0.08)",
  borderSoft: "rgba(255,255,255,0.05)",
  text: "#F2F0EC",
  textSoft: "#9A968C",
  textFaint: "#6B675F",
  danger: "#E0607A",
};
const FONT_BODY = "'Inter', system-ui, sans-serif";
const PAGE_MAX = 1320;

const BEREICHE = [
  { key: "fotostudio", label: "Foto/Videoproduktion", short: "Foto/Video", icon: "ti-camera", accent: "#4F9CDB" },
  { key: "grafik", label: "Grafik/Nachbearbeitung", short: "Grafik", icon: "ti-palette", accent: "#A66FE0" },
  { key: "fotobox", label: "Fotobox", short: "Fotobox", icon: "ti-device-camera-phone", accent: "#E8963C" },
  { key: "messebau", label: "Messebau", short: "Messebau", icon: "ti-building-store", accent: "#45B990" },
  { key: "hochzeiten", label: "Hochzeiten", short: "Hochzeiten", icon: "ti-heart", accent: "#E07A93", locked: true },
];
const BEREICH_BY_KEY = Object.fromEntries(BEREICHE.map(b => [b.key, b]));

// ─── Fachlogik Foto-/Videoproduktion ───────────────────────────────────────
// Status-Pipeline und Kategorisierung spiegeln die alte Fotostudio-Jobliste,
// damit das Team die gewohnten Begriffe wiederfindet.
const STATUS_LIST = ["Neu", "In Arbeit", "Abgeschlossen", "Archiviert"];
const STATUS_CFG = {
  "Neu": { color: "#4ADE80" },
  "In Arbeit": { color: "#4F9CDB" },
  "Abgeschlossen": { color: "#9A968C" },
  "Archiviert": { color: "#A66FE0" },
};
const PRIO_LIST = ["Hoch", "Mittel", "Niedrig"];
const PRIO_ORDER = { "Hoch": 0, "Mittel": 1, "Niedrig": 2 };
const AUFWAND_LIST = ["Klein", "Mittel", "Groß"];
const ORT_LIST = ["Im Haus", "Außer Haus"];
const PROJEKTTYP_CFG = {
  "Fotografie": { icon: "ti-camera", kategorien: ["Freistellerfotos", "Milieufotos", "Porträtfotos", "Produktfotos", "Reportage", "Sonstiges"] },
  "Video": { icon: "ti-movie", kategorien: ["Imagefilm", "Produktvideo", "Social Media Clip", "Reels / TikTok", "Interview", "Sonstiges"] },
};
const EMPTY_JOB_FORM = {
  name: "", status: "Neu", prio: "Mittel", aufwand: "Mittel", ort: "Im Haus",
  personen: [], date: "", date_end: "", dauer: "", abgabe: "", kontakt: "", notizen: "",
  projekttyp: "Fotografie", kategorien: [], attachments: [], stationen: [],
};

// Studio-Grundriss (Aufnahmeplätze), aus der alten Fotostudio-Jobliste übernommen.
const STUDIO_ZONES = [
  { id: 1, x: 78, y: 503, w: 190, h: 141 },
  { id: 2, x: 78, y: 298, w: 190, h: 141 },
  { id: 3, x: 283, y: 318, w: 190, h: 327 },
  { id: 4, x: 313, y: 198, w: 215, h: 98 },
  { id: 5, x: 498, y: 318, w: 175, h: 175 },
  { id: 6, x: 498, y: 503, w: 175, h: 141 },
  { id: 7, x: 708, y: 168, w: 250, h: 477 },
];

function fmtDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function today() {
  return new Date().toISOString().split("T")[0];
}
// Prüft, ob ein Datum (iso) im Shooting-Zeitraum eines Jobs liegt (date = Start,
// date_end = optionales Ende bei mehrtägigen Produktionen).
function jobActiveOn(job, iso) {
  if (!job.date) return false;
  return iso >= job.date && iso <= (job.date_end || job.date);
}
function toISO(d) { return d.toISOString().split("T")[0]; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { const r = new Date(d); const dow = (r.getDay() + 6) % 7; r.setDate(r.getDate() - dow); r.setHours(0, 0, 0, 0); return r; }
function startOfMonthGrid(d) { return startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1)); }
function isoWeek(iso) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ─── Schnelleingabe: Felder & Ziel-Tabelle je Bereich ──────────────────────
const QUICK_ADD = {
  // fotostudio nutzt JobFormModal (eigenes, reicheres Formular inkl.
  // Status-Pipeline, Projekttyp/Kategorien, Personen) statt dieser generischen
  // Schnelleingabe - nur der Titel wird hier für Button-Label/Sichtbarkeit genutzt.
  fotostudio: { title: "Neuer Job" },
  fotobox: {
    table: "fb_bookings",
    title: "Neue Fotobox Buchung",
    fields: [
      { key: "title", label: "Titel", type: "text", required: true },
      { key: "location", label: "Ort", type: "text" },
      { key: "start_date", label: "Start", type: "date", required: true },
      { key: "end_date", label: "Ende", type: "date" },
      { key: "logistics", label: "Logistik", type: "select", options: ["aufbau", "abholung"], default: "aufbau" },
    ],
    buildRow: (v, ctx) => ({
      title: v.title, location: v.location || null, start_date: v.start_date, end_date: v.end_date || v.start_date,
      logistics: v.logistics || "aufbau", box_id: ctx.boxId, status: "option", media_packages: 1, with_printer: true, invoice_status: "keine",
    }),
  },
  hochzeiten: {
    table: "hz_hochzeiten",
    title: "Neue Hochzeit",
    fields: [
      { key: "partner1", label: "Partner 1", type: "text", required: true },
      { key: "partner2", label: "Partner 2", type: "text" },
      { key: "hochzeitsDatum", label: "Datum", type: "date" },
      { key: "feierAdresse", label: "Ort der Feier", type: "text" },
    ],
    buildRow: (v) => ({ id: Date.now(), created_at: new Date().toISOString(), data: { ...v, status: "Anfrage" } }),
  },
  grafik: null,
  messebau: null,
};

export default function App() {
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ hochzeiten: [], fotostudioJobs: [], bookings: [], boxes: [] });
  const [team, setTeam] = useState([]);
  const [weddingUnlocked, setWeddingUnlocked] = useState(() => {
    try { return sessionStorage.getItem("zp-wedding-unlocked") === "1"; } catch { return false; }
  });
  const [appUnlocked, setAppUnlocked] = useState(() => {
    try { return sessionStorage.getItem("zp-app-unlocked") === "1"; } catch { return false; }
  });
  const [quickAddTarget, setQuickAddTarget] = useState(null);
  const [jobModal, setJobModal] = useState(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [fotoSearch, setFotoSearch] = useState("");
  const [grafikSearch, setGrafikSearch] = useState("");

  const JOB_FIELDS = "id,name,status,date,date_end,abgabe,dauer,prio,aufwand,kontakt,notizen,projekttyp,kategorien,personen,ort,bereich,attachments,stationen";
  const [toast, setToast] = useState(null);
  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(t => (t?.msg === msg ? null : t)), 4500);
  };

  // Meldet einen auf "Archiviert" gesetzten Job an Moco (passende Firma im
  // Firmenstamm bekommt eine Notiz "abrechnungsbereit"). Übernommen aus der
  // alten Fotostudio-Jobliste - läuft best effort, blockiert das Speichern nie.
  const notifyMocoArchive = async (job) => {
    try {
      const res = await fetch("/api/moco-archive", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Moco-Fehler");
      if (result.matched) showToast(`✓ Moco benachrichtigt: "${result.companyName}" kann abgerechnet werden`);
      else showToast(`Archiviert – keine passende Moco-Firma für "${result.searchTerm}" gefunden`, false);
    } catch (e) {
      showToast("Moco-Hinweis fehlgeschlagen: " + e.message, false);
    }
  };

  // Legt direkt bei Jobanlage (nicht erst beim Archivieren) ein Moco-Projekt
  // beim passenden Kunden an, damit das Team schon während der Arbeit Zeiten
  // darauf buchen kann. Läuft best effort, blockiert das Speichern nie.
  const notifyMocoCreateProject = async (job) => {
    try {
      const res = await fetch("/api/moco-create-project", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Moco-Fehler");
      if (result.matched) showToast(`✓ Moco-Projekt angelegt: "${result.companyName}" – ${result.projectName}`);
      else showToast(`Job angelegt – keine passende Moco-Firma für "${result.searchTerm}" gefunden, kein Moco-Projekt erstellt`, false);
    } catch (e) {
      showToast("Moco-Projekt anlegen fehlgeschlagen: " + e.message, false);
    }
  };

  // Postet in einen Teams-Kanal, sobald Personen einem Job zugeordnet werden
  // (Neuanlage, oder im Edit neu hinzugekommene Personen - bereits vorher
  // zugewiesene sollen nicht bei jeder Bearbeitung erneut benachrichtigt werden).
  const notifyTeamsBooking = async (names, job) => {
    if (!names || names.length === 0) return;
    try {
      const res = await fetch("/api/teams-notify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, jobName: job.name, bereich: "Foto/Video" }),
      });
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || "Teams-Fehler"); }
    } catch (e) {
      showToast("Teams-Benachrichtigung fehlgeschlagen: " + e.message, false);
    }
  };

  useEffect(() => {
    if (!appUnlocked) return;
    let cancelled = false;
    async function load() {
      const [hz, js, fb, boxes, core] = await Promise.all([
        supabase.from("hz_hochzeiten").select("id,data,created_at"),
        supabase.from("js_jobs").select(JOB_FIELDS).order("created_at", { ascending: false }),
        supabase.from("fb_bookings").select("id,title,location,start_date,end_date,status").order("start_date", { ascending: true }),
        supabase.from("fb_boxes").select("id,name"),
        supabase.from("core_team").select("name").order("name", { ascending: true }),
      ]);
      if (cancelled) return;
      setData({
        hochzeiten: hz.data || [],
        fotostudioJobs: js.data || [],
        bookings: fb.data || [],
        boxes: boxes.data || [],
      });
      setTeam((core.data || []).map(t => t.name));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [appUnlocked]);

  const t = today();
  const upcomingWeddings = data.hochzeiten
    .filter(h => h.data?.hochzeitsDatum && h.data.hochzeitsDatum >= t)
    .sort((a, b) => a.data.hochzeitsDatum.localeCompare(b.data.hochzeitsDatum));
  const openJobsAll = data.fotostudioJobs.filter(j => !["Abgeschlossen", "Archiviert", "Fertig"].includes(j.status));
  // Die alte Fotostudio-Jobliste führt Produktion (Foto/Video) und Grafik
  // (Nachbearbeitung) als einen gemeinsamen Datensatz, unterschieden durch
  // das Feld "bereich" - hier entsprechend gespiegelt.
  const openJobs = openJobsAll.filter(j => j.bereich !== "Grafik");
  const openJobsGrafik = openJobsAll.filter(j => j.bereich === "Grafik");
  // Suche wirkt nur auf die Anzeige (Name/Kontakt/Notizen/Personen), wie in
  // der alten Fotostudio-Jobliste.
  const matchesSearch = (job, term) => {
    if (!term.trim()) return true;
    const haystack = [job.name, job.kontakt, job.notizen, ...(job.personen || [])].join(" ").toLowerCase();
    return haystack.includes(term.trim().toLowerCase());
  };
  const visibleFotoJobs = openJobs.filter(j => matchesSearch(j, fotoSearch));
  const visibleGrafikJobs = openJobsGrafik.filter(j => matchesSearch(j, grafikSearch));
  const todaysFotoJobs = openJobsAll.filter(j => j.bereich !== "Grafik" && jobActiveOn(j, t));
  const upcomingBookings = data.bookings
    .filter(b => b.start_date >= t && b.status !== "storniert")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const metrics = { hochzeiten: upcomingWeddings.length, fotostudio: openJobs.length, fotobox: upcomingBookings.length, grafik: openJobsGrafik.length, messebau: null };

  const handleInsert = async (bereichKey, row) => {
    const cfg = QUICK_ADD[bereichKey];
    const { data: inserted, error } = await supabase.from(cfg.table).insert([row]).select().single();
    if (error) throw error;
    setData(p => {
      if (bereichKey === "fotobox") return { ...p, bookings: [...p.bookings, inserted].sort((a, b) => a.start_date.localeCompare(b.start_date)) };
      if (bereichKey === "hochzeiten") return { ...p, hochzeiten: [...p.hochzeiten, inserted] };
      return p;
    });
  };

  // Speichert einen Foto-/Video-Job (Neuanlage oder Bearbeitung bestehender Jobs)
  // inkl. der vollen Fachlogik-Felder (Status, Projekttyp/Kategorien, Personen, Ort, Zeitraum).
  const handleSaveJob = async (values, existingId) => {
    const row = {
      name: values.name, status: values.status || "Neu", prio: values.prio || "Mittel", aufwand: values.aufwand || "Mittel",
      ort: values.ort || "Im Haus", personen: values.personen || [], person: (values.personen || []).join(", "),
      date: values.date || null, date_end: values.date_end || null, dauer: values.dauer || null,
      abgabe: values.abgabe || null, kontakt: values.kontakt || "", notizen: values.notizen || "",
      projekttyp: values.projekttyp || "Fotografie", kategorien: values.kategorien || [], attachments: values.attachments || [],
      stationen: values.ort === "Außer Haus" ? [] : (values.stationen || []),
    };
    if (existingId) {
      const vorher = data.fotostudioJobs.find(j => j.id === existingId);
      const vorherigerStatus = vorher?.status;
      const vorherigePersonen = Array.isArray(vorher?.personen) ? vorher.personen : [];
      const { data: updated, error } = await supabase.from("js_jobs").update(row).eq("id", existingId).select(JOB_FIELDS).single();
      if (error) throw error;
      setData(p => ({ ...p, fotostudioJobs: p.fotostudioJobs.map(j => j.id === existingId ? updated : j) }));
      if (updated.status === "Archiviert" && vorherigerStatus !== "Archiviert") notifyMocoArchive(updated);
      const neuePersonen = (updated.personen || []).filter(p => !vorherigePersonen.includes(p));
      notifyTeamsBooking(neuePersonen, updated);
    } else {
      const { data: inserted, error } = await supabase.from("js_jobs").insert([row]).select(JOB_FIELDS).single();
      if (error) throw error;
      setData(p => ({ ...p, fotostudioJobs: [inserted, ...p.fotostudioJobs] }));
      notifyMocoCreateProject(inserted);
      notifyTeamsBooking(inserted.personen || [], inserted);
    }
  };

  // Status per Klick auf den Status-Pill in der Liste weiterschalten, ohne
  // das Formular öffnen zu müssen - deckt den häufigsten Alltags-Workflow ab.
  const handleStatusAdvance = async (job) => {
    const idx = STATUS_LIST.indexOf(job.status);
    const next = STATUS_LIST[(idx + 1) % STATUS_LIST.length];
    const { data: updated, error } = await supabase.from("js_jobs").update({ status: next }).eq("id", job.id).select(JOB_FIELDS).single();
    if (error) { console.error(error.message); return; }
    setData(p => ({ ...p, fotostudioJobs: p.fotostudioJobs.map(j => j.id === job.id ? updated : j) }));
    if (next === "Archiviert") notifyMocoArchive(updated);
  };

  // Setzt das Shooting-Datum eines Jobs auf heute - wird vom "Heute"-Ablagefeld
  // (Drag & Drop aus der Liste, siehe TodayPanel) aufgerufen.
  const handleScheduleToday = async (jobId) => {
    const t = today();
    const { data: updated, error } = await supabase.from("js_jobs").update({ date: t }).eq("id", jobId).select(JOB_FIELDS).single();
    if (error) { console.error(error.message); return; }
    setData(p => ({ ...p, fotostudioJobs: p.fotostudioJobs.map(j => j.id === jobId ? updated : j) }));
  };

  // Jobs, die die KI-Erfassung (api/parse-input.js, ChatCapture im "Neuer
  // Job"-Formular) aus Freitext/Diktat/Foto/PDF/Excel direkt angelegt hat.
  const handleChatJobsCreated = (jobs) => {
    setData(p => ({ ...p, fotostudioJobs: [...jobs, ...p.fotostudioJobs] }));
  };

  // Spiegelt die Schreibaktion des KI-Chats (api/ai-chat.js) in den lokalen
  // State zurück, damit Listen/Zähler ohne Neuladen aktuell bleiben.
  const applyAiAction = (action) => {
    if (!action || !action.row) return;
    const { type, row } = action;
    if (type === "create_job") setData(p => ({ ...p, fotostudioJobs: [row, ...p.fotostudioJobs] }));
    if (type === "update_job") setData(p => ({ ...p, fotostudioJobs: p.fotostudioJobs.map(j => j.id === row.id ? row : j) }));
    if (type === "create_booking") setData(p => ({ ...p, bookings: [...p.bookings, row].sort((a, b) => a.start_date.localeCompare(b.start_date)) }));
    if (type === "create_wedding") setData(p => ({ ...p, hochzeiten: [...p.hochzeiten, row] }));
  };

  // Die gesamte App ist passwortgeschützt (api/check-app-password.js), damit
  // sie nicht öffentlich unter der Vercel-URL einsehbar ist. Erst danach wird
  // überhaupt geladen/gerendert - die eigentlichen Daten bleiben bis dahin unangetastet.
  if (!appUnlocked) {
    return (
      <div style={{ minHeight: "100vh", background: Z.bg, fontFamily: FONT_BODY, color: Z.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <GlobalStyle />
        <img src={LOGO_B64} alt="ZENITH" style={{ height: 34, width: "auto", objectFit: "contain", marginBottom: 28 }} />
        <PasswordGate endpoint="/api/check-app-password" storageKey="zp-app-unlocked" accent={Z.gold}
          title="Geschützter Bereich" text="Diese App ist passwortgeschützt. Bitte Passwort eingeben, um fortzufahren."
          onUnlock={() => setAppUnlocked(true)} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: Z.bg, fontFamily: FONT_BODY, color: Z.text }}>
      <GlobalStyle />

      {/* ── Header ── */}
      <div style={{ background: "#0C0C0D", borderBottom: `1px solid ${Z.border}` }}>
        <div style={{ maxWidth: PAGE_MAX, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img src={LOGO_B64} alt="ZENITH" style={{ height: 30, width: "auto", objectFit: "contain" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: Z.textSoft, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80", display: "inline-block" }} />
            Live
          </div>
        </div>
      </div>

      {/* ── Bereich-Navigation ── */}
      <div style={{ background: "#0C0C0D", borderBottom: `1px solid ${Z.border}` }}>
        <div style={{ maxWidth: PAGE_MAX, margin: "0 auto", padding: "10px 20px 0", display: "flex", gap: 22, overflowX: "auto" }}>
          <NavItem active={view === "dashboard"} onClick={() => setView("dashboard")} icon="ti-layout-dashboard" label="Übersicht" accent={Z.gold} />
          {BEREICHE.map(b => (
            <NavItem key={b.key} active={view === b.key} onClick={() => setView(b.key)} icon={b.locked && !weddingUnlocked ? "ti-lock" : b.icon} label={b.short} accent={b.accent} />
          ))}
        </div>
      </div>

      <div style={{ maxWidth: PAGE_MAX, margin: "0 auto", padding: "26px 20px 80px" }}>
        {view === "dashboard" && (
          <Dashboard metrics={metrics} upcomingWeddings={upcomingWeddings} openJobs={openJobs} openJobsGrafik={openJobsGrafik} todaysFotoJobs={todaysFotoJobs} upcomingBookings={upcomingBookings} loading={loading} onNavigate={setView} onOpenJob={j => setJobModal({ mode: "edit", job: j })} team={team} onAiAction={applyAiAction} />
        )}
        {view === "hochzeiten" && !weddingUnlocked && (
          <PasswordGate endpoint="/api/check-wedding-password" storageKey="zp-wedding-unlocked" accent={BEREICH_BY_KEY.hochzeiten.accent}
            title="Geschützter Bereich" text="Der Hochzeiten-Bereich ist passwortgeschützt. Bitte Passwort eingeben, um fortzufahren."
            onUnlock={() => setWeddingUnlocked(true)} />
        )}
        {view === "fotostudio" && <BereichPage bereich={BEREICH_BY_KEY.fotostudio} loading={loading} onAdd={() => setJobModal({ mode: "new" })}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
            <TodayDropPanel jobs={openJobs} onOpen={j => setJobModal({ mode: "edit", job: j })} onDropJob={handleScheduleToday} />
            <KalenderWidget jobs={openJobs} onOpen={j => setJobModal({ mode: "edit", job: j })} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <StudioOccupancyWidget jobs={openJobs} onOpen={j => setJobModal({ mode: "edit", job: j })} />
          </div>
          <SearchBox value={fotoSearch} onChange={setFotoSearch} placeholder="Suche nach Name, Kontakt, Notiz, Person…" />
          <ListPreview title="Offene Jobs" empty={fotoSearch ? "Keine Treffer für diese Suche." : "Keine offenen Jobs."} accent={BEREICH_BY_KEY.fotostudio.accent}>
            {visibleFotoJobs.map(j => (
              <JobRow key={j.id} job={j} onOpen={() => setJobModal({ mode: "edit", job: j })} onAdvance={() => handleStatusAdvance(j)} />
            ))}
          </ListPreview>
        </BereichPage>}
        {view === "fotobox" && <BereichPage bereich={BEREICH_BY_KEY.fotobox} loading={loading} onAdd={() => setQuickAddTarget("fotobox")}>
          <ListPreview title="Anstehende Buchungen" empty="Keine anstehenden Buchungen." accent={BEREICH_BY_KEY.fotobox.accent}>
            {upcomingBookings.map(b => (
              <PreviewRow key={b.id} title={b.title} sub={b.location || ""} right={fmtDate(b.start_date)} />
            ))}
          </ListPreview>
        </BereichPage>}
        {view === "hochzeiten" && weddingUnlocked && <BereichPage bereich={BEREICH_BY_KEY.hochzeiten} loading={loading} onAdd={() => setQuickAddTarget("hochzeiten")}>
          <ListPreview title="Anstehende Hochzeiten" empty="Keine anstehenden Hochzeiten." accent={BEREICH_BY_KEY.hochzeiten.accent}>
            {upcomingWeddings.map(h => (
              <PreviewRow key={h.id} title={`${h.data.partner1 || "?"} & ${h.data.partner2 || "?"}`} sub={h.data.feierAdresse || h.data.trauungAdresse || ""} right={fmtDate(h.data.hochzeitsDatum)} />
            ))}
          </ListPreview>
        </BereichPage>}
        {view === "grafik" && <BereichPage bereich={BEREICH_BY_KEY.grafik} loading={loading} onAdd={() => setQuickAddTarget("grafik")}>
          <SearchBox value={grafikSearch} onChange={setGrafikSearch} placeholder="Suche nach Name, Kontakt, Notiz, Person…" />
          <ListPreview title="Offene Grafik-Jobs" empty={grafikSearch ? "Keine Treffer für diese Suche." : "Keine offenen Jobs."} accent={BEREICH_BY_KEY.grafik.accent}>
            {visibleGrafikJobs.map(j => (
              <PreviewRow key={j.id} title={j.name} sub={j.status} right={j.date ? fmtDate(j.date) : (j.abgabe ? "AB " + fmtDate(j.abgabe) : "")} />
            ))}
          </ListPreview>
          <div style={{ marginTop: 14 }}>
            <EmptyNotice accent={BEREICH_BY_KEY.grafik.accent} title="Formular folgt"
              text="Die Liste zeigt die bestehenden Grafik-Aufträge. Eigene Felder (Zuständigkeit, Deadline, Schnelleingabe) werden noch mit Philipp abgestimmt." />
          </div>
        </BereichPage>}
        {view === "messebau" && <BereichPage bereich={BEREICH_BY_KEY.messebau} loading={false} onAdd={() => setQuickAddTarget("messebau")}>
          <EmptyNotice accent={BEREICH_BY_KEY.messebau.accent} title="Noch in Abstimmung"
            text="Hier entsteht die Übersicht für Messestände: nächste Messetermine, Daten & Fakten zum Stand sowie To-Do-Listen zur Abstimmung mit Team und Kunden. Wird mit Philipp im Detail geplant." />
        </BereichPage>}
      </div>

      {/* FAB nur im Dashboard - auf den Bereichsseiten gibt es bereits den
          kontextuellen "+ Neu"-Button im Seitenkopf, ein zweiter Button wäre
          doppelt. Im Dashboard öffnet er eine kleine Auswahl, welcher
          Bereich gemeint ist. */}
      {view === "dashboard" && (
        <div onClick={() => setAddPickerOpen(p => !p)}
          style={{ position: "fixed", bottom: 26, right: 22, width: 56, height: 56, borderRadius: 28, background: Z.gold, color: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 6px 20px rgba(201,162,39,0.4)", zIndex: 40 }}>
          <i className={`ti ${addPickerOpen ? "ti-x" : "ti-plus"}`} style={{ fontSize: 24, fontWeight: 900, color: "#000" }}></i>
        </div>
      )}
      {addPickerOpen && (
        <div style={{ position: "fixed", bottom: 92, right: 22, background: Z.panel, border: `1px solid ${Z.border}`, borderRadius: 12, overflow: "hidden", zIndex: 40, minWidth: 190, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          {BEREICHE.filter(b => QUICK_ADD[b.key] && (!b.locked || weddingUnlocked)).map(b => (
            <div key={b.key} onClick={() => { setAddPickerOpen(false); b.key === "fotostudio" ? setJobModal({ mode: "new" }) : setQuickAddTarget(b.key); }}
              style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 9, cursor: "pointer", borderBottom: `1px solid ${Z.borderSoft}`, fontSize: 13, fontWeight: 600 }}>
              <i className={`ti ${b.icon}`} style={{ fontSize: 15, color: b.accent }}></i>
              {QUICK_ADD[b.key].title}
            </div>
          ))}
        </div>
      )}

      {quickAddTarget && (
        <QuickAddModal bereichKey={quickAddTarget} bereich={BEREICH_BY_KEY[quickAddTarget]} boxId={data.boxes[0]?.id}
          onClose={() => setQuickAddTarget(null)}
          onSubmit={async (row) => { await handleInsert(quickAddTarget, row); setQuickAddTarget(null); }} />
      )}

      {jobModal && (
        <JobFormModal mode={jobModal.mode} job={jobModal.job} team={team} onAiAction={applyAiAction} onChatJobsCreated={handleChatJobsCreated}
          onClose={() => setJobModal(null)}
          onSubmit={async (values) => { await handleSaveJob(values, jobModal.job?.id); setJobModal(null); }} />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 26, left: 22, maxWidth: 360, background: toast.ok ? Z.panel : "#3A1E24", border: `1.5px solid ${toast.ok ? Z.border : Z.danger}`, color: Z.text, padding: "11px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 80, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; }
      .zp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
      @media (min-width: 640px) { .zp-grid { grid-template-columns: repeat(3, 1fr); } }
      @media (min-width: 1000px) { .zp-grid { grid-template-columns: repeat(5, 1fr); } }
      .zp-nav-label { display: block; }
      @media (max-width: 640px) { .zp-nav-label { display: none; } }
      .zp-card:hover { border-color: rgba(255,255,255,0.16) !important; }
      input, select { font-family: ${FONT_BODY}; }
      ::placeholder { color: ${Z.textFaint}; }
    `}</style>
  );
}

function NavItem({ active, onClick, icon, label, accent }) {
  return (
    <div onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, paddingBottom: 10, cursor: "pointer", borderBottom: active ? `2px solid ${accent}` : "2px solid transparent", minWidth: 52 }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? accent : "transparent", border: `1.5px solid ${active ? accent : Z.border}`,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 16, color: active ? "#0C0C0D" : Z.textSoft }}></i>
      </div>
      <span className="zp-nav-label" style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? Z.text : Z.textSoft, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function Dashboard({ metrics, upcomingWeddings, openJobs, openJobsGrafik, todaysFotoJobs, upcomingBookings, loading, onNavigate, onOpenJob, team, onAiAction }) {
  const d = new Date();
  const weekday = d.toLocaleDateString("de-DE", { weekday: "long" });
  const dateStr = d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  // Wichtigste Grafik-Projekte: höchste Priorität zuerst, bei Gleichstand das
  // nähere Datum (Abgabe vor Shooting-Datum, da bei Grafik-Jobs meist relevanter).
  const topGrafikJobs = [...openJobsGrafik]
    .sort((a, b) => (PRIO_ORDER[a.prio] ?? 1) - (PRIO_ORDER[b.prio] ?? 1) || (a.abgabe || a.date || "9999").localeCompare(b.abgabe || b.date || "9999"))
    .slice(0, 4);
  return (
    <div>
      <ChatPanel context={{ team }} onAction={onAiAction} />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{weekday}, {dateStr}</div>
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>Übersicht</div>
      </div>

      {/* ── Heute: was unmittelbar ansteht, direkt oben auf der Übersicht ── */}
      <div style={{ background: Z.panel, border: `1.5px solid ${Z.gold}`, borderRadius: 14, padding: "14px 16px", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: todaysFotoJobs.length ? 10 : 0 }}>
          <i className="ti ti-sun-high" style={{ fontSize: 16, color: Z.gold }}></i>
          <div style={{ fontSize: 13, fontWeight: 800, color: Z.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>Heute</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: Z.textSoft, background: Z.panelAlt, borderRadius: 10, padding: "1px 8px" }}>{todaysFotoJobs.length}</div>
        </div>
        {todaysFotoJobs.length === 0 ? (
          <div style={{ fontSize: 13, color: Z.textFaint }}>Keine Foto-/Video-Jobs für heute eingeplant.</div>
        ) : (
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
            {todaysFotoJobs.map(j => {
              const sc = STATUS_CFG[j.status] || STATUS_CFG["Neu"];
              return (
                <div key={j.id} onClick={() => onOpenJob(j)} style={{ flexShrink: 0, minWidth: 200, maxWidth: 240, background: Z.panelAlt, border: `1px solid ${Z.border}`, borderLeft: `3px solid ${sc.color}`, borderRadius: 9, padding: "9px 12px", cursor: "pointer" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.name}</div>
                  <div style={{ fontSize: 11, color: Z.textSoft, marginTop: 2 }}>{j.status}{j.personen?.length ? " · " + j.personen.join(", ") : ""}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="zp-grid" style={{ marginBottom: 30 }}>
        <BereichCard bereich={BEREICH_BY_KEY.fotostudio} value={metrics.fotostudio} loading={loading} onClick={() => onNavigate("fotostudio")} />
        <BereichCard bereich={BEREICH_BY_KEY.grafik} value={metrics.grafik} loading={loading} onClick={() => onNavigate("grafik")} />
        <BereichCard bereich={BEREICH_BY_KEY.fotobox} value={metrics.fotobox} loading={loading} onClick={() => onNavigate("fotobox")} />
        <BereichCard bereich={BEREICH_BY_KEY.messebau} value={metrics.messebau} loading={loading} onClick={() => onNavigate("messebau")} />
        <BereichCard bereich={BEREICH_BY_KEY.hochzeiten} value={metrics.hochzeiten} loading={loading} onClick={() => onNavigate("hochzeiten")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <ListPreview title="Offene Fotostudio-Jobs" empty="Keine offenen Jobs." accent={BEREICH_BY_KEY.fotostudio.accent}>
          {openJobs.slice(0, 4).map(j => (
            <PreviewRow key={j.id} title={j.name} sub={j.status} right={j.date ? fmtDate(j.date) : ""} />
          ))}
        </ListPreview>
        <ListPreview title="Wichtigste Grafik-Projekte" empty="Keine offenen Grafik-Projekte." accent={BEREICH_BY_KEY.grafik.accent}>
          {topGrafikJobs.map(j => (
            <PreviewRow key={j.id} title={j.name} sub={`${j.prio} · ${j.status}`} right={j.abgabe ? "AB " + fmtDate(j.abgabe) : (j.date ? fmtDate(j.date) : "")} />
          ))}
        </ListPreview>
        <ListPreview title="Nächste Fotobox-Buchungen" empty="Keine anstehenden Buchungen." accent={BEREICH_BY_KEY.fotobox.accent}>
          {upcomingBookings.slice(0, 4).map(b => (
            <PreviewRow key={b.id} title={b.title} sub={b.location || ""} right={fmtDate(b.start_date)} />
          ))}
        </ListPreview>
        <ListPreview title="Nächste Messen" empty="Noch keine Messen hinterlegt – der Bereich wird mit Philipp im Detail geplant." accent={BEREICH_BY_KEY.messebau.accent} />
        <ListPreview title="Nächste Hochzeiten" empty="Keine anstehenden Hochzeiten." accent={BEREICH_BY_KEY.hochzeiten.accent}>
          {upcomingWeddings.slice(0, 4).map(h => (
            <PreviewRow key={h.id} title={`${h.data.partner1 || "?"} & ${h.data.partner2 || "?"}`} sub={h.data.feierAdresse || ""} right={fmtDate(h.data.hochzeitsDatum)} />
          ))}
        </ListPreview>
      </div>
    </div>
  );
}

function BereichCard({ bereich, value, loading, onClick }) {
  return (
    <div className="zp-card" onClick={onClick} style={{
      background: Z.panel, borderRadius: 14, padding: "20px 16px", cursor: "pointer",
      border: `1px solid ${Z.border}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10,
      transition: "border-color 0.15s",
    }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${bereich.accent}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <i className={`ti ${bereich.locked ? "ti-lock" : bereich.icon}`} style={{ fontSize: 19, color: bereich.accent }}></i>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
        {loading ? "–" : (value === null ? "—" : value)}
      </div>
      <div style={{ fontSize: 12.5, color: Z.textSoft, fontWeight: 600 }}>{bereich.short}</div>
    </div>
  );
}

function BereichPage({ bereich, loading, children, onAdd }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", border: `1.5px solid ${bereich.accent}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className={`ti ${bereich.icon}`} style={{ fontSize: 20, color: bereich.accent }}></i>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{bereich.label}</div>
        </div>
        {QUICK_ADD[bereich.key] && (
          <div onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9, background: Z.gold, color: "#1A1A1A", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            <i className="ti ti-plus" style={{ fontSize: 15, color: "#000" }}></i>{QUICK_ADD[bereich.key].title}
          </div>
        )}
      </div>
      {loading ? <div style={{ color: Z.textSoft, fontSize: 14 }}>Lädt…</div> : children}
    </div>
  );
}

function EmptyNotice({ accent, title, text }) {
  return (
    <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderRadius: 14, padding: "30px 24px", textAlign: "center" }}>
      <i className="ti ti-messages" style={{ fontSize: 28, color: accent }}></i>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 10 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: Z.textSoft, marginTop: 6, maxWidth: 420, margin: "6px auto 0", lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

function ListPreview({ title, empty, children, accent = Z.gold }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : (children ? [children] : []);
  return (
    <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${Z.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, display: "inline-block" }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.textSoft }}>{title}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "20px 16px", color: Z.textFaint, fontSize: 13.5 }}>{empty}</div>
      ) : (
        <div>{items}</div>
      )}
    </div>
  );
}

function PreviewRow({ title, sub, right }) {
  return (
    <div style={{ padding: "11px 16px", borderBottom: `1px solid ${Z.borderSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: Z.textSoft, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
      {right && <div style={{ fontSize: 11.5, fontWeight: 700, color: Z.textSoft, flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

// ─── Suche (wie in der alten Fotostudio-Jobliste: Name/Kontakt/Notizen/Personen) ──
function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: Z.textFaint }}></i>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "9px 12px 9px 36px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14, boxSizing: "border-box" }} />
      {value && (
        <i className="ti ti-x" onClick={() => onChange("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: Z.textSoft, cursor: "pointer" }}></i>
      )}
    </div>
  );
}

// ─── "Heute"-Ablage: zeigt heutige Jobs, nimmt per Drag & Drop aus der Liste
// einen Job entgegen und plant ihn für heute ein (date = heute). ──────────
function TodayDropPanel({ jobs, onOpen, onDropJob }) {
  const [over, setOver] = useState(false);
  const todaysJobs = jobs.filter(j => jobActiveOn(j, today()));
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData("text/job-id"); if (id) onDropJob(id); }}
      style={{ background: over ? "rgba(201,162,39,0.12)" : Z.panel, border: `1.5px solid ${over ? Z.gold : Z.border}`, borderRadius: 14, padding: "12px 14px", transition: "background .1s, border-color .1s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <i className="ti ti-sun-high" style={{ fontSize: 15, color: Z.gold }}></i>
        <div style={{ fontSize: 12, fontWeight: 800, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>Heute</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: Z.textSoft, background: Z.panelAlt, borderRadius: 10, padding: "1px 8px" }}>{todaysJobs.length}</div>
      </div>
      {todaysJobs.length === 0 ? (
        <div style={{ fontSize: 12.5, color: Z.textFaint }}>Keine Jobs für heute geplant – Job-Zeile aus der Liste hierher ziehen.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {todaysJobs.map(j => (
            <div key={j.id} onClick={() => onOpen(j)} style={{ fontSize: 13, fontWeight: 600, padding: "7px 10px", background: Z.panelAlt, borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Kalenderansicht (Mini-Widget: Woche/Monat, Klick auf Tag zeigt Jobs) ──
function KalenderWidget({ jobs, onOpen }) {
  const [openPanel, setOpenPanel] = useState(() => { try { return localStorage.getItem("zp-cal-open") !== "0"; } catch { return true; } });
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("zp-cal-mode") || "woche"; } catch { return "woche"; } });
  const [anchor, setAnchor] = useState(() => new Date());
  const [openDay, setOpenDay] = useState(null);
  useEffect(() => { try { localStorage.setItem("zp-cal-mode", mode); } catch {} }, [mode]);
  useEffect(() => { try { localStorage.setItem("zp-cal-open", openPanel ? "1" : "0"); } catch {} }, [openPanel]);

  const todayStr = today();
  const jobsByDate = {};
  jobs.forEach(j => {
    if (!j.date) return;
    const d = new Date(j.date + "T00:00:00");
    for (let i = 0; i < 90 && toISO(d) <= (j.date_end || j.date); i++, d.setDate(d.getDate() + 1)) {
      (jobsByDate[toISO(d)] ||= []).push(j);
    }
  });

  const isWoche = mode === "woche";
  const start = isWoche ? startOfWeek(anchor) : startOfMonthGrid(anchor);
  const days = Array.from({ length: isWoche ? 7 : 42 }, (_, i) => addDays(start, i));
  const monthAnchor = anchor.getMonth();
  const dayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const navigate = (dir) => setAnchor(a => { const n = new Date(a); if (isWoche) n.setDate(n.getDate() + dir * 7); else n.setMonth(n.getMonth() + dir); return n; });

  return (
    <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: openPanel ? 10 : 0 }}>
        <i className="ti ti-calendar" style={{ fontSize: 15, color: Z.gold }}></i>
        <div style={{ fontSize: 12, fontWeight: 800, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>Kalender</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {openPanel && <div style={{ fontSize: 11, color: Z.textSoft, fontWeight: 600 }}>{isWoche ? `KW ${isoWeek(toISO(start))}` : anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</div>}
          <i className={`ti ${openPanel ? "ti-chevron-up" : "ti-chevron-down"}`} onClick={() => setOpenPanel(o => !o)} style={{ cursor: "pointer", color: Z.textSoft, fontSize: 15 }}></i>
        </div>
      </div>
      {openPanel && (
        <>
          <div style={{ display: "flex", background: Z.panelAlt, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
            {["woche", "monat"].map(m => (
              <div key={m} onClick={() => setMode(m)} style={{ flex: 1, textAlign: "center", padding: "5px 0", cursor: "pointer", fontSize: 11, fontWeight: 700, background: mode === m ? Z.gold : "transparent", color: mode === m ? "#1A1A1A" : Z.textSoft }}>{m === "woche" ? "Woche" : "Monat"}</div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <i className="ti ti-chevron-left" onClick={() => navigate(-1)} style={{ cursor: "pointer", color: Z.textSoft, width: 24, textAlign: "center" }}></i>
            <div onClick={() => setAnchor(new Date())} style={{ flex: 1, textAlign: "center", fontSize: 11.5, fontWeight: 700, color: Z.textSoft, cursor: "pointer" }}>Heute</div>
            <i className="ti ti-chevron-right" onClick={() => navigate(1)} style={{ cursor: "pointer", color: Z.textSoft, width: 24, textAlign: "center" }}></i>
          </div>
          {!isWoche && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
              {dayLabels.map(l => <div key={l} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: Z.textFaint, textTransform: "uppercase" }}>{l}</div>)}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {days.map((d, i) => {
              const iso = toISO(d);
              const isToday = iso === todayStr;
              const inMonth = isWoche ? true : d.getMonth() === monthAnchor;
              const count = (jobsByDate[iso] || []).length;
              const isOpen = openDay === iso;
              return (
                <div key={iso + i} onClick={() => setOpenDay(isOpen ? null : iso)}
                  style={{ textAlign: "center", padding: isWoche ? "6px 1px" : "4px 1px", borderRadius: 7, cursor: "pointer", opacity: inMonth ? 1 : 0.35,
                    background: isOpen ? Z.gold : isToday ? "rgba(201,162,39,0.15)" : "transparent", border: `1.5px solid ${isToday && !isOpen ? Z.gold : "transparent"}` }}>
                  {isWoche && <div style={{ fontSize: 8, fontWeight: 600, color: isOpen ? "#1A1A1A" : Z.textFaint, textTransform: "uppercase" }}>{dayLabels[i]}</div>}
                  <div style={{ fontSize: isWoche ? 12 : 11, fontWeight: isToday ? 800 : 600, color: isOpen ? "#1A1A1A" : isToday ? Z.gold : Z.text }}>{d.getDate()}</div>
                  {count > 0 && <div style={{ width: 5, height: 5, borderRadius: "50%", background: isOpen ? "#1A1A1A" : Z.gold, margin: "3px auto 0" }} />}
                </div>
              );
            })}
          </div>
          {openDay && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
              {(jobsByDate[openDay] || []).length === 0 ? (
                <div style={{ fontSize: 11.5, color: Z.textFaint }}>Keine Jobs an diesem Tag.</div>
              ) : jobsByDate[openDay].map(j => (
                <div key={j.id} onClick={() => onOpen(j)} style={{ fontSize: 12, fontWeight: 600, color: Z.text, padding: "6px 9px", background: Z.panelAlt, borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.name}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Studio-Grundriss (Aufnahmeplätze) ─────────────────────────────────────
function StudioFloorplan({ selected = [], occupied = {}, onToggleZone, onZoneClick, height = 300 }) {
  return (
    <svg viewBox="0 0 1000 710" style={{ width: "100%", height, display: "block" }}>
      <rect x="40" y="40" width="920" height="630" fill="none" stroke={Z.border} strokeWidth="4" rx="4" />
      {STUDIO_ZONES.map(z => {
        const isSelected = selected.includes(z.id);
        const job = occupied[z.id];
        const fill = job ? "rgba(224,96,122,0.18)" : isSelected ? "rgba(201,162,39,0.18)" : Z.panelAlt;
        const stroke = job ? Z.danger : isSelected ? Z.gold : Z.border;
        const clickable = !!(onToggleZone || (job && onZoneClick));
        return (
          <g key={z.id} onClick={() => { if (onToggleZone) onToggleZone(z.id); else if (job && onZoneClick) onZoneClick(job); }} style={{ cursor: clickable ? "pointer" : "default" }}>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="10" fill={fill} stroke={stroke} strokeWidth={isSelected || job ? 3 : 2} />
            <text x={z.x + z.w / 2} y={z.y + 30} textAnchor="middle" fontSize="24" fontWeight="800" fill={job ? Z.danger : isSelected ? Z.gold : Z.textSoft}>{z.id}</text>
            {job ? (
              <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 8} textAnchor="middle" fontSize="13" fontWeight="600" fill={Z.text}>{job.name.length > 20 ? job.name.slice(0, 18) + "…" : job.name}</text>
            ) : !onToggleZone ? (
              <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 8} textAnchor="middle" fontSize="12" fill={Z.textFaint}>frei</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function StudioOccupancyWidget({ jobs, onOpen }) {
  const [openPanel, setOpenPanel] = useState(true);
  const todayStr = today();
  const occupied = {};
  jobs.forEach(j => {
    if (!jobActiveOn(j, todayStr) || j.ort === "Außer Haus" || !Array.isArray(j.stationen)) return;
    j.stationen.forEach(z => { if (!occupied[z]) occupied[z] = j; });
  });
  return (
    <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: openPanel ? 8 : 0 }}>
        <i className="ti ti-layout-grid" style={{ fontSize: 15, color: Z.gold }}></i>
        <div style={{ fontSize: 12, fontWeight: 800, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>Studio · Heute</div>
        <i className={`ti ${openPanel ? "ti-chevron-up" : "ti-chevron-down"}`} onClick={() => setOpenPanel(o => !o)} style={{ marginLeft: "auto", cursor: "pointer", color: Z.textSoft, fontSize: 15 }}></i>
      </div>
      {openPanel && (
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <StudioFloorplan occupied={occupied} onZoneClick={onOpen} height={560} />
        </div>
      )}
    </div>
  );
}

// ─── Job-Zeile Foto-/Videoproduktion ───────────────────────────────────────
// Klick auf die Zeile öffnet die Detailansicht, Klick auf den Status-Pill
// schaltet den Status direkt weiter (häufigster Alltags-Workflow).
function JobRow({ job, onOpen, onAdvance }) {
  const statusColor = STATUS_CFG[job.status]?.color || Z.textSoft;
  const kategorien = Array.isArray(job.kategorien) ? job.kategorien : [];
  const personen = Array.isArray(job.personen) ? job.personen : [];
  return (
    <div draggable onDragStart={e => e.dataTransfer.setData("text/job-id", job.id)}
      onClick={onOpen} title="Ziehen, um auf „Heute“ einzuplanen"
      style={{ padding: "12px 16px", borderBottom: `1px solid ${Z.borderSoft}`, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div onClick={e => { e.stopPropagation(); onAdvance(); }} title="Status weiterschalten"
        style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, color: statusColor, border: `1.5px solid ${statusColor}`, cursor: "pointer", whiteSpace: "nowrap" }}>
        {job.status}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
          {job.name}
          {Array.isArray(job.attachments) && job.attachments.length > 0 && (
            <span title={`${job.attachments.length} Anhang/Anhänge`} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10.5, fontWeight: 700, color: Z.textSoft, flexShrink: 0 }}>
              <i className="ti ti-paperclip" style={{ fontSize: 11 }}></i>{job.attachments.length}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: Z.textSoft, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {[job.projekttyp, kategorien.join(", "), personen.join(", ")].filter(Boolean).join(" · ")}
        </div>
      </div>
      {(job.date || job.abgabe) && (
        <div style={{ fontSize: 11.5, fontWeight: 700, color: Z.textSoft, flexShrink: 0, textAlign: "right" }}>
          {job.date ? fmtDate(job.date) : "AB " + fmtDate(job.abgabe)}
          {job.date_end && job.date_end !== job.date && <div style={{ fontWeight: 500 }}>bis {fmtDate(job.date_end)}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Passwortschutz (App-weit & Hochzeiten-Bereich) ────────────────────────
// Generische Passwortsperre, serverseitig geprüft (api/check-*-password.js),
// damit das jeweilige Passwort nie im Client-Bundle sichtbar ist. Wird zweimal
// genutzt: einmal für die gesamte App (endpoint/storageKey "app") und einmal
// speziell für den Hochzeiten-Bereich, damit externe Umsetzer zwar die App,
// aber keine Kundendaten/Preise der Hochzeiten sehen.
function PasswordGate({ endpoint, storageKey, accent, title, text, onUnlock }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Falsches Passwort");
      try { sessionStorage.setItem(storageKey, "1"); } catch {}
      onUnlock();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "60px 20px" }}>
      <div style={{ width: 54, height: 54, borderRadius: "50%", border: `1.5px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <i className="ti ti-lock" style={{ fontSize: 24, color: accent }}></i>
      </div>
      <div style={{ fontSize: 19, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: Z.textSoft, marginTop: 6, maxWidth: 360 }}>{text}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 22, width: "100%", maxWidth: 300 }}>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()} placeholder="Passwort" autoFocus
          style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14, outline: "none" }} />
        <div onClick={submit} style={{ padding: "10px 16px", borderRadius: 9, background: Z.gold, color: "#1A1A1A", fontWeight: 700, fontSize: 13, cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center" }}>
          {busy ? "…" : "OK"}
        </div>
      </div>
      {error && <div style={{ color: Z.danger, fontSize: 12.5, marginTop: 10 }}>{error}</div>}
    </div>
  );
}

// ─── Schnelleingabe-Modal ───────────────────────────────────────────────────
function QuickAddModal({ bereichKey, bereich, boxId, onClose, onSubmit }) {
  const cfg = QUICK_ADD[bereichKey];
  const [values, setValues] = useState(() => {
    const init = {};
    (cfg?.fields || []).forEach(f => { init[f.key] = f.default || ""; });
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setValues(p => ({ ...p, [k]: v }));

  if (!cfg) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderRadius: 14, padding: 24, maxWidth: 360, textAlign: "center" }}>
          <i className="ti ti-messages" style={{ fontSize: 26, color: bereich?.accent }}></i>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>Noch nicht verfügbar</div>
          <div style={{ fontSize: 13, color: Z.textSoft, marginTop: 6 }}>Das Formular für {bereich?.label || "diesen Bereich"} folgt, sobald der Bereich konzipiert ist.</div>
          <div onClick={onClose} style={{ marginTop: 16, padding: "9px 16px", borderRadius: 9, border: `1px solid ${Z.border}`, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Schließen</div>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    const missing = cfg.fields.find(f => f.required && !values[f.key]);
    if (missing) { setError(`${missing.label} fehlt`); return; }
    setBusy(true); setError("");
    try {
      const row = cfg.buildRow(values, { boxId });
      await onSubmit(row);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderBottom: "none", width: "100%", maxWidth: 480, borderRadius: "16px 16px 0 0", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${Z.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{cfg.title}</div>
          <i className="ti ti-x" onClick={onClose} style={{ fontSize: 18, color: Z.textSoft, cursor: "pointer" }}></i>
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {cfg.fields.map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 11, fontWeight: 700, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                {f.label}{f.required && " *"}
              </div>
              {f.type === "select" ? (
                <select value={values[f.key]} onChange={e => set(f.key, e.target.value)}
                  style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14 }}>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type} value={values[f.key]} onChange={e => set(f.key, e.target.value)}
                  style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14, boxSizing: "border-box" }} />
              )}
            </div>
          ))}
          {error && <div style={{ color: Z.danger, fontSize: 12.5 }}>{error}</div>}
        </div>
        <div style={{ padding: "13px 18px", borderTop: `1px solid ${Z.border}`, display: "flex", gap: 10, flexShrink: 0 }}>
          <div onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 9, border: `1.5px solid ${Z.border}`, textAlign: "center", cursor: "pointer", fontSize: 14, fontWeight: 600, color: Z.textSoft }}>Abbrechen</div>
          <div onClick={handleSubmit} style={{ flex: 2, padding: 12, borderRadius: 9, background: Z.gold, color: "#1A1A1A", textAlign: "center", cursor: busy ? "wait" : "pointer", fontSize: 14, fontWeight: 700 }}>
            {busy ? "Speichert…" : "Hinzufügen"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KI-Chat ────────────────────────────────────────────────────────────
// Freitext-Schnittstelle zur Claude-Anbindung (api/ai-chat.js): legt per
// Werkzeug-Aufruf Jobs/Buchungen/Hochzeiten an bzw. aktualisiert (im
// Job-Kontext) den aktuellen Job, und beantwortet Auswertungsfragen anhand
// der live geladenen Daten. "context" transportiert dabei, in welchem
// Bereich/Job der Chat gerade genutzt wird.
function ChatPanel({ context, onAction, compact }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setMessages(m => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "KI-Anfrage fehlgeschlagen");
      setMessages(m => [...m, { role: "assistant", text: result.reply }]);
      if (result.action && onAction) onAction(result.action);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderRadius: 14, padding: compact ? 14 : 18, marginBottom: compact ? 0 : 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <i className="ti ti-sparkles" style={{ fontSize: 16, color: Z.gold }}></i>
        <div style={{ fontSize: compact ? 12 : 13.5, fontWeight: 700, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {compact ? "KI zu diesem Job" : "KI-Assistent"}
        </div>
      </div>
      {messages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, maxHeight: 220, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%",
              background: m.role === "user" ? Z.gold : Z.panelAlt, color: m.role === "user" ? "#1A1A1A" : Z.text,
              padding: "8px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap",
            }}>{m.text}</div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
          placeholder={compact ? "z.B. Status auf Abgeschlossen setzen…" : "Job anlegen oder nach Auswertung fragen…"}
          style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14, outline: "none" }} />
        <div onClick={send} style={{ padding: "10px 16px", borderRadius: 9, background: Z.gold, color: "#1A1A1A", fontWeight: 700, fontSize: 13, cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 42 }}>
          {busy ? "…" : <i className="ti ti-send" style={{ fontSize: 15, color: "#000" }}></i>}
        </div>
      </div>
      {error && <div style={{ color: Z.danger, fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{children}</div>;
}

function ChipSelect({ options, selected, onToggle, accent = Z.gold }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {options.map(o => {
        const active = selected.includes(o);
        return (
          <div key={o} onClick={() => onToggle(o)} style={{
            padding: "6px 12px", borderRadius: 16, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            border: `1.5px solid ${active ? accent : Z.border}`, background: active ? accent : "transparent", color: active ? "#1A1A1A" : Z.textSoft,
          }}>{o}</div>
        );
      })}
    </div>
  );
}

// ─── KI-Erfassung für die Job-Neuanlage ────────────────────────────────────
// Freitext, Diktat (Web Speech API) und/oder ein angehängtes Foto/PDF/Excel
// gehen an api/parse-input.js (Claude), das daraus einen oder mehrere Jobs
// direkt anlegt. Übernommen aus der alten Fotostudio-Jobliste (ChatCapture).
function ChatCapture({ team, onCreated }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [listening, setListening] = useState(false);
  const [stage, setStage] = useState(null); // null | 0 | 1 | 2 | "done" | "error"
  const [errorMsg, setErrorMsg] = useState("");
  const recognitionRef = useRef(null);
  const timersRef = useRef([]);

  const speechSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const busy = stage !== null && stage !== "error" && stage !== "done";

  useEffect(() => () => {
    recognitionRef.current?.stop();
    timersRef.current.forEach(clearTimeout);
  }, []);

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "de-DE"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let addition = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) addition += e.results[i][0].transcript + " ";
      }
      if (addition) setText(p => (p ? p + " " : "") + addition.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const handleFilePick = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
    e.target.value = "";
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !file) || busy) return;
    setErrorMsg(""); setStage(0);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [
      setTimeout(() => setStage(s => (s === 0 ? 1 : s)), 900),
      setTimeout(() => setStage(s => (s === 1 ? 2 : s)), 2400),
    ];
    try {
      let fileBase64, mediaType;
      if (file) {
        mediaType = file.type || "application/pdf";
        fileBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      const res = await fetch("/api/parse-input", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, fileBase64, mediaType, fileName: file?.name, team }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erkennung fehlgeschlagen");
      timersRef.current.forEach(clearTimeout);
      if (data.count > 0) {
        setStage("done");
        onCreated(data.jobs || []);
      } else {
        setStage("error");
        setErrorMsg("Kein Auftrag erkannt – bitte unten manuell eintragen.");
      }
    } catch (e) {
      timersRef.current.forEach(clearTimeout);
      setStage("error");
      setErrorMsg(e.message);
    }
  };

  const stageLabels = ["Lese Eingabe…", "KI analysiert…", "Job wird angelegt…"];
  const canSend = (text.trim() || file) && !busy;

  return (
    <div style={{ background: Z.panelAlt, border: `1.5px solid ${Z.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <i className="ti ti-sparkles" style={{ fontSize: 15, color: Z.gold }}></i>
        <div style={{ fontSize: 12, fontWeight: 700, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>KI-Erfassung</div>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Auftrag diktieren/einfügen (z.B. Kunden-E-Mail) oder Foto/PDF/Excel anhängen…"
        style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panel, color: Z.text, fontSize: 13.5, resize: "vertical", fontFamily: FONT_BODY, boxSizing: "border-box" }} />
      {file && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: Z.textSoft }}>
          <i className="ti ti-paperclip" style={{ fontSize: 13 }}></i>{file.name}
          <i className="ti ti-x" onClick={() => setFile(null)} style={{ fontSize: 13, cursor: "pointer" }}></i>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${Z.border}`, color: Z.textSoft, cursor: "pointer", flexShrink: 0 }}>
          <i className="ti ti-paperclip" style={{ fontSize: 15 }}></i>
          <input type="file" accept="image/*,application/pdf,.xlsx,.xls" onChange={handleFilePick} style={{ display: "none" }} />
        </label>
        {speechSupported && (
          <div onClick={toggleMic} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${listening ? Z.danger : Z.border}`, color: listening ? Z.danger : Z.textSoft, cursor: "pointer", flexShrink: 0 }}>
            <i className={`ti ${listening ? "ti-microphone" : "ti-microphone-2"}`} style={{ fontSize: 15 }}></i>
          </div>
        )}
        <div onClick={handleSend} style={{ flex: 1, padding: "9px 14px", borderRadius: 9, background: canSend ? Z.gold : Z.border, color: canSend ? "#1A1A1A" : Z.textFaint, textAlign: "center", cursor: canSend ? "pointer" : "default", fontSize: 13, fontWeight: 700 }}>
          {busy ? stageLabels[stage] || "…" : "Erkennen & anlegen"}
        </div>
      </div>
      {errorMsg && <div style={{ color: Z.danger, fontSize: 12, marginTop: 8 }}>{errorMsg}</div>}
    </div>
  );
}

// ─── Foto-/Video-Job: Neuanlage & Bearbeitung ──────────────────────────────
// Eigenes, reicheres Formular (statt der generischen Schnelleingabe), da hier
// die volle Fachlogik der alten Jobliste nachgebildet wird: Status-Pipeline,
// Projekttyp/Kategorien, Personen-Zuordnung, Shooting-Zeitraum, Ort.
function JobFormModal({ mode, job, team, onAiAction, onChatJobsCreated, onClose, onSubmit }) {
  const [v, setV] = useState(() => mode === "edit" && job ? {
    name: job.name || "", status: job.status || "Neu", prio: job.prio || "Mittel", aufwand: job.aufwand || "Mittel",
    ort: job.ort || "Im Haus", personen: Array.isArray(job.personen) ? job.personen : [],
    date: job.date || "", date_end: job.date_end || "", dauer: job.dauer || "", abgabe: job.abgabe || "",
    kontakt: job.kontakt || "", notizen: job.notizen || "", projekttyp: job.projekttyp || "Fotografie",
    kategorien: Array.isArray(job.kategorien) ? job.kategorien : [], attachments: Array.isArray(job.attachments) ? job.attachments : [],
    stationen: Array.isArray(job.stationen) ? job.stationen : [],
  } : EMPTY_JOB_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, val) => setV(p => ({ ...p, [k]: val }));
  const toggleIn = (k, item) => setV(p => ({ ...p, [k]: p[k].includes(item) ? p[k].filter(x => x !== item) : [...p[k], item] }));

  const kategorienOptions = PROJEKTTYP_CFG[v.projekttyp]?.kategorien || [];

  const handleChatAction = (action) => {
    onAiAction && onAiAction(action);
    if (action.type === "update_job" && action.row) {
      setV(p => ({ ...p, status: action.row.status ?? p.status, notizen: action.row.notizen ?? p.notizen }));
    }
  };

  // Moco-Firmen-Autocomplete beim Tippen des Jobnamens (api/moco-search.js).
  const [mocoSuggestions, setMocoSuggestions] = useState([]);
  const mocoDebounce = useRef(null);
  const handleNameChange = (val) => {
    set("name", val);
    clearTimeout(mocoDebounce.current);
    if (val.trim().length < 2) { setMocoSuggestions([]); return; }
    mocoDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/moco-search?term=${encodeURIComponent(val.trim())}`);
        const result = await res.json();
        setMocoSuggestions(res.ok ? (result.companies || []) : []);
      } catch { setMocoSuggestions([]); }
    }, 350);
  };

  // Anhänge: Upload startet sofort beim Auswählen, nicht erst beim Speichern.
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const handleAttachmentSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploadingAttachments(true);
    for (const file of files) {
      try {
        const meta = await uploadAttachment(file);
        setV(p => ({ ...p, attachments: [...(p.attachments || []), meta] }));
      } catch (err) {
        setError(`"${file.name}" konnte nicht hochgeladen werden: ${err.message}`);
      }
    }
    setUploadingAttachments(false);
  };
  const handleRemoveAttachment = async (att) => {
    try { await deleteAttachment(att.path); } catch (err) { console.error("Anhang löschen fehlgeschlagen:", err.message); }
    setV(p => ({ ...p, attachments: (p.attachments || []).filter(a => a.path !== att.path) }));
  };

  const handleSubmit = async () => {
    if (!v.name.trim()) { setError("Jobname / Kunde fehlt"); return; }
    setBusy(true); setError("");
    try {
      await onSubmit(v);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const Row = ({ children }) => <div style={{ display: "flex", gap: 12 }}>{children}</div>;
  const Col = ({ children }) => <div style={{ flex: 1, minWidth: 0 }}>{children}</div>;
  const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14, boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderBottom: "none", width: "100%", maxWidth: 520, borderRadius: "16px 16px 0 0", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${Z.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{mode === "edit" ? "Job bearbeiten" : "Neuer Job"}</div>
          <i className="ti ti-x" onClick={onClose} style={{ fontSize: 18, color: Z.textSoft, cursor: "pointer" }}></i>
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {mode === "new" && (
            <>
              <ChatCapture team={team} onCreated={jobs => { onChatJobsCreated && onChatJobsCreated(jobs); onClose(); }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: Z.textFaint, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <div style={{ flex: 1, height: 1, background: Z.border }} />
                oder manuell
                <div style={{ flex: 1, height: 1, background: Z.border }} />
              </div>
            </>
          )}
          {mode === "edit" && (
            <div>
              <FieldLabel>Status</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {STATUS_LIST.map(s => (
                  <div key={s} onClick={() => set("status", s)} style={{
                    padding: "6px 12px", borderRadius: 16, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    border: `1.5px solid ${STATUS_CFG[s].color}`, background: v.status === s ? STATUS_CFG[s].color : "transparent",
                    color: v.status === s ? "#0C0C0D" : STATUS_CFG[s].color,
                  }}>{s}</div>
                ))}
              </div>
            </div>
          )}

          {mode === "edit" && job && (
            <ChatPanel compact context={{ bereich: "fotostudio", jobId: job.id, job: { name: v.name, status: v.status, date: v.date, abgabe: v.abgabe }, team }} onAction={handleChatAction} />
          )}

          <div style={{ position: "relative" }}>
            <FieldLabel>Jobname / Kunde *</FieldLabel>
            <input type="text" value={v.name} onChange={e => handleNameChange(e.target.value)}
              onBlur={() => setTimeout(() => setMocoSuggestions([]), 150)} style={inputStyle} autoFocus />
            {mocoSuggestions.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: Z.panelAlt, border: `1px solid ${Z.border}`, borderRadius: 9, overflow: "hidden", zIndex: 5, boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}>
                <div style={{ padding: "6px 11px", fontSize: 10, fontWeight: 700, color: Z.textFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>Aus dem Moco-Firmenstamm</div>
                {mocoSuggestions.map(c => (
                  <div key={c.id} onMouseDown={() => { set("name", c.name); setMocoSuggestions([]); }}
                    style={{ padding: "8px 11px", fontSize: 13.5, cursor: "pointer", borderTop: `1px solid ${Z.borderSoft}` }}>{c.name}</div>
                ))}
              </div>
            )}
          </div>

          <Row>
            <Col>
              <FieldLabel>Projekttyp</FieldLabel>
              <select value={v.projekttyp} onChange={e => setV(p => ({ ...p, projekttyp: e.target.value, kategorien: [] }))} style={inputStyle}>
                {Object.keys(PROJEKTTYP_CFG).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Col>
            <Col>
              <FieldLabel>Ort</FieldLabel>
              <select value={v.ort} onChange={e => set("ort", e.target.value)} style={inputStyle}>
                {ORT_LIST.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Col>
          </Row>

          {v.ort === "Im Haus" && (
            <div>
              <FieldLabel>Aufnahmeplatz im Studio</FieldLabel>
              <div style={{ background: Z.panelAlt, border: `1px solid ${Z.border}`, borderRadius: 10, padding: 10 }}>
                <StudioFloorplan selected={v.stationen} onToggleZone={id => toggleIn("stationen", id)} height={320} />
              </div>
            </div>
          )}

          <div>
            <FieldLabel>Kategorien</FieldLabel>
            <ChipSelect options={kategorienOptions} selected={v.kategorien} onToggle={k => toggleIn("kategorien", k)} accent={BEREICH_BY_KEY.fotostudio.accent} />
          </div>

          <div>
            <FieldLabel>Personen</FieldLabel>
            {team.length === 0 ? (
              <div style={{ fontSize: 12.5, color: Z.textFaint }}>Kein Team hinterlegt.</div>
            ) : (
              <ChipSelect options={team} selected={v.personen} onToggle={p => toggleIn("personen", p)} accent={BEREICH_BY_KEY.fotostudio.accent} />
            )}
          </div>

          <Row>
            <Col>
              <FieldLabel>Priorität</FieldLabel>
              <select value={v.prio} onChange={e => set("prio", e.target.value)} style={inputStyle}>
                {PRIO_LIST.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Col>
            <Col>
              <FieldLabel>Aufwand</FieldLabel>
              <select value={v.aufwand} onChange={e => set("aufwand", e.target.value)} style={inputStyle}>
                {AUFWAND_LIST.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Col>
          </Row>

          <Row>
            <Col>
              <FieldLabel>Shooting-Datum</FieldLabel>
              <input type="date" value={v.date} onChange={e => set("date", e.target.value)} style={inputStyle} />
            </Col>
            <Col>
              <FieldLabel>bis (mehrtägig)</FieldLabel>
              <input type="date" value={v.date_end} onChange={e => set("date_end", e.target.value)} style={inputStyle} />
            </Col>
          </Row>

          <Row>
            <Col>
              <FieldLabel>Dauer</FieldLabel>
              <input type="text" value={v.dauer} onChange={e => set("dauer", e.target.value)} placeholder="z.B. 4 Std." style={inputStyle} />
            </Col>
            <Col>
              <FieldLabel>Deadline / Abgabe</FieldLabel>
              <input type="date" value={v.abgabe} onChange={e => set("abgabe", e.target.value)} style={inputStyle} />
            </Col>
          </Row>

          <div>
            <FieldLabel>Kontakt</FieldLabel>
            <input type="text" value={v.kontakt} onChange={e => set("kontakt", e.target.value)} style={inputStyle} />
          </div>

          <div>
            <FieldLabel>Notizen</FieldLabel>
            <textarea value={v.notizen} onChange={e => set("notizen", e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: FONT_BODY }} />
          </div>

          <div>
            <FieldLabel>Anhänge</FieldLabel>
            {(v.attachments || []).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {v.attachments.map(att => (
                  <div key={att.path} style={{ display: "flex", alignItems: "center", gap: 8, background: Z.panelAlt, border: `1px solid ${Z.border}`, borderRadius: 8, padding: "7px 10px" }}>
                    <i className="ti ti-paperclip" style={{ fontSize: 14, color: Z.textSoft }}></i>
                    <a href={att.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, color: Z.text, fontSize: 12.5, textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{att.name}</a>
                    <i className="ti ti-trash" onClick={() => handleRemoveAttachment(att)} style={{ fontSize: 14, color: Z.textSoft, cursor: "pointer" }}></i>
                  </div>
                ))}
              </div>
            )}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, border: `1.5px dashed ${Z.border}`, color: Z.textSoft, fontSize: 12.5, fontWeight: 600, cursor: uploadingAttachments ? "wait" : "pointer" }}>
              <i className="ti ti-upload" style={{ fontSize: 14 }}></i>
              {uploadingAttachments ? "Lädt hoch…" : "Bild/PDF hochladen"}
              <input type="file" accept="image/*,application/pdf" multiple onChange={handleAttachmentSelect} disabled={uploadingAttachments} style={{ display: "none" }} />
            </label>
          </div>

          {error && <div style={{ color: Z.danger, fontSize: 12.5 }}>{error}</div>}
        </div>
        <div style={{ padding: "13px 18px", borderTop: `1px solid ${Z.border}`, display: "flex", gap: 10, flexShrink: 0 }}>
          <div onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 9, border: `1.5px solid ${Z.border}`, textAlign: "center", cursor: "pointer", fontSize: 14, fontWeight: 600, color: Z.textSoft }}>Abbrechen</div>
          <div onClick={handleSubmit} style={{ flex: 2, padding: 12, borderRadius: 9, background: Z.gold, color: "#1A1A1A", textAlign: "center", cursor: busy ? "wait" : "pointer", fontSize: 14, fontWeight: 700 }}>
            {busy ? "Speichert…" : (mode === "edit" ? "Speichern" : "Anlegen")}
          </div>
        </div>
      </div>
    </div>
  );
}
