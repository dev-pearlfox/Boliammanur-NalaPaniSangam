# Boliammanur Nala Pani Sangam: Accounts + Dashboard

Two static websites in one repo, sharing one Supabase database. No build step: open the HTML files in a browser.
Live at https://boliammanur.pearlfox.io (GitHub Pages, deployed from `main`).

| Folder | What it is |
|---|---|
| `function-expenses/` | **Accounts**: the data-entry site. Members ledger per function (Asal / Santha / Vatti / Thogai / Paid), the செலவு (expense) table, and the extra வரவு tables நன்கொடை, ஏலம், முந்தைய இருப்பு. Autosaves. |
| `functions-dashboard/` | **Dashboard**: Overview, Explore and Admin tabs, charts, compare years, unpaid list, print / PDF, add functions, change passwords. |
| repo root | Files both sites load: `expense-categories.js`, `income-categories.js`, `function-rules.js`. |

## Sign-in

Both sites sign in through **Supabase Auth**, each with its OWN account and its own password. People only type the
password; the email is fixed in each `supabase-config.js`.

| Site | Account (email) |
|---|---|
| Accounts | `admin@boliammanur.local` |
| Dashboard | `dashboard@boliammanur.local` |

- Create both in Supabase: **Authentication, Users, Add user, Create new user** (tick **Auto Confirm User**).
- The two sites keep separate sessions, so signing in to one does not sign in to the other.
- Change either password from the Dashboard: **Admin, Change Dashboard password / Change Accounts page password**.
  Each needs that account's current password. Nobody has a "forgot password" email (`.local` cannot receive mail);
  reset through Supabase, Authentication, Users.
- Turn **off** "Allow new users to sign up" (Authentication, Sign In / Providers), or anyone can register on the project.
- The database only lets a signed-in user read or write. Both accounts are equal as far as the database is concerned;
  the separation is in the pages.

## Database (Supabase)

SQL files are in `functions-dashboard/supabase/`. Run in the Supabase **SQL editor**. The current ones are safe to re-run:

- `expense_entries.sql` : the செலவு table.
- `income_entries.sql` : நன்கொடை / ஏலம் / முந்தைய இருப்பு rows (date, Tamil and English name, phone, amount, note).
- `drop_old_password_gate.sql` : removes the old shared-password functions. Run it once.
- `rls_policies.sql` : the live access rules (exported from Supabase), with a plain-language summary at the top.
- everything else (`add_*`, `migration_*`, `seed_*`, `rename_*`, `schema.sql`) is history that has already been applied.
  Do not re-run `schema.sql`; it is the original first-day design.

## Rules of the code

- **Cache version.** Every CSS/JS file is loaded as `file.js?v=...`. Bump the version on every change, on every page
  that loads it. A stale cached script has broken the page before.
- **Do not rename keys.** `expense-categories.js` keys (stored in `expense_entries.category`) and
  `income-categories.js` keys (stored in `income_entries.kind`) must never change once data exists; labels can.
- **Who pays சந்தா** lives only in `function-rules.js`, used by both sites.
- **முந்தைய இருப்பு** (last year's leftover) counts in வரவு/மீதி only when ONE year is selected on the Dashboard;
  across several years it would count the same money twice.
- The Accounts page has protected layout rules: read `function-expenses/HEART_LOGIC.md` before touching its header,
  sticky stack or table styles.

## Run locally

Open `function-expenses/index.html` or `functions-dashboard/index.html` in a browser. They talk to the real database,
so sign in with the real passwords.
