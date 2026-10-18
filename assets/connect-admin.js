// The Connect editor: a shop's owner edits their public Connect page at /connect/<slug>/admin/.
// It is the same owner account as the dashboard (shared per-shop session), so signing in once covers both.
// Owners can edit branding, contact details, links, products/services and photos, see a live preview,
// and grab the share link, QR code and NFC instructions.
const SUPPORT_AS = (new URLSearchParams(location.search).get('as') || '').toLowerCase();
const sb = notReady() ? null : mkClient(SUPPORT_AS ? 'lk-platform' : 'lk-admin');
let signed = false, bz = null, tab = 'story', CATS = [], ITEMS = [], form = null, recover = false, support = null;
let status = null;   // outcome of the last save; stays on screen (see noticesV) until the next full save or a tab change
let dlinks = [], dgal = [], heroDraft;   // heroDraft: undefined = saved photo, '' = removed, blob: = just picked

const urlOk = u => !u || /^https?:\/\//i.test(u);
const shareUrl = () => pubOrigin() + connectBase();
const waQrUrl = () => shareUrl();

// ---------- images ----------
// assets/img.js resizes every photo, strips its metadata and uploads it to the "brand" storage bucket. If storage is
// unavailable the upload fails with a clear message; images are never saved inside the database as a data: URL.
const uploadImg = (file, kind) => BrandImg.upload(sb, bz.id, file, kind);
const imgErr = e => toast(BrandImg.message(e));
const isDataImg = u => BrandImg.isData(u);
// After a save: the replaced file is deleted if the row took the new one; the new file is deleted if the row refused it.
async function settleImg(field, oldUrl, newUrl, res) {
  if (newUrl === oldUrl) return;
  await BrandImg.remove(sb, bz.id, res.done.includes(field) ? oldUrl : newUrl);
}

// ---------- auth (same owner account and session as the dashboard) ----------
async function login(btn) {
  const email = v('em').trim(), password = v('pw');
  if (!email || !password) return toast('Enter your email and password');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { btn.disabled = false; return toast(nice(error)) }
  await enter();
}
async function out() {
  await sb.auth.signOut();
  signed = false; bz = null; CATS = []; ITEMS = []; form = null; dlinks = []; dgal = []; support = null; tab = 'story';
  render();
}
async function forgot() {
  const email = v('em').trim();
  if (!email) return toast('Enter your email above first');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + connectAdminBase() });
  if (error) return toast(nice(error));
  toast('If that email has an account, a reset link is on its way');
}
async function setPw(btn) {
  const p = v('np');
  if (p.length < 6) return toast('Password must be at least 6 characters');
  btn.disabled = true;
  const { error } = await sb.auth.updateUser({ password: p });
  if (error) { btn.disabled = false; return toast(nice(error)) }
  recover = false; try { history.replaceState(null, '', location.pathname) } catch (e) { }
  toast('Password updated'); await enter();
}

async function enter() {
  signed = true;
  if (/^[a-z0-9-]+$/.test(SUPPORT_AS)) {
    try { await rpc(sb, 'platform_support_open', { p_slug: SUPPORT_AS }); CFG.slug = SUPPORT_AS; linkSlug = SUPPORT_AS; support = SUPPORT_AS }
    catch (e) { $('#app').innerHTML = `<div class="a-card" style="margin-top:40px"><h2>Could not open ${esc(SUPPORT_AS)}</h2><p class="sub">${esc(nice(e))}</p><a class="btn alt" href="/platform/">Back to the platform page</a></div>`; return }
  }
  await load(); render();
}
async function load() {
  try {
    const { data, error } = await sb.from('businesses').select('*').eq('slug', CFG.slug).maybeSingle();
    if (error) throw error;
    bz = data;
    if (bz) {
      brand(bz); document.title = bz.name + ' · Connect editor';
      if (!Array.isArray(bz.links)) bz.links = [];
      if (!Array.isArray(bz.gallery)) bz.gallery = [];
      dlinks = bz.links.map(x => ({ label: (x && x.label) || '', url: (x && x.url) || '' }));
      dgal = bz.gallery.slice();
      await loadMenu();
    }
  } catch (e) { toast(nice(e)) }
}
let aromaSeedBusy = false;
async function seedAromaProductsIfMissing() {
  if (aromaSeedBusy || String(CFG.slug || '').toLowerCase() !== 'aroma-scripts') return;
  const base = pubOrigin() + '/assets/';
  const defaults = [
    { title: 'Vanilla Cloud', description: 'A soft, inviting fragrance for those who enjoy a warm, comforting scent.', image: base + 'aroma-vanilla-cloud.svg' },
    { title: "Madhu's Essence", description: 'A distinctive personal fragrance created to make everyday moments memorable.', image: base + 'aroma-madhus-essence.svg' },
    { title: 'His Muse', description: 'A signature fragrance designed for expressing individuality and personal style.', image: base + 'aroma-his-muse.svg' }
  ];
  const tasks = defaults.filter(d => {
    const found = ITEMS.find(x => String(x.title || '').trim().toLowerCase() === d.title.toLowerCase());
    return !found || !String(found.image_url || '').trim();
  });
  if (!tasks.length) return;
  aromaSeedBusy = true;
  try {
    for (const item of tasks) {
      const found = ITEMS.find(x => String(x.title || '').trim().toLowerCase() === item.title.toLowerCase());
      await rpc(sb, 'save_menu_item', {
        p_slug: CFG.slug, p_id: found ? found.id : null, p_title: item.title,
        p_description: found && found.description ? found.description : item.description,
        p_price: found && found.price ? found.price : '',
        p_image: found && found.image_url ? found.image_url : item.image,
        p_available: found ? found.available !== false : true,
        p_category: found ? (found.category_id || null) : null
      });
    }
    toast('Aroma Scripts products and artwork added. Add confirmed prices in Products.');
  } catch (e) {
    console.error('Aroma Scripts product setup:', e);
    toast('Could not finish product setup. Check the latest menu SQL migration.');
  } finally { aromaSeedBusy = false }
}
async function loadMenu() {
  const it = await sb.from('menu_items').select('*').eq('business_id', bz.id).order('sort', { ascending: true }).order('created_at', { ascending: true });
  ITEMS = it.error ? [] : it.data;
  const ct = await sb.from('menu_categories').select('*').eq('business_id', bz.id).order('sort', { ascending: true }).order('created_at', { ascending: true });
  CATS = ct.error ? [] : ct.data;
  if (!it.error) {
    await seedAromaProductsIfMissing();
    if (String(CFG.slug || '').toLowerCase() === 'aroma-scripts') {
      const refreshed = await sb.from('menu_items').select('*').eq('business_id', bz.id).order('sort', { ascending: true }).order('created_at', { ascending: true });
      if (!refreshed.error) ITEMS = refreshed.data;
    }
  }
}

