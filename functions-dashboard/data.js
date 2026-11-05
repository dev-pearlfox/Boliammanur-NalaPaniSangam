// Data layer: loads every table once, and answers "what are the totals for these functions?" in ONE place
// (summarize) so Overview, the scoreboard and Explore can never disagree.

let people = [];
let functionsList = [];
let ledgerEntries = [];   // வரவு (income): per-person collections (asal / santha / vatti / thogai / total)
let materials = [];
let expenseEntries = [];  // செலவு (expense): one row per (function, category), see supabase/expense_entries.sql

// Supabase returns at most 1000 rows per request, so a plain select would SILENTLY drop rows once a table grows
// past that (and the totals would just be wrong). This pages through until a short page comes back. `order` must
// be a stable order, otherwise pages can overlap or skip rows.
async function fetchAll(table, order) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await order(client.from(table).select("*")).range(from, from + PAGE - 1);
    if (error) return { data: rows, error };
    rows.push(...data);
    if (data.length < PAGE) return { data: rows, error: null };
  }
}

// Replaces all in-memory data. Returns a list of human-readable problems (empty when all is well) for the banner.
async function loadAll() {
  const byId = (q) => q.order("id");
  const [p, f, l, m, x] = await Promise.all([
    fetchAll("people", (q) => q.order("member_no", { ascending: true, nullsFirst: false }).order("name").order("id")),
    fetchAll("functions", (q) => q.order("year").order("id")),
    fetchAll("ledger_entries", byId),
    fetchAll("materials", byId),
    fetchAll("expense_entries", byId),
  ]);
  people = p.data;
  functionsList = f.data;
  ledgerEntries = l.data;
  materials = m.data;
  expenseEntries = x.data;

  const problems = [];
  [["people", p], ["functions", f], ["ledger_entries", l], ["materials", m]].forEach(([name, r]) => {
    if (r.error) problems.push(`Could not load ${name}: ${r.error.message}`);
  });
  if (x.error) {
    problems.push(
      "Expenses are not available yet (" + x.error.message + "). Run functions-dashboard/supabase/expense_entries.sql " +
      "in Supabase; until then செலவு shows 0."
    );
  }
  return problems;
}

const functionLabel = (f) => `${f.name} (${f.year})`;
const allFunctionIds = () => new Set(functionsList.map((f) => f.id));
const functionIdsForYear = (year) => new Set(functionsList.filter((f) => f.year === year).map((f) => f.id));
const sortedYears = () => [...new Set(functionsList.map((f) => f.year))].sort((a, b) => a - b);

// Totals for a set of function ids. `income` has the four collection types plus `total` (the stored per-person
// total, as the old dashboard used); `balance` = income.total - expense (மீதி). `byCategory` maps category key ->
// amount.
function summarize(funcIds) {
  const entries = ledgerEntries.filter((e) => funcIds.has(e.function_id));
  const expenses = expenseEntries.filter((r) => funcIds.has(r.function_id));
  const income = { asal: 0, santha: 0, vatti: 0, thogai: 0, total: 0 };
  entries.forEach((e) => Object.keys(income).forEach((k) => { income[k] += Number(e[k] || 0); }));
  const byCategory = {};
  let expense = 0;
  expenses.forEach((r) => {
    const amount = Number(r.amount || 0);
    byCategory[r.category] = (byCategory[r.category] || 0) + amount;
    expense += amount;
  });
  return { entries, expenses, income, expense, byCategory, balance: income.total - expense };
}

// One { f, s } per function in `funcIds` (f = the function, s = summarize() of just that function), newest year first.
// Used by the Overview scoreboard and the printed summary.
function functionRows(funcIds) {
  return functionsList
    .filter((f) => funcIds.has(f.id))
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))
    .map((f) => ({ f, s: summarize(new Set([f.id])) }));
}

// Who has and has not paid the சந்தா for function `f`. "Paid" = the சந்தா box is ticked on the Accounts page.
// Who is expected to pay comes from the shared rule (../function-rules.js). `pending` = unpaid people x the
// function's fixed சந்தா price.
function santhaStatus(f) {
  const entries = ledgerEntries.filter((e) => e.function_id === f.id);
  const eligible = eligiblePeople(people, f, entries);
  const paidIds = new Set(entries.filter((e) => e.santha_checked).map((e) => e.person_id));
  const unpaid = eligible.filter((p) => !paidIds.has(p.id));
  return { eligible: eligible.length, paid: eligible.length - unpaid.length, unpaid, pending: unpaid.length * Number(f.santha_amount ?? 1000) };
}
