// Business rules shared by the Accounts page (function-expenses/) and the dashboard (functions-dashboard/), kept in
// ONE file so the two can never disagree about who belongs to a function.

// Who is expected to take part in `fn`:
//   - a function whose allowed_type is "All" (or unset) includes everyone, otherwise only people of that type;
//   - people flagged `avoid` are left out, UNLESS they already have an entry for this function (so recorded money
//     never disappears from view).
// `entriesForFunction` must be the ledger rows of that one function.
function eligiblePeople(allPeople, fn, entriesForFunction) {
  const allowedType = fn?.allowed_type || "All";
  const ofType = allowedType === "All" ? allPeople : allPeople.filter((p) => p.type === allowedType);
  const hasEntry = new Set(entriesForFunction.map((e) => e.person_id));
  return ofType.filter((p) => !p.avoid || hasEntry.has(p.id));
}
