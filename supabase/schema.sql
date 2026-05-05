create extension if not exists pgcrypto;

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  share_token text not null unique,
  created_at timestamptz not null default now(),
  archived_at timestamptz null
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  alias text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists settlement_cycles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  closed_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_by_participant_id uuid not null references participants(id),
  split_participant_ids uuid[] not null,
  date date not null,
  created_at timestamptz not null default now(),
  settlement_cycle_id uuid null references settlement_cycles(id)
);

create unique index if not exists groups_share_token_idx on groups (share_token);
create index if not exists participants_group_id_idx on participants (group_id);
create index if not exists expenses_group_id_idx on expenses (group_id);
create index if not exists expenses_settlement_cycle_id_idx on expenses (settlement_cycle_id);
create index if not exists settlement_cycles_group_id_idx on settlement_cycles (group_id);

alter table groups enable row level security;
alter table participants enable row level security;
alter table expenses enable row level security;
alter table settlement_cycles enable row level security;

-- No open table policies are created. Anonymous clients must use the RPC
-- functions below, scoped by share_token.

create or replace function get_group_by_share_token(p_share_token text)
returns groups
language sql
security definer
set search_path = public
as $$
  select *
  from groups
  where share_token = p_share_token
    and archived_at is null
  limit 1;
$$;

