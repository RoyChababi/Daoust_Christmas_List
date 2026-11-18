-- =====================================================================
-- Family Christmas List — Supabase schema
--
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- It is safe to run again later (it will not wipe data).
--
-- Security model:
--   * Row Level Security is ON for every table with NO policies, so the
--     public "anon" key cannot read or write any table directly.
--   * The website only calls the functions in the "public" schema below
--     (SECURITY DEFINER). Each one checks the passcode or a session token.
--   * Helper functions live in the "private" schema, which the API does
--     not expose.
--   * Claim data is never returned to the owner of an item.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.members (
  id              bigint generated always as identity primary key,
  name            text not null check (length(btrim(name)) between 1 and 60),
  pin_hash        text,
  is_admin        boolean not null default false,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists members_name_unique on public.members (lower(btrim(name)));

create table if not exists public.settings (
  id            int primary key default 1 check (id = 1),
  passcode_hash text,
  season        int not null default extract(year from now())::int
);

create table if not exists public.sessions (
  token      text primary key,
  member_id  bigint not null references public.members(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_member_idx on public.sessions (member_id);

create table if not exists public.items (
  id               bigint generated always as identity primary key,
  owner_id         bigint not null references public.members(id) on delete cascade,
  name             text not null,
  name_normalized  text not null,
  link             text,
  price            numeric(10,2),
  size_color       text,
  priority         text check (priority in ('high','medium','low')),
  notes            text,
  removed_by_owner boolean not null default false,
  season           int not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- One item per normalized name per owner per season (this is what re-upload matches on).
create unique index if not exists items_owner_season_name
  on public.items (owner_id, season, name_normalized);

create table if not exists public.claims (
  id         bigint generated always as identity primary key,
  item_id    bigint not null unique references public.items(id) on delete cascade, -- one claimer per item
  claimer_id bigint not null references public.members(id) on delete cascade,
  bought     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists claims_claimer_idx on public.claims (claimer_id);

-- Lock every table: RLS on, no policies, no direct privileges for API roles.
alter table public.members  enable row level security;
alter table public.settings enable row level security;
alter table public.sessions enable row level security;
alter table public.items    enable row level security;
alter table public.claims   enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- Private helpers (not callable through the API)
-- ---------------------------------------------------------------------

-- lowercase, strip punctuation, collapse spaces, trim
create or replace function private.normalize(p text) returns text
language sql immutable as $$
  select coalesce(
    nullif(btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[[:punct:]]', '', 'g'), '\s+', ' ', 'g')), ''),
    lower(btrim(coalesce(p, '')))
  );
$$;

create or replace function private.clean_text(p text, maxlen int) returns text
language sql immutable as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), maxlen), '');
$$;

-- Notes keep their line breaks.
create or replace function private.clean_notes(p text) returns text
language sql immutable as $$
  select nullif(left(btrim(coalesce(p, '')), 1000), '');
$$;

create or replace function private.clean_link(p text) returns text
language plpgsql immutable as $$
declare v text := nullif(left(btrim(coalesce(p, '')), 2000), '');
begin
  if v is null then return null; end if;
  if v !~* '^[a-z][a-z0-9+.-]*:' then v := 'https://' || v; end if;
  return v;
end $$;

create or replace function private.clean_price(p text) returns numeric
language plpgsql immutable as $$
declare v text := regexp_replace(coalesce(p, ''), '[^0-9.,]', '', 'g');
begin
  if v = '' then return null; end if;
  if position('.' in v) = 0 then v := replace(v, ',', '.');   -- "24,99" (French)
  else v := replace(v, ',', '');                                  -- "1,299.99"
  end if;
  return least(round(v::numeric, 2), 99999999.99);
exception when others then
  return null;
end $$;

create or replace function private.clean_priority(p text) returns text
language sql immutable as $$
  select case lower(btrim(coalesce(p, '')))
    when 'high' then 'high' when 'h' then 'high' when '1' then 'high'
    when 'haute' then 'high' when 'élevée' then 'high' when 'elevee' then 'high'
    when 'medium' then 'medium' when 'med' then 'medium' when 'm' then 'medium' when '2' then 'medium'
    when 'moyenne' then 'medium'
    when 'low' then 'low' when 'l' then 'low' when '3' then 'low' when 'basse' then 'low'
    else null end;
$$;

create or replace function private.current_season() returns int
language sql stable as $$
  select season from public.settings where id = 1;
$$;

create or replace function private.check_passcode(p text) returns void
language plpgsql as $$
declare h text;
begin
  select passcode_hash into h from public.settings where id = 1;
  if h is null then raise exception 'E_NO_PASSCODE'; end if;
  if p is null or extensions.crypt(lower(btrim(p)), h) <> h then
    perform pg_sleep(1);  -- slow down guessing
    raise exception 'E_BAD_PASSCODE';
  end if;
end $$;

create or replace function private.member_from_token(p_token text) returns bigint
language plpgsql as $$
declare mid bigint;
begin
  select member_id into mid from public.sessions
   where token = p_token and expires_at > now();
  if mid is null then raise exception 'E_SESSION'; end if;
  return mid;
end $$;

create or replace function private.require_admin(p_token text) returns bigint
language plpgsql as $$
declare mid bigint := private.member_from_token(p_token);
begin
  if not exists (select 1 from public.members where id = mid and is_admin) then
    raise exception 'E_NOT_ADMIN';
  end if;
  return mid;
end $$;

create or replace function private.new_session(p_member_id bigint) returns jsonb
language plpgsql as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex');
        m public.members;
begin
  delete from public.sessions where expires_at < now();
  insert into public.sessions (token, member_id, expires_at)
  values (tok, p_member_id, now() + interval '365 days');
  select * into m from public.members where id = p_member_id;
  return jsonb_build_object(
    'token', tok,
    'member', jsonb_build_object('id', m.id, 'name', m.name, 'is_admin', m.is_admin));
end $$;

-- The owner's view of their own list: NO claim info, NO removed items.
create or replace function private.my_list(p_owner bigint) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'name', i.name, 'link', i.link, 'price', i.price,
           'size_color', i.size_color, 'priority', i.priority, 'notes', i.notes)
         order by case i.priority when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
                  i.created_at, i.id), '[]'::jsonb)
    from public.items i
   where i.owner_id = p_owner
     and i.season = private.current_season()
     and not i.removed_by_owner;
