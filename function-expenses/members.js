const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

// Auth gate — bounce to index.html if no valid Supabase session. Same
// client + shared localStorage session key means whichever page logged
// in, the other one recognizes it. Done as an async IIFE so the redirect
// (if needed) happens before the rest of this script tries to query
// tables that would just return [] under RLS anyway.
(async () => {
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
  }
})();

// If someone signs out from another tab (or the JWT is revoked), bounce
// back to the login screen instead of quietly failing every request.
client.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    window.location.href = "index.html";
  }
});

// Logout button in the totals-banner. signOutAndReload (shared.js)
// reloads after signOut so no stale in-memory state (open cells,
// debounced timers) survives past a logout — the signOut also fires the
// SIGNED_OUT event above, which redirects to index.html on the reloaded
// page.
$("logout-btn").addEventListener("click", () => {
  if (!window.confirm("Sign out?")) return;
  signOutAndReload(client);
});

let allPeople = [];
let currentFilter = "all";

// escapeHtml, formatMobile live in shared.js (loaded before this file) —
// kept as one copy with app.js.

// #members-thead-wrap itself doesn't scroll horizontally (overflow-x:hidden
// — see style.css comment for why) so a horizontal drag on the body table
// mirrors onto it here, keeping columns aligned on narrow screens.
$("members-tbody-wrap").addEventListener("scroll", () => {
  $("members-thead-wrap").scrollLeft = $("members-tbody-wrap").scrollLeft;
});

// HEART LOGIC — do not change without asking (measures card.offsetHeight
// directly, not the parent's auto height).
// The header, pills bar, and table header row all live in one shared
// .sticky-top-stack now (see style.css), so only the pills bar itself needs
// a JS-computed value: its scroll-compact state uses transform:scale()
// rather than animating each pill's own padding/font-size (see the
// body.is-scrolled .members-filter-card comment in style.css for why), and
// scaling alone doesn't shrink the space the card reserves in the page
// (transform is purely visual, not layout) — a negative margin pulls that
// freed space closed, computed from the card's actual rendered height
// (offsetHeight, which transform doesn't affect) rather than guessed, since
// it varies by screen width and by how many pills wrap onto their own line.
// SCALE here must match the `scale(0.72)` in body.is-scrolled .members-filter-card.
const PILLS_CARD_COMPACT_SCALE = 0.72;
function syncPillsCardCollapse() {
  const card = document.querySelector(".members-filter-card");
  if (!card) return;
  const collapse = -(card.offsetHeight * (1 - PILLS_CARD_COMPACT_SCALE));
  document.documentElement.style.setProperty("--pills-card-margin-collapse", collapse + "px");
}
window.addEventListener("resize", syncPillsCardCollapse);
window.addEventListener("load", syncPillsCardCollapse);
if (document.fonts) document.fonts.ready.then(syncPillsCardCollapse);
syncPillsCardCollapse();
// The pill counts ("மொத்த உறுப்பினர்கள் - 96") populate asynchronously once
// Supabase data arrives, well after "load" fires — re-measuring only then
// left the card's real (taller, count-populated) height uncorrected,
// undershooting the margin and leaving a residual gap. Watching the pill
// row's own text content is the direct fix.
const pillRow = document.getElementById("type-filter-pills");
if (pillRow) new MutationObserver(syncPillsCardCollapse).observe(pillRow, { childList: true, subtree: true, characterData: true });

// syncHeaderTitleCollapse (HEART LOGIC — transform, not font-size, for the
// title's shrink) now lives in shared.js, since index.html needs the exact
// same behavior — one copy so the two pages can't drift apart.

