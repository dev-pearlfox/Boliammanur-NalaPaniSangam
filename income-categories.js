// The extra வரவு (income) tables, beside the members button, in display order. ONE copy: the Accounts page builds
// its buttons and tables from it (function-expenses/income.js). The dashboard can load the same file when it
// starts counting these.
// `key` is what is stored in income_entries.kind (functions-dashboard/supabase/income_entries.sql); never rename a
// key once data exists. Labels and placeholders are wording and can be changed freely.
// `columns` is the table, left to right. `field` is one of: date, name (Tamil name), nameEn (English name), phone,
// amount, note. Each kind lists only the columns it needs (see FIELD_TYPES in function-expenses/income.js).
// `isCarryOver: true` marks last year's leftover money. The dashboard counts it in வரவு/மீதி only when a single
// year is selected; across several years it would count the same rupees twice (once when earned, once carried).
const INCOME_KINDS = [
  { key: "donation", label: "நன்கொடை",              // gifts from people outside the member list
    totalLabel: "மொத்த நன்கொடை",
    columns: [
      { field: "date", label: "தேதி" },
      { field: "name", label: "பெயர்", placeholder: "பெயர்" },
      { field: "nameEn", label: "Name", placeholder: "Name" },
      { field: "phone", label: "Mobile Number" },
      { field: "amount", label: "தொகை" },
      { field: "note", label: "குறிப்பு" },
    ] },
  { key: "auction", label: "ஏலம்",                   // things auctioned during the function
    totalLabel: "மொத்த ஏலம்",
    columns: [
      { field: "date", label: "தேதி" },
      { field: "name", label: "ஏலப் பொருள்", placeholder: "எ.கா. மாலை, தேங்காய்" },
      { field: "note", label: "ஏலம் எடுத்தவர்" },
      { field: "phone", label: "Mobile Number" },
      { field: "amount", label: "தொகை" },
    ] },
  { key: "carry-forward", label: "முந்தைய இருப்பு",   // money left over from last year's function
    isCarryOver: true,
    totalLabel: "மொத்த முந்தைய இருப்பு",
    columns: [
      { field: "date", label: "தேதி" },
      { field: "name", label: "விவரம்", placeholder: "எ.கா. கடந்த ஆண்டு மீதி" },
      { field: "amount", label: "தொகை" },
      { field: "note", label: "குறிப்பு" },
    ] },
];
