// Section 1: Overview. Everything, all years and all functions together: வரவு / செலவு / மீதி, charts, and a
// scoreboard with one row per function. Clicking a scoreboard row opens that function in Explore.

function renderOverview() {
  const all = summarize(allFunctionIds());
  setHeroTiles("ov", all);
  $("ov-asal").textContent = money(all.income.asal);
  $("ov-santha").textContent = money(all.income.santha);
  $("ov-vatti").textContent = money(all.income.vatti);
  $("ov-thogai").textContent = money(all.income.thogai);
  // The extra வரவு tiles come from INCOME_KINDS. Carry-over money is not in the all-years வரவு, so its tile says so.
  $("ov-extra-tiles").innerHTML = INCOME_KINDS.map((k) => {
    const left = k.isCarryOver && all.income.carryNotCounted > 0;
    const value = (all.income.extra[k.key] || 0) + (left ? all.income.carryNotCounted : 0);
    return `<div class="tile"><div class="label">${escapeHtml(k.label)}${left ? " <small>(not in வரவு)</small>" : ""}</div><div class="value">${money(value)}</div></div>`;
  }).join("");
  $("ov-carry-note").textContent = all.income.carryNotCounted > 0
    ? "Each function's row includes its முந்தைய இருப்பு, but this all-years வரவு leaves it out so the same money is not counted twice."
    : "";
  $("ov-material").textContent = money(materials.reduce((s, m) => s + Number(m.cost || 0), 0));

  renderOverviewCharts(all);
  renderCompare();   // compare.js
  renderScoreboard(all);
}

function renderOverviewCharts(all) {
  const years = sortedYears();
  const perYear = years.map((y) => summarize(functionIdsForYear(y)));
  const credit = cssVar("--credit");
  const expense = cssVar("--expense");

  drawChart("ov-year", "chart-ov-year", {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        { label: "வரவு (income)", data: perYear.map((s) => s.income.total), backgroundColor: credit, borderRadius: 4 },
        { label: "செலவு (expense)", data: perYear.map((s) => s.expense), backgroundColor: expense, borderRadius: 4 },
      ],
    },
    options: baseOptions(),
  });

  // Running totals year by year; the gap between the two lines is the balance (மீதி).
  let incomeSoFar = 0;
  let expenseSoFar = 0;
  const cumulative = perYear.map((s) => {
    incomeSoFar += incomeWithoutCarry(s.income);   // a running total across years must not count carried-over money again
    expenseSoFar += s.expense;
    return { income: incomeSoFar, expense: expenseSoFar };
  });
  drawChart("ov-cumulative", "chart-ov-cumulative", {
    type: "line",
    data: {
      labels: years,
      datasets: [
        { label: "Cumulative வரவு", data: cumulative.map((c) => c.income), borderColor: credit, backgroundColor: credit, borderWidth: 2, pointRadius: 4, tension: 0.15 },
        { label: "Cumulative செலவு", data: cumulative.map((c) => c.expense), borderColor: expense, backgroundColor: expense, borderWidth: 2, pointRadius: 4, tension: 0.15 },
      ],
    },
    options: baseOptions(),
  });

  drawChart("ov-components", "chart-ov-components", {
    type: "bar",
    data: {
      labels: years,
      datasets: INCOME_PARTS.map((p) => ({ label: p.label, data: perYear.map((s) => p.amount(s.income)), backgroundColor: cssVar(p.color), borderRadius: 4 })),
    },
    options: stackedOptions(),
  });

  const categories = expenseItems(all.byCategory);
  drawChart("ov-expense-cat", "chart-ov-expense-cat", {
    type: "bar",
    data: {
      labels: categories.map((c) => c.label),
      datasets: [{ label: "செலவு", data: categories.map((c) => c.amount), backgroundColor: expense, borderRadius: 4 }],
    },
    options: horizontalOptions(),
  });
}

// One row per function (newest year first), then a totals row. Row click -> Explore on that function.
function renderScoreboard(all) {
  const rows = functionRows(allFunctionIds());
  $("ov-scoreboard").innerHTML = rows.length
    ? rows
        .map(({ f, s }) => {
          return `<tr class="clickable" data-function="${f.id}" tabindex="0" title="Open in Explore">
            <td>${escapeHtml(f.name)}<span class="year-inline"> &middot; ${f.year}</span></td>
            <td class="col-year">${f.year}</td>
            <td class="num">${money(s.income.total)}</td>
            <td class="num">${money(s.expense)}</td>
            <td class="num ${s.balance < 0 ? "amt-expense" : "amt-credit"}">${money(s.balance)}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="empty">No functions yet. Add one in Admin.</td></tr>`;
  $("ov-scoreboard-total").innerHTML = `<tr>
      <td>All functions</td>
      <td class="col-year"></td>
      <td class="num">${money(all.income.total)}</td>
      <td class="num">${money(all.expense)}</td>
      <td class="num ${all.balance < 0 ? "amt-expense" : "amt-credit"}">${money(all.balance)}</td>
    </tr>`;
}

function onScoreboardActivate(e) {
  const tr = e.target.closest("tr[data-function]");
  if (!tr) return;
  if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  openExplore(tr.dataset.function);   // explore.js
}
$("ov-scoreboard").addEventListener("click", onScoreboardActivate);
$("ov-scoreboard").addEventListener("keydown", onScoreboardActivate);
