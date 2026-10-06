import { supabase } from "./supabase.js";

// Übernommen aus der alten Fotostudio-Jobliste (src/lib/attachments.js).
const BUCKET = "job-attachments";
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20 MB

// Lädt eine Datei (Bild oder PDF) in den öffentlichen Storage-Bucket hoch und
// gibt die Metadaten zurück, die im Job als Anhang gespeichert werden. Der
// Pfad ist bewusst flach (keine Job-ID nötig), da beim Anlegen eines neuen
// Jobs noch keine ID existiert.
export async function uploadAttachment(file) {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`Datei zu groß (max. ${Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)} MB)`);
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    name: file.name,
    path,
    url: data.publicUrl,
    size: file.size,
    type: file.type || "",
    uploadedAt: new Date().toISOString(),
  };
}

export async function deleteAttachment(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
