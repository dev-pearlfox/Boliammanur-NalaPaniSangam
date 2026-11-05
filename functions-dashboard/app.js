// App shell: sign-in gate, the three sections (tabs), and the banner for load problems.
// The sections themselves live in overview.js, explore.js and admin.js.

// ---------- Sign-in gate (Supabase Auth) ----------
// The Dashboard has its own login (DASHBOARD_EMAIL in supabase-config.js; users type only the password), separate
// from the Accounts page's. The session lives under the dashboard's own storage key (core.js), so the two pages
// never share a sign-in. The database only lets a signed-in user read anything, which is why the old password-only
// gate (which never signed in) could not see any data.

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("gate-status", "Signing in...", false);
  const { error } = await client.auth.signInWithPassword({ email: DASHBOARD_EMAIL, password: $("gate-password").value });
  if (error) {
    setStatus("gate-status", error.message || "Sign-in failed.", true);
    return;
  }
  unlockApp();
});

let unlocked = false;
function unlockApp() {
  if (unlocked) return;
  unlocked = true;
  $("gate-password").value = "";   // don't leave the password sitting in the page
  $("gate").classList.add("hidden");
  $("app").classList.remove("hidden");
  showSection(location.hash.slice(1));
  refreshAll();
}

client.auth.getSession().then(({ data }) => {
  if (data.session) unlockApp();
});
client.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") location.reload();
});

// ---------- Sections ----------

const SECTIONS = ["overview", "explore", "admin"];
const RENDERERS = { overview: renderOverview, explore: renderExplore, admin: renderAdmin };
let currentSection = "overview";
let dataLoaded = false;

// Charts need a visible canvas to size themselves, so a section is rendered when it is shown (and after a reload).
function renderSection(name) {
  if (!dataLoaded) return;
  RENDERERS[name]();
  syncSwipeHints();   // widgets.js
}

function showSection(name) {
  currentSection = SECTIONS.includes(name) ? name : "overview";
  SECTIONS.forEach((s) => {
    $("section-" + s).classList.toggle("hidden", s !== currentSection);
    $("tab-" + s).setAttribute("aria-selected", String(s === currentSection));
  });
  // replaceState keeps the URL shareable (#explore) without making the browser jump or pile up history entries.
  if (location.hash !== "#" + currentSection) history.replaceState(null, "", "#" + currentSection);
  renderSection(currentSection);
}

document.querySelector(".tabs").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-section]");
  if (tab) showSection(tab.dataset.section);
});
window.addEventListener("hashchange", () => showSection(location.hash.slice(1)));

// Reload everything from the database, then redraw the section on screen.
async function refreshAll() {
  const problems = await loadAll();
  dataLoaded = true;
  const banner = $("data-banner");
  banner.textContent = problems.join(" ");
  banner.classList.toggle("hidden", problems.length === 0);
  renderSection(currentSection);
}
