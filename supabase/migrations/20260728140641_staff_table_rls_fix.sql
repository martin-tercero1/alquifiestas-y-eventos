-- `staff` was created without enabling row-level security, so the policies
-- written for it were inert and Supabase's default grants left it readable by
-- anon: a stranger could list the names of the family who run the business.
--
-- Enabling RLS is the fix; revoking anon is the belt to its braces. Every
-- other table in this schema had RLS switched on at creation in brief 02 —
-- this one was new, and new tables do not inherit that.

alter table staff enable row level security;

revoke all on staff from anon;

-- New tables in this schema are staff-only by default from here on. Anything
-- the public may read is exposed deliberately, through a view or a function.
alter default privileges in schema public revoke all on tables from anon;
