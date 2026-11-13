// Section 3: Admin. Add a function, change a function's fixed சந்தா price, change the Dashboard / Accounts passwords, sign out.

function renderAdmin() {
  $("functions-list").innerHTML = functionsList
    .slice()
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))
    .map(
      (f) => `<tr data-function="${f.id}">
        <td>${escapeHtml(f.name)}</td>
        <td>${f.year}</td>
        <td>${escapeHtml(f.allowed_type || "All")}</td>
        <td class="santha-amount-cell">
          <input type="number" class="santha-amount-input" min="0" step="1" value="${Number(f.santha_amount ?? 1000)}" aria-label="சந்தா amount for ${escapeHtml(functionLabel(f))}" />
          <button type="button" class="secondary santha-amount-save">Save</button>
        </td>
      </tr>`
    )
    .join("");
}

// ---------- Add function ----------

// Clicking the year box suggests this year and next (left empty, not pre-filled, so both suggestions show).
const thisYear = new Date().getFullYear();
$("function-year-options").innerHTML = [thisYear, thisYear + 1].map((y) => `<option value="${y}"></option>`).join("");

// Clicking the name box suggests the usual functions (FUNCTION_NAMES, function-rules.js); a new name can still be typed.
$("function-name-options").innerHTML = FUNCTION_NAMES.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");

$("function-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.submitter || $("function-form").querySelector('button[type="submit"]');
  const name = $("function-name").value.trim();
  const year = parseInt($("function-year").value, 10);
  const allowedType = $("function-allowed-type").value;
  const santhaAmount = Number($("function-santha-amount").value) || 0;
  if (!name || !year) return;
  // The same function can only exist once per year (the database enforces it too: add_function_unique.sql).
  const sameName = (f) => f.name.trim().toLowerCase() === name.toLowerCase();
  if (functionsList.some((f) => f.year === year && sameName(f))) {
    setStatus("function-status", `"${name}" already exists for ${year}.`, true);
    return;
  }
  submitBtn.disabled = true;
  setStatus("function-status", "Adding...", false);
  try {
    const { error } = await client.from("functions").insert({ name, year, allowed_type: allowedType, santha_amount: santhaAmount });
    if (error) {
      // 23505 = unique violation: someone else added it a moment ago and our list was stale.
      const message = error.code === "23505" ? `"${name}" already exists for ${year}.` : "Error: " + error.message;
      setStatus("function-status", message, true);
      return;
    }
    $("function-form").reset();
    setStatus("function-status", "Added.", false);
    await refreshAll();   // app.js
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- Change a function's சந்தா price ----------
// Updates the fixed price, then cascades the new amount to every entry already checked "paid" for that function,
// so stored totals stay consistent with what the Accounts page now shows.

$("functions-list").addEventListener("click", async (e) => {
  const btn = e.target.closest(".santha-amount-save");
  if (!btn) return;
  const tr = btn.closest("tr");
  const functionId = tr.dataset.function;
  const newAmount = Number(tr.querySelector(".santha-amount-input").value) || 0;

  const { error: fnError } = await client.from("functions").update({ santha_amount: newAmount }).eq("id", functionId);
  if (fnError) {
    setStatus("function-status", "Error updating amount: " + fnError.message, true);
    return;
  }

  const { data: checkedRows, error: fetchError } = await client
    .from("ledger_entries")
    .select("id, asal, vatti, thogai")
    .eq("function_id", functionId)
    .eq("santha_checked", true);
  if (fetchError) {
    setStatus("function-status", "Amount saved, but couldn't update existing entries: " + fetchError.message, true);
    return;
  }
  for (const row of checkedRows) {
    const total = Number(row.asal) + newAmount + Number(row.vatti) + Number(row.thogai);
    await client.from("ledger_entries").update({ santha: newAmount, total }).eq("id", row.id);
  }

  setStatus("function-status", `சந்தா amount updated to ${newAmount} (${checkedRows.length} existing entries recalculated).`, false);
  await refreshAll();
});

// ---------- Change passwords ----------
// There are TWO logins: the Dashboard's and the Accounts page's. Each gets its own clearly named card, built from
// this one list so the two can never drift apart. Changing either one needs that login's CURRENT password.
const PASSWORD_CARDS = [
  { key: "dash", name: "Dashboard", email: DASHBOARD_EMAIL, title: "Change Dashboard password",
    about: "Signs you in to this Dashboard (Overview, Explore, Admin). The Accounts page has its own password." },
  { key: "acc", name: "Accounts", email: ACCOUNTS_EMAIL, title: "Change Accounts page password",
    about: "Signs you in to the Accounts page (members, வரவு, செலவு). You need the current Accounts password to change it." },
];

// Verifies the current password and sets the new one for `email`, using a throwaway client that keeps nothing in
// storage. That way the Dashboard's own session is untouched, and "local" sign-out only forgets the throwaway
// session instead of signing the user out everywhere (the default would kick people off the Accounts page).
async function changePasswordFor(email, oldPassword, newPassword) {
  const temp = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "boliammanur-password-change" },
  });
  const { error: verifyError } = await temp.auth.signInWithPassword({ email, password: oldPassword });
  if (verifyError) return { wrongCurrent: true };
  const { error } = await temp.auth.updateUser({ password: newPassword });
  await temp.auth.signOut({ scope: "local" });
  return { error };
}

$("password-cards").innerHTML = PASSWORD_CARDS.map((c) => `
  <div class="card">
    <h2>${c.title}</h2>
    <p class="note pw-about">${c.about}</p>
    <form id="pw-${c.key}-form">
      <label>Current ${c.name} password
        <input type="password" id="pw-${c.key}-old" required autocomplete="current-password" />
      </label>
      <label>New ${c.name} password
        <input type="password" id="pw-${c.key}-new" required minlength="6" autocomplete="new-password" />
      </label>
      <label>Confirm new ${c.name} password
        <input type="password" id="pw-${c.key}-confirm" required minlength="6" autocomplete="new-password" />
      </label>
      <button type="submit">${c.title}</button>
      <p class="status" id="pw-${c.key}-status" role="status" aria-live="polite"></p>
    </form>
  </div>`).join("");

PASSWORD_CARDS.forEach((c) => {
  const status = (message, isError) => setStatus(`pw-${c.key}-status`, message, isError);
  $(`pw-${c.key}-form`).addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.submitter || $(`pw-${c.key}-form`).querySelector('button[type="submit"]');
    const newPassword = $(`pw-${c.key}-new`).value;
    if (newPassword !== $(`pw-${c.key}-confirm`).value) {
      status("The two new passwords do not match.", true);
      return;
    }
    submitBtn.disabled = true;
    status("Updating...", false);
    try {
      const result = await changePasswordFor(c.email, $(`pw-${c.key}-old`).value, newPassword);
      if (result.wrongCurrent) status(`Current ${c.name} password is incorrect.`, true);
      else if (result.error) status("Error: " + result.error.message, true);
      else {
        status(`${c.name} password updated. Use the new one the next time you sign in to the ${c.name === "Accounts" ? "Accounts page" : "Dashboard"}.`, false);
        $(`pw-${c.key}-form`).reset();
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
});

$("signout-btn").addEventListener("click", async () => {
  await client.auth.signOut();
  location.reload();
});
