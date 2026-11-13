// The one printing routine shared by the Accounts page (print.js) and the Members page (members-print.js).
// printTable() fills the print-only block (#print-sheet, a direct child of <body>) with a clean table and opens the
// browser's print dialog, where "Save as PDF" is one click; style.css (@media print) hides everything else.
// Rows are read from what is on screen (printRows), so a filter typed into a table also filters the printout.
// Needs escapeHtml from shared.js, so load it after shared.js.

const PRINT_NUMBER = /^-?[\d,]+(\.\d+)?$/;

// What one cell shows: an input's value, the சந்தா amount only if it is ticked, "Yes" for a ticked Avoid, else the text.
function printCellText(cell) {
  const santha = cell.querySelector(".f-santha-check");
  if (santha) return santha.checked ? cell.querySelector(".santha-amount").textContent.trim() : "-";
  const avoid = cell.querySelector(".avoid-check");
  if (avoid) return avoid.checked ? "Yes" : "";
  const input = cell.querySelector("input");
  return (input ? input.value : cell.textContent).trim();
}

const printRow = (tr) => [...tr.children].filter((c) => !c.classList.contains("ic-del")).map(printCellText);
const printRows = (selector) => [...document.querySelectorAll(selector)].map(printRow);

// `numeric[i]` is true for a column of numbers: its title and every cell (even a "-") are right-aligned together.
function printCells(tag, cells, numeric) {
  return cells.map((c, i) => `<${tag}${numeric[i] ? ' class="num"' : ""}>${escapeHtml(c)}</${tag}>`).join("");
}

// heading: the line under the site name; fileTitle: the default PDF file name; head/body/foot: arrays of rows of text.
function printTable({ heading, fileTitle, head, body, foot = [] }) {
  const numeric = head.map((_, i) => body.some((r) => PRINT_NUMBER.test(r[i])));
  const rows = (list, tag = "td") => list.map((r) => `<tr>${printCells(tag, r, numeric)}</tr>`).join("");
  document.getElementById("print-sheet").innerHTML = `
    <h1>Boliammanur</h1>
    <h2>${escapeHtml(heading)}</h2>
    <p class="print-meta">printed ${new Date().toLocaleDateString()}</p>
    <table><thead>${rows([head], "th")}</thead><tbody>${rows(body) || `<tr><td colspan="${head.length}">Nothing recorded.</td></tr>`}</tbody>
      <tfoot>${rows(foot)}</tfoot></table>`;

  // The browser uses the page title as the default PDF file name, so give it a useful one for the print only.
  const originalTitle = document.title;
  document.title = fileTitle;
  window.addEventListener("afterprint", () => { document.title = originalTitle; }, { once: true });
  window.print();
}