let scrollTicking = false;
function updateScrollCompactState() {
  document.body.classList.toggle("is-scrolled", window.scrollY > 10);
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
updateScrollCompactState();

function setStatus(message, isError) {
  const el = $("members-status");
  el.textContent = message || "";
  el.className = "status " + (isError ? "error" : "ok");
}

// Cell lock state is entirely dictated by the master lock (see setMasterLocked)
// — no per-cell 🔒 button anymore, since one global toggle in the totals-banner
// is the single source of truth. Rendered rows just have to match whatever the
// current master state is at render time; setCellsLocked syncs later toggles.
function cell(field, value, extraAttrs) {
  const locked = document.body.classList.contains("master-locked");
  const readonlyAttr = locked ? "readonly" : "";
  const unlockedClass = locked ? "" : " unlocked";
  return `<td>
    <div class="cell-flex">
      <input type="text" class="cell-input${unlockedClass}" data-field="${field}" value="${escapeHtml(value)}" ${readonlyAttr} ${extraAttrs || ""} />
    </div>
  </td>`;
}

// HEART LOGIC — Type is set once at creation (see addNewRow in app.js) and is
// permanently uneditable afterward, so this is plain text, not a control.
function typeCell(value) {
  return `<td>${escapeHtml(value || "—")}</td>`;
}

// HEART LOGIC — "Avoid" means the person is no longer active (e.g.
// deceased). Default unchecked. Checking it fades this row and hides them
// from the current + every future function's Ledger Sheet, except a function
// where they already have an existing entry (see peopleForCurrentFunction()
// in app.js — do not change that exclusion rule without asking).
function avoidCell(checked) {
  return `<td><input type="checkbox" class="avoid-check" ${checked ? "checked" : ""} /></td>`;
}

// Counts reflect the full roster (not the currently active filter/search),
// so switching pills always shows where you're headed, not a shrinking number.
function updatePillCounts() {
  const counts = {
    all: allPeople.length,
    "24manai": allPeople.filter((p) => p.type === "24Manai").length,
    others: allPeople.filter((p) => p.type === "Others").length,
  };
  $("type-filter-pills")
    .querySelectorAll("button[data-filter]")
    .forEach((btn) => {
      const count = counts[btn.dataset.filter] ?? 0;
      btn.textContent = `${btn.dataset.label} - ${count}`;
    });
}

// HEART LOGIC — roll_number is each person's permanent town-registry ID
// (see nextRollNumber() in app.js). It belongs only on this members page,
// never on a function's Ledger Sheet — do not change that without asking.
function renderRows() {
  updatePillCounts();
  const pillFiltered =
    currentFilter === "24manai"
      ? allPeople.filter((p) => p.type === "24Manai")
      : currentFilter === "others"
      ? allPeople.filter((p) => p.type === "Others")
      : allPeople;

  const snoQ = $("filter-sno").value.trim().toLowerCase();
  const rollQ = $("filter-roll").value.trim().toLowerCase();
  const nameQ = $("filter-name").value.trim().toLowerCase();
  const nameEnQ = $("filter-name-en").value.trim().toLowerCase();
  const mobileQ = $("filter-mobile").value.trim().replace(/\s+/g, "").toLowerCase();
  const typeQ = $("filter-type").value;

  const visible = pillFiltered.filter((p) => {
    if (snoQ && !String(p.member_no ?? "").toLowerCase().includes(snoQ)) return false;
    if (rollQ && !String(p.roll_number ?? "").toLowerCase().includes(rollQ)) return false;
    if (nameQ && !(p.name || "").toLowerCase().includes(nameQ)) return false;
    if (nameEnQ && !(p.name_en || "").toLowerCase().includes(nameEnQ)) return false;
    if (mobileQ && !formatMobile(p.mobile).replace(/\s+/g, "").toLowerCase().includes(mobileQ)) return false;
    if (typeQ && p.type !== typeQ) return false;
    return true;
  });

  $("members-body").innerHTML = visible
    .map(
      (p) => `<tr data-person="${p.id}" class="${p.avoid ? "row-avoided" : ""}">
        <td>${p.member_no ?? ""}</td>
        <td>${p.roll_number ?? ""}</td>
        ${cell("name", p.name)}
        ${cell("name_en", p.name_en ?? "")}
        ${cell("mobile", formatMobile(p.mobile), 'inputmode="numeric"')}
        ${typeCell(p.type)}
        ${avoidCell(p.avoid)}
      </tr>`
    )
    .join("");
}

async function loadMembers() {
  setStatus("Loading members…", false);
  const { data, error } = await client
    .from("people")
    .select("*")
    .order("member_no", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) {
    setStatus("Error loading members: " + error.message, true);
    return;
  }
  allPeople = data;
  renderRows();
  prefillNewMemberRow();
  setStatus("", false);
}

// nextMemberNo/nextRollNumber wrap the shared computeNextMemberNo/
// computeNextRollNumber (shared.js) bound to this page's `allPeople` array —
// see shared.js for the Roll Number HEART LOGIC rule.
function nextMemberNo() {
  return computeNextMemberNo(allPeople);
}
function nextRollNumber() {
  return computeNextRollNumber(allPeople);
}

function prefillNewMemberRow() {
  $("new-m-sno").textContent = nextMemberNo();
  $("new-m-roll").textContent = nextRollNumber();
  updateNewMemberLock();
}

// insertPersonRaceSafe is now shared with app.js — see shared.js for the
// HEART LOGIC comment covering the stale-list-vs-DB-constraint reasoning.

// New row starts locked (only பெயர்/Name enterable) until a name is typed —
// same pattern as the main Ledger Sheet's new row (see updateNewRowLock in app.js).
// Master lock (see setMasterLocked below) further disables the pair of name
// fields too, so nothing in this row is editable while the page is locked.
function updateNewMemberLock() {
  const masterLocked = document.body.classList.contains("master-locked");
  const hasName = $("new-m-name").value.trim().length > 0 || $("new-m-name-en").value.trim().length > 0;
  $("new-m-name").disabled = masterLocked;
  $("new-m-name-en").disabled = masterLocked;
  $("new-m-mobile").disabled = masterLocked || !hasName;
  $("new-m-type").disabled = masterLocked || !hasName;
}

// Master lock — one global 🔒 in the totals-banner is the sole edit
// gate for the whole page. Unlocking makes every existing cell directly
// editable (no per-cell click needed), the new-member row usable, and
// Avoid checkboxes active. Re-locking commits any in-flight edit and
// makes the whole table read-only again.
// Page starts locked on every load so a fresh open never risks a stray
// tap writing to the DB — the user must explicitly unlock first.
function setMasterLocked(locked) {
  // Commit any in-flight edit BEFORE flipping readOnly on it — commitCell
  // bails early on readOnly inputs, so the order matters. Commits are
  // fire-and-forget (input.value is already synced to displayValue
  // synchronously; only the DB call is async).
  if (locked) {
    document.querySelectorAll("#members-body .cell-input:not([readonly])").forEach((input) => commitCell(input));
  }
  document.body.classList.toggle("master-locked", locked);
  const btn = $("master-lock-btn");
  // Action-preview: the icon shows what CLICKING will do next, not the
  // current state — 🔒 while editing is enabled means "tap to lock",
  // ✏️ while locked means "tap to enable editing".
  btn.textContent = locked ? "✏️" : "🔒";
  btn.setAttribute("aria-label", locked ? "Unlock editing" : "Lock editing");
  btn.setAttribute("title", locked ? "Unlock editing" : "Lock editing");
  btn.setAttribute("aria-pressed", locked ? "false" : "true");
  setCellsLocked(locked);
  updateNewMemberLock();
}

$("master-lock-btn").addEventListener("click", () => {
  setMasterLocked(!document.body.classList.contains("master-locked"));
});

// Start locked on every page load — see setMasterLocked comment.
setMasterLocked(true);

async function addNewMember() {
  const name = $("new-m-name").value.trim();
  const nameEn = $("new-m-name-en").value.trim();
  if (!name && !nameEn) return;

  const dup = allPeople.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
  if (dup) {
    setStatus(`"${name}" already exists (S.No. ${dup.member_no ?? "-"}) — scroll up to find them instead of re-adding.`, true);
    return;
  }

  const type = $("new-m-type").value;
  if (!type) {
    setStatus("Pick a Type (24Manai/Others) for the new member before saving.", true);
    return;
  }

  const mobile = $("new-m-mobile").value.trim().replace(/[^\d+]/g, "");

  const { data: person, error } = await insertPersonRaceSafe(client, { name, name_en: nameEn, mobile, type });
  if (error) {
    setStatus("Error adding member: " + error.message, true);
    return;
  }

  allPeople.push(person);
  allPeople.sort((a, b) => (a.member_no ?? 9999) - (b.member_no ?? 9999) || a.name.localeCompare(b.name));

  ["new-m-name", "new-m-name-en", "new-m-mobile"].forEach((id) => ($(id).value = ""));
  $("new-m-type").value = "";
  updateNewMemberLock();
  setStatus("Added.", false);
  renderRows();
  prefillNewMemberRow();

  const savedTr = $("members-body").querySelector(`tr[data-person="${person.id}"]`);
  if (savedTr) {
    savedTr.scrollIntoView({ behavior: "smooth", block: "center" });
    savedTr.classList.add("row-blink");
    setTimeout(() => savedTr.classList.remove("row-blink"), ROW_ADDED_BLINK_MS);
  }
}

$("new-m-name").addEventListener("input", updateNewMemberLock);
$("new-m-name-en").addEventListener("input", updateNewMemberLock);
$("new-m-mobile").addEventListener("input", () => filterMobileInput($("new-m-mobile")));

// Row stays unsaved while typing — Enter (on any field in the row) commits it,
// and so does clicking/tabbing away to somewhere outside the row entirely.
["new-m-name", "new-m-name-en", "new-m-mobile", "new-m-type"].forEach((id) => {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addNewMember();
    }
  });
});

