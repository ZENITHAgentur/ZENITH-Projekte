// Postet eine kurze Nachricht in einen Microsoft-Teams-Kanal, sobald
// Personen einem Job zugeordnet werden - über eine Incoming-Webhook-URL
// (TEAMS_WEBHOOK_URL), kein Azure-App-Setup nötig. Läuft best effort und
// wirft nie, damit eine fehlende/kaputte Webhook-URL die Jobanlage nie blockiert.
export async function notifyTeamsBooking({ names, jobName, bereich }) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl || !Array.isArray(names) || names.length === 0) return;

  const nameList = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
  const verb = names.length === 1 ? "wurde" : "wurden";
  const text = `👥 **${nameList}** ${verb} auf **${jobName}**${bereich ? ` (${bereich})` : ""} gebucht.`;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("Teams-Benachrichtigung fehlgeschlagen:", e.message);
  }
}
