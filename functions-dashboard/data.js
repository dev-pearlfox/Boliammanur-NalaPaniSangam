// Data layer: loads every table once, and answers "what are the totals for these functions?" in ONE place
// (summarize) so Overview, the scoreboard and Explore can never disagree.

let people = [];
let functionsList = [];
let ledgerEntries = [];   // வரவு (income): per-person collections (asal / santha / vatti / thogai / total)
let materials = [];
let expenseEntries = [];  // செலவு (expense): one row per (function, category), see supabase/expense_entries.sql
let incomeEntries = [];   // extra வரவு typed on the Accounts page: நன்கொடை / ஏலம் / முந்தைய இருப்பு, see supabase/income_entries.sql

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
  const [p, f, l, m, x, inc] = await Promise.all([
    fetchAll("people", (q) => q.order("member_no", { ascending: true, nullsFirst: false }).order("name").order("id")),
    fetchAll("functions", (q) => q.order("year").order("id")),
    fetchAll("ledger_entries", byId),
    fetchAll("materials", byId),
    fetchAll("expense_entries", byId),
    fetchAll("income_entries", byId),
  ]);
  people = p.data;
  functionsList = f.data;
  ledgerEntries = l.data;
  materials = m.data;
  expenseEntries = x.data;
  incomeEntries = inc.data;

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
  if (inc.error) {
    problems.push(
      "நன்கொடை / ஏலம் / முந்தைய இருப்பு are not available yet (" + inc.error.message + "). Run " +
      "functions-dashboard/supabase/income_entries.sql in Supabase; until then they show 0."
    );
  }
  return problems;
}

const functionLabel = (f) => `${f.name} (${f.year})`;
const allFunctionIds = () => new Set(functionsList.map((f) => f.id));
const functionIdsForYear = (year) => new Set(functionsList.filter((f) => f.year === year).map((f) => f.id));
const sortedYears = () => [...new Set(functionsList.map((f) => f.year))].sort((a, b) => a - b);

// Every kind of வரவு, in display order: the four ledger columns, then the Accounts-page tables (INCOME_KINDS from
// ../income-categories.js). ONE list, so the tiles, the by-type chart, the Explore bars and the printout always show
// the same parts. `amount(income)` reads that part out of summarize().income; `color` is a --series-N CSS variable.
const INCOME_PARTS = [
  { label: "Asal", color: "--series-4", amount: (i) => i.asal },
  { label: "Santha", color: "--series-1", amount: (i) => i.santha },
  { label: "Vatti", color: "--series-2", amount: (i) => i.vatti },
  { label: "Thogai", color: "--series-3", amount: (i) => i.thogai },
  ...INCOME_KINDS.map((k, n) => ({ label: k.label, color: `--series-${5 + n}`, amount: (i) => i.extra[k.key] || 0 })),
];
const LEDGER_INCOME_FIELDS = ["asal", "santha", "vatti", "thogai", "total"];

// Totals for a set of function ids. `income` has the four ledger collection types plus `total` = everything that
// counts as வரவு: the stored per-person ledger totals + the extra Accounts-page income (`income.extra`, by kind).
// Carry-over money (முந்தைய இருப்பு, last year's leftover) counts only when the selection covers ONE year; across
// several years it would be counted twice, so it is left out and reported in `income.carryNotCounted` instead.
// `balance` = income.total - expense (மீதி). `byCategory` maps category key -> amount.
function summarize(funcIds) {
  const entries = ledgerEntries.filter((e) => funcIds.has(e.function_id));
  const expenses = expenseEntries.filter((r) => funcIds.has(r.function_id));
  const oneYear = new Set(functionsList.filter((f) => funcIds.has(f.id)).map((f) => f.year)).size <= 1;
  const income = { asal: 0, santha: 0, vatti: 0, thogai: 0, total: 0, extra: {}, carryNotCounted: 0 };
  entries.forEach((e) => LEDGER_INCOME_FIELDS.forEach((k) => { income[k] += Number(e[k] || 0); }));
  INCOME_KINDS.forEach((k) => { income.extra[k.key] = 0; });
  incomeEntries.filter((r) => funcIds.has(r.function_id)).forEach((r) => {
    const amount = Number(r.amount || 0);
    if (!oneYear && INCOME_KINDS.some((k) => k.key === r.kind && k.isCarryOver)) { income.carryNotCounted += amount; return; }
    income.extra[r.kind] = (income.extra[r.kind] || 0) + amount;
    income.total += amount;
  });
  const byCategory = {};
  let expense = 0;
  expenses.forEach((r) => {
    const amount = Number(r.amount || 0);
    byCategory[r.category] = (byCategory[r.category] || 0) + amount;
    expense += amount;
  });
  return { entries, expenses, income, expense, byCategory, balance: income.total - expense };
}

// வரவு without any carried-over money: what a running (cumulative) total over several years must use.
const incomeWithoutCarry = (income) =>
  income.total - INCOME_KINDS.filter((k) => k.isCarryOver).reduce((sum, k) => sum + (income.extra[k.key] || 0), 0);

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