// Safari doesn't fire blur/focusout when clicking non-interactive elements
// (blank space, plain text, etc.), so a click-anywhere-outside check is done
// at the document level instead of relying on focus events. isInteractiveTarget
// filter (shared.js) skips clicks on filters/pills/buttons/links so the new
// row doesn't auto-commit when the user is trying to click something else.
document.addEventListener("click", (e) => {
  if ($("new-member-row").contains(e.target)) return;
  if (isInteractiveTarget(e.target)) return;
  addNewMember();
});

// debounce() lives in shared.js — kept as one copy with app.js.

// renderRows() replaces the whole tbody, which would silently discard any
// cell that's mid-edit (unlocked, not yet committed) — e.g. typing a Name
// correction, then touching a filter box before pressing Enter. Auto-commit
// any open cell first (same save path as clicking away) so filtering never
// loses an edit.
async function requestRenderRows() {
  const unlockedInputs = Array.from(document.querySelectorAll("#members-body .cell-input.unlocked"));
  if (unlockedInputs.length) {
    await Promise.all(unlockedInputs.map((input) => commitCell(input)));
  }
  renderRows();
}
const debouncedRequestRenderRows = debounce(requestRenderRows, FILTER_DEBOUNCE_MS);

// S.No/Roll No./Mobile hold numbers, so their filter boxes only accept the
// kind of input those columns can actually contain — matches how the
// corresponding table cells themselves are already restricted (e.g. new-m-mobile).
// Registered before the render-triggering listeners below so the value is
// already sanitized by the time renderRows() reads it.
$("filter-sno").addEventListener("input", () => filterDigitsInput($("filter-sno")));
$("filter-roll").addEventListener("input", () => filterDigitsInput($("filter-roll")));
$("filter-mobile").addEventListener("input", () => filterMobileInput($("filter-mobile")));

