-- Adds a "reopen" capability to save_week so a confirmed week can be unlocked.
-- Run this whole block in Supabase -> SQL Editor -> Run.

-- Drop the old signature first (its parameter list changed).
drop function if exists save_week(text, uuid, text, int, jsonb, jsonb, bool);

create or replace function save_week(
  pin text, w_id uuid, w_label text, w_index int,
  w_avail jsonb, w_board jsonb, w_confirm bool, w_reopen bool default false
)
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
      -- reopen clears the lock; confirm sets it; otherwise leave as-is
      confirmed_at = case
        when w_reopen then null
        when w_confirm then now()
        else confirmed_at
      end
      where id = w_id returning id into rid;
  end if;
  return rid;
end; $$;
grant execute on function save_week(text, uuid, text, int, jsonb, jsonb, bool, bool) to anon, authenticated;
