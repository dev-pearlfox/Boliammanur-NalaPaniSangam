// Money format shared by the Accounts page and the Dashboard, so an amount looks the same everywhere.
// Indian grouping: the last three digits, then pairs (12,34,567). Decimals only appear when the value has them.

function formatMoney(n) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Whole rupees only: no decimal point, no minus, no letters. A pasted "12.5" becomes 12 (cut at the point), not 125.
function filterWholeNumber(el) {
  const cleaned = el.value.replace(/\..*$/, "").replace(/\D/g, "");
  if (cleaned !== el.value) el.value = cleaned;
}

// Reads what a money box holds, with or without the commas ("1,23,456" and "123456" both give 123456).
function parseMoney(text) {
  return parseFloat(String(text ?? "").replace(/,/g, "")) || 0;
}