$$;

-- Owner removes an item: delete if unclaimed, otherwise hide it from the owner.
create or replace function private.remove_item(p_item_id bigint) returns void
language plpgsql as $$
begin
  perform 1 from public.items where id = p_item_id for update;
  if exists (select 1 from public.claims where item_id = p_item_id) then
    update public.items set removed_by_owner = true, updated_at = now() where id = p_item_id;
  else
    delete from public.items where id = p_item_id;
  end if;
end $$;

-- Write the editable fields of an item from a JSON object. Clears removed_by_owner
-- (re-adding a removed item restores it and keeps its claim).
create or replace function private.write_item(p_item_id bigint, p jsonb) returns void
language plpgsql as $$
declare n text := private.clean_text(p->>'name', 200);
begin
  update public.items set
    name             = n,
    name_normalized  = private.normalize(n),
    link             = private.clean_link(p->>'link'),
    price            = private.clean_price(p->>'price'),
    size_color       = private.clean_text(p->>'size_color', 200),
    priority         = private.clean_priority(p->>'priority'),
    notes            = private.clean_notes(p->>'notes'),
    removed_by_owner = false,
    updated_at       = now()
  where id = p_item_id;
end $$;

create or replace function private.insert_item(p_owner bigint, p jsonb) returns bigint
language plpgsql as $$
declare n text := private.clean_text(p->>'name', 200);
        new_id bigint;
