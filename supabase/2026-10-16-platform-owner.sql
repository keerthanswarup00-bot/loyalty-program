-- Platform admin: reset a shop owner's login email and/or password.
-- Safe to re-run. Run this in the Supabase SQL Editor (also fine to run after schema.sql).
--
-- Why: an owner can lose access to their login email or forget their password and not be able to
-- receive the emailed reset link. A platform admin can set a new login email and hand over a
-- temporary password. Every call signs the owner out everywhere, because the current session key
-- (not just the password) can no longer be trusted.
--
-- This is an overload of the existing public.platform_set_owner(text, text) (which hands a shop to
-- an existing account). PostgREST picks the right one from the argument names, so both keep working.
-- Guard is the same one the platform page uses: public._is_platform_admin().

create or replace function public.platform_set_owner(p_business uuid, p_email text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions, auth as $$
declare uid uuid; em text := lower(trim(coalesce(p_email, '')));
begin
  if not public._is_platform_admin() then raise exception 'Not allowed'; end if;

  select owner_id into uid from businesses where id = p_business;
  if uid is null then raise exception 'This shop has no owner account'; end if;

  if em <> '' then
    if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
    if exists (select 1 from auth.users where lower(email) = em and id <> uid) then
      raise exception 'That email is already used by another account';
    end if;
    update auth.users set email = em, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
    update auth.identities
       set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(em)), provider_id = em, updated_at = now()
     where user_id = uid and provider = 'email';
  end if;

  if coalesce(p_password, '') <> '' then
    if length(p_password) < 8 then raise exception 'Password must be at least 8 characters'; end if;
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = uid;
  end if;

  -- sign the owner out everywhere so old sessions stop working
  delete from auth.sessions where user_id = uid;
  return json_build_object('ok', true);
end $$;

revoke execute on function public.platform_set_owner(uuid, text, text) from public, anon, authenticated;
grant execute on function public.platform_set_owner(uuid, text, text) to authenticated;
