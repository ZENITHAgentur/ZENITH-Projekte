import { mocoCreateProjectForJob } from "./_lib/moco.js";

// Wird direkt nach dem manuellen Anlegen eines Foto-/Video-Jobs aufgerufen
// (nicht erst beim Archivieren): legt - falls eine passende Firma im
// Moco-Firmenstamm existiert - sofort ein Moco-Projekt dafür an, damit das
// Team schon während der Arbeit Zeiten darauf buchen kann.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { job } = req.body || {};
  if (!job?.name) return res.status(400).json({ error: "Kein Job übermittelt" });

  try {
    const result = await mocoCreateProjectForJob(job);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
