-- ===================================================================
-- Storm Events schema.  Paste the whole file into Supabase -> SQL editor -> Run.
-- This is a NEW Supabase project, separate from VIP Train.

create extension if not exists pgcrypto with schema extensions;

-- ---------- settings (single row) ----------
create table if not exists settings (
  id               int primary key default 1 check (id = 1),
  alliance         text not null default 'Alliance',
  core_size        int  not null default 34,
  fairness_window  int  not null default 8,   -- weeks
  admin_hash       text not null,
  officer_hash     text not null
);

-- ---------- members ----------
-- Core is NOT stored: it's derived as the top `core_size` active by THP,
-- so it can never go stale. THP is edited inline or bulk-pasted.
create table if not exists members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  thp        bigint not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- weeks ----------
-- One row per event week. `availability` is the entered vote grid,
-- `board` is the confirmed assignment (null until R4 confirms).
--   availability: { "<member_id>": { "CSB": bool, "DSB": bool } }
--   board:        the engine output, possibly hand-edited by R4
create table if not exists weeks (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,                 -- e.g. "2026-W37" or "Wk of Sep 11"
  week_index    int  not null,                 -- monotonically increasing, drives fairness recency
  availability  jsonb not null default '{}'::jsonb,
  board         jsonb,                          -- null = not yet confirmed
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists weeks_label_key on weeks(label);

insert into settings (id, admin_hash, officer_hash)
values (1, crypt('Adminpoxl01', gen_salt('bf')), crypt('R4poxl02', gen_salt('bf')))
on conflict (id) do nothing;

-- ---------- read access: everyone ----------
alter table settings enable row level security;
alter table members  enable row level security;
alter table weeks    enable row level security;

drop policy if exists "public read members" on members;
drop policy if exists "public read weeks"   on weeks;
create policy "public read members" on members for select using (true);
create policy "public read weeks"   on weeks   for select using (true);
-- settings hashes stay private; expose only the safe columns via a view.

create or replace view public_settings as
  select alliance, core_size, fairness_window from settings where id = 1;
grant select on public_settings to anon, authenticated;

-- ---------- PIN check ----------
-- Returns 'admin', 'officer', or null. SECURITY DEFINER so it can read hashes.
create or replace function check_pin(pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare s settings%rowtype;
begin
  select * into s from settings where id = 1;
  if s.admin_hash = crypt(pin, s.admin_hash) then return 'admin';
  elsif s.officer_hash = crypt(pin, s.officer_hash) then return 'officer';
  else return null; end if;
end;
$$;
grant execute on function check_pin(text) to anon, authenticated;

-- ---------- write RPCs (all PIN-gated) ----------
-- Every write goes through a function that re-checks the PIN, so the anon
-- key can't be used to write directly. R4 unlocks with admin/officer PIN.

-- upsert a single member (inline edit / add)
create or replace function upsert_member(pin text, m_id uuid, m_name text, m_thp bigint, m_active bool)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare role text; rid uuid;
begin
  role := check_pin(pin);
  if role is null then raise exception 'bad pin'; end if;
  if m_id is null then
    insert into members(name, thp, active) values (m_name, m_thp, m_active) returning id into rid;
  else
    update members set name = m_name, thp = m_thp, active = m_active where id = m_id returning id into rid;
  end if;
  return rid;
end; $$;
grant execute on function upsert_member(text, uuid, text, bigint, bool) to anon, authenticated;

-- bulk paste: array of { name, thp }. Matches existing members by name
-- (case-insensitive), updates THP; inserts the rest. Returns count touched.
create or replace function bulk_upsert_members(pin text, rows jsonb)
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare role text; r jsonb; n int := 0; existing uuid;
begin
  role := check_pin(pin);
  if role is null then raise exception 'bad pin'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    select id into existing from members
      where lower(name) = lower(r->>'name') limit 1;
    if existing is null then
      insert into members(name, thp) values (r->>'name', (r->>'thp')::bigint);
    else
      update members set thp = (r->>'thp')::bigint where id = existing;
    end if;
    n := n + 1;
  end loop;
  return n;
end; $$;
grant execute on function bulk_upsert_members(text, jsonb) to anon, authenticated;

create or replace function delete_member(pin text, m_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare role text;
begin
  role := check_pin(pin);
  if role is null then raise exception 'bad pin'; end if;
  delete from members where id = m_id;
end; $$;
grant execute on function delete_member(text, uuid) to anon, authenticated;

-- create or update a week's availability + board
create or replace function save_week(pin text, w_id uuid, w_label text, w_index int, w_avail jsonb, w_board jsonb, w_confirm bool, w_reopen bool default false)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare role text; rid uuid;
begin
  role := check_pin(pin);
  if role is null then raise exception 'bad pin'; end if;
  if w_id is null then
    insert into weeks(label, week_index, availability, board, confirmed_at)
      values (w_label, w_index, coalesce(w_avail,'{}'::jsonb), w_board,
              case when w_confirm then now() else null end)
      returning id into rid;
  else
    update weeks set
      label = w_label,
      week_index = w_index,
      availability = coalesce(w_avail, availability),
      board = coalesce(w_board, board),
      confirmed_at = case when w_reopen then null when w_confirm then now() else confirmed_at end
      where id = w_id returning id into rid;
  end if;
  return rid;
end; $$;
grant execute on function save_week(text, uuid, text, int, jsonb, jsonb, bool, bool) to anon, authenticated;

create or replace function update_settings(pin text, s_alliance text, s_core int, s_window int)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare role text;
begin
  role := check_pin(pin);
  if role is null then raise exception 'bad pin'; end if;
  if role <> 'admin' then raise exception 'admin only'; end if;
  update settings set alliance = s_alliance, core_size = s_core, fairness_window = s_window where id = 1;
end; $$;
grant execute on function update_settings(text, text, int, int) to anon, authenticated;
