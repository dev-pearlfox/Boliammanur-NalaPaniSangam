// Loaded first. The Supabase client and the tiny helpers every other dashboard script uses.
// The dashboard keeps its session under its OWN storage key. The Accounts page uses Supabase's default key, so
// signing in on one page never signs you in on the other (they have different passwords).
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: "boliammanur-dashboard-auth" } });

const $ = (id) => document.getElementById(id);

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setStatus(id, message, isError) {
  const el = $(id);
  el.textContent = message || "";
  el.className = "status " + (isError ? "error" : "ok");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
