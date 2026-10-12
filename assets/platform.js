// Platform admin: one place to create and manage every shop that runs on this deployment.
// Talks only to the platform_* SQL functions, which check that the signed-in user is in platform_admins.
const sb = notReady() ? null : mkClient('lk-platform');
let signed = false, denied = false, rows = [], busy = false, created = null, err = '';

const ago = t => { if (!t) return 'never'; const d = Math.floor((Date.now() - new Date(t)) / 864e5); return d <= 0 ? 'today' : d == 1 ? 'yesterday' : d + ' days ago' };
// The address customers use for a shop: its first custom domain, else <slug>.<baseDomain>, else null.
const shopHost = r => (r.domains && r.domains[0]) || (CFG.baseDomain ? r.slug + '.' + String(CFG.baseDomain).replace(/^\./, '') : null);
const shopUrl = (r, path) => { const h = shopHost(r); return h ? 'https://' + h + (path || '/app/') : null };
const missingSql = e => /function|schema cache|does not exist/i.test(String(e && e.message || e)) ? 'Run supabase/2026-10-12-platform.sql in Supabase first.' : null;

async function enter() {
  signed = true; denied = false; err = '';
  try { rows = await rpc(sb, 'platform_overview') }
  catch (e) { rows = []; if (/not allowed/i.test(String(e && e.message || e))) denied = true; else err = missingSql(e) || nice(e) }
  render();
}
async function login(btn) {
  const email = v('em').trim(), password = v('pw');
  if (!email || !password) return toast('Enter your email and password');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { btn.disabled = false; return toast(nice(error)) }
  await enter();
}
async function out() { await sb.auth.signOut(); signed = false; denied = false; rows = []; created = null; render() }

async function createShop(btn) {
  const slug = v('ns').trim().toLowerCase(), name = v('nn').trim(), email = v('ne').trim().toLowerCase(), pw = v('np'), color = v('nc') || '#8a4b2a';
  if (!slug || !name || !email) return toast('Fill in the shop address, name and owner email');
  if (pw && pw.length < 6) return toast('The owner password must be at least 6 characters');
  btn.disabled = true;
  try {
    // 1) Make the owner's login if a password was given. A separate, non-saving client so this admin stays signed in.
    if (pw) {
      const tmp = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'lk-tmp' } });
      const { error } = await tmp.auth.signUp({ email, password: pw });
      if (error && !/already (been )?registered/i.test(error.message)) throw error;
    }
    // 2) Create the shop and make that account its owner.
    await rpc(sb, 'platform_create_business', { p_slug: slug, p_name: name, p_owner_email: email, p_tagline: '', p_color: color });
    created = { slug, name, email, pw };
    rows = await rpc(sb, 'platform_overview');
    toast('Shop created');
  } catch (e) { toast(missingSql(e) || nice(e)) }
  btn.disabled = false; render();
}
async function addDomain(slug) {
  const el = $('#dm-' + slug), host = (el.value || '').trim().toLowerCase();
  if (!host) return toast('Type the domain first');
  try { await rpc(sb, 'platform_set_domain', { p_slug: slug, p_host: host }); rows = await rpc(sb, 'platform_overview'); render(); toast('Domain saved. Now add it in Vercel too (see README).') }
  catch (e) { toast(nice(e)) }
}
async function rmDomain(host) {
  if (!confirm('Remove ' + host + ' from this shop? Customers using that address will see "Shop not found".')) return;
  try { await rpc(sb, 'platform_remove_domain', { p_host: host }); rows = await rpc(sb, 'platform_overview'); render() } catch (e) { toast(nice(e)) }
}
async function setOwner(slug) {
  const email = (prompt('New owner email for "' + slug + '" (they must already have an account):') || '').trim();
  if (!email) return;
  try { await rpc(sb, 'platform_set_owner', { p_slug: slug, p_owner_email: email }); rows = await rpc(sb, 'platform_overview'); render(); toast('Owner changed') } catch (e) { toast(nice(e)) }
}
const cp = (slug, path) => { const r = rows.find(x => x.slug == slug), u = r && shopUrl(r, path); if (!u) return toast('Add a domain first, or set baseDomain in config.js'); copyText(u, 'Link copied') };

const loginV = () => `<div class="card" style="margin-top:40px"><h2>Platform login</h2><p class="sub">Sign in with your platform admin account.</p>
  <label class="lb">Email</label><input id="em" type="email" autocomplete="email">
  <label class="lb">Password</label>${pwField('pw', 'current-password')}
  <button class="btn" data-go onclick="login(this)">Sign in</button></div>`;
