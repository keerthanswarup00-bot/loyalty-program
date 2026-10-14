// Platform admin: manage every shop that runs on this deployment.
// Reads and changes go through the platform_* SQL functions and the row rules in schema.sql, which all check that the
// signed-in user is in platform_admins. Changes made to a shop and customer-list views are written to platform_audit.
const sb = notReady() ? null : mkClient('lk-platform');
let signed = false, denied = false, rows = [], err = '', created = null;
let view = 'list', sel = null, ptab = 'overview';
let fq = '', fsort = 'attention', gq = '', gres = null, gt = null;
let cust = null, auditRows = null, shopAudit = null;

// ---------- helpers ----------
const dAgo = t => t ? Math.floor((Date.now() - new Date(t)) / 864e5) : null;
const ago = t => { const d = dAgo(t); return d === null ? 'never' : d <= 0 ? 'today' : d == 1 ? 'yesterday' : d + ' days ago' };
const baseDom = () => String(CFG.baseDomain || '').replace(/^\./, '');
const shopHost = r => (r.domains && r.domains[0]) || (baseDom() ? r.slug + '.' + baseDom() : null);
// Link for a shop. A single-shop deployment (config slug set) only serves its own shop on this address.
const shopUrl = (r, path) => {
  const h = shopHost(r);
  if (h) return 'https://' + h + path;
  if (path == '/app/') return location.origin + '/app/' + encodeURIComponent(r.slug);
  if (path == '/admin/') return location.origin + '/app/' + encodeURIComponent(r.slug) + '/admin';
  return null;
};
const missingSql = e => /function|schema cache|does not exist|relation/i.test(String(e && e.message || e)) ? 'Run the latest supabase/schema.sql in Supabase first.' : null;
const bad = e => toast(missingSql(e) || nice(e));
const R = slug => rows.find(r => r.slug == slug);
const num = n => (+n || 0).toLocaleString();
const AUD = { support_open: 'Opened the dashboard as owner', settings_changed: 'Changed settings', view_customers: 'Viewed the customer list', export: 'Exported data', delete_customer: 'Deleted a customer', reset_customer_password: 'Reset a customer password', import_customers: 'Imported customers', domain_added: 'Added a domain', domain_removed: 'Removed a domain', owner_changed: 'Changed the owner', shop_created: 'Created the shop', owner_reset_email: 'Sent the owner a password reset email', note: 'Note' };

// What needs your attention for this shop. level: 2 = problem, 1 = heads-up.
function flags(r) {
  const f = [], last = dAgo(r.last_stamp);
  if (!r.owner_email) f.push(['No owner', 2]);
  if (!r.members) f.push(['No customers yet', 1]);
  else if (last === null || last >= 14) f.push([last === null ? 'Never stamped' : 'Quiet ' + last + 'd', 1]);
  if (r.renews_on) { const d = Math.ceil((new Date(r.renews_on + 'T00:00') - Date.now()) / 864e5); if (d < 0) f.push(['Renewal overdue', 2]); else if (d <= 14) f.push(['Renews in ' + d + 'd', 1]) }
  return f;
}
const score = r => flags(r).reduce((a, x) => a + x[1], 0);
const chips = r => flags(r).map(x => `<span class="pf-chip l${x[1]}">${esc(x[0])}</span>`).join('');

// ---------- data ----------
async function reload() { rows = await rpc(sb, 'platform_overview') }
async function enter() {
  signed = true; denied = false; err = '';
  try { await reload() }
  catch (e) { rows = []; if (/not allowed/i.test(String(e && e.message || e))) denied = true; else err = missingSql(e) || nice(e) }
  route();
}
async function login(btn) {
  const email = v('em').trim(), password = v('pw');
  if (!email || !password) return toast('Enter your email and password');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { btn.disabled = false; return toast(nice(error)) }
  await enter();
}
async function out() { await sb.auth.signOut(); signed = false; denied = false; rows = []; created = null; cust = null; render() }

