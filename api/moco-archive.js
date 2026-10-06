// Wird aufgerufen, sobald ein Foto-/Video-Job auf "Archiviert" gesetzt wird:
// sucht die passende Firma im Moco-Firmenstamm und hinterlässt dort eine
// Notiz, dass der Auftrag abrechnungsbereit ist. Übernommen aus der alten
// Fotostudio-Jobliste (api/moco-archive.js), Feldnamen an das neue
// js_jobs-Schema angepasst (projekttyp/kategorien/date/kontakt identisch).
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const mocoDomain = process.env.MOCO_DOMAIN;
  const mocoKey = process.env.MOCO_API_KEY;
  if (!mocoDomain || !mocoKey) {
    return res.status(500).json({ error: "MOCO_DOMAIN oder MOCO_API_KEY fehlt. Bitte in Vercel → Environment Variables eintragen." });
  }

  const { job } = req.body || {};
  if (!job?.name) return res.status(400).json({ error: "Kein Job übermittelt" });

  const MOCO_BASE = `https://${mocoDomain}.mocoapp.com/api/v1`;
  const MOCO_HEADERS = {
    "Authorization": `Token token=${mocoKey}`,
    "Content-Type": "application/json",
  };

  // Kundennamen aus dem Jobnamen ableiten: "Kunde – Beschreibung" -> "Kunde"
  const searchTerm = job.name.includes(" – ") ? job.name.split(" – ")[0].trim() : job.name.trim();

  try {
    const searchRes = await fetch(
      `${MOCO_BASE}/companies?term=${encodeURIComponent(searchTerm)}&type=customer`,
      { headers: MOCO_HEADERS },
    );
    if (!searchRes.ok) throw new Error(`Moco-Suche fehlgeschlagen: ${await searchRes.text()}`);
    const companies = await searchRes.json();

    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(200).json({ matched: false, searchTerm });
    }

    const company = companies[0];
    const kategorienText = Array.isArray(job.kategorien) ? job.kategorien.join(", ") : "";

    const text = [
      `<div><strong>${job.name}</strong> ist abgeschlossen und archiviert – bitte zur Abrechnung vormerken.</div>`,
      job.projekttyp ? `<div>Typ: ${job.projekttyp}${kategorienText ? " – " + kategorienText : ""}</div>` : "",
      job.date ? `<div>Shooting: ${job.date}</div>` : "",
      job.kontakt ? `<div>Kontakt: ${job.kontakt}</div>` : "",
    ].filter(Boolean).join("");

    const commentRes = await fetch(`${MOCO_BASE}/comments`, {
      method: "POST",
      headers: MOCO_HEADERS,
      body: JSON.stringify({
        commentable_id: company.id,
        commentable_type: "Company",
        text,
      }),
    });
    if (!commentRes.ok) throw new Error(`Moco-Notiz fehlgeschlagen: ${await commentRes.text()}`);

    return res.status(200).json({ matched: true, companyName: company.name });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
