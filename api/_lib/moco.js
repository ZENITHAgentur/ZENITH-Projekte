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
export async function mocoCreateProjectForJob(job) {
  if (!job?.name) throw new Error("Kein Job übermittelt");
  const searchTerm = job.name.includes(" – ") ? job.name.split(" – ")[0].trim() : job.name.trim();
  const company = await mocoSearchCompany(searchTerm);
  if (!company) return { matched: false, searchTerm };

  const leaderId = await mocoResolveLeaderId(Array.isArray(job.personen) ? job.personen[0] : null);
  const project = await mocoCreateProject({ name: job.name, customerId: company.id, leaderId });
  return { matched: true, companyName: company.name, projectId: project.id, projectName: project.name };
}
