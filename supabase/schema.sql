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