create or replace function get_group_data(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
begin
  select *
  into v_group
  from groups
  where share_token = p_share_token
    and archived_at is null;

  if not found then
    raise exception 'No encontramos este grupo.';
  end if;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'participants', coalesce(
      (
        select jsonb_agg(to_jsonb(p) order by p.created_at asc)
        from participants p
        where p.group_id = v_group.id
      ),
      '[]'::jsonb
    ),
    'expenses', coalesce(
      (
        select jsonb_agg(to_jsonb(e) order by e.date desc, e.created_at desc)
        from expenses e
        where e.group_id = v_group.id
      ),
      '[]'::jsonb
    ),
    'settlementCycles', coalesce(
      (
        select jsonb_agg(to_jsonb(sc) order by sc.closed_at desc)
        from settlement_cycles sc
        where sc.group_id = v_group.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function create_group_with_token(p_name text, p_share_token text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
begin
  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del grupo es obligatorio.';
  end if;

  if nullif(trim(p_share_token), '') is null then
    raise exception 'El token del grupo es obligatorio.';
  end if;

  insert into groups (name, share_token)
  values (trim(p_name), trim(p_share_token))
  returning * into v_group;

  return v_group;
end;
$$;

create or replace function create_participant_by_token(
  p_share_token text,
  p_name text,
  p_alias text default null
)
returns participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_participant participants%rowtype;
begin
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then
    raise exception 'No encontramos este grupo.';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del participante es obligatorio.';
  end if;

  insert into participants (group_id, name, alias)
  values (v_group_id, trim(p_name), nullif(trim(p_alias), ''))
  returning * into v_participant;

  return v_participant;
end;
$$;

create or replace function update_participant_by_token(
  p_share_token text,
  p_participant_id uuid,
  p_name text,
  p_alias text,
  p_is_active boolean
)
returns participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_participant participants%rowtype;
begin
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then
    raise exception 'No encontramos este grupo.';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del participante es obligatorio.';
  end if;

  update participants
  set name = trim(p_name),
      alias = nullif(trim(p_alias), ''),
      is_active = p_is_active
  where id = p_participant_id
    and group_id = v_group_id
  returning * into v_participant;

  if not found then
    raise exception 'No encontramos ese participante en este grupo.';
  end if;

  return v_participant;
end;
$$;

create or replace function create_expense_by_token(
  p_share_token text,
  p_title text,
  p_amount_cents integer,
  p_paid_by_participant_id uuid,
  p_split_participant_ids uuid[],
  p_date date
)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_split_count integer;
  v_valid_split_count integer;
  v_expense expenses%rowtype;
begin
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then
    raise exception 'No encontramos este grupo.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'El nombre del gasto es obligatorio.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El monto tiene que ser mayor a 0.';
  end if;

  select count(*) into v_split_count
  from unnest(coalesce(p_split_participant_ids, array[]::uuid[])) as participant_id;

  if v_split_count = 0 then
    raise exception 'Seleccioná al menos un participante para dividir.';
  end if;

  if not exists (
    select 1 from participants
    where id = p_paid_by_participant_id
      and group_id = v_group_id
  ) then
    raise exception 'Quien pagó no pertenece a este grupo.';
  end if;

  select count(distinct participant_id) into v_valid_split_count
  from unnest(p_split_participant_ids) as participant_id
  join participants p on p.id = participant_id and p.group_id = v_group_id;

  if v_valid_split_count <> (select count(distinct participant_id) from unnest(p_split_participant_ids) as participant_id) then
    raise exception 'Hay participantes de la división que no pertenecen a este grupo.';
  end if;

  insert into expenses (
    group_id,
    title,
    amount_cents,
    paid_by_participant_id,
    split_participant_ids,
    date
  )
  values (
    v_group_id,
    trim(p_title),
    p_amount_cents,
    p_paid_by_participant_id,
    p_split_participant_ids,
    p_date
  )
  returning * into v_expense;

  return v_expense;
end;
$$;

create or replace function update_expense_by_token(
  p_share_token text,
  p_expense_id uuid,
  p_title text,
  p_amount_cents integer,
  p_paid_by_participant_id uuid,
  p_split_participant_ids uuid[],
  p_date date
)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_split_count integer;
  v_valid_split_count integer;
  v_expense expenses%rowtype;
begin
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then
    raise exception 'No encontramos este grupo.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'El nombre del gasto es obligatorio.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El monto tiene que ser mayor a 0.';
  end if;

  select count(*) into v_split_count
  from unnest(coalesce(p_split_participant_ids, array[]::uuid[])) as participant_id;

  if v_split_count = 0 then
    raise exception 'Seleccioná al menos un participante para dividir.';
  end if;

  if not exists (
    select 1 from participants
    where id = p_paid_by_participant_id
      and group_id = v_group_id
  ) then
    raise exception 'Quien pagó no pertenece a este grupo.';
  end if;

  select count(distinct participant_id) into v_valid_split_count
  from unnest(p_split_participant_ids) as participant_id
  join participants p on p.id = participant_id and p.group_id = v_group_id;

  if v_valid_split_count <> (select count(distinct participant_id) from unnest(p_split_participant_ids) as participant_id) then
    raise exception 'Hay participantes de la división que no pertenecen a este grupo.';
  end if;

  update expenses
  set title = trim(p_title),
      amount_cents = p_amount_cents,
      paid_by_participant_id = p_paid_by_participant_id,
      split_participant_ids = p_split_participant_ids,
      date = p_date
  where id = p_expense_id
    and group_id = v_group_id
  returning * into v_expense;

  if not found then
    raise exception 'No encontramos ese gasto en este grupo.';
  end if;

  return v_expense;
end;
$$;

create or replace function delete_expense_by_token(
  p_share_token text,
  p_expense_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then
    raise exception 'No encontramos este grupo.';
  end if;

  delete from expenses
  where id = p_expense_id
    and group_id = v_group_id;

  if not found then
    raise exception 'No encontramos ese gasto en este grupo.';
  end if;
end;
$$;

create or replace function close_cycle_by_token(p_share_token text)
returns settlement_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_cycle settlement_cycles%rowtype;
begin
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then
    raise exception 'No encontramos este grupo.';
  end if;

  if not exists (
    select 1 from expenses
    where group_id = v_group_id
      and settlement_cycle_id is null
  ) then
    raise exception 'No hay gastos abiertos para cerrar.';
  end if;

  insert into settlement_cycles (group_id, title)
  values (
    v_group_id,
    'Cierre del ' || to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'DD/MM/YYYY')
  )
  returning * into v_cycle;

  update expenses
  set settlement_cycle_id = v_cycle.id
  where group_id = v_group_id
    and settlement_cycle_id is null;

  return v_cycle;
end;
$$;

create or replace function update_group_by_token(
  p_share_token text,
  p_name text
)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
begin
  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del grupo es obligatorio.';
  end if;

  update groups
  set name = trim(p_name)
  where share_token = p_share_token
    and archived_at is null
  returning * into v_group;

  if not found then
    raise exception 'No encontramos este grupo.';
  end if;

  return v_group;
end;
$$;

-- Required when "Automatically expose new tables and functions" is OFF.
-- Expose these RPC functions to anon in API Settings / via these grants.
grant execute on function get_group_by_share_token(text) to anon;
grant execute on function get_group_data(text) to anon;
grant execute on function create_group_with_token(text, text) to anon;
grant execute on function create_participant_by_token(text, text, text) to anon;
grant execute on function update_participant_by_token(text, uuid, text, text, boolean) to anon;
grant execute on function create_expense_by_token(text, text, integer, uuid, uuid[], date) to anon;
grant execute on function update_expense_by_token(text, uuid, text, integer, uuid, uuid[], date) to anon;
grant execute on function delete_expense_by_token(text, uuid) to anon;
grant execute on function close_cycle_by_token(text) to anon;
grant execute on function update_group_by_token(text, text) to anon;

create or replace function public.notify_group_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_share_token text;
begin
  if TG_TABLE_NAME = 'groups' then
    v_group_id := coalesce(NEW.id, OLD.id);
  else
    v_group_id := coalesce(NEW.group_id, OLD.group_id);
  end if;

  select share_token
  into v_share_token
  from public.groups
  where id = v_group_id;

  if v_share_token is not null then
    perform realtime.send(
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'at', now()
      ),
      'group_changed',
      'group:' || v_share_token,
      false
    );
  end if;

  return null;
end;
$$;

drop trigger if exists on_groups_changed on public.groups;
create trigger on_groups_changed
after insert or update or delete on public.groups
for each row execute function public.notify_group_changed();

drop trigger if exists on_participants_changed on public.participants;
create trigger on_participants_changed
after insert or update or delete on public.participants
for each row execute function public.notify_group_changed();

drop trigger if exists on_expenses_changed on public.expenses;
create trigger on_expenses_changed
after insert or update or delete on public.expenses
for each row execute function public.notify_group_changed();

drop trigger if exists on_settlement_cycles_changed on public.settlement_cycles;
create trigger on_settlement_cycles_changed
after insert or update or delete on public.settlement_cycles
for each row execute function public.notify_group_changed();

-- =========================================================
-- Realtime Broadcast: aviso de cambios por grupo
-- =========================================================
-- Esta función NO manda datos sensibles por WebSocket.
-- Solo avisa que algo cambió en el grupo.
-- El frontend escucha group:<shareToken> y después refresca por RPC.

create or replace function public.notify_group_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_share_token text;
begin
  if TG_TABLE_NAME = 'groups' then
    if TG_OP = 'DELETE' then
      v_share_token := OLD.share_token;
    else
      v_share_token := NEW.share_token;
    end if;
  else
    if TG_OP = 'DELETE' then
      v_group_id := OLD.group_id;
    else
      v_group_id := NEW.group_id;
    end if;

    select g.share_token
    into v_share_token
    from public.groups g
    where g.id = v_group_id;
  end if;

  if v_share_token is not null then
    perform realtime.send(
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'at', now()
      ),
      'group_changed',
      'group:' || v_share_token,
      false
    );
  end if;

  return null;
end;
$$;

drop trigger if exists on_groups_changed on public.groups;
create trigger on_groups_changed
after insert or update or delete on public.groups
for each row
execute function public.notify_group_changed();

drop trigger if exists on_participants_changed on public.participants;
create trigger on_participants_changed
after insert or update or delete on public.participants
for each row
execute function public.notify_group_changed();

drop trigger if exists on_expenses_changed on public.expenses;
create trigger on_expenses_changed
after insert or update or delete on public.expenses
for each row
execute function public.notify_group_changed();

drop trigger if exists on_settlement_cycles_changed on public.settlement_cycles;
create trigger on_settlement_cycles_changed
after insert or update or delete on public.settlement_cycles
for each row
execute function public.notify_group_changed();

NOTIFY pgrst, 'reload schema';

-- Iteracion: Mercado Pago asistido, multimoneda y estadisticas por cierre.
-- Ejecutar este bloque completo en SQL Editor. Es re-ejecutable.

alter table public.expenses
  add column if not exists currency text not null default 'ARS';

alter table public.settlement_payments
  add column if not exists currency text not null default 'ARS';

update public.expenses set currency = 'ARS' where currency is null;
update public.settlement_payments set currency = 'ARS' where currency is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_currency_check') then
    alter table public.expenses
      add constraint expenses_currency_check check (currency in ('ARS', 'USD', 'EUR', 'BRL', 'UYU', 'CLP'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'settlement_payments_currency_check') then
    alter table public.settlement_payments
      add constraint settlement_payments_currency_check check (currency in ('ARS', 'USD', 'EUR', 'BRL', 'UYU', 'CLP'));
  end if;
end;
$$;

create or replace function public.normalize_currency(p_currency text)
returns text
language sql
stable
as $$
  select case when p_currency in ('ARS', 'USD', 'EUR', 'BRL', 'UYU', 'CLP') then p_currency else 'ARS' end;
$$;

create or replace function public.validate_currency(p_currency text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_currency not in ('ARS', 'USD', 'EUR', 'BRL', 'UYU', 'CLP') then
    raise exception 'Moneda invalida.';
  end if;
end;
$$;

create or replace function public.expense_with_lines_json(p_expense expenses)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(p_expense)
    || jsonb_build_object(
      'payerMode', p_expense.payer_mode,
      'splitMode', p_expense.split_mode,
      'currency', public.normalize_currency(p_expense.currency),
      'payers', coalesce((select jsonb_agg(jsonb_build_object('participantId', ep.participant_id, 'amountCents', ep.amount_cents) order by ep.id) from expense_payers ep where ep.expense_id = p_expense.id), '[]'::jsonb),
      'splits', coalesce((select jsonb_agg(jsonb_build_object('participantId', es.participant_id, 'amountCents', es.amount_cents, 'percentage', es.percentage) order by es.id) from expense_splits es where es.expense_id = p_expense.id), '[]'::jsonb)
    );
$$;

create or replace function public.create_expense_by_token(
  p_share_token text,
  p_title text,
  p_amount_cents integer,
  p_date date,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text,
  p_currency text default 'ARS'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_expense expenses%rowtype;
  v_first_payer uuid;
  v_split_ids uuid[];
  v_currency text := public.normalize_currency(p_currency);
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_currency(v_currency);
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;

  insert into expenses (group_id, title, amount_cents, currency, paid_by_participant_id, split_participant_ids, date, payer_mode, split_mode)
  values (v_group_id, trim(p_title), p_amount_cents, v_currency, v_first_payer, v_split_ids, p_date, p_payer_mode, p_split_mode)
  returning * into v_expense;

  insert into expense_payers (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;
  insert into expense_splits (expense_id, participant_id, amount_cents, percentage)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer, nullif(item->>'percentage', '')::numeric from jsonb_array_elements(p_splits) item;
  perform public.log_group_activity(v_group_id, 'expense_created', 'expense', v_expense.id, jsonb_build_object('title', v_expense.title, 'amount_cents', v_expense.amount_cents, 'currency', v_currency));
  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.update_expense_by_token(
  p_share_token text,
  p_expense_id uuid,
  p_title text,
  p_amount_cents integer,
  p_date date,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text,
  p_currency text default 'ARS'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_expense expenses%rowtype;
  v_first_payer uuid;
  v_split_ids uuid[];
  v_currency text := public.normalize_currency(p_currency);
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_currency(v_currency);
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  if not exists (select 1 from expenses where id = p_expense_id and group_id = v_group_id) then raise exception 'No encontramos ese gasto en este grupo.'; end if;
  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;

  update expenses
  set title = trim(p_title), amount_cents = p_amount_cents, currency = v_currency, paid_by_participant_id = v_first_payer, split_participant_ids = v_split_ids, date = p_date, payer_mode = p_payer_mode, split_mode = p_split_mode
  where id = p_expense_id and group_id = v_group_id
  returning * into v_expense;

  delete from expense_payers where expense_id = v_expense.id;
  delete from expense_splits where expense_id = v_expense.id;
  insert into expense_payers (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;
  insert into expense_splits (expense_id, participant_id, amount_cents, percentage)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer, nullif(item->>'percentage', '')::numeric from jsonb_array_elements(p_splits) item;
  perform public.log_group_activity(v_group_id, 'expense_updated', 'expense', v_expense.id, jsonb_build_object('title', v_expense.title, 'amount_cents', v_expense.amount_cents, 'currency', v_currency));
  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.currency_has_pending_debt(
  p_group_id uuid,
  p_currency text,
  p_from_participant_id uuid,
  p_to_participant_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with paid as (
    select ep.participant_id, sum(ep.amount_cents)::integer as amount_cents
    from expenses e
    join expense_payers ep on ep.expense_id = e.id
    where e.group_id = p_group_id and e.settlement_cycle_id is null and public.normalize_currency(e.currency) = p_currency
    group by ep.participant_id
    union all
    select sp.from_participant_id, sum(sp.amount_cents)::integer
    from settlement_payments sp
    where sp.group_id = p_group_id and sp.voided_at is null and sp.settlement_cycle_id is null and public.normalize_currency(sp.currency) = p_currency
    group by sp.from_participant_id
  ),
  owed as (
    select es.participant_id, sum(es.amount_cents)::integer as amount_cents
    from expenses e
    join expense_splits es on es.expense_id = e.id
    where e.group_id = p_group_id and e.settlement_cycle_id is null and public.normalize_currency(e.currency) = p_currency
    group by es.participant_id
    union all
    select sp.to_participant_id, sum(sp.amount_cents)::integer
    from settlement_payments sp
    where sp.group_id = p_group_id and sp.voided_at is null and sp.settlement_cycle_id is null and public.normalize_currency(sp.currency) = p_currency
    group by sp.to_participant_id
  ),
  balances as (
    select p.id,
      coalesce((select sum(amount_cents) from paid where participant_id = p.id), 0)
      - coalesce((select sum(amount_cents) from owed where participant_id = p.id), 0) as balance_cents
    from participants p
    where p.group_id = p_group_id
  )
  select exists (
    select 1
    from balances debtor
    cross join balances creditor
    where debtor.id = p_from_participant_id
      and creditor.id = p_to_participant_id
      and debtor.balance_cents < 0
      and creditor.balance_cents > 0
  );
$$;

create or replace function public.create_settlement_payment_by_token(
  p_share_token text,
  p_from_participant_id uuid,
  p_to_participant_id uuid,
  p_amount_cents integer,
  p_currency text default 'ARS'
)
returns settlement_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_user_id uuid := auth.uid();
  v_payment settlement_payments%rowtype;
  v_currency text := public.normalize_currency(p_currency);
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  if p_from_participant_id = p_to_participant_id then raise exception 'El pago necesita dos participantes distintos.'; end if;
  perform public.validate_currency(v_currency);
  if not exists (select 1 from participants where group_id = v_group_id and id in (p_from_participant_id, p_to_participant_id) having count(*) = 2) then
    raise exception 'Los participantes no pertenecen a este grupo.';
  end if;
  if not public.currency_has_pending_debt(v_group_id, v_currency, p_from_participant_id, p_to_participant_id) then
    raise exception 'No encontramos una deuda pendiente en esa moneda.';
  end if;

  insert into settlement_payments (group_id, from_participant_id, to_participant_id, amount_cents, currency, created_by_auth_user_id)
  values (v_group_id, p_from_participant_id, p_to_participant_id, p_amount_cents, v_currency, v_user_id)
  returning * into v_payment;
  perform public.log_group_activity(v_group_id, 'payment_created', 'settlement_payment', v_payment.id, jsonb_build_object('from_participant_id', p_from_participant_id, 'to_participant_id', p_to_participant_id, 'amount_cents', p_amount_cents, 'currency', v_currency));
  return v_payment;
end;
$$;

create or replace function public.assert_group_balanced_for_close(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_count integer;
begin
  with currencies as (
    select distinct public.normalize_currency(currency) as currency from expenses where group_id = p_group_id and settlement_cycle_id is null
    union
    select distinct public.normalize_currency(currency) as currency from settlement_payments where group_id = p_group_id and voided_at is null and settlement_cycle_id is null
  ),
  paid as (
    select public.normalize_currency(e.currency) as currency, ep.participant_id, sum(ep.amount_cents)::integer as amount_cents
    from expenses e join expense_payers ep on ep.expense_id = e.id
    where e.group_id = p_group_id and e.settlement_cycle_id is null
    group by public.normalize_currency(e.currency), ep.participant_id
    union all
    select public.normalize_currency(sp.currency), sp.from_participant_id, sum(sp.amount_cents)::integer
    from settlement_payments sp
    where sp.group_id = p_group_id and sp.voided_at is null and sp.settlement_cycle_id is null
    group by public.normalize_currency(sp.currency), sp.from_participant_id
  ),
  owed as (
    select public.normalize_currency(e.currency) as currency, es.participant_id, sum(es.amount_cents)::integer as amount_cents
    from expenses e join expense_splits es on es.expense_id = e.id
    where e.group_id = p_group_id and e.settlement_cycle_id is null
    group by public.normalize_currency(e.currency), es.participant_id
    union all
    select public.normalize_currency(sp.currency), sp.to_participant_id, sum(sp.amount_cents)::integer
    from settlement_payments sp
    where sp.group_id = p_group_id and sp.voided_at is null and sp.settlement_cycle_id is null
    group by public.normalize_currency(sp.currency), sp.to_participant_id
  ),
  balances as (
    select c.currency, p.id,
      coalesce((select sum(amount_cents) from paid where participant_id = p.id and currency = c.currency), 0)
      - coalesce((select sum(amount_cents) from owed where participant_id = p.id and currency = c.currency), 0) as balance_cents
    from currencies c
    cross join participants p
    where p.group_id = p_group_id
  )
  select count(*) into v_pending_count from balances where balance_cents <> 0;

  if v_pending_count > 0 then
    raise exception 'Para cerrar el periodo, primero salda todas las deudas pendientes.';
  end if;
end;
$$;

create or replace function public.close_cycle_by_token(p_share_token text)
returns settlement_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_cycle settlement_cycles%rowtype;
begin
  if not exists (select 1 from expenses where group_id = v_group_id and settlement_cycle_id is null) then
    raise exception 'No hay gastos abiertos para cerrar.';
  end if;
  perform public.assert_group_balanced_for_close(v_group_id);

  insert into settlement_cycles (group_id, title)
  values (v_group_id, 'Cierre ' || to_char(now(), 'DD/MM/YYYY HH24:MI'))
  returning * into v_cycle;

  update expenses set settlement_cycle_id = v_cycle.id where group_id = v_group_id and settlement_cycle_id is null;
  update settlement_payments set settlement_cycle_id = v_cycle.id where group_id = v_group_id and voided_at is null and settlement_cycle_id is null;
  perform public.log_group_activity(v_group_id, 'period_closed', 'settlement_cycle', v_cycle.id, '{}'::jsonb);
  return v_cycle;
end;
$$;

grant execute on function normalize_currency(text) to authenticated;
grant execute on function validate_currency(text) to authenticated;
grant execute on function currency_has_pending_debt(uuid, text, uuid, uuid) to authenticated;
grant execute on function assert_group_balanced_for_close(uuid) to authenticated;
grant execute on function expense_with_lines_json(expenses) to authenticated;
grant execute on function create_expense_by_token(text, text, integer, date, jsonb, jsonb, text, text, text) to authenticated;
grant execute on function update_expense_by_token(text, uuid, text, integer, date, jsonb, jsonb, text, text, text) to authenticated;
grant execute on function create_settlement_payment_by_token(text, uuid, uuid, integer, text) to authenticated;
grant execute on function close_cycle_by_token(text) to authenticated;

NOTIFY pgrst, 'reload schema';

-- EOF replay: alias profile + percentage split overrides.

alter table public.participants
  add column if not exists alias_source text not null default 'manual';

do $$
declare v_constraint_name text;
begin
  for v_constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'participants'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%alias_source%'
  loop
    execute format('alter table public.participants drop constraint if exists %I', v_constraint_name);
  end loop;
end $$;

alter table public.participants
  add constraint participants_alias_source_check check (alias_source in ('profile', 'custom', 'manual'));

update public.participants set alias_source = 'manual' where alias_source is null;

alter table public.expense_splits
  add column if not exists percentage numeric null;

do $$
declare v_constraint_name text;
begin
  for v_constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'expenses'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%split_mode%'
  loop
    execute format('alter table public.expenses drop constraint if exists %I', v_constraint_name);
  end loop;
end $$;

alter table public.expenses
  add constraint expenses_split_mode_check check (split_mode in ('equal', 'manual', 'percentage'));

create or replace function public.update_my_profile(p_display_name text, p_payment_alias text)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile profiles%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;

  insert into profiles (auth_user_id, display_name, payment_alias)
  values (v_user_id, nullif(trim(p_display_name), ''), nullif(trim(p_payment_alias), ''))
  on conflict (auth_user_id) do update
  set display_name = excluded.display_name,
      payment_alias = excluded.payment_alias,
      updated_at = now()
  returning * into v_profile;

  update participants p
  set alias = v_profile.payment_alias,
      alias_source = 'profile'
  from group_memberships m
  where m.participant_id = p.id
    and m.auth_user_id = v_user_id
    and m.status = 'active'
    and p.alias_source = 'profile';

  return v_profile;
end;
$$;

create or replace function public.upsert_my_profile(p_display_name text, p_payment_alias text)
returns profiles
language sql
security definer
set search_path = public
as $$
  select public.update_my_profile(p_display_name, p_payment_alias);
$$;

create or replace function public.update_my_group_profile(
  p_share_token text,
  p_participant_name text,
  p_participant_alias text,
  p_use_profile_alias boolean
)
returns participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_profile profiles%rowtype;
  v_participant participants%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;

  select * into v_membership
  from group_memberships
  where group_id = v_group_id and auth_user_id = v_user_id and status = 'active'
  limit 1;
  if not found or v_membership.participant_id is null then raise exception 'No tenes participante asociado.'; end if;

  select * into v_profile from profiles where auth_user_id = v_user_id;

  update participants
  set name = trim(p_participant_name),
      alias = case when p_use_profile_alias then v_profile.payment_alias else nullif(trim(p_participant_alias), '') end,
      alias_source = case when p_use_profile_alias then 'profile' else 'custom' end
  where id = v_membership.participant_id and group_id = v_group_id
  returning * into v_participant;

  perform public.log_group_activity(v_group_id, 'participant_updated', 'participant', v_participant.id, jsonb_build_object('name', v_participant.name));
  return v_participant;
end;
$$;

create or replace function public.create_group_with_owner(
  p_name text,
  p_share_token text,
  p_owner_participant_name text,
  p_owner_participant_alias text default null,
  p_owner_alias_source text default 'profile'
)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group groups%rowtype;
  v_participant participants%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del grupo es obligatorio.'; end if;
  if nullif(trim(p_owner_participant_name), '') is null then raise exception 'Tu nombre es obligatorio.'; end if;
  if p_owner_alias_source not in ('profile', 'custom', 'manual') then raise exception 'Origen de alias invalido.'; end if;

  insert into groups (name, share_token)
  values (trim(p_name), p_share_token)
  returning * into v_group;

  insert into participants (group_id, name, alias, alias_source)
  values (v_group.id, trim(p_owner_participant_name), nullif(trim(p_owner_participant_alias), ''), p_owner_alias_source)
  returning * into v_participant;

  insert into group_memberships (group_id, participant_id, auth_user_id, role, status)
  values (v_group.id, v_participant.id, v_user_id, 'owner', 'active');

  return v_group;
end;
$$;

create or replace function public.create_participant_by_token(p_share_token text, p_name text, p_alias text default null)
returns participants language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_participant participants%rowtype;
begin
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del participante es obligatorio.'; end if;
  insert into participants (group_id, name, alias, alias_source) values (v_group_id, trim(p_name), nullif(trim(p_alias), ''), 'manual') returning * into v_participant;
  perform public.log_group_activity(v_group_id, 'participant_created', 'participant', v_participant.id, jsonb_build_object('name', v_participant.name));
  return v_participant;
end;
$$;

create or replace function public.update_participant_by_token(p_share_token text, p_participant_id uuid, p_name text, p_alias text, p_is_active boolean)
returns participants language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_participant participants%rowtype;
begin
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del participante es obligatorio.'; end if;
  update participants set name = trim(p_name), alias = nullif(trim(p_alias), ''), alias_source = 'manual', is_active = p_is_active where id = p_participant_id and group_id = v_group_id returning * into v_participant;
  if not found then raise exception 'No encontramos ese participante en este grupo.'; end if;
  perform public.log_group_activity(v_group_id, 'participant_updated', 'participant', v_participant.id, jsonb_build_object('name', v_participant.name));
  return v_participant;
end;
$$;

create or replace function public.validate_expense_payload(
  p_group_id uuid,
  p_amount_cents integer,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payer_total integer;
  v_split_total integer;
  v_percentage_total numeric;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  if p_payer_mode not in ('single', 'multiple') then raise exception 'Modo de pago invalido.'; end if;
  if p_split_mode not in ('equal', 'manual', 'percentage') then raise exception 'Modo de division invalido.'; end if;

  select coalesce(sum((item->>'amountCents')::integer), 0) into v_payer_total from jsonb_array_elements(coalesce(p_payers, '[]'::jsonb)) item;
  select coalesce(sum((item->>'amountCents')::integer), 0) into v_split_total from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item;
  select coalesce(sum(coalesce(nullif(item->>'percentage', '')::numeric, 0)), 0) into v_percentage_total from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item;

  if v_payer_total <> p_amount_cents then raise exception 'La suma pagada tiene que coincidir con el total.'; end if;
  if v_split_total <> p_amount_cents then raise exception 'La suma de la division tiene que coincidir con el total.'; end if;
  if p_split_mode = 'percentage' and abs(v_percentage_total - 100) > 0.001 then raise exception 'La suma de porcentajes tiene que ser 100%%.'; end if;
  if p_split_mode = 'percentage' and exists (select 1 from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item where coalesce(nullif(item->>'percentage', '')::numeric, 0) < 0) then raise exception 'Los porcentajes no pueden ser negativos.'; end if;
end;
$$;

create or replace function public.expense_with_lines_json(p_expense expenses)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(p_expense)
    || jsonb_build_object(
      'payerMode', p_expense.payer_mode,
      'splitMode', p_expense.split_mode,
      'payers', coalesce((select jsonb_agg(jsonb_build_object('participantId', ep.participant_id, 'amountCents', ep.amount_cents) order by ep.id) from expense_payers ep where ep.expense_id = p_expense.id), '[]'::jsonb),
      'splits', coalesce((select jsonb_agg(jsonb_build_object('participantId', es.participant_id, 'amountCents', es.amount_cents, 'percentage', es.percentage) order by es.id) from expense_splits es where es.expense_id = p_expense.id), '[]'::jsonb)
    );
$$;

create or replace function public.create_expense_by_token(p_share_token text, p_title text, p_amount_cents integer, p_date date, p_payers jsonb, p_splits jsonb, p_payer_mode text, p_split_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_expense expenses%rowtype; v_first_payer uuid; v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;
  insert into expenses (group_id, title, amount_cents, paid_by_participant_id, split_participant_ids, date, payer_mode, split_mode) values (v_group_id, trim(p_title), p_amount_cents, v_first_payer, v_split_ids, p_date, p_payer_mode, p_split_mode) returning * into v_expense;
  insert into expense_payers (expense_id, participant_id, amount_cents) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;
  insert into expense_splits (expense_id, participant_id, amount_cents, percentage) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer, nullif(item->>'percentage', '')::numeric from jsonb_array_elements(p_splits) item;
  perform public.log_group_activity(v_group_id, 'expense_created', 'expense', v_expense.id, jsonb_build_object('title', v_expense.title, 'amount_cents', v_expense.amount_cents));
  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.update_expense_by_token(p_share_token text, p_expense_id uuid, p_title text, p_amount_cents integer, p_date date, p_payers jsonb, p_splits jsonb, p_payer_mode text, p_split_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_expense expenses%rowtype; v_first_payer uuid; v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  if not exists (select 1 from expenses where id = p_expense_id and group_id = v_group_id) then raise exception 'No encontramos ese gasto en este grupo.'; end if;
  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;
  update expenses set title = trim(p_title), amount_cents = p_amount_cents, paid_by_participant_id = v_first_payer, split_participant_ids = v_split_ids, date = p_date, payer_mode = p_payer_mode, split_mode = p_split_mode where id = p_expense_id and group_id = v_group_id returning * into v_expense;
  delete from expense_payers where expense_id = v_expense.id;
  delete from expense_splits where expense_id = v_expense.id;
  insert into expense_payers (expense_id, participant_id, amount_cents) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;
  insert into expense_splits (expense_id, participant_id, amount_cents, percentage) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer, nullif(item->>'percentage', '')::numeric from jsonb_array_elements(p_splits) item;
  perform public.log_group_activity(v_group_id, 'expense_updated', 'expense', v_expense.id, jsonb_build_object('title', v_expense.title, 'amount_cents', v_expense.amount_cents));
  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.join_group_by_token(
  p_share_token text,
  p_participant_id uuid default null,
  p_new_participant_name text default null,
  p_new_participant_alias text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_participant participants%rowtype;
  v_profile profiles%rowtype;
  v_has_active_owner boolean;
  v_new_status text := 'pending';
  v_new_role text := 'member';
  v_alias_source text := 'custom';
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;
  select * into v_profile from profiles where auth_user_id = v_user_id;

  select * into v_membership
  from group_memberships
  where group_id = v_group_id and auth_user_id = v_user_id
  order by case status when 'active' then 1 when 'pending' then 2 else 3 end
  limit 1;

  if found then
    if v_membership.status = 'revoked' then raise exception 'Tu acceso a este grupo fue revocado.'; end if;
    if v_membership.participant_id is not null then select * into v_participant from participants where id = v_membership.participant_id; end if;
    return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', case when v_participant.id is null then null else to_jsonb(v_participant) end);
  end if;

  select exists (select 1 from group_memberships where group_id = v_group_id and status = 'active' and role = 'owner') into v_has_active_owner;
  if not v_has_active_owner then v_new_status := 'active'; v_new_role := 'owner'; end if;

  if p_participant_id is not null then
    select * into v_participant from participants where id = p_participant_id and group_id = v_group_id and is_active = true;
    if not found then raise exception 'Ese participante no pertenece al grupo.'; end if;
    if exists (select 1 from group_memberships where group_id = v_group_id and participant_id = p_participant_id and status in ('active', 'pending')) then
      raise exception 'Ese participante ya esta asociado o pendiente.';
    end if;
  else
    if nullif(trim(p_new_participant_name), '') is null then raise exception 'El nombre es obligatorio.'; end if;
    if nullif(trim(p_new_participant_alias), '') is null then
      v_alias_source := 'manual';
    elsif v_profile.payment_alias is not null and trim(p_new_participant_alias) = v_profile.payment_alias then
      v_alias_source := 'profile';
    end if;
    insert into participants (group_id, name, alias, alias_source)
    values (v_group_id, trim(p_new_participant_name), nullif(trim(p_new_participant_alias), ''), v_alias_source)
    returning * into v_participant;
  end if;

  insert into group_memberships (group_id, participant_id, auth_user_id, role, status)
  values (v_group_id, v_participant.id, v_user_id, v_new_role, v_new_status)
  returning * into v_membership;

  if v_new_status = 'active' then
    perform public.log_group_activity(v_group_id, 'member_approved', 'membership', v_membership.id, '{}'::jsonb);
  end if;

  return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', to_jsonb(v_participant));
end;
$$;

grant execute on function update_my_profile(text, text) to authenticated;
grant execute on function update_my_group_profile(text, text, text, boolean) to authenticated;
grant execute on function create_group_with_owner(text, text, text, text, text) to authenticated;
grant execute on function join_group_by_token(text, uuid, text, text) to authenticated;
grant execute on function validate_expense_payload(uuid, integer, jsonb, jsonb, text, text) to authenticated;
grant execute on function expense_with_lines_json(expenses) to authenticated;

NOTIFY pgrst, 'reload schema';



-- Operational polish: void payments and close periods only when fully settled.
-- This is intentionally the final definition block.

alter table public.settlement_payments
  add column if not exists settlement_cycle_id uuid null references public.settlement_cycles(id);

create index if not exists settlement_payments_settlement_cycle_id_idx on public.settlement_payments(settlement_cycle_id);

create or replace function public.void_settlement_payment_by_token(
  p_share_token text,
  p_payment_id uuid
)
returns settlement_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_payment settlement_payments%rowtype;
begin
  update settlement_payments
  set voided_at = now()
  where id = p_payment_id
    and group_id = v_group_id
    and voided_at is null
  returning * into v_payment;

  if not found then
    raise exception 'No se pudo anular el pago.';
  end if;

  return v_payment;
end;
$$;

create or replace function public.group_has_pending_settlements(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with participant_balances as (
    select p.id,
      coalesce(paid.total_cents, 0) + coalesce(payments_from.total_cents, 0)
        - coalesce(owed.total_cents, 0) - coalesce(payments_to.total_cents, 0) as balance_cents
    from participants p
    left join (
      select ep.participant_id, sum(ep.amount_cents)::integer as total_cents
      from expense_payers ep
      join expenses e on e.id = ep.expense_id
      where e.group_id = p_group_id and e.settlement_cycle_id is null
      group by ep.participant_id
    ) paid on paid.participant_id = p.id
    left join (
      select es.participant_id, sum(es.amount_cents)::integer as total_cents
      from expense_splits es
      join expenses e on e.id = es.expense_id
      where e.group_id = p_group_id and e.settlement_cycle_id is null
      group by es.participant_id
    ) owed on owed.participant_id = p.id
    left join (
      select from_participant_id as participant_id, sum(amount_cents)::integer as total_cents
      from settlement_payments
      where group_id = p_group_id
        and voided_at is null
        and settlement_cycle_id is null
      group by from_participant_id
    ) payments_from on payments_from.participant_id = p.id
    left join (
      select to_participant_id as participant_id, sum(amount_cents)::integer as total_cents
      from settlement_payments
      where group_id = p_group_id
        and voided_at is null
        and settlement_cycle_id is null
      group by to_participant_id
    ) payments_to on payments_to.participant_id = p.id
    where p.group_id = p_group_id
  )
  select exists (select 1 from participant_balances where balance_cents <> 0);
$$;

create or replace function public.close_cycle_by_token(p_share_token text)
returns settlement_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_cycle settlement_cycles%rowtype;
begin
  if not exists (select 1 from expenses where group_id = v_group_id and settlement_cycle_id is null) then
    raise exception 'No hay gastos abiertos para cerrar.';
  end if;

  if public.group_has_pending_settlements(v_group_id) then
    raise exception 'Para cerrar el periodo, primero salda las deudas pendientes.';
  end if;

  insert into settlement_cycles (group_id, title)
  values (v_group_id, 'Cierre del ' || to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'DD/MM/YYYY'))
  returning * into v_cycle;

  update expenses
  set settlement_cycle_id = v_cycle.id
  where group_id = v_group_id
    and settlement_cycle_id is null;

  update settlement_payments
  set settlement_cycle_id = v_cycle.id
  where group_id = v_group_id
    and voided_at is null
    and settlement_cycle_id is null;

  return v_cycle;
end;
$$;

grant execute on function void_settlement_payment_by_token(text, uuid) to authenticated;
grant execute on function group_has_pending_settlements(uuid) to authenticated;
grant execute on function close_cycle_by_token(text) to authenticated;

NOTIFY pgrst, 'reload schema';

-- Iteracion: alias de pago, pagos individuales y gastos flexibles.
-- Ejecutar este bloque completo en SQL Editor. Es re-ejecutable y no modifica close_cycle_by_token.

create table if not exists public.profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text null,
  payment_alias text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create table if not exists public.settlement_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_participant_id uuid not null references public.participants(id),
  to_participant_id uuid not null references public.participants(id),
  amount_cents integer not null check (amount_cents > 0),
  created_by_auth_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz null
);

create index if not exists settlement_payments_group_id_idx on public.settlement_payments(group_id);
create index if not exists settlement_payments_voided_at_idx on public.settlement_payments(voided_at);
alter table public.settlement_payments enable row level security;

alter table public.expenses
  add column if not exists payer_mode text not null default 'single' check (payer_mode in ('single', 'multiple')),
  add column if not exists split_mode text not null default 'equal' check (split_mode in ('equal', 'manual'));

create table if not exists public.expense_payers (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  participant_id uuid not null references public.participants(id),
  amount_cents integer not null check (amount_cents > 0)
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  participant_id uuid not null references public.participants(id),
  amount_cents integer not null check (amount_cents >= 0)
);

create index if not exists expense_payers_expense_id_idx on public.expense_payers(expense_id);
create index if not exists expense_payers_participant_id_idx on public.expense_payers(participant_id);
create index if not exists expense_splits_expense_id_idx on public.expense_splits(expense_id);
create index if not exists expense_splits_participant_id_idx on public.expense_splits(participant_id);
alter table public.expense_payers enable row level security;
alter table public.expense_splits enable row level security;

insert into public.expense_payers (expense_id, participant_id, amount_cents)
select e.id, e.paid_by_participant_id, e.amount_cents
from public.expenses e
where e.paid_by_participant_id is not null
  and not exists (select 1 from public.expense_payers ep where ep.expense_id = e.id);

insert into public.expense_splits (expense_id, participant_id, amount_cents)
select e.id,
       split_participant_id,
       floor(e.amount_cents::numeric / cardinality(e.split_participant_ids))::integer
         + case when row_number() over (partition by e.id order by split_participant_id) <= (e.amount_cents % cardinality(e.split_participant_ids)) then 1 else 0 end
from public.expenses e
cross join lateral unnest(e.split_participant_ids) as split_participant_id
where cardinality(e.split_participant_ids) > 0
  and not exists (select 1 from public.expense_splits es where es.expense_id = e.id);

create or replace function public.get_my_profile()
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile profiles%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  select * into v_profile from profiles where auth_user_id = v_user_id;
  return v_profile;
end;
$$;

create or replace function public.upsert_my_profile(p_display_name text, p_payment_alias text)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile profiles%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  insert into profiles (auth_user_id, display_name, payment_alias)
  values (v_user_id, nullif(trim(p_display_name), ''), nullif(trim(p_payment_alias), ''))
  on conflict (auth_user_id) do update
  set display_name = excluded.display_name,
      payment_alias = excluded.payment_alias,
      updated_at = now()
  returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function public.create_group_with_owner(
  p_name text,
  p_share_token text,
  p_owner_participant_name text,
  p_owner_participant_alias text default null
)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_participant participants%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion para crear grupos.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del grupo es obligatorio.'; end if;
  if nullif(trim(p_share_token), '') is null then raise exception 'El token del grupo es obligatorio.'; end if;
  if nullif(trim(p_owner_participant_name), '') is null then raise exception 'Tu nombre en este grupo es obligatorio.'; end if;

  insert into groups (name, share_token)
  values (trim(p_name), trim(p_share_token))
  returning * into v_group;

  insert into participants (group_id, name, alias)
  values (v_group.id, trim(p_owner_participant_name), nullif(trim(p_owner_participant_alias), ''))
  returning * into v_participant;

  insert into group_memberships (group_id, participant_id, auth_user_id, role, status)
  values (v_group.id, v_participant.id, v_user_id, 'owner', 'active');

  return v_group;
end;
$$;

create or replace function public.validate_expense_payload(
  p_group_id uuid,
  p_amount_cents integer,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payer_count integer;
  v_split_count integer;
  v_payer_sum integer;
  v_split_sum integer;
  v_invalid_payers integer;
  v_invalid_splits integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  if p_payer_mode not in ('single', 'multiple') then raise exception 'Modo de pago invalido.'; end if;
  if p_split_mode not in ('equal', 'manual') then raise exception 'Modo de division invalido.'; end if;

  with payers as (
    select (item->>'participantId')::uuid participant_id, (item->>'amountCents')::integer amount_cents
    from jsonb_array_elements(coalesce(p_payers, '[]'::jsonb)) item
  )
  select count(*), coalesce(sum(amount_cents), 0),
         count(*) filter (where amount_cents <= 0 or not exists (select 1 from participants p where p.id = participant_id and p.group_id = p_group_id))
  into v_payer_count, v_payer_sum, v_invalid_payers
  from payers;

  with splits as (
    select (item->>'participantId')::uuid participant_id, (item->>'amountCents')::integer amount_cents
    from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item
  )
  select count(*), coalesce(sum(amount_cents), 0),
         count(*) filter (where amount_cents < 0 or not exists (select 1 from participants p where p.id = participant_id and p.group_id = p_group_id))
  into v_split_count, v_split_sum, v_invalid_splits
  from splits;

  if v_payer_count = 0 then raise exception 'Elegi quien pago.'; end if;
  if v_split_count = 0 then raise exception 'Selecciona al menos un participante para dividir.'; end if;
  if v_invalid_payers > 0 then raise exception 'Hay pagadores invalidos.'; end if;
  if v_invalid_splits > 0 then raise exception 'Hay participantes invalidos en la division.'; end if;
  if v_payer_sum <> p_amount_cents then raise exception 'La suma pagada tiene que coincidir con el total.'; end if;
  if v_split_sum <> p_amount_cents then raise exception 'La suma de la division tiene que coincidir con el total.'; end if;
  if p_payer_mode = 'single' and v_payer_count <> 1 then raise exception 'El modo una persona exige un pagador.'; end if;
end;
$$;

create or replace function public.create_expense_by_token(
  p_share_token text,
  p_title text,
  p_amount_cents integer,
  p_date date,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_expense expenses%rowtype;
  v_first_payer uuid;
  v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);

  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;

  insert into expenses (group_id, title, amount_cents, paid_by_participant_id, split_participant_ids, date, payer_mode, split_mode)
  values (v_group_id, trim(p_title), p_amount_cents, v_first_payer, v_split_ids, p_date, p_payer_mode, p_split_mode)
  returning * into v_expense;

  insert into expense_payers (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer
  from jsonb_array_elements(p_payers) item;

  insert into expense_splits (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer
  from jsonb_array_elements(p_splits) item;

  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.update_expense_by_token(
  p_share_token text,
  p_expense_id uuid,
  p_title text,
  p_amount_cents integer,
  p_date date,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_expense expenses%rowtype;
  v_first_payer uuid;
  v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  if not exists (select 1 from expenses where id = p_expense_id and group_id = v_group_id) then
    raise exception 'No encontramos ese gasto en este grupo.';
  end if;

  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;

  update expenses
  set title = trim(p_title),
      amount_cents = p_amount_cents,
      paid_by_participant_id = v_first_payer,
      split_participant_ids = v_split_ids,
      date = p_date,
      payer_mode = p_payer_mode,
      split_mode = p_split_mode
  where id = p_expense_id and group_id = v_group_id
  returning * into v_expense;

  delete from expense_payers where expense_id = v_expense.id;
  delete from expense_splits where expense_id = v_expense.id;

  insert into expense_payers (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer
  from jsonb_array_elements(p_payers) item;

  insert into expense_splits (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer
  from jsonb_array_elements(p_splits) item;

  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.expense_with_lines_json(p_expense expenses)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(p_expense)
    || jsonb_build_object(
      'payerMode', p_expense.payer_mode,
      'splitMode', p_expense.split_mode,
      'payers', coalesce((select jsonb_agg(jsonb_build_object('participantId', ep.participant_id, 'amountCents', ep.amount_cents) order by ep.id) from expense_payers ep where ep.expense_id = p_expense.id), '[]'::jsonb),
      'splits', coalesce((select jsonb_agg(jsonb_build_object('participantId', es.participant_id, 'amountCents', es.amount_cents) order by es.id) from expense_splits es where es.expense_id = p_expense.id), '[]'::jsonb)
    );
$$;

create or replace function public.get_group_data(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_has_active boolean;
  v_has_revoked boolean;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;

  select * into v_group from groups where share_token = p_share_token and archived_at is null;
  if not found then raise exception 'No encontramos este grupo.'; end if;

  select exists (select 1 from group_memberships where group_id = v_group.id and auth_user_id = v_user_id and status = 'active') into v_has_active;
  select exists (select 1 from group_memberships where group_id = v_group.id and auth_user_id = v_user_id and status = 'revoked') into v_has_revoked;

  if not v_has_active and v_has_revoked then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'settlementPayments', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', null,
      'claimedParticipantIds', '[]'::jsonb,
      'accessStatus', 'revoked',
      'accessRevoked', true
    );
  end if;

  if not v_has_active then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from participants p where p.group_id = v_group.id and p.is_active = true), '[]'::jsonb),
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'settlementPayments', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', null,
      'claimedParticipantIds', coalesce((select jsonb_agg(m.participant_id) from group_memberships m where m.group_id = v_group.id and m.status = 'active' and m.participant_id is not null), '[]'::jsonb),
      'accessStatus', 'requires_join',
      'requiresJoin', true
    );
  end if;

  select * into v_membership
  from group_memberships
  where group_id = v_group.id and auth_user_id = v_user_id and status = 'active'
  limit 1;

  update group_memberships set last_seen_at = now() where id = v_membership.id returning * into v_membership;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from participants p where p.group_id = v_group.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(public.expense_with_lines_json(e) order by e.date desc, e.created_at desc) from expenses e where e.group_id = v_group.id), '[]'::jsonb),
    'settlementCycles', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.closed_at desc) from settlement_cycles sc where sc.group_id = v_group.id), '[]'::jsonb),
    'settlementPayments', coalesce((select jsonb_agg(to_jsonb(sp) order by sp.created_at desc) from settlement_payments sp where sp.group_id = v_group.id), '[]'::jsonb),
    'memberships', coalesce((select jsonb_agg(to_jsonb(m) order by m.joined_at) from group_memberships m where m.group_id = v_group.id), '[]'::jsonb),
    'currentMembership', to_jsonb(v_membership),
    'claimedParticipantIds', coalesce((select jsonb_agg(m.participant_id) from group_memberships m where m.group_id = v_group.id and m.status = 'active' and m.participant_id is not null), '[]'::jsonb),
    'accessStatus', 'member'
  );
end;
$$;

create or replace function public.create_settlement_payment_by_token(
  p_share_token text,
  p_from_participant_id uuid,
  p_to_participant_id uuid,
  p_amount_cents integer
)
returns settlement_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_user_id uuid := auth.uid();
  v_payment settlement_payments%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  if p_from_participant_id = p_to_participant_id then raise exception 'El pago necesita dos participantes distintos.'; end if;
  if not exists (select 1 from participants where id = p_from_participant_id and group_id = v_group_id) then raise exception 'Quien paga no pertenece a este grupo.'; end if;
  if not exists (select 1 from participants where id = p_to_participant_id and group_id = v_group_id) then raise exception 'Quien recibe no pertenece a este grupo.'; end if;

  insert into settlement_payments (group_id, from_participant_id, to_participant_id, amount_cents, created_by_auth_user_id)
  values (v_group_id, p_from_participant_id, p_to_participant_id, p_amount_cents, v_user_id)
  returning * into v_payment;
  return v_payment;
end;
$$;

create or replace function public.notify_group_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_share_token text;
begin
  if TG_TABLE_NAME = 'groups' then
    v_group_id := coalesce(NEW.id, OLD.id);
    v_share_token := coalesce(NEW.share_token, OLD.share_token);
  elsif TG_TABLE_NAME in ('expense_payers', 'expense_splits') then
    select e.group_id into v_group_id from public.expenses e where e.id = coalesce(NEW.expense_id, OLD.expense_id);
    select share_token into v_share_token from public.groups where id = v_group_id;
  else
    v_group_id := coalesce(NEW.group_id, OLD.group_id);
    select share_token into v_share_token from public.groups where id = v_group_id;
  end if;

  if v_share_token is not null then
    perform realtime.send(
      jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP, 'at', now()),
      'group_changed',
      'group:' || v_share_token,
      false
    );
  end if;
  return null;
end;
$$;

drop trigger if exists on_settlement_payments_changed on public.settlement_payments;
create trigger on_settlement_payments_changed after insert or update or delete on public.settlement_payments for each row execute function public.notify_group_changed();
drop trigger if exists on_expense_payers_changed on public.expense_payers;
create trigger on_expense_payers_changed after insert or update or delete on public.expense_payers for each row execute function public.notify_group_changed();
drop trigger if exists on_expense_splits_changed on public.expense_splits;
create trigger on_expense_splits_changed after insert or update or delete on public.expense_splits for each row execute function public.notify_group_changed();

grant execute on function get_my_profile() to authenticated;
grant execute on function upsert_my_profile(text, text) to authenticated;
grant execute on function create_group_with_owner(text, text, text, text) to authenticated;
grant execute on function validate_expense_payload(uuid, integer, jsonb, jsonb, text, text) to authenticated;
grant execute on function expense_with_lines_json(expenses) to authenticated;
grant execute on function create_expense_by_token(text, text, integer, date, jsonb, jsonb, text, text) to authenticated;
grant execute on function update_expense_by_token(text, uuid, text, integer, date, jsonb, jsonb, text, text) to authenticated;
grant execute on function create_settlement_payment_by_token(text, uuid, uuid, integer) to authenticated;
grant execute on function get_group_data(text) to authenticated;

NOTIFY pgrst, 'reload schema';

-- =========================================================
-- Email/password auth flow
-- =========================================================
-- Before creating the two unique indexes below, diagnose old test duplicates:
--
-- select group_id, auth_user_id, count(*)
-- from public.group_memberships
-- where status = 'active'
-- group by group_id, auth_user_id
-- having count(*) > 1;
--
-- select group_id, participant_id, count(*)
-- from public.group_memberships
-- where status = 'active'
--   and participant_id is not null
-- group by group_id, participant_id
-- having count(*) > 1;
--
-- If an index fails because of old data, revoke or clean duplicated test
-- memberships manually. This script does not delete data automatically.

create unique index if not exists group_memberships_active_user_group_idx
  on group_memberships (group_id, auth_user_id)
  where status = 'active';

create unique index if not exists group_memberships_active_participant_group_idx
  on group_memberships (group_id, participant_id)
  where status = 'active' and participant_id is not null;

create or replace function public.create_group_with_owner(
  p_name text,
  p_share_token text,
  p_owner_participant_name text
)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_participant participants%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Necesitás iniciar sesión para crear grupos.';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del grupo es obligatorio.';
  end if;
  if nullif(trim(p_share_token), '') is null then
    raise exception 'El token del grupo es obligatorio.';
  end if;
  if nullif(trim(p_owner_participant_name), '') is null then
    raise exception 'Tu nombre en este grupo es obligatorio.';
  end if;

  insert into groups (name, share_token)
  values (trim(p_name), trim(p_share_token))
  returning * into v_group;

  insert into participants (group_id, name)
  values (v_group.id, trim(p_owner_participant_name))
  returning * into v_participant;

  insert into group_memberships (group_id, participant_id, auth_user_id, role, status)
  values (v_group.id, v_participant.id, v_user_id, 'owner', 'active');

  return v_group;
end;
$$;

create or replace function public.get_group_data(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_has_active boolean;
  v_has_revoked boolean;
begin
  if v_user_id is null then
    raise exception 'Necesitás iniciar sesión.';
  end if;

  select * into v_group from groups where share_token = p_share_token and archived_at is null;
  if not found then
    raise exception 'No encontramos este grupo.';
  end if;

  select exists (
    select 1 from group_memberships
    where group_id = v_group.id and auth_user_id = v_user_id and status = 'active'
  ) into v_has_active;

  select exists (
    select 1 from group_memberships
    where group_id = v_group.id and auth_user_id = v_user_id and status = 'revoked'
  ) into v_has_revoked;

  if not v_has_active and v_has_revoked then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', null,
      'claimedParticipantIds', '[]'::jsonb,
      'accessStatus', 'revoked',
      'accessRevoked', true
    );
  end if;

  if not v_has_active then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', coalesce(
        (
          select jsonb_agg(to_jsonb(p) order by p.created_at asc)
          from participants p
          where p.group_id = v_group.id and p.is_active = true
        ),
        '[]'::jsonb
      ),
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', null,
      'claimedParticipantIds', coalesce(
        (
          select jsonb_agg(m.participant_id)
          from group_memberships m
          where m.group_id = v_group.id
            and m.status = 'active'
            and m.participant_id is not null
        ),
        '[]'::jsonb
      ),
      'accessStatus', 'requires_join',
      'requiresJoin', true
    );
  end if;

  update group_memberships
  set last_seen_at = now()
  where group_id = v_group.id and auth_user_id = v_user_id and status = 'active'
  returning * into v_membership;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at asc) from participants p where p.group_id = v_group.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(to_jsonb(e) order by e.date desc, e.created_at desc) from expenses e where e.group_id = v_group.id), '[]'::jsonb),
    'settlementCycles', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.closed_at desc) from settlement_cycles sc where sc.group_id = v_group.id), '[]'::jsonb),
    'memberships', case
      when v_membership.role = 'owner' then coalesce((select jsonb_agg(to_jsonb(m) order by m.joined_at asc) from group_memberships m where m.group_id = v_group.id), '[]'::jsonb)
      else '[]'::jsonb
    end,
    'currentMembership', to_jsonb(v_membership),
    'claimedParticipantIds', coalesce(
      (
        select jsonb_agg(m.participant_id)
        from group_memberships m
        where m.group_id = v_group.id and m.status = 'active' and m.participant_id is not null
      ),
      '[]'::jsonb
    ),
    'accessStatus', 'member'
  );
