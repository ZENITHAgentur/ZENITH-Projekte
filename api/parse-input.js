import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { mocoCreateProjectForJob } from "./_lib/moco.js";

// KI-Erfassung für die "Neuer Job"-Maske (Foto-/Videoproduktion): erkennt aus
// Freitext, Diktat (Spracherkennung läuft clientseitig) und/oder einem
// angehängten Foto/PDF/Excel einen oder mehrere Jobs und legt sie direkt an.
// Übernommen aus der alten Fotostudio-Jobliste (api/parse-input.js), um
// Outlook-/Asana-Sync bereinigt (hier nicht vorhanden) und an das neue
// js_jobs-Schema (personen/kategorien als Arrays, ort, bereich) angepasst.
const MODEL = "claude-sonnet-5-5";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY fehlt." });

  const { text, fileBase64, mediaType, fileName, team } = req.body || {};
  const trimmedText = (text || "").trim();
  if (!trimmedText && !fileBase64) return res.status(400).json({ error: "Kein Text und keine Datei übermittelt" });

  const today = new Date().toISOString().split("T")[0];

  const EXCEL_MEDIA_TYPES = new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ]);
  const isExcel = !!fileBase64 && (EXCEL_MEDIA_TYPES.has(mediaType) || /\.xlsx?$/i.test(fileName || ""));

  let effectiveText = trimmedText;
  let effectiveFileBase64 = fileBase64;
  let effectiveMediaType = mediaType;
  const MAX_SHEET_TEXT_CHARS = 80000;

  if (isExcel) {
    try {
      const XLSX = await import("xlsx");
      const buffer = Buffer.from(fileBase64, "base64");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      let sheetsText = workbook.SheetNames.map(name => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
        return `--- Tabellenblatt: ${name} ---\n${csv}`;
      }).join("\n\n");
      if (sheetsText.length > MAX_SHEET_TEXT_CHARS) {
        sheetsText = sheetsText.slice(0, MAX_SHEET_TEXT_CHARS) + "\n... (gekürzt, Tabelle zu groß)";
      }
      effectiveText = trimmedText ? `${trimmedText}\n\n${sheetsText}` : sheetsText;
      effectiveFileBase64 = undefined;
      effectiveMediaType = undefined;
    } catch (e) {
      return res.status(400).json({ error: "Excel-Datei konnte nicht gelesen werden: " + e.message });
    }
  }

  const inputDescription = isExcel
    ? "eine Excel-Tabelle mit Auftragsdaten"
    : fileBase64
      ? (trimmedText ? "ein angehängtes Dokument/Foto sowie zusätzlichen Text" : "ein angehängtes Dokument oder Foto (z.B. eine handschriftliche oder gedruckte Auftrags-/Terminliste)")
      : "einen Text (z.B. eine Kunden-E-Mail, ein Diktat oder eine Notiz)";

  const teamText = Array.isArray(team) && team.length ? `Bekanntes Team: ${team.join(", ")}.` : "";

  const promptText = `Analysiere die folgende Eingabe für ein Fotostudio: ${inputDescription}.
Erkenne alle darin enthaltenen Foto-/Video-Produktionsjobs und gib sie als JSON-Array zurück. ${teamText}

Für jeden Job folgendes Format:
{
  "name": "Kundenname – Auftragsbeschreibung",
  "projekttyp": "Fotografie" oder "Video",
  "kategorien": Array aus: ["Freistellerfotos","Milieufotos","Porträtfotos","Produktfotos","Reportage","Sonstiges","Imagefilm","Produktvideo","Social Media Clip","Reels / TikTok","Interview"],
  "prio": "Hoch" oder "Mittel" oder "Niedrig",
  "aufwand": "Klein" oder "Mittel" oder "Groß",
  "ort": "Im Haus" oder "Außer Haus",
  "personen": Array von Namen aus dem bekannten Team, falls erkennbar, sonst leeres Array,
  "date": "YYYY-MM-DD" oder null (gewünschter Shooting-Termin, falls erkennbar),
  "abgabe": "YYYY-MM-DD" oder null (Deadline/Liefertermin, falls erkennbar),
  "kontakt": "E-Mail oder Telefonnummer des Kunden, falls erkennbar, sonst leerer String",
  "notizen": "Alle wichtigen Details: Wünsche, Mengen, Artikelnummern, Aufnahmearten, Besonderheiten"
}

Regeln:
- Enthält die Eingabe mehrere unterschiedliche Aufträge oder Serien, erstelle mehrere Einträge im Array.
- Verschiedene Farben/Varianten derselben Serie zählen als ein Job, nicht mehrere.
- Erkenne auch relative Datumsangaben (z.B. "nächsten Montag", "in zwei Wochen") und rechne sie in ein konkretes Datum um. Heutiges Datum: ${today}.
- Ist kein konkretes Datum erkennbar, setze date bzw. abgabe auf null.
- prio "Hoch" bei erkennbarer Dringlichkeit oder kurzfristigen Terminen, sonst "Mittel".
- Ist kein Fotostudio-Auftrag erkennbar, antworte mit einem leeren Array [].

Antworte NUR mit dem JSON-Array, ohne Erklärung, ohne Markdown-Backticks.${effectiveText ? `\n\nZusätzlicher Text:\n"""\n${effectiveText}\n"""` : ""}`;

  const contentBlocks = [];
  if (effectiveFileBase64) {
    contentBlocks.push(
      effectiveMediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: effectiveMediaType, data: effectiveFileBase64 } }
        : { type: "image", source: { type: "base64", media_type: effectiveMediaType || "image/jpeg", data: effectiveFileBase64 } }
    );
  }
  contentBlocks.push({ type: "text", text: promptText });

  const headers = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  if (effectiveMediaType === "application/pdf") headers["anthropic-beta"] = "pdfs-2024-09-25";

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: contentBlocks }] }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    return res.status(502).json({ error: "KI-Anfrage fehlgeschlagen: " + err.slice(0, 400) });
  }

  const claudeData = await claudeRes.json();
  const responseText = (claudeData.content || []).filter(b => b.type === "text").map(b => b.text).join("");

  let jobs;
  try {
    const clean = responseText.replace(/```json|```/g, "").trim();
    jobs = JSON.parse(clean);
    if (!Array.isArray(jobs)) throw new Error("Kein Array");
  } catch (e) {
    return res.status(500).json({ error: "Antwort konnte nicht gelesen werden: " + e.message });
  }

  if (jobs.length === 0) return res.status(200).json({ count: 0, jobs: [] });

  const rows = jobs.map(j => ({
    name: j.name || "Unbekannt", status: "Neu", prio: j.prio || "Mittel", aufwand: j.aufwand || "Mittel",
    ort: j.ort === "Außer Haus" ? "Außer Haus" : "Im Haus", personen: Array.isArray(j.personen) ? j.personen : [],
    person: (Array.isArray(j.personen) ? j.personen : []).join(", "), date: j.date || null, abgabe: j.abgabe || null,
    kontakt: j.kontakt || "", notizen: j.notizen || "", projekttyp: j.projekttyp || "Fotografie",
    kategorien: Array.isArray(j.kategorien) ? j.kategorien : [], bereich: "Produktion",
  }));

  const sb = supabaseAdmin();
  const { data: inserted, error } = await sb.from("js_jobs").insert(rows).select();
  if (error) return res.status(500).json({ error: "Speichern fehlgeschlagen: " + error.message });

  // Für jeden neu angelegten Job direkt (nicht erst beim Archivieren) ein
  // Moco-Projekt beim passenden Kunden anlegen, damit das Team sofort Zeiten
  // buchen kann - best effort, lässt die Jobanlage nie fehlschlagen.
  await Promise.all(inserted.map(job => mocoCreateProjectForJob(job).catch(e => console.error("Moco-Projekt (KI-Erfassung):", e.message))));

  return res.status(200).json({ count: inserted.length, jobs: inserted });
}
