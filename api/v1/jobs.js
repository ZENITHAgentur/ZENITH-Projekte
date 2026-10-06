import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireApiKey } from "../_lib/auth.js";

// Externe Integrations-API für Foto-/Video-Jobs (Bereich "Produktion") und
// Grafik-Jobs (Bereich "Grafik") - gedacht für die Anbindung des separaten
// ZENITH KI-Dashboards. Abgesichert über den Header "x-api-key".
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!requireApiKey(req, res)) return;

  const sb = supabaseAdmin();

  if (req.method === "GET") {
    let query = sb.from("js_jobs").select("*").order("created_at", { ascending: false });
    if (req.query.bereich) query = query.eq("bereich", req.query.bereich);
    if (req.query.status) query = query.eq("status", req.query.status);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ jobs: data });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: "name fehlt" });
    const row = {
      name: b.name, status: b.status || "Neu", prio: b.prio || "Mittel", aufwand: b.aufwand || "Mittel",
      ort: b.ort || "Im Haus", personen: b.personen || [], person: (b.personen || []).join(", "),
      date: b.date || null, date_end: b.date_end || null, dauer: b.dauer || null, abgabe: b.abgabe || null,
      kontakt: b.kontakt || "", notizen: b.notizen || "", projekttyp: b.projekttyp || "Fotografie",
      kategorien: b.kategorien || [], bereich: b.bereich === "Grafik" ? "Grafik" : "Produktion",
    };
    const { data, error } = await sb.from("js_jobs").insert([row]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ job: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
