-- Fix: read the notify URL + shared secret from Supabase Vault, not GUCs.
--
-- The original push-notifications migration configured `notify_new_order()`
-- via `current_setting('app.notify_url')` / `current_setting('app.notify_secret')`,
-- which have to be set with `ALTER DATABASE postgres SET ...`. On Supabase the
-- managed `postgres` role is NOT a superuser, so that statement is
-- permission-denied (42501) and the settings can never persist — the trigger
-- silently no-ops on every order. Supabase Vault is the supported way to hold
-- a secret a trigger can read; `vault.create_secret()` needs no superuser.
--
-- Ops setup (run once, e.g. in the SQL editor):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-new-order', 'notify_url');
--   select vault.create_secret('<NOTIFY_SHARED_SECRET>', 'notify_secret');
--
-- Missing secrets stay a quiet no-op, same contract as before.
create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url          text;
  v_secret       text;
  v_customer_name text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';

  if v_url is null or v_secret is null then
    return new;
  end if;

  select name into v_customer_name from customers where id = new.customer_id;

  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', v_secret
      ),
      body := jsonb_build_object(
        'order_id', new.id,
        'order_number', new.number,
        'customer_name', v_customer_name
      )
    );
  exception when others then
    -- Never let a notification failure block or roll back the order write.
    null;
  end;

  return new;
end;
$$;
