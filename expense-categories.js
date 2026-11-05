// The செலவு (expense) categories, in display order. ONE copy, loaded by both sites:
//   function-expenses/index.html  (the expense table on the Accounts page)
//   functions-dashboard/index.html (the Overview / Explore breakdowns)
// `key` is what is stored in expense_entries.category (functions-dashboard/supabase/expense_entries.sql); never
// rename a key once data exists. `label` can be reworded freely.
const EXPENSE_HEADERS = [
  { key: "kitchen", label: "சமையல்" },             // rice, dal, oil, vegetables, cook's wages, gas, firewood
  { key: "pooja", label: "பூஜை" },                 // flowers, garlands, coconut, camphor, priest's fees
  { key: "decoration", label: "அலங்காரம்" },       // pandal, lights, banners, sound system
  { key: "music", label: "இசை / கலை" },            // nadaswaram, band, drama
  { key: "vessels", label: "பாத்திரம் / பந்தல்" },   // rent or purchase of vessels, chairs, tents
  { key: "transport", label: "போக்குவரத்து" },     // vehicles, the chariot or kavadi
  { key: "labour", label: "கூலி" },                // helpers, cleaning
  { key: "printing", label: "அச்சு" },             // notices, invitations
  { key: "other", label: "மற்றவை" },               // anything that does not fit above
];
