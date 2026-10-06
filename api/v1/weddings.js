import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireApiKey } from "../_lib/auth.js";

// Externe Integrations-API für Hochzeiten - für die Anbindung des separaten
// ZENITH KI-Dashboards. Abgesichert über den Header "x-api-key" (unabhängig
// von der Klartext-Passwortsperre im App-Frontend, die nur den UI-Zugriff
// für Umsetzer regelt).
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!requireApiKey(req, res)) return;

  const sb = supabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await sb.from("hz_hochzeiten").select("*").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ weddings: (data || []).map(w => ({ id: w.id, created_at: w.created_at, ...w.data })) });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.partner1) return res.status(400).json({ error: "partner1 fehlt" });
    const row = {
      id: Date.now(), created_at: new Date().toISOString(),
      data: { partner1: b.partner1, partner2: b.partner2 || "", hochzeitsDatum: b.hochzeitsDatum || "", feierAdresse: b.feierAdresse || "", status: b.status || "Anfrage" },
    };
    const { data, error } = await sb.from("hz_hochzeiten").insert([row]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ wedding: { id: data.id, created_at: data.created_at, ...data.data } });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
