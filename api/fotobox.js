import { mocoCreateInvoiceForBooking } from "./_lib/moco.js";

// Fotobox-Hilfsendpunkte, in einer Datei zusammengefasst (Vercel Hobby-Plan
// erlaubt max. 12 Serverless Functions pro Deployment - siehe
// https://vercel.link/function-count-limit): per "action" im Body wird
// zwischen Aufbaukosten-Schätzung und Moco-Rechnungserstellung unterschieden.

// Schätzt die Aufbaukosten einer Fotobox-Buchung anhand der Luftlinien-
// entfernung zwischen Studio-Adresse (Umgebungsvariable FOTOBOX_STUDIO_ADDRESS)
// und der Veranstaltungsadresse. Geocoding über OpenStreetMap Nominatim
// (kostenlos, kein API-Key nötig) - "Umkreis" im Sinne der Anforderung ist
// Luftlinie, keine gefahrene Strecke.
async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const r = await fetch(url, { headers: { "User-Agent": "ZenithProjekte/1.0 (intern)" } });
  if (!r.ok) throw new Error(`Geocoding fehlgeschlagen: ${await r.text()}`);
  const results = await r.json();
  if (!Array.isArray(results) || results.length === 0) throw new Error(`Adresse nicht gefunden: "${address}"`);
  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

async function handleDistance(body, res) {
  const { address } = body || {};
  if (!address) return res.status(400).json({ error: "Keine Adresse übermittelt" });

  const studioAddress = process.env.FOTOBOX_STUDIO_ADDRESS;
  if (!studioAddress) return res.status(500).json({ error: "FOTOBOX_STUDIO_ADDRESS ist nicht konfiguriert (Vercel-Umgebungsvariable)." });

  const [origin, dest] = await Promise.all([geocode(studioAddress), geocode(address)]);
  const distanceKm = Math.round(haversineKm(origin, dest) * 10) / 10;

  let cost, basis;
  if (distanceKm <= 20) {
    cost = 70; basis = "Pauschale ≤20 km";
  } else if (distanceKm <= 50) {
    cost = 100; basis = "Pauschale 20–50 km";
  } else {
    // >50 km: nach Stunden - 1h Auf-, 1h Abbau + geschätzte Fahrtzeit
    // (Hin- und Rückweg) bei angenommenen 70 km/h Durchschnitts-
    // geschwindigkeit, auf halbe Stunden aufgerundet, je Stunde 50 €.
    const travelHours = (2 * distanceKm) / 70;
    const hours = Math.ceil((2 + travelHours) * 2) / 2;
    cost = Math.round(hours * 50);
    basis = `Stundenbasis: 2h Auf-/Abbau + ${travelHours.toFixed(1)}h Fahrtzeit ≈ ${hours}h × 50 €`;
  }

  return res.status(200).json({ distanceKm, cost, basis });
}

async function handleInvoice(body, res) {
  const { booking } = body || {};
  if (!booking) return res.status(400).json({ error: "Keine Buchung übermittelt" });
  const result = await mocoCreateInvoiceForBooking(booking);
  return res.status(200).json(result);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body || {};
  try {
    if (action === "distance") return await handleDistance(req.body, res);
    if (action === "invoice") return await handleInvoice(req.body, res);
    return res.status(400).json({ error: "Unbekannte action - erwartet 'distance' oder 'invoice'." });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
