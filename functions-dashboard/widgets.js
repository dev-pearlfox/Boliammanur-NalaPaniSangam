// Small pieces of UI used by both Overview and Explore.

// Fills the three hero tiles whose element ids start with `prefix` ("ov" or "ex"): வரவு, செலவு, மீதி. A negative
// balance (spent more than collected) turns the balance tile red.
function setHeroTiles(prefix, s) {
  $(prefix + "-income").textContent = money(s.income.total);
  $(prefix + "-expense").textContent = money(s.expense);
  $(prefix + "-balance").textContent = money(s.balance);
  $(prefix + "-balance-tile").classList.toggle("negative", s.balance < 0);
}

// A list of "label ... amount" rows, each with a bar showing its share of `total`. `tone` is "credit" (green) or
// "expense" (red). Rows with nothing in them are the caller's business to leave out.
function barList(items, total, tone) {
  if (!items.length) return `<p class="empty">Nothing recorded yet.</p>`;
  return items
    .map((i) => {
      const pct = total > 0 ? (i.amount / total) * 100 : 0;
      return `<div class="bar-row">
        <div class="bar-top"><span>${escapeHtml(i.label)}</span><span class="bar-amount">${money(i.amount)} <small>${pct.toFixed(0)}%</small></span></div>
        <div class="bar-track"><div class="bar-fill ${tone}" style="width:${pct.toFixed(1)}%"></div></div>
      </div>`;
    })
    .join("");
}

// Expense categories as bar-list items, biggest first, skipping empty ones. A category key that is not in
// EXPENSE_HEADERS (renamed or removed later) still shows, under its raw key, so money never goes missing.
function expenseItems(byCategory) {
  const known = new Set(EXPENSE_HEADERS.map((h) => h.key));
  const items = EXPENSE_HEADERS.map((h) => ({ label: h.label, amount: byCategory[h.key] || 0 }));
  Object.keys(byCategory).filter((k) => !known.has(k)).forEach((k) => items.push({ label: k, amount: byCategory[k] }));
  return items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
}

// A filter pill button. `attr` becomes the data attribute (data-year, data-fn, data-name...) the click handler reads.
const pill = (attr, value, label, active) =>
  `<button type="button" class="pill ${active ? "active" : ""}" data-${attr}="${escapeHtml(value)}" aria-pressed="${active}">${escapeHtml(label)}</button>`;

// Shows the "swipe sideways" hint above a table only when that table really is wider than its box (so: on phones,
// for wide tables). Hidden sections measure as 0 wide, so this runs again whenever a section is shown or the window
// is resized.
function syncSwipeHints() {
  document.querySelectorAll(".swipe-hint").forEach((hint) => {
    const wrap = hint.nextElementSibling;
    hint.classList.toggle("hidden", !(wrap && wrap.scrollWidth > wrap.clientWidth + 1));
  });
}
window.addEventListener("resize", syncSwipeHints);
