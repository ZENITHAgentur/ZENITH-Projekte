import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase.js";

// ─── ZENITH Projekte – Design-System ──────────────────────────────────────
// Markenfarben lt. Vorgabe: Gold #C9A227, Dunkel #1A1A1A. Bewusst kein
// cleanes Minimal-Weiß als Grundfläche, sondern ein warmer Ivory-Ton mit
// edlem Serifen-Headline-Font (Fraunces), damit es "markant und edel" wirkt
// statt wie ein generisches Admin-Dashboard. Jeder Bereich bekommt zusätzlich
// eine eigene Akzentfarbe, damit er optisch eindeutig erkennbar bleibt,
// während Navigation/Karten/Typografie überall gleich bleiben ("aus einem Guss").
const Z = {
  gold: "#C9A227",
  goldLight: "#E0BE5C",
  goldPale: "#FAF6EC",
  dark: "#1A1A1A",
  darkSoft: "#2A2724",
  ivory: "#F7F3EA",
  ivoryDeep: "#EFE8D8",
  line: "#E3DAC4",
  text: "#241F18",
  textSoft: "#6B6354",
  white: "#FFFFFF",
};
const FONT_DISPLAY = "'Fraunces', Georgia, serif";
const FONT_BODY = "'Inter', system-ui, sans-serif";
const PAGE_MAX = 1280;

const BEREICHE = [
  { key: "hochzeiten", label: "Hochzeiten", icon: "ti-heart", accent: "#B8616B", bg: "#F7E9EA" },
  { key: "fotostudio", label: "Fotostudio-Jobs", icon: "ti-camera", accent: "#3A6B8A", bg: "#E9F0F5" },
  { key: "fotobox", label: "Fotobox", icon: "ti-device-camera-phone", accent: "#C27A2E", bg: "#F6EBDB" },
  { key: "grafik", label: "Grafik", icon: "ti-palette", accent: "#7D4FA0", bg: "#EFE6F5" },
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

export default function App() {
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    hochzeiten: [], fotostudioJobs: [], bookings: [],
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [hz, js, fb] = await Promise.all([
        supabase.from("hz_hochzeiten").select("id,data,created_at"),
        supabase.from("js_jobs").select("id,name,status,date,abgabe").order("created_at", { ascending: false }),
        supabase.from("fb_bookings").select("id,title,location,start_date,end_date,status"),
      ]);
      if (cancelled) return;
      setData({
        hochzeiten: hz.data || [],
        fotostudioJobs: js.data || [],
        bookings: fb.data || [],
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
  const openJobs = data.fotostudioJobs.filter(j => !["Abgeschlossen", "Archiviert", "Fertig"].includes(j.status));
  const upcomingBookings = data.bookings
    .filter(b => b.start_date >= t && b.status !== "storniert")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const metrics = {
    hochzeiten: upcomingWeddings.length,
    fotostudio: openJobs.length,
    fotobox: upcomingBookings.length,
    grafik: null,
  };

  return (
    <div style={{ minHeight: "100vh", background: Z.ivory, fontFamily: FONT_BODY, color: Z.text }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        .zp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        @media (min-width: 760px) { .zp-grid { grid-template-columns: repeat(4, 1fr); } }
        .zp-nav-label { display: inline; }
        @media (max-width: 560px) { .zp-nav-label { display: none; } }
        .zp-card { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .zp-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(26,26,26,0.14); }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: Z.dark, borderBottom: `3px solid ${Z.gold}` }}>
        <div style={{ maxWidth: PAGE_MAX, margin: "0 auto", padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, color: Z.white, letterSpacing: "0.01em" }}>ZENITH</span>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontStyle: "italic", color: Z.gold }}>Projekte</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#C9C2B0", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80", display: "inline-block" }} />
            Live
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div style={{ background: Z.white, borderBottom: `1px solid ${Z.line}`, position: "sticky", top: 0, zIndex: 20, boxShadow: "0 2px 10px rgba(26,26,26,0.05)" }}>
        <div style={{ maxWidth: PAGE_MAX, margin: "0 auto", padding: "0 20px", display: "flex", gap: 4, overflowX: "auto" }}>
          <NavItem active={view === "dashboard"} onClick={() => setView("dashboard")} icon="ti-layout-dashboard" label="Übersicht" accent={Z.gold} />
          {BEREICHE.map(b => (
            <NavItem key={b.key} active={view === b.key} onClick={() => setView(b.key)} icon={b.icon} label={b.label} accent={b.accent} />
          ))}
        </div>
      </div>

      <div style={{ maxWidth: PAGE_MAX, margin: "0 auto", padding: "28px 20px 60px" }}>
        {view === "dashboard" && (
          <Dashboard metrics={metrics} upcomingWeddings={upcomingWeddings} openJobs={openJobs} upcomingBookings={upcomingBookings} loading={loading} onNavigate={setView} />
        )}
        {view === "hochzeiten" && <BereichPlaceholder bereich={BEREICHE[0]} loading={loading}>
          <ListPreview title="Anstehende Hochzeiten" empty="Keine anstehenden Hochzeiten.">
            {upcomingWeddings.map(h => (
              <PreviewRow key={h.id} title={`${h.data.partner1 || "?"} & ${h.data.partner2 || "?"}`} sub={h.data.feierAdresse || h.data.trauungAdresse || ""} right={fmtDate(h.data.hochzeitsDatum)} />
            ))}
          </ListPreview>
        </BereichPlaceholder>}
        {view === "fotostudio" && <BereichPlaceholder bereich={BEREICHE[1]} loading={loading}>
          <ListPreview title="Offene Jobs" empty="Keine offenen Jobs.">
            {openJobs.slice(0, 10).map(j => (
              <PreviewRow key={j.id} title={j.name} sub={j.status} right={j.date ? fmtDate(j.date) : (j.abgabe ? "AB " + fmtDate(j.abgabe) : "")} />
            ))}
          </ListPreview>
        </BereichPlaceholder>}
        {view === "fotobox" && <BereichPlaceholder bereich={BEREICHE[2]} loading={loading}>
          <ListPreview title="Anstehende Buchungen" empty="Keine anstehenden Buchungen.">
            {upcomingBookings.map(b => (
              <PreviewRow key={b.id} title={b.title} sub={b.location || ""} right={fmtDate(b.start_date)} />
            ))}
          </ListPreview>
        </BereichPlaceholder>}
        {view === "grafik" && <BereichPlaceholder bereich={BEREICHE[3]} loading={false}>
          <div style={{ background: Z.white, border: `1.5px solid ${Z.line}`, borderRadius: 14, padding: "28px 24px", textAlign: "center" }}>
            <i className="ti ti-messages" style={{ fontSize: 30, color: BEREICHE[3].accent }}></i>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, marginTop: 10 }}>Noch in Abstimmung</div>
            <div style={{ fontSize: 14, color: Z.textSoft, marginTop: 6, maxWidth: 420, margin: "6px auto 0" }}>
              Der Grafik-Bereich (Aufträge, Status, Zuständigkeit, Deadline) wird noch mit Philipp abgestimmt, bevor er hier konzipiert wird.
            </div>
          </div>
        </BereichPlaceholder>}
      </div>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, accent }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 7, padding: "14px 14px 12px", cursor: "pointer",
      borderBottom: active ? `2.5px solid ${accent}` : "2.5px solid transparent",
      color: active ? Z.text : Z.textSoft, fontWeight: active ? 700 : 500, fontSize: 13.5, whiteSpace: "nowrap",
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 16, color: active ? accent : Z.textSoft }}></i>
      <span className="zp-nav-label">{label}</span>
    </div>
  );
}

