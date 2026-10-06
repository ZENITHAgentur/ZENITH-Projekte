// Prüft das Hochzeiten-Passwort serverseitig, damit der echte Wert nie im
// Client-Bundle landet (anders als eine VITE_-Variable, die für jeden im
// DevTools sichtbar wäre). Gibt bei Erfolg ein kurzlebiges Freischalt-Token
// zurück, das der Client für die eigentlichen Hochzeiten-Abfragen mitschickt.
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const expected = process.env.WEDDING_AREA_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: "WEDDING_AREA_PASSWORD fehlt. Bitte in Vercel → Environment Variables eintragen." });
  }

  const { password } = req.body || {};
  if (password !== expected) {
    return res.status(401).json({ ok: false, error: "Falsches Passwort" });
  }
  return res.status(200).json({ ok: true });
}