["filter-sno", "filter-roll", "filter-name", "filter-name-en", "filter-mobile"].forEach((id) => {
  $(id).addEventListener("input", debouncedRequestRenderRows);
});
$("filter-type").addEventListener("change", requestRenderRows);

$("type-filter-pills").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-filter]");
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  const pillsRow = $("type-filter-pills");
  pillsRow.querySelectorAll(".pill").forEach((p) => p.classList.toggle("active", p === btn));
  // HEART LOGIC — do not change without asking (scroll-to-center on click).
  // Scrolls the clicked pill to the horizontal center of the row (see
  // .pill-row's overflow-x:auto in style.css) — on a phone where not all
  // filters fit at once, this leaves a sliver of whichever neighbors exist
  // visible on both sides, signaling there's more to swipe to instead of
  // just leaving the tapped pill wherever it happened to already be. A
  // no-op wherever everything already fits (desktop): scrollLeft just
  // clamps back to 0, same as it already was.
  pillsRow.scrollTo({
    left: btn.offsetLeft - pillsRow.clientWidth / 2 + btn.offsetWidth / 2,
    behavior: "smooth",
  });
  requestRenderRows();
});

// Bulk-toggle every rendered cell's edit state to match the master lock.
// Called from setMasterLocked and after renderRows repaints tbody (fresh
// nodes always start in whatever state cell() rendered for them, but a
// filter/render triggered mid-session needs to re-sync too).
function setCellsLocked(locked) {
  document.querySelectorAll("#members-body .cell-input").forEach((input) => {
    input.readOnly = locked;
    input.classList.toggle("unlocked", !locked);
  });
}

