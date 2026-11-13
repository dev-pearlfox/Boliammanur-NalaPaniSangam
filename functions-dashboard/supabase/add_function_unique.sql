-- One function name per year: the database refuses a second "same name, same year" row, behind the Dashboard's own check.
-- Run in the Supabase SQL editor. Step 1 must return NO rows; if it does, those are duplicates to merge or delete first.

-- Step 1 (read-only): any existing duplicates?
select name, year, count(*) from functions group by name, year having count(*) > 1;

-- Step 2: the rule. Errors harmlessly ("already exists") if run twice.
alter table functions add constraint functions_name_year_unique unique (name, year);