function Dashboard({ metrics, upcomingWeddings, openJobs, upcomingBookings, loading, onNavigate }) {
  const d = new Date();
  const weekday = d.toLocaleDateString("de-DE", { weekday: "long" });
  const dateStr = d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{weekday}, {dateStr}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 600, marginTop: 4 }}>Willkommen zurück</div>
      </div>

      <div className="zp-grid" style={{ marginBottom: 36 }}>
        {BEREICHE.map(b => (
          <BereichCard key={b.key} bereich={b} value={metrics[b.key]} loading={loading} onClick={() => onNavigate(b.key)} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <ListPreview title="Nächste Hochzeiten" empty="Keine anstehenden Hochzeiten." accent={BEREICHE[0].accent}>
          {upcomingWeddings.slice(0, 4).map(h => (
            <PreviewRow key={h.id} title={`${h.data.partner1 || "?"} & ${h.data.partner2 || "?"}`} sub={h.data.feierAdresse || ""} right={fmtDate(h.data.hochzeitsDatum)} />
          ))}
        </ListPreview>
        <ListPreview title="Offene Fotostudio-Jobs" empty="Keine offenen Jobs." accent={BEREICHE[1].accent}>
          {openJobs.slice(0, 4).map(j => (
            <PreviewRow key={j.id} title={j.name} sub={j.status} right={j.date ? fmtDate(j.date) : ""} />
          ))}
        </ListPreview>
        <ListPreview title="Nächste Fotobox-Buchungen" empty="Keine anstehenden Buchungen." accent={BEREICHE[2].accent}>
          {upcomingBookings.slice(0, 4).map(b => (
            <PreviewRow key={b.id} title={b.title} sub={b.location || ""} right={fmtDate(b.start_date)} />
          ))}
        </ListPreview>
      </div>
    </div>
  );
}

function BereichCard({ bereich, value, loading, onClick }) {
  return (
    <div className="zp-card" onClick={onClick} style={{
      background: Z.white, borderRadius: 16, padding: "20px 18px", cursor: "pointer",
      border: `1.5px solid ${Z.line}`, borderTop: `4px solid ${bereich.accent}`,
      boxShadow: "0 2px 10px rgba(26,26,26,0.06)",
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: bereich.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <i className={`ti ${bereich.icon}`} style={{ fontSize: 19, color: bereich.accent }}></i>
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 32, fontWeight: 600, lineHeight: 1 }}>
        {loading ? "–" : (value === null ? "—" : value)}
      </div>
      <div style={{ fontSize: 13, color: Z.textSoft, marginTop: 6, fontWeight: 600 }}>{bereich.label}</div>
    </div>
  );
}

function BereichPlaceholder({ bereich, loading, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: bereich.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className={`ti ${bereich.icon}`} style={{ fontSize: 22, color: bereich.accent }}></i>
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 600 }}>{bereich.label}</div>
      </div>
      {loading ? <div style={{ color: Z.textSoft, fontSize: 14 }}>Lädt…</div> : children}
    </div>
  );
}

function ListPreview({ title, empty, children, accent = Z.gold }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : (children ? [children] : []);
  return (
    <div style={{ background: Z.white, border: `1.5px solid ${Z.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", borderBottom: `1.5px solid ${Z.line}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "20px 16px", color: Z.textSoft, fontSize: 13.5 }}>{empty}</div>
      ) : (
        <div>{items}</div>
      )}
    </div>
  );
}

function PreviewRow({ title, sub, right }) {
  return (
    <div style={{ padding: "11px 16px", borderBottom: `1px solid ${Z.ivoryDeep}`, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: Z.textSoft, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
      {right && <div style={{ fontSize: 11.5, fontWeight: 700, color: Z.textSoft, flexShrink: 0 }}>{right}</div>}
    </div>
  );
}
