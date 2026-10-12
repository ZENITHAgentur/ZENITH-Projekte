import { mocoCreateInvoiceForBooking } from "./_lib/moco.js";

// Button "Rechnung in Moco erstellen" im Fotobox-Formular: legt anhand der
// im Formular hinterlegten Preis-/Rechnungsadressdaten automatisiert eine
// Rechnung in Moco an.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { booking } = req.body || {};
  if (!booking) return res.status(400).json({ error: "Keine Buchung übermittelt" });

  try {
    const result = await mocoCreateInvoiceForBooking(booking);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
