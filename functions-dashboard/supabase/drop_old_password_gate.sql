-- Removes the OLD shared-password gate from the live database. The pages no longer use it (both sites sign in
-- through Supabase Auth), but check_password() and set_password() are still callable by anyone holding the public
-- key, which lets a stranger guess the old password without limit.
-- Run once in the Supabase SQL editor. Safe to run again. The `settings` table only ever held that one old password;
-- no members, collections or expenses are touched.

drop function if exists check_password(text);
drop function if exists set_password(text, text);
drop table if exists settings;