end;
$$;

create or replace function public.join_group_by_token(
  p_share_token text,
  p_participant_id uuid default null,
  p_new_participant_name text default null,
  p_new_participant_alias text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_participant participants%rowtype;
  v_role text := 'member';
begin
  if v_user_id is null then
    raise exception 'Necesitás iniciar sesión.';
  end if;

  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;

  if exists (select 1 from group_memberships where group_id = v_group_id and auth_user_id = v_user_id and status = 'revoked') then
    raise exception 'Tu acceso a este grupo fue revocado.';
  end if;

  select * into v_membership from group_memberships where group_id = v_group_id and auth_user_id = v_user_id and status = 'active';
  if found then
    if v_membership.participant_id is not null then select * into v_participant from participants where id = v_membership.participant_id; end if;
    return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', case when v_participant.id is null then null else to_jsonb(v_participant) end);
  end if;

  if not exists (select 1 from group_memberships where group_id = v_group_id and status = 'active') then
    v_role := 'owner';
  end if;

  if p_participant_id is not null then
    select * into v_participant from participants where id = p_participant_id and group_id = v_group_id and is_active = true;
    if not found then raise exception 'Ese participante no pertenece al grupo.'; end if;
    if exists (
      select 1 from group_memberships
      where group_id = v_group_id and participant_id = p_participant_id and status = 'active'
    ) then
      raise exception 'Ese participante ya está asociado a otra persona.';
    end if;
  elsif nullif(trim(p_new_participant_name), '') is not null then
    insert into participants (group_id, name, alias)
    values (v_group_id, trim(p_new_participant_name), nullif(trim(p_new_participant_alias), ''))
    returning * into v_participant;
  else
    raise exception 'Elegí quién sos o creá un participante nuevo.';
  end if;

  insert into group_memberships (group_id, participant_id, auth_user_id, role, status)
  values (v_group_id, v_participant.id, v_user_id, v_role, 'active')
  returning * into v_membership;

  return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', to_jsonb(v_participant));
end;
$$;

create or replace function public.update_my_group_identity(p_share_token text, p_participant_id uuid)
returns group_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitás iniciar sesión.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;
  if not exists (select 1 from participants where id = p_participant_id and group_id = v_group_id and is_active = true) then
    raise exception 'Ese participante no pertenece al grupo.';
  end if;
  if exists (
    select 1 from group_memberships
    where group_id = v_group_id
      and participant_id = p_participant_id
      and status = 'active'
      and auth_user_id <> v_user_id
  ) then
    raise exception 'Ese participante ya está asociado a otra persona.';
  end if;

  update group_memberships
  set participant_id = p_participant_id, last_seen_at = now()
  where group_id = v_group_id and auth_user_id = v_user_id and status = 'active'
  returning * into v_membership;
  if not found then raise exception 'No sos miembro activo de este grupo.'; end if;
  return v_membership;
end;
$$;

grant execute on function create_group_with_owner(text, text, text) to authenticated;
grant execute on function get_my_groups() to authenticated;
grant execute on function get_group_data(text) to authenticated;
grant execute on function join_group_by_token(text, uuid, text, text) to authenticated;
grant execute on function update_my_group_identity(text, uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

-- =========================================================
-- Anonymous Auth + memberships
-- =========================================================

create table if not exists group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  participant_id uuid null references participants(id) on delete set null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists group_memberships_group_id_idx on group_memberships (group_id);
create index if not exists group_memberships_auth_user_id_idx on group_memberships (auth_user_id);
create index if not exists group_memberships_participant_id_idx on group_memberships (participant_id);
create unique index if not exists group_memberships_active_user_group_idx
  on group_memberships (group_id, auth_user_id)
  where status = 'active';

alter table group_memberships enable row level security;

create or replace function public.create_group_with_token(p_name text, p_share_token text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Necesitás una identidad anónima para crear grupos.';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del grupo es obligatorio.';
  end if;

  if nullif(trim(p_share_token), '') is null then
    raise exception 'El token del grupo es obligatorio.';
  end if;

  insert into groups (name, share_token)
  values (trim(p_name), trim(p_share_token))
  returning * into v_group;

  insert into group_memberships (group_id, auth_user_id, role, status)
  values (v_group.id, v_user_id, 'owner', 'active');

  return v_group;
end;
$$;

create or replace function public.get_my_groups()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Necesitás una identidad anónima.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'group', to_jsonb(g),
          'membership', to_jsonb(m),
          'participant', case when p.id is null then null else to_jsonb(p) end,
          'role', m.role,
          'last_seen_at', m.last_seen_at
        )
        order by m.last_seen_at desc
      )
      from group_memberships m
      join groups g on g.id = m.group_id
      left join participants p on p.id = m.participant_id
      where m.auth_user_id = v_user_id
        and m.status = 'active'
        and g.archived_at is null
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.get_group_data(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_has_active boolean;
  v_has_revoked boolean;
begin
  if v_user_id is null then
    raise exception 'Necesitás una identidad anónima.';
  end if;

  select * into v_group
  from groups
  where share_token = p_share_token
    and archived_at is null;

  if not found then
    raise exception 'No encontramos este grupo.';
  end if;

  select exists (
    select 1 from group_memberships
    where group_id = v_group.id
      and auth_user_id = v_user_id
      and status = 'active'
  ) into v_has_active;

  select exists (
    select 1 from group_memberships
    where group_id = v_group.id
      and auth_user_id = v_user_id
      and status = 'revoked'
  ) into v_has_revoked;

  if not v_has_active and v_has_revoked then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', null,
      'accessStatus', 'revoked',
      'accessRevoked', true
    );
  end if;

  if not v_has_active then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', coalesce(
        (
          select jsonb_agg(to_jsonb(p) order by p.created_at asc)
          from participants p
          where p.group_id = v_group.id
            and p.is_active = true
        ),
        '[]'::jsonb
      ),
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', null,
      'accessStatus', 'requires_join',
      'requiresJoin', true
    );
  end if;

  update group_memberships
  set last_seen_at = now()
  where group_id = v_group.id
    and auth_user_id = v_user_id
    and status = 'active'
  returning * into v_membership;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'participants', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.created_at asc) from participants p where p.group_id = v_group.id),
      '[]'::jsonb
    ),
    'expenses', coalesce(
      (select jsonb_agg(to_jsonb(e) order by e.date desc, e.created_at desc) from expenses e where e.group_id = v_group.id),
      '[]'::jsonb
    ),
    'settlementCycles', coalesce(
      (select jsonb_agg(to_jsonb(sc) order by sc.closed_at desc) from settlement_cycles sc where sc.group_id = v_group.id),
      '[]'::jsonb
    ),
    'memberships', case
      when v_membership.role = 'owner' then coalesce(
        (select jsonb_agg(to_jsonb(m) order by m.joined_at asc) from group_memberships m where m.group_id = v_group.id),
        '[]'::jsonb
      )
      else '[]'::jsonb
    end,
    'currentMembership', to_jsonb(v_membership),
    'accessStatus', 'member'
  );