const deniedV = () => `<div class="card" style="margin-top:40px"><h2>No access</h2><p class="sub">This account is not a platform admin. In Supabase, run:<br><code>insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';</code></p><button class="btn alt" onclick="out()">Sign out</button></div>`;

function shopV(r) {
  const host = shopHost(r), dom = (r.domains || []).map(d => `<span class="chip">${esc(d)} <button class="lnk" aria-label="Remove ${esc(d)}" onclick="rmDomain('${esc(d)}')">×</button></span>`).join('');
  return `<div class="card"><div class="a-h"><h2>${esc(r.name)}</h2><span class="a-tag">${esc(r.slug)}</span></div>
    <p class="sub">Owner: <b>${esc(r.owner_email || 'none')}</b> · created ${esc(fd(r.created_at))}</p>
    <div class="a-sts"><div class="a-st"><b>${r.members}</b><span>Members</span></div><div class="a-st"><b>${r.stamps_30d}</b><span>Stamps, 30 days</span></div><div class="a-st"><b style="font-size:16px">${esc(ago(r.last_stamp))}</b><span>Last stamp</span></div></div>
    <label class="lb">Domains</label><div class="chips" style="margin:0 0 8px">${dom || '<span class="hint">None. ' + (host ? 'Opens at ' + esc(host) + '.' : 'Not reachable until a domain is added.') + '</span>'}</div>
    <div class="row"><input id="dm-${esc(r.slug)}" placeholder="rewards.theirshop.com" autocapitalize="off"><button class="btn sm alt" onclick="addDomain('${esc(r.slug)}')">Add domain</button></div>
    <div class="row" style="margin-top:12px"><button class="btn sm alt" onclick="cp('${esc(r.slug)}','/app/')">Copy customer link</button><button class="btn sm alt" onclick="cp('${esc(r.slug)}','/admin/')">Copy owner link</button><button class="btn sm alt" onclick="setOwner('${esc(r.slug)}')">Change owner</button></div></div>`;
}
function dashV() {
  const tot = k => rows.reduce((a, r) => a + (+r[k] || 0), 0);
  const done = created ? `<div class="card"><h2>${esc(created.name)} is ready</h2><p class="sub">Send the owner these details (this box disappears when you reload).</p>
    <p style="margin:6px 0"><b>Dashboard:</b> ${esc(shopUrl(rows.find(r => r.slug == created.slug) || { slug: created.slug, domains: [] }, '/admin/') || '(add a domain first)')}<br><b>Email:</b> ${esc(created.email)}<br><b>Password:</b> ${created.pw ? esc(created.pw) : '(their existing password)'}</p>
    <button class="btn sm alt" onclick="created=null;render()">Dismiss</button></div>` : '';
  return `<div class="top" style="padding:0 0 12px"><b>All shops</b><button class="lnk" onclick="out()">Sign out</button></div>
    ${err ? `<div class="card"><p class="sub">${esc(err)}</p></div>` : ''}
    <div class="card"><div class="a-sts"><div class="a-st"><b>${rows.length}</b><span>Shops</span></div><div class="a-st"><b>${tot('members')}</b><span>Members</span></div><div class="a-st"><b>${tot('stamps_30d')}</b><span>Stamps, 30 days</span></div></div></div>
    ${done}
    <div class="card"><h2>New shop</h2><p class="sub">Creates the shop and its owner login. No separate database or deployment.</p>
      <label class="lb">Shop address <span>(letters, numbers, hyphens)</span></label><input id="ns" autocapitalize="off" placeholder="cheesora-bliss">
      <label class="lb">Shop name</label><input id="nn" placeholder="Cheesora Bliss">
      <label class="lb">Owner email</label><input id="ne" type="email" autocomplete="off">
      <label class="lb">Owner password <span>(leave blank if they already have an account here)</span></label>${pwField('np', 'new-password')}
      <label class="lb">Brand colour</label><input id="nc" type="color" value="#8a4b2a">
      <button class="btn" data-go onclick="createShop(this)">Create shop</button></div>
    ${rows.map(shopV).join('') || '<p class="a-empty">No shops yet.</p>'}`;
}
function render() {
  $('#app').innerHTML = !signed ? loginV() : denied ? deniedV() : dashV();
}
(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enter(); else render();
})();
