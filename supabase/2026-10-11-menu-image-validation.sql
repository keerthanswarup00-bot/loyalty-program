-- Harden menu image validation in the database, not only in the browser.
-- Menu images must be public Supabase Storage objects in this business's own folder.
-- Allowed extensions are PNG, JPG and WebP; arbitrary URLs and data: URLs are rejected.

create or replace function public.get_menu(p_slug text) returns json
language sql stable security definer set search_path = public as $
  select coalesce(json_agg(json_build_object(
           'id', i.id, 'title', i.title, 'description', i.description,
           'price', i.price,
           'image_url', case
             when char_length(i.image_url) <= 2048
              and i.image_url ~ ('^https://[a-z0-9-]+\\.supabase\\.co/storage/v1/object/public/brand/' || b.id::text || '/menu-[a-z0-9]+\\.(png|jpg|webp)
  p_slug text, p_id uuid, p_title text, p_description text, p_price text, p_image text, p_available boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b businesses;
  t text := trim(coalesce(p_title, ''));
  img text := coalesce(p_image, '');
  r uuid;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;

  if char_length(t) < 1 or char_length(t) > 80 then raise exception 'Give the item a name (up to 80 characters)'; end if;
  if char_length(coalesce(p_description, '')) > 600 then raise exception 'Description is too long (600 characters max)'; end if;
  if char_length(coalesce(p_price, '')) > 24 then raise exception 'Price is too long'; end if;

  if img <> '' and (
       char_length(img) > 2048
       or img !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/brand/' || b.id::text || '/menu-[a-z0-9]+\.(png|jpg|webp))
     ) then
    raise exception 'Invalid image. Upload a PNG, JPG or WebP menu photo to this business storage folder.';
  end if;

  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true)
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;

revoke execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) to authenticated;
)
     ) then
    raise exception 'Invalid image. Upload a PNG, JPG or WebP menu photo to this business storage folder.';
  end if;

  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true)
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;

revoke execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) to authenticated;
)
             then i.image_url else '' end) order by i.sort, i.created_at), '[]'::json)
  from menu_items i join businesses b on b.id = i.business_id
  where b.slug = p_slug and i.available;
$;

create or replace function public.save_menu_item(
  p_slug text, p_id uuid, p_title text, p_description text, p_price text, p_image text, p_available boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b businesses;
  t text := trim(coalesce(p_title, ''));
  img text := coalesce(p_image, '');
  r uuid;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;

  if char_length(t) < 1 or char_length(t) > 80 then raise exception 'Give the item a name (up to 80 characters)'; end if;
  if char_length(coalesce(p_description, '')) > 600 then raise exception 'Description is too long (600 characters max)'; end if;
  if char_length(coalesce(p_price, '')) > 24 then raise exception 'Price is too long'; end if;

  if img <> '' and (
       char_length(img) > 2048
       or img !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/brand/' || b.id::text || '/menu-[a-z0-9]+\.(png|jpg|webp))
     ) then
    raise exception 'Invalid image. Upload a PNG, JPG or WebP menu photo to this business storage folder.';
  end if;

  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true)
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;

revoke execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) to authenticated;
)
     ) then
    raise exception 'Invalid image. Upload a PNG, JPG or WebP menu photo to this business storage folder.';
  end if;

  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true)
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;

revoke execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) to authenticated;
