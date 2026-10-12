// Platform admin: run every shop on this deployment (subscriptions, support, data).
// Everything goes through the platform_* SQL functions and the row rules in schema.sql, which check that the signed-in user is in
// platform_admins. Pausing a shop is enforced in the database, not just hidden in the app.
// Sections (bottom bar): Overview · Shops · Billing · Customers · Activity. A shop opens at #/shop/<slug>/<tab>.
const sb = notReady() ? null : mkClient('lk-platform');
let signed = false, denied = false, rows = [], err = '', created = null;
let sec = 'overview', sel = null, ptab = 'overview';
let fq = '', fsort = 'attention', ffilter = 'all', gq = '', gres = null, gt = null;
let cust = null, auditRows = null, shopAudit = null, pays = null, shopPays = null;

// ---------- helpers ----------
const dAgo = t => t ? Math.floor((Date.now() - new Date(t)) / 864e5) : null;
const ago = t => { const d = dAgo(t); return d === null ? 'never' : d <= 0 ? 'today' : d == 1 ? 'yesterday' : d + ' days ago' };
const baseDom = () => String(CFG.baseDomain || '').replace(/^\./, '');
const shopHost = r => (r.domains && r.domains[0]) || (baseDom() ? r.slug + '.' + baseDom() : null);
const shopUrl = (r, path) => { const h = shopHost(r); if (h) return 'https://' + h + path; return CFG.slug == r.slug ? location.origin + path : null };
const missingSql = e => /function|schema cache|does not exist|relation|column/i.test(String(e && e.message || e)) ? 'Run the latest supabase/schema.sql in Supabase first.' : null;
const bad = e => toast(missingSql(e) || nice(e));
const R = slug => rows.find(r => r.slug == slug);
const num = n => (+n || 0).toLocaleString();
const money = n => '₹' + (+n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const AUD = { support_open: 'Opened the dashboard as owner', settings_changed: 'Changed settings', view_customers: 'Viewed the customer list', export: 'Exported data', delete_customer: 'Deleted a customer', reset_customer_password: 'Reset a customer password', import_customers: 'Imported customers', domain_added: 'Added a domain', domain_removed: 'Removed a domain', owner_changed: 'Changed the owner', shop_created: 'Created the shop', owner_reset_email: 'Sent the owner a password reset email', shop_paused: 'Paused the shop', shop_reactivated: 'Reactivated the shop', payment_recorded: 'Recorded a payment', shop_deleted: 'Deleted the shop', note: 'Note' };

// Days until renewal (negative = overdue), or null if no date is set.
const dueIn = r => r.renews_on ? Math.ceil((new Date(r.renews_on + 'T00:00') - Date.now()) / 864e5) : null;
// What needs attention for a shop. level: 2 = problem, 1 = heads-up.
function flags(r) {
  const f = [], last = dAgo(r.last_stamp), d = dueIn(r);
  if (r.suspended) f.push(['Paused', 2]);
  if (!r.owner_email) f.push(['No owner', 2]);
  if (d !== null && d < 0) f.push(['Overdue ' + (-d) + 'd', 2]); else if (d !== null && d <= 7) f.push(['Renews in ' + d + 'd', 1]);
  if (!r.members) f.push(['No customers yet', 1]);
  else if (!r.suspended && (last === null || last >= 14)) f.push([last === null ? 'Never stamped' : 'Quiet ' + last + 'd', 1]);
  return f;
}
const score = r => flags(r).reduce((a, x) => a + x[1], 0);
const chips = r => flags(r).map(x => `<span class="pf-chip l${x[1]}">${esc(x[0])}</span>`).join('');
const dot = (r, big) => `<i class="pf-dot${big ? ' big' : ''}" style="background:${esc(HEX6.test(r.color) ? r.color : '#8a4b2a')}"></i>`;

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

// ---------- routing: #/overview  #/shops  #/shop/<slug>/<tab>  #/new  #/billing  #/customers  #/activity ----------
function route() {
  const p = location.hash.replace(/^#\/?/, '').split('/'), s0 = p[0] || 'overview';
  if (s0 == 'shop' && R(p[1])) { if (sel != p[1]) { cust = null; shopAudit = null; shopPays = null } sec = 'shop'; sel = p[1]; ptab = ['overview', 'customers', 'billing', 'access'].includes(p[2]) ? p[2] : 'overview'; loadTab() }
  else if (['overview', 'shops', 'billing', 'customers', 'activity', 'new'].includes(s0)) { sec = s0; sel = null; if (s0 == 'activity' && !auditRows) loadAudit(); if (s0 == 'billing' && !pays) loadPays() }
  else { sec = 'overview'; sel = null }
  render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if (signed && !denied) route() });
const go = h => { if (location.hash == h) route(); else location.hash = h };
const tabGo = t => go('#/shop/' + sel + '/' + t);
function loadTab() { if (ptab == 'customers' && !cust) loadCust(true); if (ptab == 'access' && !shopAudit) loadShopAudit(); if (ptab == 'billing' && !shopPays) loadShopPays() }

// ---------- create, domains, owner ----------
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
    created = { slug, name, email, pw }; await reload(); toast('Shop created'); go('#/shop/' + slug + '/billing');
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
  const { error } = await sb.auth.resetPasswordForEmail(r.owner_email, { redirectTo: location.origin + '/admin/' });
  if (error) return toast(nice(error));
  try { await rpc(sb, 'platform_log', { p_slug: sel, p_action: 'owner_reset_email' }); shopAudit = null } catch (e) { }
  toast('Reset link sent to ' + r.owner_email);
}
// One save for the notes and the plan fields: whichever inputs are on screen replace the stored value, the rest are kept.
async function saveMeta(btn) {
  const r = R(sel), f = (id, d) => { const el = $('#' + id); return el ? el.value : d };
  btn.disabled = true;
  try { await rpc(sb, 'platform_save_meta', { p_slug: sel, p_plan: f('mpl', r.plan), p_contact: f('mct', r.contact), p_notes: f('mno', r.notes), p_renews: f('mrn', r.renews_on || '') || null, p_price: +f('mpr', r.price) || 0 }); await reload(); render(); toast('Saved') }
  catch (e) { btn.disabled = false; bad(e) }
}