end;
$$;

create or replace function public.join_group_by_token(
  p_share_token text,
  p_participant_id uuid default null,
  p_new_participant_name text default null,
  p_new_participant_alias text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_participant participants%rowtype;
  v_role text := 'member';
begin
  if v_user_id is null then
    raise exception 'Necesitás una identidad anónima.';
  end if;

  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then
    raise exception 'No encontramos este grupo.';
  end if;

  if exists (
    select 1 from group_memberships
    where group_id = v_group_id and auth_user_id = v_user_id and status = 'revoked'
  ) then
    raise exception 'Tu acceso a este grupo fue revocado.';
  end if;

  select * into v_membership
  from group_memberships
  where group_id = v_group_id and auth_user_id = v_user_id and status = 'active';

  if found then
    if v_membership.participant_id is not null then
      select * into v_participant from participants where id = v_membership.participant_id;
    end if;
    return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', case when v_participant.id is null then null else to_jsonb(v_participant) end);
  end if;

  if not exists (select 1 from group_memberships where group_id = v_group_id and status = 'active') then
    v_role := 'owner';
  end if;

  if p_participant_id is not null then
    select * into v_participant from participants where id = p_participant_id and group_id = v_group_id;
    if not found then
      raise exception 'Ese participante no pertenece al grupo.';
    end if;
  elsif nullif(trim(p_new_participant_name), '') is not null then
    insert into participants (group_id, name, alias)
    values (v_group_id, trim(p_new_participant_name), nullif(trim(p_new_participant_alias), ''))
    returning * into v_participant;
  end if;

  insert into group_memberships (group_id, participant_id, auth_user_id, role, status)
  values (v_group_id, case when v_participant.id is null then null else v_participant.id end, v_user_id, v_role, 'active')
  returning * into v_membership;

  return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', case when v_participant.id is null then null else to_jsonb(v_participant) end);
end;
$$;

create or replace function public.update_my_group_identity(p_share_token text, p_participant_id uuid)
returns group_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitás una identidad anónima.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;
  if not exists (select 1 from participants where id = p_participant_id and group_id = v_group_id) then
    raise exception 'Ese participante no pertenece al grupo.';
  end if;

  update group_memberships
  set participant_id = p_participant_id, last_seen_at = now()
  where group_id = v_group_id and auth_user_id = v_user_id and status = 'active'
  returning * into v_membership;

  if not found then raise exception 'No sos miembro activo de este grupo.'; end if;
  return v_membership;
end;
$$;

create or replace function public.get_group_members_by_token(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Necesitás una identidad anónima.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;
  if not exists (
    select 1 from group_memberships
    where group_id = v_group_id and auth_user_id = v_user_id and status = 'active' and role = 'owner'
  ) then
    raise exception 'Solo el owner puede ver miembros.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object(
          'participant_name', p.name,
          'participant_alias', p.alias
        )
        order by m.status asc, m.joined_at asc
      )
      from group_memberships m
      left join participants p on p.id = m.participant_id
      where m.group_id = v_group_id
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.revoke_group_member_by_token(p_share_token text, p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_target group_memberships%rowtype;
  v_active_owner_count integer;
begin
  if v_user_id is null then raise exception 'Necesitás una identidad anónima.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;
  if not exists (
    select 1 from group_memberships
    where group_id = v_group_id and auth_user_id = v_user_id and status = 'active' and role = 'owner'
  ) then
    raise exception 'Solo el owner puede revocar miembros.';
  end if;

  select * into v_target from group_memberships where id = p_membership_id and group_id = v_group_id;
  if not found then raise exception 'No encontramos ese miembro.'; end if;
  if v_target.auth_user_id = v_user_id then raise exception 'No podés revocarte a vos mismo.'; end if;

  select count(*) into v_active_owner_count
  from group_memberships
  where group_id = v_group_id and status = 'active' and role = 'owner';

  if v_target.role = 'owner' and v_active_owner_count <= 1 then
    raise exception 'No podés revocar al único owner activo.';
  end if;

  update group_memberships
  set status = 'revoked'
  where id = p_membership_id and group_id = v_group_id;
end;
$$;

create or replace function public.regenerate_group_invite_token(p_share_token text, p_new_share_token text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Necesitás una identidad anónima.'; end if;
  select * into v_group from groups where share_token = p_share_token and archived_at is null;
  if not found then raise exception 'No encontramos este grupo.'; end if;
  if not exists (
    select 1 from group_memberships
    where group_id = v_group.id and auth_user_id = v_user_id and status = 'active' and role = 'owner'
  ) then
    raise exception 'Solo el owner puede regenerar el link.';
  end if;
  if nullif(trim(p_new_share_token), '') is null then raise exception 'El token nuevo es obligatorio.'; end if;

  update groups
  set share_token = trim(p_new_share_token)
  where id = v_group.id
  returning * into v_group;

  return v_group;
end;
$$;

create or replace function public.touch_group_membership(p_share_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Necesitás una identidad anónima.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;
  update group_memberships
  set last_seen_at = now()
  where group_id = v_group_id and auth_user_id = v_user_id and status = 'active';
end;
$$;

create or replace function public.require_active_member_group_id(p_share_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Necesitás una identidad anónima.'; end if;
  select g.id into v_group_id
  from groups g
  join group_memberships m on m.group_id = g.id
  where g.share_token = p_share_token
    and g.archived_at is null
    and m.auth_user_id = v_user_id
    and m.status = 'active';
  if v_group_id is null then raise exception 'No sos miembro activo de este grupo.'; end if;
  return v_group_id;
end;
$$;

create or replace function public.create_participant_by_token(p_share_token text, p_name text, p_alias text default null)
returns participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_participant participants%rowtype;
begin
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del participante es obligatorio.'; end if;
  insert into participants (group_id, name, alias)
  values (v_group_id, trim(p_name), nullif(trim(p_alias), ''))
  returning * into v_participant;
  return v_participant;
end;
$$;

create or replace function public.update_participant_by_token(
  p_share_token text,
  p_participant_id uuid,
  p_name text,
  p_alias text,
  p_is_active boolean
)
returns participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_participant participants%rowtype;
begin
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del participante es obligatorio.'; end if;
  update participants
  set name = trim(p_name), alias = nullif(trim(p_alias), ''), is_active = p_is_active
  where id = p_participant_id and group_id = v_group_id
  returning * into v_participant;
  if not found then raise exception 'No encontramos ese participante en este grupo.'; end if;
  return v_participant;
end;
$$;

create or replace function public.create_expense_by_token(
  p_share_token text,
  p_title text,
  p_amount_cents integer,
  p_paid_by_participant_id uuid,
  p_split_participant_ids uuid[],
  p_date date
)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_split_count integer;
  v_valid_split_count integer;
  v_expense expenses%rowtype;
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  select count(*) into v_split_count from unnest(coalesce(p_split_participant_ids, array[]::uuid[])) as participant_id;
  if v_split_count = 0 then raise exception 'Seleccioná al menos un participante para dividir.'; end if;
  if not exists (select 1 from participants where id = p_paid_by_participant_id and group_id = v_group_id) then
    raise exception 'Quien pagó no pertenece a este grupo.';
  end if;
  select count(distinct participant_id) into v_valid_split_count
  from unnest(p_split_participant_ids) as participant_id
  join participants p on p.id = participant_id and p.group_id = v_group_id;
  if v_valid_split_count <> (select count(distinct participant_id) from unnest(p_split_participant_ids) as participant_id) then
    raise exception 'Hay participantes de la división que no pertenecen a este grupo.';
  end if;
  insert into expenses (group_id, title, amount_cents, paid_by_participant_id, split_participant_ids, date)
  values (v_group_id, trim(p_title), p_amount_cents, p_paid_by_participant_id, p_split_participant_ids, p_date)
  returning * into v_expense;
  return v_expense;
end;
$$;

create or replace function public.update_expense_by_token(
  p_share_token text,
  p_expense_id uuid,
  p_title text,
  p_amount_cents integer,
  p_paid_by_participant_id uuid,
  p_split_participant_ids uuid[],
  p_date date
)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_split_count integer;
  v_valid_split_count integer;
  v_expense expenses%rowtype;
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  select count(*) into v_split_count from unnest(coalesce(p_split_participant_ids, array[]::uuid[])) as participant_id;
  if v_split_count = 0 then raise exception 'Seleccioná al menos un participante para dividir.'; end if;
  if not exists (select 1 from participants where id = p_paid_by_participant_id and group_id = v_group_id) then
    raise exception 'Quien pagó no pertenece a este grupo.';
  end if;
  select count(distinct participant_id) into v_valid_split_count
  from unnest(p_split_participant_ids) as participant_id
  join participants p on p.id = participant_id and p.group_id = v_group_id;
  if v_valid_split_count <> (select count(distinct participant_id) from unnest(p_split_participant_ids) as participant_id) then
    raise exception 'Hay participantes de la división que no pertenecen a este grupo.';
  end if;
  update expenses
  set title = trim(p_title),
      amount_cents = p_amount_cents,
      paid_by_participant_id = p_paid_by_participant_id,
      split_participant_ids = p_split_participant_ids,
      date = p_date
  where id = p_expense_id and group_id = v_group_id
  returning * into v_expense;
  if not found then raise exception 'No encontramos ese gasto en este grupo.'; end if;
  return v_expense;
end;
$$;

create or replace function public.delete_expense_by_token(p_share_token text, p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
begin
  delete from expenses where id = p_expense_id and group_id = v_group_id;
  if not found then raise exception 'No encontramos ese gasto en este grupo.'; end if;
end;
$$;

create or replace function public.close_cycle_by_token(p_share_token text)
returns settlement_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_cycle settlement_cycles%rowtype;
begin
  if not exists (select 1 from expenses where group_id = v_group_id and settlement_cycle_id is null) then
    raise exception 'No hay gastos abiertos para cerrar.';
  end if;
  insert into settlement_cycles (group_id, title)
  values (v_group_id, 'Cierre del ' || to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'DD/MM/YYYY'))
  returning * into v_cycle;
  update expenses set settlement_cycle_id = v_cycle.id where group_id = v_group_id and settlement_cycle_id is null;
  return v_cycle;
end;
$$;

create or replace function public.notify_group_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_share_token text;
begin
  if TG_TABLE_NAME = 'groups' then
    v_group_id := coalesce(NEW.id, OLD.id);
    v_share_token := coalesce(NEW.share_token, OLD.share_token);
  else
    v_group_id := coalesce(NEW.group_id, OLD.group_id);
    select share_token into v_share_token from public.groups where id = v_group_id;
  end if;

  if v_share_token is not null then
    perform realtime.send(
      jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP, 'at', now()),
      'group_changed',
      'group:' || v_share_token,
      false
    );
  end if;
  return null;
end;
$$;

drop trigger if exists on_group_memberships_changed on public.group_memberships;
create trigger on_group_memberships_changed
after insert or update or delete on public.group_memberships
for each row execute function public.notify_group_changed();

drop trigger if exists on_groups_changed on public.groups;
create trigger on_groups_changed after insert or update or delete on public.groups for each row execute function public.notify_group_changed();
drop trigger if exists on_participants_changed on public.participants;
create trigger on_participants_changed after insert or update or delete on public.participants for each row execute function public.notify_group_changed();
drop trigger if exists on_expenses_changed on public.expenses;
create trigger on_expenses_changed after insert or update or delete on public.expenses for each row execute function public.notify_group_changed();
drop trigger if exists on_settlement_cycles_changed on public.settlement_cycles;
create trigger on_settlement_cycles_changed after insert or update or delete on public.settlement_cycles for each row execute function public.notify_group_changed();

grant execute on function get_my_groups() to authenticated;
grant execute on function get_group_data(text) to authenticated;
grant execute on function create_group_with_token(text, text) to authenticated;
grant execute on function join_group_by_token(text, uuid, text, text) to authenticated;
grant execute on function update_my_group_identity(text, uuid) to authenticated;
grant execute on function get_group_members_by_token(text) to authenticated;
grant execute on function revoke_group_member_by_token(text, uuid) to authenticated;
grant execute on function regenerate_group_invite_token(text, text) to authenticated;
grant execute on function touch_group_membership(text) to authenticated;
grant execute on function create_participant_by_token(text, text, text) to authenticated;
grant execute on function update_participant_by_token(text, uuid, text, text, boolean) to authenticated;
grant execute on function create_expense_by_token(text, text, integer, uuid, uuid[], date) to authenticated;
grant execute on function update_expense_by_token(text, uuid, text, integer, uuid, uuid[], date) to authenticated;
grant execute on function delete_expense_by_token(text, uuid) to authenticated;
grant execute on function close_cycle_by_token(text) to authenticated;
grant execute on function require_active_member_group_id(text) to authenticated;

NOTIFY pgrst, 'reload schema';

-- Final hotfix: keep flexible expenses and settlement payments as the last effective RPC definitions.
-- This block intentionally does not modify close_cycle_by_token.

create table if not exists public.settlement_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_participant_id uuid not null references public.participants(id),
  to_participant_id uuid not null references public.participants(id),
  amount_cents integer not null check (amount_cents > 0),
  created_by_auth_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz null
);

create index if not exists settlement_payments_group_id_idx on public.settlement_payments(group_id);
create index if not exists settlement_payments_voided_at_idx on public.settlement_payments(voided_at);
alter table public.settlement_payments enable row level security;

alter table public.expenses
  add column if not exists payer_mode text not null default 'single' check (payer_mode in ('single', 'multiple')),
  add column if not exists split_mode text not null default 'equal' check (split_mode in ('equal', 'manual'));

create table if not exists public.expense_payers (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  participant_id uuid not null references public.participants(id),
  amount_cents integer not null check (amount_cents > 0)
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  participant_id uuid not null references public.participants(id),
  amount_cents integer not null check (amount_cents >= 0)
);

create index if not exists expense_payers_expense_id_idx on public.expense_payers(expense_id);
create index if not exists expense_splits_expense_id_idx on public.expense_splits(expense_id);
alter table public.expense_payers enable row level security;
alter table public.expense_splits enable row level security;

insert into public.expense_payers (expense_id, participant_id, amount_cents)
select e.id, e.paid_by_participant_id, e.amount_cents
from public.expenses e
where e.paid_by_participant_id is not null
  and not exists (select 1 from public.expense_payers ep where ep.expense_id = e.id);

insert into public.expense_splits (expense_id, participant_id, amount_cents)
select e.id,
       split_participant_id,
       floor(e.amount_cents::numeric / cardinality(coalesce(e.split_participant_ids, array[]::uuid[])))::integer
         + case when row_number() over (partition by e.id order by split_participant_id) <= (e.amount_cents % cardinality(coalesce(e.split_participant_ids, array[]::uuid[]))) then 1 else 0 end
from public.expenses e
cross join lateral unnest(coalesce(e.split_participant_ids, array[]::uuid[])) as split_participant_id
where cardinality(coalesce(e.split_participant_ids, array[]::uuid[])) > 0
  and not exists (select 1 from public.expense_splits es where es.expense_id = e.id);

create or replace function public.expense_with_lines_json(p_expense expenses)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(p_expense)
    || jsonb_build_object(
      'payerMode', p_expense.payer_mode,
      'splitMode', p_expense.split_mode,
      'payers', coalesce((select jsonb_agg(jsonb_build_object('participantId', ep.participant_id, 'amountCents', ep.amount_cents) order by ep.id) from expense_payers ep where ep.expense_id = p_expense.id), '[]'::jsonb),
      'splits', coalesce((select jsonb_agg(jsonb_build_object('participantId', es.participant_id, 'amountCents', es.amount_cents) order by es.id) from expense_splits es where es.expense_id = p_expense.id), '[]'::jsonb)
    );
$$;

create or replace function public.validate_expense_payload(
  p_group_id uuid,
  p_amount_cents integer,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payer_count integer;
  v_split_count integer;
  v_payer_sum integer;
  v_split_sum integer;
  v_invalid_payers integer;
  v_invalid_splits integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  if p_payer_mode not in ('single', 'multiple') then raise exception 'Modo de pago invalido.'; end if;
  if p_split_mode not in ('equal', 'manual') then raise exception 'Modo de division invalido.'; end if;

  with payers as (
    select (item->>'participantId')::uuid participant_id, (item->>'amountCents')::integer amount_cents
    from jsonb_array_elements(coalesce(p_payers, '[]'::jsonb)) item
  )
  select count(*), coalesce(sum(amount_cents), 0),
         count(*) filter (where amount_cents <= 0 or not exists (select 1 from participants p where p.id = participant_id and p.group_id = p_group_id))
  into v_payer_count, v_payer_sum, v_invalid_payers
  from payers;

  with splits as (
    select (item->>'participantId')::uuid participant_id, (item->>'amountCents')::integer amount_cents
    from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item
  )
  select count(*), coalesce(sum(amount_cents), 0),
         count(*) filter (where amount_cents < 0 or not exists (select 1 from participants p where p.id = participant_id and p.group_id = p_group_id))
  into v_split_count, v_split_sum, v_invalid_splits
  from splits;

  if v_payer_count = 0 then raise exception 'Elegi quien pago.'; end if;
  if v_split_count = 0 then raise exception 'Selecciona al menos un participante para dividir.'; end if;
  if v_invalid_payers > 0 then raise exception 'Hay pagadores invalidos.'; end if;
  if v_invalid_splits > 0 then raise exception 'Hay participantes invalidos en la division.'; end if;
  if v_payer_sum <> p_amount_cents then raise exception 'La suma pagada tiene que coincidir con el total.'; end if;
  if v_split_sum <> p_amount_cents then raise exception 'La suma de la division tiene que coincidir con el total.'; end if;
  if p_payer_mode = 'single' and v_payer_count <> 1 then raise exception 'El modo una persona exige un pagador.'; end if;
end;
$$;

create or replace function public.get_group_data(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_has_active boolean;
  v_has_revoked boolean;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;

  select * into v_group from groups where share_token = p_share_token and archived_at is null;
  if not found then raise exception 'No encontramos este grupo.'; end if;

  select exists (select 1 from group_memberships where group_id = v_group.id and auth_user_id = v_user_id and status = 'active') into v_has_active;
  select exists (select 1 from group_memberships where group_id = v_group.id and auth_user_id = v_user_id and status = 'revoked') into v_has_revoked;

  if not v_has_active and v_has_revoked then
    return jsonb_build_object('group', to_jsonb(v_group), 'participants', '[]'::jsonb, 'expenses', '[]'::jsonb, 'settlementCycles', '[]'::jsonb, 'settlementPayments', '[]'::jsonb, 'memberships', '[]'::jsonb, 'currentMembership', null, 'claimedParticipantIds', '[]'::jsonb, 'accessStatus', 'revoked', 'accessRevoked', true);
  end if;

  if not v_has_active then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from participants p where p.group_id = v_group.id and p.is_active = true), '[]'::jsonb),
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'settlementPayments', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', null,
      'claimedParticipantIds', coalesce((select jsonb_agg(m.participant_id) from group_memberships m where m.group_id = v_group.id and m.status = 'active' and m.participant_id is not null), '[]'::jsonb),
      'accessStatus', 'requires_join',
      'requiresJoin', true
    );
  end if;

  select * into v_membership from group_memberships where group_id = v_group.id and auth_user_id = v_user_id and status = 'active' limit 1;
  update group_memberships set last_seen_at = now() where id = v_membership.id returning * into v_membership;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from participants p where p.group_id = v_group.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(public.expense_with_lines_json(e) order by e.date desc, e.created_at desc) from expenses e where e.group_id = v_group.id), '[]'::jsonb),
    'settlementCycles', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.closed_at desc) from settlement_cycles sc where sc.group_id = v_group.id), '[]'::jsonb),
    'settlementPayments', coalesce((select jsonb_agg(to_jsonb(sp) order by sp.created_at desc) from settlement_payments sp where sp.group_id = v_group.id), '[]'::jsonb),
    'memberships', coalesce((select jsonb_agg(to_jsonb(m) order by m.joined_at) from group_memberships m where m.group_id = v_group.id), '[]'::jsonb),
    'currentMembership', to_jsonb(v_membership),
    'claimedParticipantIds', coalesce((select jsonb_agg(m.participant_id) from group_memberships m where m.group_id = v_group.id and m.status = 'active' and m.participant_id is not null), '[]'::jsonb),
    'accessStatus', 'member'
  );
