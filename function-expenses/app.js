const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let people = [];
let functionsList = [];
let ledgerEntries = [];
let selectedYear = null;
let selectedFunctionId = null;
// Whether the user has toggled the ledger table closed via the members
// count button — preserved across re-renders so a follow-up render
// (adding a new row, switching function, save success, etc.) doesn't
// un-hide the table behind their back.
let sheetCollapsed = false;
const saveTimers = {};

const $ = (id) => document.getElementById(id);

// Declared here (not down at the scroll-freeze block further below,
// alongside the rest of that logic) specifically so unlockApp() can reset
// it safely — unlockApp() can run early via the getSession() auto-unlock
// check further down, which may resolve before the scroll-freeze block's
// own `let` declarations would otherwise be reached, and referencing a
// `let` before its declaration throws (temporal dead zone), even from
// inside a function, if that function is CALLED before the declaration
// line has executed.
let freezeArmed = true;

function setStatus(id, message, isError) {
  const el = $(id);
  el.textContent = message || "";
  el.className = "status " + (isError ? "error" : "ok");
}

// escapeHtml, formatMobile, filterMobileInput, syncHeaderTitleCollapse live
// in shared.js (loaded before this file) — kept as one copy with members.js.

// ---------- Login gate (Supabase Auth) ----------
// Shared admin login: users only type a password, the email is fixed in
// supabase-config.js (ADMIN_EMAIL). Supabase persists the session in
// localStorage automatically, so members.html sees the same session and
// refreshes across tabs / reloads don't force re-login until the JWT
// expires (default 1 hour, auto-refreshed by supabase-js).

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = $("gate-password").value;
  setStatus("gate-status", "Signing in...", false);
  const { error } = await client.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password,
  });
  if (error) {
    // Don't leak which of email/password was wrong — Supabase already
    // returns a generic "Invalid login credentials" for that reason.
    setStatus("gate-status", error.message || "Sign-in failed.", true);
    return;
  }
  unlockApp();
});

function unlockApp() {
  // Clear the password field so it doesn't sit in memory / can't be
  // recovered from the DOM after the gate is hidden.
  $("gate-password").value = "";
  $("gate").classList.add("hidden");
  $("app").classList.remove("hidden");
  // #app is display:none behind the gate, so header h1's offsetHeight read
  // as 0 when syncHeaderTitleCollapse() ran on the page's "load" event —
  // its only other triggers are resize/fonts.ready, neither of which fires
  // just from unhiding #app — leaving --header-h1-margin-collapse stuck at
  // 0px for the rest of the session. Re-run it now that h1 is actually
  // laid out, so the scrolled-state header height genuinely shrinks to fit
  // the (now correctly measured) title instead of just visually scaling
  // without reclaiming the freed space.
  syncHeaderTitleCollapse();
  // #gate-password's autofocus scrolls the page to bring it into view
  // during the initial render (its card is taller than a lot of real
  // viewports — on mobile heights specifically, since desktop viewports
  // are almost always tall enough that the gate never needs to scroll at
  // all, which is why this only ever showed up on mobile) — that residual
  // scroll position doesn't reset on its own once #gate is hidden and
  // #app appears. scrollTo(0,0) alone isn't enough to fix it: the passive
  // scrollY>10 shrink listener (further below) is active unconditionally
  // from page load, watching window.scrollY regardless of whether #gate
  // or #app is visible, so the autofocus-scroll itself (well before the
  // user ever touches #app) can already have set is-scrolled — and since
  // that shrink is a one-way latch that never auto-removes (see its own
  // HEART LOGIC comment), resetting the scroll POSITION here doesn't
  // undo a CLASS that was already added. Removing it explicitly, and
  // re-arming the freeze so the very first real scroll inside the app
  // still gets the intended freeze-then-release treatment.
  document.body.classList.remove("is-scrolled");
  freezeArmed = true;
  window.scrollTo(0, 0);
  loadAll();
}

// Auto-unlock if a Supabase session already exists (returning visitor
// whose JWT hasn't expired, or someone who just logged in on members.html
// and came back). getSession() reads from localStorage synchronously
// under the hood but the API is async — we fire-and-forget here so the
// rest of the script can keep initializing without awaiting at top level.
client.auth.getSession().then(({ data: { session } }) => {
  if (session) unlockApp();
});

// If the session is revoked/expires while the app is open (e.g. signOut
// from another tab), bounce back to the gate instead of leaving a
// dead-authenticated UI that silently 401s on every request.
client.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    $("app").classList.add("hidden");
    $("gate").classList.remove("hidden");
    $("gate-password").value = "";
    setStatus("gate-status", "", false);
  }
});

// Logout button lives in the totals-banner. signOutAndReload (shared.js)
// reloads after signOut so no stale in-memory state (open cells,
// debounced timers, cached data) survives past a logout.
$("logout-btn").addEventListener("click", () => {
  if (!window.confirm("Sign out?")) return;
  signOutAndReload(client);
});

