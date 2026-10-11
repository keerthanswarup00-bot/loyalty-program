# Menu image validation

Menu photos are now restricted in both the admin UI and the database:

- Accepted formats: PNG, JPEG/JPG, WebP. GIF, SVG, HTML, arbitrary external URLs and data URLs are not accepted for menu items.
- Browser upload checks include decodability, a 5 MB source limit, dimensions no larger than 6000 × 6000 or 20 megapixels, and a 2 MB optimized output limit.
- Menu images must be uploaded to the public Supabase Storage `brand` bucket, under the authenticated business's own folder, using the generated `menu-...` filename.
- The database `save_menu_item` function enforces the URL pattern and 2048-character limit; client-side validation alone is not trusted.

## Apply to the live database

Back up the Supabase project first, then run `supabase/2026-10-11-menu-image-validation.sql` in the Supabase SQL Editor. This updates the existing database function. Then deploy the updated `assets/admin.js` site.

The SQL pattern expects the standard Supabase project host (`*.supabase.co`) and public Storage URL format used by this repository. If your project uses a custom Storage domain or self-hosted Supabase, adapt the allowlist to that exact trusted host before applying it.

## Existing menu photos

Any existing menu image URL outside the allowed storage path will be rejected when saving that item. Replace it by uploading the photo through the admin panel. This avoids leaving arbitrary third-party image sources in the menu.
