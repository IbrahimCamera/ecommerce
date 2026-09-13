-- Auto-push is now unconditional for every order (see create-order): every
-- merchant gets the same behavior, so the per-merchant opt-in setting from
-- migration 0013 is removed rather than left dead in the schema.
alter table public.shipping_settings
  drop column auto_push_enabled;
