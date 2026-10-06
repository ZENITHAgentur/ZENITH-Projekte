// Prüft den API-Key für die externe Integrations-API (api/v1/*), z.B. für
// das separate KI-Dashboard von ZENITH. Der Key wird als Header
// "x-api-key" erwartet und gegen EXTERNAL_API_KEY (Vercel Env, serverseitig
// only) verglichen - landet dadurch nie im Client-Bundle.
export function requireApiKey(req, res) {
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected) {
    res.status(500).json({ error: "EXTERNAL_API_KEY fehlt. Bitte in Vercel → Environment Variables eintragen." });
    return false;
  }
  const provided = req.headers["x-api-key"];
  if (provided !== expected) {
    res.status(401).json({ error: "Ungültiger oder fehlender x-api-key Header." });
    return false;
  }
  return true;
}