// ---------- routing (#shop=slug, #new, #audit) ----------
function route() {
  const h = location.hash, m = h.match(/shop=([a-z0-9-]+)/);
  if (m && R(m[1])) { if (sel != m[1]) { sel = m[1]; ptab = 'overview'; cust = null; shopAudit = null } view = 'shop' }
  else if (h == '#new') view = 'new';
  else if (h == '#audit') { view = 'audit'; if (!auditRows) loadAudit() }
  else { view = 'list'; sel = null }
  render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if (signed && !denied) route() });
const go = h => { location.hash = h; if (location.hash == h) route() };
const openShop = (slug, tab) => { if (tab) ptab = tab; sel = null; go('#shop=' + slug); if (tab) { ptab = tab; render() } };
const setTab = t => { ptab = t; if (t == 'customers' && !cust) loadCust(true); if (t == 'access' && !shopAudit) loadShopAudit(); render() };

// ---------- shop creation, domains, owner ----------
async function createShop(btn) {
  const slug = v('ns').trim().toLowerCase(), name = v('nn').trim(), email = v('ne').trim().toLowerCase(), pw = v('np'), color = v('nc') || '#8a4b2a';
  if (!slug || !name || !email) return toast('Fill in the shop address, name and owner email');
  if (pw && pw.length < 6) return toast('The owner password must be at least 6 characters');
  btn.disabled = true;
  try {
    if (pw) {   // a separate client that does not save its session, so this admin stays signed in
      const tmp = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'lk-tmp' } });
      const { error } = await tmp.auth.signUp({ email, password: pw });
      if (error && !/already (been )?registered/i.test(error.message)) throw error;
    }
    await rpc(sb, 'platform_create_business', { p_slug: slug, p_name: name, p_owner_email: email, p_tagline: '', p_color: color });
    created = { slug, name, email, pw }; await reload(); toast('Shop created'); go('#shop=' + slug);
  } catch (e) { bad(e) }
  btn.disabled = false;
}
async function addDomain() {
  const host = (v('dmn') || '').trim().toLowerCase(); if (!host) return toast('Type the domain first');
  try { await rpc(sb, 'platform_set_domain', { p_slug: sel, p_host: host }); await reload(); shopAudit = null; render(); toast('Domain saved. Add it in Vercel too (see README).') } catch (e) { bad(e) }
}
async function rmDomain(host) {
  if (!confirm('Remove ' + host + '? Customers using that address will see "Shop not found".')) return;
  try { await rpc(sb, 'platform_remove_domain', { p_host: host }); await reload(); shopAudit = null; render() } catch (e) { bad(e) }
}
async function setOwner() {
  const email = (prompt('New owner email for "' + sel + '" (they must already have an account):') || '').trim(); if (!email) return;
  try { await rpc(sb, 'platform_set_owner', { p_slug: sel, p_owner_email: email }); await reload(); shopAudit = null; render(); toast('Owner changed') } catch (e) { bad(e) }
}
async function ownerReset() {
  const r = R(sel); if (!r || !r.owner_email) return;
  if (!confirm('Email a password reset link to ' + r.owner_email + '?')) return;
  const { error } = await sb.auth.resetPasswordForEmail(r.owner_email, { redirectTo: shopUrl(r, '/admin/') || (location.origin + '/app/' + encodeURIComponent(r.slug) + '/admin') });
  if (error) return toast(nice(error));
  try { await rpc(sb, 'platform_log', { p_slug: sel, p_action: 'owner_reset_email' }); shopAudit = null } catch (e) { }
  toast('Reset link sent to ' + r.owner_email);
}
async function saveMeta(btn) {
  btn.disabled = true;
  try { await rpc(sb, 'platform_save_meta', { p_slug: sel, p_plan: v('mpl'), p_contact: v('mct'), p_notes: v('mno'), p_renews: v('mrn') || null }); await reload(); render(); toast('Saved') }
  catch (e) { btn.disabled = false; bad(e) }
}

