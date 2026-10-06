import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

// Claude-gestützter Assistent für den Chat-Bereich auf der Übersichtsseite
// und in der Job-Detailansicht. Kann Jobs/Buchungen/Hochzeiten per
// Werkzeug-Aufruf anlegen bzw. (im Job-Kontext) aktualisieren und
// beantwortet Auswertungsfragen anhand echter, live geladener Daten.
const MODEL = "claude-sonnet-5-5";
const ANTHROPIC_VERSION = "2023-06-01";

const TOOLS = [
  {
    name: "create_job",
    description: "Legt einen neuen Foto-/Video-Produktionsjob an (Bereich Foto-/Videoproduktion).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Jobname bzw. Kunde" },
        projekttyp: { type: "string", enum: ["Fotografie", "Video"] },
        kategorien: { type: "array", items: { type: "string" } },
        personen: { type: "array", items: { type: "string" }, description: "Zugeordnete Teammitglieder" },
        ort: { type: "string", enum: ["Im Haus", "Außer Haus"] },
        prio: { type: "string", enum: ["Hoch", "Mittel", "Niedrig"] },
        date: { type: "string", description: "Shooting-Datum im Format YYYY-MM-DD" },
        abgabe: { type: "string", description: "Deadline im Format YYYY-MM-DD" },
        kontakt: { type: "string" },
        notizen: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_job",
    description: "Aktualisiert den aktuell im Kontext befindlichen Job (Status setzen und/oder Notiz ergänzen). Nur nutzbar, wenn im Kontext bereits ein konkreter Job angegeben ist.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["Neu", "In Arbeit", "Abgeschlossen", "Archiviert"] },
        notizen_append: { type: "string", description: "Text, der an die bestehenden Notizen angehängt wird" },
      },
    },
  },
  {
    name: "create_booking",
    description: "Legt eine neue Fotobox-Buchung an.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        location: { type: "string" },
        start_date: { type: "string", description: "Format YYYY-MM-DD" },
        end_date: { type: "string", description: "Format YYYY-MM-DD, optional" },
      },
      required: ["title", "start_date"],
    },
  },
  {
    name: "create_wedding",
    description: "Legt eine neue Hochzeit an.",
    input_schema: {
      type: "object",
      properties: {
        partner1: { type: "string" },
        partner2: { type: "string" },
        hochzeitsDatum: { type: "string", description: "Format YYYY-MM-DD" },
        feierAdresse: { type: "string" },
      },
      required: ["partner1"],
    },
  },
];

