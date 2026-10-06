import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase.js";
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

function fmtDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function today() {
  return new Date().toISOString().split("T")[0];
}

// ─── Schnelleingabe: Felder & Ziel-Tabelle je Bereich ──────────────────────
const QUICK_ADD = {
  fotostudio: {
    table: "js_jobs",
    title: "Neuer Job",
    fields: [
      { key: "name", label: "Jobname / Kunde", type: "text", required: true },
      { key: "date", label: "Shooting-Datum", type: "date" },
      { key: "abgabe", label: "Deadline", type: "date" },
      { key: "prio", label: "Priorität", type: "select", options: ["Hoch", "Mittel", "Niedrig"], default: "Mittel" },
    ],
    buildRow: (v) => ({
      name: v.name, date: v.date || null, abgabe: v.abgabe || null, prio: v.prio || "Mittel",
      status: "Neu", aufwand: "Mittel", person: "", kontakt: "", notizen: "", asana_url: "", outlook_done: false,
    }),
  },
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
  const [weddingUnlocked, setWeddingUnlocked] = useState(() => {
    try { return sessionStorage.getItem("zp-wedding-unlocked") === "1"; } catch { return false; }
  });
  const [quickAddTarget, setQuickAddTarget] = useState(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [hz, js, fb, boxes] = await Promise.all([
        supabase.from("hz_hochzeiten").select("id,data,created_at"),
        supabase.from("js_jobs").select("id,name,status,date,abgabe,prio,bereich").order("created_at", { ascending: false }),
        supabase.from("fb_bookings").select("id,title,location,start_date,end_date,status").order("start_date", { ascending: true }),
        supabase.from("fb_boxes").select("id,name"),
      ]);
      if (cancelled) return;
      setData({
        hochzeiten: hz.data || [],
        fotostudioJobs: js.data || [],
        bookings: fb.data || [],
        boxes: boxes.data || [],
      });
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

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
  const upcomingBookings = data.bookings
    .filter(b => b.start_date >= t && b.status !== "storniert")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const metrics = { hochzeiten: upcomingWeddings.length, fotostudio: openJobs.length, fotobox: upcomingBookings.length, grafik: openJobsGrafik.length, messebau: null };

  const handleInsert = async (bereichKey, row) => {
    const cfg = QUICK_ADD[bereichKey];
    const { data: inserted, error } = await supabase.from(cfg.table).insert([row]).select().single();
    if (error) throw error;
    setData(p => {
      if (bereichKey === "fotostudio") return { ...p, fotostudioJobs: [inserted, ...p.fotostudioJobs] };
      if (bereichKey === "fotobox") return { ...p, bookings: [...p.bookings, inserted].sort((a, b) => a.start_date.localeCompare(b.start_date)) };
      if (bereichKey === "hochzeiten") return { ...p, hochzeiten: [...p.hochzeiten, inserted] };
      return p;
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: Z.bg, fontFamily: FONT_BODY, color: Z.text }}>
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
          <Dashboard metrics={metrics} upcomingWeddings={upcomingWeddings} openJobs={openJobs} upcomingBookings={upcomingBookings} loading={loading} onNavigate={setView} />
        )}
        {view === "hochzeiten" && !weddingUnlocked && (
          <PasswordGate onUnlock={() => setWeddingUnlocked(true)} />
        )}
        {view === "fotostudio" && <BereichPage bereich={BEREICH_BY_KEY.fotostudio} loading={loading} onAdd={() => setQuickAddTarget("fotostudio")}>
          <ListPreview title="Offene Jobs" empty="Keine offenen Jobs." accent={BEREICH_BY_KEY.fotostudio.accent}>
            {openJobs.map(j => (
              <PreviewRow key={j.id} title={j.name} sub={j.status} right={j.date ? fmtDate(j.date) : (j.abgabe ? "AB " + fmtDate(j.abgabe) : "")} />
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
          <ListPreview title="Offene Grafik-Jobs" empty="Keine offenen Jobs." accent={BEREICH_BY_KEY.grafik.accent}>
            {openJobsGrafik.map(j => (
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
            <div key={b.key} onClick={() => { setAddPickerOpen(false); setQuickAddTarget(b.key); }}
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
    </div>
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

function Dashboard({ metrics, upcomingWeddings, openJobs, upcomingBookings, loading, onNavigate }) {
  const d = new Date();
  const weekday = d.toLocaleDateString("de-DE", { weekday: "long" });
  const dateStr = d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{weekday}, {dateStr}</div>
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>Übersicht</div>
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
        <ListPreview title="Nächste Fotobox-Buchungen" empty="Keine anstehenden Buchungen." accent={BEREICH_BY_KEY.fotobox.accent}>
          {upcomingBookings.slice(0, 4).map(b => (
            <PreviewRow key={b.id} title={b.title} sub={b.location || ""} right={fmtDate(b.start_date)} />
          ))}
        </ListPreview>
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

// ─── Passwortschutz für den Hochzeiten-Bereich ─────────────────────────────
// Die Übersichtsseite zeigt anstehende Hochzeiten bewusst weiterhin offen an
// (siehe Dashboard) - nur der eigentliche Bereich mit allen Details ist
// gesperrt, damit externe Umsetzer keinen Zugriff auf Kundendaten/Preise haben.
// Der Vergleich läuft serverseitig (api/check-wedding-password.js), damit das
// Passwort nicht im Client-Bundle sichtbar ist.
function PasswordGate({ onUnlock }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/check-wedding-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Falsches Passwort");
      try { sessionStorage.setItem("zp-wedding-unlocked", "1"); } catch {}
      onUnlock();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "60px 20px" }}>
      <div style={{ width: 54, height: 54, borderRadius: "50%", border: `1.5px solid ${BEREICH_BY_KEY.hochzeiten.accent}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <i className="ti ti-lock" style={{ fontSize: 24, color: BEREICH_BY_KEY.hochzeiten.accent }}></i>
      </div>
      <div style={{ fontSize: 19, fontWeight: 700 }}>Geschützter Bereich</div>
      <div style={{ fontSize: 13.5, color: Z.textSoft, marginTop: 6, maxWidth: 360 }}>
        Der Hochzeiten-Bereich ist passwortgeschützt. Bitte Passwort eingeben, um fortzufahren.
      </div>
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
