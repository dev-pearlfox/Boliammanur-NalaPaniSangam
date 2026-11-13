-- DESTRUCTIVE, ALREADY RUN once (before handing the sites to the customer). Do NOT run again unless you mean it.
-- Clears all MONEY for 2026 and 2027. KEEPS people, functions and every 2025 row.
-- Deletes only rows whose function is in 2026 or 2027: ledger_entries, expense_entries, income_entries.
-- Back up first (node scripts/backup-to-csv.mjs). Compare with check_money_by_function.sql before and after.
-- One statement, so it is all-or-nothing. Returns how many rows were deleted.
with doomed as (
  select id from functions where year in (2026, 2027)
),
del_ledger as (
  delete from ledger_entries where function_id in (select id from doomed) returning 1
),
del_expense as (
  delete from expense_entries where function_id in (select id from doomed) returning 1
),
del_income as (
  delete from income_entries where function_id in (select id from doomed) returning 1
)
select
  (select count(*) from del_ledger)  as ledger_deleted,
  (select count(*) from del_expense) as expense_deleted,
  (select count(*) from del_income)  as income_deleted;