// ---------- Scroll-compact shrink ----------
// Same architecture as members.html (see that file's HEART LOGIC index for
// the full reasoning): header + pills + #sheet-title + the ledger sheet's
// own thead all live in one shared .sticky-top-stack (style.css). .pills-
// inline and #sheet-title each shrink via transform:scale() (same
// technique as .members-filter-card — the whole element shrinks as one
// compositor-only unit instead of animating individual children's padding/
// font-size), so each needs its own JS-measured margin-collapse below.
// Measures .pills-inline specifically, not .sheet-filter-card itself —
// that outer card's own width must stay fixed at all times to keep
// matching the spreadsheet's width below it (see .sheet-filter-card's own
// comment in style.css), so it can't be the thing that scales. SCALE here
// must match body.is-scrolled .pills-inline's scale() in style.css.
const SHEET_FILTER_CARD_COMPACT_SCALE = 0.85;
function syncSheetFilterCardCollapse() {
  const pillsInline = document.querySelector(".pills-inline");
  if (!pillsInline) return;
  const collapse = -(pillsInline.offsetHeight * (1 - SHEET_FILTER_CARD_COMPACT_SCALE));
  document.documentElement.style.setProperty("--sheet-filter-card-margin-collapse", collapse + "px");
}
window.addEventListener("resize", syncSheetFilterCardCollapse);
window.addEventListener("load", syncSheetFilterCardCollapse);
if (document.fonts) document.fonts.ready.then(syncSheetFilterCardCollapse);
syncSheetFilterCardCollapse();
// Year/function pill counts (and thus how many lines they wrap onto) change
// every time the user picks a different year/function — re-measuring only
// on load/resize left the card's real height uncorrected after that, the
// same undershoot bug fixed for members.html's pills card.
const sheetFilterCard = document.querySelector(".pills-inline");
if (sheetFilterCard) new MutationObserver(syncSheetFilterCardCollapse).observe(sheetFilterCard, { childList: true, subtree: true, characterData: true });

// #year-pills/#function-pills and #sheet-title's own text span all use
// nowrap + horizontal scroll once compact (style.css) so their content
// never wraps mid-line — but that means an overflowing one's tail end
// gets sliced off flat at the card's edge instead of ending cleanly.
// has-overflow toggles a CSS mask (style.css) that fades that edge into a
// "more content, scroll for it" cue instead — only applied when there's
// actually something to scroll to, so one that already fits (most year
// lists, most function names) is left untouched.
function syncPillRowOverflow() {
  document.querySelectorAll(".sheet-filter-card .pill-row, .sheet-title-inner > span").forEach((row) => {
    row.classList.toggle("has-overflow", row.scrollWidth > row.clientWidth + 1);
  });
}
window.addEventListener("resize", syncPillRowOverflow);
window.addEventListener("load", syncPillRowOverflow);
if (document.fonts) document.fonts.ready.then(syncPillRowOverflow);
syncPillRowOverflow();
if (sheetFilterCard) new MutationObserver(syncPillRowOverflow).observe(sheetFilterCard, { childList: true, subtree: true, characterData: true });
// nowrap only applies once body.is-scrolled (style.css) — a row that
// fits fine while wrapped in the expanded state can still overflow once
// switched to nowrap, so this needs re-checking on every is-scrolled
// toggle too, not just on load/resize/content-change.
new MutationObserver(syncPillRowOverflow).observe(document.body, { attributes: true, attributeFilter: ["class"] });

// Same transform:scale() + margin-collapse technique as
// syncSheetFilterCardCollapse above, for #sheet-title (the function
// name/year heading + உறுப்பினர்கள் toggle button). SCALE here must match
// body.is-scrolled #sheet-title's scale() in style.css.
const SHEET_TITLE_COMPACT_SCALE = 0.7;
function syncSheetTitleCollapse() {
  // Deferred one frame: .sheet-title-inner's width is calc(100%/0.7) of
  // #sheet-title (style.css), and right when this runs off the
  // updateSheetTitle() MutationObserver — synchronously, in the same
  // microtask as the innerHTML change that triggered it — that percentage
  // can still resolve against a not-yet-settled layout, measuring a
  // taller-than-real offsetHeight (confirmed directly: called once inline
  // it read 90px/-27px margin-collapse for a title that actually renders
  // at 44px/-13.2px once layout has genuinely settled, calling it again
  // moments later). Waiting a frame lets the browser finish laying out
  // the new content before measuring it, same fix in spirit as the
  // is-scrolled toggle immediately below being synchronous.
  requestAnimationFrame(() => {
    const title = document.getElementById("sheet-title");
    if (!title) return;
    // Must measure the SCROLLED-state layout height here, not the rest
    // state's — this formula assumes scrolled is just a scaled-down copy
    // of rest's own layout, which broke once body.is-scrolled #sheet-title
    // (style.css) got its own flex-wrap:nowrap: rest can wrap to 2+ lines
    // for a long function name, but scrolled is always forced to exactly
    // one line, a structurally different (usually much shorter) box, not a
    // simple 0.7x scale of the multi-line one. Using rest's height there
    // over-subtracted the margin and pulled the table header up over the
    // title. Toggling is-scrolled here (synchronously, no repaint happens
    // between the two calls) measures the real scrolled-state height
    // directly instead of assuming the ratio.
    const wasScrolled = document.body.classList.contains("is-scrolled");
    if (!wasScrolled) document.body.classList.add("is-scrolled");
    const scrolledHeight = title.offsetHeight;
    if (!wasScrolled) document.body.classList.remove("is-scrolled");
    const collapse = -(scrolledHeight * (1 - SHEET_TITLE_COMPACT_SCALE));
    document.documentElement.style.setProperty("--sheet-title-margin-collapse", collapse + "px");
  });
}
window.addEventListener("resize", syncSheetTitleCollapse);
window.addEventListener("load", syncSheetTitleCollapse);
if (document.fonts) document.fonts.ready.then(syncSheetTitleCollapse);
syncSheetTitleCollapse();
// updateSheetTitle() replaces #sheet-title's entire innerHTML (new function
// name/year, new உறுப்பினர்கள் count) every time the user picks a different
// year/function — same re-measure-on-content-change need as the pills card.
const sheetTitleEl = document.getElementById("sheet-title");
if (sheetTitleEl) new MutationObserver(syncSheetTitleCollapse).observe(sheetTitleEl, { childList: true, subtree: true, characterData: true });
// Belt-and-suspenders on top of the MutationObserver+rAF above: measured
// directly (not just theorized) that the very first post-mutation
// measurement can still land on a transient, too-tall value that never
// self-corrects on its own afterward — confirmed by re-calling
// syncSheetTitleCollapse() manually well after the fact and getting a
// smaller, stable number instead. Rather than chase the exact async cause
// (font shaping/metrics finishing late is the leading suspect, but
// document.fonts.ready is already wired above and didn't catch it),
// ResizeObserver reacts to the actual outcome — #sheet-title's real
// rendered size changing, whatever the reason — so it self-corrects
// whenever that settles, instead of gambling on one specific timing hook
// being the right one. margin-bottom (what this writes) doesn't affect
// #sheet-title's own border-box size, so this can't retrigger itself.
if (sheetTitleEl) new ResizeObserver(syncSheetTitleCollapse).observe(sheetTitleEl);
if (sheetTitleEl) new MutationObserver(syncPillRowOverflow).observe(sheetTitleEl, { childList: true, subtree: true, characterData: true });