begin
  insert into public.items (owner_id, season, name, name_normalized, link, price,
                            size_color, priority, notes)
  values (p_owner, private.current_season(), n, private.normalize(n),
          private.clean_link(p->>'link'), private.clean_price(p->>'price'),
          private.clean_text(p->>'size_color', 200), private.clean_priority(p->>'priority'),
          private.clean_notes(p->>'notes'))
  returning id into new_id;
  return new_id;
end $$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Login
-- ---------------------------------------------------------------------

-- Returns the list of names for the dropdown (passcode required).
create or replace function public.list_members(p_passcode text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform private.check_passcode(p_passcode);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'has_pin', pin_hash is not null)
                     order by lower(name))
      from members), '[]'::jsonb);
end $$;

-- Wrong PIN returns {error: ...} instead of raising, so the failed-attempt
-- counter is saved (an exception would roll it back).
create or replace function public.login(p_passcode text, p_member_id bigint, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare m members;
        tries int;
begin
  perform private.check_passcode(p_passcode);
  select * into m from members where id = p_member_id for update;
  if not found then raise exception 'E_NO_MEMBER'; end if;
  if m.pin_hash is null then return jsonb_build_object('error', 'E_NO_PIN'); end if;
  if m.locked_until is not null and m.locked_until > now() then
    return jsonb_build_object('error', 'E_LOCKED',
      'minutes', ceil(extract(epoch from (m.locked_until - now())) / 60));
  end if;
  if p_pin is null or crypt(p_pin, m.pin_hash) <> m.pin_hash then
    tries := m.failed_attempts + 1;
    if tries >= 5 then
      update members set failed_attempts = 0, locked_until = now() + interval '10 minutes'
       where id = m.id;
      return jsonb_build_object('error', 'E_LOCKED', 'minutes', 10);
    end if;
    update members set failed_attempts = tries where id = m.id;
    return jsonb_build_object('error', 'E_BAD_PIN', 'attempts_left', 5 - tries);
  end if;
  update members set failed_attempts = 0, locked_until = null where id = m.id;
  return private.new_session(m.id);
end $$;

-- First login for a person: set their PIN (only allowed when none is set).
create or replace function public.set_pin(p_passcode text, p_member_id bigint, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform private.check_passcode(p_passcode);
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'E_PIN_FORMAT'; end if;
  update members set pin_hash = crypt(p_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null
   where id = p_member_id and pin_hash is null;
  if not found then
    if exists (select 1 from members where id = p_member_id) then
      raise exception 'E_PIN_ALREADY_SET';
    end if;
    raise exception 'E_NO_MEMBER';
  end if;
  return private.new_session(p_member_id);
end $$;

create or replace function public.logout(p_token text) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  delete from sessions where token = p_token;
$$;

-- Validates a saved session and returns fresh member info.
create or replace function public.get_session(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare mid bigint := private.member_from_token(p_token);
        m members;
begin
  select * into m from members where id = mid;
  return jsonb_build_object('member',
    jsonb_build_object('id', m.id, 'name', m.name, 'is_admin', m.is_admin));
end $$;

-- ---------------------------------------------------------------------
-- Members and own list
-- ---------------------------------------------------------------------

-- Everyone except the caller, with item counts (for the Family Lists page).
create or replace function public.get_members(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
        s int := private.current_season();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'name', m.name,
             'item_count', (select count(*) from items i
                             where i.owner_id = m.id and i.season = s and not i.removed_by_owner),
             'claimed_count', (select count(*) from items i join claims c on c.item_id = i.id
                                where i.owner_id = m.id and i.season = s and not i.removed_by_owner))
           order by lower(m.name))
      from members m where m.id <> me), '[]'::jsonb);
end $$;

create or replace function public.get_my_list(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  return private.my_list(private.member_from_token(p_token));
end $$;

-- Re-upload merge (requirements section 6). Returns the owner's new list.
create or replace function public.upsert_my_list(p_token text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
        s int := private.current_season();
        r jsonb;
        n text;
        existing_id bigint;
        kept bigint[] := '{}';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'E_BAD_INPUT'; end if;
  if jsonb_array_length(p_items) > 300 then raise exception 'E_TOO_MANY'; end if;

  -- Lock this owner's items so a claim can't slip in between check and delete.
  perform 1 from items where owner_id = me and season = s for update;

  for r in select value from jsonb_array_elements(p_items) loop
    n := private.clean_text(r->>'name', 200);
    continue when n is null;

    select id into existing_id from items
     where owner_id = me and season = s and name_normalized = private.normalize(n);

    if existing_id is not null then
      continue when existing_id = any(kept);          -- duplicate row in file: first one wins
      perform private.write_item(existing_id, r);     -- update fields, keep claim, un-remove
    else
      existing_id := private.insert_item(me, r);
    end if;
    kept := kept || existing_id;
  end loop;

  -- Items not in the file: delete if unclaimed, hide from owner if claimed.
  delete from items i
   where i.owner_id = me and i.season = s and not (i.id = any(kept))
     and not exists (select 1 from claims c where c.item_id = i.id);
  update items set removed_by_owner = true, updated_at = now()
   where owner_id = me and season = s and not (id = any(kept)) and not removed_by_owner;

  return private.my_list(me);
end $$;

create or replace function public.add_item(p_token text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
        n text := private.clean_text(p_item->>'name', 200);
        ex items;
begin
  if n is null then raise exception 'E_NAME_REQUIRED'; end if;
  if (select count(*) from items where owner_id = me and season = private.current_season()) >= 300 then
    raise exception 'E_TOO_MANY';
  end if;
  select * into ex from items
   where owner_id = me and season = private.current_season() and name_normalized = private.normalize(n)
   for update;
  if found then
    if not ex.removed_by_owner then raise exception 'E_DUPLICATE'; end if;
    perform private.write_item(ex.id, p_item);       -- re-add: restore, keep claim
  else
    perform private.insert_item(me, p_item);
  end if;
  return private.my_list(me);
end $$;

create or replace function public.update_item(p_token text, p_item_id bigint, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
        s int := private.current_season();
        n text := private.clean_text(p_item->>'name', 200);
        cur items;
        other items;
begin
  if n is null then raise exception 'E_NAME_REQUIRED'; end if;
  select * into cur from items
   where id = p_item_id and owner_id = me and season = s and not removed_by_owner
   for update;
  if not found then raise exception 'E_NOT_FOUND'; end if;

  if private.normalize(n) <> cur.name_normalized then
    select * into other from items
     where owner_id = me and season = s and name_normalized = private.normalize(n) and id <> cur.id
     for update;
    if found then
      if not other.removed_by_owner then raise exception 'E_DUPLICATE'; end if;
      -- Renamed to an item they had removed earlier: treat as re-adding that item
      -- (restore it, keep its claim) and removing the one being edited.
      perform private.write_item(other.id, p_item);
      perform private.remove_item(cur.id);
      return private.my_list(me);
    end if;
  end if;

  perform private.write_item(cur.id, p_item);        -- claim untouched
  return private.my_list(me);
end $$;

create or replace function public.delete_item(p_token text, p_item_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
begin
  if not exists (select 1 from items where id = p_item_id and owner_id = me
                  and season = private.current_season() and not removed_by_owner) then
    raise exception 'E_NOT_FOUND';
  end if;
  perform private.remove_item(p_item_id);
  return private.my_list(me);
end $$;

-- ---------------------------------------------------------------------
-- Family lists and claims
-- ---------------------------------------------------------------------

create or replace function public.get_family_list(p_token text, p_target_member_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
        target members;
begin
  if p_target_member_id = me then raise exception 'E_OWN_LIST'; end if;
  select * into target from members where id = p_target_member_id;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  return jsonb_build_object(
    'member', jsonb_build_object('id', target.id, 'name', target.name),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'name', i.name, 'link', i.link, 'price', i.price,
               'size_color', i.size_color, 'priority', i.priority, 'notes', i.notes,
               'removed', i.removed_by_owner,
               'claimed', c.id is not null,
               'claimed_by_me', c.claimer_id is not distinct from me,
               'claimer_name', cm.name)
             order by case i.priority when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
                      i.created_at, i.id)
        from items i
        left join claims c   on c.item_id = i.id
        left join members cm on cm.id = c.claimer_id
       where i.owner_id = target.id
         and i.season = private.current_season()
         and (not i.removed_by_owner or c.claimer_id = me)), '[]'::jsonb));
end $$;

create or replace function public.claim_item(p_token text, p_item_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
        it items;
        new_claim bigint;
        who text;
        who_id bigint;
begin
  -- FOR SHARE blocks while the owner is editing/removing this item.
  select * into it from items where id = p_item_id and season = private.current_season() for share;
  if not found or it.removed_by_owner then raise exception 'E_NOT_FOUND'; end if;
  if it.owner_id = me then raise exception 'E_OWN_ITEM'; end if;

  -- The unique index on claims.item_id makes this atomic: exactly one insert wins.
  insert into claims (item_id, claimer_id) values (p_item_id, me)
  on conflict (item_id) do nothing
  returning id into new_claim;

  if new_claim is null then
    select m.name, m.id into who, who_id
      from claims c join members m on m.id = c.claimer_id where c.item_id = p_item_id;
    return jsonb_build_object('error', 'E_ALREADY_CLAIMED',
                              'claimer_name', who, 'claimed_by_me', who_id = me);
  end if;
  return jsonb_build_object('ok', true, 'claim_id', new_claim);
end $$;

create or replace function public.unclaim_item(p_token text, p_item_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
begin
  delete from claims where item_id = p_item_id and claimer_id = me;
  if not found then raise exception 'E_NOT_YOUR_CLAIM'; end if;
  -- An item the owner removed only lived on for this claim: it can go now.
  delete from items where id = p_item_id and removed_by_owner;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.get_my_claims(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'claim_id', c.id, 'item_id', i.id, 'bought', c.bought,
             'owner_id', o.id, 'owner_name', o.name,
             'name', i.name, 'link', i.link, 'price', i.price,
             'size_color', i.size_color, 'priority', i.priority, 'notes', i.notes,
             'removed', i.removed_by_owner)
           order by lower(o.name), c.created_at)
      from claims c
      join items i   on i.id = c.item_id
      join members o on o.id = i.owner_id
     where c.claimer_id = me and i.season = private.current_season()), '[]'::jsonb);
end $$;

create or replace function public.set_bought(p_token text, p_claim_id bigint, p_bought boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.member_from_token(p_token);
begin
  update claims set bought = coalesce(p_bought, false) where id = p_claim_id and claimer_id = me;
  if not found then raise exception 'E_NOT_YOUR_CLAIM'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------

create or replace function public.admin_list_members(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.require_admin(p_token);
        s int := private.current_season();
begin
  return jsonb_build_object(
    'season', s,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.name, 'is_admin', m.is_admin, 'is_me', m.id = me,
               'has_pin', m.pin_hash is not null,
               'locked', m.locked_until is not null and m.locked_until > now(),
               'item_count', (select count(*) from items i
                               where i.owner_id = m.id and i.season = s and not i.removed_by_owner))
             order by lower(m.name))
        from members m), '[]'::jsonb));
