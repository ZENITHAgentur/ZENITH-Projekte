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
// ─── Fachlogik Grafik/Nachbearbeitung ──────────────────────────────────────
// Bewusst schlanker als Foto/Video: speziell für Grafik-Mitarbeiter/
// Mediengestalter, die wissen müssen, wo die Daten liegen, was genau zu tun
// ist, wie viele Fotos/Videos betroffen sind, wann es losgeht/fertig sein
// muss, wer dran arbeitet und wie viele Stunden budgetiert sind.
const GRAFIK_STATUS_LIST = ["Neu", "In Bearbeitung", "Fertig", "Archiviert"];
const GRAFIK_STATUS_CFG = {
  "Neu": { color: "#4ADE80" },
  "In Bearbeitung": { color: "#4F9CDB" },
  "Fertig": { color: "#9A968C" },
  "Archiviert": { color: "#A66FE0" },
};
const GRAFIK_AUFTRAGSART_LIST = ["Bildbearbeitung", "Anzeige", "Nachbestellung", "Katalog", "Sonstiges"];
const EMPTY_GRAFIK_JOB_FORM = {
  kunde: "", jobname: "", status: "Neu", auftragsart: "Bildbearbeitung", speicherort: "", anzahl_fotos: "", anzahl_videos: "",
  prio: "Mittel", aufwand: "Mittel", personen: [], date: "", abgabe: "", stunden_budget: "", kontakt: "", notizen: "", attachments: [],
};
const PRIO_LIST = ["Hoch", "Mittel", "Niedrig"];
const PRIO_ORDER = { "Hoch": 0, "Mittel": 1, "Niedrig": 2 };
// Ampel: eindeutige Dringlichkeits-Farben wie eine echte Verkehrsampel.
const PRIO_CFG = {
  "Hoch": { color: "#E0607A" },
  "Mittel": { color: "#E0BE5C" },
  "Niedrig": { color: "#4ADE80" },
};
const AUFWAND_LIST = ["Klein", "Mittel", "Groß"];
// Aufwand: keine Farbcodierung, sondern Balken-Füllstand (1/2/3).
const AUFWAND_CFG = { "Klein": { level: 1 }, "Mittel": { level: 2 }, "Groß": { level: 3 } };
const GROUP_CFG = { prio: { list: () => PRIO_LIST, label: "Priorität" }, aufwand: { list: () => AUFWAND_LIST, label: "Aufwand" } };
const ORT_LIST = ["Im Haus", "Außer Haus"];
const PROJEKTTYP_CFG = {
  "Fotografie": { icon: "ti-camera", kategorien: ["Freistellerfotos", "Milieufotos", "Porträtfotos", "Produktfotos", "Reportage", "Sonstiges"] },
  "Video": { icon: "ti-movie", kategorien: ["Imagefilm", "Produktvideo", "Social Media Clip", "Reels / TikTok", "Interview", "Sonstiges"] },
};
const EMPTY_JOB_FORM = {
  kunde: "", jobname: "", status: "Neu", prio: "Mittel", aufwand: "Mittel", ort: "Im Haus",
  personen: [], date: "", date_end: "", dauer: "", abgabe: "", kontakt: "", notizen: "",
  projekttyp: "Fotografie", kategorien: [], attachments: [], stationen: [], equipment: [],
};

