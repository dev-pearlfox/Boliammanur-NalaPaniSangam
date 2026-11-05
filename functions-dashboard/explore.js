// Section 2: Explore. The same வரவு / செலவு / மீதி numbers as Overview, narrowed by Year and Function pills, plus
// the per-person ledger and materials tables (with their column filters).

let exploreYear = "";   // "" = all years, otherwise a year as a string
let exploreFn = "";     // "" = all functions, otherwise a function id
let exploreEntries = [];     // ledger rows for the current selection (the people table re-filters these)
let exploreMaterials = [];   // material rows for the current selection

// Called from the Overview scoreboard: jump straight to one function.
function openExplore(functionId) {
  const f = functionsList.find((x) => x.id === functionId);
  exploreYear = f ? String(f.year) : "";
  exploreFn = f ? f.id : "";
  showSection("explore");   // app.js; renders Explore
}

function visibleFunctions() {
  return functionsList
    .filter((f) => !exploreYear || String(f.year) === exploreYear)
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
}

function renderExploreFilters() {
  // A function that no longer matches the chosen year (e.g. the year pill was changed) falls back to "all".
  if (exploreFn && !visibleFunctions().some((f) => f.id === exploreFn)) exploreFn = "";

  const years = [...sortedYears()].reverse();
  $("ex-year-pills").innerHTML =
    pill("year", "", "All years", exploreYear === "") + years.map((y) => pill("year", String(y), String(y), exploreYear === String(y))).join("");
  $("ex-fn-pills").innerHTML =
    pill("fn", "", "All functions", exploreFn === "") + visibleFunctions().map((f) => pill("fn", f.id, functionLabel(f), exploreFn === f.id)).join("");
  // Phones show this dropdown instead of the (many, wide) function pills; both edit the same exploreFn.
  $("ex-fn-select").innerHTML =
    `<option value="">All functions</option>` + visibleFunctions().map((f) => `<option value="${f.id}" ${exploreFn === f.id ? "selected" : ""}>${escapeHtml(functionLabel(f))}</option>`).join("");
}

function exploreFunctions() {
  return visibleFunctions().filter((f) => !exploreFn || f.id === exploreFn);
}
const exploreFunctionIds = () => new Set(exploreFunctions().map((f) => f.id));

// Plain-language name of the current selection (also the heading of the printed summary).
function selectionTitle() {
  const f = functionsList.find((x) => x.id === exploreFn);
  if (f) return functionLabel(f);
  return exploreYear ? `All functions in ${exploreYear}` : "All years and all functions";
}

function renderExplore() {
  renderExploreFilters();
  const ids = exploreFunctionIds();
  const s = summarize(ids);
  exploreEntries = s.entries;
  exploreMaterials = materials.filter((m) => ids.has(m.function_id));

  $("ex-selection").textContent = "Showing " + selectionTitle();
  setHeroTiles("ex", s);
  $("ex-income-list").innerHTML = barList(
    [
      { label: "Asal", amount: s.income.asal },
      { label: "Santha", amount: s.income.santha },
      { label: "Vatti", amount: s.income.vatti },
      { label: "Thogai", amount: s.income.thogai },
    ].filter((i) => i.amount > 0),
    s.income.total,
    "credit"
  );
  $("ex-expense-list").innerHTML = barList(expenseItems(s.byCategory), s.expense, "expense");
  const materialCost = exploreMaterials.reduce((sum, m) => sum + Number(m.cost || 0), 0);
  $("ex-material-note").textContent = `Material usage for this selection: ${money(materialCost)} (tracked separately, not included in செலவு).`;

  renderUnpaid(exploreFunctions());   // unpaid.js

  renderPeopleChart(exploreEntries);
  renderMaterialsChart(exploreMaterials);
  renderPeopleTable(exploreEntries);
  renderMaterialsTable(exploreMaterials);
}

$("ex-year-pills").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-year]");
  if (!btn) return;
  exploreYear = btn.dataset.year;
  renderExplore();
});
$("ex-fn-pills").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fn]");
  if (!btn) return;
  exploreFn = btn.dataset.fn;
  renderExplore();
});
$("ex-fn-select").addEventListener("change", (e) => {
  exploreFn = e.target.value;
  renderExplore();
});

// ---------- Charts ----------

