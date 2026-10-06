import { createClient } from "@supabase/supabase-js";

// Serverseitiger Supabase-Client für die Vercel-Functions in api/. Nutzt
// bewusst denselben Anon-Key wie das Frontend (RLS ist projektweit auf
// "anon_all" gesetzt, siehe Fahrplan) - kein zusätzliches Secret nötig.
export function supabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
}