end $$;

create or replace function public.admin_add_member(p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n text := private.clean_text(p_name, 60);
begin
  perform private.require_admin(p_token);
  if n is null then raise exception 'E_NAME_REQUIRED'; end if;
  insert into members (name) values (n);
  return public.admin_list_members(p_token);
exception when unique_violation then
  raise exception 'E_NAME_TAKEN';
end $$;

create or replace function public.admin_rename_member(p_token text, p_member_id bigint, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n text := private.clean_text(p_name, 60);
begin
  perform private.require_admin(p_token);
  if n is null then raise exception 'E_NAME_REQUIRED'; end if;
  update members set name = n where id = p_member_id;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  return public.admin_list_members(p_token);
exception when unique_violation then
  raise exception 'E_NAME_TAKEN';
end $$;

create or replace function public.admin_remove_member(p_token text, p_member_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.require_admin(p_token);
begin
  if p_member_id = me then raise exception 'E_SELF'; end if;
  -- Items other people removed that only survived for this person's claim.
  delete from items i using claims c
   where c.item_id = i.id and c.claimer_id = p_member_id and i.removed_by_owner;
  delete from members where id = p_member_id;   -- cascades: their items, claims, sessions
  if not found then raise exception 'E_NOT_FOUND'; end if;
  return public.admin_list_members(p_token);
end $$;

create or replace function public.admin_reset_pin(p_token text, p_member_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform private.require_admin(p_token);
  update members set pin_hash = null, failed_attempts = 0, locked_until = null where id = p_member_id;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  delete from sessions where member_id = p_member_id;   -- log them out everywhere
  return public.admin_list_members(p_token);
end $$;

create or replace function public.admin_set_admin(p_token text, p_member_id bigint, p_is_admin boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare me bigint := private.require_admin(p_token);
begin
  if p_member_id = me and not p_is_admin then raise exception 'E_SELF'; end if;
  update members set is_admin = coalesce(p_is_admin, false) where id = p_member_id;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  return public.admin_list_members(p_token);
end $$;

create or replace function public.admin_set_passcode(p_token text, p_passcode text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform private.require_admin(p_token);
  if p_passcode is null or length(btrim(p_passcode)) < 4 then raise exception 'E_PASSCODE_SHORT'; end if;
  update settings set passcode_hash = crypt(lower(btrim(p_passcode)), gen_salt('bf')) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_clear_claim(p_token text, p_item_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform private.require_admin(p_token);
  delete from claims where item_id = p_item_id;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  delete from items where id = p_item_id and removed_by_owner;
  return jsonb_build_object('ok', true);
end $$;

-- p_mode = 'archive': switch to a new season; old lists and claims are kept
--                     in the database but hidden (switching back restores them).
-- p_mode = 'wipe':    permanently delete every list and claim, then switch season.
create or replace function public.admin_new_year(p_token text, p_mode text, p_season int) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform private.require_admin(p_token);
  if p_season is null or p_season < 2000 or p_season > 2200 then raise exception 'E_BAD_SEASON'; end if;
  if p_mode = 'archive' then
    if p_season = private.current_season() then raise exception 'E_BAD_SEASON'; end if;
  elsif p_mode = 'wipe' then
    delete from items;   -- cascades to claims
  else
    raise exception 'E_BAD_INPUT';
  end if;
  update settings set season = p_season where id = 1;
  return public.admin_list_members(p_token);
end $$;

-- Only the API functions above are callable by the website.
revoke execute on all functions in schema public from public;
grant  execute on all functions in schema public to anon, authenticated;

-- ---------------------------------------------------------------------
-- Seed data — EDIT BEFORE RUNNING
-- ---------------------------------------------------------------------

-- Family passcode. Change 'change-me' to the passcode you will text the family.
-- (Not case-sensitive. You can also change it later on the Admin page.)
insert into public.settings (id, passcode_hash, season)
values (1, extensions.crypt(lower('change-me'), extensions.gen_salt('bf')), extract(year from now())::int)
on conflict (id) do nothing;

-- Admin account. Roy sets his own PIN the first time he logs in.
insert into public.members (name, is_admin) values ('Roy', true)
on conflict do nothing;

-- Family members. Add one line per person (or add them later on the Admin page).
insert into public.members (name) values
  ('Example Person')   -- <-- replace with real names, e.g. ('Marie'), ('Paul'), ...
on conflict do nothing;