// HEART LOGIC — do not change without asking (scrollY-based shrink +
// wheel-delta-gated expand + a post-expand grace period + a re-armable
// scroll freeze). Two earlier versions computed scroll direction by
// diffing window.scrollY between animation frames — unreliable during
// real trackpad momentum scrolling, since the deceleration tail can
// report tiny/jittery or even momentarily-reversed deltas frame to frame,
// so "expand" could fire and then get undone by the very next frame
// misreading its own direction. Wheel events' own deltaY is the actual
// physical input signal (not a derived diff of eased scroll position), so
// it doesn't suffer that jitter — used for both the expand check and the
// freeze check below. Shrinking itself stays the simple, already-
// confirmed-reliable scrollY>10 check (any scroll method — wheel,
// scrollbar, keyboard — not just wheel), but the same wheel gesture that
// triggers an expand also keeps scrolling the page (there's one shared
// page-level scroll, not a separate non-scrolling header zone), so its
// trailing native "scroll" events — and momentum after it — would
// otherwise immediately re-shrink it. suppressShrinkUntil is a short
// grace window after an expand during which the shrink check is skipped,
// so that same gesture can't undo itself.
let scrollTicking = false;
let suppressShrinkUntil = 0;
function updateScrollCompactState() {
  if (window.scrollY > 10 && Date.now() > suppressShrinkUntil) {
    document.body.classList.add("is-scrolled");
  }
  scrollTicking = false;
}
window.addEventListener(
  "scroll",
  () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateScrollCompactState);
  },
  { passive: true }
);

