// "Print / save as PDF": fills a print-only block (#print-summary) with a clean one-page summary and opens the
// browser's print dialog, where "Save as PDF" is one click. style.css (@media print) hides everything else, so no
// PDF library is needed. Called from the Overview (everything) and Explore (the current selection).

function printSummary(funcIds, title) {
  const s = summarize(funcIds);
  const row = (label, amount, tone = "") => `<tr><td>${escapeHtml(label)}</td><td class="num ${tone}">${money(amount)}</td></tr>`;
  const incomeRows = INCOME_PARTS.map((p) => [p.label, p.amount(s.income)])
    .filter(([, amount]) => amount > 0)
    .map(([label, amount]) => row(label, amount))
    .join("") +
    (s.income.carryNotCounted > 0 ? `<tr><td colspan="2"><em>முந்தைய இருப்பு ${money(s.income.carryNotCounted)} not counted (several years selected).</em></td></tr>` : "");
  const expenseRows = expenseItems(s.byCategory).map((i) => row(i.label, i.amount)).join("");
  const functionRowsHtml = functionRows(funcIds)
    .map(({ f, s: fs }) => {
      const st = santhaStatus(f);
      return `<tr><td>${escapeHtml(f.name)}</td><td>${f.year}</td><td class="num">${money(fs.income.total)}</td><td class="num">${money(fs.expense)}</td><td class="num">${money(fs.balance)}</td><td class="num">${st.paid} of ${st.eligible}</td></tr>`;
    })
    .join("");

  $("print-summary").innerHTML = `
    <h1>Boliammanur</h1>
    <h2>Accounts summary</h2>
    <p class="print-meta">${escapeHtml(title)} &middot; printed ${new Date().toLocaleDateString()}</p>
    <table class="print-totals"><thead><tr><th>வரவு (income)</th><th>செலவு (expense)</th><th>மீதி (balance)</th></tr></thead>
      <tbody><tr><td>${money(s.income.total)}</td><td>${money(s.expense)}</td><td>${money(s.balance)}</td></tr></tbody></table>
    <h3>வரவு by type</h3>
    <table>${incomeRows || `<tr><td>Nothing recorded.</td></tr>`}</table>
    <h3>செலவு by category</h3>
    <table>${expenseRows || `<tr><td>Nothing recorded.</td></tr>`}</table>
    <h3>Functions</h3>
    <table><thead><tr><th>Function</th><th>Year</th><th class="num">வரவு</th><th class="num">செலவு</th><th class="num">மீதி</th><th class="num">சந்தா paid</th></tr></thead>
      <tbody>${functionRowsHtml}</tbody></table>`;

  // The browser uses the page title as the default PDF file name, so give it a useful one for the print only.
  const originalTitle = document.title;
  document.title = "Boliammanur accounts - " + title;
  window.addEventListener("afterprint", () => { document.title = originalTitle; }, { once: true });
  window.print();
}

$("ov-print").addEventListener("click", () => printSummary(allFunctionIds(), "All years and all functions"));
$("ex-print").addEventListener("click", () => printSummary(exploreFunctionIds(), selectionTitle()));
