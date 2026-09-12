-- "Avoid" marks a person as no longer active (e.g. deceased). Default
-- unchecked. When checked: hidden from the current function and any future
-- function's Ledger Sheet, but stays visible on any function where they
-- already have an existing entry (preserves historical records).
-- Run this once in the Supabase SQL editor.

alter table people add column if not exists avoid boolean not null default false;
