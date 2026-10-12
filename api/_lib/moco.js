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
// Legt eine Rechnung in Moco für eine Fotobox-Buchung an (Button "Rechnung
// in Moco erstellen" im Fotobox-Formular). Sucht die Firma über
// billing_company (Fallback: Titel), ein Posten für den Fotobox-Preis sowie
// - falls vorhanden - einen zweiten Posten für die Aufbaukosten.
// Hinweis: Feldnamen der Moco-Rechnungs-API (items/recipient_address/...)
// sind nach bestem Wissen aus der bestehenden Moco-Anbindung übernommen,
// konnten in dieser Umgebung aber nicht gegen einen echten Moco-Account
// getestet werden (kein Netzwerkzugriff auf mocoapp.com im Dev-Sandbox) -
// bei abweichendem Verhalten bitte Rückmeldung, dann wird nachjustiert.
export async function mocoCreateInvoiceForBooking(booking) {
  const env = mocoEnv();
  if (!env) throw new Error("MOCO_DOMAIN oder MOCO_API_KEY fehlt.");
  const searchTerm = booking.billing_company || booking.title;
  if (!searchTerm) throw new Error("Keine Rechnungsfirma/kein Titel für die Moco-Suche angegeben.");
  const company = await mocoSearchCompany(searchTerm);
  if (!company) throw new Error(`Keine passende Firma in Moco gefunden für "${searchTerm}". Bitte Rechnungsfirma prüfen/in Moco anlegen.`);

  const items = [];
  const boxPrice = booking.custom_price ?? booking.price_net;
  if (boxPrice) items.push({ type: "item", title: booking.title || "Fotobox-Miete", quantity: 1, unit: "Stück", unit_price: boxPrice });
  if (booking.setup_cost) items.push({ type: "item", title: "Auf-/Abbau & Logistik", quantity: 1, unit: "Pauschale", unit_price: booking.setup_cost });
  if (items.length === 0) throw new Error("Kein Preis hinterlegt - Rechnung kann nicht erstellt werden.");

  const todayStr = new Date().toISOString().slice(0, 10);
  const dueDateStr = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const r = await fetch(`${env.base}/invoices`, {
    method: "POST", headers: env.headers,
    body: JSON.stringify({
      customer_id: company.id,
      recipient_address: booking.billing_address || company.name,
      title: booking.title || "Fotobox-Miete",
      date: todayStr, due_date: dueDateStr, currency: "EUR", items,
    }),
  });
  if (!r.ok) throw new Error(`Moco-Rechnung anlegen fehlgeschlagen: ${await r.text()}`);
  const invoice = await r.json();
  return { invoiceId: invoice.id, invoiceNumber: invoice.identifier || invoice.invoice_number || null, companyName: company.name };
}

export async function mocoCreateProjectForJob(job) {
  if (!job?.name) throw new Error("Kein Job übermittelt");
  const searchTerm = job.name.includes(" – ") ? job.name.split(" – ")[0].trim() : job.name.trim();
  const company = await mocoSearchCompany(searchTerm);
  if (!company) return { matched: false, searchTerm };

  const leaderId = await mocoResolveLeaderId(Array.isArray(job.personen) ? job.personen[0] : null);
  const project = await mocoCreateProject({ name: job.name, customerId: company.id, leaderId });
  return { matched: true, companyName: company.name, projectId: project.id, projectName: project.name };
}
