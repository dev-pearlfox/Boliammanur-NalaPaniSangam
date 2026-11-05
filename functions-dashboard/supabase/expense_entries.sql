-- செலவு (expenses) per function: one row per (function, category), shown on the accounts page after clicking
-- the செலவு button. `category` is the key from EXPENSE_HEADERS in function-expenses/expenses.js
-- (kitchen, pooja, decoration, music, vessels, transport, labour, printing, other).
-- Run this in the Supabase SQL editor. Safe to run again: nothing is dropped except these three policies, which are recreated.

create table if not exists expense_entries (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references functions(id) on delete cascade,
  category text not null,
  amount numeric not null default 0 check (amount >= 0),
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (function_id, category)
);

alter table expense_entries enable row level security;

-- Only the signed-in admin user (the accounts page logs in through Supabase Auth) may read or write expenses.
-- The anon key alone sees nothing. If your other tables use a different rule, copy that rule here instead.
drop policy if exists "authenticated select expense_entries" on expense_entries;
create policy "authenticated select expense_entries" on expense_entries for select to authenticated using (true);
drop policy if exists "authenticated insert expense_entries" on expense_entries;
create policy "authenticated insert expense_entries" on expense_entries for insert to authenticated with check (true);
drop policy if exists "authenticated update expense_entries" on expense_entries;
create policy "authenticated update expense_entries" on expense_entries for update to authenticated using (true) with check (true);
