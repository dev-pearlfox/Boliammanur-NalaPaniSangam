-- LIVE ACCESS RULES (row level security), exported from the Supabase project on the day the two logins went live.
-- This is a RECORD of what is in the database, so it can be rebuilt or reviewed. Safe to re-run (each rule is dropped
-- and re-created). It does not create tables: see expense_entries.sql, income_entries.sql and the older files.
--
-- Plain-language summary: every table has security ON, and the ONLY people let in are signed-in users
-- (the role `authenticated`: the Accounts login and the Dashboard login). Anonymous visitors, with or without the
-- public key, get nothing. Both logins have the same power over the data: the split between them is in the pages,
-- not here. To make the Dashboard login the only one that can add functions or change prices, the `functions` and
-- `people` rules would have to check WHICH login it is (auth.jwt() ->> 'email'); not done today.
--
-- To re-export the live rules, run in the SQL editor:
--   select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2;

-- ---- people, functions, ledger_entries: signed-in users may do anything ----
alter table people enable row level security;
drop policy if exists "authenticated all people" on people;
create policy "authenticated all people" on people for all to authenticated using (true) with check (true);

alter table functions enable row level security;
drop policy if exists "authenticated all functions" on functions;
create policy "authenticated all functions" on functions for all to authenticated using (true) with check (true);

alter table ledger_entries enable row level security;
drop policy if exists "authenticated all ledger_entries" on ledger_entries;
create policy "authenticated all ledger_entries" on ledger_entries for all to authenticated using (true) with check (true);

-- ---- expense_entries (செலவு): read, add, change. No delete: a cleared amount is saved as 0, never removed ----
alter table expense_entries enable row level security;
drop policy if exists "authenticated select expense_entries" on expense_entries;
create policy "authenticated select expense_entries" on expense_entries for select to authenticated using (true);
drop policy if exists "authenticated insert expense_entries" on expense_entries;
create policy "authenticated insert expense_entries" on expense_entries for insert to authenticated with check (true);
drop policy if exists "authenticated update expense_entries" on expense_entries;
create policy "authenticated update expense_entries" on expense_entries for update to authenticated using (true) with check (true);

-- ---- income_entries (நன்கொடை / ஏலம் / முந்தைய இருப்பு): read, add, change, delete (the × button) ----
alter table income_entries enable row level security;
drop policy if exists "authenticated select income_entries" on income_entries;
create policy "authenticated select income_entries" on income_entries for select to authenticated using (true);
drop policy if exists "authenticated insert income_entries" on income_entries;
create policy "authenticated insert income_entries" on income_entries for insert to authenticated with check (true);
drop policy if exists "authenticated update income_entries" on income_entries;
create policy "authenticated update income_entries" on income_entries for update to authenticated using (true) with check (true);
drop policy if exists "authenticated delete income_entries" on income_entries;
create policy "authenticated delete income_entries" on income_entries for delete to authenticated using (true);

-- ---- materials: security ON with NO rules = completely locked, for everyone ----
-- The Dashboard reads this table for the "Material Cost" tile and the Materials chart; with no rule it sees zero rows
-- (no error), so those show 0 even if rows exist. Nothing in the pages writes to it. If the tile should work, run:
--   create policy "authenticated select materials" on materials for select to authenticated using (true);
alter table materials enable row level security;