end;
$$;

create or replace function public.create_expense_by_token(
  p_share_token text,
  p_title text,
  p_amount_cents integer,
  p_date date,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_expense expenses%rowtype;
  v_first_payer uuid;
  v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);

  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;

  insert into expenses (group_id, title, amount_cents, paid_by_participant_id, split_participant_ids, date, payer_mode, split_mode)
  values (v_group_id, trim(p_title), p_amount_cents, v_first_payer, v_split_ids, p_date, p_payer_mode, p_split_mode)
  returning * into v_expense;

  insert into expense_payers (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;

  insert into expense_splits (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_splits) item;

  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.update_expense_by_token(
  p_share_token text,
  p_expense_id uuid,
  p_title text,
  p_amount_cents integer,
  p_date date,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_expense expenses%rowtype;
  v_first_payer uuid;
  v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  if not exists (select 1 from expenses where id = p_expense_id and group_id = v_group_id) then raise exception 'No encontramos ese gasto en este grupo.'; end if;

  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;

  update expenses
  set title = trim(p_title), amount_cents = p_amount_cents, paid_by_participant_id = v_first_payer, split_participant_ids = v_split_ids, date = p_date, payer_mode = p_payer_mode, split_mode = p_split_mode
  where id = p_expense_id and group_id = v_group_id
  returning * into v_expense;

  delete from expense_payers where expense_id = v_expense.id;
  delete from expense_splits where expense_id = v_expense.id;

  insert into expense_payers (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;

  insert into expense_splits (expense_id, participant_id, amount_cents)
  select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_splits) item;

  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.create_settlement_payment_by_token(
  p_share_token text,
  p_from_participant_id uuid,
  p_to_participant_id uuid,
  p_amount_cents integer
)
returns settlement_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_user_id uuid := auth.uid();
  v_payment settlement_payments%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  if p_from_participant_id = p_to_participant_id then raise exception 'El pago necesita dos participantes distintos.'; end if;
  if not exists (select 1 from participants where id = p_from_participant_id and group_id = v_group_id) then raise exception 'Quien paga no pertenece a este grupo.'; end if;
  if not exists (select 1 from participants where id = p_to_participant_id and group_id = v_group_id) then raise exception 'Quien recibe no pertenece a este grupo.'; end if;

  insert into settlement_payments (group_id, from_participant_id, to_participant_id, amount_cents, created_by_auth_user_id)
  values (v_group_id, p_from_participant_id, p_to_participant_id, p_amount_cents, v_user_id)
  returning * into v_payment;
  return v_payment;
end;
$$;

create or replace function public.notify_group_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_share_token text;
begin
  if TG_TABLE_NAME = 'groups' then
    v_group_id := coalesce(NEW.id, OLD.id);
    v_share_token := coalesce(NEW.share_token, OLD.share_token);
  elsif TG_TABLE_NAME in ('expense_payers', 'expense_splits') then
    select e.group_id into v_group_id from public.expenses e where e.id = coalesce(NEW.expense_id, OLD.expense_id);
    select share_token into v_share_token from public.groups where id = v_group_id;
  else
    v_group_id := coalesce(NEW.group_id, OLD.group_id);
    select share_token into v_share_token from public.groups where id = v_group_id;
  end if;

  if v_share_token is not null then
    perform realtime.send(jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP, 'at', now()), 'group_changed', 'group:' || v_share_token, false);
  end if;
  return null;
end;
$$;

drop trigger if exists on_settlement_payments_changed on public.settlement_payments;
create trigger on_settlement_payments_changed after insert or update or delete on public.settlement_payments for each row execute function public.notify_group_changed();
drop trigger if exists on_expense_payers_changed on public.expense_payers;
create trigger on_expense_payers_changed after insert or update or delete on public.expense_payers for each row execute function public.notify_group_changed();
drop trigger if exists on_expense_splits_changed on public.expense_splits;
create trigger on_expense_splits_changed after insert or update or delete on public.expense_splits for each row execute function public.notify_group_changed();

grant execute on function expense_with_lines_json(expenses) to authenticated;
grant execute on function validate_expense_payload(uuid, integer, jsonb, jsonb, text, text) to authenticated;
grant execute on function get_group_data(text) to authenticated;
grant execute on function create_expense_by_token(text, text, integer, date, jsonb, jsonb, text, text) to authenticated;
grant execute on function update_expense_by_token(text, uuid, text, integer, date, jsonb, jsonb, text, text) to authenticated;
grant execute on function create_settlement_payment_by_token(text, uuid, uuid, integer) to authenticated;

NOTIFY pgrst, 'reload schema';

-- Operational polish: final effective definitions.
-- Does not change auth or memberships.

alter table public.settlement_payments
  add column if not exists settlement_cycle_id uuid null references public.settlement_cycles(id);

create index if not exists settlement_payments_settlement_cycle_id_idx on public.settlement_payments(settlement_cycle_id);

create or replace function public.void_settlement_payment_by_token(
  p_share_token text,
  p_payment_id uuid
)
returns settlement_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_payment settlement_payments%rowtype;
begin
  update settlement_payments
  set voided_at = now()
  where id = p_payment_id
    and group_id = v_group_id
    and voided_at is null
  returning * into v_payment;

  if not found then
    raise exception 'No se pudo anular el pago.';
  end if;

  return v_payment;
end;
$$;

create or replace function public.group_has_pending_settlements(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with participant_balances as (
    select p.id,
      coalesce(paid.total_cents, 0) + coalesce(payments_from.total_cents, 0)
        - coalesce(owed.total_cents, 0) - coalesce(payments_to.total_cents, 0) as balance_cents
    from participants p
    left join (
      select ep.participant_id, sum(ep.amount_cents)::integer as total_cents
      from expense_payers ep
      join expenses e on e.id = ep.expense_id
      where e.group_id = p_group_id and e.settlement_cycle_id is null
      group by ep.participant_id
    ) paid on paid.participant_id = p.id
    left join (
      select es.participant_id, sum(es.amount_cents)::integer as total_cents
      from expense_splits es
      join expenses e on e.id = es.expense_id
      where e.group_id = p_group_id and e.settlement_cycle_id is null
      group by es.participant_id
    ) owed on owed.participant_id = p.id
    left join (
      select from_participant_id as participant_id, sum(amount_cents)::integer as total_cents
      from settlement_payments
      where group_id = p_group_id and voided_at is null and settlement_cycle_id is null
      group by from_participant_id
    ) payments_from on payments_from.participant_id = p.id
    left join (
      select to_participant_id as participant_id, sum(amount_cents)::integer as total_cents
      from settlement_payments
      where group_id = p_group_id and voided_at is null and settlement_cycle_id is null
      group by to_participant_id
    ) payments_to on payments_to.participant_id = p.id
    where p.group_id = p_group_id
  )
  select exists (select 1 from participant_balances where balance_cents <> 0);
$$;

create or replace function public.close_cycle_by_token(p_share_token text)
returns settlement_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_member_group_id(p_share_token);
  v_cycle settlement_cycles%rowtype;
begin
  if not exists (select 1 from expenses where group_id = v_group_id and settlement_cycle_id is null) then
    raise exception 'No hay gastos abiertos para cerrar.';
  end if;

  if public.group_has_pending_settlements(v_group_id) then
    raise exception 'Para cerrar el periodo, primero salda las deudas pendientes.';
  end if;

  insert into settlement_cycles (group_id, title)
  values (v_group_id, 'Cierre del ' || to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'DD/MM/YYYY'))
  returning * into v_cycle;

  update expenses
  set settlement_cycle_id = v_cycle.id
  where group_id = v_group_id and settlement_cycle_id is null;

  update settlement_payments
  set settlement_cycle_id = v_cycle.id
  where group_id = v_group_id and voided_at is null and settlement_cycle_id is null;

  return v_cycle;
end;
$$;

grant execute on function void_settlement_payment_by_token(text, uuid) to authenticated;
grant execute on function group_has_pending_settlements(uuid) to authenticated;
grant execute on function close_cycle_by_token(text) to authenticated;

NOTIFY pgrst, 'reload schema';
-- EOF marker for final activity overrides.

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  actor_auth_user_id uuid null references auth.users(id) on delete set null,
  actor_participant_id uuid null references public.participants(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_group_created_at_idx on public.activity_logs(group_id, created_at desc);
create index if not exists activity_logs_actor_auth_user_id_idx on public.activity_logs(actor_auth_user_id);
alter table public.activity_logs enable row level security;

create or replace function public.log_group_activity(p_group_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_participant_id uuid;
begin
  if v_user_id is not null then
    select participant_id into v_actor_participant_id
    from public.group_memberships
    where group_id = p_group_id and auth_user_id = v_user_id and status = 'active'
    limit 1;
  end if;

  insert into public.activity_logs (group_id, actor_auth_user_id, actor_participant_id, action, entity_type, entity_id, metadata)
  values (p_group_id, v_user_id, v_actor_participant_id, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.get_group_data(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_has_active boolean;
  v_has_revoked boolean;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;

  select * into v_group from groups where share_token = p_share_token and archived_at is null;
  if not found then raise exception 'No encontramos este grupo.'; end if;

  select exists (select 1 from group_memberships where group_id = v_group.id and auth_user_id = v_user_id and status = 'active') into v_has_active;
  select exists (select 1 from group_memberships where group_id = v_group.id and auth_user_id = v_user_id and status = 'revoked') into v_has_revoked;

  if not v_has_active and v_has_revoked then
    return jsonb_build_object('group', to_jsonb(v_group), 'participants', '[]'::jsonb, 'expenses', '[]'::jsonb, 'settlementCycles', '[]'::jsonb, 'settlementPayments', '[]'::jsonb, 'activityLogs', '[]'::jsonb, 'memberships', '[]'::jsonb, 'currentMembership', null, 'claimedParticipantIds', '[]'::jsonb, 'accessStatus', 'revoked', 'accessRevoked', true);
  end if;

  if not v_has_active then
    return jsonb_build_object('group', to_jsonb(v_group), 'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from participants p where p.group_id = v_group.id and p.is_active = true), '[]'::jsonb), 'expenses', '[]'::jsonb, 'settlementCycles', '[]'::jsonb, 'settlementPayments', '[]'::jsonb, 'activityLogs', '[]'::jsonb, 'memberships', '[]'::jsonb, 'currentMembership', null, 'claimedParticipantIds', coalesce((select jsonb_agg(m.participant_id) from group_memberships m where m.group_id = v_group.id and m.status = 'active' and m.participant_id is not null), '[]'::jsonb), 'accessStatus', 'requires_join', 'requiresJoin', true);
  end if;

  select * into v_membership from group_memberships where group_id = v_group.id and auth_user_id = v_user_id and status = 'active' limit 1;
  update group_memberships set last_seen_at = now() where id = v_membership.id returning * into v_membership;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from participants p where p.group_id = v_group.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(public.expense_with_lines_json(e) order by e.date desc, e.created_at desc) from expenses e where e.group_id = v_group.id), '[]'::jsonb),
    'settlementCycles', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.closed_at desc) from settlement_cycles sc where sc.group_id = v_group.id), '[]'::jsonb),
    'settlementPayments', coalesce((select jsonb_agg(to_jsonb(sp) order by sp.created_at desc) from settlement_payments sp where sp.group_id = v_group.id), '[]'::jsonb),
    'activityLogs', coalesce((select jsonb_agg(to_jsonb(activity_rows) order by activity_rows.created_at desc) from (select al.id, al.group_id, al.actor_auth_user_id, al.actor_participant_id, p.name as "actorName", al.action, al.entity_type, al.entity_id, al.metadata, al.created_at from public.activity_logs al left join public.participants p on p.id = al.actor_participant_id where al.group_id = v_group.id order by al.created_at desc limit 100) activity_rows), '[]'::jsonb),
    'memberships', coalesce((select jsonb_agg(to_jsonb(m) order by m.joined_at) from group_memberships m where m.group_id = v_group.id), '[]'::jsonb),
    'currentMembership', to_jsonb(v_membership),
    'claimedParticipantIds', coalesce((select jsonb_agg(m.participant_id) from group_memberships m where m.group_id = v_group.id and m.status = 'active' and m.participant_id is not null), '[]'::jsonb),
    'accessStatus', 'member'
  );
