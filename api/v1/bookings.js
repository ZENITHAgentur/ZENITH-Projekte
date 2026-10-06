import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireApiKey } from "../_lib/auth.js";

// Externe Integrations-API für Fotobox-Buchungen - für die Anbindung des
// separaten ZENITH KI-Dashboards. Abgesichert über den Header "x-api-key".
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!requireApiKey(req, res)) return;

  const sb = supabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await sb.from("fb_bookings").select("*").order("start_date", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ bookings: data });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.title || !b.start_date) return res.status(400).json({ error: "title und start_date sind erforderlich" });
    let boxId = b.box_id;
    if (!boxId) {
      const { data: boxes } = await sb.from("fb_boxes").select("id").limit(1);
      boxId = boxes?.[0]?.id;
    }
    if (!boxId) return res.status(400).json({ error: "Keine Fotobox hinterlegt (box_id fehlt)" });
    const row = {
      title: b.title, location: b.location || null, start_date: b.start_date, end_date: b.end_date || b.start_date,
      box_id: boxId, status: b.status || "option", logistics: b.logistics || "aufbau",
      media_packages: b.media_packages || 1, with_printer: b.with_printer !== false, invoice_status: b.invoice_status || "keine",
    };
    const { data, error } = await sb.from("fb_bookings").insert([row]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ booking: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
