// Firmen-Autocomplete für das Jobname-Feld: sucht im Moco-Firmenstamm.
// Übernommen aus der alten Fotostudio-Jobliste (api/moco-search.js).
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const mocoDomain = process.env.MOCO_DOMAIN;
  const mocoKey = process.env.MOCO_API_KEY;
  if (!mocoDomain || !mocoKey) {
    return res.status(500).json({ error: "MOCO_DOMAIN oder MOCO_API_KEY fehlt." });
  }

  const term = String(req.query.term || "").trim();
  if (term.length < 2) return res.status(200).json({ companies: [] });

  try {
    const r = await fetch(
      `https://${mocoDomain}.mocoapp.com/api/v1/companies?term=${encodeURIComponent(term)}&type=customer`,
      { headers: { "Authorization": `Token token=${mocoKey}` } },
    );
    if (!r.ok) throw new Error(await r.text());
    const companies = await r.json();
    // Neben Name auch Adresse/Rechnungs-E-Mail durchreichen, damit das
    // Frontend bei Auswahl eines Vorschlags bekannte Felder direkt mit
    // ausfüllen kann (z.B. Rechnungsadresse bei Fotobox-Buchungen).
    const simplified = (Array.isArray(companies) ? companies : [])
      .slice(0, 8)
      .map(c => ({ id: c.id, name: c.name, address: c.address || null, billing_email: c.billing_email || null }));
    return res.status(200).json({ companies: simplified });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
