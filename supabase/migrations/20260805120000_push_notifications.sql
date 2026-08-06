-- PWA new-order push notifications.
--
-- Shape A: an AFTER INSERT trigger on `orders` fires a best-effort, async
-- pg_net POST to a new Edge Function (`notify-new-order`), which holds the
-- VAPID keypair and delivers Web Push to every staff device it has on file.
-- The public /solicitar flow and submit_reservation_request are untouched —
-- the trigger observes `orders` independently.
--
-- Both RPCs below are gated only on `auth.uid() is null`, not
-- `is_tech_admin()`: any authenticated user is staff (see the staff access
-- layer migration), and both parents must receive notifications.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Subscription storage.
-- ---------------------------------------------------------------------------

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

comment on table push_subscriptions is
  'One row per subscribed browser/device. RLS on, no policies — reached only through save_push_subscription / delete_push_subscription, both SECURITY DEFINER.';

alter table push_subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.save_push_subscription(p_subscription jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint text;
  v_p256dh   text;
  v_auth     text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  v_endpoint := p_subscription->>'endpoint';
  v_p256dh   := p_subscription->'keys'->>'p256dh';
  v_auth     := p_subscription->'keys'->>'auth';

  if v_endpoint is null or v_p256dh is null or v_auth is null then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), v_endpoint, v_p256dh, v_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh  = excluded.p256dh,
        auth    = excluded.auth;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  delete from push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.save_push_subscription(jsonb) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger + sender: a brand-new website reservation request notifies staff.
-- ---------------------------------------------------------------------------

-- Best-effort: the order write has already committed by the time this runs,
-- so a notification failure must never surface as an error on it. The
-- edge-function URL and shared secret are ops-configured Postgres settings,
-- not hard-coded here; either being unset is a quiet no-op, not an error.
create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url          text := current_setting('app.notify_url', true);
  v_secret       text := current_setting('app.notify_secret', true);
  v_customer_name text;
begin
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

drop trigger if exists orders_notify_new_order on orders;
create trigger orders_notify_new_order
  after insert on orders
  for each row
  when (new.status = 'pending_request' and new.source = 'website')
  execute function public.notify_new_order();
