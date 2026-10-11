-- 1) Faster stamping: add_stamp now returns the customer's fresh card in the same call,
--    so the app needs one round trip (not three) before the stamp animation can play.
-- 2) Menu categories: owner makes as many categories as they like and puts items in them.
-- Safe to run more than once. Run it in the Supabase SQL editor.

-- ---------- 1) add_stamp returns the card ----------
create or replace function public.add_stamp(p_slug text, p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; wait int; r json;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into b from businesses where slug = p_slug;
  if not found or b.scan_token <> coalesce(p_token, '') then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into m from members where business_id = b.id and user_id = auth.uid() for update;
  if not found then return json_build_object('ok', false, 'error', 'nomember'); end if;
  if m.last_stamp is not null then
    wait := ceil(extract(epoch from (m.last_stamp + make_interval(mins => b.cooldown_min) - now())))::int;
    if wait > 0 then return json_build_object('ok', false, 'error', 'cooldown', 'wait', wait); end if;
  end if;
  r := _do_stamp(m.id);
  return json_build_object('ok', true, 'stamps', r->'stamps', 'surprise', r->'surprise', 'lost', r->'lost',
                           'card', public.my_card(p_slug));
end $$;

-- ---------- 2) Menu categories ----------
create table if not exists public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists menu_categories_biz_name on public.menu_categories (business_id, lower(name));
create index if not exists menu_categories_biz_sort on public.menu_categories (business_id, sort, created_at);

alter table public.menu_items add column if not exists category_id uuid references public.menu_categories(id) on delete set null;
create index if not exists menu_items_cat on public.menu_items (category_id);

alter table public.menu_categories enable row level security;
revoke all on public.menu_categories from anon, authenticated;
grant select on public.menu_categories to authenticated;
drop policy if exists menucat_owner_select on public.menu_categories;
create policy menucat_owner_select on public.menu_categories for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- What customers see: the categories (in the owner's order) and the available items.
create or replace function public.get_menu(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'categories', coalesce((select json_agg(json_build_object('id', c.id, 'name', c.name) order by c.sort, c.created_at)
                            from menu_categories c where c.business_id = b.id), '[]'::json),
    'items', coalesce((select json_agg(json_build_object(
                'id', i.id, 'title', i.title, 'description', i.description, 'price', i.price,
                'image_url', i.image_url, 'category_id', i.category_id) order by i.sort, i.created_at)
              from menu_items i where i.business_id = b.id and i.available), '[]'::json))
  from businesses b where b.slug = p_slug;
$$;

-- Owner: add (p_id null) or rename a category. Returns its id.
create or replace function public.save_menu_category(p_slug text, p_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b businesses; n text := trim(coalesce(p_name, '')); r uuid;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  if char_length(n) < 1 or char_length(n) > 40 then raise exception 'Give the category a name (up to 40 characters)'; end if;
  if exists (select 1 from menu_categories where business_id = b.id and lower(name) = lower(n) and (p_id is null or id <> p_id)) then
    raise exception 'You already have a category with that name';
  end if;
  if p_id is null then
    if (select count(*) from menu_categories where business_id = b.id) >= 60 then raise exception 'Too many categories (60 max)'; end if;
    insert into menu_categories (business_id, name, sort)
    values (b.id, n, coalesce((select max(sort) from menu_categories where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update menu_categories set name = n where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Category not found'; end if;
  end if;
  return r;
end $$;

-- Owner: delete a category. Its items stay on the menu, just without a category.
create or replace function public.delete_menu_category(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from menu_categories c using businesses b
   where c.id = p_id and b.id = c.business_id and b.owner_id = auth.uid();
end $$;

-- Owner: put the categories in this order (first id = first chip on the customer's menu).
create or replace function public.reorder_menu_categories(p_slug text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare b businesses;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  update menu_categories c set sort = x.ord
    from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as x(id, ord)
   where c.id = x.id and c.business_id = b.id;
end $$;

-- Owner: this category contains exactly these items (others in it become uncategorised).
create or replace function public.set_category_items(p_slug text, p_category uuid, p_items uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare b businesses; ids uuid[] := coalesce(p_items, '{}'::uuid[]);
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  if not exists (select 1 from menu_categories where id = p_category and business_id = b.id) then
    raise exception 'Category not found';
  end if;
  update menu_items set category_id = null where business_id = b.id and category_id = p_category and not (id = any(ids));
  update menu_items set category_id = p_category where business_id = b.id and id = any(ids);
end $$;

-- Owner: add (p_id null) or change an item, now with a category (null = none). Returns the item id.
drop function if exists public.save_menu_item(text, uuid, text, text, text, text, boolean);
create or replace function public.save_menu_item(
  p_slug text, p_id uuid, p_title text, p_description text, p_price text, p_image text, p_available boolean,
  p_category uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare b businesses; t text := trim(coalesce(p_title, '')); img text := coalesce(p_image, ''); r uuid;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  if char_length(t) < 1 or char_length(t) > 80 then raise exception 'Give the item a name (up to 80 characters)'; end if;
  if char_length(coalesce(p_description, '')) > 600 then raise exception 'Description is too long (600 characters max)'; end if;
  if char_length(coalesce(p_price, '')) > 24 then raise exception 'Price is too long'; end if;
  if img <> '' and img !~ '^(https://|data:image/(png|jpeg|webp|gif);base64,)' then raise exception 'Invalid image'; end if;
  if p_category is not null and not exists (select 1 from menu_categories where id = p_category and business_id = b.id) then
    raise exception 'Category not found';
  end if;
  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort, category_id)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1, p_category)
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true), category_id = p_category
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;

revoke execute on function public.get_menu(text), public.save_menu_category(text, uuid, text),
  public.delete_menu_category(uuid), public.reorder_menu_categories(text, uuid[]),
  public.set_category_items(text, uuid, uuid[]),
  public.save_menu_item(text, uuid, text, text, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.get_menu(text) to anon, authenticated;
grant execute on function public.save_menu_category(text, uuid, text) to authenticated;
grant execute on function public.delete_menu_category(uuid) to authenticated;
grant execute on function public.reorder_menu_categories(text, uuid[]) to authenticated;
grant execute on function public.set_category_items(text, uuid, uuid[]) to authenticated;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean, uuid) to authenticated;
