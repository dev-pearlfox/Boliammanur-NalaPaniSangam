// Helpers shared by index.html (app.js) and members.html (members.js). Kept
// as one copy so heart-logic rules and formatting behavior can't drift
// between the two pages — include this script before app.js/members.js.

// Shared timing constants — pulled out of app.js/members.js so they stay
// in sync and are trivial to tune in one place.
const SAVE_DEBOUNCE_MS = 700;   // inline cell save debounce (ledger sheet)
const FILTER_DEBOUNCE_MS = 150; // filter re-render debounce (both pages)
const ROW_SAVE_BLINK_MS = 1200; // "row-saved" CSS class removal
const ROW_ADDED_BLINK_MS = 1100; // "row-blink" CSS class removal
const STATUS_OK_CLEAR_MS = 2500; // auto-clear "Saved."/"Added." messages

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Mobile numbers display as: first 3 chars, space, next 5, space, remaining balance.
function formatMobile(value) {
  const raw = String(value ?? "").replace(/\s+/g, "");
  if (raw.length <= 3) return raw;
  const part1 = raw.slice(0, 3);
  const rest = raw.slice(3);
  if (rest.length <= 5) return `${part1} ${rest}`;
  const part2 = rest.slice(0, 5);
  const part3 = rest.slice(5);
  return `${part1} ${part2} ${part3}`;
}

// Mobile number fields only accept digits and "+" as the user types.
function filterMobileInput(el) {
  const cleaned = el.value.replace(/[^\d+]/g, "");
  if (cleaned !== el.value) el.value = cleaned;
}

// Number-only fields (S.No, Roll No, etc.) only accept digits as the user types.
function filterDigitsInput(el) {
  const cleaned = el.value.replace(/[^\d]/g, "");
  if (cleaned !== el.value) el.value = cleaned;
}

// HEART LOGIC — do not change without asking (transform, not font-size, for
// the title's shrink — see members.html's HEART LOGIC index, point 3, for
// the full reasoning: animating font-size on wrapping text causes a
// discrete, unsmoothable jump exactly when it collapses from 2 lines to 1).
// Shared by index.html and members.html — both use the same
// body.is-scrolled header h1 transform:scale() rule in style.css. Scaling
// alone doesn't shrink the space the title reserves in the page (transform
// is purely visual, not layout), so a negative margin pulls that freed
// space closed — computed from the title's actual rendered height
// (h1.offsetHeight, which transform doesn't affect) rather than guessed,
// since the Tamil text's wrap/height varies by screen width.
// SCALE here must match the `scale(0.6)` in body.is-scrolled header h1.
const HEADER_TITLE_COMPACT_SCALE = 0.6;
function syncHeaderTitleCollapse() {
  const h1 = document.querySelector("header h1");
  if (!h1) return;
  const collapse = -(h1.offsetHeight * (1 - HEADER_TITLE_COMPACT_SCALE));
  document.documentElement.style.setProperty("--header-h1-margin-collapse", collapse + "px");
}
window.addEventListener("resize", syncHeaderTitleCollapse);
window.addEventListener("load", syncHeaderTitleCollapse);
if (document.fonts) document.fonts.ready.then(syncHeaderTitleCollapse);
syncHeaderTitleCollapse();

// HEART LOGIC — do not change without asking first.
// Roll Number is each person's permanent TOWN REGISTRY identification number
// (the members page represents the total population of the town, not just
// people tied to a function). It is distinct from S.No./member_no, which is
// just a registration-order number that can show gaps once a function's
// people-Type filter excludes some members. Roll Number stays fixed to the
// person, starts at 1001, and must never appear on a function's Ledger Sheet
// — only on the members directory page.
function computeNextRollNumber(peopleList) {
  const max = peopleList.reduce((m, p) => Math.max(m, p.roll_number || 0), 1000);
  return max + 1;
}

function computeNextMemberNo(peopleList) {
  const max = peopleList.reduce((m, p) => Math.max(m, p.member_no || 0), 0);
  return max + 1;
}

// HEART LOGIC — do not change without asking.
// nextMemberNo/nextRollNumber values computed from any in-memory `people`
// list can be stale if another admin (another tab, the other page) added
// someone since this list loaded. The DB unique constraint is the real
// backstop (add_unique_constraints.sql / add_roll_number.sql); on a 23505
// collision this refetches and retries. Same logic that members.js
// originally carried inline — hoisted here so app.js's add-new-row uses
// exactly the same path.
async function insertPersonRaceSafe(client, base, attemptsLeft = 3) {
  const { data: numberSource, error: fetchError } = await client
    .from("people")
    .select("member_no, roll_number");
  if (fetchError) return { data: null, error: fetchError };
  const memberNo = base.member_no ?? computeNextMemberNo(numberSource);
  const rollNumber = base.roll_number ?? computeNextRollNumber(numberSource);

  const { data, error } = await client
    .from("people")
    .insert({ ...base, member_no: memberNo, roll_number: rollNumber })
    .select()
    .single();
  if (error && error.code === "23505" && attemptsLeft > 1) {
    return insertPersonRaceSafe(client, base, attemptsLeft - 1);
  }
  return { data, error };
}

// Global click-outside helper — commits an in-flight new-row / open-cell
// only when the user clicks on genuinely non-interactive page space, NOT
// when they click another input/button/select (those clicks are meant for
// their own actions and shouldn't accidentally trigger a save). Both
// pages' new-row commit-on-click-away used to fire on every click
// anywhere, which occasionally saved partially-filled rows when the user
// meant to click a filter or a pill.
function isInteractiveTarget(el) {
  return !!(el && el.closest && el.closest("input, select, button, a, textarea, label"));
}

// Sign the user out of Supabase Auth and reload — the auth state change
// listener in app.js/members.js will handle the visual gate/redirect, but
// reload guarantees no stale in-memory state (open cells, unsaved
// debounced timers) survives past a logout.
async function signOutAndReload(client) {
  await client.auth.signOut();
  window.location.reload();
}

// Trailing-edge debounce — fn runs `wait` ms after the LAST call. Used
// by both pages for filter-input re-renders and members.js for the
// same-name-different-context requestRenderRows pattern.
function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