// Freeze: whenever the top content is expanded (freezeArmed) and the user
// starts to scroll down, the spreadsheet is held exactly where it is —
// not necessarily scrollY 0; see freezeHoldY — while the shrink animation
// plays, then released after ~350ms so the NEXT scroll is what actually
// moves the spreadsheet. Re-arms every time the header expands again (see
// freezeArmed = true in the wheel-expand handler below) — by explicit
// request, this isn't a one-time-on-page-load thing, it applies to every
// expand→scroll-down transition for the life of the page.
//
// The actual block is position:fixed on <body> (with a negative top offset
// compensating so nothing visually jumps), NOT overflow:hidden and NOT
// preventDefault() on wheel events alone — two earlier versions tried
// both and both leaked under a real trackpad in real Chrome. A fast/big
// trackpad flick starts a momentum/fling animation that Chrome runs on
// the compositor thread, independent of the main JS thread; once that
// fling has begun, neither cancelling later wheel events nor toggling
// overflow reliably stops it — the fling can keep running to completion
// regardless, easily outlasting a fixed freeze timer. position:fixed
// removes <body> from the scrollable flow entirely, so there is no
// scrollable content left for a fling to move — not "discouraged",
// structurally impossible — which is the same technique production
// scroll-lock libraries use for exactly this class of bug. The
// preventDefault() calls on wheel/touchmove/keydown are kept as a
// first-line catch for the common case (stops the scroll before the lock
// even needs to engage, when timing lines up) — position:fixed is what
// guarantees the freeze holds even when it doesn't.
// Pinning <body> alone isn't enough: is-scrolled also transitions the
// header/pills/#sheet-title's margin-bottom (not just their compositor-
// only transform) over the same ~200ms, which shrinks .sticky-top-stack's
// real document height as it plays — that pulls everything below it
// (<main>, i.e. the spreadsheet) upward in the document, independent of
// scroll position, so body's fixed offset alone doesn't stop it from
// visibly drifting during the freeze. <main> is pinned separately here,
// at its own on-screen position captured before anything shrinks, so it
// can't move regardless of what the header's layout does above it. This
// doesn't touch the header/title margin-collapse mechanism itself (HEART
// LOGIC elsewhere in this file/style.css) — it just holds <main> still
// alongside it. freezeArmed itself is declared up near the top of this
// file, not here — see that declaration's own comment for why.
let freezeActive = false;
let freezeHoldY = 0;
// Tracks the last confirmed scroll position while genuinely un-frozen —
// used instead of a live window.scrollY read inside beginFreeze(), since
// a very fast/big gesture can let the compositor start an optimistic
// scroll before our event handler even runs (see beginFreeze's own
// comment); reading scrollY at that point would lock in the
// already-leaked position instead of correcting back to the clean one.
let freezeLastKnownScrollY = window.scrollY;
const mainEl = document.querySelector("main");
function beginFreeze() {
  if (!freezeArmed || freezeActive) return;
  freezeArmed = false;
  freezeActive = true;
  freezeHoldY = freezeLastKnownScrollY;
  // Correct any lead-in leak (see comment on freezeLastKnownScrollY above)
  // before measuring <main>'s position, so the lock captures the clean
  // pre-gesture layout, not a slightly-already-scrolled one.
  if (window.scrollY !== freezeHoldY) window.scrollTo(0, freezeHoldY);
  const mainTop = mainEl.getBoundingClientRect().top;
  document.body.classList.add("is-scrolled");
  document.body.style.position = "fixed";
  document.body.style.top = -freezeHoldY + "px";
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  mainEl.style.position = "fixed";
  mainEl.style.top = mainTop + "px";
  mainEl.style.left = "0";
  mainEl.style.right = "0";
  setTimeout(() => {
    freezeActive = false;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    mainEl.style.position = "";
    mainEl.style.top = "";
    mainEl.style.left = "";
    mainEl.style.right = "";
    window.scrollTo(0, freezeHoldY);
    freezeLastKnownScrollY = freezeHoldY;
  }, 350);
}
function onWheelForFreeze(e) {
  if (e.deltaY <= 0 || (!freezeArmed && !freezeActive)) return;
  e.preventDefault();
  beginFreeze();
}
let freezeTouchStartY = null;
function onTouchStartForFreeze(e) {
  freezeTouchStartY = e.touches[0].clientY;
}
function onTouchMoveForFreeze(e) {
  if (freezeTouchStartY === null || (!freezeArmed && !freezeActive)) return;
  if (freezeTouchStartY - e.touches[0].clientY > 0) {
    e.preventDefault();
    beginFreeze();
  }
}
const FREEZE_DOWN_KEYS = new Set(["ArrowDown", "PageDown", " ", "End"]);
function onKeyForFreeze(e) {
  if (!FREEZE_DOWN_KEYS.has(e.key) || (!freezeArmed && !freezeActive)) return;
  e.preventDefault();
  beginFreeze();
}
window.addEventListener("wheel", onWheelForFreeze, { passive: false });
window.addEventListener("touchstart", onTouchStartForFreeze, { passive: true });
window.addEventListener("touchmove", onTouchMoveForFreeze, { passive: false });
window.addEventListener("keydown", onKeyForFreeze);
// Scrollbar-dragging fires none of the above — it's not a cancelable
// input event, just a resulting "scroll". Catch it here: if scrollY moved
// while still armed (nothing else caught it first), snap back to where it
// was and begin the freeze from there instead. Also keeps
// freezeLastKnownScrollY (declared above, used by beginFreeze) current.
window.addEventListener(
  "scroll",
  () => {
    if (freezeActive) return;
    // Only a DOWNWARD drift counts as an uncaught scrollbar-drag needing a
    // freeze — an upward one is just as likely to be the natural scroll
    // that a wheel-over-header expand causes on its own (freezeArmed is
    // set true synchronously right before that scroll fires), and treating
    // that as a fresh down-attempt would immediately re-shrink what was
    // just expanded.
    if (freezeArmed && window.scrollY > freezeLastKnownScrollY) {
      window.scrollTo(0, freezeLastKnownScrollY);
      beginFreeze();
    }
    freezeLastKnownScrollY = window.scrollY;
  },
  { passive: true }
);

const stickyTopStackEl = document.querySelector(".sticky-top-stack");
window.addEventListener(
  "wheel",
  (e) => {
    if (e.deltaY >= 0 || !stickyTopStackEl) return;
    const rect = stickyTopStackEl.getBoundingClientRect();
    if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
      document.body.classList.remove("is-scrolled");
      suppressShrinkUntil = Date.now() + 600;
      freezeArmed = true;
    }
  },
  { passive: true }
);
updateScrollCompactState();

// ---------- Data loading ----------

async function loadAll() {
  await loadPeople();
  await loadFunctions();
  await loadLedgerEntries();
}

async function loadPeople() {
  const { data, error } = await client.from("people").select("*").order("member_no", { ascending: true, nullsFirst: false }).order("name");
  if (error) return;
  people = data;
}

async function loadFunctions() {
  const { data, error } = await client.from("functions").select("*").order("year", { ascending: false });
  if (error) return;
  functionsList = data;
  renderYearPills();
}

function renderYearPills() {
  const years = [...new Set(functionsList.map((f) => f.year))].sort((a, b) => a - b);
  if (!years.includes(selectedYear)) {
    const currentYear = new Date().getFullYear();
    selectedYear = years.includes(currentYear) ? currentYear : years[years.length - 1] ?? null;
  }
  $("year-pills").innerHTML = years
    .map((y) => `<button type="button" class="pill ${y === selectedYear ? "active" : ""}" data-year="${y}">${y}</button>`)
    .join("");
  renderFunctionPills();
}

