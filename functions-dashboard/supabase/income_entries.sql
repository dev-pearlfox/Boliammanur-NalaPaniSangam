-- Extra வரவு (income) per function: donations (நன்கொடை), auctions (ஏலம்) and last year's balance (முந்தைய இருப்பு).
-- One row per line the user types, so a function can have many rows of each kind. `name` is the Tamil name,
-- `name_en` the English name, `received_on` the date. `kind` is the key from
-- INCOME_KINDS in income-categories.js (donation, auction, carry-forward).
-- Run this in the Supabase SQL editor. Safe to run again: nothing is dropped except these four policies, which are recreated.

create table if not exists income_entries (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references functions(id) on delete cascade,
  kind text not null,
  received_on date,
  name text not null default '',
  name_en text not null default '',
  phone text not null default '',
  amount numeric not null default 0 check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- For a database that already ran the first version of this file (it had no date, English name or phone):
alter table income_entries add column if not exists received_on date;
alter table income_entries add column if not exists name_en text not null default '';
alter table income_entries add column if not exists phone text not null default '';

create index if not exists income_entries_function_kind_idx on income_entries (function_id, kind);

alter table income_entries enable row level security;

-- Only signed-in users may read or write. The anon key alone sees nothing.
drop policy if exists "authenticated select income_entries" on income_entries;
create policy "authenticated select income_entries" on income_entries for select to authenticated using (true);
drop policy if exists "authenticated insert income_entries" on income_entries;
create policy "authenticated insert income_entries" on income_entries for insert to authenticated with check (true);
drop policy if exists "authenticated update income_entries" on income_entries;
create policy "authenticated update income_entries" on income_entries for update to authenticated using (true) with check (true);
drop policy if exists "authenticated delete income_entries" on income_entries;
create policy "authenticated delete income_entries" on income_entries for delete to authenticated using (true);
