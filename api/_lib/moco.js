// Gemeinsame Moco-Hilfsfunktionen, von mehreren Endpunkten genutzt:
// api/moco-create-project.js (manuelles Formular), api/parse-input.js und
// api/ai-chat.js (KI-Erfassung), api/v1/jobs.js (externe Integrations-API).
function mocoEnv() {
  const domain = process.env.MOCO_DOMAIN;
  const key = process.env.MOCO_API_KEY;
  if (!domain || !key) return null;
  return {
    base: `https://${domain}.mocoapp.com/api/v1`,
    headers: { "Authorization": `Token token=${key}`, "Content-Type": "application/json" },
  };
}

export async function mocoSearchCompany(term) {
  const env = mocoEnv();
  if (!env) throw new Error("MOCO_DOMAIN oder MOCO_API_KEY fehlt.");
  const r = await fetch(`${env.base}/companies?term=${encodeURIComponent(term)}&type=customer`, { headers: env.headers });
  if (!r.ok) throw new Error(`Moco-Suche fehlgeschlagen: ${await r.text()}`);
  const companies = await r.json();
  return Array.isArray(companies) && companies.length > 0 ? companies[0] : null;
}

// Versucht, den Projekt-Verantwortlichen anhand des ersten zugeordneten
// Teammitglieds im Moco-Nutzerstamm zu finden (Vor-/Nachname, case-insensitive).
// Ohne Treffer bzw. ohne zugeordnete Person fällt es auf den Moco-Account
// zurück, zu dem der API-Key gehört.
export async function mocoResolveLeaderId(personName) {
  const env = mocoEnv();
  if (!env) throw new Error("MOCO_DOMAIN oder MOCO_API_KEY fehlt.");
  if (personName) {
    try {
      const r = await fetch(`${env.base}/users?active=true`, { headers: env.headers });
      if (r.ok) {
        const users = await r.json();
        const needle = personName.trim().toLowerCase();
        const match = (Array.isArray(users) ? users : []).find(u => {
          const full = `${u.firstname || ""} ${u.lastname || ""}`.trim().toLowerCase();
          return full === needle || u.firstname?.toLowerCase() === needle || full.includes(needle);
        });
        if (match) return match.id;
      }
    } catch { /* fällt unten auf den Account-Owner zurück */ }
  }
  const meRes = await fetch(`${env.base}/users/me`, { headers: env.headers });
  if (!meRes.ok) throw new Error(`Moco-Nutzer (API-Key-Besitzer) nicht ermittelbar: ${await meRes.text()}`);
  const me = await meRes.json();
  return me.id;
}

export async function mocoCreateProject({ name, customerId, leaderId, currency = "EUR" }) {
  const env = mocoEnv();
  if (!env) throw new Error("MOCO_DOMAIN oder MOCO_API_KEY fehlt.");
  const r = await fetch(`${env.base}/projects`, {
    method: "POST", headers: env.headers,
    body: JSON.stringify({ name, customer_id: customerId, leader_id: leaderId, currency }),
  });
  if (!r.ok) throw new Error(`Moco-Projekt anlegen fehlgeschlagen: ${await r.text()}`);
  return r.json();
}

// Orchestriert die Projektanlage für einen frisch angelegten Job: sucht die
// passende Firma, ermittelt den Verantwortlichen und legt das Projekt an.
// Gibt {matched:false, searchTerm} zurück, wenn keine Firma gefunden wurde -
// das ist kein Fehler, sondern ein normaler Fall (noch kein Moco-Kunde).

