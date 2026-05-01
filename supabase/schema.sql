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