function renderFunctionPills() {
  const funcs = functionsList.filter((f) => f.year === selectedYear);
  if (!funcs.some((f) => f.id === selectedFunctionId)) {
    // திருமுருகன் தீர்த்தக்காவடி defaults for Jan-Jun, the other function for Jul-Dec.
    const isFirstHalf = new Date().getMonth() < 6;
    const kavadi = funcs.find((f) => f.name.includes("தீர்த்தக்காவடி"));
    const other = funcs.find((f) => f.id !== kavadi?.id);
    const preferred = isFirstHalf ? kavadi : other;
    selectedFunctionId = (preferred ?? funcs[0])?.id ?? null;
  }
  $("function-pills").innerHTML = funcs
    .map((f) => `<button type="button" class="pill ${f.id === selectedFunctionId ? "active" : ""}" data-function="${f.id}">${escapeHtml(f.name)}</button>`)
    .join("");
  updateSheetTitle();
}

function updateSheetTitle() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  const title = f ? `${f.name} (${f.year})` : "Ledger Sheet";
  // Sets .sheet-title-inner's content, not #sheet-title's own — #sheet-
  // title itself is a fixed, permanent outer box (style.css) that always
  // exactly matches the spreadsheet's width, so its left edge never
  // drifts; .sheet-title-inner is the part that actually scales/shrinks
  // once compact.
  $("sheet-title").querySelector(".sheet-title-inner").innerHTML =
    `<span>${escapeHtml(title)}</span>` +
    // வரவு (income) is a label with its buttons in one group, so the label never wraps away from them. The
    // group is a <div>/<strong>, not a direct-child <span>, on purpose: style.css and syncPillRowOverflow
    // treat the title's direct-child <span> as the title TEXT.
    `<div class="title-group"><strong class="title-group-label">வரவு:</strong>` +
      `<button type="button" id="toggle-members-btn" class="members-toggle ${sheetCollapsed ? "" : "active"}">உறுப்பினர்கள் - ${peopleForCurrentFunction().length}</button>` +
      incomeButtonsHtml() +   // income.js: நன்கொடை, ஏலம், முந்தைய இருப்பு
    `</div>` +
    // செலவு (expense): one button; its table (expenses.js) replaces the members sheet while it is open.
    expenseButtonHtml() +
    // Print / save as PDF: last in the row and pushed to its right end (style.css .print-btn); print.js.
    (f ? printButtonHtml() : "");
  // Respect the user's collapse toggle across re-renders — updateSheetTitle
  // is called after adding a row / switching function / saving, and used to
  // unconditionally un-hide the sheet, popping it back open behind the
  // user's back. Now driven by sheetCollapsed state instead.
  applySheetVisibility();
  syncExpenseView();   // expenses.js: keeps the செலவு table in step with the selected function
  syncIncomeView();    // income.js: same for the நன்கொடை / ஏலம் / முந்தைய இருப்பு tables
}

// The members sheet is hidden when the user collapsed it OR the செலவு table or an income table is showing instead. .sheet-thead-wrap
// lives in .sticky-top-stack and .sheet-tbody-wrap in <main> (see that HEART LOGIC comment in style.css), so both
// need toggling together. Also sets the active look of the members and செலவு buttons.
function applySheetVisibility() {
  const hide = sheetCollapsed || expenseOpen || !!incomeView;
  $("sheet-tbody-wrap").classList.toggle("hidden", hide);
  $("sheet-thead-wrap").classList.toggle("hidden", hide);
  $("toggle-members-btn")?.classList.toggle("active", !hide);
  $("expense-btn")?.classList.toggle("active", expenseOpen);
  alignTotalsBanner();   // the banner buttons move to the middle while the sheet is hidden, back to its edge when shown
}

$("sheet-title").addEventListener("click", (e) => {
  if (!e.target.closest("#toggle-members-btn")) return;
  // From the செலவு or an income view this button just goes back to the members sheet; otherwise it
  // collapses/expands the sheet as before.
  sheetCollapsed = (expenseOpen || incomeView) ? false : !sheetCollapsed;
  setIncomeView(null);     // income.js: leaves an income view
  setExpenseOpen(false);   // expenses.js: leaves the செலவு view and runs applySheetVisibility()
  if (!sheetCollapsed) alignTotalsBanner();
});

$("year-pills").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-year]");
  if (!btn) return;
  selectedYear = parseInt(btn.dataset.year, 10);
  selectedFunctionId = null;
  renderYearPills();
  await loadLedgerEntries();
});

$("function-pills").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-function]");
  if (!btn) return;
  selectedFunctionId = btn.dataset.function;
  renderFunctionPills();
  await loadLedgerEntries();
});

async function loadLedgerEntries() {
  if (!selectedFunctionId) {
    ledgerEntries = [];
    $("sheet-body").innerHTML = "";
    return;
  }
  const { data, error } = await client.from("ledger_entries").select("*").eq("function_id", selectedFunctionId);
  if (error) {
    setStatus("sheet-status", "Error loading sheet: " + error.message, true);
    return;
  }
  ledgerEntries = data;
  renderSheet();
}

// ---------- Sheet rendering ----------

// Each function can restrict its Ledger Sheet to just 24Manai, just Others,
// or everyone ("All", the default for functions created before this existed).
// HEART LOGIC — "Avoid" (set on the members page) means the person is no
// longer active (e.g. deceased). They're hidden from this and every future
// function's Ledger Sheet, EXCEPT a function where they already have an
// existing ledger_entries row — that historical record stays visible.
function peopleForCurrentFunction() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  // The rule itself (type filter + "avoid" flag) lives in ../function-rules.js, shared with the dashboard.
  // ledgerEntries here are already only this function's rows.
  return eligiblePeople(people, f, ledgerEntries);
}