// ---------- saving ----------
// Every save is checked by reading the row back from the database and comparing it with what was sent, so a save the
// database quietly refused (no row updated, missing column, no permission) can never show up as "Saved". If the whole
// form is refused, each field is tried on its own so the owner is told exactly which ones did not save and why.
const FIELDS = { name: 'Shop name', tagline: 'Tagline', color: 'Brand colour', vertical: 'Shop type', logo_url: 'Logo', hero_url: 'Hero photo', about: 'Description', connect_loyalty: 'Loyalty button',
  phone: 'Phone number', wa_phone: 'WhatsApp number', address: 'Address', maps_url: 'Google Maps link', lat: 'Latitude', lng: 'Longitude', review_url: 'Review link',
  ig: 'Instagram link', fb: 'Facebook link', yt: 'YouTube link', web: 'Website link', links: 'Other links', gallery: 'Photos' };
const FIELD_INPUT = { name: 'nm', tagline: 'tg', color: 'col', vertical: 'vt', logo_url: 'lgf', hero_url: 'hrf', about: 'ab', connect_loyalty: 'ly', phone: 'ph', wa_phone: 'wap', address: 'ad',
  maps_url: 'map', lat: 'lat', lng: 'lng', review_url: 'rv', ig: 'ig', fb: 'fb', yt: 'yt', web: 'web' };
const FILE_INPUT = { logo_url: ['lgf', 'lgrm'], hero_url: ['hrf', 'hrrm'] };
// Which SQL file adds a column (and the right to edit it). Anything else: the full schema.sql, which is safe to re-run.
const SQL_FOR = { about: '2026-10-18-connect-hero.sql', hero_url: '2026-10-18-connect-hero.sql', connect_loyalty: '2026-10-18-connect-hero.sql',
  phone: '2026-10-16-connect.sql', wa_phone: '2026-10-16-connect.sql', address: '2026-10-16-connect.sql', maps_url: '2026-10-16-connect.sql', lat: '2026-10-16-connect.sql', lng: '2026-10-16-connect.sql',
  review_url: '2026-10-16-connect.sql', yt: '2026-10-16-connect.sql', links: '2026-10-16-connect.sql', gallery: '2026-10-16-connect.sql', vertical: '2026-10-16-connect.sql' };
const sqlFile = k => 'supabase/' + (SQL_FOR[k] || 'schema.sql');