// ---------- billing: pause, payments, delete ----------
async function loadPays() { try { pays = await rpc(sb, 'platform_payments_list', { p_slug: null, p_limit: 200 }) } catch (e) { pays = []; bad(e) } if (sec == 'billing') render() }
async function loadShopPays() { try { shopPays = await rpc(sb, 'platform_payments_list', { p_slug: sel, p_limit: 100 }) } catch (e) { shopPays = [] } if (sec == 'shop') render() }
async function pause(slug, on) {
  const r = R(slug); let note = '';
  if (on) { note = prompt('Pause ' + r.name + '? Customers can\'t join or collect stamps, and the owner can\'t make changes, until you reactivate.\n\nReason (the owner sees "paused"; this note is only for you):', 'Payment not received'); if (note === null) return }
  else if (!confirm('Reactivate ' + r.name + '?')) return;
  try { await rpc(sb, 'platform_set_suspended', { p_slug: slug, p_on: on, p_note: note }); await reload(); shopAudit = null; render(); toast(on ? r.name + ' is paused' : r.name + ' is active again') } catch (e) { bad(e) }
}
async function recordPayment(btn) {
  const r = R(sel), amount = parseFloat(v('pa'));
  if (!(amount >= 0)) return toast('Enter the amount received');
  btn.disabled = true;
  try {
    const x = await rpc(sb, 'platform_record_payment', { p_slug: sel, p_amount: amount, p_paid_on: v('pd') || today(), p_months: +v('pm'), p_method: v('pmt'), p_note: v('pn') });
    await reload(); shopPays = null; pays = null; shopAudit = null; loadShopPays(); render();
    toast('Payment recorded. Renews ' + fbd(x.renews_on) + (x.reactivated ? ' · shop reactivated' : ''));
  } catch (e) { btn.disabled = false; bad(e) }
}
async function deleteShop(btn) {
  const r = R(sel), c = v('dsl').trim();
  if (!r.suspended) return toast('Pause the shop first');
  if (c !== r.slug) return toast('Type the shop address exactly: ' + r.slug);
  if (!confirm('Permanently delete ' + r.name + ', its ' + r.members + ' customers and all their stamps and coupons? This cannot be undone.')) return;
  btn.disabled = true;
  try {
    try { const { data } = await sb.storage.from('brand').list(r.id); if (data && data.length) await sb.storage.from('brand').remove(data.map(f => r.id + '/' + f.name)) } catch (e) { }   // logo and stamp images, best effort
    await rpc(sb, 'platform_delete_business', { p_slug: r.slug, p_confirm: c });
    await reload(); auditRows = null; pays = null; toast(r.name + ' was deleted'); go('#/shops');
  } catch (e) { btn.disabled = false; bad(e) }
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
// CSV: cells starting with = + - @ get a leading apostrophe so a spreadsheet never runs them as a formula.
const csvCell = x => { let s = x == null ? '' : String(x); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s };
const download = (name, head, data) => { const csv = [head, ...data].map(a => a.map(csvCell).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) };
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
    download(r.slug + '-' + kind + '-' + today() + '.csv', head, data);
    rpc(sb, 'platform_log', { p_slug: sel, p_action: 'export', p_detail: { kind, rows: data.length } }).catch(() => { });
    toast(data.length + ' rows exported');
  } catch (e) { bad(e) }
  btn.disabled = false;
}
const exportPays = () => { if (!pays) return; download('payments-' + today() + '.csv', ['date', 'shop', 'slug', 'amount', 'months', 'method', 'note', 'recorded_by'], pays.map(p => [p.paid_on, p.shop_name, p.slug, p.amount, p.months, p.method, p.note, p.created_by])) };

