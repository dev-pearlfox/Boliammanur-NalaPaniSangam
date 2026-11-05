// செலவு (expense) view of the accounts page: the செலவு button in the sheet title shows a table with one row per
// header (EXPENSE_HEADERS) for the selected function, instead of the members sheet. Amounts and notes autosave
// per row, the same way the members sheet does (debounced upsert).
//
// Loaded BEFORE app.js on purpose: app.js calls expenseButtonHtml()/syncExpenseView() from updateSheetTitle(),
// and this file uses app.js's globals (client, selectedFunctionId, $, setStatus, applySheetVisibility) only
// when its functions run, never at load time. Do not redeclare any app.js/shared.js global here.

// EXPENSE_HEADERS (the nine categories) comes from ../expense-categories.js, which index.html loads first; the
// dashboard uses the same file, so the two sites can never disagree about the categories.

let expenseOpen = false;       // true while the செலவு table is shown (the members sheet is hidden then)
let expenseRows = {};          // key -> { amount, note } for expenseLoadedFor
let expenseLoadedFor = null;   // function id the rows above belong to
const expenseSaveTimers = {};  // key -> debounce timer

function expenseButtonHtml() {
  return `<button type="button" id="expense-btn" class="members-toggle ${expenseOpen ? "active" : ""}">செலவு</button>`;
}

// Called by app.js after every title render, and by setExpenseOpen.
function syncExpenseView() {
  document.getElementById("expense-card").classList.toggle("hidden", !expenseOpen);
  document.body.classList.toggle("view-expenses", expenseOpen);
  if (expenseOpen && expenseLoadedFor !== selectedFunctionId) loadExpenses();
}

function setExpenseOpen(open) {
  if (open && incomeView) setIncomeView(null);   // income.js: only one table on screen at a time
  expenseOpen = open;
  applySheetVisibility();   // app.js: hides/shows the members sheet and sets the two buttons' active look
  syncExpenseView();
}

async function loadExpenses() {
  const funcId = selectedFunctionId;
  expenseLoadedFor = funcId;
  expenseRows = {};
  renderExpenses();
  setStatus("expense-status", "", false);
  if (!funcId) return;
  const { data, error } = await client.from("expense_entries").select("*").eq("function_id", funcId);
  if (funcId !== selectedFunctionId) return;   // the user switched function while this was loading
  if (error) {
    expenseLoadedFor = null;                   // try again the next time the view is synced
    setStatus("expense-status", "Error loading expenses: " + error.message, true);
    return;
  }
  data.forEach((r) => { expenseRows[r.category] = { amount: Number(r.amount), note: r.note || "" }; });
  renderExpenses();
}

function expenseTotal() {
  return EXPENSE_HEADERS.reduce((sum, h) => sum + (expenseRows[h.key]?.amount || 0), 0);
}

function renderExpenseTotal() {
  document.getElementById("expense-total").textContent = expenseTotal().toFixed(0);
}

function renderExpenses() {
  document.getElementById("expense-body").innerHTML = EXPENSE_HEADERS.map((h, i) => {
    const r = expenseRows[h.key] || { amount: 0, note: "" };
    return `<tr data-category="${h.key}">
      <td>${i + 1}</td>
      <td>${h.label}</td>
      <td><input type="number" step="0.01" min="0" class="f-expense-amount" value="${r.amount}" /></td>
      <td><input type="text" class="f-expense-note" value="${escapeHtml(r.note)}" /></td>
    </tr>`;
  }).join("");
  renderExpenseTotal();
}

async function saveExpense(key, funcId) {
  const r = expenseRows[key] || { amount: 0, note: "" };
  const payload = { function_id: funcId, category: key, amount: r.amount, note: r.note, updated_at: new Date().toISOString() };
  const { error } = await client.from("expense_entries").upsert(payload, { onConflict: "function_id,category" });
  setStatus("expense-status", error ? "Error saving expense: " + error.message : "", !!error);
  if (error || funcId !== selectedFunctionId) return;
  const tr = document.querySelector(`#expense-body tr[data-category="${key}"]`);
  if (!tr) return;
  tr.classList.add("row-saved");
  setTimeout(() => tr.classList.remove("row-saved"), ROW_SAVE_BLINK_MS);
}

document.getElementById("expense-body").addEventListener("input", (e) => {
  const tr = e.target.closest("tr");
  if (!tr || !selectedFunctionId) return;
  const key = tr.dataset.category;
  expenseRows[key] = {
    amount: parseFloat(tr.querySelector(".f-expense-amount").value) || 0,
    note: tr.querySelector(".f-expense-note").value.trim(),
  };
  renderExpenseTotal();
  const funcId = selectedFunctionId;   // captured now: the save still goes to this function if the user switches
  clearTimeout(expenseSaveTimers[key]);
  expenseSaveTimers[key] = setTimeout(() => { delete expenseSaveTimers[key]; saveExpense(key, funcId); }, SAVE_DEBOUNCE_MS);
});

document.getElementById("sheet-title").addEventListener("click", (e) => {
  if (e.target.closest("#expense-btn")) setExpenseOpen(!expenseOpen);
});