// Deep equality that ignores object key order (Postgres jsonb stores keys in its own order).
function same(a, b) {
  if (a === b) return true;
  if (typeof a == 'number' && typeof b == 'number') return Math.abs(a - b) < 1e-9;
  if (a && b && typeof a == 'object' && typeof b == 'object') {
    if (Array.isArray(a) != Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length == kb.length && ka.every(k => same(a[k], b[k]));
  }
  return false;
}
// Plain-words reason a field could not be saved.
function whyNot(e, field) {
  const m = String((e && e.message) || e || '');
  if (e && e.code == 'NOROW') return 'the database did not update any row. Sign in again; if it keeps happening, this account may not manage this shop.';
  if (/could not find the .* column|column .* does not exist|schema cache/i.test(m)) return 'the database is missing this column. Run ' + sqlFile(field) + ' in the Supabase SQL editor.';
  if ((e && e.code == '42501') || /permission denied|row-level security/i.test(m)) return 'the database does not allow editing it yet. Run ' + sqlFile(field) + ' in the Supabase SQL editor.';
  if (/fetch|network/i.test(m)) return 'no connection. Check your internet and try again.';
  return nice(e);
}
// One update, read back. { error } if refused, otherwise { off: the fields whose stored value is not what was sent }.
async function writeFields(fields) {
  try {
    const keys = Object.keys(fields);
    const r = await sb.from('businesses').update(fields).eq('id', bz.id).select(keys.join(','));
    if (r.error) return { error: r.error };
    const row = r.data && r.data[0];
    if (!row) return { error: { code: 'NOROW' } };
    return { off: keys.filter(k => !same(row[k], fields[k])) };
  } catch (e) { return { error: e } }
}
const KEPT_OTHER = 'it was sent, but the database kept a different value.';
// Saves `patch`. Returns { ok, done, failed } — ok only when every field was stored and verified.
async function savePatch(patch, btn, msg) {
  if (btn) btn.disabled = true;
  const keys = Object.keys(patch), done = [], failed = [];
  const r = await writeFields(patch);
  if (r.error && keys.length > 1) {
    for (const k of keys) {
      const x = await writeFields({ [k]: patch[k] });
      if (x.error) failed.push({ k, why: whyNot(x.error, k) });
      else if (x.off.length) failed.push({ k, why: KEPT_OTHER });
      else done.push(k);
    }
  } else if (r.error) failed.push({ k: keys[0], why: whyNot(r.error, keys[0]) });
  else keys.forEach(k => r.off.includes(k) ? failed.push({ k, why: KEPT_OTHER }) : done.push(k));
  if (btn) btn.disabled = false;
  done.forEach(k => { bz[k] = patch[k] });
  if (done.length) { brand(bz); document.title = bz.name + ' · Connect editor' }
  const res = { ok: !failed.length, done, failed };
  if (res.ok) { setStatus(null); if (msg) toast(msg); return res }
  // Partly or fully refused: keep the form exactly as the owner typed it, say what happened, and mark the fields.
  Object.keys(FILE_INPUT).forEach(k => { if (done.includes(k)) FILE_INPUT[k].forEach((id, i) => { const el = $('#' + id); if (el) el.value = i ? '0' : '' }) });
  failed.forEach(f => { const el = $('#' + (FIELD_INPUT[f.k] || '')); if (el) el.setAttribute('aria-invalid', 'true') });
  setStatus({ kind: done.length ? 'warn' : 'err', title: done.length ? 'Some changes were saved, others were not' : 'Nothing was saved',
    saved: done.map(k => FIELDS[k] || k), failed: failed.map(f => ({ label: FIELDS[f.k] || f.k, why: f.why })) });
  toast(done.length ? 'Some changes did not save. See the note at the top.' : 'Could not save. See the note at the top.');
  return res;
}
document.addEventListener('input', e => { if (e.target && e.target.removeAttribute) e.target.removeAttribute('aria-invalid') });

// Columns the Connect page needs. If the editor's own read of the shop row lacks one, the migration has not been run.
const NEEDED = ['about', 'hero_url', 'connect_loyalty', 'phone', 'wa_phone', 'address', 'maps_url', 'lat', 'lng', 'review_url', 'yt', 'links', 'gallery', 'vertical'];
const missingCols = () => bz ? NEEDED.filter(k => !(k in bz)) : [];
const dataImgs = () => bz ? [bz.logo_url, bz.hero_url, ...(Array.isArray(bz.gallery) ? bz.gallery : []), ...ITEMS.map(x => x.image_url)].filter(isDataImg).length : 0;

function setStatus(s) { status = s; const el = $('#ce-notes'); if (el) el.innerHTML = noticesV() }
// Messages that stay visible at the top of the form until they no longer apply (unlike a toast, which disappears).
function noticesV() {
  const out = [], gaps = missingCols();
  if (gaps.length) {
    const files = [...new Set(gaps.map(sqlFile))];
    out.push(`<div class="ce-note err" role="alert"><b>Your database is missing something this page needs</b><p>${gaps.map(k => esc(FIELDS[k] || k)).join(', ')} cannot be saved yet. In Supabase, open the SQL Editor and run ${files.map(f => '<code>' + esc(f) + '</code>').join(' and ')}. It is safe to run more than once. Then reload this page.</p></div>`);
  }
  const n = dataImgs();
  if (n) out.push(`<div class="ce-note"><b>${n} ${n == 1 ? 'image is' : 'images are'} stored inside your database</b><p>That makes your pages slower to open, especially on mobile data, and stops WhatsApp showing the picture when your link is shared. <button type="button" class="lnk" onclick="moveImages(this)">Move ${n == 1 ? 'it' : 'them'} to storage</button></p></div>`);
  if (status) out.push(`<div class="ce-note ${status.kind}" role="${status.kind == 'ok' ? 'status' : 'alert'}"><b>${esc(status.title)}</b>`
    + (status.failed && status.failed.length ? `<ul>${status.failed.map(f => `<li><b style="display:inline">${esc(f.label)}</b> was not saved: ${esc(f.why)}</li>`).join('')}</ul>` : '')
    + (status.saved && status.saved.length ? `<p>Saved: ${status.saved.map(esc).join(', ')}.</p>` : '') + `</div>`);
  return out.join('');
}

// Move every image still stored inside the database (logo, hero, photos, product pictures) into the storage bucket.
async function moveImages(btn) {
  if (btn) btn.disabled = true;
  const fresh = [], kept = new Set();   // fresh = uploaded in this run; kept = the ones a database row now points at
  const up = async (u, kind) => { const url = await BrandImg.fromData(sb, bz.id, u, kind); fresh.push(url); return url };
  try {
    const patch = {};
    for (const [col, kind] of [['logo_url', 'logo'], ['hero_url', 'hero']]) if (isDataImg(bz[col])) patch[col] = await up(bz[col], kind);
    if ((bz.gallery || []).some(isDataImg)) { patch.gallery = []; for (const u of bz.gallery) patch.gallery.push(isDataImg(u) ? await up(u, 'gallery') : u) }
    const items = ITEMS.filter(x => isDataImg(x.image_url)), newItem = {};
    for (const it of items) newItem[it.id] = await up(it.image_url, 'item');
    if (Object.keys(patch).length) {
      const r = await savePatch(patch, null);
      r.done.forEach(k => [].concat(patch[k]).forEach(u => kept.add(u)));
      if (!r.ok) throw 'saved-partly';
    }
    for (const it of items) {
      await rpc(sb, 'save_menu_item', { p_slug: CFG.slug, p_id: it.id, p_title: it.title, p_description: it.description || '', p_price: it.price || '', p_image: newItem[it.id], p_available: it.available !== false, p_category: it.category_id || null });
      kept.add(newItem[it.id]);
    }
    await load(); render(); toast('Images moved to storage');
  } catch (e) {
    for (const u of fresh) if (!kept.has(u)) await BrandImg.remove(sb, bz.id, u);   // never delete a file a saved row uses
    if (e !== 'saved-partly') toast(typeof e == 'string' ? BrandImg.message(e) : nice(e));
    if (btn) btn.disabled = false;
  }
}
const go = t => { tab = t; form = null; heroDraft = undefined; status = null; render(); window.scrollTo(0, 0) };

// ---------- savings ----------
async function saveBrand(btn) {
  const name = v('nm').trim(); if (!name) return toast('Give your shop a name');
  const patch = { name, tagline: v('tg').trim(), color: HEX6.test(v('colp')) ? v('colp') : bz.color, vertical: v('vt') };
  const oldLogo = bz.logo_url;
  if ($('#lgrm').value == '1') patch.logo_url = '';
  else if ($('#lgf').files[0]) { btn.disabled = true; try { patch.logo_url = await uploadImg($('#lgf').files[0], 'logo') } catch (e) { btn.disabled = false; return imgErr(e) } }
  const res = await savePatch(patch, btn, 'Branding saved');
  if ('logo_url' in patch) await settleImg('logo_url', oldLogo, patch.logo_url, res);
  if (res.ok) render();
}
async function saveStory(btn) {
  const patch = { about: v('ab').trim().slice(0, 600), connect_loyalty: !!$('#ly').checked };
  const oldHero = bz.hero_url;
  if ($('#hrrm').value == '1') patch.hero_url = '';
  else if ($('#hrf').files[0]) { btn.disabled = true; try { patch.hero_url = await uploadImg($('#hrf').files[0], 'hero') } catch (e) { btn.disabled = false; return imgErr(e) } }
  const res = await savePatch(patch, btn, 'Story saved');
  if ('hero_url' in patch) await settleImg('hero_url', oldHero, patch.hero_url, res);
  if (res.ok) { heroDraft = undefined; render() }
}
async function saveContact(btn) {
  const map = v('map').trim(), rv = v('rv').trim();
  if (!urlOk(map)) return toast('The map link should start with https://');
  if (!urlOk(rv)) return toast('The review link should start with https://');
  const num = id => { const x = parseFloat(v(id)); return isFinite(x) ? x : null };
  const lat = num('lat'), lng = num('lng');
  if (lat !== null && (lat < -90 || lat > 90)) return toast('Latitude must be between -90 and 90');
  if (lng !== null && (lng < -180 || lng > 180)) return toast('Longitude must be between -180 and 180');
  const patch = { phone: v('ph').trim(), wa_phone: v('wap').trim(), address: v('ad').trim(), maps_url: map, lat, lng, review_url: rv };
  if ((await savePatch(patch, btn, 'Contact details saved')).ok) render();
}
async function saveLinks(btn) {
  const clean = u => { const s = String(u || '').trim(); return urlOk(s) ? s : '' };
  const ig = clean(v('ig')), fb = clean(v('fb')), yt = clean(v('yt')), web = clean(v('web'));
  if ([v('ig'), v('fb'), v('yt'), v('web')].some((x, i) => x.trim() && ![ig, fb, yt, web][i])) return toast('Links should start with https://');
  syncLinks();
  const links = dlinks.map(x => ({ label: x.label.trim().slice(0, 30), url: x.url.trim() })).filter(x => urlOk(x.url) && x.url);
  if ((await savePatch({ ig, fb, yt, web, links }, btn, 'Links saved')).ok) render();
}

// ---------- link rows (kept in dlinks so typing does not re-render) ----------
function syncLinks() { dlinks = [...document.querySelectorAll('#lnkr .ca-lrow')].map(r => ({ label: r.querySelector('.ca-ll').value, url: r.querySelector('.ca-lu').value })) }
function addLink() { syncLinks(); dlinks.push({ label: '', url: '' }); render() }
function rmLink(i) { syncLinks(); dlinks.splice(i, 1); render() }

// ---------- products ----------
function editItem(it) { form = it ? { id: it.id, title: it.title, price: it.price, description: it.description, category_id: it.category_id || '', image_url: it.image_url || '' } : { title: '', price: '', description: '', category_id: '', image_url: '' }; render(); window.scrollTo(0, 0) }
function editItemId(id) { const it = ITEMS.find(i => i.id == id); if (it) editItem(it) }
async function saveItem(btn) {
  const title = v('it-t').trim(); if (!title) return toast('Give this item a name');
  btn.disabled = true;
  const oldImage = form.image_url || '';
  let image = oldImage;
  const f = $('#it-f').files[0];
  if (f) { try { image = await uploadImg(f, 'item') } catch (e) { btn.disabled = false; return imgErr(e) } }
  try {
    await rpc(sb, 'save_menu_item', { p_slug: CFG.slug, p_id: form.id || null, p_title: title, p_description: v('it-d').trim(), p_price: v('it-p').trim(), p_image: image || '', p_available: true, p_category: v('it-c') || null });
  } catch (e) { btn.disabled = false; if (image !== oldImage) await BrandImg.remove(sb, bz.id, image); return toast(nice(e)) }
  if (image !== oldImage) await BrandImg.remove(sb, bz.id, oldImage);
  form = null; await loadMenu(); render(); toast('Saved');
}
async function delItem(id) {
  if (!confirm('Delete this item?')) return;
  const old = (ITEMS.find(x => x.id == id) || {}).image_url;
  try { await rpc(sb, 'delete_menu_item', { p_id: id }) } catch (e) { return toast('Could not delete that item: ' + nice(e)) }
  await BrandImg.remove(sb, bz.id, old);
  await loadMenu(); render(); toast('Deleted');
}
async function moveItem(id, dir) {
  const ids = ITEMS.map(i => i.id), k = ids.indexOf(id), j = dir < 0 ? k - 1 : k + 1;
  if (j < 0 || j >= ids.length) return;
  const t = ids[k]; ids[k] = ids[j]; ids[j] = t;
  try { await rpc(sb, 'reorder_menu_items', { p_slug: CFG.slug, p_ids: ids }) } catch (e) { return toast(nice(e)) }
  await loadMenu(); render();
}
async function addCat() {
  const n = v('cat-new').trim(); if (!n) return;
  try { await rpc(sb, 'save_menu_category', { p_slug: CFG.slug, p_id: null, p_name: n }) } catch (e) { return toast(nice(e)) }
  await loadMenu(); render(); toast('Category added');
}
async function saveCat(id) {
  const el = $('#cat-l-' + id); if (!el) return;
  try { await rpc(sb, 'save_menu_category', { p_slug: CFG.slug, p_id: id, p_name: el.value.trim() }) } catch (e) { return toast(nice(e)) }
  await loadMenu(); render(); toast('Category saved');
}
async function delCat(id) {
  if (!confirm('Delete this category? Its items stay on the list.')) return;
  try { await rpc(sb, 'delete_menu_category', { p_id: id }) } catch (e) { return toast('Could not delete that category: ' + nice(e)) }
  await loadMenu(); render(); toast('Category deleted');
}
async function addSample(btn) {
  btn.disabled = true;
  const s = vertical(bz.vertical).sample, map = {};
  try {
    for (const cn of (s.categories || [])) map[cn] = await rpc(sb, 'save_menu_category', { p_slug: CFG.slug, p_id: null, p_name: cn });
    for (const it of (s.items || [])) await rpc(sb, 'save_menu_item', { p_slug: CFG.slug, p_id: null, p_title: it.title, p_description: it.description || '', p_price: it.price || '', p_image: '', p_available: true, p_category: map[it.category] || null });
  } catch (e) { btn.disabled = false; return toast(nice(e)) }
  await loadMenu(); render(); toast('Sample added — edit or delete anything you like');
}

// ---------- photos ----------
async function onPhotos(input) {
  const files = [...(input.files || [])]; if (!files.length) return;
  const added = [];
  for (const f of files) { try { const u = await uploadImg(f, 'gallery'); added.push(u); dgal.push(u) } catch (e) { imgErr(e) } }
  input.value = '';
  if (!added.length) return;
  if ((await savePatch({ gallery: dgal }, null, added.length == files.length ? 'Photos saved' : 'Some photos saved')).ok) render();
  else { dgal = bz.gallery.slice(); for (const u of added) await BrandImg.remove(sb, bz.id, u) }   // the row refused them: don't leave the files behind
}
async function rmPhoto(i) {
  const gone = dgal[i]; dgal.splice(i, 1);
  if ((await savePatch({ gallery: dgal }, null, 'Photo removed')).ok) { await BrandImg.remove(sb, bz.id, gone); render() } else dgal = bz.gallery.slice();
}

// ---------- preview ----------
const digits = raw => { let d = String(raw || '').replace(/\D/g, ''); if (d.length == 11 && d[0] == '0') d = d.slice(1); if (d.length == 10) d = (CFG.countryCode || '91') + d; return d };
function pvMaps(d) {
  if (/^https:\/\//i.test(d.maps_url || '')) return d.maps_url;
  if (d.lat != null && d.lng != null && isFinite(d.lat) && isFinite(d.lng)) return 'https://www.google.com/maps/search/?api=1&query=' + d.lat + ',' + d.lng;
  if (d.address) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(d.address);
  return '';
}
function draft() {
  const g = id => $('#' + id) ? v(id).trim() : undefined;
  return {
    name: g('nm') !== undefined && g('nm') ? g('nm') : bz.name,
    tagline: g('tg') !== undefined ? g('tg') : bz.tagline,
    color: g('colp') ? v('colp') : bz.color,
    vertical: g('vt') || bz.vertical,
    logo_url: bz.logo_url,
    phone: g('ph') !== undefined ? g('ph') : bz.phone,
    wa_phone: g('wap') !== undefined ? g('wap') : bz.wa_phone,
    address: g('ad') !== undefined ? g('ad') : bz.address,
    maps_url: g('map') !== undefined ? g('map') : bz.maps_url,
    lat: g('lat') !== undefined ? (isFinite(parseFloat(g('lat'))) ? parseFloat(g('lat')) : null) : bz.lat,
    lng: g('lng') !== undefined ? (isFinite(parseFloat(g('lng'))) ? parseFloat(g('lng')) : null) : bz.lng,
    review_url: g('rv') !== undefined ? g('rv') : bz.review_url,
    hero_url: heroDraft !== undefined ? heroDraft : bz.hero_url,
    about: $('#ab') ? $('#ab').value.trim() : bz.about,
    connect_loyalty: $('#ly') ? $('#ly').checked : bz.connect_loyalty !== false,
    ig: bz.ig, fb: bz.fb, yt: bz.yt, web: bz.web, links: bz.links
  };
}
function pvHTML(d) {
  const V = vertical(d.vertical), wd = digits(d.wa_phone || '') || (String(bz.wa || '').match(/(\d{10,15})/) || [])[1] || '';
  const q = [pvMaps(d) ? '<span class="cn-quick-a"><span class="cn-qi">' + ico('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>') + '</span><span>Directions</span></span>' : '',
    digits(d.phone) ? '<span class="cn-quick-a"><span class="cn-qi">' + ico('<path d="M4 5c0 8.3 6.7 15 15 15l2-3.6-4.3-2-1.8 1.8a12 12 0 0 1-4.6-4.6l1.8-1.8-2-4.3z"/>') + '</span><span>Call</span></span>' : '',
    wd ? '<span class="cn-quick-a"><span class="cn-qi">' + IC.wa + '</span><span>WhatsApp</span></span>' : ''].filter(Boolean).join('');
  const items = ITEMS.slice(0, 4).map(x => `<li class="cn-item"><div class="mn-tx"><b>${esc(x.title)}</b>${x.description ? `<small>${esc(x.description)}</small>` : ''}</div>${x.price ? `<span class="mn-pr">${esc(x.price)}</span>` : ''}</li>`).join('');
  const soc = [['Instagram', bz.ig, IC.ig], ['Facebook', bz.fb, IC.fb], ['YouTube', bz.yt, IC.yt]].filter(x => /^https:\/\//i.test(x[1] || ''));
  const logo = bz.logo_url && /^(https:|data:)/.test(bz.logo_url) ? `<img src="${esc(bz.logo_url)}" alt="">` : esc((d.name || '?').trim().slice(0, 1).toUpperCase());
  const lg = `<div class="logo">${logo}</div>`, nm = esc(d.name || 'Your shop'), tg = d.tagline ? `<p>${esc(d.tagline)}</p>` : '';
  const hero = /^(https:|blob:|data:image)/.test(d.hero_url || '')
    ? `<header class="cn-hero cn-hero-img"><img class="cn-hero-bg" src="${esc(d.hero_url)}" alt=""><div class="cn-hero-in">${lg}<h1>${nm}</h1>${tg}</div></header>`
    : `<header class="cn-hero${d.about ? ' cn-art' : ''}"><div class="cn-hero-in">${lg}<h1>${nm}</h1>${tg}</div></header>`;
  const about = d.about ? `<section class="cn-about"><div class="cn-eyebrow">About</div>${d.about.split(/\n{2,}/).map(x => `<p>${esc(x.trim()).replace(/\n/g, '<br>')}</p>`).join('')}</section>` : '';
  const acts = (d.connect_loyalty ? `<a class="cn-act pri"><span class="cn-ai">${ico('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2 0-4-1-4-3s3-2.5 4 3c1-5.5 4-5 4-3s-2 3-4 3"/>')}</span><span class="cn-at"><b>Join the loyalty card</b><small>Collect stamps, earn rewards</small></span></a>` : '')
    + (/^https:\/\//i.test(d.review_url || '') ? `<a class="cn-act"><span class="cn-ai">${ico('<path d="M12 3.5l2.9 5.9 6.1.9-4.5 4.4 1.1 6.1L12 18l-5.6 3 1.1-6.1L3 10.3l6.1-.9z"/>')}</span><span class="cn-at"><b>Leave a review</b></span></a>` : '');
  return `<div class="cn">
    ${hero}${about}
    ${q ? `<nav class="cn-quick">${q}</nav>` : ''}
    ${acts ? `<nav class="cn-acts">${acts}</nav>` : ''}
    ${ITEMS.length ? `<section class="cn-sec"><h2>${esc(V.section)}</h2><ul class="cn-list">${items}</ul></section>` : ''}
    ${soc.length ? `<section class="cn-sec"><h2>Find us online</h2><div class="cn-soc">${soc.map(x => `<span>${x[2]}<span>${esc(x[0])}</span></span>`).join('')}</div></section>` : ''}
    <footer class="cn-foot">${esc(d.name || 'Your shop')} · Powered by Innondu</footer></div>`;
}
function pv() {
  const el = $('#pv'); if (!el) return;
  const d = bz ? draft() : null; if (!d) return;
  Object.entries(themeVars(d.color, bz.theme)).forEach(([k, x]) => el.style.setProperty(k, x));
  el.innerHTML = pvHTML(d);
}
function colFromPick() { const p = $('#colp'); if (p) { $('#col').value = p.value } pv() }
function colFromText() { const t = $('#col'); if (t && HEX6.test(t.value)) $('#colp').value = t.value; pv() }
function pvLogo(input) { const f = input.files[0]; $('#lgrm').value = '0'; const el = $('#lgpv'); if (f && el) el.innerHTML = `<img src="${esc(URL.createObjectURL(f))}" alt="">`; pv() }
function rmLogo() { $('#lgrm').value = '1'; const el = $('#lgpv'); if (el) el.innerHTML = ''; $('#lgf').value = ''; pv() }
function pvHero(input) {
  const f = input.files[0]; if (!f) return;
  heroDraft = URL.createObjectURL(f); $('#hrrm').value = '0';
  const el = $('#hrpv'); if (el) { el.classList.add('has'); el.querySelector('.ce-hero-img').innerHTML = `<img src="${esc(heroDraft)}" alt="">` }
  pv();
}
function rmHero() {
  heroDraft = ''; $('#hrrm').value = '1'; $('#hrf').value = '';
  const el = $('#hrpv'); if (el) { el.classList.remove('has'); el.querySelector('.ce-hero-img').innerHTML = '' }
  pv();
}
function cnt() { const t = $('#ab'), c = $('#abc'); if (t && c) c.textContent = t.value.length + ' / 600'; pv() }
function pvItem(input) { const f = input.files[0], el = $('#it-pv'); if (f && el) el.innerHTML = `<img src="${esc(URL.createObjectURL(f))}" alt="">` }

// ---------- views ----------
const I = {
  eye: ico('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  copy: ico('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  qr: ico('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v0M21 21h-4v-4"/>'),
  up: ico('<path d="M12 19V5M6 11l6-6 6 6"/>'), down: ico('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  edit: ico('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), trash: ico('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>'),
  wa: IC.wa, signout: ico('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 12h10M17 9l3 3-3 3"/>')
};
const loginV = () => `<div class="a-card" style="margin-top:40px;max-width:420px;margin-inline:auto"><h2>Connect editor</h2><p class="sub">Sign in with your owner account to edit this shop's Connect page. It is the same account as your dashboard.</p>
  <label class="lb">Email</label><input id="em" type="email" autocomplete="email">
  <label class="lb">Password</label>${pwField('pw', 'current-password')}
  <button class="btn" data-go onclick="login(this)">Sign in</button>
  <p class="note" style="margin:14px 0 0"><a href="#" onclick="forgot();return false">Forgot password?</a></p>
  <p class="note">Looking for the dashboard? <a href="${esc(adminBase())}">Open the owner dashboard</a></p></div>`;
const recoverV = () => `<div class="a-card" style="margin-top:40px;max-width:420px;margin-inline:auto"><h2>Set a new password</h2><p class="sub">Choose a new password for your owner account.</p>
  <label class="lb">New password <span>(6+ characters)</span></label>${pwField('np', 'new-password')}
  <button class="btn" data-go onclick="setPw(this)">Save password</button></div>`;
const forShop = () => `<div class="a-card" style="margin-top:40px"><h2>Shop not found</h2><p class="sub">This address is not linked to a shop. Check the link, or ask the platform for help.</p><button class="btn alt" onclick="out()">Sign out</button></div>`;

// How complete the page is: each item says where to fix it.
function strength() {
  const V = vertical(bz.vertical);
  const L = [
    ['story', 'Hero photo', !!bz.hero_url], ['story', 'Description', !!String(bz.about || '').trim()],
    ['contact', 'Phone', !!(bz.phone || bz.wa_phone)], ['contact', 'Address', !!(bz.address || bz.maps_url || bz.lat != null)],
    ['products', V.section, ITEMS.length > 0], ['photos', 'Photos', (bz.gallery || []).length > 0],
    ['links', 'Social links', !!(bz.ig || bz.fb || bz.yt || bz.web || (bz.links || []).length)]
  ];
  return { L, done: L.filter(x => x[2]).length, pct: Math.round(L.filter(x => x[2]).length / L.length * 100) };
}
const NAV = [
  ['story', 'Story', ico('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-4.5 4 3.5 3-2.5 4 3.5"/>')],
  ['brand', 'Branding', ico('<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.2-1-1.5-1-2.6 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>')],
  ['contact', 'Contact', ico('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>')],
  ['links', 'Links', ico('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')],
  ['products', 'Products', ico('<path d="M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0"/>')],
  ['photos', 'Photos', ico('<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>')],
  ['share', 'Share', ico('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v0M21 21h-4v-4"/>')]
];
function shell() {
  const S = strength(), r = 26, C = 2 * Math.PI * r, missing = S.L.filter(x => !x[2]);
  const todo = { story: S.L[0][2] && S.L[1][2], contact: S.L[2][2] && S.L[3][2], products: S.L[4][2], photos: S.L[5][2], links: S.L[6][2] };
  return `<header class="ce-top"><div class="ce-top-in">
    <div class="ce-id"><div class="ce-logo">${mark(bz)}</div><div class="ce-name"><b>${esc(bz.name)}</b><span>Connect editor</span></div>
      <a class="a-ib" href="${esc(shareUrl())}" target="_blank" rel="noopener" title="View my page">${I.eye}</a>
      <button class="a-ib" title="Sign out" onclick="out()">${I.signout}</button></div>
    <div class="ce-meter">
      <svg class="ce-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="bg"/><circle cx="32" cy="32" r="${r}" class="fg" stroke-dasharray="${(C * S.pct / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/></svg>
      <div class="ce-mt"><b>${S.pct}% ready</b><span>${missing.length ? 'Add these to finish your page' : 'Your page is complete'}</span></div>
      <div class="ce-chips">${missing.map(x => `<button type="button" onclick="go('${x[0]}')">+ ${esc(x[1])}</button>`).join('')}</div>
    </div>
    <button type="button" class="ce-link" onclick="copyShare()" title="Copy link">${I.copy}<span>${esc(shareUrl().replace(/^https?:\/\//, ''))}</span></button>
  </div></header>
  ${support ? `<div class="a-support" style="margin:12px auto;max-width:1180px">Support mode · managing for the owner. Changes are logged.</div>` : ''}
  <div class="ce-layout">
    <nav class="ce-nav" aria-label="Sections">${NAV.map(n => `<button class="${tab == n[0] ? 'on' : ''}" onclick="go('${n[0]}')"><i>${n[2]}</i><span>${n[1]}</span>${todo[n[0]] === false ? '<em title="Not finished"></em>' : ''}</button>`).join('')}</nav>
    <div class="ce-form"><div id="ce-notes" class="ce-notes">${noticesV()}</div>${tabV()}</div>
    <aside class="ce-pv">
      <div class="ce-pv-h"><b>Live preview</b><a href="${esc(shareUrl())}" target="_blank" rel="noopener">Open full page</a></div>
      <div class="ce-phone"><i class="ce-notch"></i><div class="ce-screen"><div id="pv" class="cn"></div></div></div>
      <p class="note">Updates as you type. The real page uses your saved details.</p>
    </aside>
  </div>`;
}

function tabV() {
  if (tab == 'story') return tabStory();
  if (tab == 'contact') return tabContact();
  if (tab == 'links') return tabLinks();
  if (tab == 'products') return tabProducts();
  if (tab == 'photos') return tabPhotos();
  if (tab == 'share') return tabShare();
  return tabBrand();
}

function tabStory() {
  const hero = bz.hero_url && /^(https:|data:image)/.test(bz.hero_url) ? bz.hero_url : (String(CFG.slug || '').toLowerCase() === 'aroma-scripts' ? pubOrigin() + '/assets/aroma-scripts-hero.svg' : '');
  return `<div class="a-card ce-card"><div class="a-h"><h2>Hero &amp; story</h2></div>
  <p class="sub">The first thing visitors see: a big photo with your shop name on it, and a few lines about you right below.</p>
  <label class="lb">Hero photo <span>(wide photo works best)</span></label>
  <div id="hrpv" class="ce-hero${hero ? ' has' : ''}"><div class="ce-hero-img">${hero ? `<img src="${esc(hero)}" alt="">` : ''}</div>
    <div class="ce-hero-empty">${ico('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-4.5 4 3.5 3-2.5 4 3.5"/>')}<b>Add a hero photo</b><small>Shown behind your name. We darken the bottom so it stays readable.</small></div>
    <label class="ce-hero-pick">${hero ? 'Change photo' : 'Choose photo'}<input id="hrf" type="file" accept="image/*" onchange="pvHero(this)" hidden></label>
    <button type="button" class="ce-hero-rm" onclick="rmHero()">Remove</button></div>
  <input type="hidden" id="hrrm" value="0">
  <label class="lb">Description <span>(a few lines about your shop)</span></label>
  <textarea id="ab" rows="5" maxlength="600" placeholder="Tell visitors what makes your shop special: what you make, your story, what to try first." oninput="cnt()">${esc(bz.about || (CFG.slug === "aroma-scripts" ? "At Aroma Scripts, we believe every fragrance tells a story, evokes an emotion, and creates a memory worth remembering. Our perfumes are handcrafted in small batches with carefully selected fragrance oils and a 30% fragrance concentration. From fresh notes to deep, indulgent compositions, each scent celebrates individuality. We also create bespoke fragrances tailored to your preferences." : ""))}</textarea>
  <div class="ce-count" id="abc">${(bz.about || '').length} / 600</div>
  <p class="note" style="text-align:left;margin:6px 0 0">Leave a blank line to start a new paragraph.</p>
  <label class="ce-sw"><input id="ly" type="checkbox"${bz.connect_loyalty !== false ? ' checked' : ''} onchange="pv()"><span class="ce-sw-t"><b>Show “Join the loyalty card”</b><small>Switch off while you are not running a loyalty card. You can turn it back on any time.</small></span><i aria-hidden="true"></i></label>
  <button class="btn" data-go onclick="saveStory(this)">Save story</button></div>`;
}


function tabBrand() {
  const V = vertical(bz.vertical), c = HEX6.test(bz.color) ? bz.color : '#8a4b2a';
  return `<div class="a-card"><div class="a-h"><h2>Branding</h2></div>
  <p class="sub">The name, tagline, colour and logo at the top of your Connect page.</p>
  <label class="lb">Shop name</label><input id="nm" value="${esc(bz.name)}" maxlength="60" oninput="pv()">
  <label class="lb">Tagline <span>(one line)</span></label><input id="tg" value="${esc(bz.tagline || (CFG.slug === "aroma-scripts" ? "Every Scent Has a Story." : ""))}" maxlength="90" placeholder="e.g. Coffee, bakes and good times." oninput="pv()">
  <label class="lb">Shop type</label><select id="vt" onchange="pv()">${Object.values(window.VERTICALS).map(v => `<option value="${esc(v.key)}"${v.key == bz.vertical ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
  <p class="note">Sets the words on your page (${esc(V.section.toLowerCase())}) and the sample content you can add.</p>
  <label class="lb">Brand colour</label>
  <div class="ca-color"><input id="colp" type="color" value="${esc(c)}" oninput="colFromPick()"><input id="col" value="${esc(c)}" maxlength="7" oninput="colFromText()" aria-label="Colour code"></div>
  <label class="lb">Logo <span>(optional)</span></label>
  <div class="ca-img"><div id="lgpv" class="ca-thumb">${bz.logo_url && /^(https:|data:)/.test(bz.logo_url) ? `<img src="${esc(bz.logo_url)}" alt="">` : ''}</div>
    <div><input id="lgf" type="file" accept="image/*" onchange="pvLogo(this)"><button type="button" class="lnk" onclick="rmLogo()">Remove logo</button></div></div>
  <input type="hidden" id="lgrm" value="0">
  <button class="btn" data-go onclick="saveBrand(this)">Save branding</button></div>`;
}

function tabContact() {
  const map = bz.maps_url || (bz.lat != null && bz.lng != null ? bz.lat + ',' + bz.lng : '');
  return `<div class="a-card"><div class="a-h"><h2>Contact &amp; location</h2></div>
  <p class="sub">These power the Directions, Call and WhatsApp buttons at the top of your page.</p>
  <label class="lb">Phone number <span>(for calls)</span></label><input id="ph" value="${esc(bz.phone)}" placeholder="+91 80889 51925" oninput="pv()">
  <label class="lb">WhatsApp number <span>(for messages &amp; orders)</span></label><input id="wap" value="${esc(bz.wa_phone)}" placeholder="+91 80889 51925" oninput="pv()">
  <p class="note">Leave the WhatsApp number blank if it is the same as the phone number.</p>
  <label class="lb">Address</label><input id="ad" value="${esc(bz.address)}" placeholder="Shop, street, area, city" oninput="pv()">
  <label class="lb">Google Maps link <span>(optional)</span></label><input id="map" value="${esc(bz.maps_url)}" placeholder="https://maps.app.goo.gl/..." oninput="pv()">
  <p class="note">Open your shop in Google Maps → Share → Copy link, and paste it here. If you leave it blank we use your address.</p>
  <div class="ca-2"><div><label class="lb">Latitude <span>(optional)</span></label><input id="lat" value="${bz.lat != null ? esc(bz.lat) : ''}" inputmode="decimal" placeholder="12.9721" oninput="pv()"></div>
    <div><label class="lb">Longitude <span>(optional)</span></label><input id="lng" value="${bz.lng != null ? esc(bz.lng) : ''}" inputmode="decimal" placeholder="77.5933" oninput="pv()"></div></div>
  <label class="lb">Google review link <span>(optional)</span></label><input id="rv" value="${esc(bz.review_url)}" placeholder="https://g.page/r/.../review" oninput="pv()">
  <p class="note">From your Google Business Profile → "Ask for reviews" → copy the link. We show an honest, no-rewards review button.</p>
  <button class="btn" data-go onclick="saveContact(this)">Save contact details</button></div>`;
}

function tabLinks() {
  return `<div class="a-card"><div class="a-h"><h2>Social links</h2></div>
  <p class="sub">Only the links you fill in are shown on your page.</p>
  <label class="lb">Instagram</label><input id="ig" value="${esc(bz.ig)}" placeholder="https://instagram.com/yourbrand">
  <label class="lb">Facebook</label><input id="fb" value="${esc(bz.fb)}" placeholder="https://facebook.com/yourbrand">
  <label class="lb">YouTube</label><input id="yt" value="${esc(bz.yt)}" placeholder="https://youtube.com/@yourbrand">
  <label class="lb">Website</label><input id="web" value="${esc(bz.web)}" placeholder="https://yourbrand.com">
  <label class="lb">Other links <span>(e.g. book a table, order online)</span></label>
  <div id="lnkr">${dlinks.map((l, i) => `<div class="ca-lrow"><input class="ca-ll" value="${esc(l.label)}" placeholder="Label" maxlength="30"><input class="ca-lu" value="${esc(l.url)}" placeholder="https://..."><button type="button" class="ca-x" title="Remove" onclick="rmLink(${i})">×</button></div>`).join('') || '<p class="note" style="margin-top:0">No extra links yet.</p>'}</div>
  <button type="button" class="lnk" onclick="addLink()">+ Add a link</button>
  <button class="btn" data-go onclick="saveLinks(this)">Save links</button></div>`;
}

function tabProducts() {
  const V = vertical(bz.vertical), empty = !CATS.length && !ITEMS.length;
  return `${empty ? `<div class="a-card"><div class="a-h"><h2>${esc(V.section)}</h2><span class="pill">Empty</span></div>
    <p class="sub">Add your ${esc(V.items)} one by one, or start with a sample list you can edit.</p>
    <div class="ca-acts"><button class="btn" onclick="editItem(null)">+ Add first ${esc(V.item)}</button><button class="btn alt" onclick="addSample(this)">Use sample ${esc(V.items)}</button></div></div>` : ''}
  ${form ? itemForm(V) : ''}
  <div class="a-card"><div class="a-h"><h2>${esc(V.section)}</h2><span class="mut sm">${ITEMS.length} ${esc(V.items)}</span></div>
    ${ITEMS.length ? ITEMS.map((x, i) => { const cat = CATS.find(c => c.id == x.category_id); return `<div class="of ca-row"><div><b>${esc(x.title)}</b><div class="mut sm">${esc([x.price, cat && cat.name].filter(Boolean).join(' · ') || 'No price')}</div></div>
      <div class="ca-rowbt"><button class="a-ib" title="Move up" onclick="moveItem('${x.id}',-1)"${i == 0 ? ' disabled' : ''}>${I.up}</button>
      <button class="a-ib" title="Move down" onclick="moveItem('${x.id}',1)"${i == ITEMS.length - 1 ? ' disabled' : ''}>${I.down}</button>
      <button class="a-ib" title="Edit" onclick="editItemId('${x.id}')">${I.edit}</button>
      <button class="a-ib" title="Delete" onclick="delItem('${x.id}')">${I.trash}</button></div></div>` }).join('')
    : '<p class="a-empty">Nothing here yet.</p>'}
    <button class="btn alt" onclick="editItem(null)">+ Add ${esc(V.item)}</button></div>
  <div class="a-card"><div class="a-h"><h2>Categories</h2></div>
    <p class="sub">Group your ${esc(V.items)} into sections (like "Coffee" or "Kerala specials"). Optional.</p>
    ${CATS.map(c => `<div class="ca-lrow"><input id="cat-l-${c.id}" value="${esc(c.name)}" maxlength="40"><button type="button" class="btn sm" onclick="saveCat('${c.id}')">Save</button><button type="button" class="ca-x" title="Delete" onclick="delCat('${c.id}')">×</button></div>`).join('')}
    <div class="ca-lrow"><input id="cat-new" placeholder="New category name" maxlength="40"><button type="button" class="btn sm" onclick="addCat()">Add</button></div></div>`;
}
function itemForm(V) {
  return `<div class="a-card"><div class="a-h"><h2>${form.id ? 'Edit' : 'Add'} ${esc(V.item)}</h2></div>
  <label class="lb">Name</label><input id="it-t" value="${esc(form.title)}" maxlength="80">
  <label class="lb">Price <span>(optional)</span></label><input id="it-p" value="${esc(form.price)}" maxlength="24" placeholder="₹80">
  <label class="lb">Description <span>(optional)</span></label><textarea id="it-d" rows="2" maxlength="600">${esc(form.description)}</textarea>
  <label class="lb">Category</label><select id="it-c"><option value="">None</option>${CATS.map(c => `<option value="${esc(c.id)}"${c.id == form.category_id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
  <label class="lb">Photo <span>(optional)</span></label>
  <div class="ca-img"><div id="it-pv" class="ca-thumb">${form.image_url && /^(https:|data:)/.test(form.image_url) ? `<img src="${esc(form.image_url)}" alt="">` : ''}</div><input id="it-f" type="file" accept="image/*" onchange="pvItem(this)"></div>
  <div class="ca-acts"><button class="btn" data-go onclick="saveItem(this)">Save ${esc(V.item)}</button><button class="btn alt" onclick="form=null;render()">Cancel</button></div></div>`;
}

function tabPhotos() {
  return `<div class="a-card"><div class="a-h"><h2>Photos</h2></div>
  <p class="sub">A few pictures of your shop, food or work. Shown as a gallery on your page.</p>
  <div class="ca-gal">${dgal.map((u, i) => `<div class="ca-g"><img src="${esc(u)}" alt=""><button type="button" class="ca-x" title="Remove" onclick="rmPhoto(${i})">×</button></div>`).join('') || '<p class="a-empty">No photos yet.</p>'}</div>
  <label class="btn alt ca-up">Add photos<input type="file" accept="image/*" multiple onchange="onPhotos(this)" hidden></label></div>`;
}

function tabShare() {
  const url = shareUrl(), V = vertical(bz.vertical);
  const svg = typeof qrcode == 'undefined' ? '' : (() => { const z = qrcode(0, 'M'); z.addData(url); z.make(); return z.createSvgTag({ cellSize: 5, margin: 2, scalable: true }) })();
  return `<div class="a-card"><div class="a-h"><h2>Share your page</h2></div>
  <p class="sub">One link with your contact, rewards and ${esc(V.items)} — send it on WhatsApp, print it, or write it to a keychain tag.</p>
  <label class="lb">Your Connect link</label>
  <div class="ca-copy"><input value="${esc(url)}" readonly onclick="this.select()"><button type="button" class="btn sm" onclick="copyShare()">${I.copy} Copy</button></div>
  <div class="ca-acts"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${I.eye} View my page</a>
    <a class="btn alt" href="https://wa.me/?text=${encodeURIComponent('Check out ' + bz.name + ': ' + url)}" target="_blank" rel="noopener">${I.wa} Share on WhatsApp</a></div>
  <div class="ca-qrbox"><div class="ca-qr">${svg || '<p class="sub">QR unavailable.</p>'}</div>
    ${svg ? '<button type="button" class="btn alt" onclick="downloadQr()">Download QR (SVG)</button>' : ''}
    <p class="note">Print this on your counter, receipts or a table card.</p></div></div>
  <div class="a-card"><div class="a-h"><h2>NFC keychain</h2></div>
    <p class="sub">Your Connect link is also the link to write to an NFC tag, so a tap opens this page.</p>
    <ol class="ca-steps"><li>Install a free NFC writer app (e.g. "NFC Tools").</li><li>Choose "Write" → "URL / URI".</li><li>Paste <b>${esc(url)}</b> and hold the tag to your phone.</li><li>Test it — tapping the tag should open your page.</li></ol></div>`;
}
function downloadQr() {
  const el = $('.ca-qr svg'); if (!el) return;
  const blob = new Blob([el.outerHTML], { type: 'image/svg+xml' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (bz.slug || 'shop') + '-qr.svg';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const copyShare = () => copyText(shareUrl(), 'Link copied');

// ---------- render ----------
function render() {
  const app = $('#app');
  if (notReady()) { app.innerHTML = setupMsg; return }
  app.className = '';
  if (recover) { app.innerHTML = recoverV(); return }
  if (!signed) { app.innerHTML = loginV(); return }
  if (!bz) { app.innerHTML = forShop(); return }
  app.className = 'ce';
  app.innerHTML = shell();
  pv();
}

(async () => {
  if (notReady()) { render(); return }
  recover = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);
  const { data } = await sb.auth.getSession();
  if (data && data.session && !recover) { await enter(); return }
  render();
  sb.auth.onAuthStateChange((ev) => { if (ev == 'PASSWORD_RECOVERY') { recover = true; render() } });
})();