end;
$$;

create or replace function public.create_participant_by_token(p_share_token text, p_name text, p_alias text default null)
returns participants language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_participant participants%rowtype;
begin
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del participante es obligatorio.'; end if;
  insert into participants (group_id, name, alias) values (v_group_id, trim(p_name), nullif(trim(p_alias), '')) returning * into v_participant;
  perform public.log_group_activity(v_group_id, 'participant_created', 'participant', v_participant.id, jsonb_build_object('name', v_participant.name));
  return v_participant;
end;
$$;

create or replace function public.update_participant_by_token(p_share_token text, p_participant_id uuid, p_name text, p_alias text, p_is_active boolean)
returns participants language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_participant participants%rowtype;
begin
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del participante es obligatorio.'; end if;
  update participants set name = trim(p_name), alias = nullif(trim(p_alias), ''), is_active = p_is_active where id = p_participant_id and group_id = v_group_id returning * into v_participant;
  if not found then raise exception 'No encontramos ese participante en este grupo.'; end if;
  perform public.log_group_activity(v_group_id, 'participant_updated', 'participant', v_participant.id, jsonb_build_object('name', v_participant.name));
  return v_participant;
end;
$$;

create or replace function public.create_expense_by_token(p_share_token text, p_title text, p_amount_cents integer, p_date date, p_payers jsonb, p_splits jsonb, p_payer_mode text, p_split_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_expense expenses%rowtype; v_first_payer uuid; v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;
  insert into expenses (group_id, title, amount_cents, paid_by_participant_id, split_participant_ids, date, payer_mode, split_mode) values (v_group_id, trim(p_title), p_amount_cents, v_first_payer, v_split_ids, p_date, p_payer_mode, p_split_mode) returning * into v_expense;
  insert into expense_payers (expense_id, participant_id, amount_cents) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;
  insert into expense_splits (expense_id, participant_id, amount_cents) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_splits) item;
  perform public.log_group_activity(v_group_id, 'expense_created', 'expense', v_expense.id, jsonb_build_object('title', v_expense.title, 'amount_cents', v_expense.amount_cents));
  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.update_expense_by_token(p_share_token text, p_expense_id uuid, p_title text, p_amount_cents integer, p_date date, p_payers jsonb, p_splits jsonb, p_payer_mode text, p_split_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_expense expenses%rowtype; v_first_payer uuid; v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  if not exists (select 1 from expenses where id = p_expense_id and group_id = v_group_id) then raise exception 'No encontramos ese gasto en este grupo.'; end if;
  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;
  update expenses set title = trim(p_title), amount_cents = p_amount_cents, paid_by_participant_id = v_first_payer, split_participant_ids = v_split_ids, date = p_date, payer_mode = p_payer_mode, split_mode = p_split_mode where id = p_expense_id and group_id = v_group_id returning * into v_expense;
  delete from expense_payers where expense_id = v_expense.id;
  delete from expense_splits where expense_id = v_expense.id;
  insert into expense_payers (expense_id, participant_id, amount_cents) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;
  insert into expense_splits (expense_id, participant_id, amount_cents) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_splits) item;
  perform public.log_group_activity(v_group_id, 'expense_updated', 'expense', v_expense.id, jsonb_build_object('title', v_expense.title, 'amount_cents', v_expense.amount_cents));
  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.delete_expense_by_token(p_share_token text, p_expense_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_title text;
begin
  select title into v_title from public.expenses where id = p_expense_id and group_id = v_group_id;
  if not found then raise exception 'No encontramos ese gasto en este grupo.'; end if;
  delete from expenses where id = p_expense_id and group_id = v_group_id;
  perform public.log_group_activity(v_group_id, 'expense_deleted', 'expense', p_expense_id, jsonb_build_object('title', v_title));
end;
$$;

create or replace function public.create_settlement_payment_by_token(p_share_token text, p_from_participant_id uuid, p_to_participant_id uuid, p_amount_cents integer)
returns settlement_payments language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_user_id uuid := auth.uid(); v_payment settlement_payments%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  if p_from_participant_id = p_to_participant_id then raise exception 'El pago necesita dos participantes distintos.'; end if;
  if not exists (select 1 from participants where id = p_from_participant_id and group_id = v_group_id) then raise exception 'Quien paga no pertenece a este grupo.'; end if;
  if not exists (select 1 from participants where id = p_to_participant_id and group_id = v_group_id) then raise exception 'Quien recibe no pertenece a este grupo.'; end if;
  insert into settlement_payments (group_id, from_participant_id, to_participant_id, amount_cents, created_by_auth_user_id) values (v_group_id, p_from_participant_id, p_to_participant_id, p_amount_cents, v_user_id) returning * into v_payment;
  perform public.log_group_activity(v_group_id, 'payment_created', 'settlement_payment', v_payment.id, jsonb_build_object('from_participant_id', p_from_participant_id, 'to_participant_id', p_to_participant_id, 'amount_cents', p_amount_cents));
  return v_payment;
end;
$$;

create or replace function public.void_settlement_payment_by_token(p_share_token text, p_payment_id uuid)
returns settlement_payments language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_payment settlement_payments%rowtype;
begin
  update settlement_payments set voided_at = now() where id = p_payment_id and group_id = v_group_id and voided_at is null returning * into v_payment;
  if not found then raise exception 'No se pudo anular el pago.'; end if;
  perform public.log_group_activity(v_group_id, 'payment_voided', 'settlement_payment', v_payment.id, jsonb_build_object('amount_cents', v_payment.amount_cents));
  return v_payment;
end;
$$;

create or replace function public.close_cycle_by_token(p_share_token text)
returns settlement_cycles language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_cycle settlement_cycles%rowtype;
begin
  if not exists (select 1 from expenses where group_id = v_group_id and settlement_cycle_id is null) then raise exception 'No hay gastos abiertos para cerrar.'; end if;
  if public.group_has_pending_settlements(v_group_id) then raise exception 'Para cerrar el periodo, primero salda las deudas pendientes.'; end if;
  insert into settlement_cycles (group_id, title) values (v_group_id, 'Cierre del ' || to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'DD/MM/YYYY')) returning * into v_cycle;
  update expenses set settlement_cycle_id = v_cycle.id where group_id = v_group_id and settlement_cycle_id is null;
  update settlement_payments set settlement_cycle_id = v_cycle.id where group_id = v_group_id and voided_at is null and settlement_cycle_id is null;
  perform public.log_group_activity(v_group_id, 'period_closed', 'settlement_cycle', v_cycle.id, '{}'::jsonb);
  return v_cycle;