// Equipment-Katalog (Kameras, Objektive & Co.) - geräteübergreifend im Browser
// gepflegt, wie in der alten Fotostudio-Jobliste, damit er nicht pro Job neu
// eingetippt werden muss.
const EQUIPMENT_STORAGE_KEY = "zp-equipment-katalog";
function loadEquipmentCatalog() {
  try { return JSON.parse(localStorage.getItem(EQUIPMENT_STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveEquipmentCatalog(list) {
  try { localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(list)); } catch {}
}

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
// Einheitliches Namensschema im ganzen Dashboard: "Kunde | Jobname" - Kunde
// zuerst, damit Jobs in Listen/Suche sofort nach Kunde erkennbar sind.
function joinName(kunde, jobname) {
  const k = (kunde || "").trim(), j = (jobname || "").trim();
  if (k && j) return `${k} | ${j}`;
  return j || k;
}
function splitName(name) {
  const s = (name || "");
  const idx = s.indexOf(" | ");
  if (idx === -1) return { kunde: "", jobname: s };
  return { kunde: s.slice(0, idx), jobname: s.slice(idx + 3) };
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
  // Vollständiger Felderumfang 1:1 aus der alten Fotobox-Verwaltung übernommen
  // (Spalten der fb_bookings-Tabelle).
  fotobox: {
    table: "fb_bookings",
    title: "Neue Fotobox Buchung",
    fields: [
      { key: "title", label: "Titel", type: "text", required: true, section: "Basisdaten" },
      { key: "location", label: "Ort", type: "text", section: "Basisdaten" },
      { key: "start_date", label: "Start", type: "date", required: true, section: "Basisdaten" },
      { key: "end_date", label: "Ende", type: "date", section: "Basisdaten" },
      { key: "logistics", label: "Logistik", type: "select", options: ["aufbau", "abholung"], default: "aufbau", section: "Basisdaten" },
      { key: "status", label: "Status", type: "select", options: ["option", "fest", "storniert"], default: "option", section: "Basisdaten" },
      { key: "media_packages", label: "Medienpakete", type: "number", default: "1", section: "Leistungen" },
      { key: "with_printer", label: "Mit Drucker", type: "checkbox", default: true, section: "Leistungen" },
      { key: "price_net", label: "Preis (netto)", type: "number", section: "Preise" },
      { key: "custom_price", label: "Individueller Preis", type: "number", section: "Preise" },
      { key: "setup_cost", label: "Aufbaukosten", type: "number", section: "Preise" },
      { key: "invoice_status", label: "Rechnungsstatus", type: "select", options: ["keine", "gestellt", "bezahlt"], default: "keine", section: "Preise" },
      { key: "billing_company", label: "Rechnungsfirma", type: "text", section: "Rechnungsadresse" },
      { key: "billing_address", label: "Rechnungsadresse", type: "text", section: "Rechnungsadresse" },
      { key: "billing_email", label: "Rechnungs-E-Mail", type: "text", section: "Rechnungsadresse" },
      { key: "notes", label: "Notizen", type: "textarea", section: "Notizen" },
    ],
    buildRow: (v, ctx) => ({
      title: v.title, location: v.location || null, start_date: v.start_date, end_date: v.end_date || v.start_date,
      logistics: v.logistics || "aufbau", status: v.status || "option", box_id: ctx.boxId,
      media_packages: v.media_packages ? Number(v.media_packages) : 1, with_printer: !!v.with_printer,
      price_net: v.price_net ? Number(v.price_net) : null, custom_price: v.custom_price ? Number(v.custom_price) : null,
      setup_cost: v.setup_cost ? Number(v.setup_cost) : null, invoice_status: v.invoice_status || "keine",
      billing_company: v.billing_company || null, billing_address: v.billing_address || null, billing_email: v.billing_email || null,
      notes: v.notes || null,
    }),
  },
  // Vollständiger Felderumfang 1:1 aus der alten Hochzeiten-App übernommen.
  hochzeiten: {
    table: "hz_hochzeiten",
    title: "Neue Hochzeit",
    fields: [
      { key: "partner1", label: "Partner 1", type: "text", required: true, section: "Brautpaar" },
      { key: "partner2", label: "Partner 2", type: "text", section: "Brautpaar" },
      { key: "status", label: "Status", type: "select", options: ["Anfrage", "Gebucht", "Abgeschlossen", "Abgesagt"], default: "Anfrage", section: "Brautpaar" },
      { key: "telefon", label: "Telefon", type: "text", section: "Brautpaar" },
      { key: "email", label: "E-Mail", type: "text", section: "Brautpaar" },
      { key: "hochzeitsDatum", label: "Hochzeitsdatum", type: "date", section: "Trauung & Feier" },
      { key: "hochzeitsUhrzeit", label: "Uhrzeit", type: "time", section: "Trauung & Feier" },
      { key: "trauungArt", label: "Art der Trauung", type: "select", options: ["", "Standesamtliche Trauung", "Kirchliche Trauung", "Freie Trauung"], section: "Trauung & Feier" },
      { key: "trauungAdresse", label: "Adresse Trauung", type: "text", section: "Trauung & Feier" },
      { key: "feierAdresse", label: "Adresse Feier", type: "text", section: "Trauung & Feier" },
      { key: "adresse", label: "Weitere Adresse (z.B. Getting Ready)", type: "text", section: "Trauung & Feier" },
      { key: "gaeste", label: "Anzahl Gäste", type: "number", section: "Trauung & Feier" },
      { key: "paket", label: "Paket", type: "text", section: "Leistungen" },
      { key: "dauer", label: "Dauer", type: "text", section: "Leistungen" },
      { key: "gettingReady", label: "Getting Ready dabei", type: "checkbox", section: "Leistungen" },
      { key: "drohne", label: "Drohnenaufnahmen", type: "checkbox", section: "Leistungen" },
      { key: "videoArt", label: "Video-Art", type: "text", section: "Leistungen" },
      { key: "videoStunden", label: "Video-Stunden", type: "text", section: "Leistungen" },
      { key: "fotobox", label: "Fotobox dabei", type: "checkbox", section: "Leistungen" },
      { key: "fotoboxDetails", label: "Fotobox-Details", type: "text", section: "Leistungen" },
      { key: "fotobuch", label: "Fotobuch dabei", type: "checkbox", section: "Leistungen" },
      { key: "individualPreis", label: "Individueller Preis", type: "number", section: "Preise & Zahlung" },
      { key: "anzahlungBetrag", label: "Anzahlung (Betrag)", type: "number", section: "Preise & Zahlung" },
      { key: "anzahlungVereinbart", label: "Anzahlung vereinbart", type: "checkbox", section: "Preise & Zahlung" },
      { key: "angebotGewuenscht", label: "Angebot gewünscht", type: "checkbox", section: "Preise & Zahlung" },
      { key: "erstgespraechDatum", label: "Erstgespräch – Datum", type: "date", section: "Erstgespräch" },
      { key: "erstgespraechAdresse", label: "Erstgespräch – Ort", type: "text", section: "Erstgespräch" },
      { key: "notizen", label: "Notizen", type: "textarea", section: "Notizen" },
    ],
    buildRow: (v) => ({ ...v, status: v.status || "Anfrage" }),
  },
  // grafik nutzt GrafikJobFormModal (eigenes, schlankes Formular) statt
  // dieser generischen Schnelleingabe - nur der Titel wird hier für
  // Button-Label/Sichtbarkeit im Dashboard-FAB genutzt.
  grafik: { title: "Neuer Grafik-Job" },
  messebau: null,
};

export default function App() {
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ hochzeiten: [], fotostudioJobs: [], bookings: [], boxes: [] });
  const [team, setTeam] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [weddingUnlocked, setWeddingUnlocked] = useState(() => {
    try { return localStorage.getItem("zp-wedding-unlocked") === "1"; } catch { return false; }
  });
  const [appUnlocked, setAppUnlocked] = useState(() => {
    try { return localStorage.getItem("zp-app-unlocked") === "1"; } catch { return false; }
  });
  const [quickAddTarget, setQuickAddTarget] = useState(null);
  const [quickEditItem, setQuickEditItem] = useState(null);
  const [jobModal, setJobModal] = useState(null);
  const [grafikJobModal, setGrafikJobModal] = useState(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [fotoSearch, setFotoSearch] = useState("");
  const [grafikSearch, setGrafikSearch] = useState("");
  const [fotoView, setFotoView] = useState(() => { try { return localStorage.getItem("zp-foto-view") || "liste"; } catch { return "liste"; } });
  const [groupBy, setGroupBy] = useState(() => { try { return localStorage.getItem("zp-foto-groupby") || "prio"; } catch { return "prio"; } });
  const [sortMode, setSortMode] = useState(false);
  const [grafikView, setGrafikView] = useState(() => { try { return localStorage.getItem("zp-grafik-view") || "liste"; } catch { return "liste"; } });
  const [grafikGroupBy, setGrafikGroupBy] = useState(() => { try { return localStorage.getItem("zp-grafik-groupby") || "prio"; } catch { return "prio"; } });
  // Da sich Mitarbeiter keinen eigenen Zugang einloggen, kann sich jeder per
  // Klick auf seinen Namen die eigenen Jobs herausfiltern ("Meine Jobs").
  const [fotoPersonFilter, setFotoPersonFilter] = useState("Alle");
  const [grafikPersonFilter, setGrafikPersonFilter] = useState("Alle");
  useEffect(() => { try { localStorage.setItem("zp-foto-view", fotoView); } catch {} }, [fotoView]);
  useEffect(() => { try { localStorage.setItem("zp-foto-groupby", groupBy); } catch {} }, [groupBy]);
  useEffect(() => { try { localStorage.setItem("zp-grafik-view", grafikView); } catch {} }, [grafikView]);
  useEffect(() => { try { localStorage.setItem("zp-grafik-groupby", grafikGroupBy); } catch {} }, [grafikGroupBy]);

  const JOB_FIELDS = "id,name,status,date,date_end,abgabe,dauer,prio,aufwand,kontakt,notizen,projekttyp,kategorien,personen,ort,bereich,attachments,stationen,sort_order,equipment,speicherort,auftragsart,anzahl_fotos,anzahl_videos,stunden_budget";
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
      const [hz, js, fb, boxes, core, abs] = await Promise.all([
        supabase.from("hz_hochzeiten").select("id,data,created_at"),
        supabase.from("js_jobs").select(JOB_FIELDS).order("created_at", { ascending: false }),
        supabase.from("fb_bookings").select("*").order("start_date", { ascending: true }),
        supabase.from("fb_boxes").select("id,name"),
        supabase.from("core_team").select("name").order("name", { ascending: true }),
        supabase.from("js_absences").select("*").order("start_date", { ascending: true }),
      ]);
      if (cancelled) return;
      setData({
        hochzeiten: hz.data || [],
        fotostudioJobs: js.data || [],
        bookings: fb.data || [],
        boxes: boxes.data || [],
      });
      setTeam((core.data || []).map(t => t.name));
      setAbsences(abs.data || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [appUnlocked]);

  // Live-Sync: läuft ein Kollege gerade an derselben Jobliste, zieht sich die
  // Seite Änderungen automatisch nach, ohne dass neu geladen werden muss.
  useEffect(() => {
    if (!appUnlocked) return;
    const reloadJobs = () => {
      supabase.from("js_jobs").select(JOB_FIELDS).order("created_at", { ascending: false })
        .then(({ data: rows }) => { if (rows) setData(p => ({ ...p, fotostudioJobs: rows })); });
    };
    const channel = supabase.channel("js-jobs-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "js_jobs" }, reloadJobs)
      .subscribe();
    return () => { channel.unsubscribe(); };
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
  const matchesPerson = (job, person) => person === "Alle" || (Array.isArray(job.personen) && job.personen.includes(person));
  const visibleFotoJobs = openJobs.filter(j => matchesSearch(j, fotoSearch) && matchesPerson(j, fotoPersonFilter)).slice().sort((a, b) => {
    if (a.sort_order == null && b.sort_order == null) return 0;
    if (a.sort_order == null) return 1;
    if (b.sort_order == null) return -1;
    return a.sort_order - b.sort_order;
  });
  const visibleGrafikJobs = openJobsGrafik.filter(j => matchesSearch(j, grafikSearch) && matchesPerson(j, grafikPersonFilter));
  const todaysFotoJobs = openJobsAll.filter(j => j.bereich !== "Grafik" && jobActiveOn(j, t));
  const upcomingBookings = data.bookings
    .filter(b => b.start_date >= t && b.status !== "storniert")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const metrics = { hochzeiten: upcomingWeddings.length, fotostudio: openJobs.length, fotobox: upcomingBookings.length, grafik: openJobsGrafik.length, messebau: null };

  const handleInsert = async (bereichKey, row) => {
    const cfg = QUICK_ADD[bereichKey];
    const payload = bereichKey === "hochzeiten" ? { id: Date.now(), created_at: new Date().toISOString(), data: row } : row;
    const { data: inserted, error } = await supabase.from(cfg.table).insert([payload]).select().single();
    if (error) throw error;
    setData(p => {
      if (bereichKey === "fotobox") return { ...p, bookings: [...p.bookings, inserted].sort((a, b) => a.start_date.localeCompare(b.start_date)) };
      if (bereichKey === "hochzeiten") return { ...p, hochzeiten: [...p.hochzeiten, inserted] };
      return p;
    });
  };

  // Bearbeitet eine bestehende Fotobox-Buchung oder Hochzeit über dasselbe
  // Formular (Schnelleingabe dient hier zugleich als Bearbeiten-Dialog).
  const handleUpdateQuickAdd = async (bereichKey, item, row) => {
    const cfg = QUICK_ADD[bereichKey];
    const payload = bereichKey === "hochzeiten" ? { data: row } : row;
    const { data: updated, error } = await supabase.from(cfg.table).update(payload).eq("id", item.id).select().single();
    if (error) throw error;
    setData(p => {
      if (bereichKey === "fotobox") return { ...p, bookings: p.bookings.map(b => b.id === item.id ? updated : b).sort((a, b) => a.start_date.localeCompare(b.start_date)) };
      if (bereichKey === "hochzeiten") return { ...p, hochzeiten: p.hochzeiten.map(h => h.id === item.id ? updated : h) };
      return p;
    });
  };

  // Speichert einen Foto-/Video-Job (Neuanlage oder Bearbeitung bestehender Jobs)
  // inkl. der vollen Fachlogik-Felder (Status, Projekttyp/Kategorien, Personen, Ort, Zeitraum).
  const handleSaveJob = async (values, existingId) => {
    const row = {
      name: joinName(values.kunde, values.jobname), status: values.status || "Neu", prio: values.prio || "Mittel", aufwand: values.aufwand || "Mittel",
      ort: values.ort || "Im Haus", personen: values.personen || [], person: (values.personen || []).join(", "),
      date: values.date || null, date_end: values.date_end || null, dauer: values.dauer || null,
      abgabe: values.abgabe || null, kontakt: values.kontakt || "", notizen: values.notizen || "",
      projekttyp: values.projekttyp || "Fotografie", kategorien: values.kategorien || [], attachments: values.attachments || [],
      stationen: values.ort === "Außer Haus" ? [] : (values.stationen || []),
      equipment: values.equipment || [],
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

  // Speichert einen Grafik-/Nachbearbeitungs-Job - schlankere Fachlogik als
  // Foto/Video, auf Grafik-Mitarbeiter/Mediengestalter zugeschnitten.
  const handleSaveGrafikJob = async (values, existingId) => {
    const row = {
      name: joinName(values.kunde, values.jobname), status: values.status || "Neu", bereich: "Grafik",
      auftragsart: values.auftragsart || "Bildbearbeitung", speicherort: values.speicherort || null,
      anzahl_fotos: values.anzahl_fotos === "" ? null : Number(values.anzahl_fotos),
      anzahl_videos: values.anzahl_videos === "" ? null : Number(values.anzahl_videos),
      stunden_budget: values.stunden_budget === "" ? null : Number(values.stunden_budget),
      prio: values.prio || "Mittel", aufwand: values.aufwand || "Mittel",
      personen: values.personen || [], person: (values.personen || []).join(", "),
      date: values.date || null, abgabe: values.abgabe || null,
      kontakt: values.kontakt || "", notizen: values.notizen || "", attachments: values.attachments || [],
    };
    if (existingId) {
      const { data: updated, error } = await supabase.from("js_jobs").update(row).eq("id", existingId).select(JOB_FIELDS).single();
      if (error) throw error;
      setData(p => ({ ...p, fotostudioJobs: p.fotostudioJobs.map(j => j.id === existingId ? updated : j) }));
    } else {
      const { data: inserted, error } = await supabase.from("js_jobs").insert([row]).select(JOB_FIELDS).single();
      if (error) throw error;
      setData(p => ({ ...p, fotostudioJobs: [inserted, ...p.fotostudioJobs] }));
    }
  };

  const handleGrafikStatusAdvance = async (job) => {
    const idx = GRAFIK_STATUS_LIST.indexOf(job.status);
    const next = GRAFIK_STATUS_LIST[(idx + 1) % GRAFIK_STATUS_LIST.length];
    const { data: updated, error } = await supabase.from("js_jobs").update({ status: next }).eq("id", job.id).select(JOB_FIELDS).single();
    if (error) { console.error(error.message); return; }
    setData(p => ({ ...p, fotostudioJobs: p.fotostudioJobs.map(j => j.id === job.id ? updated : j) }));
  };

  // Setzt das Shooting-Datum eines Jobs auf heute - wird vom "Heute"-Ablagefeld
  // (Drag & Drop aus der Liste, siehe TodayPanel) aufgerufen.
  const handleScheduleToday = async (jobId) => {
    const t = today();
    const { data: updated, error } = await supabase.from("js_jobs").update({ date: t }).eq("id", jobId).select(JOB_FIELDS).single();
    if (error) { console.error(error.message); return; }
    setData(p => ({ ...p, fotostudioJobs: p.fotostudioJobs.map(j => j.id === jobId ? updated : j) }));
  };

  // Board-Ansicht: Karte in eine andere Spalte (Priorität oder Aufwand) ziehen
  // schreibt den jeweiligen Wert direkt auf den Job.
  const handleChangeGroupValue = async (jobId, field, value) => {
    const { data: updated, error } = await supabase.from("js_jobs").update({ [field]: value }).eq("id", jobId).select(JOB_FIELDS).single();
    if (error) { console.error(error.message); return; }
    setData(p => ({ ...p, fotostudioJobs: p.fotostudioJobs.map(j => j.id === jobId ? updated : j) }));
  };

  // Sortier-Modus (nur Listenansicht): Job-Zeile per Drag & Drop auf eine
  // andere Position ziehen, schreibt die neue Reihenfolge als sort_order.
  const handleReorderJobs = async (orderedIds) => {
    const updates = orderedIds.map((id, i) => ({ id, sort_order: i }));
    setData(p => ({ ...p, fotostudioJobs: p.fotostudioJobs.map(j => { const u = updates.find(x => x.id === j.id); return u ? { ...j, sort_order: u.sort_order } : j; }) }));
    await Promise.all(updates.map(u => supabase.from("js_jobs").update({ sort_order: u.sort_order }).eq("id", u.id)));
  };
  const handleDragReorder = (draggedId, targetId) => {
    const ids = visibleFotoJobs.map(j => j.id);
    const from = ids.indexOf(draggedId), to = ids.indexOf(targetId);
    if (from === -1 || to === -1 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    handleReorderJobs(ids);
  };

  // Abwesenheiten (für die Team-Verfügbarkeit): einfache Zeiträume pro Person.
  const handleAddAbsence = async (person, startDate, endDate) => {
    const { data: created, error } = await supabase.from("js_absences").insert([{ person, start_date: startDate, end_date: endDate }]).select().single();
    if (error) { showToast("Abwesenheit konnte nicht gespeichert werden: " + error.message, false); return; }
    setAbsences(p => [...p, created]);
  };
  const handleRemoveAbsence = async (id) => {
    const { error } = await supabase.from("js_absences").delete().eq("id", id);
    if (error) { showToast("Abwesenheit konnte nicht entfernt werden: " + error.message, false); return; }
    setAbsences(p => p.filter(a => a.id !== id));
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
            <TeamAvailabilityWidget teamNames={team} jobs={openJobs} absences={absences} onAddAbsence={handleAddAbsence} onRemoveAbsence={handleRemoveAbsence} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <StudioOccupancyWidget jobs={openJobs} onOpen={j => setJobModal({ mode: "edit", job: j })} />
          </div>
          {fotoView !== "equipment" && <SearchBox value={fotoSearch} onChange={setFotoSearch} placeholder="Suche nach Name, Kontakt, Notiz, Person…" />}
          {fotoView !== "equipment" && <PersonFilterChips team={team} value={fotoPersonFilter} onChange={setFotoPersonFilter} accent={BEREICH_BY_KEY.fotostudio.accent} />}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", background: Z.panelAlt, borderRadius: 8, overflow: "hidden" }}>
              {[["liste", "ti-list", "Liste"], ["board", "ti-layout-kanban", "Board"], ["equipment", "ti-tools", "Equipment"]].map(([key, icon, label]) => (
                <div key={key} onClick={() => setFotoView(key)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: fotoView === key ? Z.gold : "transparent", color: fotoView === key ? "#1A1A1A" : Z.textSoft }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 14 }}></i>{label}
                </div>
              ))}
            </div>
            {fotoView === "board" && (
              <div style={{ display: "flex", background: Z.panelAlt, borderRadius: 8, overflow: "hidden" }}>
                {[["prio", "Priorität"], ["aufwand", "Aufwand"]].map(([key, label]) => (
                  <div key={key} onClick={() => setGroupBy(key)}
                    style={{ padding: "7px 13px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: groupBy === key ? Z.gold : "transparent", color: groupBy === key ? "#1A1A1A" : Z.textSoft }}>
                    {label}
                  </div>
                ))}
              </div>
            )}
            {fotoView === "liste" && (
              <div onClick={() => { setSortMode(s => { const next = !s; if (next) showToast("Sortier-Modus an – Jobs per Ziehen neu anordnen"); return next; }); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: sortMode ? Z.gold : Z.panelAlt, color: sortMode ? "#1A1A1A" : Z.textSoft }}>
                <i className="ti ti-arrows-sort" style={{ fontSize: 14 }}></i>{sortMode ? "Fertig" : "Sortierung bearbeiten"}
              </div>
            )}
          </div>

          {fotoView === "board" && (
            <BoardView jobs={visibleFotoJobs} groupBy={groupBy} onOpen={j => setJobModal({ mode: "edit", job: j })} onChangeGroup={(id, val) => handleChangeGroupValue(id, groupBy, val)} />
          )}
          {fotoView === "equipment" && (
            <EquipmentView jobs={openJobs} onJobClick={j => setJobModal({ mode: "edit", job: j })} />
          )}
          {fotoView === "liste" && (
            <ListPreview title="Offene Jobs" empty={fotoSearch ? "Keine Treffer für diese Suche." : "Keine offenen Jobs."} accent={BEREICH_BY_KEY.fotostudio.accent}>
              {visibleFotoJobs.map(j => (
                <JobRow key={j.id} job={j} onOpen={() => setJobModal({ mode: "edit", job: j })} onAdvance={() => handleStatusAdvance(j)} sortMode={sortMode} onReorder={handleDragReorder} />
              ))}
            </ListPreview>
          )}
        </BereichPage>}
        {view === "fotobox" && <BereichPage bereich={BEREICH_BY_KEY.fotobox} loading={loading} onAdd={() => { setQuickEditItem(null); setQuickAddTarget("fotobox"); }}>
          <ListPreview title="Anstehende Buchungen" empty="Keine anstehenden Buchungen." accent={BEREICH_BY_KEY.fotobox.accent}>
            {upcomingBookings.map(b => (
              <PreviewRow key={b.id} title={b.title} sub={b.location || ""} right={fmtDate(b.start_date)} onClick={() => { setQuickAddTarget("fotobox"); setQuickEditItem(b); }} />
            ))}
          </ListPreview>
        </BereichPage>}
        {view === "hochzeiten" && weddingUnlocked && <BereichPage bereich={BEREICH_BY_KEY.hochzeiten} loading={loading} onAdd={() => { setQuickEditItem(null); setQuickAddTarget("hochzeiten"); }}>
          <ListPreview title="Anstehende Hochzeiten" empty="Keine anstehenden Hochzeiten." accent={BEREICH_BY_KEY.hochzeiten.accent}>
            {upcomingWeddings.map(h => (
              <PreviewRow key={h.id} title={`${h.data.partner1 || "?"} & ${h.data.partner2 || "?"}`} sub={h.data.feierAdresse || h.data.trauungAdresse || ""} right={fmtDate(h.data.hochzeitsDatum)} onClick={() => { setQuickAddTarget("hochzeiten"); setQuickEditItem(h); }} />
            ))}
          </ListPreview>
        </BereichPage>}
        {view === "grafik" && <BereichPage bereich={BEREICH_BY_KEY.grafik} loading={loading} onAdd={() => setGrafikJobModal({ mode: "new" })}>
          <SearchBox value={grafikSearch} onChange={setGrafikSearch} placeholder="Suche nach Name, Kontakt, Notiz, Person…" />
          <PersonFilterChips team={team} value={grafikPersonFilter} onChange={setGrafikPersonFilter} accent={BEREICH_BY_KEY.grafik.accent} />

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", background: Z.panelAlt, borderRadius: 8, overflow: "hidden" }}>
              {[["liste", "ti-list", "Liste"], ["board", "ti-layout-kanban", "Board"]].map(([key, icon, label]) => (
                <div key={key} onClick={() => setGrafikView(key)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: grafikView === key ? Z.gold : "transparent", color: grafikView === key ? "#1A1A1A" : Z.textSoft }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 14 }}></i>{label}
                </div>
              ))}
            </div>
            {grafikView === "board" && (
              <div style={{ display: "flex", background: Z.panelAlt, borderRadius: 8, overflow: "hidden" }}>
                {[["prio", "Priorität"], ["aufwand", "Aufwand"]].map(([key, label]) => (
                  <div key={key} onClick={() => setGrafikGroupBy(key)}
                    style={{ padding: "7px 13px", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: grafikGroupBy === key ? Z.gold : "transparent", color: grafikGroupBy === key ? "#1A1A1A" : Z.textSoft }}>
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {grafikView === "board" ? (
            <BoardView jobs={visibleGrafikJobs} groupBy={grafikGroupBy} onOpen={j => setGrafikJobModal({ mode: "edit", job: j })} onChangeGroup={(id, val) => handleChangeGroupValue(id, grafikGroupBy, val)} />
          ) : (
            <ListPreview title="Offene Grafik-Jobs" empty={grafikSearch ? "Keine Treffer für diese Suche." : "Keine offenen Jobs."} accent={BEREICH_BY_KEY.grafik.accent}>
              {visibleGrafikJobs.map(j => (
                <GrafikJobRow key={j.id} job={j} onOpen={() => setGrafikJobModal({ mode: "edit", job: j })} onAdvance={() => handleGrafikStatusAdvance(j)} />
              ))}
            </ListPreview>
          )}
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
            <div key={b.key} onClick={() => {
              setAddPickerOpen(false); setQuickEditItem(null);
              if (b.key === "fotostudio") setJobModal({ mode: "new" });
              else if (b.key === "grafik") setGrafikJobModal({ mode: "new" });
              else setQuickAddTarget(b.key);
            }}
              style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 9, cursor: "pointer", borderBottom: `1px solid ${Z.borderSoft}`, fontSize: 13, fontWeight: 600 }}>
              <i className={`ti ${b.icon}`} style={{ fontSize: 15, color: b.accent }}></i>
              {QUICK_ADD[b.key].title}
            </div>
          ))}
        </div>
      )}

      {quickAddTarget && (
        <QuickAddModal bereichKey={quickAddTarget} bereich={BEREICH_BY_KEY[quickAddTarget]} boxId={data.boxes[0]?.id} item={quickEditItem}
          onClose={() => { setQuickAddTarget(null); setQuickEditItem(null); }}
          onSubmit={async (row) => {
            if (quickEditItem) await handleUpdateQuickAdd(quickAddTarget, quickEditItem, row);
            else await handleInsert(quickAddTarget, row);
            setQuickAddTarget(null); setQuickEditItem(null);
          }} />
      )}

      {jobModal && (
        <JobFormModal mode={jobModal.mode} job={jobModal.job} team={team} onAiAction={applyAiAction} onChatJobsCreated={handleChatJobsCreated}
          onClose={() => setJobModal(null)}
          onSubmit={async (values) => { await handleSaveJob(values, jobModal.job?.id); setJobModal(null); }} />
      )}

      {grafikJobModal && (
        <GrafikJobFormModal mode={grafikJobModal.mode} job={grafikJobModal.job} team={team} onChatJobsCreated={handleChatJobsCreated}
          onClose={() => setGrafikJobModal(null)}
          onSubmit={async (values) => { await handleSaveGrafikJob(values, grafikJobModal.job?.id); setGrafikJobModal(null); }} />
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

function PreviewRow({ title, sub, right, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: "11px 16px", borderBottom: `1px solid ${Z.borderSoft}`, display: "flex", alignItems: "center", gap: 10, cursor: onClick ? "pointer" : "default" }}>
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

// ─── "Meine Jobs"-Filter: da sich Mitarbeiter keinen eigenen Zugang einloggen,
// kann sich jeder per Klick auf seinen Namen die eigenen Jobs herausfiltern. ──
function PersonFilterChips({ team, value, onChange, accent }) {
  if (!team.length) return null;
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
      {["Alle", ...team].map(p => (
        <div key={p} onClick={() => onChange(p)} style={{
          padding: "5px 12px", borderRadius: 14, fontSize: 12, fontWeight: 700, cursor: "pointer",
          border: `1.5px solid ${value === p ? accent : Z.border}`, background: value === p ? accent : "transparent",
          color: value === p ? "#0C0C0D" : Z.textSoft,
        }}>{p}</div>
      ))}
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

function isAbsentOn(absences, person, iso) {
  return absences.some(a => a.person === person && a.start_date <= iso && iso <= a.end_date);
}

// ─── Team-Verfügbarkeit: zeigt für jede Person Heute/Morgen/Übermorgen, ob sie
// abwesend, auf einen Job gebucht oder frei ist - plus Abwesenheiten eintragen.
function TeamAvailabilityWidget({ teamNames, jobs, absences, onAddAbsence, onRemoveAbsence }) {
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formPerson, setFormPerson] = useState(teamNames[0] || "");
  const [formStart, setFormStart] = useState(today());
  const [formEnd, setFormEnd] = useState(today());

  const days = [0, 1, 2].map(n => addDays(new Date(), n));
  const dayLabels = ["Heute", "Morgen", "Übermorgen"];
  const jobsFor = (person, iso) => jobs.filter(j => j.date === iso && Array.isArray(j.personen) && j.personen.includes(person));
  const activeAbsences = absences.filter(a => a.end_date >= today()).sort((a, b) => a.start_date.localeCompare(b.start_date));

  const submitAbsence = async () => {
    if (!formPerson || !formStart || !formEnd) return;
    await onAddAbsence(formPerson, formStart, formEnd);
    setShowForm(false);
  };

  return (
    <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: open ? 10 : 0 }}>
        <i className="ti ti-users" style={{ fontSize: 15, color: Z.gold }}></i>
        <div style={{ fontSize: 12, fontWeight: 800, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>Team-Verfügbarkeit</div>
        <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"}`} onClick={() => setOpen(o => !o)} style={{ marginLeft: "auto", cursor: "pointer", color: Z.textSoft, fontSize: 15 }}></i>
      </div>
      {open && (
        teamNames.length === 0 ? (
          <div style={{ fontSize: 12.5, color: Z.textFaint }}>Noch keine Teammitglieder.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 28px 28px", gap: 4, marginBottom: 4 }}>
              <div />
              {dayLabels.map(l => <div key={l} title={l} style={{ textAlign: "center", fontSize: 8.5, fontWeight: 700, color: Z.textFaint, textTransform: "uppercase" }}>{l.slice(0, 2)}</div>)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {teamNames.map(person => (
                <div key={person} style={{ display: "grid", gridTemplateColumns: "1fr 28px 28px 28px", gap: 4, alignItems: "center" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person}</div>
                  {days.map(d => {
                    const iso = toISO(d);
                    const absent = isAbsentOn(absences, person, iso);
                    const booked = jobsFor(person, iso);
                    const cell = absent
                      ? { bg: Z.panelAlt, color: Z.textFaint, icon: "ti-moon", title: "Abwesend" }
                      : booked.length > 0
                        ? { bg: "rgba(79,156,219,0.18)", color: "#4F9CDB", icon: "ti-camera", title: booked.map(j => j.name).join(", ") }
                        : { bg: "rgba(74,222,128,0.15)", color: "#4ADE80", icon: "ti-check", title: "Verfügbar" };
                    return (
                      <div key={iso} title={`${person} · ${cell.title}`} style={{ width: 22, height: 22, borderRadius: 6, background: cell.bg, color: cell.color, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                        <i className={`ti ${cell.icon}`} style={{ fontSize: 11 }}></i>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {activeAbsences.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {activeAbsences.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: Z.textSoft }}>
                    <span>{a.person}: {fmtDate(a.start_date)}–{fmtDate(a.end_date)}</span>
                    <i className="ti ti-x" onClick={() => onRemoveAbsence(a.id)} style={{ cursor: "pointer", color: Z.danger }}></i>
                  </div>
                ))}
              </div>
            )}

            {showForm ? (
              <div style={{ marginTop: 10, padding: 8, background: Z.panelAlt, borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <select value={formPerson} onChange={e => setFormPerson(e.target.value)} style={{ padding: "6px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${Z.border}`, background: Z.panel, color: Z.text }}>
                  {teamNames.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="date" value={formStart} onChange={e => setFormStart(e.target.value)} style={{ padding: "6px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${Z.border}`, background: Z.panel, color: Z.text, flex: 1 }} />
                  <input type="date" value={formEnd} onChange={e => setFormEnd(e.target.value)} style={{ padding: "6px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${Z.border}`, background: Z.panel, color: Z.text, flex: 1 }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div onClick={() => setShowForm(false)} style={{ flex: 1, textAlign: "center", padding: "6px", borderRadius: 6, background: Z.panel, border: `1px solid ${Z.border}`, fontSize: 11, fontWeight: 700, color: Z.textSoft, cursor: "pointer" }}>Abbrechen</div>
                  <div onClick={submitAbsence} style={{ flex: 1, textAlign: "center", padding: "6px", borderRadius: 6, background: Z.gold, color: "#1A1A1A", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Eintragen</div>
                </div>
              </div>
            ) : (
              <div onClick={() => { setFormPerson(teamNames[0] || ""); setFormStart(today()); setFormEnd(today()); setShowForm(true); }}
                style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: Z.textSoft, cursor: "pointer" }}>
                <i className="ti ti-plus" style={{ fontSize: 11, marginRight: 4 }}></i>Abwesenheit eintragen
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

// ─── Prio-Ampel (klares Ampelsystem für Dringlichkeit) ─────────────────────
function PrioAmpelMini({ value }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {PRIO_LIST.map(p => {
        const active = value === p;
        const c = PRIO_CFG[p].color;
        return <div key={p} style={{ width: 6, height: 6, borderRadius: "50%", background: active ? c : Z.borderSoft, boxShadow: active ? `0 0 4px ${c}` : "none" }} />;
      })}
    </div>
  );
}

function PrioAmpelPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      {PRIO_LIST.map(p => {
        const active = value === p;
        const c = PRIO_CFG[p].color;
        return (
          <div key={p} onClick={() => onChange(p)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: active ? c : Z.panelAlt, border: `2px solid ${active ? c : Z.border}`, boxShadow: active ? `0 0 10px ${c}77` : "none", transition: "all 0.15s" }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: active ? Z.text : Z.textSoft }}>{p}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Aufwand-Balken (Füllstand statt Farbe) ─────────────────────────────────
const AUFWAND_BAR_HEIGHTS = [5, 8, 11];
function AufwandBarsMini({ value }) {
  const level = AUFWAND_CFG[value]?.level || 2;
  return (
    <div style={{ display: "inline-flex", gap: 2, alignItems: "flex-end" }}>
      {AUFWAND_BAR_HEIGHTS.map((h, i) => (
        <div key={i} style={{ width: 3, height: h, borderRadius: 1, background: i < level ? Z.gold : Z.borderSoft }} />
      ))}
    </div>
  );
}

function AufwandBarsPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 20 }}>
      {AUFWAND_LIST.map(a => {
        const active = value === a;
        const level = AUFWAND_CFG[a].level;
        return (
          <div key={a} onClick={() => onChange(a)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 20 }}>
              {[10, 15, 20].map((h, i) => (
                <div key={i} style={{ width: 7, height: h, borderRadius: 2, background: i < level ? (active ? Z.gold : Z.textSoft) : Z.border }} />
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: active ? Z.text : Z.textSoft }}>{a}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Notizen mit leichter Formatierung: "Label: Wert"-Zeilen, Aufzählungen
// und erkannte Werte (Datum/Mengen/Preise) werden hervorgehoben. ───────────
function renderNotizen(raw) {
  const text = (raw || "").trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  const labelRe = /^([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9 /_-]{1,28}):\s+(.+)$/;
  const bulletRe = /^[-*•]\s+(.+)$/;
  const markRe = /(\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2}|\d+(?:[.,]\d+)?\s?(?:Stück|St\.|Std\.|Stunden|x|%|€|EUR))/gi;

  const withMarks = (str) => {
    const out = [];
    let last = 0, m;
    const re = new RegExp(markRe);
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) out.push(str.slice(last, m.index));
      out.push(<mark key={m.index} style={{ background: "rgba(201,162,39,0.28)", color: Z.goldLight, padding: "1px 4px", borderRadius: 4, fontWeight: 700 }}>{m[0]}</mark>);
      last = m.index + m[0].length;
    }
    if (last < str.length) out.push(str.slice(last));
    return out;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {lines.map((line, i) => {
        const lm = line.match(labelRe);
        const bm = line.match(bulletRe);
        if (lm) return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: Z.gold, textTransform: "uppercase", letterSpacing: "0.03em", flexShrink: 0 }}>{lm[1]}:</span>
            <span style={{ fontSize: 13 }}>{withMarks(lm[2])}</span>
          </div>
        );
        if (bm) return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ color: Z.gold, fontWeight: 800, flexShrink: 0 }}>•</span>
            <span style={{ fontSize: 13 }}>{withMarks(bm[1])}</span>
          </div>
        );
        return <div key={i} style={{ fontSize: 13 }}>{withMarks(line)}</div>;
      })}
    </div>
  );
}

// ─── Board-Ansicht (Drag & Drop nach Priorität / Aufwand) ──────────────────
function BoardView({ jobs, groupBy, onOpen, onChangeGroup }) {
  const list = GROUP_CFG[groupBy].list();
  const [overCol, setOverCol] = useState(null);
  const [dragId, setDragId] = useState(null);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "start" }}>
      {list.map(val => {
        const items = jobs.filter(j => (j[groupBy] || "Mittel") === val);
        const isOver = overCol === val;
        return (
          <div key={val}
            onDragOver={e => { e.preventDefault(); setOverCol(val); }}
            onDragLeave={() => setOverCol(o => (o === val ? null : o))}
            onDrop={e => { e.preventDefault(); setOverCol(null); const id = e.dataTransfer.getData("text/job-id"); if (id) onChangeGroup(id, val); }}
            style={{ background: isOver ? "rgba(201,162,39,0.1)" : Z.panel, border: `1.5px solid ${isOver ? Z.gold : Z.border}`, borderRadius: 12, padding: 10, transition: "background .1s, border-color .1s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
              {groupBy === "prio" ? <PrioAmpelMini value={val} /> : <AufwandBarsMini value={val} />}
              <div style={{ fontSize: 13, fontWeight: 800 }}>{val}</div>
              <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: Z.textSoft, background: Z.panelAlt, borderRadius: 10, padding: "1px 8px" }}>{items.length}</div>
            </div>
            {items.length === 0 ? (
              <div style={{ fontSize: 12, color: Z.textFaint, padding: "12px 4px", textAlign: "center", border: `1.5px dashed ${Z.border}`, borderRadius: 8 }}>Karte hierher ziehen</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {items.map(job => (
                  <BoardCard key={job.id} job={job} dragging={dragId === job.id}
                    onOpen={() => onOpen(job)}
                    onDragStart={e => { e.dataTransfer.setData("text/job-id", job.id); setDragId(job.id); }}
                    onDragEnd={() => setDragId(null)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ job, dragging, onOpen, onDragStart, onDragEnd }) {
  const sc = STATUS_CFG[job.status] || STATUS_CFG["Neu"];
  const personen = Array.isArray(job.personen) ? job.personen : [];
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}
      style={{ opacity: dragging ? 0.3 : 1, background: Z.panelAlt, borderRadius: 9, padding: "9px 10px", borderLeft: `3px solid ${sc.color}`, cursor: "grab", display: "flex", alignItems: "center", gap: 8 }}>
      <i className="ti ti-grip-vertical" style={{ fontSize: 14, color: Z.textFaint, flexShrink: 0 }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.name}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 10, background: Z.panel, color: sc.color }}>{job.status}</span>
          <PrioAmpelMini value={job.prio || "Mittel"} />
          <AufwandBarsMini value={job.aufwand || "Mittel"} />
          {personen.length > 0 && <span style={{ fontSize: 10, color: Z.textSoft }}>{personen.join(", ")}</span>}
          {job.date && <span style={{ fontSize: 10, fontWeight: 700, color: Z.textSoft }}>{fmtDate(job.date)}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Equipment-Planung: Katalog pflegen, Jobs zuweisen, Terminkonflikte
// (gleiches Gerät an zwei Jobs am selben Tag) automatisch erkennen. ────────
function EquipmentView({ jobs, onJobClick }) {
  const [catalog, setCatalog] = useState(() => loadEquipmentCatalog());
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    const name = newItem.trim();
    if (!name || catalog.includes(name)) return;
    const next = [...catalog, name];
    setCatalog(next);
    saveEquipmentCatalog(next);
    setNewItem("");
  };
  const removeItem = (name) => {
    const next = catalog.filter(x => x !== name);
    setCatalog(next);
    saveEquipmentCatalog(next);
  };

  const assignments = catalog.map(item => {
    const assigned = jobs.filter(j => Array.isArray(j.equipment) && j.equipment.includes(item));
    const dateCounts = {};
    assigned.forEach(j => { if (j.date) dateCounts[j.date] = (dateCounts[j.date] || 0) + 1; });
    const conflictDates = Object.entries(dateCounts).filter(([, n]) => n > 1).map(([d]) => d);
    return { item, assigned, conflictDates };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Equipment-Katalog</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()}
            placeholder="z.B. Kamera Sony A7 IV"
            style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14 }} />
          <div onClick={addItem} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 8, background: Z.gold, color: "#1A1A1A", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
            <i className="ti ti-plus" style={{ fontSize: 14 }}></i>Hinzufügen
          </div>
        </div>
      </div>

      {catalog.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: Z.textFaint }}>
          <i className="ti ti-tools" style={{ fontSize: 44, display: "block", marginBottom: 12, color: Z.textFaint }}></i>
          <div style={{ fontSize: 15, fontWeight: 600, color: Z.text }}>Noch kein Equipment eingetragen</div>
          <div style={{ fontSize: 13, marginTop: 6, maxWidth: 420, margin: "6px auto 0" }}>Trag oben eure Kameras, Objektive &amp; Co. ein, um sie Jobs zuzuweisen und Terminkonflikte automatisch zu erkennen.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, alignItems: "start" }}>
          {assignments.map(({ item, assigned, conflictDates }) => (
            <div key={item} style={{ background: Z.panel, borderRadius: 12, padding: 12, border: `1.5px solid ${conflictDates.length ? Z.danger : Z.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>{item}</div>
                {conflictDates.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: Z.danger, background: "rgba(224,96,122,0.15)", padding: "2px 8px", borderRadius: 10 }}>Doppelbelegung</span>
                )}
                <i className="ti ti-x" onClick={() => removeItem(item)} style={{ cursor: "pointer", color: Z.textFaint, fontSize: 14 }}></i>
              </div>
              {assigned.length === 0 ? (
                <div style={{ fontSize: 12, color: Z.textFaint }}>Aktuell keinem Job zugeordnet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {assigned.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(job => {
                    const conflict = job.date && conflictDates.includes(job.date);
                    return (
                      <div key={job.id} onClick={() => onJobClick(job)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 8, background: conflict ? "rgba(224,96,122,0.12)" : Z.panelAlt, cursor: "pointer" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{job.name}</span>
                        <span style={{ fontSize: 11, color: conflict ? Z.danger : Z.textSoft, fontWeight: conflict ? 700 : 500 }}>{job.date ? fmtDate(job.date) : "ohne Termin"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Job-Zeile Grafik/Nachbearbeitung ──────────────────────────────────────
// Schlanker als die Foto/Video-Zeile: zeigt auf einen Blick Auftragsart,
// Anzahl Fotos/Videos und Zuständigkeit - die Infos, die ein Grafik-
// Mitarbeiter morgens als Erstes braucht.
function GrafikJobRow({ job, onOpen, onAdvance }) {
  const statusColor = GRAFIK_STATUS_CFG[job.status]?.color || Z.textSoft;
  const personen = Array.isArray(job.personen) ? job.personen : [];
  const mediaBits = [];
  if (job.anzahl_fotos) mediaBits.push(`${job.anzahl_fotos} Fotos`);
  if (job.anzahl_videos) mediaBits.push(`${job.anzahl_videos} Videos`);
  return (
    <div onClick={onOpen} style={{ padding: "12px 16px", borderBottom: `1px solid ${Z.borderSoft}`, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div onClick={e => { e.stopPropagation(); onAdvance(); }} title="Status weiterschalten"
        style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, color: statusColor, border: `1.5px solid ${statusColor}`, cursor: "pointer", whiteSpace: "nowrap" }}>
        {job.status}
      </div>
      <div title={`Priorität: ${job.prio || "Mittel"}`} style={{ flexShrink: 0 }}><PrioAmpelMini value={job.prio || "Mittel"} /></div>
      <div title={`Aufwand: ${job.aufwand || "Mittel"}`} style={{ flexShrink: 0 }}><AufwandBarsMini value={job.aufwand || "Mittel"} /></div>
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
          {[job.auftragsart, mediaBits.join(" · "), personen.join(", ")].filter(Boolean).join(" · ")}
        </div>
      </div>
      {(job.date || job.abgabe) && (
        <div style={{ fontSize: 11.5, fontWeight: 700, color: Z.textSoft, flexShrink: 0, textAlign: "right" }}>
          {job.abgabe ? "AB " + fmtDate(job.abgabe) : fmtDate(job.date)}
        </div>
      )}
    </div>
  );
}

// ─── Job-Zeile Foto-/Videoproduktion ───────────────────────────────────────
// Klick auf die Zeile öffnet die Detailansicht, Klick auf den Status-Pill
// schaltet den Status direkt weiter (häufigster Alltags-Workflow).
function JobRow({ job, onOpen, onAdvance, sortMode, onReorder }) {
  const statusColor = STATUS_CFG[job.status]?.color || Z.textSoft;
  const kategorien = Array.isArray(job.kategorien) ? job.kategorien : [];
  const personen = Array.isArray(job.personen) ? job.personen : [];
  const [dragOver, setDragOver] = useState(false);
  return (
    <div draggable
      onDragStart={e => e.dataTransfer.setData("text/job-id", job.id)}
      onDragOver={sortMode ? (e => { e.preventDefault(); setDragOver(true); }) : undefined}
      onDragLeave={sortMode ? (() => setDragOver(false)) : undefined}
      onDrop={sortMode ? (e => { e.preventDefault(); setDragOver(false); const id = e.dataTransfer.getData("text/job-id"); if (id && id !== job.id) onReorder(id, job.id); }) : undefined}
      onClick={onOpen} title={sortMode ? "Ziehen, um die Reihenfolge zu ändern" : "Ziehen, um auf „Heute“ einzuplanen"}
      style={{ padding: "12px 16px", borderBottom: `1px solid ${Z.borderSoft}`, display: "flex", alignItems: "center", gap: 10, cursor: sortMode ? "grab" : "pointer", background: dragOver ? "rgba(201,162,39,0.1)" : "transparent" }}>
      {sortMode && <i className="ti ti-grip-vertical" style={{ fontSize: 14, color: Z.textFaint, flexShrink: 0 }}></i>}
      <div onClick={e => { e.stopPropagation(); onAdvance(); }} title="Status weiterschalten"
        style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, color: statusColor, border: `1.5px solid ${statusColor}`, cursor: "pointer", whiteSpace: "nowrap" }}>
        {job.status}
      </div>
      <div title={`Priorität: ${job.prio || "Mittel"}`} style={{ flexShrink: 0 }}><PrioAmpelMini value={job.prio || "Mittel"} /></div>
      <div title={`Aufwand: ${job.aufwand || "Mittel"}`} style={{ flexShrink: 0 }}><AufwandBarsMini value={job.aufwand || "Mittel"} /></div>
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
      try { localStorage.setItem(storageKey, "1"); } catch {}
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
// Dient zugleich als Neuanlage- UND Bearbeiten-Dialog für Fotobox-Buchungen
// und Hochzeiten (volles Formular statt nur Schnelleingabe): wird ein "item"
// übergeben, ist es ein Bearbeiten-Vorgang (Update statt Insert).
function QuickAddModal({ bereichKey, bereich, boxId, item, onClose, onSubmit }) {
  const cfg = QUICK_ADD[bereichKey];
  const isEdit = !!item;
  // Hochzeiten speichern alle Felder in der jsonb-Spalte "data", Fotobox-
  // Buchungen als flache Tabellenspalten - beim Bearbeiten entsprechend lesen.
  const source = isEdit ? (bereichKey === "hochzeiten" ? (item.data || {}) : item) : {};
  const [values, setValues] = useState(() => {
    const init = {};
    (cfg?.fields || []).forEach(f => {
      const v = source[f.key];
      init[f.key] = v !== undefined && v !== null ? v : (f.type === "checkbox" ? !!f.default : (f.default ?? ""));
    });
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

  // Felder in der definierten Reihenfolge nach "section" gruppieren, damit
  // der umfangreiche Felderumfang (v.a. bei Hochzeiten) übersichtlich bleibt.
  const sections = [];
  cfg.fields.forEach(f => {
    const name = f.section || "";
    let bucket = sections[sections.length - 1]?.name === name ? sections[sections.length - 1] : null;
    if (!bucket) { bucket = { name, fields: [] }; sections.push(bucket); }
    bucket.fields.push(f);
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: Z.panel, border: `1px solid ${Z.border}`, borderBottom: "none", width: "100%", maxWidth: 520, borderRadius: "16px 16px 0 0", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${Z.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? `${bereich?.label || ""} bearbeiten` : cfg.title}</div>
          <i className="ti ti-x" onClick={onClose} style={{ fontSize: 18, color: Z.textSoft, cursor: "pointer" }}></i>
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          {sections.map((sec, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {sec.name && (
                <div style={{ fontSize: 11, fontWeight: 800, color: Z.gold, textTransform: "uppercase", letterSpacing: "0.06em", borderTop: i > 0 ? `1px solid ${Z.borderSoft}` : "none", paddingTop: i > 0 ? 14 : 0, marginTop: i > 0 ? 2 : 0 }}>
                  {sec.name}
                </div>
              )}
              {sec.fields.map(f => (
                <div key={f.key}>
                  {f.type === "checkbox" ? (
                    <div onClick={() => set(f.key, !values[f.key])} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${values[f.key] ? Z.gold : Z.border}`, background: values[f.key] ? Z.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {values[f.key] && <i className="ti ti-check" style={{ fontSize: 13, color: "#1A1A1A", fontWeight: 900 }}></i>}
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.label}</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: Z.textSoft, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                        {f.label}{f.required && " *"}
                      </div>
                      {f.type === "select" ? (
                        <select value={values[f.key]} onChange={e => set(f.key, e.target.value)}
                          style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14 }}>
                          {f.options.map(o => <option key={o} value={o}>{o || "–"}</option>)}
                        </select>
                      ) : f.type === "textarea" ? (
                        <textarea value={values[f.key]} onChange={e => set(f.key, e.target.value)} rows={3}
                          style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14, boxSizing: "border-box", resize: "vertical", fontFamily: FONT_BODY }} />
                      ) : (
                        <input type={f.type} value={values[f.key]} onChange={e => set(f.key, e.target.value)}
                          style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${Z.border}`, background: Z.panelAlt, color: Z.text, fontSize: 14, boxSizing: "border-box" }} />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          {error && <div style={{ color: Z.danger, fontSize: 12.5 }}>{error}</div>}
        </div>
        <div style={{ padding: "13px 18px", borderTop: `1px solid ${Z.border}`, display: "flex", gap: 10, flexShrink: 0 }}>
          <div onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 9, border: `1.5px solid ${Z.border}`, textAlign: "center", cursor: "pointer", fontSize: 14, fontWeight: 600, color: Z.textSoft }}>Abbrechen</div>
          <div onClick={handleSubmit} style={{ flex: 2, padding: 12, borderRadius: 9, background: Z.gold, color: "#1A1A1A", textAlign: "center", cursor: busy ? "wait" : "pointer", fontSize: 14, fontWeight: 700 }}>
            {busy ? "Speichert…" : isEdit ? "Speichern" : "Hinzufügen"}
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
function ChatCapture({ team, onCreated, bereich = "fotostudio" }) {
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
        body: JSON.stringify({ text: trimmed, fileBase64, mediaType, fileName: file?.name, team, bereich }),
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
    ...splitName(job.name), status: job.status || "Neu", prio: job.prio || "Mittel", aufwand: job.aufwand || "Mittel",
    ort: job.ort || "Im Haus", personen: Array.isArray(job.personen) ? job.personen : [],
    date: job.date || "", date_end: job.date_end || "", dauer: job.dauer || "", abgabe: job.abgabe || "",
    kontakt: job.kontakt || "", notizen: job.notizen || "", projekttyp: job.projekttyp || "Fotografie",
    kategorien: Array.isArray(job.kategorien) ? job.kategorien : [], attachments: Array.isArray(job.attachments) ? job.attachments : [],
    stationen: Array.isArray(job.stationen) ? job.stationen : [],
    equipment: Array.isArray(job.equipment) ? job.equipment : [],
  } : EMPTY_JOB_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, val) => setV(p => ({ ...p, [k]: val }));
  const toggleIn = (k, item) => setV(p => ({ ...p, [k]: p[k].includes(item) ? p[k].filter(x => x !== item) : [...p[k], item] }));

  const kategorienOptions = PROJEKTTYP_CFG[v.projekttyp]?.kategorien || [];

  const [equipmentCatalog, setEquipmentCatalog] = useState(() => loadEquipmentCatalog());
  const [newEquipment, setNewEquipment] = useState("");
  const toggleEquipment = (name) => toggleIn("equipment", name);
  const addCustomEquipment = () => {
    const name = newEquipment.trim();
    if (!name) return;
    if (!equipmentCatalog.includes(name)) { const next = [...equipmentCatalog, name]; setEquipmentCatalog(next); saveEquipmentCatalog(next); }
    setV(p => (p.equipment.includes(name) ? p : { ...p, equipment: [...p.equipment, name] }));
    setNewEquipment("");
  };

  const handleChatAction = (action) => {
    onAiAction && onAiAction(action);
    if (action.type === "update_job" && action.row) {
      setV(p => ({ ...p, status: action.row.status ?? p.status, notizen: action.row.notizen ?? p.notizen }));
    }
  };

  // Moco-Firmen-Autocomplete beim Tippen des Kundennamens (api/moco-search.js).
  const [mocoSuggestions, setMocoSuggestions] = useState([]);
  const mocoDebounce = useRef(null);
  const handleKundeChange = (val) => {
    set("kunde", val);
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
    if (!v.kunde.trim() && !v.jobname.trim()) { setError("Kunde oder Jobname fehlt"); return; }
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
            <FieldLabel>Kunde</FieldLabel>
            <input type="text" value={v.kunde} onChange={e => handleKundeChange(e.target.value)}
              onBlur={() => setTimeout(() => setMocoSuggestions([]), 150)} style={inputStyle} autoFocus />
            {mocoSuggestions.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: Z.panelAlt, border: `1px solid ${Z.border}`, borderRadius: 9, overflow: "hidden", zIndex: 5, boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}>
                <div style={{ padding: "6px 11px", fontSize: 10, fontWeight: 700, color: Z.textFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>Aus dem Moco-Firmenstamm</div>
                {mocoSuggestions.map(c => (
                  <div key={c.id} onMouseDown={() => { set("kunde", c.name); setMocoSuggestions([]); }}
                    style={{ padding: "8px 11px", fontSize: 13.5, cursor: "pointer", borderTop: `1px solid ${Z.borderSoft}` }}>{c.name}</div>
                ))}
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Jobname</FieldLabel>
            <input type="text" value={v.jobname} onChange={e => set("jobname", e.target.value)} placeholder="z.B. Freisteller Herbstkollektion" style={inputStyle} />
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
            <FieldLabel>Equipment</FieldLabel>
            {equipmentCatalog.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <ChipSelect options={equipmentCatalog} selected={v.equipment} onToggle={toggleEquipment} accent={BEREICH_BY_KEY.fotostudio.accent} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={newEquipment} onChange={e => setNewEquipment(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCustomEquipment())}
                placeholder="z.B. Kamera Sony A7 IV" style={{ ...inputStyle, flex: 1 }} />
              <div onClick={addCustomEquipment} style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 14px", borderRadius: 8, background: Z.panelAlt, border: `1px solid ${Z.border}`, color: Z.text, fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
                <i className="ti ti-plus" style={{ fontSize: 13, color: "#1A1A1A", background: Z.gold, borderRadius: "50%", padding: 2 }}></i>Hinzufügen
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Personen</FieldLabel>
            {team.length === 0 ? (
              <div style={{ fontSize: 12.5, color: Z.textFaint }}>Kein Team hinterlegt.</div>
            ) : (
              <ChipSelect options={team} selected={v.personen} onToggle={p => toggleIn("personen", p)} accent={BEREICH_BY_KEY.fotostudio.accent} />
            )}
          </div>

          <div>
            <FieldLabel>Priorität</FieldLabel>
            <PrioAmpelPicker value={v.prio} onChange={p => set("prio", p)} />
          </div>
          <div>
            <FieldLabel>Aufwand</FieldLabel>
            <AufwandBarsPicker value={v.aufwand} onChange={a => set("aufwand", a)} />
          </div>

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
            {v.notizen.trim() && (
              <div style={{ marginTop: 8, background: "rgba(201,162,39,0.08)", border: `1px solid ${Z.border}`, borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <i className="ti ti-notes" style={{ fontSize: 13, color: Z.gold }}></i>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: Z.gold }}>Vorschau</span>
                </div>
                {renderNotizen(v.notizen)}
              </div>
            )}
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

// ─── Grafik-/Nachbearbeitungs-Formular ─────────────────────────────────────
// Bewusst deutlich schlanker als das Foto/Video-Formular: dreht sich nicht um
// Studioplanung/Equipment, sondern um das, was ein Grafik-Mitarbeiter oder
// Mediengestalter als Erstes braucht - wo liegen die Daten, was genau ist zu
// tun, wie viele Fotos/Videos sind betroffen, wann startet/endet es, wer
// arbeitet dran und wie viele Stunden sind budgetiert (angelehnt an gängige
// Agentur-Tools wie awork: Auftragsart, Zeitbudget, Zuständigkeit, Deadline).
function GrafikJobFormModal({ mode, job, team, onChatJobsCreated, onClose, onSubmit }) {
  const [v, setV] = useState(mode === "edit" && job ? {
    ...splitName(job.name), status: job.status || "Neu", auftragsart: job.auftragsart || "Bildbearbeitung",
    speicherort: job.speicherort || "", anzahl_fotos: job.anzahl_fotos ?? "", anzahl_videos: job.anzahl_videos ?? "",
    prio: job.prio || "Mittel", aufwand: job.aufwand || "Mittel",
    personen: Array.isArray(job.personen) ? job.personen : [], date: job.date || "", abgabe: job.abgabe || "",
    stunden_budget: job.stunden_budget ?? "", kontakt: job.kontakt || "", notizen: job.notizen || "",
    attachments: Array.isArray(job.attachments) ? job.attachments : [],
  } : EMPTY_GRAFIK_JOB_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, val) => setV(p => ({ ...p, [k]: val }));
  const toggleIn = (k, item) => setV(p => ({ ...p, [k]: p[k].includes(item) ? p[k].filter(x => x !== item) : [...p[k], item] }));

  const [mocoSuggestions, setMocoSuggestions] = useState([]);
  const mocoDebounce = useRef(null);
  const handleKundeChange = (val) => {
    set("kunde", val);
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
    if (!v.kunde.trim() && !v.jobname.trim()) { setError("Kunde oder Jobname fehlt"); return; }
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
          <div style={{ fontSize: 16, fontWeight: 700 }}>{mode === "edit" ? "Grafik-Job bearbeiten" : "Neuer Grafik-Job"}</div>
          <i className="ti ti-x" onClick={onClose} style={{ fontSize: 18, color: Z.textSoft, cursor: "pointer" }}></i>
        </div>
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {mode === "new" && (
            <>
              <ChatCapture team={team} bereich="grafik" onCreated={jobs => { onChatJobsCreated && onChatJobsCreated(jobs); onClose(); }} />
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
                {GRAFIK_STATUS_LIST.map(s => (
                  <div key={s} onClick={() => set("status", s)} style={{
                    padding: "6px 12px", borderRadius: 16, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    border: `1.5px solid ${GRAFIK_STATUS_CFG[s].color}`, background: v.status === s ? GRAFIK_STATUS_CFG[s].color : "transparent",
                    color: v.status === s ? "#0C0C0D" : GRAFIK_STATUS_CFG[s].color,
                  }}>{s}</div>
                ))}
              </div>
            </div>
          )}

          <div style={{ position: "relative" }}>
            <FieldLabel>Kunde</FieldLabel>
            <input type="text" value={v.kunde} onChange={e => handleKundeChange(e.target.value)}
              onBlur={() => setTimeout(() => setMocoSuggestions([]), 150)} style={inputStyle} autoFocus />
            {mocoSuggestions.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: Z.panelAlt, border: `1px solid ${Z.border}`, borderRadius: 9, overflow: "hidden", zIndex: 5, boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}>
                <div style={{ padding: "6px 11px", fontSize: 10, fontWeight: 700, color: Z.textFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>Aus dem Moco-Firmenstamm</div>
                {mocoSuggestions.map(c => (
                  <div key={c.id} onMouseDown={() => { set("kunde", c.name); setMocoSuggestions([]); }}
                    style={{ padding: "8px 11px", fontSize: 13.5, cursor: "pointer", borderTop: `1px solid ${Z.borderSoft}` }}>{c.name}</div>
                ))}
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Jobname</FieldLabel>
            <input type="text" value={v.jobname} onChange={e => set("jobname", e.target.value)} placeholder="z.B. Handzettel KW45" style={inputStyle} />
          </div>

          <div>
            <FieldLabel>Auftragsart</FieldLabel>
            <select value={v.auftragsart} onChange={e => set("auftragsart", e.target.value)} style={inputStyle}>
              {GRAFIK_AUFTRAGSART_LIST.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>Speicherort (wo liegen die Daten?)</FieldLabel>
            <input type="text" value={v.speicherort} onChange={e => set("speicherort", e.target.value)} placeholder="z.B. Server/Kunden/REWE/KW45" style={inputStyle} />
          </div>

          <Row>
            <Col>
              <FieldLabel>Anzahl Fotos</FieldLabel>
              <input type="number" min="0" value={v.anzahl_fotos} onChange={e => set("anzahl_fotos", e.target.value)} style={inputStyle} />
            </Col>
            <Col>
              <FieldLabel>Anzahl Videos</FieldLabel>
              <input type="number" min="0" value={v.anzahl_videos} onChange={e => set("anzahl_videos", e.target.value)} style={inputStyle} />
            </Col>
          </Row>

          <div>
            <FieldLabel>Priorität</FieldLabel>
            <PrioAmpelPicker value={v.prio} onChange={p => set("prio", p)} />
          </div>
          <div>
            <FieldLabel>Aufwand</FieldLabel>
            <AufwandBarsPicker value={v.aufwand} onChange={a => set("aufwand", a)} />
          </div>

          <div>
            <FieldLabel>Personen</FieldLabel>
            {team.length === 0 ? (
              <div style={{ fontSize: 12.5, color: Z.textFaint }}>Kein Team hinterlegt.</div>
            ) : (
              <ChipSelect options={team} selected={v.personen} onToggle={p => toggleIn("personen", p)} accent={BEREICH_BY_KEY.grafik.accent} />
            )}
          </div>

          <Row>
            <Col>
              <FieldLabel>Start</FieldLabel>
              <input type="date" value={v.date} onChange={e => set("date", e.target.value)} style={inputStyle} />
            </Col>
            <Col>
              <FieldLabel>Deadline / Abgabe</FieldLabel>
              <input type="date" value={v.abgabe} onChange={e => set("abgabe", e.target.value)} style={inputStyle} />
            </Col>
          </Row>

          <div>
            <FieldLabel>Stunden-Budget</FieldLabel>
            <input type="number" min="0" step="0.5" value={v.stunden_budget} onChange={e => set("stunden_budget", e.target.value)} placeholder="z.B. 4" style={inputStyle} />
          </div>

          <div>
            <FieldLabel>Kontakt</FieldLabel>
            <input type="text" value={v.kontakt} onChange={e => set("kontakt", e.target.value)} style={inputStyle} />
          </div>

          <div>
            <FieldLabel>Was genau muss bearbeitet werden?</FieldLabel>
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
