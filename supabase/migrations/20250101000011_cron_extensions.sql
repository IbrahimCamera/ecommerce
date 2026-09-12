-- Enables scheduling the daily geo/fees sync. On hosted Supabase these are
-- usually pre-approved; if this migration errors with a permissions issue,
-- enable "pg_cron" and "pg_net" once from Dashboard > Database > Extensions
-- and rerun.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The actual `select cron.schedule(...)` call is NOT committed here: it must
-- embed the project URL and the service role key, which are secrets that
-- must never live in source control. Run it once manually from the SQL
-- editor after deploying — see README.md "Sync géo quotidienne".
