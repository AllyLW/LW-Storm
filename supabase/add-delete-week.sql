-- Adds the ability to delete a week (admin or officer).
-- Run this whole block in Supabase -> SQL Editor -> Run.

create or replace function delete_week(pin text, w_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare role text;
begin
  role := check_pin(pin);
  if role is null then raise exception 'bad pin'; end if;
  delete from weeks where id = w_id;
end; $$;
grant execute on function delete_week(text, uuid) to anon, authenticated;
