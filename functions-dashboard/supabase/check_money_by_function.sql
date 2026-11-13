-- READ-ONLY: how many money rows each function has. Safe to run any time; changes nothing.
-- Run before and after reset_2026_2027.sql to compare.
select f.year, f.name,
  (select count(*) from ledger_entries  x where x.function_id = f.id) as ledger_rows,
  (select count(*) from expense_entries x where x.function_id = f.id) as expense_rows,
  (select count(*) from income_entries  x where x.function_id = f.id) as income_rows
from functions f
order by f.year, f.name;