// ---------- customers ----------
const PAGE = 15;
async function loadCust(reset) {
  const r = R(sel); if (!r) return;
  if (reset || !cust || cust.slug != sel) cust = { slug: sel, q: cust && cust.slug == sel ? cust.q : '', rows: [], total: 0, busy: false };
  cust.busy = true; render();
  try {
    const q = cust.q.replace(/[%,()*\\]/g, '').trim();
    let qr = sb.from('members').select('id,name,phone,stamps,total,redeemed,joined,last_stamp,wa_optout', { count: 'exact' }).eq('business_id', r.id).order('joined', { ascending: false }).order('id');
    if (q) qr = qr.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data, error, count } = await qr.range(cust.rows.length, cust.rows.length + PAGE - 1);
    if (error) throw error;
    if (!cust.rows.length) rpc(sb, 'platform_log', { p_slug: sel, p_action: 'view_customers' }).catch(() => { });
    cust.rows = cust.rows.concat(data); cust.total = count || 0;
  } catch (e) { bad(e) }
  cust.busy = false; render();
}
const custSearch = () => { cust.q = v('cq'); loadCust(true) };
async function resetPw(id, name) {
  const p = prompt('New temporary password for ' + name + ' (6+ characters). Tell them to keep it private:'); if (!p) return;
  try { await rpc(sb, 'reset_member_password', { p_member: id, p_password: p }); toast('Password changed for ' + name); shopAudit = null } catch (e) { bad(e) }
}
// CSV export. Cells that start with = + - @ get a leading apostrophe so a spreadsheet never runs them as a formula.
const csvCell = x => { let s = x == null ? '' : String(x); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s };
async function allRows(make) {
  let out = [];
  for (let from = 0; from < 200000; from += 1000) { const { data, error } = await make().range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break }
  return out;
}
async function exportShop(kind, btn) {
  const r = R(sel); btn.disabled = true;
  try {
    let head, data;
    if (kind == 'members') { head = ['name', 'phone', 'birthday', 'stamps', 'total_visits', 'rewards_redeemed', 'joined', 'last_stamp', 'whatsapp_opted_out']; data = (await allRows(() => sb.from('members').select('name,phone,bday,stamps,total,redeemed,joined,last_stamp,wa_optout').eq('business_id', r.id).order('joined').order('id'))).map(m => [m.name, m.phone, m.bday, m.stamps, m.total, m.redeemed, m.joined, m.last_stamp, m.wa_optout]) }
    else if (kind == 'visits') { head = ['when', 'customer', 'phone']; data = (await allRows(() => sb.from('visits').select('id,created_at,members(name,phone)').eq('business_id', r.id).order('id'))).map(x => [x.created_at, x.members && x.members.name, x.members && x.members.phone]) }
    else { head = ['type', 'offer', 'code', 'created', 'valid_from', 'expires', 'used']; data = (await allRows(() => sb.from('offers').select('id,type,text,code,created_at,valid_from,expires_at,used_at').eq('business_id', r.id).order('id'))).map(o => [o.type, o.text, o.code, o.created_at, o.valid_from, o.expires_at, o.used_at]) }
    const csv = [head, ...data].map(a => a.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = r.slug + '-' + kind + '-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    rpc(sb, 'platform_log', { p_slug: sel, p_action: 'export', p_detail: { kind, rows: data.length } }).catch(() => { });
    toast(data.length + ' rows exported');
  } catch (e) { bad(e) }
  btn.disabled = false;
}

// ---------- find a customer across all shops ----------
function gFind() {
  gq = v('gq'); clearTimeout(gt);
  if (gq.trim().length < 3) { gres = null; return drawG() }
  gt = setTimeout(async () => { try { gres = await rpc(sb, 'platform_find_member', { p_q: gq }) } catch (e) { gres = []; bad(e) } drawG() }, 300);
}
const drawG = () => { const el = $('#gres'); if (el) el.innerHTML = gV() };
const gV = () => gres === null ? '' : gres.length
  ? `<div class="pf-res">${gres.map(m => `<button onclick="openShop('${esc(m.slug)}','customers');cust={slug:'${esc(m.slug)}',q:'${esc(String(m.phone).replace(/\D/g, ''))}',rows:[],total:0,busy:false};loadCust(true)"><b>${esc(m.name)}</b><span>${esc(m.phone)} · ${esc(m.shop)}</span><small>${m.stamps} stamps · last ${esc(ago(m.last_stamp))}</small></button>`).join('')}</div>`
  : '<p class="hint">No customer matches that.</p>';

// ---------- audit ----------
async function loadAudit() { try { auditRows = await rpc(sb, 'platform_audit_list', { p_slug: null, p_limit: 150 }) } catch (e) { auditRows = []; bad(e) } if (view == 'audit') render() }
async function loadShopAudit() { try { shopAudit = await rpc(sb, 'platform_audit_list', { p_slug: sel, p_limit: 50 }) } catch (e) { shopAudit = []; } if (view == 'shop') render() }
const audRow = (a, showShop) => `<div class="of"><div><b>${esc(AUD[a.action] || a.action)}</b>${showShop ? ` <span class="mut sm">· ${esc(a.slug || '')}</span>` : ''}<div class="mut sm">${esc(a.admin_email || '')}${a.detail && a.detail.fields ? ' · ' + esc(a.detail.fields.join(', ')) : a.detail && a.detail.host ? ' · ' + esc(a.detail.host) : a.detail && a.detail.kind ? ' · ' + esc(a.detail.kind) + ' (' + a.detail.rows + ')' : ''}</div></div><span class="mut sm">${esc(fdt(a.created_at))}</span></div>`;

// ---------- views ----------
const MARK = '<svg class="pf-mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 4.2" stroke-linecap="round"/><text x="20" y="25" text-anchor="middle" font-size="13" font-weight="800" fill="currentColor" font-family="Figtree,system-ui,sans-serif">+1</text></svg>';
const loginV = () => `<div class="pf-top" style="margin-top:24px"><span class="pf-brand">${MARK}Innondu</span></div><div class="card"><h2>Platform login</h2><p class="sub">Sign in with your platform admin account.</p>
  <label class="lb">Email</label><input id="em" type="email" autocomplete="email">
  <label class="lb">Password</label>${pwField('pw', 'current-password')}
  <button class="btn" data-go onclick="login(this)">Sign in</button></div>`;
const deniedV = () => `<div class="card" style="margin-top:40px"><h2>No access</h2><p class="sub">This account is not a platform admin. In Supabase, run:<br><code>insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';</code></p><button class="btn alt" onclick="out()">Sign out</button></div>`;
const topV = () => `<div class="pf-top"><button class="pf-brand" onclick="go('#')" aria-label="All shops">${MARK}Innondu<em>Platform</em></button><span><button class="lnk" onclick="go('#audit')">Activity log</button> · <button class="lnk" onclick="out()">Sign out</button></span></div>${err ? `<div class="card"><p class="sub">${esc(err)}</p></div>` : ''}`;

function listV() {
  const q = fq.toLowerCase(), S = {
    attention: (a, b) => score(b) - score(a) || a.stamps_30d - b.stamps_30d, active: (a, b) => b.stamps_30d - a.stamps_30d,
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at), name: (a, b) => a.name.localeCompare(b.name)
  }[fsort];
  const L = rows.filter(r => !q || (r.name + ' ' + r.slug + ' ' + (r.owner_email || '') + ' ' + (r.domains || []).join(' ') + ' ' + r.contact).toLowerCase().includes(q)).sort(S);
  const tot = k => rows.reduce((a, r) => a + (+r[k] || 0), 0), need = rows.filter(r => score(r) > 0).length;
  const row = r => `<button class="pf-row" onclick="openShop('${esc(r.slug)}')"><i class="pf-dot" style="background:${esc(HEX6.test(r.color) ? r.color : '#8a4b2a')}"></i>
    <span class="pf-main"><b>${esc(r.name)}</b><small>${esc(r.slug)} · ${esc(r.owner_email || 'no owner')}</small><span class="pf-chips">${chips(r)}</span></span>
    <span class="pf-nums"><span><b>${num(r.members)}</b>customers</span><span><b>${num(r.stamps_7d)}</b>stamps 7d</span><span><b>${esc(ago(r.last_stamp))}</b>last stamp</span></span></button>`;
  return topV() + `<div class="card"><div class="a-sts"><div class="a-st"><b>${rows.length}</b><span>Shops</span></div><div class="a-st"><b>${num(tot('members'))}</b><span>Customers</span></div><div class="a-st"><b>${num(tot('stamps_30d'))}</b><span>Stamps, 30 days</span></div><div class="a-st"><b>${need}</b><span>Need a look</span></div></div></div>
    <div class="card"><h2 style="font-size:17px">Find a customer in any shop</h2><input id="gq" placeholder="Phone number or name" value="${esc(gq)}" oninput="gFind()" autocomplete="off"><div id="gres">${gV()}</div></div>
    <div class="pf-bar"><input id="fq" placeholder="Search shops, owners, domains" value="${esc(fq)}" oninput="fq=this.value;drawList()"><select onchange="fsort=this.value;drawList()" aria-label="Sort">${[['attention', 'Needs attention'], ['active', 'Most active'], ['newest', 'Newest'], ['name', 'Name']].map(o => `<option value="${o[0]}"${fsort == o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select><button class="btn sm" onclick="go('#new')">+ New shop</button></div>
    <div id="pfl">${L.map(row).join('') || '<p class="a-empty">No shops match.</p>'}</div>`;
}
const drawList = () => { const el = $('#pfl'); if (!el) return; const keep = fq; render(); const i = $('#fq'); if (i) { i.focus(); i.setSelectionRange(keep.length, keep.length) } };

function newV() {
  return topV() + `<div class="card"><button class="lnk" onclick="go('#')">← All shops</button><h2 style="margin-top:8px">New shop</h2><p class="sub">Creates the shop and its owner login. No separate database or deployment.</p>
    <label class="lb">Shop address <span>(letters, numbers, hyphens)</span></label><input id="ns" autocapitalize="off" placeholder="cheesora-bliss">
    <label class="lb">Shop name</label><input id="nn" placeholder="Cheesora Bliss">
    <label class="lb">Owner email</label><input id="ne" type="email" autocomplete="off">
    <label class="lb">Owner password <span>(leave blank if they already have an account here)</span></label>${pwField('np', 'new-password')}
    <label class="lb">Brand colour</label><input id="nc" type="color" value="#8a4b2a">
    <button class="btn" data-go onclick="createShop(this)">Create shop</button></div>`;
}
function auditV() {
  return topV() + `<div class="card"><button class="lnk" onclick="go('#')">← All shops</button><h2 style="margin-top:8px">Activity log</h2><p class="sub">Everything done to a shop from the platform: support sessions, setting changes, exports, customer-list views. Shop owners see their own shop's entries in More → Support access.</p>
    ${auditRows ? auditRows.map(a => audRow(a, true)).join('') || '<p class="a-empty">Nothing yet.</p>' : '<p class="a-empty">Loading…</p>'}</div>`;
}

function shopV() {
  const r = R(sel); if (!r) return topV();
  const cu = shopUrl(r, '/app/'), ad = (shopUrl(r, '/admin/') || (location.origin + '/app/' + encodeURIComponent(r.slug) + '/admin')) + '?as=' + encodeURIComponent(r.slug);
  const doneBox = created && created.slug == r.slug ? `<div class="card"><h2>${esc(r.name)} is ready</h2><p class="sub">Send the owner these details (this box disappears when you leave the page).</p>
    <p style="margin:6px 0"><b>Dashboard:</b> ${esc((shopUrl(r, '/admin/')) || '(add a domain first)')}<br><b>Email:</b> ${esc(created.email)}<br><b>Password:</b> ${created.pw ? esc(created.pw) : '(their existing password)'}</p><button class="btn sm alt" onclick="created=null;render()">Dismiss</button></div>` : '';
  const tabs = [['overview', 'Overview'], ['customers', 'Customers'], ['access', 'Access and notes']].map(t => `<button class="${ptab == t[0] ? 'on' : ''}" onclick="setTab('${t[0]}')">${t[1]}</button>`).join('');
  return topV() + doneBox + `<div class="card"><button class="lnk" onclick="go('#')">← All shops</button>
    <div class="pf-head"><i class="pf-dot big" style="background:${esc(HEX6.test(r.color) ? r.color : '#8a4b2a')}"></i><div><h2 style="margin:0">${esc(r.name)}</h2><div class="mut sm">${esc(r.slug)}${shopHost(r) ? ' · ' + esc(shopHost(r)) : ''}</div></div></div>
    <div class="pf-chips" style="margin:8px 0 12px">${chips(r)}</div>
    <div class="row"><a class="btn sm" href="${ad}" target="_blank" rel="noopener">Open dashboard as owner</a><a class="btn sm alt" href="${ad}&tab=ins" target="_blank" rel="noopener">Insights</a>${cu ? `<a class="btn sm alt" href="${esc(cu)}" target="_blank" rel="noopener">Customer app</a>` : ''}</div>
    <p class="hint">Opening the dashboard lets you change anything the owner can (offers, brand, menu, customers). It is logged and the owner sees it in their dashboard.</p></div>
    <div class="tabs">${tabs}</div>` + (ptab == 'customers' ? custV(r) : ptab == 'access' ? accessV(r) : overviewV(r));
}
function overviewV(r) {
  const st = (b, l) => `<div class="a-st"><b>${b}</b><span>${l}</span></div>`;
  const rate = r.coupons_30d ? Math.round(r.redeemed_30d / r.coupons_30d * 100) + '%' : '—';
  return `<div class="card"><div class="a-sts">${st(num(r.members), 'Customers')}${st('+' + num(r.new_members_7d), 'New, 7 days')}${st(num(r.stamps_7d), 'Stamps, 7 days')}${st(num(r.stamps_30d), 'Stamps, 30 days')}${st(num(r.coupons_30d), 'Coupons issued, 30d')}${st(num(r.redeemed_30d) + ' (' + rate + ')', 'Redeemed, 30d')}</div>
    <p class="sub" style="margin-top:14px">Owner <b>${esc(r.owner_email || 'none')}</b> · last stamp ${esc(ago(r.last_stamp))} · created ${esc(fd(r.created_at))}<br>Card: ${r.need} stamps for "${esc(r.reward)}" · time zone ${esc(r.tz)}</p></div>
    <div class="card"><h2 style="font-size:17px">Your notes <span class="mut sm">(private, never shown to the shop)</span></h2>
      <label class="lb">Plan</label><input id="mpl" value="${esc(r.plan)}" placeholder="e.g. Monthly 999">
      <label class="lb">Contact</label><input id="mct" value="${esc(r.contact)}" placeholder="Name, phone, best time to call">
      <label class="lb">Renews on</label><input id="mrn" type="date" value="${esc(r.renews_on || '')}">
      <label class="lb">Notes</label><textarea id="mno" rows="4">${esc(r.notes)}</textarea>
      <button class="btn" onclick="saveMeta(this)">Save notes</button></div>`;
}
function custV(r) {
  const c = cust && cust.slug == sel ? cust : null;
  const item = m => `<div class="pf-cu"><div><b>${esc(m.name)}</b><div class="mut sm">${esc(m.phone)} · ${m.stamps}/${r.need} stamps · ${m.total} visits${m.wa_optout ? ' · WhatsApp off' : ''}</div><div class="mut sm">Joined ${esc(fd(m.joined))} · last visit ${esc(ago(m.last_stamp))}</div></div>
    <span class="pf-act"><a class="btn sm alt" href="${esc(waLink(m.phone, ''))}" target="_blank" rel="noopener">WhatsApp</a><button class="btn sm alt" onclick="resetPw('${esc(m.id)}','${esc(m.name).replace(/'/g, '')}')">Reset password</button></span></div>`;
  return `<div class="card"><div class="a-h"><h2>Customers</h2><span class="mut sm">${c ? num(c.total) + (c.q ? ' match' : ' in total') : ''}</span></div>
    <div class="pf-bar" style="margin:8px 0"><input id="cq" placeholder="Search name or phone" value="${esc(c ? c.q : '')}" onkeydown="if(event.key=='Enter')custSearch()"><button class="btn sm" onclick="custSearch()">Search</button></div>
    ${c ? c.rows.map(item).join('') || (c.busy ? '' : '<p class="a-empty">No customers found.</p>') : ''}${c && c.busy ? '<p class="a-empty">Loading…</p>' : ''}
    ${c && c.rows.length < c.total && !c.busy ? '<button class="btn sm alt" style="margin-top:10px" onclick="loadCust()">Show more</button>' : ''}
    <p class="hint">Viewing this list is logged. Reset password sets a temporary password for a customer who is locked out.</p></div>
    <div class="card"><h2 style="font-size:17px">Backup and export</h2><p class="sub">Download this shop's data as CSV files (opens in Excel or Google Sheets). Exports are logged.</p>
      <div class="row"><button class="btn sm alt" onclick="exportShop('members',this)">Customers</button><button class="btn sm alt" onclick="exportShop('visits',this)">Every stamp</button><button class="btn sm alt" onclick="exportShop('offers',this)">Coupons</button></div></div>`;
}
function accessV(r) {
  const dom = (r.domains || []).map(d => `<span class="chip">${esc(d)} <button class="lnk" aria-label="Remove ${esc(d)}" onclick="rmDomain('${esc(d)}')">×</button></span>`).join('');
  return `<div class="card"><h2 style="font-size:17px">Owner</h2><p class="sub">${esc(r.owner_email || 'No owner set')}</p>
      <div class="row"><button class="btn sm alt" onclick="setOwner()">Change owner</button>${r.owner_email ? '<button class="btn sm alt" onclick="ownerReset()">Email password reset link</button>' : ''}</div>
      <p class="hint">The reset link goes to the owner's own email. You never see or set their password.</p></div>
    <div class="card"><h2 style="font-size:17px">Domains</h2><div class="chips" style="margin:0 0 8px">${dom || '<span class="hint">None. ' + (shopHost(r) ? 'Opens at ' + esc(shopHost(r)) + '.' : 'Only reachable through the deployment address.') + '</span>'}</div>
      <div class="row"><input id="dmn" placeholder="rewards.theirshop.com" autocapitalize="off"><button class="btn sm alt" onclick="addDomain()">Add domain</button></div>
      <p class="hint">Also add the domain in Vercel and point its DNS there (see README).</p></div>
    <div class="card"><h2 style="font-size:17px">Activity on this shop</h2>${shopAudit ? shopAudit.map(a => audRow(a, false)).join('') || '<p class="a-empty">No platform activity yet.</p>' : '<p class="a-empty">Loading…</p>'}</div>`;
}

function render() {
  const el = $('#app'); el.className = 'wide';
  if (!signed) return void (el.innerHTML = loginV());
  if (denied) return void (el.innerHTML = deniedV());
  el.innerHTML = view == 'new' ? newV() : view == 'audit' ? auditV() : view == 'shop' ? shopV() : listV();
}
(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enter(); else render();
})();