// சந்தா is a fixed price the admin sets per function (Dashboard) — members are
// just checked/unchecked here, never allowed to type a custom amount.
function currentSanthaAmount() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  return Number(f?.santha_amount ?? 1000);
}

// S.No. shown on this sheet is a plain running count for whoever's actually on
// it — not the person's permanent member_no, which has gaps once a function's
// people-Type restriction excludes some members.
function entryRows() {
  const entryMap = Object.fromEntries(ledgerEntries.map((e) => [e.person_id, e]));
  return peopleForCurrentFunction().map((p, idx) => ({
    p,
    seq: idx + 1,
    e: entryMap[p.id] || { asal: 0, santha: 0, vatti: 0, thogai: 0, total: 0, paid: "", santha_checked: false, low_confidence: false },
  }));
}

function renderSheet() {
  const rows = entryRows();
  const santhaAmount = currentSanthaAmount();

  const snoQ = $("filter-sno").value.trim().toLowerCase();
  const nameQ = $("filter-name").value.trim().toLowerCase();
  const nameEnQ = $("filter-name-en").value.trim().toLowerCase();
  const mobileQ = $("filter-mobile").value.trim().replace(/\s+/g, "").toLowerCase();
  const santhaQ = $("filter-santha").value;
  const asalQ = $("filter-asal").value.replace(/[\s,]/g, "");
  const vattiQ = $("filter-vatti").value.replace(/[\s,]/g, "");
  const thogaiQ = $("filter-thogai").value.replace(/[\s,]/g, "");
  const totalQ = $("filter-total").value.replace(/[\s,]/g, "");
  const paidQ = $("filter-paid").value.trim().toLowerCase();

  const visible = rows.filter(({ p, seq, e }) => {
    if (snoQ && !String(seq).includes(snoQ)) return false;
    if (nameQ && !(p.name || "").toLowerCase().includes(nameQ)) return false;
    if (nameEnQ && !(p.name_en || "").toLowerCase().includes(nameEnQ)) return false;
    if (mobileQ && !formatMobile(p.mobile).replace(/\s+/g, "").toLowerCase().includes(mobileQ)) return false;
    if (santhaQ === "paid" && !e.santha_checked) return false;
    if (santhaQ === "unpaid" && e.santha_checked) return false;
    if (asalQ && !String(Number(e.asal)).includes(asalQ)) return false;
    if (vattiQ && !String(Number(e.vatti)).includes(vattiQ)) return false;
    if (thogaiQ && !String(Number(e.thogai)).includes(thogaiQ)) return false;
    if (totalQ && !Number(e.total).toFixed(0).includes(totalQ)) return false;
    if (paidQ && !String(e.paid || "").toLowerCase().includes(paidQ)) return false;
    return true;
  });

  $("sheet-body").innerHTML = visible
    .map(({ p, seq, e }) => {
      const cls = e.low_confidence ? "uncertain" : "";
      return `<tr data-person="${p.id}">
        <td>${seq}</td>
        <td><input type="text" class="f-name" value="${escapeHtml(p.name)}" readonly /></td>
        <td><input type="text" class="f-name-en" value="${escapeHtml(p.name_en ?? "")}" /></td>
        <td><input type="text" class="f-mobile" value="${escapeHtml(formatMobile(p.mobile))}" inputmode="numeric" /></td>
        <td>
          <div class="santha-cell">
            <input type="checkbox" class="f-santha-check" data-amount="${santhaAmount}" ${e.santha_checked ? "checked" : ""} />
            <span class="santha-amount ${e.santha_checked ? "" : "faded"}">${formatMoney(santhaAmount)}</span>
          </div>
        </td>
        <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="f-asal ${cls}" value="${formatMoney(e.asal)}" /></td>
        <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="f-vatti ${cls}" value="${formatMoney(e.vatti)}" /></td>
        <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="f-thogai ${cls}" value="${formatMoney(e.thogai)}" /></td>
        <td class="total-cell">${formatMoney(e.total)}</td>
        <td><input type="text" class="f-paid" value="${escapeHtml(e.paid || "")}" /></td>
      </tr>`;
    })
    .join("");

  updateTotalsBanner(rows);
}

function updateTotalsBanner(rows) {
  const sums = rows.reduce(
    (acc, { e }) => {
      acc.santha += Number(e.santha);
      acc.asal += Number(e.asal);
      acc.vatti += Number(e.vatti);
      acc.thogai += Number(e.thogai);
      acc.total += Number(e.total);
      return acc;
    },
    { santha: 0, asal: 0, vatti: 0, thogai: 0, total: 0 }
  );
  $("totals-santha").textContent = formatMoney(sums.santha);
  $("totals-asal").textContent = formatMoney(sums.asal);
  $("totals-vatti").textContent = formatMoney(sums.vatti);
  $("totals-thogai").textContent = formatMoney(sums.thogai);
  $("totals-total").textContent = formatMoney(sums.total);
  alignTotalsBanner();
}

