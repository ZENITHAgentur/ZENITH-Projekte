import { notifyTeamsBooking } from "./_lib/teamsNotify.js";

// Vom Client aufgerufen, sobald Personen im Job-Formular (Neuanlage oder
// Bearbeitung) zugeordnet werden - siehe _lib/teamsNotify.js.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { names, jobName, bereich } = req.body || {};
  if (!process.env.TEAMS_WEBHOOK_URL) {
    return res.status(500).json({ error: "TEAMS_WEBHOOK_URL fehlt. Bitte in Vercel → Environment Variables eintragen." });
  }
  await notifyTeamsBooking({ names, jobName, bereich });
  return res.status(200).json({ ok: true });
}
