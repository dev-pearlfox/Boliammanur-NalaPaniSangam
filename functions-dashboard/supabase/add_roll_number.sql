-- Adds a permanent Roll Number to every person, shown only on the
-- போளியம்மனூர் உறுப்பினர்கள் members directory (never on a function's Ledger
-- Sheet). Starts at 1001, assigned in the same order the list already
-- displays (member_no, then name).
-- Run this once in the Supabase SQL editor.

alter table people add column if not exists roll_number integer unique;

with numbered as (
  select id, row_number() over (order by member_no asc nulls last, name asc) as rn
  from people
  where roll_number is null
)
update people p
set roll_number = 1000 + numbered.rn
from numbered
where p.id = numbered.id;