async function executeTool(sb, name, input, context) {
  if (name === "create_job") {
    const row = {
      name: input.name, status: "Neu", prio: input.prio || "Mittel", aufwand: "Mittel",
      ort: input.ort || "Im Haus", personen: input.personen || [], person: (input.personen || []).join(", "),
      date: input.date || null, abgabe: input.abgabe || null, kontakt: input.kontakt || "", notizen: input.notizen || "",
      projekttyp: input.projekttyp || "Fotografie", kategorien: input.kategorien || [],
    };
    const { data, error } = await sb.from("js_jobs").insert([row]).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "update_job") {
    if (!context?.jobId) throw new Error("Kein Job im Kontext ausgewählt - das Werkzeug ist nur in der Job-Detailansicht nutzbar.");
    const patch = {};
    if (input.status) patch.status = input.status;
    if (input.notizen_append) {
      const { data: current } = await sb.from("js_jobs").select("notizen").eq("id", context.jobId).single();
      patch.notizen = ((current?.notizen || "") + "\n" + input.notizen_append).trim();
    }
    const { data, error } = await sb.from("js_jobs").update(patch).eq("id", context.jobId).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "create_booking") {
    const { data: boxes } = await sb.from("fb_boxes").select("id").limit(1);
    const boxId = boxes?.[0]?.id;
    if (!boxId) throw new Error("Keine Fotobox hinterlegt.");
    const row = {
      title: input.title, location: input.location || null, start_date: input.start_date,
      end_date: input.end_date || input.start_date, box_id: boxId, status: "option",
      logistics: "aufbau", media_packages: 1, with_printer: true, invoice_status: "keine",
    };
    const { data, error } = await sb.from("fb_bookings").insert([row]).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "create_wedding") {
    const row = {
      id: Date.now(), created_at: new Date().toISOString(),
      data: { partner1: input.partner1, partner2: input.partner2 || "", hochzeitsDatum: input.hochzeitsDatum || "", feierAdresse: input.feierAdresse || "", status: "Anfrage" },
    };
    const { data, error } = await sb.from("hz_hochzeiten").insert([row]).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  throw new Error("Unbekanntes Werkzeug: " + name);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY fehlt. Bitte in Vercel → Environment Variables eintragen, um den KI-Chat zu aktivieren." });
  }

  const { message, context } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: "message fehlt" });

  const sb = supabaseAdmin();

  const [jobsRes, bookingsRes, weddingsRes] = await Promise.all([
    sb.from("js_jobs").select("name,status,bereich,date,abgabe,prio,projekttyp"),
    sb.from("fb_bookings").select("title,start_date,status"),
    sb.from("hz_hochzeiten").select("data"),
  ]);
  const jobs = jobsRes.data || [];
  const bookings = bookingsRes.data || [];
  const weddings = (weddingsRes.data || []).map(w => w.data || {});

  const today = new Date().toISOString().split("T")[0];
  const openProd = jobs.filter(j => j.bereich !== "Grafik" && !["Abgeschlossen", "Archiviert"].includes(j.status));
  const openGrafik = jobs.filter(j => j.bereich === "Grafik" && !["Fertig", "Archiviert", "Abgeschlossen"].includes(j.status));
  const upcomingBookings = bookings.filter(b => b.start_date >= today && b.status !== "storniert");
  const upcomingWeddings = weddings.filter(w => w.hochzeitsDatum && w.hochzeitsDatum >= today);

  const summary = [
    `Heutiges Datum: ${today}`,
    `Offene Foto-/Video-Jobs (${openProd.length}): ${openProd.map(j => `${j.name} [${j.status}, ${j.date || j.abgabe || "kein Termin"}]`).join("; ") || "keine"}`,
    `Offene Grafik-Jobs: ${openGrafik.length}`,
    `Anstehende Fotobox-Buchungen (${upcomingBookings.length}): ${upcomingBookings.map(b => `${b.title} am ${b.start_date}`).join("; ") || "keine"}`,
    `Anstehende Hochzeiten (${upcomingWeddings.length}): ${upcomingWeddings.map(w => `${w.partner1 || "?"} & ${w.partner2 || "?"} am ${w.hochzeitsDatum}`).join("; ") || "keine"}`,
  ].join("\n");

  let systemPrompt = `Du bist der KI-Assistent im "ZENITH Projekte"-Dashboard von ZENITH Werbung & Fotografie. Antworte kurz, direkt und auf Deutsch.
Du kannst per Werkzeug Jobs/Buchungen/Hochzeiten anlegen, und wenn im Kontext bereits ein konkreter Job angegeben ist, diesen aktualisieren.
Für die Bereiche Grafik/Nachbearbeitung und Messebau gibt es noch keine Anlage-Werkzeuge - weise freundlich darauf hin, falls danach gefragt wird.
Nutze bei Datumsangaben immer das Format YYYY-MM-DD. Wenn Angaben für eine Anlage fehlen, frag kurz nach, statt zu raten.

Aktuelle Datenlage:
${summary}`;

  if (context?.jobId) {
    systemPrompt += `\n\nAktueller Job im Kontext (id ${context.jobId}): ${JSON.stringify(context.job || {})}`;
  }
  if (Array.isArray(context?.team) && context.team.length) {
    systemPrompt += `\n\nTeam: ${context.team.join(", ")}`;
  }

  const messages = [{ role: "user", content: message }];
  let finalText = "";
  let action = null;

  try {
    for (let round = 0; round < 3; round++) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: systemPrompt, tools: TOOLS, messages }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return res.status(502).json({ error: "KI-Anfrage fehlgeschlagen: " + errText.slice(0, 400) });
      }
      const data = await resp.json();
      const toolUse = data.content.find(c => c.type === "tool_use");
      const textParts = data.content.filter(c => c.type === "text").map(c => c.text).join("\n");
      if (textParts) finalText = textParts;
      if (!toolUse) break;

      messages.push({ role: "assistant", content: data.content });

      let resultPayload;
      try {
        const row = await executeTool(sb, toolUse.name, toolUse.input, context);
        action = { type: toolUse.name, row };
        resultPayload = row;
      } catch (e) {
        resultPayload = { error: e.message };
      }
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(resultPayload) }] });

      if (data.stop_reason !== "tool_use") break;
    }
  } catch (e) {
    return res.status(500).json({ error: "Unerwarteter Fehler: " + e.message });
  }

  return res.status(200).json({ reply: finalText || "Erledigt.", action });
}