// Save validated input value to Supabase. Lock state is NOT touched here —
// the master lock owns that entirely — so this is now pure "persist +
// validate", callable from Enter/blur/click-outside without side effects
// on the visual lock state. Short-circuits on unchanged values to avoid
// spamming the DB when the user just tabs past unmodified cells.
async function commitCell(input) {
  if (input.readOnly) return;
  const tr = input.closest("tr");
  const personId = tr.dataset.person;
  const field = input.dataset.field;
  const person = allPeople.find((p) => p.id === personId);
  if (!person) return;
  let value = input.value.trim();
  let displayValue = value;

  // Store raw digits (+prefix allowed), not the display-formatted string with
  // spaces — keeps the DB value usable for search/export/dial-links later.
  // formatMobile() strips whitespace before reformatting either way, so this
  // stays safe to display even for older rows saved with spaces baked in.
  if (field === "mobile") {
    value = value.replace(/[^\d+]/g, "");
    displayValue = formatMobile(value);
  }

  if (field === "name") {
    if (!value) {
      setStatus("Name cannot be empty.", true);
      input.value = person.name;
      return;
    }
    const dup = allPeople.find((p) => p.id !== personId && p.name.trim().toLowerCase() === value.toLowerCase());
    if (dup) {
      setStatus(`"${value}" is already used by another member (S.No. ${dup.member_no ?? "-"}).`, true);
      input.value = person.name;
      return;
    }
  }

  input.value = displayValue;

  // No change → no write. Every unlocked cell would otherwise "commit"
  // on every blur/click-away, even if the user never typed a thing.
  if (person[field] === value) return;

  const { error } = await client.from("people").update({ [field]: value }).eq("id", personId);
  if (error) {
    setStatus("Error saving: " + error.message, true);
    return;
  }
  person[field] = value;
  setStatus("Saved.", false);
}

$("members-body").addEventListener("input", (e) => {
  if (!e.target.classList.contains("cell-input") || e.target.dataset.field !== "mobile") return;
  filterMobileInput(e.target);
});

$("members-body").addEventListener("change", async (e) => {
  if (!e.target.classList.contains("avoid-check")) return;
  const checkbox = e.target;
  // CSS pointer-events:none already blocks the click while master-locked,
  // but a scripted checkbox.click() or a keyboard toggle could still fire
  // — revert and bail before any DB write.
  if (document.body.classList.contains("master-locked")) {
    checkbox.checked = !checkbox.checked;
    return;
  }
  const tr = checkbox.closest("tr");
  const personId = tr.dataset.person;
  const value = checkbox.checked;
  // Confirm before marking someone Avoid — this hides them from every
  // future Ledger Sheet (see peopleForCurrentFunction in app.js), so an
  // accidental click on the wrong row shouldn't be a silent one-way write.
  // Uncheck is confirmed too, since it changes their visibility across
  // every function's sheet.
  const person = allPeople.find((p) => p.id === personId);
  const label = person?.name || person?.name_en || "this member";
  const prompt = value
    ? `Mark "${label}" as no longer active?\n\nThey'll be hidden from every current and future function's Ledger Sheet (except sheets where they already have a saved row).`
    : `Restore "${label}" to the active member list?\n\nThey'll reappear on every function's Ledger Sheet that allows their Type.`;
  if (!window.confirm(prompt)) {
    checkbox.checked = !value;
    return;
  }
  const { error } = await client.from("people").update({ avoid: value }).eq("id", personId);
  if (error) {
    setStatus("Error saving: " + error.message, true);
    checkbox.checked = !value;
    return;
  }
  if (person) person.avoid = value;
  tr.classList.toggle("row-avoided", value);
  setStatus("Saved.", false);
});

// Enter commits without needing to leave the field (blur then also fires,
// but commitCell's dirty-check makes the second call a cheap no-op).
$("members-body").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const input = e.target.closest(".cell-input");
  if (!input || input.readOnly) return;
  e.preventDefault();
  input.blur();
});

// Tab/click to another field.
$("members-body").addEventListener("focusout", (e) => {
  const input = e.target.closest(".cell-input");
  if (!input || input.readOnly) return;
  commitCell(input);
});

// Safari doesn't fire blur/focusout when clicking non-interactive elements
// (blank space, plain text, etc.), so also catch clicks anywhere outside
// the currently-focused cell at the document level. Only the focused input
// needs committing — every other cell is either already saved (via a prior
// focusout) or unchanged, and commitCell's dirty-check would no-op anyway.
// isInteractiveTarget filter (shared.js) skips clicks on filters/pills/
// buttons/links so tapping them doesn't accidentally short-circuit focus.
document.addEventListener("click", (e) => {
  if (isInteractiveTarget(e.target)) return;
  const focused = document.activeElement;
  if (!focused || !focused.classList?.contains("cell-input") || focused.readOnly) return;
  const wrapper = focused.closest(".cell-flex");
  if (wrapper && !wrapper.contains(e.target)) commitCell(focused);
});

loadMembers();