// ---------- find a customer across all shops ----------
function gFind() {
  gq = v('gq'); clearTimeout(gt);
  if (gq.trim().length < 3) { gres = null; return drawG() }
  gt = setTimeout(async () => { try { gres = await rpc(sb, 'platform_find_member', { p_q: gq }) } catch (e) { gres = []; bad(e) } drawG() }, 300);
}
const drawG = () => { const el = $('#gres'); if (el) el.innerHTML = gV() };
const openCust = (slug, phone) => { cust = { slug, q: phone, rows: [], total: 0, busy: false }; go('#/shop/' + slug + '/customers') };
const gV = () => gres === null ? '' : gres.length
  ? `<div class="pf-res">${gres.map(m => `<button onclick="openCust('${esc(m.slug)}','${esc(String(m.phone).replace(/\D/g, ''))}')"><b>${esc(m.name)}</b><span>${esc(m.phone)} · ${esc(m.shop)}</span><small>${m.stamps} stamps · last ${esc(ago(m.last_stamp))}</small></button>`).join('')}</div>`
  : '<p class="hint">No customer matches that.</p>';

// ---------- audit ----------
async function loadAudit() { try { auditRows = await rpc(sb, 'platform_audit_list', { p_slug: null, p_limit: 150 }) } catch (e) { auditRows = []; bad(e) } if (sec == 'activity') render() }
async function loadShopAudit() { try { shopAudit = await rpc(sb, 'platform_audit_list', { p_slug: sel, p_limit: 50 }) } catch (e) { shopAudit = [] } if (sec == 'shop') render() }
const audRow = (a, showShop) => `<div class="of"><div><b>${esc(AUD[a.action] || a.action)}</b>${showShop ? ` <span class="mut sm">· ${esc(a.slug || '')}</span>` : ''}<div class="mut sm">${esc(a.admin_email || '')}${a.detail && a.detail.fields ? ' · ' + esc(a.detail.fields.join(', ')) : a.detail && a.detail.host ? ' · ' + esc(a.detail.host) : a.detail && a.detail.kind ? ' · ' + esc(a.detail.kind) + ' (' + a.detail.rows + ')' : a.detail && a.detail.amount != null ? ' · ' + esc(money(a.detail.amount)) : a.detail && a.detail.customers != null ? ' · ' + a.detail.customers + ' customers' : ''}</div></div><span class="mut sm">${esc(fdt(a.created_at))}</span></div>`;

