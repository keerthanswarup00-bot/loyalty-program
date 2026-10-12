-- Royalty SECURITY DEFINER runtime audit.
-- Read-only: catalog checks only; raises on unsafe ACL/search_path state.
-- Run against a non-production database first, then the intended deployment's SQL editor
-- when explicitly approved. It does not change schema or application data.

with definer_functions as (
  select p.oid,
         n.nspname,
         p.proname,
         pg_get_function_identity_arguments(p.oid) as identity_args,
         p.proowner,
         p.proconfig,
         coalesce(p.proacl, acldefault('f', p.proowner)) as effective_acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
)
select format('%I.%I(%s)', nspname, proname, identity_args) as function_signature,
       pg_get_userbyid(proowner) as owner,
       (select split_part(cfg, '=', 2)
          from unnest(coalesce(proconfig, array[]::text[])) cfg
         where cfg like 'search_path=%'
         limit 1) as search_path,
       coalesce((select string_agg(
           case when a.grantee = 0 then 'PUBLIC'
                else coalesce(r.rolname, a.grantee::text) end || ':' || a.privilege_type,
           ', ' order by a.grantee, a.privilege_type)
         from aclexplode(effective_acl) a
         left join pg_roles r on r.oid = a.grantee
        where a.privilege_type = 'EXECUTE'), '(none)') as execute_acl,
       has_function_privilege('anon', oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_can_execute
  from definer_functions
 order by function_signature;

do $audit$
declare
  f record;
  cfg text;
  path_item text;
  schema_name text;
  sig text;
  args text;
  allowed_anon boolean;
  allowed_authenticated boolean;
begin
  for f in
    select p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) as identity_args,
           p.proowner, p.proconfig,
           coalesce(p.proacl, acldefault('f', p.proowner)) as effective_acl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    cfg := null;
    select split_part(c, '=', 2) into cfg
      from unnest(coalesce(f.proconfig, array[]::text[])) c
     where c like 'search_path=%'
     limit 1;

    sig := format('%I.%I(%s)', f.nspname, f.proname, f.identity_args);
    if cfg is null or btrim(cfg) = '' then
      raise exception 'SECURITY DEFINER function % has no function-level search_path', sig;
    end if;
    if cfg ~* '(^|[,[:space:]])(\$user|pg_temp(_[0-9]+)?)([,[:space:]]|$)' then
      raise exception 'SECURITY DEFINER function % uses unsafe dynamic/temp search_path: %', sig, cfg;
    end if;

    for path_item in
      select btrim(x, ' "') from regexp_split_to_table(cfg, ',') as x
    loop
      schema_name := replace(path_item, '"', '');
      if schema_name = '' or schema_name like '$user%' then
        raise exception 'SECURITY DEFINER function % has invalid search_path entry: %', sig, path_item;
      end if;
      if exists (select 1 from pg_namespace ns where ns.nspname = schema_name)
         and (has_schema_privilege('anon', schema_name, 'CREATE')
           or has_schema_privilege('authenticated', schema_name, 'CREATE')) then
        raise exception 'Untrusted role can CREATE in schema % used by SECURITY DEFINER function %', schema_name, sig;
      end if;
    end loop;

    if exists (
      select 1 from aclexplode(f.effective_acl) a
       where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC retains EXECUTE on SECURITY DEFINER function %', sig;
    end if;

    args := regexp_replace(f.identity_args, '\s+', '', 'g');
    allowed_anon := (f.proname, args) in (
      ('get_business', 'text'),
      ('daily_public', 'text'),
      ('get_menu', 'text'),
      ('submit_lead', 'text,text,text,text'),
      ('resolve_host', 'text')
    );
    allowed_authenticated := (f.proname, args) in (
      ('_is_platform_admin', ''),
      ('get_business', 'text'),
      ('daily_public', 'text'),
      ('daily_status', 'text'),
      ('play_daily', 'text'),
      ('join_business', 'text,text,text,date,boolean,text,text'),
      ('import_members', 'text,json'),
      ('my_card', 'text'),
      ('add_stamp', 'text,text'),
      ('claim_reward', 'text'),
      ('redeem_code', 'text,text,text,boolean'),
      ('delete_member', 'uuid'),
      ('delete_me', ''),
      ('reset_member_password', 'uuid,text'),
      ('set_wa_optout', 'uuid,boolean'),
      ('set_my_wa_optout', 'text,boolean'),
      ('winback_message', 'text,uuid'),
      ('get_menu', 'text'),
      ('save_menu_category', 'text,uuid,text'),
      ('delete_menu_category', 'uuid'),
      ('reorder_menu_categories', 'text,uuid[]'),
      ('set_category_items', 'text,uuid,uuid[]'),
      ('save_menu_item', 'text,uuid,text,text,text,text,boolean,uuid'),
      ('delete_menu_item', 'uuid'),
      ('submit_lead', 'text,text,text,text'),
      ('analytics', 'text,integer'),
      ('resolve_host', 'text'),
      ('platform_overview', ''),
      ('platform_create_business', 'text,text,text,text,text'),
      ('platform_set_owner', 'text,text'),
      ('platform_set_domain', 'text,text'),
      ('platform_remove_domain', 'text'),
      ('platform_support_open', 'text'),
      ('platform_log', 'text,text,jsonb'),
      ('platform_audit_list', 'text,integer'),
      ('my_support_log', 'text'),
      ('platform_save_meta', 'text,text,text,text,date'),
      ('platform_find_member', 'text')
    );

    if has_function_privilege('anon', f.oid, 'EXECUTE') and not allowed_anon then
      raise exception 'Unexpected anon EXECUTE privilege on SECURITY DEFINER function %', sig;
    end if;
    if has_function_privilege('authenticated', f.oid, 'EXECUTE') and not allowed_authenticated then
      raise exception 'Unexpected authenticated EXECUTE privilege on SECURITY DEFINER function %', sig;
    end if;
  end loop;
end
$audit$;