end;
$$;

create or replace function public.revoke_group_member_by_token(p_share_token text, p_membership_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_group_id uuid; v_user_id uuid := auth.uid(); v_target group_memberships%rowtype; v_active_owner_count integer;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;
  if not exists (select 1 from group_memberships where group_id = v_group_id and auth_user_id = v_user_id and status = 'active' and role = 'owner') then raise exception 'Solo el owner puede revocar miembros.'; end if;
  select * into v_target from group_memberships where id = p_membership_id and group_id = v_group_id;
  if not found then raise exception 'No encontramos ese miembro.'; end if;
  if v_target.auth_user_id = v_user_id then raise exception 'No podes revocarte a vos mismo.'; end if;
  select count(*) into v_active_owner_count from group_memberships where group_id = v_group_id and status = 'active' and role = 'owner';
  if v_target.role = 'owner' and v_active_owner_count <= 1 then raise exception 'No podes revocar al unico owner activo.'; end if;
  update group_memberships set status = 'revoked' where id = p_membership_id and group_id = v_group_id;
  perform public.log_group_activity(v_group_id, 'member_revoked', 'membership', p_membership_id, '{}'::jsonb);
end;
$$;

create or replace function public.regenerate_group_invite_token(p_share_token text, p_new_share_token text)
returns groups language plpgsql security definer set search_path = public as $$
declare v_group groups%rowtype; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  select * into v_group from groups where share_token = p_share_token and archived_at is null;
  if not found then raise exception 'No encontramos este grupo.'; end if;
  if not exists (select 1 from group_memberships where group_id = v_group.id and auth_user_id = v_user_id and status = 'active' and role = 'owner') then raise exception 'Solo el owner puede regenerar el link.'; end if;
  if nullif(trim(p_new_share_token), '') is null then raise exception 'El token nuevo es obligatorio.'; end if;
  update groups set share_token = trim(p_new_share_token) where id = v_group.id returning * into v_group;
  perform public.log_group_activity(v_group.id, 'invite_regenerated', 'group', v_group.id, '{}'::jsonb);
  return v_group;
end;
$$;

create or replace function public.notify_group_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_group_id uuid; v_share_token text;
begin
  if TG_TABLE_NAME = 'groups' then
    v_group_id := coalesce(NEW.id, OLD.id);
    v_share_token := coalesce(NEW.share_token, OLD.share_token);
  elsif TG_TABLE_NAME in ('expense_payers', 'expense_splits') then
    select e.group_id into v_group_id from public.expenses e where e.id = coalesce(NEW.expense_id, OLD.expense_id);
    select share_token into v_share_token from public.groups where id = v_group_id;
  else
    v_group_id := coalesce(NEW.group_id, OLD.group_id);
    select share_token into v_share_token from public.groups where id = v_group_id;
  end if;
  if v_share_token is not null then perform realtime.send(jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP, 'at', now()), 'group_changed', 'group:' || v_share_token, false); end if;
  return null;
end;
$$;

drop trigger if exists on_activity_logs_changed on public.activity_logs;
create trigger on_activity_logs_changed after insert or update or delete on public.activity_logs for each row execute function public.notify_group_changed();

grant execute on function get_group_data(text) to authenticated;
grant execute on function create_participant_by_token(text, text, text) to authenticated;
grant execute on function update_participant_by_token(text, uuid, text, text, boolean) to authenticated;
grant execute on function create_expense_by_token(text, text, integer, date, jsonb, jsonb, text, text) to authenticated;
grant execute on function update_expense_by_token(text, uuid, text, integer, date, jsonb, jsonb, text, text) to authenticated;
grant execute on function delete_expense_by_token(text, uuid) to authenticated;
grant execute on function create_settlement_payment_by_token(text, uuid, uuid, integer) to authenticated;
grant execute on function void_settlement_payment_by_token(text, uuid) to authenticated;
grant execute on function close_cycle_by_token(text) to authenticated;
grant execute on function revoke_group_member_by_token(text, uuid) to authenticated;
grant execute on function regenerate_group_invite_token(text, text) to authenticated;

NOTIFY pgrst, 'reload schema';

-- EOF replay: final admin/trust overrides must run after historical blocks.
-- Final admin/trust iteration overrides: pending approvals, multiple owners, activity.

do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'group_memberships'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%status%'
  loop
    execute format('alter table public.group_memberships drop constraint if exists %I', v_constraint_name);
  end loop;
end $$;

alter table public.group_memberships
  add constraint group_memberships_status_check check (status in ('active', 'pending', 'revoked'));

create index if not exists group_memberships_pending_participant_group_idx
  on public.group_memberships (group_id, participant_id)
  where status = 'pending' and participant_id is not null;

create or replace function public.require_active_owner_group_id(p_share_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;

  select g.id into v_group_id
  from public.groups g
  join public.group_memberships m on m.group_id = g.id
  where g.share_token = p_share_token
    and g.archived_at is null
    and m.auth_user_id = v_user_id
    and m.status = 'active'
    and m.role = 'owner'
  limit 1;

  if v_group_id is null then raise exception 'Solo un owner activo puede hacer esto.'; end if;
  return v_group_id;
end;
$$;

create or replace function public.get_group_data(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;

  select * into v_group from groups where share_token = p_share_token and archived_at is null;
  if not found then raise exception 'No encontramos este grupo.'; end if;

  select * into v_membership
  from group_memberships
  where group_id = v_group.id and auth_user_id = v_user_id
  order by case status when 'active' then 1 when 'pending' then 2 else 3 end
  limit 1;

  if not found then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from participants p where p.group_id = v_group.id and p.is_active = true), '[]'::jsonb),
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'settlementPayments', '[]'::jsonb,
      'activityLogs', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', null,
      'claimedParticipantIds', coalesce((select jsonb_agg(m.participant_id) from group_memberships m where m.group_id = v_group.id and m.status in ('active', 'pending') and m.participant_id is not null), '[]'::jsonb),
      'accessStatus', 'requires_join',
      'requiresJoin', true
    );
  end if;

  if v_membership.status = 'pending' then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'settlementPayments', '[]'::jsonb,
      'activityLogs', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', to_jsonb(v_membership),
      'claimedParticipantIds', '[]'::jsonb,
      'accessStatus', 'pending'
    );
  end if;

  if v_membership.status = 'revoked' then
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'participants', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'settlementCycles', '[]'::jsonb,
      'settlementPayments', '[]'::jsonb,
      'activityLogs', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'currentMembership', to_jsonb(v_membership),
      'claimedParticipantIds', '[]'::jsonb,
      'accessStatus', 'revoked',
      'accessRevoked', true
    );
  end if;

  update group_memberships set last_seen_at = now() where id = v_membership.id returning * into v_membership;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from participants p where p.group_id = v_group.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(public.expense_with_lines_json(e) order by e.date desc, e.created_at desc) from expenses e where e.group_id = v_group.id), '[]'::jsonb),
    'settlementCycles', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.closed_at desc) from settlement_cycles sc where sc.group_id = v_group.id), '[]'::jsonb),
    'settlementPayments', coalesce((select jsonb_agg(to_jsonb(sp) order by sp.created_at desc) from settlement_payments sp where sp.group_id = v_group.id), '[]'::jsonb),
    'activityLogs', coalesce((select jsonb_agg(to_jsonb(activity_rows) order by activity_rows.created_at desc) from (select al.id, al.group_id, al.actor_auth_user_id, al.actor_participant_id, p.name as "actorName", al.action, al.entity_type, al.entity_id, al.metadata, al.created_at from public.activity_logs al left join public.participants p on p.id = al.actor_participant_id where al.group_id = v_group.id order by al.created_at desc limit 100) activity_rows), '[]'::jsonb),
    'memberships', case when v_membership.role = 'owner' then coalesce((select jsonb_agg(to_jsonb(m) order by m.joined_at) from group_memberships m where m.group_id = v_group.id), '[]'::jsonb) else '[]'::jsonb end,
    'currentMembership', to_jsonb(v_membership),
    'claimedParticipantIds', coalesce((select jsonb_agg(m.participant_id) from group_memberships m where m.group_id = v_group.id and m.status in ('active', 'pending') and m.participant_id is not null), '[]'::jsonb),
    'accessStatus', 'member'
  );
end;
$$;