// ---------- layout ----------
const NI = {
  overview: ico('<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  shops: ico('<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 2.7 3S9.3 10.7 9.3 9c0 1.7 1.3 3 2.7 3s2.7-1.3 2.7-3c0 1.7 1.3 3 2.7 3S20 10.7 20 9M10 20v-5h4v5"/>'),
  billing: ico('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>'),
  customers: ico('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .7 3.5 2.4 3.5 5.6"/>'),
  activity: ico('<path d="M3 12h4l3-8 4 16 3-8h4"/>')
};
function navV() {
  const cur = sec == 'shop' || sec == 'new' ? 'shops' : sec, T = [['overview', 'Overview'], ['shops', 'Shops'], ['billing', 'Billing'], ['customers', 'Customers'], ['activity', 'Activity']];
  const due = rows.filter(r => { const d = dueIn(r); return d !== null && d < 0 && !r.suspended }).length;
  return `<nav class="a-nav pf-nav"><div class="a-in">${T.map(t => `<button class="${cur == t[0] ? 'on' : ''}" onclick="go('#/${t[0]}')"><i>${NI[t[0]]}</i><span>${t[1]}${t[0] == 'billing' && due ? ` <em class="pf-badge">${due}</em>` : ''}</span></button>`).join('')}</div></nav>`;
}
const headV = () => `<div class="pf-top"><b class="pf-brand">Platform</b><button class="lnk" onclick="out()">Sign out</button></div>${err ? `<div class="card"><p class="sub">${esc(err)}</p></div>` : ''}`;
const tile = (b, l) => `<div class="a-st"><b>${b}</b><span>${l}</span></div>`;

const loginV = () => `<div class="card" style="margin-top:40px"><h2>Platform login</h2><p class="sub">Sign in with your platform admin account.</p>
  <label class="lb">Email</label><input id="em" type="email" autocomplete="email">
  <label class="lb">Password</label>${pwField('pw', 'current-password')}
  <button class="btn" data-go onclick="login(this)">Sign in</button></div>`;
const deniedV = () => `<div class="card" style="margin-top:40px"><h2>No access</h2><p class="sub">This account is not a platform admin. In Supabase, run:<br><code>insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';</code></p><button class="btn alt" onclick="out()">Sign out</button></div>`;

// ---------- OVERVIEW ----------
function overviewSec() {
  const act = rows.filter(r => !r.suspended), tot = k => act.reduce((a, r) => a + (+r[k] || 0), 0);
  const mrr = act.reduce((a, r) => a + (+r.price || 0), 0), paused = rows.length - act.length;
  const att = rows.filter(r => score(r) > 0).sort((a, b) => score(b) - score(a)).slice(0, 8);
  const row = r => { const d = dueIn(r), pay = d !== null && d < 0 ? `<button class="btn sm" onclick="event.stopPropagation();go('#/shop/${esc(r.slug)}/billing')">Record payment</button>` : ''; return `<div class="pf-row" role="button" tabindex="0" onclick="go('#/shop/${esc(r.slug)}')">${dot(r)}<span class="pf-main"><b>${esc(r.name)}</b><span class="pf-chips">${chips(r)}</span></span>${pay}</div>` };
  return headV() + `<h1 class="pf-h">Overview</h1><div class="card"><div class="a-sts">${tile(act.length, 'Active shops')}${tile(paused, 'Paused')}${tile(num(tot('members')), 'Customers')}${tile(num(tot('stamps_30d')), 'Stamps, 30 days')}${tile(money(mrr), 'Monthly plans')}${tile(money(rows.reduce((a, r) => a + (+r.paid_30d || 0), 0)), 'Received, 30 days')}</div></div>
    <div class="card"><div class="a-h"><h2 style="font-size:17px">Needs attention</h2><span class="mut sm">${att.length ? att.length + ' shops' : ''}</span></div>${att.map(row).join('') || '<p class="a-empty">Everything looks fine.</p>'}</div>
    <div class="row"><button class="btn sm" onclick="go('#/new')">+ New shop</button><button class="btn sm alt" onclick="go('#/billing')">Open billing</button></div>`;
}

// ---------- SHOPS ----------
function shopsSec() {
  const q = fq.toLowerCase(), S = {
    attention: (a, b) => score(b) - score(a) || a.stamps_30d - b.stamps_30d, active: (a, b) => b.stamps_30d - a.stamps_30d,
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at), name: (a, b) => a.name.localeCompare(b.name)
  }[fsort];
  const F = { all: () => true, active: r => !r.suspended, paused: r => r.suspended, attention: r => score(r) > 0 }[ffilter];
  const L = rows.filter(F).filter(r => !q || (r.name + ' ' + r.slug + ' ' + (r.owner_email || '') + ' ' + (r.domains || []).join(' ') + ' ' + r.contact).toLowerCase().includes(q)).sort(S);
  const row = r => `<button class="pf-row" onclick="go('#/shop/${esc(r.slug)}')">${dot(r)}
    <span class="pf-main"><b>${esc(r.name)}</b><small>${esc(r.slug)} · ${esc(r.owner_email || 'no owner')}${r.plan ? ' · ' + esc(r.plan) : ''}</small><span class="pf-chips">${chips(r)}</span></span>
    <span class="pf-nums"><span><b>${num(r.members)}</b>customers</span><span><b>${num(r.stamps_7d)}</b>stamps 7d</span><span><b>${esc(ago(r.last_stamp))}</b>last stamp</span></span></button>`;
  const fc = [['all', 'All'], ['active', 'Active'], ['paused', 'Paused'], ['attention', 'Needs attention']].map(f => `<button class="chip${ffilter == f[0] ? ' on' : ''}" onclick="ffilter='${f[0]}';render()">${f[1]}</button>`).join('');
  return headV() + `<div class="pf-hd"><h1 class="pf-h">Shops <span class="mut sm">${rows.length}</span></h1><button class="btn sm" onclick="go('#/new')">+ New shop</button></div>
    <div class="pf-bar"><input id="fq" placeholder="Search shops, owners, domains" value="${esc(fq)}" oninput="fq=this.value;redraw('fq')"><select onchange="fsort=this.value;render()" aria-label="Sort">${[['attention', 'Needs attention'], ['active', 'Most active'], ['newest', 'Newest'], ['name', 'Name']].map(o => `<option value="${o[0]}"${fsort == o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></div>
    <div class="chips" style="margin:0 0 12px">${fc}</div>${L.map(row).join('') || '<p class="a-empty">No shops match.</p>'}`;
}
// Re-render while typing in a search box without losing the cursor.
function redraw(id) { const i = $('#' + id), pos = i ? i.selectionStart : 0; render(); const n = $('#' + id); if (n) { n.focus(); n.setSelectionRange(pos, pos) } }

function newSec() {
  return headV() + `<div class="card"><button class="lnk" onclick="go('#/shops')">← Shops</button><h2 style="margin-top:8px">New shop</h2><p class="sub">Creates the shop and its owner login. No separate database or deployment. Set its plan, price and renewal date next.</p>
    <label class="lb">Shop address <span>(letters, numbers, hyphens)</span></label><input id="ns" autocapitalize="off" placeholder="cheesora-bliss">
    <label class="lb">Shop name</label><input id="nn" placeholder="Cheesora Bliss">
    <label class="lb">Owner email</label><input id="ne" type="email" autocomplete="off">
    <label class="lb">Owner password <span>(leave blank if they already have an account here)</span></label>${pwField('np', 'new-password')}
    <label class="lb">Brand colour</label><input id="nc" type="color" value="#8a4b2a">
    <button class="btn" data-go onclick="createShop(this)">Create shop</button></div>`;
}

// ---------- BILLING (all shops) ----------
function billingSec() {
  const act = rows.filter(r => !r.suspended), mrr = act.reduce((a, r) => a + (+r.price || 0), 0), recv = rows.reduce((a, r) => a + (+r.paid_30d || 0), 0);
  const withDate = rows.filter(r => r.renews_on && !r.suspended).sort((a, b) => dueIn(a) - dueIn(b));
  const over = withDate.filter(r => dueIn(r) < 0), soon = withDate.filter(r => dueIn(r) >= 0 && dueIn(r) <= 14), nodate = act.filter(r => !r.renews_on), pausedL = rows.filter(r => r.suspended);
  const line = r => { const d = dueIn(r); return `<div class="pf-bill"><button class="pf-bn" onclick="go('#/shop/${esc(r.slug)}/billing')">${dot(r)}<span><b>${esc(r.name)}</b><small>${r.price ? money(r.price) : 'no price set'}${r.plan ? ' · ' + esc(r.plan) : ''} · ${r.renews_on ? (d < 0 ? 'overdue ' + (-d) + ' days (' + esc(fbd(r.renews_on)) + ')' : 'renews ' + esc(fbd(r.renews_on)) + ' (' + d + 'd)') : 'no renewal date'}</small></span></button>
    <span class="pf-act"><button class="btn sm" onclick="go('#/shop/${esc(r.slug)}/billing')">Record payment</button>${r.suspended ? `<button class="btn sm alt" onclick="pause('${esc(r.slug)}',false)">Reactivate</button>` : `<button class="btn sm alt a-del" onclick="pause('${esc(r.slug)}',true)">Pause</button>`}</span></div>` };
  const grp = (t, L, empty) => `<div class="card"><div class="a-h"><h2 style="font-size:17px">${t}</h2><span class="mut sm">${L.length || ''}</span></div>${L.map(line).join('') || `<p class="a-empty">${empty}</p>`}</div>`;
  const pl = pays ? pays.slice(0, 25).map(p => `<div class="of"><div><b>${esc(p.shop_name || p.slug)}</b><div class="mut sm">${esc(p.method || '—')} · ${p.months} month${p.months == 1 ? '' : 's'}${p.note ? ' · ' + esc(p.note) : ''}</div></div><span><b>${esc(money(p.amount))}</b><div class="mut sm">${esc(fbd(p.paid_on))}</div></span></div>`).join('') || '<p class="a-empty">No payments recorded yet.</p>' : '<p class="a-empty">Loading…</p>';
  return headV() + `<h1 class="pf-h">Billing</h1><div class="card"><div class="a-sts">${tile(money(mrr), 'Monthly plans (active)')}${tile(money(recv), 'Received, 30 days')}${tile(over.length, 'Overdue')}${tile(soon.length, 'Due in 14 days')}${tile(pausedL.length, 'Paused')}</div></div>
    ${grp('Overdue', over, 'Nobody is overdue.')}${grp('Due soon', soon, 'Nothing due in the next 14 days.')}
    ${pausedL.length ? grp('Paused', pausedL, '') : ''}
    ${nodate.length ? `<div class="card"><h2 style="font-size:17px">No renewal date set</h2><p class="sub">These active shops will never show as overdue. Open each and set plan, price and renewal date.</p>${nodate.map(r => `<div class="of"><button class="lnk" onclick="go('#/shop/${esc(r.slug)}/billing')">${esc(r.name)}</button></div>`).join('')}</div>` : ''}
    <div class="card"><div class="a-h"><h2 style="font-size:17px">Recent payments</h2>${pays && pays.length ? '<button class="lnk" onclick="exportPays()">Download CSV</button>' : ''}</div>${pl}</div>`;
}

// ---------- CUSTOMERS (search across shops) ----------
const customersSec = () => headV() + `<h1 class="pf-h">Customers</h1><div class="card"><h2 style="font-size:17px">Find a customer in any shop</h2><p class="sub">Part of a phone number or name (3+ characters). Useful when a customer says they can't log in and you don't know which shop they use.</p><input id="gq" placeholder="Phone number or name" value="${esc(gq)}" oninput="gFind()" autocomplete="off"><div id="gres">${gV()}</div></div>`;

// ---------- ACTIVITY ----------
const activitySec = () => headV() + `<h1 class="pf-h">Activity</h1><div class="card"><p class="sub">Everything done to a shop from the platform: support sessions, setting changes, payments, pauses, exports, customer-list views. Shop owners see their own shop's entries in More → Support access.</p>
  ${auditRows ? auditRows.map(a => audRow(a, true)).join('') || '<p class="a-empty">Nothing yet.</p>' : '<p class="a-empty">Loading…</p>'}</div>`;

// ---------- ONE SHOP ----------
function shopSec() {
  const r = R(sel); if (!r) return headV();
  const cu = shopUrl(r, '/app/'), ad = '/admin/?as=' + encodeURIComponent(r.slug);
  const doneBox = created && created.slug == r.slug ? `<div class="card"><h2>${esc(r.name)} is ready</h2><p class="sub">Send the owner these details (this box disappears when you leave the page).</p>
    <p style="margin:6px 0"><b>Dashboard:</b> ${esc(shopUrl(r, '/admin/') || '(add a domain first)')}<br><b>Email:</b> ${esc(created.email)}<br><b>Password:</b> ${created.pw ? esc(created.pw) : '(their existing password)'}</p><button class="btn sm alt" onclick="created=null;render()">Dismiss</button></div>` : '';
  const tabs = [['overview', 'Overview'], ['customers', 'Customers'], ['billing', 'Billing'], ['access', 'Access']].map(t => `<button class="${ptab == t[0] ? 'on' : ''}" onclick="tabGo('${t[0]}')">${t[1]}</button>`).join('');
  return headV() + doneBox + `<div class="card"><button class="lnk" onclick="go('#/shops')">← Shops</button>
    <div class="pf-head">${dot(r, 1)}<div><h2 style="margin:0">${esc(r.name)}</h2><div class="mut sm">${esc(r.slug)}${shopHost(r) ? ' · ' + esc(shopHost(r)) : ''}</div></div></div>
    <div class="pf-chips" style="margin:8px 0 12px">${chips(r)}</div>
    <div class="row"><a class="btn sm" href="${ad}" target="_blank" rel="noopener">Open dashboard as owner</a><a class="btn sm alt" href="${ad}&tab=ins" target="_blank" rel="noopener">Insights</a>${cu ? `<a class="btn sm alt" href="${esc(cu)}" target="_blank" rel="noopener">Customer app</a>` : ''}</div>
    <p class="hint">Opening the dashboard lets you change anything the owner can. It is logged and the owner sees it in their dashboard.</p></div>
    <div class="tabs">${tabs}</div>` + (ptab == 'customers' ? custTab(r) : ptab == 'billing' ? billTab(r) : ptab == 'access' ? accessTab(r) : overviewTab(r));
}
function overviewTab(r) {
  const rate = r.coupons_30d ? Math.round(r.redeemed_30d / r.coupons_30d * 100) + '%' : '—';
  return `<div class="card"><div class="a-sts">${tile(num(r.members), 'Customers')}${tile('+' + num(r.new_members_7d), 'New, 7 days')}${tile(num(r.stamps_7d), 'Stamps, 7 days')}${tile(num(r.stamps_30d), 'Stamps, 30 days')}${tile(num(r.coupons_30d), 'Coupons issued, 30d')}${tile(num(r.redeemed_30d) + ' (' + rate + ')', 'Redeemed, 30d')}</div>
    <p class="sub" style="margin-top:14px">Owner <b>${esc(r.owner_email || 'none')}</b> · last stamp ${esc(ago(r.last_stamp))} · created ${esc(fd(r.created_at))}<br>Card: ${r.need} stamps for "${esc(r.reward)}" · time zone ${esc(r.tz)}</p></div>
    <div class="card"><h2 style="font-size:17px">Your notes <span class="mut sm">(private, never shown to the shop)</span></h2>
      <label class="lb">Contact</label><input id="mct" value="${esc(r.contact)}" placeholder="Name, phone, best time to call">
      <label class="lb">Notes</label><textarea id="mno" rows="4">${esc(r.notes)}</textarea>
      <button class="btn" onclick="saveMeta(this)">Save notes</button></div>`;
}
function billTab(r) {
  const d = dueIn(r), state = r.suspended ? `<div class="pf-state bad"><b>Paused</b>${r.suspended_at ? ' since ' + esc(fbd(r.suspended_at.slice(0, 10))) : ''}${r.suspended_note ? ' · ' + esc(r.suspended_note) : ''}<br><span class="sm">Customers can't join or collect, and the owner can't make changes.</span></div>`
    : `<div class="pf-state ok"><b>Active</b>${d !== null ? ' · ' + (d < 0 ? 'overdue by ' + (-d) + ' days' : 'renews ' + esc(fbd(r.renews_on)) + ' (' + d + ' days)') : ' · no renewal date set'}</div>`;
  const pl = shopPays ? shopPays.map(p => `<div class="of"><div><b>${esc(money(p.amount))}</b><div class="mut sm">${esc(p.method || '—')} · ${p.months} month${p.months == 1 ? '' : 's'}${p.note ? ' · ' + esc(p.note) : ''}</div></div><span class="mut sm">${esc(fbd(p.paid_on))}</span></div>`).join('') || '<p class="a-empty">No payments recorded yet.</p>' : '<p class="a-empty">Loading…</p>';
  return `<div class="card">${state}
      <div class="row" style="margin-top:12px">${r.suspended ? `<button class="btn sm" onclick="pause('${esc(r.slug)}',false)">Reactivate</button>` : `<button class="btn sm alt a-del" onclick="pause('${esc(r.slug)}',true)">Pause this shop</button>`}</div>
      <p class="hint">Pausing is enforced by the database. Recording a payment reactivates a paused shop.</p></div>
    <div class="card"><h2 style="font-size:17px">Plan</h2>
      <div class="row"><div><label class="lb">Plan name</label><input id="mpl" value="${esc(r.plan)}" placeholder="e.g. Monthly"></div><div><label class="lb">Price per month (₹)</label><input id="mpr" type="number" min="0" step="1" value="${esc(r.price || '')}"></div></div>
      <label class="lb">Renews on</label><input id="mrn" type="date" value="${esc(r.renews_on || '')}">
      <button class="btn" onclick="saveMeta(this)">Save plan</button></div>
    <div class="card"><h2 style="font-size:17px">Record a payment</h2><p class="sub">Moves the renewal date forward by the months you choose, from the current renewal date if it is still ahead, otherwise from the payment date.</p>
      <div class="row"><div><label class="lb">Amount received (₹)</label><input id="pa" type="number" min="0" step="1" value="${esc(r.price || '')}"></div><div><label class="lb">Covers</label><select id="pm"><option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option><option value="0">Just record (no extension)</option></select></div></div>
      <div class="row"><div><label class="lb">Paid on</label><input id="pd" type="date" value="${today()}"></div><div><label class="lb">Method</label><select id="pmt"><option>UPI</option><option>Bank transfer</option><option>Cash</option><option>Card</option><option>Other</option></select></div></div>
      <label class="lb">Note <span>(optional)</span></label><input id="pn" placeholder="Reference number, discount, etc.">
      <button class="btn" onclick="recordPayment(this)">Record payment</button></div>
    <div class="card"><h2 style="font-size:17px">Payment history</h2>${pl}</div>`;
}
function custTab(r) {
  const c = cust && cust.slug == sel ? cust : null;
  const item = m => `<div class="pf-cu"><div><b>${esc(m.name)}</b><div class="mut sm">${esc(m.phone)} · ${m.stamps}/${r.need} stamps · ${m.total} visits${m.wa_optout ? ' · WhatsApp off' : ''}</div><div class="mut sm">Joined ${esc(fd(m.joined))} · last visit ${esc(ago(m.last_stamp))}</div></div>
    <span class="pf-act"><a class="btn sm alt" href="${esc(waLink(m.phone, ''))}" target="_blank" rel="noopener">WhatsApp</a><button class="btn sm alt" onclick="resetPw('${esc(m.id)}','${esc(m.name).replace(/'/g, '')}')">Reset password</button></span></div>`;
  return `<div class="card"><div class="a-h"><h2>Customers</h2><span class="mut sm">${c ? num(c.total) + (c.q ? ' match' : ' in total') : ''}</span></div>
    <div class="pf-bar" style="margin:8px 0"><input id="cq" placeholder="Search name or phone" value="${esc(c ? c.q : '')}" onkeydown="if(event.key=='Enter')custSearch()"><button class="btn sm" onclick="custSearch()">Search</button></div>
    ${c ? c.rows.map(item).join('') || (c.busy ? '' : '<p class="a-empty">No customers found.</p>') : ''}${c && c.busy ? '<p class="a-empty">Loading…</p>' : ''}
    ${c && c.rows.length < c.total && !c.busy ? '<button class="btn sm alt" style="margin-top:10px" onclick="loadCust()">Show more</button>' : ''}
    <p class="hint">Viewing this list is logged. Reset password sets a temporary password for a customer who is locked out.</p></div>
    <div class="card"><h2 style="font-size:17px">Backup and export</h2><p class="sub">Download this shop's data as CSV files (opens in Excel or Google Sheets). Exports are logged. Do this before deleting a shop.</p>
      <div class="row"><button class="btn sm alt" onclick="exportShop('members',this)">Customers</button><button class="btn sm alt" onclick="exportShop('visits',this)">Every stamp</button><button class="btn sm alt" onclick="exportShop('offers',this)">Coupons</button></div></div>`;
}
function accessTab(r) {
  const dom = (r.domains || []).map(d => `<span class="chip">${esc(d)} <button class="lnk" aria-label="Remove ${esc(d)}" onclick="rmDomain('${esc(d)}')">×</button></span>`).join('');
  return `<div class="card"><h2 style="font-size:17px">Owner</h2><p class="sub">${esc(r.owner_email || 'No owner set')}</p>
      <div class="row"><button class="btn sm alt" onclick="setOwner()">Change owner</button>${r.owner_email ? '<button class="btn sm alt" onclick="ownerReset()">Email password reset link</button>' : ''}</div>
      <p class="hint">The reset link goes to the owner's own email. You never see or set their password.</p></div>
    <div class="card"><h2 style="font-size:17px">Domains</h2><div class="chips" style="margin:0 0 8px">${dom || '<span class="hint">None. ' + (shopHost(r) ? 'Opens at ' + esc(shopHost(r)) + '.' : 'Only reachable through the deployment address.') + '</span>'}</div>
      <div class="row"><input id="dmn" placeholder="rewards.theirshop.com" autocapitalize="off"><button class="btn sm alt" onclick="addDomain()">Add domain</button></div>
      <p class="hint">Also add the domain in Vercel and point its DNS there (see README).</p></div>
    <div class="card"><h2 style="font-size:17px">Activity on this shop</h2>${shopAudit ? shopAudit.map(a => audRow(a, false)).join('') || '<p class="a-empty">No platform activity yet.</p>' : '<p class="a-empty">Loading…</p>'}</div>
    <div class="card pf-danger"><h2 style="font-size:17px">Delete this shop</h2>
      <p class="sub">Permanently removes the shop, its ${num(r.members)} customers and their logins, stamps, coupons, menu and domains. Payment records and the activity log are kept. This cannot be undone.</p>
      ${r.suspended ? `<ol class="sub"><li>Download the customers, stamps and coupons CSVs from the Customers tab.</li><li>Type <b>${esc(r.slug)}</b> below.</li></ol><input id="dsl" placeholder="${esc(r.slug)}" autocapitalize="off" autocomplete="off"><button class="btn a-delbtn" onclick="deleteShop(this)">Delete permanently</button>`
        : `<p class="hint"><b>Pause the shop first</b> (Billing tab). Deleting is only possible for a paused shop, so a slip of the finger can't remove a live shop.</p>`}</div>`;
}

function render() {
  const el = $('#app'); el.className = 'a plat';
  if (!signed) { $('#top').innerHTML = ''; return void (el.innerHTML = loginV()) }
  if (denied) { $('#top').innerHTML = ''; return void (el.innerHTML = deniedV()) }
  $('#top').innerHTML = navV();
  el.innerHTML = { overview: overviewSec, shops: shopsSec, new: newSec, billing: billingSec, customers: customersSec, activity: activitySec, shop: shopSec }[sec]();
}
(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enter(); else render();
})();