// Positions each totals-col exactly on top of its real table column by
// measuring the actual rendered header cells, rather than guessing matching
// CSS percentages (which drift out of sync whenever the table's own column
// widths change). The போளியம்மனூர் உறுப்பினர்கள் link button gets the same
// treatment, pinned to the S.No. column's actual left edge instead of a
// fixed screen-relative 16px — by explicit request, it should track the
// spreadsheet's own left edge as the user scrolls it horizontally
// (.sheet-tbody-wrap's own overflow-x:auto), not stay glued to the
// viewport's edge regardless of scroll position.
function alignTotalsBanner() {
  const headerRow = document.querySelector("table.sheet thead tr:first-child");
  if (!headerRow) return;
  const ths = headerRow.querySelectorAll("th");
  const leftGroup = document.querySelector(".totals-banner .banner-left-group");
  const firstTh = ths[0];
  // When the members sheet is not on screen (collapsed, or செலவு / an income table is showing) its header has no
  // position (every rect reads 0), so pinning to it would push the buttons against the left edge of the screen.
  // Centre them instead (.banner-centered in expenses.css).
  const sheetShown = !!firstTh && firstTh.getClientRects().length > 0;
  if (leftGroup) {
    leftGroup.closest(".totals-banner").classList.toggle("banner-centered", !sheetShown);
    if (!sheetShown) leftGroup.style.left = "";
  }
  if (!sheetShown) return;
  document.querySelectorAll("#totals-track .totals-col").forEach((col) => {
    const th = ths[Number(col.dataset.col) - 1];
    if (!th) return;
    const rect = th.getBoundingClientRect();
    col.style.left = rect.left + "px";
    col.style.width = rect.width + "px";
  });
  // Move the whole left-group (members-link + logout) as one unit, not
  // just the members-link — so the logout button sits next to its sibling
  // regardless of horizontal scroll, instead of drifting away.
  if (leftGroup) leftGroup.style.left = firstTh.getBoundingClientRect().left + "px";
}
window.addEventListener("resize", alignTotalsBanner);
// #sheet-thead-wrap itself doesn't scroll horizontally (overflow:hidden —
// same reasoning as members.html's .members-thead-wrap) so a horizontal
// drag on the body table mirrors onto it here, keeping columns aligned on
// narrow screens (this table has a mobile min-width, same as members.html's).
$("sheet-tbody-wrap").addEventListener("scroll", () => {
  $("sheet-thead-wrap").scrollLeft = $("sheet-tbody-wrap").scrollLeft;
  alignTotalsBanner();
});

// Debounced re-render so fast typing in a filter doesn't force a full
// re-render on every keystroke — and flushes any in-flight debounced
// cell saves first, so a value the user just typed into an f-asal/vatti/
// thogai/paid input isn't lost when innerHTML gets replaced. debounce()
// itself lives in shared.js (used by both pages).
function flushPendingCellSaves() {
  Object.keys(saveTimers).forEach((personId) => {
    const timerId = saveTimers[personId];
    if (!timerId) return;
    clearTimeout(timerId);
    delete saveTimers[personId];
    const tr = $("sheet-body").querySelector(`tr[data-person="${personId}"]`);
    if (tr) saveRow(personId, tr);
  });
}
function requestRenderSheet() {
  flushPendingCellSaves();
  renderSheet();
}
const debouncedRequestRenderSheet = debounce(requestRenderSheet, FILTER_DEBOUNCE_MS);

[
  "filter-sno",
  "filter-name",
  "filter-name-en",
  "filter-mobile",
  "filter-asal",
  "filter-vatti",
  "filter-thogai",
  "filter-total",
  "filter-paid",
].forEach((id) => $(id).addEventListener("input", debouncedRequestRenderSheet));
// The santha filter is a <select> — change fires once per commit, no need
// to debounce or flush (its transition is intentional, not typing).
$("filter-santha").addEventListener("change", renderSheet);

// The three amount boxes (அசல் / வட்டி / தொகை) take whole numbers only (filterWholeNumber, money-format.js).
const AMOUNT_INPUTS = ".f-asal, .f-vatti, .f-thogai";

function rowValues(tr) {
  const santhaCheck = tr.querySelector(".f-santha-check");
  return {
    asal: parseMoney(tr.querySelector(".f-asal").value),
    santhaChecked: santhaCheck.checked,
    santha: santhaCheck.checked ? Number(santhaCheck.dataset.amount) : 0,
    vatti: parseMoney(tr.querySelector(".f-vatti").value),
    thogai: parseMoney(tr.querySelector(".f-thogai").value),
    paid: tr.querySelector(".f-paid").value.trim(),
  };
}

async function saveRow(personId, tr) {
  const funcId = selectedFunctionId;
  const v = rowValues(tr);
  const total = v.asal + v.santha + v.vatti + v.thogai;
  tr.querySelector(".total-cell").textContent = formatMoney(total);

  const payload = {
    function_id: funcId,
    person_id: personId,
    asal: v.asal,
    santha: v.santha,
    santha_checked: v.santhaChecked,
    vatti: v.vatti,
    thogai: v.thogai,
    total,
    paid: v.paid,
    low_confidence: false,
  };
  const { error } = await client.from("ledger_entries").upsert(payload, { onConflict: "function_id,person_id" });
  if (error) {
    setStatus("sheet-status", "Error saving row: " + error.message, true);
    return;
  }
  setStatus("sheet-status", "", false);
  tr.querySelectorAll("input.uncertain").forEach((i) => i.classList.remove("uncertain"));
  tr.classList.add("row-saved");
  setTimeout(() => tr.classList.remove("row-saved"), ROW_SAVE_BLINK_MS);
  const idx = ledgerEntries.findIndex((e) => e.person_id === personId);
  if (idx >= 0) ledgerEntries[idx] = { ...ledgerEntries[idx], ...payload };
  else ledgerEntries.push(payload);
  updateTotalsBanner(entryRows());
}