create or replace function public.join_group_by_token(
  p_share_token text,
  p_participant_id uuid default null,
  p_new_participant_name text default null,
  p_new_participant_alias text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_participant participants%rowtype;
  v_has_active_owner boolean;
  v_new_status text := 'pending';
  v_new_role text := 'member';
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;

  select * into v_membership
  from group_memberships
  where group_id = v_group_id and auth_user_id = v_user_id
  order by case status when 'active' then 1 when 'pending' then 2 else 3 end
  limit 1;

  if found then
    if v_membership.status = 'revoked' then raise exception 'Tu acceso a este grupo fue revocado.'; end if;
    if v_membership.participant_id is not null then select * into v_participant from participants where id = v_membership.participant_id; end if;
    return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', case when v_participant.id is null then null else to_jsonb(v_participant) end);
  end if;

  select exists (select 1 from group_memberships where group_id = v_group_id and status = 'active' and role = 'owner') into v_has_active_owner;
  if not v_has_active_owner then
    v_new_status := 'active';
    v_new_role := 'owner';
  end if;

  if p_participant_id is not null then
    select * into v_participant from participants where id = p_participant_id and group_id = v_group_id and is_active = true;
    if not found then raise exception 'Ese participante no pertenece al grupo.'; end if;
    if exists (select 1 from group_memberships where group_id = v_group_id and participant_id = p_participant_id and status in ('active', 'pending')) then
      raise exception 'Ese participante ya esta asociado o pendiente.';
    end if;
  else
    if nullif(trim(p_new_participant_name), '') is null then raise exception 'El nombre es obligatorio.'; end if;
    insert into participants (group_id, name, alias)
    values (v_group_id, trim(p_new_participant_name), nullif(trim(p_new_participant_alias), ''))
    returning * into v_participant;
  end if;

  insert into group_memberships (group_id, participant_id, auth_user_id, role, status)
  values (v_group_id, v_participant.id, v_user_id, v_new_role, v_new_status)
  returning * into v_membership;

  if v_new_status = 'active' then
    perform public.log_group_activity(v_group_id, 'member_approved', 'membership', v_membership.id, '{}'::jsonb);
  end if;

  return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', to_jsonb(v_participant));
end;
$$;

create or replace function public.get_group_members_by_token(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_owner_group_id(p_share_token);
begin
  return coalesce(
    (
      select jsonb_agg(to_jsonb(rows) order by rows.status, rows.joined_at)
      from (
        select
          m.*,
          p.name as participant_name,
          p.alias as participant_alias,
          p.name as requested_name
        from group_memberships m
        left join participants p on p.id = m.participant_id
        where m.group_id = v_group_id
      ) rows
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.approve_group_member_by_token(p_share_token text, p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_owner_group_id(p_share_token);
begin
  update group_memberships
  set status = 'active'
  where id = p_membership_id and group_id = v_group_id and status = 'pending';
  if not found then raise exception 'No encontramos esa solicitud pendiente.'; end if;
  perform public.log_group_activity(v_group_id, 'member_approved', 'membership', p_membership_id, '{}'::jsonb);
end;
$$;

create or replace function public.reject_group_member_by_token(p_share_token text, p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_owner_group_id(p_share_token);
begin
  update group_memberships
  set status = 'revoked'
  where id = p_membership_id and group_id = v_group_id and status = 'pending';
  if not found then raise exception 'No encontramos esa solicitud pendiente.'; end if;
  perform public.log_group_activity(v_group_id, 'member_rejected', 'membership', p_membership_id, '{}'::jsonb);
end;
$$;

create or replace function public.promote_group_member_to_owner(p_share_token text, p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_owner_group_id(p_share_token);
begin
  update group_memberships
  set role = 'owner'
  where id = p_membership_id and group_id = v_group_id and status = 'active' and role = 'member';
  if not found then raise exception 'No encontramos ese miembro activo.'; end if;
  perform public.log_group_activity(v_group_id, 'member_promoted_to_owner', 'membership', p_membership_id, '{}'::jsonb);
end;
$$;

create or replace function public.demote_group_owner_to_member(p_share_token text, p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_owner_group_id(p_share_token);
  v_active_owner_count integer;
begin
  select count(*) into v_active_owner_count from group_memberships where group_id = v_group_id and status = 'active' and role = 'owner';
  if v_active_owner_count <= 1 then raise exception 'No podes quitar owner al ultimo owner activo.'; end if;

  update group_memberships
  set role = 'member'
  where id = p_membership_id and group_id = v_group_id and status = 'active' and role = 'owner';
  if not found then raise exception 'No encontramos ese owner activo.'; end if;
  perform public.log_group_activity(v_group_id, 'member_demoted_to_member', 'membership', p_membership_id, '{}'::jsonb);
end;
$$;

create or replace function public.revoke_group_member_by_token(p_share_token text, p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid := public.require_active_owner_group_id(p_share_token);
  v_user_id uuid := auth.uid();
  v_target group_memberships%rowtype;
  v_active_owner_count integer;
begin
  select * into v_target from group_memberships where id = p_membership_id and group_id = v_group_id;
  if not found then raise exception 'No encontramos ese miembro.'; end if;
  if v_target.auth_user_id = v_user_id then raise exception 'No podes revocarte a vos mismo.'; end if;

  select count(*) into v_active_owner_count from group_memberships where group_id = v_group_id and status = 'active' and role = 'owner';
  if v_target.status = 'active' and v_target.role = 'owner' and v_active_owner_count <= 1 then
    raise exception 'No podes revocar al unico owner activo.';
  end if;

  update group_memberships set status = 'revoked' where id = p_membership_id and group_id = v_group_id;
  perform public.log_group_activity(v_group_id, 'member_revoked', 'membership', p_membership_id, '{}'::jsonb);
end;
$$;

grant execute on function require_active_owner_group_id(text) to authenticated;
grant execute on function get_group_data(text) to authenticated;
grant execute on function join_group_by_token(text, uuid, text, text) to authenticated;
grant execute on function get_group_members_by_token(text) to authenticated;
grant execute on function approve_group_member_by_token(text, uuid) to authenticated;
grant execute on function reject_group_member_by_token(text, uuid) to authenticated;
grant execute on function promote_group_member_to_owner(text, uuid) to authenticated;
grant execute on function demote_group_owner_to_member(text, uuid) to authenticated;
grant execute on function revoke_group_member_by_token(text, uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

-- EOF final replay: alias profile + percentage split overrides must run after historical blocks.
-- EOF replay: alias profile + percentage split overrides.

alter table public.participants
  add column if not exists alias_source text not null default 'manual';

do $$
declare v_constraint_name text;
begin
  for v_constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'participants'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%alias_source%'
  loop
    execute format('alter table public.participants drop constraint if exists %I', v_constraint_name);
  end loop;
end $$;

alter table public.participants
  add constraint participants_alias_source_check check (alias_source in ('profile', 'custom', 'manual'));

update public.participants set alias_source = 'manual' where alias_source is null;

alter table public.expense_splits
  add column if not exists percentage numeric null;

do $$
declare v_constraint_name text;
begin
  for v_constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'expenses'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%split_mode%'
  loop
    execute format('alter table public.expenses drop constraint if exists %I', v_constraint_name);
  end loop;
end $$;

alter table public.expenses
  add constraint expenses_split_mode_check check (split_mode in ('equal', 'manual', 'percentage'));

create or replace function public.update_my_profile(p_display_name text, p_payment_alias text)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile profiles%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;

  insert into profiles (auth_user_id, display_name, payment_alias)
  values (v_user_id, nullif(trim(p_display_name), ''), nullif(trim(p_payment_alias), ''))
  on conflict (auth_user_id) do update
  set display_name = excluded.display_name,
      payment_alias = excluded.payment_alias,
      updated_at = now()
  returning * into v_profile;

  update participants p
  set alias = v_profile.payment_alias,
      alias_source = 'profile'
  from group_memberships m
  where m.participant_id = p.id
    and m.auth_user_id = v_user_id
    and m.status = 'active'
    and p.alias_source = 'profile';

  return v_profile;
end;
$$;

create or replace function public.upsert_my_profile(p_display_name text, p_payment_alias text)
returns profiles
language sql
security definer
set search_path = public
as $$
  select public.update_my_profile(p_display_name, p_payment_alias);
$$;

create or replace function public.update_my_group_profile(
  p_share_token text,
  p_participant_name text,
  p_participant_alias text,
  p_use_profile_alias boolean
)
returns participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_profile profiles%rowtype;
  v_participant participants%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;

  select * into v_membership
  from group_memberships
  where group_id = v_group_id and auth_user_id = v_user_id and status = 'active'
  limit 1;
  if not found or v_membership.participant_id is null then raise exception 'No tenes participante asociado.'; end if;

  select * into v_profile from profiles where auth_user_id = v_user_id;

  update participants
  set name = trim(p_participant_name),
      alias = case when p_use_profile_alias then v_profile.payment_alias else nullif(trim(p_participant_alias), '') end,
      alias_source = case when p_use_profile_alias then 'profile' else 'custom' end
  where id = v_membership.participant_id and group_id = v_group_id
  returning * into v_participant;

  perform public.log_group_activity(v_group_id, 'participant_updated', 'participant', v_participant.id, jsonb_build_object('name', v_participant.name));
  return v_participant;
end;
$$;

create or replace function public.create_group_with_owner(
  p_name text,
  p_share_token text,
  p_owner_participant_name text,
  p_owner_participant_alias text default null,
  p_owner_alias_source text default 'profile'
)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group groups%rowtype;
  v_participant participants%rowtype;
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del grupo es obligatorio.'; end if;
  if nullif(trim(p_owner_participant_name), '') is null then raise exception 'Tu nombre es obligatorio.'; end if;
  if p_owner_alias_source not in ('profile', 'custom', 'manual') then raise exception 'Origen de alias invalido.'; end if;

  insert into groups (name, share_token)
  values (trim(p_name), p_share_token)
  returning * into v_group;

  insert into participants (group_id, name, alias, alias_source)
  values (v_group.id, trim(p_owner_participant_name), nullif(trim(p_owner_participant_alias), ''), p_owner_alias_source)
  returning * into v_participant;

  insert into group_memberships (group_id, participant_id, auth_user_id, role, status)
  values (v_group.id, v_participant.id, v_user_id, 'owner', 'active');

  return v_group;
end;
$$;

create or replace function public.create_participant_by_token(p_share_token text, p_name text, p_alias text default null)
returns participants language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_participant participants%rowtype;
begin
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del participante es obligatorio.'; end if;
  insert into participants (group_id, name, alias, alias_source) values (v_group_id, trim(p_name), nullif(trim(p_alias), ''), 'manual') returning * into v_participant;
  perform public.log_group_activity(v_group_id, 'participant_created', 'participant', v_participant.id, jsonb_build_object('name', v_participant.name));
  return v_participant;
end;
$$;

create or replace function public.update_participant_by_token(p_share_token text, p_participant_id uuid, p_name text, p_alias text, p_is_active boolean)
returns participants language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_participant participants%rowtype;
begin
  if nullif(trim(p_name), '') is null then raise exception 'El nombre del participante es obligatorio.'; end if;
  update participants set name = trim(p_name), alias = nullif(trim(p_alias), ''), alias_source = 'manual', is_active = p_is_active where id = p_participant_id and group_id = v_group_id returning * into v_participant;
  if not found then raise exception 'No encontramos ese participante en este grupo.'; end if;
  perform public.log_group_activity(v_group_id, 'participant_updated', 'participant', v_participant.id, jsonb_build_object('name', v_participant.name));
  return v_participant;
end;
$$;

create or replace function public.validate_expense_payload(
  p_group_id uuid,
  p_amount_cents integer,
  p_payers jsonb,
  p_splits jsonb,
  p_payer_mode text,
  p_split_mode text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payer_total integer;
  v_split_total integer;
  v_percentage_total numeric;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  if p_payer_mode not in ('single', 'multiple') then raise exception 'Modo de pago invalido.'; end if;
  if p_split_mode not in ('equal', 'manual', 'percentage') then raise exception 'Modo de division invalido.'; end if;

  select coalesce(sum((item->>'amountCents')::integer), 0) into v_payer_total from jsonb_array_elements(coalesce(p_payers, '[]'::jsonb)) item;
  select coalesce(sum((item->>'amountCents')::integer), 0) into v_split_total from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item;
  select coalesce(sum(coalesce(nullif(item->>'percentage', '')::numeric, 0)), 0) into v_percentage_total from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item;

  if v_payer_total <> p_amount_cents then raise exception 'La suma pagada tiene que coincidir con el total.'; end if;
  if v_split_total <> p_amount_cents then raise exception 'La suma de la division tiene que coincidir con el total.'; end if;
  if p_split_mode = 'percentage' and abs(v_percentage_total - 100) > 0.001 then raise exception 'La suma de porcentajes tiene que ser 100%%.'; end if;
  if p_split_mode = 'percentage' and exists (select 1 from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item where coalesce(nullif(item->>'percentage', '')::numeric, 0) < 0) then raise exception 'Los porcentajes no pueden ser negativos.'; end if;
end;
$$;

create or replace function public.expense_with_lines_json(p_expense expenses)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(p_expense)
    || jsonb_build_object(
      'payerMode', p_expense.payer_mode,
      'splitMode', p_expense.split_mode,
      'payers', coalesce((select jsonb_agg(jsonb_build_object('participantId', ep.participant_id, 'amountCents', ep.amount_cents) order by ep.id) from expense_payers ep where ep.expense_id = p_expense.id), '[]'::jsonb),
      'splits', coalesce((select jsonb_agg(jsonb_build_object('participantId', es.participant_id, 'amountCents', es.amount_cents, 'percentage', es.percentage) order by es.id) from expense_splits es where es.expense_id = p_expense.id), '[]'::jsonb)
    );
$$;

create or replace function public.create_expense_by_token(p_share_token text, p_title text, p_amount_cents integer, p_date date, p_payers jsonb, p_splits jsonb, p_payer_mode text, p_split_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_expense expenses%rowtype; v_first_payer uuid; v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;
  insert into expenses (group_id, title, amount_cents, paid_by_participant_id, split_participant_ids, date, payer_mode, split_mode) values (v_group_id, trim(p_title), p_amount_cents, v_first_payer, v_split_ids, p_date, p_payer_mode, p_split_mode) returning * into v_expense;
  insert into expense_payers (expense_id, participant_id, amount_cents) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;
  insert into expense_splits (expense_id, participant_id, amount_cents, percentage) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer, nullif(item->>'percentage', '')::numeric from jsonb_array_elements(p_splits) item;
  perform public.log_group_activity(v_group_id, 'expense_created', 'expense', v_expense.id, jsonb_build_object('title', v_expense.title, 'amount_cents', v_expense.amount_cents));
  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.update_expense_by_token(p_share_token text, p_expense_id uuid, p_title text, p_amount_cents integer, p_date date, p_payers jsonb, p_splits jsonb, p_payer_mode text, p_split_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group_id uuid := public.require_active_member_group_id(p_share_token); v_expense expenses%rowtype; v_first_payer uuid; v_split_ids uuid[];
begin
  if nullif(trim(p_title), '') is null then raise exception 'El nombre del gasto es obligatorio.'; end if;
  perform public.validate_expense_payload(v_group_id, p_amount_cents, p_payers, p_splits, p_payer_mode, p_split_mode);
  if not exists (select 1 from expenses where id = p_expense_id and group_id = v_group_id) then raise exception 'No encontramos ese gasto en este grupo.'; end if;
  select (item->>'participantId')::uuid into v_first_payer from jsonb_array_elements(p_payers) item limit 1;
  select array_agg((item->>'participantId')::uuid) into v_split_ids from jsonb_array_elements(p_splits) item;
  update expenses set title = trim(p_title), amount_cents = p_amount_cents, paid_by_participant_id = v_first_payer, split_participant_ids = v_split_ids, date = p_date, payer_mode = p_payer_mode, split_mode = p_split_mode where id = p_expense_id and group_id = v_group_id returning * into v_expense;
  delete from expense_payers where expense_id = v_expense.id;
  delete from expense_splits where expense_id = v_expense.id;
  insert into expense_payers (expense_id, participant_id, amount_cents) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer from jsonb_array_elements(p_payers) item;
  insert into expense_splits (expense_id, participant_id, amount_cents, percentage) select v_expense.id, (item->>'participantId')::uuid, (item->>'amountCents')::integer, nullif(item->>'percentage', '')::numeric from jsonb_array_elements(p_splits) item;
  perform public.log_group_activity(v_group_id, 'expense_updated', 'expense', v_expense.id, jsonb_build_object('title', v_expense.title, 'amount_cents', v_expense.amount_cents));
  return public.expense_with_lines_json(v_expense);
end;
$$;

create or replace function public.join_group_by_token(
  p_share_token text,
  p_participant_id uuid default null,
  p_new_participant_name text default null,
  p_new_participant_alias text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_user_id uuid := auth.uid();
  v_membership group_memberships%rowtype;
  v_participant participants%rowtype;
  v_profile profiles%rowtype;
  v_has_active_owner boolean;
  v_new_status text := 'pending';
  v_new_role text := 'member';
  v_alias_source text := 'custom';
begin
  if v_user_id is null then raise exception 'Necesitas iniciar sesion.'; end if;
  select id into v_group_id from groups where share_token = p_share_token and archived_at is null;
  if v_group_id is null then raise exception 'No encontramos este grupo.'; end if;
  select * into v_profile from profiles where auth_user_id = v_user_id;

  select * into v_membership
  from group_memberships
  where group_id = v_group_id and auth_user_id = v_user_id
  order by case status when 'active' then 1 when 'pending' then 2 else 3 end
  limit 1;

  if found then
    if v_membership.status = 'revoked' then raise exception 'Tu acceso a este grupo fue revocado.'; end if;
    if v_membership.participant_id is not null then select * into v_participant from participants where id = v_membership.participant_id; end if;
    return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', case when v_participant.id is null then null else to_jsonb(v_participant) end);
  end if;

  select exists (select 1 from group_memberships where group_id = v_group_id and status = 'active' and role = 'owner') into v_has_active_owner;
  if not v_has_active_owner then v_new_status := 'active'; v_new_role := 'owner'; end if;

  if p_participant_id is not null then
    select * into v_participant from participants where id = p_participant_id and group_id = v_group_id and is_active = true;
    if not found then raise exception 'Ese participante no pertenece al grupo.'; end if;
    if exists (select 1 from group_memberships where group_id = v_group_id and participant_id = p_participant_id and status in ('active', 'pending')) then
      raise exception 'Ese participante ya esta asociado o pendiente.';
    end if;
  else
    if nullif(trim(p_new_participant_name), '') is null then raise exception 'El nombre es obligatorio.'; end if;
    if nullif(trim(p_new_participant_alias), '') is null then
      v_alias_source := 'manual';
    elsif v_profile.payment_alias is not null and trim(p_new_participant_alias) = v_profile.payment_alias then
      v_alias_source := 'profile';
    end if;
    insert into participants (group_id, name, alias, alias_source)
    values (v_group_id, trim(p_new_participant_name), nullif(trim(p_new_participant_alias), ''), v_alias_source)
    returning * into v_participant;
  end if;

  insert into group_memberships (group_id, participant_id, auth_user_id, role, status)
  values (v_group_id, v_participant.id, v_user_id, v_new_role, v_new_status)
  returning * into v_membership;

  if v_new_status = 'active' then
    perform public.log_group_activity(v_group_id, 'member_approved', 'membership', v_membership.id, '{}'::jsonb);
  end if;

  return jsonb_build_object('membership', to_jsonb(v_membership), 'participant', to_jsonb(v_participant));
end;
$$;

grant execute on function update_my_profile(text, text) to authenticated;
grant execute on function update_my_group_profile(text, text, text, boolean) to authenticated;
grant execute on function create_group_with_owner(text, text, text, text, text) to authenticated;
grant execute on function join_group_by_token(text, uuid, text, text) to authenticated;
grant execute on function validate_expense_payload(uuid, integer, jsonb, jsonb, text, text) to authenticated;
grant execute on function expense_with_lines_json(expenses) to authenticated;

NOTIFY pgrst, 'reload schema';
