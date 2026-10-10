-- 2026-10-11-fix-delete-account.sql
--
-- Bug: "Delete my account" appeared to do nothing for a customer who already had a
-- member row. The frontend handler is correct (it calls rpc('delete_me') and then
-- signs out), and public.delete_me() existed and worked for an account that had no
-- member row. The failure was inside the RPC: it deleted the auth.users row directly
-- and trusted every dependent row to cascade. In the live database the
-- members.user_id -> auth.users foreign key has drifted from schema.sql (it is NOT
-- on delete cascade there), so deleting the auth user raised a foreign-key violation
-- and the account was never removed.
--
-- Fix: delete the caller's own dependent rows and member row(s) explicitly before
-- removing the auth user, so this works no matter how the live foreign keys are
-- declared. Everything is still scoped to a single uid, so a customer can only ever
-- delete their own data.

-- Shared hard-delete helper: used by both delete_me and delete_member so the two
-- paths can never drift apart again.
create or replace function public._delete_user_data(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  for mid in select id from members where user_id = p_uid loop
    -- messages arrived later and may be absent in older databases; message rows point at offers.
    if to_regclass('public.messages') is not null then
      execute 'update messages set offer_id = null where offer_id in (select id from offers where member_id = $1)' using mid;
      execute 'delete from messages where member_id = $1' using mid;
    end if;
    delete from offers where member_id = mid;
    delete from visits where member_id = mid;
    -- other members may name this member as their referrer
    update members set referred_by = null where referred_by = mid;
    delete from members where id = mid;
  end loop;
  delete from auth.users where id = p_uid;
end $$;

-- Internal helper only: clients must never be able to name an arbitrary uid.
revoke execute on function public._delete_user_data(uuid) from public, anon, authenticated;

-- Customer deletes their own account.
create or replace function public.delete_me() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from businesses where owner_id = uid) then raise exception 'Owner accounts cannot be deleted here'; end if;
  perform public._delete_user_data(uid);
end $$;

-- Owner deletes one of their customers (removes that person's account and memberships).
create or replace function public.delete_member(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select m.user_id into uid from members m join businesses b on b.id = m.business_id
   where m.id = p_member and b.owner_id = auth.uid();
  if uid is null then raise exception 'Not allowed'; end if;
  if exists (select 1 from businesses where owner_id = uid) then raise exception 'Not allowed'; end if;
  perform public._delete_user_data(uid);
end $$;

grant execute on function public.delete_me() to authenticated;
grant execute on function public.delete_member(uuid) to authenticated;
