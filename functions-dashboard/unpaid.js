// Explore: "Unpaid சந்தா". For each selected function, how many have paid, what is still pending, and who has not
// paid (with a tap-to-call number). The numbers come from santhaStatus() in data.js.

const byMemberNo = (a, b) => (a.member_no ?? 9999) - (b.member_no ?? 9999) || (a.name || "").localeCompare(b.name || "");

// The number as stored, as a tel: link. Digits only in the link, so spaces or dashes in the data cannot break it.
function mobileLink(mobile) {
  const shown = String(mobile ?? "").trim();
  const digits = shown.replace(/\D/g, "");
  return digits ? `<a href="tel:${digits}">${escapeHtml(shown)}</a>` : "";
}

function renderUnpaid(funcs) {
  const sorted = funcs.slice().sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  if (!sorted.length) {
    $("ex-unpaid").innerHTML = `<p class="empty">No functions selected.</p>`;
    return;
  }
  const statuses = sorted.map((f) => ({ f, st: santhaStatus(f) }));
  const open = sorted.length === 1 ? "open" : "";   // a single function shows its list straight away
  const totalPending = statuses.reduce((sum, { st }) => sum + st.pending, 0);

  $("ex-unpaid").innerHTML =
    (sorted.length > 1 ? `<p class="note unpaid-total">Total pending across this selection: <strong>${money(totalPending)}</strong></p>` : "") +
    statuses
      .map(({ f, st }) => {
        const pct = st.eligible ? (st.paid / st.eligible) * 100 : 0;
        const list = st.unpaid.length
          ? `<p class="swipe-hint hidden">Swipe sideways to see all columns &rarr;</p>
             <div class="table-wrap"><table class="unpaid-table">
               <thead><tr><th>S.No.</th><th>Name</th><th>English name</th><th>Mobile</th></tr></thead>
               <tbody>${st.unpaid
                 .slice()
                 .sort(byMemberNo)
                 .map((p) => `<tr><td>${p.member_no ?? ""}</td><td>${escapeHtml(p.name || "?")}</td><td>${escapeHtml(p.name_en ?? "")}</td><td>${mobileLink(p.mobile)}</td></tr>`)
                 .join("")}</tbody>
             </table></div>`
          : `<p class="empty">Everyone has paid.</p>`;
        return `<details class="unpaid-fn" ${open}>
          <summary>
            <span class="unpaid-title">${escapeHtml(functionLabel(f))}</span>
            <span class="unpaid-count">${st.paid} of ${st.eligible} paid &middot; ${st.unpaid.length} unpaid &middot; ${money(st.pending)} pending</span>
          </summary>
          <div class="bar-track unpaid-bar"><div class="bar-fill credit" style="width:${pct.toFixed(1)}%"></div></div>
          ${list}
        </details>`;
      })
      .join("");
}
