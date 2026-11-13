// "Print / save as PDF" on the Members page: prints the members table as it is on screen (the type pill and any column
// filters apply), through printTable() in print-table.js. Loaded after members.js, so $ and the page exist.

$("print-btn").addEventListener("click", () => {
  const body = printRows("#members-body tr");
  const active = document.querySelector("#type-filter-pills .pill.active");
  const pill = active?.dataset.label || "";
  // The "all" pill's label already says members; the others (24 Manai, Others) need the word in front.
  const title = active?.dataset.filter === "all" ? pill : `உறுப்பினர்கள் \u00b7 ${pill}`;
  printTable({
    heading: `${title} \u00b7 ${body.length}`,
    fileTitle: `Boliammanur - members - ${pill}`,
    head: printRows("#members-thead-wrap thead tr:first-child")[0],
    body,
  });
});
