// Overview: "Compare years". Pick a function (or all functions together) and see வரவு / செலவு / மீதி year by year,
// with the change from the previous year under each amount. Functions are matched by name, so "தேவாதி அம்மன்
// சாமி கும்பிடு" 2025 is compared with the same function in 2026.

let compareName = "";   // "" = all functions together, otherwise an exact function name

// Change from `prev` to `cur`, coloured good/bad. `higherIsBetter` is true for வரவு and மீதி, false for செலவு
// (spending more is the "bad" direction). prev === null means there is no earlier year to compare with.
function deltaCell(cur, prev, higherIsBetter) {
  if (prev === null) return `<small class="delta">&mdash;</small>`;
  const diff = cur - prev;
  if (diff === 0) return `<small class="delta">no change</small>`;
  const up = diff > 0;
  const sign = up ? "+" : "";
  const pct = prev === 0 ? "new" : `${sign}${((diff / Math.abs(prev)) * 100).toFixed(0)}%`;
  const abs = `${sign}${money(diff)}`;
  return `<small class="delta ${up === higherIsBetter ? "good" : "bad"}" title="${abs}"><span class="abs">${abs} </span>(${pct})</small>`;
}

function renderCompare() {
  const names = [...new Set(functionsList.map((f) => f.name))].sort((a, b) => a.localeCompare(b));
  if (compareName && !names.includes(compareName)) compareName = "";
  $("cmp-pills").innerHTML = pill("name", "", "All functions", compareName === "") + names.map((n) => pill("name", n, n, compareName === n)).join("");

  const rows = sortedYears()
    .map((year) => {
      const ids = new Set(functionsList.filter((f) => f.year === year && (!compareName || f.name === compareName)).map((f) => f.id));
      return ids.size ? { year, s: summarize(ids) } : null;
    })
    .filter(Boolean);

  $("cmp-body").innerHTML = rows
    .map(({ year, s }, i) => {
      const prev = i > 0 ? rows[i - 1].s : null;
      const cell = (value, prevValue, tone, higherIsBetter) =>
        `<td class="num ${tone}">${money(value)}<br />${deltaCell(value, prev ? prevValue : null, higherIsBetter)}</td>`;
      return `<tr>
        <td>${year}</td>
        ${cell(s.income.total, prev?.income.total, "amt-credit", true)}
        ${cell(s.expense, prev?.expense, "amt-expense", false)}
        ${cell(s.balance, prev?.balance, s.balance < 0 ? "amt-expense" : "amt-credit", true)}
      </tr>`;
    })
    .join("");
  $("cmp-note").textContent = rows.length < 2 ? "Needs at least two years of data to show a change." : "Change is compared with the previous year shown above it.";
}

$("cmp-pills").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-name]");
  if (!btn) return;
  compareName = btn.dataset.name;
  renderCompare();
});
