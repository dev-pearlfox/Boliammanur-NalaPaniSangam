// "Print / save as PDF" for the accounts page: prints the table that is on screen (the members ledger, செலவு, or one of
// the income tables) for the selected function, through printTable() in print-table.js.
//
// Loaded BEFORE app.js, like expenses.js: app.js calls printButtonHtml() from updateSheetTitle(). It uses app.js globals
// (functionsList, selectedFunctionId, expenseOpen, incomeView) only when a click happens, never at load time.

function printButtonHtml() {
  return `<button type="button" id="print-btn" class="members-toggle print-btn">Print / save as PDF</button>`;
}

const totalOf = (id) => document.getElementById(id).textContent.trim();

// The table on screen: its heading, the column titles, the rows and the total row(s).
function printSource() {
  if (expenseOpen) {
    return { label: "செலவு", head: printRows(".expense-table thead tr")[0], body: printRows("#expense-body tr"), foot: printRows(".expense-table tfoot tr") };
  }
  if (incomeView) {
    const head = printRows("#income-head tr")[0];
    // The foot has one empty cell more than the head (the delete column), and a blank row to type into is not data.
    return {
      label: document.querySelector(".income-btn.active")?.textContent.trim() || "",
      head,
      body: printRows("#income-body tr").filter((r) => r.slice(1).some(Boolean)),
      foot: printRows("#income-foot tr").map((r) => r.slice(0, head.length)),
    };
  }
  return {
    label: "உறுப்பினர்கள்",
    head: printRows("#sheet-thead-wrap thead tr:first-child")[0],
    body: printRows("#sheet-body tr"),
    foot: [["", "Grand Total", "", "", ...["santha", "asal", "vatti", "thogai", "total"].map((k) => totalOf("totals-" + k))]],
  };
}

function printSheet() {
  const f = functionsList.find((fn) => fn.id === selectedFunctionId);
  if (!f) return;
  const { label, ...table } = printSource();
  printTable({ ...table, heading: `${f.name} (${f.year}) \u00b7 ${label}`, fileTitle: `Boliammanur - ${f.name} (${f.year}) - ${label}` });
}

document.getElementById("sheet-title").addEventListener("click", (e) => {
  if (e.target.closest("#print-btn")) printSheet();
});
