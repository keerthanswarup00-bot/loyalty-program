// Shared image helper for the two owner editors (the dashboard and the Connect editor).
// Every image is resized in the browser, re-drawn (which drops EXIF/GPS data) and uploaded to the public Supabase
// Storage bucket "brand" (folder = business id). Nothing is ever written into the database as a data: URL, so the
// public pages only download a small file from the CDN instead of a base64 string inside the business row.
(function (root) {
  const OK = /^image\/(png|jpe?g|webp|gif)$/i;
  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  // Longest side in pixels per kind of image. Enough for a sharp phone screen, small enough for mobile data.
  const MAX = { logo: 512, stamp: 512, hero: 1600, gallery: 1200, item: 1000, menu: 1000 };
  const LIMIT = 2e6;                                  // the bucket refuses anything over 2 MB
  const PREFIX = '/storage/v1/object/public/brand/';
  const FLAT = { logo: 1, stamp: 1 };                 // logos/stamps may be transparent: never fall back to JPEG for them

  // New size for a w x h image whose longest side may be at most `max`. Never scales up.
  function fit(w, h, max) {
    const k = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  const isData = u => /^data:image\//i.test(String(u || ''));

  // Object path for a new upload: <business id>/<kind>-<time><random>.<ext>
  function pathFor(bizId, kind, type, now, rand) {
    return bizId + '/' + kind + '-' + (now == null ? Date.now() : now).toString(36) + (rand == null ? Math.random().toString(36).slice(2, 6) : rand) + '.' + EXT[String(type).toLowerCase()];
  }

  // The object path inside the bucket for one of THIS business's uploaded images, or null for anything else
  // (data: URLs, images hosted elsewhere, the built-in /assets/*.svg artwork, another business's files).
  function storagePath(url, bizId) {
    const s = String(url || ''), i = s.indexOf(PREFIX);
    if (i < 0 || !bizId) return null;
    let p; try { p = decodeURIComponent(s.slice(i + PREFIX.length).split('?')[0]) } catch (e) { return null }
    return p.indexOf(bizId + '/') === 0 && p.length > bizId.length + 1 ? p : null;
  }

  // data:image/png;base64,AAAA -> Blob. Done by hand because the site's Content-Security-Policy does not allow fetch() on data: URLs.
  function dataToBlob(u) {
    const m = /^data:(image\/[a-z0-9.+-]+)?(;base64)?,(.*)$/is.exec(String(u || ''));
    if (!m) throw 'read';
    const type = m[1] || 'image/png', raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  // Turn a storage error into one short code the editors can show a plain-words message for.
  function classify(e) {
    const m = String((e && e.message) || e || ''), s = String((e && (e.statusCode || e.status)) || '');
    if (/bucket not found/i.test(m)) return 'no bucket';
    if (/row-level security|unauthori[sz]ed|not allowed|permission|violates/i.test(m) || s == '401' || s == '403') return 'denied';
    if (/exceed|too large|payload/i.test(m) || s == '413') return 'too big';
    if (/mime|not supported|invalid.*type/i.test(m) || s == '415') return 'type';
    if (/fetch|network|timeout|offline|load failed/i.test(m)) return 'network';
    return 'storage';
  }
  const MSG = {
    type: 'Use a PNG, JPG, WebP or GIF image',
    'too big': 'That image is still over 2 MB after resizing. Try a smaller one.',
    'no bucket': 'Image storage is not set up yet. Run the latest supabase/schema.sql in Supabase, then try again.',
    denied: 'This account is not allowed to upload images for this shop. Sign in again and retry.',
    network: 'No connection. Check your internet and try again.',
    read: 'Could not read that image. Try a JPG or PNG.',
    storage: 'The image could not be uploaded. Please try again.'
  };
  const message = code => MSG[code] || MSG.storage;

  // Resize + re-encode in the browser. WebP where the browser can make it (smallest, keeps transparency); otherwise JPEG for
  // photos and PNG for logos. GIFs are passed through untouched because redrawing would flatten the animation.
  async function shrink(file, kind) {
    if (file.type == 'image/gif') return file;
    let bm; try { bm = await createImageBitmap(file) } catch (e) { throw 'read' }
    const d = fit(bm.width, bm.height, MAX[kind] || 1000), c = document.createElement('canvas');
    c.width = d.w; c.height = d.h;
    c.getContext('2d').drawImage(bm, 0, 0, d.w, d.h);
    if (bm.close) bm.close();
    const enc = (type, q) => new Promise(r => c.toBlob(r, type, q));
    let blob = await enc('image/webp', FLAT[kind] ? .92 : .82);
    if (!blob || blob.type != 'image/webp') blob = await enc(FLAT[kind] ? 'image/png' : 'image/jpeg', .85);
    if (!blob || !EXT[blob.type]) throw 'read';
    return new File([blob], 'img.' + EXT[blob.type], { type: blob.type });
  }

  // Resize and upload one image. Returns its public URL. Throws a short code (see MSG) if anything fails.
  async function upload(sb, bizId, file, kind) {
    if (!OK.test(file.type || '')) throw 'type';
    const out = await shrink(file, kind);
    if (out.size > LIMIT) throw 'too big';
    const path = pathFor(bizId, kind, out.type);
    let r; try { r = await sb.storage.from('brand').upload(path, out, { contentType: out.type, cacheControl: '31536000' }) } catch (e) { throw classify(e) }
    if (r.error) throw classify(r.error);
    return sb.storage.from('brand').getPublicUrl(path).data.publicUrl;
  }

  // Upload an image that is currently stored inside the database as a data: URL.
  function fromData(sb, bizId, dataUrl, kind) {
    const b = dataToBlob(dataUrl);
    return upload(sb, bizId, new File([b], 'img', { type: b.type }), kind);
  }

  // Best-effort delete of a replaced or removed upload. Only touches this business's own files in the bucket.
  async function remove(sb, bizId, url) {
    const p = storagePath(url, bizId); if (!p) return;
    try { await sb.storage.from('brand').remove([p]) } catch (e) { }
  }

  const api = { MAX, LIMIT, fit, isData, pathFor, storagePath, dataToBlob, classify, message, shrink, upload, fromData, remove };
  if (typeof module != 'undefined' && module.exports) module.exports = api; else root.BrandImg = api;
})(typeof window != 'undefined' ? window : globalThis);