function scheduleSave(personId, tr, immediate) {
  clearTimeout(saveTimers[personId]);
  if (immediate) {
    delete saveTimers[personId];
    saveRow(personId, tr);
  } else {
    saveTimers[personId] = setTimeout(() => {
      delete saveTimers[personId];
      saveRow(personId, tr);
    }, SAVE_DEBOUNCE_MS);
  }
}

$("sheet-body").addEventListener("input", (e) => {
  if (e.target.classList.contains("f-mobile")) {
    filterMobileInput(e.target);
    return; // mobile lives on `people`, not `ledger_entries`
  }
  if (e.target.classList.contains("f-name-en")) return; // this lives on `people`, not `ledger_entries`
  const tr = e.target.closest("tr");
  if (!tr) return;
  const personId = tr.dataset.person;
  if (e.target.matches(AMOUNT_INPUTS)) {
    filterWholeNumber(e.target);
    const v = rowValues(tr);
    tr.querySelector(".total-cell").textContent = formatMoney(v.asal + v.santha + v.vatti + v.thogai);
  }
  scheduleSave(personId, tr, false);
});

// Same rules as the Members page: save plain digits (the spacing is display only), a changed number must be exactly
// 10 digits (a bad edit puts the old number back and flashes the row red), an untouched number is left alone.
async function commitMobile(input) {
  const tr = input.closest("tr");
  const personId = tr.dataset.person;
  const p = people.find((p) => p.id === personId);
  const mobile = input.value.replace(/[^\d+]/g, "");
  const old = String(p?.mobile ?? "").replace(/\s+/g, "");
  if (mobile === old) {
    input.value = formatMobile(mobile);
    return;
  }
  const problem = mobileError(mobile);
  if (problem) {
    setStatus("sheet-status", problem, true);
    input.value = formatMobile(old);
    blinkRow(tr, "error");
    return;
  }
  input.value = formatMobile(mobile);
  const { error } = await client.from("people").update({ mobile }).eq("id", personId);
  if (error) {
    setStatus("sheet-status", "Error saving mobile number: " + error.message, true);
    input.value = formatMobile(old);
    blinkRow(tr, "error");
    return;
  }
  if (p) p.mobile = mobile;
  setStatus("sheet-status", "", false);
}

// On focus: a mobile number shows plain digits (its spaces are for reading only), and an amount that is just "0" is
// cleared so the user can type straight away instead of deleting the 0 first.
$("sheet-body").addEventListener("focusin", (e) => {
  const input = e.target;
  if (input.classList?.contains("f-mobile")) input.value = input.value.replace(/\s+/g, "");
  else if (input.matches?.(AMOUNT_INPUTS)) {
    editMoneyBox(input);
    if (input.value === "0") input.value = "";
  }
});

// On leaving an amount box that was left empty, show the 0 again (an empty box already counts as 0, see rowValues).
$("sheet-body").addEventListener("focusout", (e) => {
  if (!e.target.matches?.(AMOUNT_INPUTS)) return;
  if (e.target.value === "") e.target.value = "0";
  showMoneyBox(e.target);
});

async function commitNameEn(input) {
  const tr = input.closest("tr");
  const personId = tr.dataset.person;
  const nameEn = input.value.trim();
  const { error } = await client.from("people").update({ name_en: nameEn }).eq("id", personId);
  if (error) {
    setStatus("sheet-status", "Error saving name: " + error.message, true);
    return;
  }
  const p = people.find((p) => p.id === personId);
  if (p) p.name_en = nameEn;
  setStatus("sheet-status", "", false);
}

$("sheet-body").addEventListener("change", (e) => {
  if (e.target.classList.contains("f-mobile")) {
    commitMobile(e.target);
  } else if (e.target.classList.contains("f-name-en")) {
    commitNameEn(e.target);
  } else if (e.target.classList.contains("f-santha-check")) {
    const tr = e.target.closest("tr");
    const span = tr.querySelector(".santha-amount");
    span.classList.toggle("faded", !e.target.checked);
    const v = rowValues(tr);
    tr.querySelector(".total-cell").textContent = formatMoney(v.asal + v.santha + v.vatti + v.thogai);
    scheduleSave(tr.dataset.person, tr, true);
  }
});

// Enter commits without needing to leave the field.
$("sheet-body").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.classList.contains("f-mobile")) {
    e.preventDefault();
    commitMobile(e.target);
  } else if (e.target.classList.contains("f-name-en")) {
    e.preventDefault();
    commitNameEn(e.target);
  }
});

// Safari doesn't fire blur/change when clicking non-interactive elements
// (blank space, plain text, etc.), so also catch clicks anywhere else at the
// document level for whichever field currently has focus. isInteractiveTarget
// (shared.js) filters out clicks on other inputs/buttons/etc. — those clicks
// are meant for their own actions and shouldn't backdoor-commit an
// unrelated in-focus field.
document.addEventListener("click", (e) => {
  const active = document.activeElement;
  if (!active || active === e.target) return;
  if (isInteractiveTarget(e.target)) return;
  if (active.classList?.contains("f-mobile")) commitMobile(active);
  else if (active.classList?.contains("f-name-en")) commitNameEn(active);
});