function renderPeopleChart(entries) {
  const peopleName = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const totals = {};
  entries.forEach((e) => {
    totals[e.person_id] = (totals[e.person_id] || 0) + Number(e.total);
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  drawChart("people", "chart-people", {
    type: "bar",
    data: {
      labels: sorted.map(([id]) => peopleName[id] || "?"),
      datasets: [{ label: "Total", data: sorted.map(([, v]) => v), backgroundColor: cssVar("--series-1"), borderRadius: 4 }],
    },
    options: horizontalOptions(),
  });
}

function renderMaterialsChart(mats) {
  const totals = {};
  mats.forEach((m) => {
    totals[m.item_name] = (totals[m.item_name] || 0) + Number(m.cost || 0);
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  drawChart("materials", "chart-materials", {
    type: "bar",
    data: {
      labels: sorted.map(([name]) => name),
      datasets: [{ label: "Cost", data: sorted.map(([, v]) => v), backgroundColor: cssVar("--series-1"), borderRadius: 4 }],
    },
    options: horizontalOptions(),
  });
}

// ---------- Tables ----------

function renderPeopleTable(entries) {
  const peopleMap = Object.fromEntries(people.map((p) => [p.id, p]));
  const totals = {};
  entries.forEach((e) => {
    if (!totals[e.person_id]) totals[e.person_id] = { asal: 0, santha: 0, vatti: 0, thogai: 0, total: 0, remarks: [] };
    const t = totals[e.person_id];
    t.asal += Number(e.asal);
    t.santha += Number(e.santha);
    t.vatti += Number(e.vatti);
    t.thogai += Number(e.thogai);
    t.total += Number(e.total);
    if (e.paid) t.remarks.push(e.paid);
  });
  let rows = Object.entries(totals).sort((a, b) => {
    const pa = peopleMap[a[0]], pb = peopleMap[b[0]];
    return (pa?.member_no ?? 9999) - (pb?.member_no ?? 9999) || (pa?.name || "").localeCompare(pb?.name || "");
  });

  const snoQ = $("filter-people-sno").value.trim().toLowerCase();
  const nameQ = $("filter-people-name").value.trim().toLowerCase();
  const asalQ = $("filter-people-asal").value.trim();
  const santhaQ = $("filter-people-santha").value.trim();
  const vattiQ = $("filter-people-vatti").value.trim();
  const thogaiQ = $("filter-people-thogai").value.trim();
  const totalQ = $("filter-people-total").value.trim();
  const paidQ = $("filter-people-paid").value.trim().toLowerCase();

  rows = rows.filter(([id, v]) => {
    const p = peopleMap[id];
    if (snoQ && !String(p?.member_no ?? "").toLowerCase().includes(snoQ)) return false;
    if (nameQ && !(p?.name || "").toLowerCase().includes(nameQ)) return false;
    if (asalQ && !money(v.asal).includes(asalQ)) return false;
    if (santhaQ && !money(v.santha).includes(santhaQ)) return false;
    if (vattiQ && !money(v.vatti).includes(vattiQ)) return false;
    if (thogaiQ && !money(v.thogai).includes(thogaiQ)) return false;
    if (totalQ && !money(v.total).includes(totalQ)) return false;
    if (paidQ && !v.remarks.join("; ").toLowerCase().includes(paidQ)) return false;
    return true;
  });

  $("people-table").innerHTML = rows
    .map(([id, v]) => {
      const p = peopleMap[id];
      return `<tr>
        <td>${p?.member_no ?? ""}</td>
        <td>${escapeHtml(p?.name || "?")}</td>
        <td>${money(v.asal)}</td>
        <td>${money(v.santha)}</td>
        <td>${money(v.vatti)}</td>
        <td>${money(v.thogai)}</td>
        <td>${money(v.total)}</td>
        <td>${escapeHtml(v.remarks.join("; "))}</td>
      </tr>`;
    })
    .join("");
}

function renderMaterialsTable(mats) {
  const funcMap = Object.fromEntries(functionsList.map((f) => [f.id, functionLabel(f)]));
  const funcQ = $("filter-mat-function").value.trim().toLowerCase();
  const itemQ = $("filter-mat-item").value.trim().toLowerCase();
  const qtyQ = $("filter-mat-qty").value.trim().toLowerCase();
  const costQ = $("filter-mat-cost").value.trim();

  const rows = mats
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter((m) => {
      const funcLabel = (funcMap[m.function_id] || "?").toLowerCase();
      const qtyLabel = `${m.quantity ?? ""} ${m.unit || ""}`.toLowerCase();
      if (funcQ && !funcLabel.includes(funcQ)) return false;
      if (itemQ && !(m.item_name || "").toLowerCase().includes(itemQ)) return false;
      if (qtyQ && !qtyLabel.includes(qtyQ)) return false;
      if (costQ && !money(m.cost).includes(costQ)) return false;
      return true;
    });

  $("materials-table").innerHTML = rows
    .map(
      (m) => `<tr>
        <td>${escapeHtml(funcMap[m.function_id] || "?")}</td>
        <td>${escapeHtml(m.item_name)}</td>
        <td>${m.quantity ?? ""} ${escapeHtml(m.unit || "")}</td>
        <td>${money(m.cost)}</td>
      </tr>`
    )
    .join("");
}

// Column filter rows above each table: re-filter the current selection as the user types.
["filter-people-sno", "filter-people-name", "filter-people-asal", "filter-people-santha", "filter-people-vatti", "filter-people-thogai", "filter-people-total", "filter-people-paid"].forEach((id) =>
  $(id).addEventListener("input", () => renderPeopleTable(exploreEntries))
);
["filter-mat-function", "filter-mat-item", "filter-mat-qty", "filter-mat-cost"].forEach((id) =>
  $(id).addEventListener("input", () => renderMaterialsTable(exploreMaterials))
);