function fmtDateDE(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

// Feste Leistungsbeschreibung, 1:1 aus einer echten Fotobox-Rechnung
// (R260123) übernommen - erscheint als separater Text-Posten unter der
// eigentlichen Position, genau wie im Vorlagen-Layout.
const FOTOBOX_LEISTUNGEN = [
  "Fotobox mit digitaler Spiegelreflex-Kamera (DSLR)",
  "Professioneller Superblitz für eine optimale Belichtung",
  "400 Fotoausdrucken 10 x 15 cm",
  "Bedienungsfreundlicher Fotodrucker",
  "Online-Galerie mit allen Fotos nach der Veranstaltung",
];

// Legt eine Rechnung in Moco für eine Fotobox-Buchung an (Button "Rechnung
// in Moco erstellen" im Fotobox-Formular), nach dem Vorbild der echten
// Rechnung R260123 ("Rechnung für die Miete der Fotobox"): eine
// Sammelposition "Fotobox mit Auf-/Abbau" (Box-Preis + Aufbaukosten
// zusammen) plus ein Text-Posten darunter mit Datum/Ort und der festen
// Leistungsbeschreibung.
// Hinweis: Feldnamen der Moco-Rechnungs-API (items/recipient_address/...)
// sind nach bestem Wissen aus der bestehenden Moco-Anbindung bzw. dem
// Rechnungs-Layout übernommen, konnten in dieser Umgebung aber nicht
// gegen einen echten Moco-Account getestet werden (kein Netzwerkzugriff
// auf mocoapp.com im Dev-Sandbox) - bei abweichendem Verhalten bitte
// Rückmeldung, dann wird nachjustiert.
export async function mocoCreateInvoiceForBooking(booking) {
  const env = mocoEnv();
  if (!env) throw new Error("MOCO_DOMAIN oder MOCO_API_KEY fehlt.");
  const searchTerm = booking.billing_company || booking.title;
  if (!searchTerm) throw new Error("Keine Rechnungsfirma/kein Titel für die Moco-Suche angegeben.");
  const company = await mocoSearchCompany(searchTerm);
  if (!company) throw new Error(`Keine passende Firma in Moco gefunden für "${searchTerm}". Bitte Rechnungsfirma prüfen/in Moco anlegen.`);

  const boxPrice = booking.custom_price ?? booking.price_net ?? 0;
  const totalPrice = boxPrice + (booking.setup_cost || 0);
  if (!totalPrice) throw new Error("Kein Preis hinterlegt - Rechnung kann nicht erstellt werden.");

  const descriptionLines = [];
  if (booking.start_date) descriptionLines.push(`Datum: ${fmtDateDE(booking.start_date)}`);
  if (booking.location) descriptionLines.push(`Ort: ${booking.location}`);
  descriptionLines.push("");
  FOTOBOX_LEISTUNGEN.forEach(l => descriptionLines.push(`- ${l}`));
  if (booking.logistics === "aufbau") descriptionLines.push("- Auf-/Abbau");

  const items = [
    { type: "item", title: "Fotobox mit Auf-/Abbau", quantity: 1, unit: "Stk", unit_price: totalPrice },
    { type: "text", title: descriptionLines.join("\n") },
  ];

  const todayStr = new Date().toISOString().slice(0, 10);
  const dueDateStr = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const recipientAddress = [booking.billing_company, booking.billing_address].filter(Boolean).join("\n") || company.name;

  const r = await fetch(`${env.base}/invoices`, {
    method: "POST", headers: env.headers,
    body: JSON.stringify({
      customer_id: company.id,
      recipient_address: recipientAddress,
      title: "Rechnung für die Miete der Fotobox",
      date: todayStr, due_date: dueDateStr, currency: "EUR", tax: 19.0, items,
    }),
  });
  if (!r.ok) throw new Error(`Moco-Rechnung anlegen fehlgeschlagen: ${await r.text()}`);
  const invoice = await r.json();
  return { invoiceId: invoice.id, invoiceNumber: invoice.identifier || invoice.invoice_number || null, companyName: company.name };
}

// Ersetzt den vollständigen Tag-Satz eines Moco-Projekts (Taggings-API,
// separat von der Projekt-Update-Mutation) - genutzt, um den App-Status
// eines Grafik-Jobs 1:1 als Projekt-Tag in Moco zu spiegeln (die 6 Tags
// Offen/Läuft/Überprüfen/Kann abgerechnet werden/Abgeschlossen/Nicht
// abrechnen existieren dort bereits als Auswahlmöglichkeiten).
export async function mocoSetProjectTag(projectId, tag) {
  const env = mocoEnv();
  if (!env) throw new Error("MOCO_DOMAIN oder MOCO_API_KEY fehlt.");
  if (!projectId) throw new Error("Keine Moco-Projekt-ID übermittelt.");
  const r = await fetch(`${env.base}/taggings/projects/${projectId}`, {
    method: "PUT", headers: env.headers,
    body: JSON.stringify({ tags: [tag] }),
  });
  if (!r.ok) throw new Error(`Moco-Status setzen fehlgeschlagen: ${await r.text()}`);
  return r.json();
}

export async function mocoCreateProjectForJob(job) {
  if (!job?.name) throw new Error("Kein Job übermittelt");
  const searchTerm = job.name.includes(" | ") ? job.name.split(" | ")[0].trim() : job.name.trim();
  const company = await mocoSearchCompany(searchTerm);
  if (!company) return { matched: false, searchTerm };

  const leaderId = await mocoResolveLeaderId(Array.isArray(job.personen) ? job.personen[0] : null);
  const project = await mocoCreateProject({ name: job.name, customerId: company.id, leaderId });
  return { matched: true, companyName: company.name, projectId: project.id, projectName: project.name };
}
