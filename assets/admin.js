// Owner app (v2): mobile-first dashboard.
// Tabs: Home (sign-up QR, stats, chart, reminders) · Customers (sort, select, CSV) · Redeem ·
// Message (WhatsApp queue) · Offers (visual editors) · Menu (items with photos) · More (brand, news, refer, tag, account).
// Support mode: a platform admin opens /admin/?as=<shop> and works as that shop's owner (shares the /platform/ login). Everything they do is logged.
const SUPPORT_AS = (new URLSearchParams(location.search).get('as') || '').toLowerCase();
const sb = notReady() ? null : mkClient(SUPPORT_AS ? 'lk-platform' : 'lk-admin');
let support = null, SUP = [];
let signed = false, recover = false, biz = null, M = [], V = [], MSG = [], MENU = null, tab = 'h', ov = null, openId = null, selMode = false, visCache = {};
let q = '', rq = '', rc = '', rp = '', rd = null, rbusy = false;
// Customers selection (feeds the Message tab) + Message tab state
let sel = new Set(), bsel = new Set(), sortBy = 'joined', bseg = 'all', bmsg = 'Hi {name}! ', bimg = '', bfile = null, blink = true, bstop = true, bq = null, binit = false;
let impRows = null;
const first = u => (u.name || '').split(' ')[0];

// On a path-addressed deployment (config.js publicOrigin) every link, QR code and NFC tag points at /app/<shop>/ on the public domain.
// Tags already written with the old /app/#scan=... address keep working: the stamp code is unchanged.
const syncLinks = () => { if (biz && biz.slug && CFG.publicOrigin) linkSlug = biz.slug };
const scanUrl = () => pubOrigin() + appBase() + '#scan=' + biz.scan_token;
const joinUrl = () => pubOrigin() + appBase() + '#join=' + biz.join_token;
const heldOffers = u => (u.offers || []).filter(x => !x.used_at && !isExp(x)).length;
// When this customer's current card runs out (null = no deadline: no stamps yet, full card, or no limit).
const cardEnd = u => { if (!biz.card_months || !u.card_started_at || !(u.stamps > 0) || u.stamps >= biz.need) return null; const d = new Date(u.card_started_at); d.setMonth(d.getMonth() + biz.card_months); return d };
const lastSeen = u => new Date(u.last_stamp || u.joined);
const daysAgo = d => Math.floor((Date.now() - d) / 864e5);
const lastMsg = id => MSG.find(m => m.member_id == id);   // MSG is newest-first
const WB_COOLDOWN = 14;                                    // keep in sync with winback_message()
const WBERR = { nooffer: 'Set a win-back offer in Settings first', notlapsed: 'This customer visited recently', recent: 'Already messaged in the last 14 days' };
const lapsed = () => M.map(u => ({ u, d: daysAgo(lastSeen(u)), m: lastMsg(u.id) }))
  .filter(r => r.d >= biz.lapsed_days).sort((a, b) => b.d - a.d);   // longest gone first
const sameMonth = d => d && +d.slice(5, 7) == new Date().getMonth() + 1;
// A date (or now) as YYYY-MM-DD in the business's timezone: the same day the SQL uses for "(last_daily at time zone tz)::date".
const bizDay = d => (d == null ? new Date() : new Date(d)).toLocaleDateString('en-CA', { timeZone: biz.tz || 'Asia/Kolkata' });
const optedOut = u => !!u.wa_optout;

// ---------- icons ----------
const AI = {
  home: ico('<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  users: ico('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .7 3.5 2.4 3.5 5.6"/>'),
  ok: ico('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
  gift: ico('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2 0-4-1-4-3s3-2.5 4 3c1-5.5 4-5 4-3s-2 3-4 3"/>'),
  cog: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
  send: ico('<path d="M21 3L3 10.5l7.5 3 3 7.5z"/><path d="M21 3l-10.5 10.5"/>'),
  stamp: ico('<path d="M9 14V9a3 3 0 1 1 6 0v5M5 14h14v3H5zM6 20h12"/>'),
  smile: ico('<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.5 2.5 2 4 2s3-.5 4-2M9 9.5v.01M15 9.5v.01"/>'),
  cake: ico('<path d="M4 20h16v-7H4zM4 16c2 1.5 4-1.5 8 0s6 1.5 8 0M12 13V9M12 6v.01"/>'),
  spark: ico('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>'),
  refresh: ico('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  back: ico('<path d="M15 5l-7 7 7 7"/>'),
  trend: ico('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  menu: ico('<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M17 21V3c-2.2 1.2-3.5 3.6-3.5 6.5 0 2 1.2 3.5 3.5 3.5"/>'),
  plus: ico('<path d="M12 5v14M5 12h14"/>'),
  chev: ico('<path d="M9 5l7 7-7 7"/>'),
  repeat: ico('<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>')
};

// ---------- data ----------
// PostgREST returns at most 1,000 rows per request, so read a query page by page until it runs out.
async function pages(make) {
  const PAGE = 1000; let out = [];
  for (let from = 0; from < 100000; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < PAGE) break;
  }
  return out;
}
async function enter() {
  signed = true;
  if (/^[a-z0-9-]+$/.test(SUPPORT_AS)) {
    try { await rpc(sb, 'platform_support_open', { p_slug: SUPPORT_AS }); CFG.slug = SUPPORT_AS; linkSlug = SUPPORT_AS; support = SUPPORT_AS }
    catch (e) {
      // Never fall back to the deployment's own shop: a platform admin could end up editing the wrong shop.
      const m = String((e && e.message) || e), missing = /function|schema cache|does not exist/i.test(m);
      $('#app').innerHTML = `<div class="card"><h2>Could not open ${esc(SUPPORT_AS)}</h2><p class="sub">${missing ? 'The database is missing the latest platform update. In Supabase, open SQL Editor and run the whole of <b>supabase/schema.sql</b> (it is safe to run again), then reload this page.' : /not allowed/i.test(m) ? 'This account is not a platform admin. Sign in to /platform/ with your platform admin account first.' : /not found/i.test(m) ? 'There is no shop with that address.' : esc(nice(e))}</p><p class="hint">Details: ${esc(m)}</p><a class="btn alt" href="/platform/">Back to the platform page</a></div>`;
      return;
    }
  }
  await load(); render();
  const qt = new URLSearchParams(location.search).get('tab');
  if (support && qt == 'ins') openIns();
  else if (support && qt == 'set') go('m');   // a freshly created shop: straight to branding and settings
}
async function load() {
  try {
    const { data, error } = await sb.from('businesses').select('*').eq('slug', CFG.slug).maybeSingle();
    if (error) throw error;
    biz = data;
    syncLinks();
    if (biz) {
      brand(biz); document.title = 'Owner dashboard · ' + biz.name;
      M = await pages(() => sb.from('members').select('*,offers(id,type,text,code,valid_from,used_at,expires_at,created_at)').eq('business_id', biz.id).order('joined', { ascending: false }).order('id'));
      const mr = await sb.from('messages').select('member_id,created_at,returned_at').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(1000);
      MSG = mr.error ? [] : mr.data;   // win-back table may not exist until 2026-10-08-winback.sql is run
      if (biz.lapsed_days == null) biz.lapsed_days = 10;
      try { SUP = await rpc(sb, 'my_support_log', { p_slug: CFG.slug }) } catch (e) { SUP = [] }   // owner's view of support access; absent until the platform SQL is run
      try {
        const since = new Date(Date.now() - 14 * 864e5).toISOString();
        V = (await pages(() => sb.from('visits').select('id,created_at').eq('business_id', biz.id).gte('created_at', since).order('id'))).map(x => x.created_at);
      } catch (e) { V = [] }
    }
  } catch (e) { toast(nice(e)) }
}
async function refresh() { await load(); render(); toast('Updated'); if (tab == 'h' && ov == 'ins') loadIns() }
function go(t, o) { tab = t; ov = o || null; openId = null; render(); window.scrollTo(0, 0) }

// ---------- auth ----------
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
  signed = false; biz = null; M = []; V = []; tab = 'h'; ov = null; openId = null; MENU = null; CATS = null; INS = null; SUP = []; support = null;
  sel = new Set(); bsel = new Set(); selMode = false; bq = null; binit = false; impRows = null; visCache = {}; MSG = [];
  render();
}
async function forgot() {
  const email = v('em').trim();
  if (!email) return toast('Enter your email above first');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + adminBase() });
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
const recoverV = () => `<div class="a-card" style="margin-top:40px"><h2>Set a new password</h2><p class="sub">Choose a new password for your owner account.</p>
  <label class="lb">New password <span>(6+ characters)</span></label>${pwField('np', 'new-password')}
  <button class="btn" data-go onclick="setPw(this)">Save password</button></div>`;
const loginV = () => `<div class="a-card" style="margin-top:40px"><h2>Owner login</h2><p class="sub">Sign in to manage your rewards programme.</p>
  <label class="lb">Email</label><input id="em" type="email" autocomplete="email">
  <label class="lb">Password</label>${pwField('pw', 'current-password')}
  <button class="btn" data-go onclick="login(this)">Sign in</button>
  <p class="note" style="margin:14px 0 0"><a href="#" onclick="forgot();return false">Forgot password?</a></p></div>`;
const deniedV = () => `<div class="a-card" style="margin-top:40px"><h2>No access</h2><p class="sub">This account doesn't manage this business. Sign in with the owner account, or ask for access.</p><button class="btn alt" onclick="out()">Sign out</button></div>`;

// ---------- shell: hero + bottom nav ----------
function hero() {
  const home = tab == 'h' && !ov;
  const n = M.length, tot = M.reduce((a, u) => a + u.total, 0), rw = M.reduce((a, u) => a + u.redeemed, 0);
  const rep = n ? Math.round(M.filter(u => u.total >= 2).length / n * 100) : 0;
  const chip = (ic, val, lab) => `<div class="a-chip">${ic}<b>${val}</b><span>${lab}</span></div>`;
  return `<header class="a-hero${home ? '' : ' slim'}"><div class="a-in">
    ${support ? `<div class="a-support"><b>Support mode</b> · you are managing this shop for its owner. Changes are logged. <a href="/platform/#shop=${esc(support)}">Back to platform</a></div>` : ''}
    <div class="a-brand"><div class="a-logo">${mark(biz)}</div><div class="a-bt"><b>${esc(biz.name)}</b><span>Owner dashboard</span></div>
    <button class="a-ib" aria-label="Refresh" onclick="refresh()">${AI.refresh}</button></div>
    ${home ? `<div class="a-chips">${chip(AI.trend, tot, 'Stamps')}${chip(AI.users, n, 'Members')}${chip(AI.gift, rw, 'Rewards')}${chip(AI.repeat, rep + '%', 'Repeat')}</div>` : ''}
  </div></header>`;
}
function nav() {
  const T = [['h', 'Home', AI.home], ['c', 'Customers', AI.users], ['r', 'Redeem', AI.ok], ['b', 'Message', AI.send], ['o', 'Offers', AI.gift], ['p', 'Menu', AI.menu], ['m', 'More', AI.cog]];
  return `<nav class="a-nav"><div class="a-in">${T.map(t => `<button class="${tab == t[0] ? 'on' : ''}" onclick="go('${t[0]}')"><i>${t[2]}</i><span>${t[1]}</span></button>`).join('')}</div></nav>`;
}

// ---------- HOME ----------
// Stamps given per day over the last 14 days (from the visits log).
function chartV() {
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d });
  const by = {}; V.forEach(t => { const k = new Date(t).toDateString(); by[k] = (by[k] || 0) + 1 });
  const cnt = days.map(d => by[d.toDateString()] || 0), max = Math.max(1, ...cnt), total = cnt.reduce((a, b) => a + b, 0);
  return `<div class="a-card"><div class="a-h"><h2>Stamps, last 14 days</h2><span class="mut sm">${total} in total</span></div>`
    + (total ? `<div class="bars">${days.map((d, i) => `<div class="bar" title="${esc(d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))}: ${cnt[i]}"><b>${cnt[i] || ''}</b><i style="height:${Math.max(3, Math.round(cnt[i] / max * 84))}px;animation-delay:${i * 30}ms"></i><span>${esc(d.toLocaleDateString(undefined, { weekday: 'narrow' }))}</span></div>`).join('')}</div>`
      : '<p class="sub" style="margin:8px 0 0">No stamps yet. They will show up here as customers tap the tag.</p>') + '</div>';
}
function reminders() {
  const L = [], t = new Date(), today = new Date(t.getFullYear(), t.getMonth(), t.getDate()), link = pubOrigin() + appBase();
  M.forEach(u => {
    if (u.bday && biz.bday_offer) {
      const [, mo, d] = u.bday.split('-').map(Number);
      let n = new Date(today.getFullYear(), mo - 1, d); if (n < today) n = new Date(today.getFullYear() + 1, mo - 1, d);
      const k = Math.round((n - today) / 864e5);
      if (k <= 7) L.push({ k, tag: 'Birthday', when: k == 0 ? 'today' : k == 1 ? 'tomorrow' : 'in ' + k + ' days', u,
        msg: `Happy birthday ${first(u)}! 🎂 ${biz.name} has a gift for you: ${biz.bday_offer}. It is valid only on your birthday. Open your card to see your code: ${link}` });
    }
    const ce = cardEnd(u);
    if (ce && daysTo(ce) <= 14 && daysTo(ce) >= 0) L.push({ k: daysTo(ce), tag: 'Card ending', when: daysTo(ce) <= 1 ? 'within a day' : 'in ' + daysTo(ce) + ' days', u,
      msg: `Hi ${first(u)}, your ${biz.name} stamp card ends on ${fd(ce)} and you have ${u.stamps} of ${biz.need} stamps. Visit us before then to finish it and earn ${biz.reward}! ${link}` });
    (u.offers || []).filter(o => o.type != 'Daily' && !o.used_at && !o.valid_from && o.expires_at && !isExp(o) && daysTo(o.expires_at) <= 3).forEach(o => {
      const k = daysTo(o.expires_at);
      L.push({ k, tag: 'Offer expiring', when: k <= 1 ? 'within a day' : 'in ' + k + ' days', u,
        msg: `Hi ${first(u)}, your offer at ${biz.name} ("${o.text}") expires on ${fd(o.expires_at)}. Open your card to see your code: ${link}` });
    });
  });
  L.sort((a, b) => a.k - b.k);
  return `<div class="a-card"><div class="a-h"><h2>Reminders</h2>${L.length ? `<span class="pill">${L.length}</span>` : ''}</div>
    <p class="sub">Birthdays this week, offers ending soon, cards about to run out. One tap sends a ready message on WhatsApp.</p>`
    + (L.map(r => `<div class="of"><div><div class="tag">${r.tag} · ${r.when}</div><b>${esc(r.u.name)}</b><div class="mut sm">${esc(r.u.phone)}</div></div>${optedOut(r.u) ? '<span class="mut sm">Opted out</span>' : `<a class="btn sm" href="${esc(waLink(r.u.phone, r.msg))}" target="_blank" rel="noopener">WhatsApp</a>`}</div>`).join('')
      || '<p class="a-empty">Nothing due right now.</p>') + '</div>';
}
function comeBack() {
  const L = lapsed(), more = L.length - 25;
  const offer = !!biz.winback_offer;
  const recent = MSG.filter(m => new Date(m.created_at) > Date.now() - 30 * 864e5);
  const row = r => {
    const msg = r.m ? daysAgo(new Date(r.m.created_at)) : -1;
    return `<div class="of"><div><b>${esc(r.u.name)}</b><div class="mut sm">${r.u.last_stamp ? 'Last seen ' + r.d + ' days ago · ' + r.u.stamps + ' stamps' : 'Joined ' + r.d + ' days ago, no visit yet'}</div></div>${msg >= 0 && msg < WB_COOLDOWN ? `<span class="mut sm">Messaged ${msg}d ago</span>` : `<button class="btn sm" onclick="winback('${r.u.id}',this)"${offer ? '' : ' disabled'}>Message</button>`}</div>`;
  };
  return `<div class="a-card"><div class="a-h"><h2>Come back</h2></div>
    <p class="sub">Customers who haven't visited in ${biz.lapsed_days}+ days.</p>
    <p class="hint">Messaged ${recent.length} in the last 30 days · ${recent.filter(m => m.returned_at).length} came back</p>
    ${offer ? '' : '<p class="hint">Set a win-back offer in Settings to start messaging.</p>'}
    ${L.length ? L.slice(0, 25).map(row).join('') + (more > 0 ? `<p class="hint">+${more} more</p>` : '') : '<p class="a-empty">Nobody is overdue. Everyone has visited recently.</p>'}</div>`;
}
// Safari and Chrome block window.open after an await, so open the tab first and point it at WhatsApp once the RPC returns.
async function winback(id, btn) {
  const u = M.find(x => x.id == id); if (!u) return;
  const w = window.open('', '_blank');
  btn.disabled = true;
  try {
    const r = await rpc(sb, 'winback_message', { p_slug: CFG.slug, p_member: id });
    if (!r.ok) { if (w) w.close(); btn.disabled = false; return toast(WBERR[r.error] || 'Could not create the message') }
    const msg = `Hi ${first(u)}, we miss you at ${biz.name}! Here's a little something for your next visit: ${r.offer}.`
      + (r.expires_at ? ` Valid until ${fd(r.expires_at)}.` : '')
      + ` Show this code at the counter: ${r.code}. You can also see it on your card: ${pubOrigin()}${appBase()}`;
    if (w) w.location.href = waLink(r.phone, msg);
    else { try { await navigator.clipboard.writeText(msg) } catch (e) { } toast('Pop-up blocked. Message copied: paste it into WhatsApp.') }
    await load(); render();
  } catch (e) { if (w) w.close(); btn.disabled = false; toast(nice(e)) }
}
function homeV() {
  const wk = Date.now() - 6048e5, today0 = new Date().setHours(0, 0, 0, 0);
  const stat = (b, l) => `<div class="a-st"><b>${b}</b><span>${l}</span></div>`;
  const redeemedToday = M.reduce((a, u) => a + (u.offers || []).filter(x => x.used_at && new Date(x.used_at) > today0).length, 0);
  const ending = M.filter(u => { const e = cardEnd(u); return e && daysTo(e) <= 14 && daysTo(e) >= 0 }).length;
  let daily = '';
  if (biz.daily_on) {
    const today = bizDay(), d = M.flatMap(u => u.offers || []).filter(x => x.type == 'Daily');
    daily = stat(M.filter(u => u.last_daily && bizDay(u.last_daily) == today).length, 'Scratched today')
      + stat(d.filter(x => !x.used_at && !isExp(x)).length, 'Daily coupons outstanding')
      + stat(d.filter(x => x.used_at).length, 'Daily coupons redeemed');
  }
  const kit = 'theme' in biz && !(biz.theme || {}).done && M.length < 5 ? `<div class="a-card"><div class="a-h"><h2>Make it yours</h2><span class="a-tag">2 minutes</span></div><p class="sub">Add your logo and pick your colour so the app looks like your shop.</p><button class="btn sm" onclick="go('m')">Set up branding</button></div>` : '';
  return kit + `<div class="a-card"><div class="a-h"><h2>Sign-up QR</h2><span class="a-tag">At the counter</span></div>
    <p class="sub">Print this for the counter or door. Scanning it lets a new customer join and get their first stamp — it cannot add any later stamps.</p>
    <label class="lb">Sign-up link</label><input readonly class="ro" value="${esc(joinUrl())}" onclick="this.select()">
    <div class="qr" id="qrb"></div>
    <div class="row"><button class="btn sm" onclick="dlQR()">Download</button><button class="btn sm alt" onclick="cpL('j')">Copy link</button><button class="btn sm alt" onclick="regen('join_token')">Regenerate</button></div>
    <p class="hint">Later stamps come from the NFC tag set up in More → Stamp tag.</p></div>
  <div class="a-quick"><button onclick="go('r')">${AI.ok}<b>Redeem a coupon</b><span>Enter a customer's code</span></button><button onclick="go('b')">${AI.send}<b>Message customers</b><span>WhatsApp group send</span></button><button onclick="go('o')">${AI.gift}<b>Edit offers</b><span>Stamps, welcome, birthday</span></button><button onclick="openIns()">${AI.trend}<b>Insights</b><span>Busy hours, retention</span></button></div>
  ${comeBack()}
  <div class="a-card"><h2>At a glance</h2><div class="a-sts">${stat(M.filter(u => u.last_stamp && new Date(u.last_stamp) > wk).length, 'Active, 7 days')}${stat(redeemedToday, 'Redeemed today')}${stat(M.reduce((a, u) => a + heldOffers(u), 0), 'Coupons out')}${stat(ending, 'Cards ending')}${stat(M.filter(u => sameMonth(u.bday)).length, 'Birthdays this month')}${daily}</div></div>
  ${chartV()}
  ${reminders()}
  <div class="a-card"><div class="a-h"><h2>Latest sign-ups</h2><button class="lnk" onclick="go('c')">See all</button></div>${M.slice(0, 5).map(u => `<div class="of"><b>${esc(u.name)}</b><span class="mut sm">${esc(u.phone)} · ${fd(u.joined)}</span></div>`).join('') || '<p class="a-empty">No members yet. Print the QR above and put it at the counter.</p>'}</div>`;
}

// ---------- CUSTOMERS ----------
const SORTS = { joined: 'Newest first', name: 'Name A to Z', stamps: 'Most stamps', visit: 'Latest visit', total: 'Most visits' };
function sorted(L) {
  const t = x => x ? +new Date(x) : 0;
  const f = { joined: null, name: (a, b) => (a.name || '').localeCompare(b.name), stamps: (a, b) => b.stamps - a.stamps, visit: (a, b) => t(b.last_stamp) - t(a.last_stamp), total: (a, b) => b.total - a.total }[sortBy];
  return f ? L.slice().sort(f) : L;
}
const filtered = () => { const s = q.toLowerCase(); return sorted(M.filter(u => (u.name + u.phone).toLowerCase().includes(s))) };
async function tg(id) {
  if (openId == id) openId = null;
  else { openId = id; if (!(id in visCache)) fetchVis(id) }
  const el = $('#cl'); if (el) el.innerHTML = clist();
}
async function fetchVis(id) {
  try {
    const { data, error } = await sb.from('visits').select('created_at').eq('member_id', id).order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    visCache[id] = data;
  } catch (e) { visCache[id] = [] }
  if (openId == id && $('#cl')) $('#cl').innerHTML = clist();
}
function detail(u) {
  const f = (l, x) => `<div><span>${l}</span><b>${x}</b></div>`;
  const msg = `Hi ${first(u)}, thanks for being part of ${biz.name} rewards! ${pubOrigin()}${appBase()}`;
  const ce = cardEnd(u);
  const of = (u.offers || []).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const st = x => x.used_at ? 'Used ' + fd(x.used_at) : isExp(x) ? 'Expired ' + fd(x.expires_at) : x.valid_from && new Date(x.valid_from) > Date.now() ? 'Valid on ' + fd(x.valid_from) : x.expires_at ? 'Until ' + fd(x.expires_at) : 'No expiry';
  const vis = visCache[u.id];
  return `<div class="a-det"><div class="a-facts">${f('Birthday', fbd(u.bday))}${f('Visits', u.total)}${f('Rewards earned', u.redeemed)}${f('Coupons held', heldOffers(u))}${f('Joined', fd(u.joined))}${f('Card ends', ce ? fd(ce) : '—')}${f('Last visit', fd(u.last_stamp) || '—')}${u.ref_code ? f('Friend code', esc(u.ref_code)) : ''}${f('Status', optedOut(u) ? 'Opted out' : 'Active')}</div>
    <div class="row"><a class="btn sm" href="${esc(waLink(u.phone, msg))}" target="_blank" rel="noopener">WhatsApp</a><button class="btn sm alt" onclick="optOut('${u.id}')">${optedOut(u) ? 'Allow messages' : 'Mark opted out'}</button><button class="btn sm alt" onclick="resetPw('${u.id}')">Reset password</button><button class="btn sm alt a-del" onclick="del('${u.id}')">Delete</button></div>
    <div class="lb">Offers</div>${of.map(x => `<div class="of"><div><div class="tag">${esc(x.type)}${x.code ? ' · ' + esc(x.code) : ''}</div><b>${esc(x.text)}</b></div><span class="mut sm">${st(x)}</span></div>`).join('') || '<p class="sub" style="margin:4px 0">No offers yet.</p>'}
    <div class="lb" style="margin-top:14px">Recent visits</div>${vis == null ? '<p class="sub" style="margin:4px 0">Loading…</p>' : vis.length ? vis.map(x => `<div class="of"><span>${fdt(x.created_at)}</span></div>`).join('') : '<p class="sub" style="margin:4px 0">No visits recorded.</p>'}</div>`;
}
function clist() {
  const need = +biz.need, L = filtered();
  const inner = u => `<span class="a-av">${esc((first(u)[0] || '?').toUpperCase())}</span><span class="a-cm"><b>${esc(u.name)}</b><small>${esc(u.phone)} · last visit ${fd(u.last_stamp)}${optedOut(u) ? ' · opted out' : ''}</small><span class="a-bar"><span style="width:${Math.min(100, u.stamps / need * 100)}%"></span></span></span><span class="a-sc">${u.stamps}/${need}</span>`;
  if (selMode) return L.map(u => `<div class="a-cu${sel.has(u.id) ? ' on' : ''}"><label class="a-cr"><input type="checkbox" ${sel.has(u.id) ? 'checked' : ''} onchange="selTg('${u.id}',this.checked)">${inner(u)}</label></div>`).join('')
    || `<p class="a-empty">${M.length ? 'No match.' : 'No customers yet.'}</p>`;
  return L.map(u => `<div class="a-cu${openId == u.id ? ' on' : ''}"><button class="a-cr" onclick="tg('${u.id}')">${inner(u)}</button>${openId == u.id ? detail(u) : ''}</div>`).join('')
    || `<p class="a-empty">${M.length ? 'No match.' : 'No customers yet.'}</p>`;
}
function toggleSel() { selMode = !selMode; if (!selMode) sel.clear(); render() }
function selTg(id, on) { on ? sel.add(id) : sel.delete(id); render() }
function selAll(on) { filtered().forEach(u => on ? sel.add(u.id) : sel.delete(u.id)); render() }
function msgSel() { if (!sel.size) return; bsel = new Set(sel); bseg = 'custom'; binit = true; go('b') }
async function optOut(id) {
  const u = M.find(x => x.id == id); if (!u) return;
  const on = !optedOut(u);
  try {
    await rpc(sb, 'set_wa_optout', { p_member: id, p_optout: on });
    u.wa_optout = on; bsel.delete(id);
    toast(on ? u.name + ' will not get WhatsApp messages' : u.name + ' can get messages again');
    render();
  } catch (e) { toast(/function|schema cache/i.test(String(e && e.message || e)) ? 'Run the latest supabase/schema.sql first' : nice(e)) }
}
const customersV = () => `<div class="a-bar2"><input placeholder="Search name or phone" value="${esc(q)}" oninput="q=this.value;$('#cl').innerHTML=clist()"><button class="btn sm${selMode ? '' : ' alt'}" onclick="toggleSel()">${selMode ? 'Done' : 'Select'}</button></div>
  <div class="a-bar2"><select aria-label="Sort" onchange="sortBy=this.value;$('#cl').innerHTML=clist()">${Object.keys(SORTS).map(k => `<option value="${k}"${sortBy == k ? ' selected' : ''}>${SORTS[k]}</option>`).join('')}</select><button class="btn sm alt" onclick="exp()">Export</button><button class="btn sm alt" onclick="$('#impf').click()">Import</button><input type="file" id="impf" accept=".csv,text/csv" hidden onchange="impPick(this)"></div>
  ${selMode ? `<div class="a-bar2"><button class="btn sm alt" onclick="selAll(true)">All</button><button class="btn sm alt" onclick="selAll(false)">None</button><span class="mut sm" style="flex:1;text-align:right">${sel.size} selected</span><button class="btn sm" ${sel.size ? '' : 'disabled'} onclick="msgSel()">Message</button></div>` : ''}
  <div id="imp"></div>
  <div class="a-card flush" id="cl">${clist()}</div>`;

// Customers have no real email, so the owner sets a temporary password for them.
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
// Uses the browser's secure random source; values above the largest multiple of the alphabet size are
// skipped so every character is equally likely.
function genPw() {
  const lim = 256 - (256 % chars.length);
  let s = '';
  while (s.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < lim && s.length < 8) s += chars[b % chars.length];
    }
  }
  return s;
}
async function resetPw(id) {
  const u = M.find(x => x.id == id);
  if (!u) return toast('Customer not found.');
  if (!confirm("Reset this customer's password?\n\nAfter resetting, give the temporary password to the customer. They can change it after signing in.")) return;
  const p = genPw();
  try {
    await rpc(sb, 'reset_member_password', { p_member: id, p_password: p });
    try { await navigator.clipboard.writeText(p) } catch (e) { }
    prompt('Password reset for ' + u.name + '.\nTemporary password (copied if your browser allowed it):', p);
  } catch (e) {
    const m = String((e && e.message) || e);
    if (/not allowed/i.test(m)) toast('You are not allowed to reset this customer.');
    else if (/password.*(at least|short|characters)/i.test(m)) toast('Password must be at least 6 characters.');
    else toast("Couldn't reset the password. Please try again.");
  }
}
async function del(id) {
  if (!confirm('Delete this customer and all their data permanently?')) return;
  try {
    await rpc(sb, 'delete_member', { p_member: id });
    M = M.filter(u => u.id != id); sel.delete(id); bsel.delete(id); openId = null; render();
  } catch (e) { toast(nice(e)) }
}

// ---------- REDEEM ----------
const RERR = { nocode: 'Enter the coupon code', notfound: 'No coupon with that code', phone: 'This code belongs to a different phone number', used: 'Already used', expired: 'This coupon has expired', early: 'Not valid yet' };
async function chk(confirmIt) {
  rc = v('rc').trim(); rp = v('rp').trim();
  if (!rc) return toast('Enter the coupon code');
  let ph = null; if (rp) { ph = normPhone(rp); if (!ph) return toast(PHONE_MSG) }
  rbusy = true; render();
  try {
    const r = await rpc(sb, 'redeem_code', { p_slug: CFG.slug, p_code: rc, p_phone: ph, p_confirm: !!confirmIt });
    rd = r;
    if (r.ok && r.confirmed) { toast('Coupon redeemed'); haptic(); rc = rp = ''; await load() }
  } catch (e) { rd = null; toast(nice(e)) }
  rbusy = false; render();
}
function clearRd() { rd = null; rc = rp = ''; render() }
function redeemV() {
  const o = rd && rd.offer;
  let res = '';
  if (rd && rd.ok && rd.confirmed) res = `<div class="rw"><small class="ok">Redeemed</small><b>${esc(o.text)}</b><span>${esc(o.name)} · ${esc(o.phone)}</span></div><button class="btn alt" onclick="clearRd()">Next coupon</button>`;
  else if (rd && rd.ok) res = `<div class="rw"><small>${esc(o.type)} · valid</small><b>${esc(o.text)}</b><span>${esc(o.name)} · ${esc(o.phone)}</span>${o.valid_from ? '<span>Valid only on this day</span>' : o.expires_at ? `<span>Valid until ${fd(o.expires_at)}</span>` : ''}</div>
    <div class="row"><button class="btn" onclick="chk(true)">Confirm and mark as used</button><button class="btn alt" onclick="clearRd()">Cancel</button></div>`;
  else if (rd) res = `<div class="rw"><small class="bad">Cannot redeem</small><b>${esc(RERR[rd.error] || rd.error)}</b>${o ? `<span>${esc(o.type || '')} ${esc(o.text || '')} · ${esc(o.name || '')}${o.used_at ? ' · used ' + fdt(o.used_at) : ''}${rd.error == 'early' ? ' · valid from ' + fd(o.valid_from) : ''}${rd.error == 'expired' ? ' · ended ' + fd(o.expires_at) : ''}</span>` : ''}</div>`;
  return `<div class="a-card"><h2>Redeem a coupon</h2><p class="sub">The customer shows a 6-character code on their card. Type it here. Adding their phone is optional but confirms it's really theirs.</p>
  <div class="row"><div><label class="lb">Coupon code</label><input id="rc" class="big" maxlength="8" autocapitalize="characters" autocomplete="off" value="${esc(rc)}"></div><div><label class="lb">Phone <span>(optional)</span></label><input id="rp" type="tel" inputmode="numeric" placeholder="10 digits" value="${esc(rp)}"></div></div>
  ${rd && rd.ok && !rd.confirmed ? '' : `<button class="btn" data-go ${rbusy ? 'disabled' : ''} onclick="chk(false)">Check coupon</button>`}${res ? '<div style="margin-top:14px">' + res + '</div>' : ''}</div>
  <div class="a-card"><h2>Redeemed coupons</h2><input placeholder="Search name, phone or code" value="${esc(rq)}" oninput="rq=this.value;$('#rl').innerHTML=rlog()"><div id="rl">${rlog()}</div></div>`;
}
function rlog() {
  const s = rq.toLowerCase(), L = M.flatMap(u => (u.offers || []).filter(x => x.used_at).map(x => ({ u, x }))).sort((a, b) => new Date(b.x.used_at) - new Date(a.x.used_at)).filter(r => (r.u.name + r.u.phone + r.x.code + r.x.text).toLowerCase().includes(s)).slice(0, 50);
  return L.map(r => `<div class="of"><div><div class="tag">${esc(r.x.type)} · ${esc(r.x.code || '')}</div><b>${esc(r.x.text)}</b><div class="mut sm">${esc(r.u.name)} · ${esc(r.u.phone)}</div></div><span class="mut sm">${fdt(r.x.used_at)}</span></div>`).join('') || '<p class="a-empty">Nothing redeemed yet.</p>';
}

// ---------- MESSAGE (WhatsApp to many customers) ----------
// WhatsApp does not let a web page message many people (or attach an image) in one go, so this tab prepares
// everything and walks through the customers one tap at a time. See also: contact export for a WhatsApp Broadcast list.
const SEGS = [['all', 'Everyone'], ['new7', 'Joined in the last 7 days'], ['active7', 'Visited in the last 7 days'], ['lapsed', 'Not visited in 30+ days'], ['bday', 'Birthday this month'], ['offers', 'Have an unused offer'], ['ending', 'Card ending within 14 days'], ['custom', 'Hand-picked']];
const SEGF = {
  all: () => true,
  new7: u => new Date(u.joined) > Date.now() - 6048e5,
  active7: u => u.last_stamp && new Date(u.last_stamp) > Date.now() - 6048e5,
  lapsed: u => !u.last_stamp || new Date(u.last_stamp) < Date.now() - 2592e6,
  bday: u => sameMonth(u.bday),
  offers: u => heldOffers(u) > 0,
  ending: u => { const e = cardEnd(u); return e && daysTo(e) <= 14 && daysTo(e) >= 0 },
  custom: u => bsel.has(u.id)
};
const segPool = () => (bseg == 'custom' ? M : M.filter(SEGF[bseg] || (() => false))).filter(u => !optedOut(u));
function bpick() { if (bseg != 'custom') bsel = new Set(segPool().map(u => u.id)) }
const bto = () => M.filter(u => bsel.has(u.id) && u.phone && !optedOut(u));
const BT = () => [
  ['We miss you', `Hi {name}, we miss you at ${biz.name}! Come by this week and collect a stamp. You are closer to ${biz.reward} than you think.`],
  ['New offer', `Hi {name}! A little something for our rewards members at ${biz.name}: `],
  ['News or event', `Hi {name}, news from ${biz.name}: `]
];
function bText(u) {
  let t = bmsg.trim().replace(/\{name\}/gi, first(u) || 'there');
  if (/^https:\/\/\S+$/.test(bimg)) t += '\n' + bimg;
  if (blink) t += '\n' + pubOrigin() + appBase();
  if (bstop) t += '\n\nReply STOP if you do not want these messages.';
  return t;
}
function plistV() {
  const P = segPool(), more = P.length - 300;
  return P.slice(0, 300).map(u => `<label class="pr"><input type="checkbox" ${bsel.has(u.id) ? 'checked' : ''} onchange="tgB('${u.id}',this.checked)"><span><b>${esc(u.name)}</b><small>${esc(u.phone)}</small></span></label>`).join('')
    + (more > 0 ? `<p class="hint" style="padding:10px 0">Showing the first 300 of ${P.length}. "Select all" still covers the whole group.</p>` : '') || '<p class="sub" style="padding:12px 0;margin:0">Nobody in this group right now.</p>';
}
function tgB(id, on) { on ? bsel.add(id) : bsel.delete(id); bupd() }
function bAll(on) { segPool().forEach(u => on ? bsel.add(u.id) : bsel.delete(u.id)); $('#pl').innerHTML = plistV(); bupd() }
function bupd() { const n = bto().length; $('#bcount').textContent = n + (n == 1 ? ' customer selected' : ' customers selected'); bpv() }
function bpv() {
  const p = $('#bpv'); if (p) p.textContent = bText(bto()[0] || { name: 'Priya' });
  const s = $('#bsend'); if (s) s.innerHTML = bsendV();
}
function tpl(i) { bmsg = BT()[i][1]; const t = $('#bm'); t.value = bmsg; t.focus(); bpv() }
function imgNote() {
  return bfile ? `<span class="mut sm">Attached: ${esc(bfile.name)} (${Math.round(bfile.size / 1024)} KB)</span> <button type="button" class="lnk" onclick="bNoImg()">Remove</button>` : '';
}
function bpickImg(inp) {
  const f = inp.files[0]; if (!f) return;
  if (!/^image\/(png|jpeg|webp)$/i.test(f.type)) { inp.value = ''; return toast('Use a PNG, JPG or WebP image') }
  if (f.size > 5e6) { inp.value = ''; return toast('Image too big (max 5 MB)') }
  bfile = f; $('#bfn').innerHTML = imgNote(); bpv();
}
function bNoImg() { bfile = null; const i = $('#bf'); if (i) i.value = ''; $('#bfn').innerHTML = ''; bpv() }
const canShareImg = () => bfile && navigator.canShare && navigator.canShare({ files: [bfile] });
async function bShare() { try { await navigator.share({ files: [bfile], text: bText({ name: 'there' }) }) } catch (e) { } }
async function bCopyImg() {
  try {
    const bm = await createImageBitmap(bfile), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Image copied. Paste it into the WhatsApp chat.');
  } catch (e) { toast('This browser cannot copy images. Use "Share image" or the contact export instead.') }
}
function bsendV() {
  const n = bto().length, ok = n > 0 && bmsg.trim();
  return `<h2>Send</h2><p class="sub">${n} recipient${n == 1 ? '' : 's'}. WhatsApp only lets you send one chat at a time from a web page, so this goes through your customers quickly: open the chat, press send in WhatsApp, come back, next.</p>
  <button class="btn" ${ok ? '' : 'disabled'} onclick="bStart()">Start sending to ${n}</button>
  <div class="row" style="margin-top:14px"><button class="btn sm alt" ${n ? '' : 'disabled'} onclick="bVcf()">Download contacts (.vcf)</button><button class="btn sm alt" ${n ? '' : 'disabled'} onclick="bCopyNums()">Copy numbers</button>${bfile ? `${canShareImg() ? '<button class="btn sm alt" onclick="bShare()">Share image…</button>' : ''}<button class="btn sm alt" onclick="bCopyImg()">Copy image</button>` : ''}</div>
  <p class="hint">Sending one image to everyone at once: download the contacts, import them on your phone, then create a WhatsApp Broadcast list with them. Each person gets it as a normal message. Image links pasted in the message also show a preview.</p>`;
}
function msgV() {
  if (bq) return queueV();
  const n = bto().length;
  const opted = M.filter(optedOut).length;
  return `<div class="a-card"><h2>Who to message</h2><p class="sub">Everyone here agreed to receive offers when they joined.${opted ? ` <b>${opted}</b> ${opted == 1 ? 'customer has' : 'customers have'} opted out and ${opted == 1 ? 'is' : 'are'} left out automatically.` : ''}</p>
  <label class="lb">Group</label><select onchange="bseg=this.value;bpick();render()">${SEGS.map(s => `<option value="${s[0]}"${bseg == s[0] ? ' selected' : ''}>${s[1]} (${s[0] == 'custom' ? bto().length : M.filter(u => !optedOut(u) && SEGF[s[0]](u)).length})</option>`).join('')}</select>
  <div class="row2" style="margin-top:12px"><span class="mut sm" id="bcount">${n} ${n == 1 ? 'customer' : 'customers'} selected</span><span><button class="lnk" onclick="bAll(true)">Select all</button> &nbsp;·&nbsp; <button class="lnk" onclick="bAll(false)">Clear</button></span></div>
  <div class="plist" id="pl">${plistV()}</div></div>
  <div class="a-card"><h2>Your message</h2>
  <div class="chips">${BT().map((t, i) => `<button type="button" class="chip" onclick="tpl(${i})">${esc(t[0])}</button>`).join('')}</div>
  <label class="lb">Message <span>(write {name} to use their first name)</span></label>
  <textarea id="bm" rows="5" maxlength="1000" oninput="bmsg=this.value;bpv()">${esc(bmsg)}</textarea>
  <label class="lb">Image link <span>(optional, https://…)</span></label><input id="bi" value="${esc(bimg)}" placeholder="https://…" oninput="bimg=this.value.trim();bpv()">
  <label class="lb">Or an image from this device <span>(optional)</span></label><input type="file" id="bf" accept="image/png,image/jpeg,image/webp" onchange="bpickImg(this)"><div id="bfn">${imgNote()}</div>
  <label class="chk"><input type="checkbox" ${blink ? 'checked' : ''} onchange="blink=this.checked;bpv()"><span>Add a link to the rewards card</span></label>
  <label class="chk"><input type="checkbox" ${bstop ? 'checked' : ''} onchange="bstop=this.checked;bpv()"><span>Add "Reply STOP to opt out" (when someone replies STOP, tick Opted out for them in Customers and they are never messaged again)</span></label>
  <div class="lb" style="margin-top:18px">Preview</div><div class="bubble" id="bpv">${esc(bText(bto()[0] || { name: 'Priya' }))}</div></div>
  <div class="a-card" id="bsend">${bsendV()}</div>`;
}
function bStart() {
  if (!bmsg.trim()) return toast('Write a message first');
  const ids = bto().map(u => u.id);
  if (!ids.length) return toast('Select at least one customer');
  bq = { ids, i: 0, opened: false, sent: 0 }; render(); window.scrollTo({ top: 0 });
}
function queueV() {
  const U = bq.ids.map(id => M.find(u => u.id == id)).filter(Boolean), n = U.length, u = U[bq.i];
  if (!u) return `<div class="a-card"><h2>All done</h2><button class="btn" onclick="bStop()">Back</button></div>`;
  return `<div class="a-card"><div class="row2"><h2>Customer ${bq.i + 1} of ${n}</h2><button class="lnk" onclick="bStop()">Stop</button></div>
  <div class="prog"><i style="width:${bq.i / n * 100}%"></i></div>
  <div class="rw"><small>To</small><b>${esc(u.name)}</b><span class="mut">${esc(u.phone)}</span></div>
  <div class="lb" style="margin-top:16px">Message</div><div class="bubble">${esc(bText(u))}</div>
  ${bq.opened
      ? `<button class="btn" onclick="bNext()">${bq.i + 1 < n ? 'Sent. Next customer' : 'Sent. Finish'}</button><button class="btn alt" onclick="bOpen()">Open this chat again</button>`
      : `<button class="btn" data-go onclick="bOpen()">Open WhatsApp chat</button><button class="btn alt" onclick="bNext()">Skip this customer</button>`}
  <p class="hint">The message is already typed in WhatsApp. Press send there, then come back to this page.</p></div>`;
}
function bOpen() {
  const u = bq.ids.map(id => M.find(x => x.id == id)).filter(Boolean)[bq.i]; if (!u) return;
  window.open(waLink(u.phone, bText(u)), '_blank', 'noopener');
  if (!bq.opened) bq.sent++;
  bq.opened = true; render();
}
function bNext() {
  bq.i++; bq.opened = false;
  if (bq.i >= bq.ids.length) { toast('Done. You opened ' + bq.sent + (bq.sent == 1 ? ' chat.' : ' chats.')); bq = null; burst() }
  render(); window.scrollTo({ top: 0 });
}
function bStop() { bq = null; render() }
function bVcf() {
  const to = bto(); if (!to.length) return toast('Select at least one customer');
  const cc = CFG.countryCode || '91', e = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/[\r\n]+/g, ' ');
  dl(slug() + '-contacts.vcf', to.map(u => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${e(u.name)} (${e(biz.name)})\r\nTEL;TYPE=CELL:+${cc}${u.phone}\r\nEND:VCARD`).join('\r\n') + '\r\n', 'text/vcard');
  toast(to.length + ' contacts downloaded');
}
function bCopyNums() { const cc = CFG.countryCode || '91'; copyText(bto().map(u => '+' + cc + u.phone).join(', '), 'Numbers copied') }

// ---------- OFFERS ----------
// Stepper: − [value] +  (reads back through v(id) like any input)
const stp = (id, lab, val, min, max, hint) => `<label class="lb">${lab}</label><div class="a-step"><button type="button" aria-label="Less" onclick="step('${id}',-1,${min},${max})">−</button><input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${val}" onchange="step('${id}',0,${min},${max})"><button type="button" aria-label="More" onclick="step('${id}',1,${min},${max})">+</button></div>${hint ? `<p class="hint">${hint}</p>` : ''}`;
function step(id, d, min, max) {
  const i = $('#' + id); i.value = Math.max(min, Math.min(max, Math.round((+i.value || 0) + d)));
  if (id == 'cn2') pvStamps();
}
function pvStamps() {
  const n = Math.max(2, Math.min(20, +v('cn2') || 8)), img = biz.stamp_url && /^(https?:|data:)/.test(biz.stamp_url);
  const el = $('#pvs'); if (!el) return;
  el.innerHTML = Array.from({ length: n }, (_, i) => i < Math.ceil(n / 2) ? `<span class="f">${img ? `<img src="${esc(biz.stamp_url)}" alt="">` : IC.chk}</span>` : `<span>${i + 1}</span>`).join('');
}
const fld = (i, l, x, t, ph) => `<label class="lb">${l}</label><input id="${i}" ${t || ''} ${ph ? `placeholder="${esc(ph)}"` : ''} value="${esc(x)}">`;
const on = x => x ? '<em class="a-on">On</em>' : '<em class="a-off">Off</em>';
function offersV() {
  if (ov) return editorV();
  const T = [
    ['stamp', 'Stamp Card', 'Loyalty program', AI.stamp, `<em class="a-on">${biz.need} stamps</em>`, 'ts-brand'],
    ['welcome', 'Welcome offer', 'On joining', AI.smile, on(biz.welcome_offer), 'ts-green'],
    ['bday', 'Birthday offer', 'Valid on the day', AI.cake, on(biz.bday_offer), 'ts-gold'],
    ['sur', 'Surprise offer', 'On chosen stamps', AI.spark, on(biz.sur_offer && biz.sur_stamps), 'ts-violet']
  ];
  return `<h2 class="a-title">Offers</h2><p class="sub" style="margin-bottom:14px">Choose what you'd like to set up for your customers.</p>
  <div class="a-tiles">${T.map(t => `<button class="a-tile ${t[5]}" onclick="go('o','${t[0]}')"><span class="a-ti">${t[3]}</span><b>${t[1]}</b><small>${t[2]}</small>${t[4]}</button>`).join('')}</div>
  <p class="hint" style="margin-top:18px">Changes apply to every customer straight away.</p>`;
}
const back = () => `<button class="a-back" onclick="go('o')">${AI.back}<span>Back to offers</span></button>`;
const upl = (fid, hid, cur, lbl) => `<label class="lb">${lbl}</label><div class="pv" id="${fid}pv"${cur ? '' : ' hidden'}>${cur ? `<img src="${esc(cur)}" alt=""><button type="button" class="lnk" onclick="rmImg('${hid}','${fid}pv')">Remove this image</button>` : ''}</div><input type="file" id="${fid}" accept="image/png,image/jpeg,image/webp,image/gif" onchange="pvImg('${fid}','${fid}pv','${hid}')"><input type="hidden" id="${hid}" value="0"><p class="hint">PNG, JPG, WebP or GIF, up to 2 MB.</p>`;
const dbHint = () => dbImgs() ? `<p class="hint">Your ${dbImgs() == 1 ? 'image is' : 'images are'} still stored inside the database. <button type="button" class="lnk" onclick="moveImgs(this)">Move to storage</button> to make the app load faster.</p>` : '';

function editorV() {
  if (ov == 'stamp') {
    const h = biz.cooldown_min > 0 && biz.cooldown_min % 60 == 0, cv = h ? biz.cooldown_min / 60 : biz.cooldown_min;
    return back() + `<h2 class="a-title">Stamp card</h2>
    <div class="a-card"><div class="a-h"><h2>Preview</h2><span class="a-tag">What customers see</span></div><div class="a-pvs" id="pvs"></div></div>
    <div class="a-card"><h2>Reward</h2>${stp('cn2', 'Stamps needed', biz.need, 2, 20)}${fld('cr', 'Reward description', biz.reward, '', 'e.g. Free coffee of your choice')}
      ${stp('cx', 'Coupons expire after (days)', biz.exp_days, 0, 365, '0 means never. Applies to every coupon you give.')}</div>
    <div class="a-card"><h2>Collecting stamps</h2>
      <label class="lb">Time between stamps</label><div class="row" style="flex-wrap:nowrap;gap:8px"><div class="a-step"><button type="button" onclick="step('cd',-1,0,999)">−</button><input id="cd" type="number" inputmode="numeric" min="0" max="999" value="${cv}" onchange="step('cd',0,0,999)"><button type="button" onclick="step('cd',1,0,999)">+</button></div><select id="cu" style="max-width:130px"><option value="m"${h ? '' : ' selected'}>minutes</option><option value="h"${h ? ' selected' : ''}>hours</option></select></div>
      <label class="lb">First stamp when a customer joins</label><select id="js"><option value="1"${biz.join_stamp ? ' selected' : ''}>Yes, give a free first stamp</option><option value="0"${biz.join_stamp ? '' : ' selected'}>No</option></select>
      ${stp('cm', 'Each card lasts (months)', biz.card_months, 0, 60, 'Counted from the first stamp. 0 means never. An unfinished card past its end restarts at zero; a full card never expires.')}</div>
    <div class="a-card"><h2>Stamp image</h2>${upl('stfile', 'stx', biz.stamp_url, 'Shown in place of the tick')}<p class="hint" style="margin:0">Leave empty to keep the normal tick stamps.</p>${dbHint()}</div>
    <button class="btn" data-go onclick="svStamp(this)">Save stamp card</button>`;
  }
  if (ov == 'welcome') return back() + `<h2 class="a-title">Welcome offer</h2><div class="a-card"><p class="sub">Given automatically when a customer joins.</p>${fld('wo', 'Offer', biz.welcome_offer, '', 'e.g. 10% off your next visit')}<p class="hint">Leave blank to switch it off.</p></div><button class="btn" data-go onclick="svOffer(this,'welcome')">Save welcome offer</button>`;
  if (ov == 'bday') return back() + `<h2 class="a-title">Birthday offer</h2><div class="a-card"><p class="sub">Reserved up to a week ahead, but usable only on the birthday itself.</p>${fld('bo', 'Offer', biz.bday_offer, '', 'e.g. Free dessert on your birthday')}<p class="hint">Leave blank to switch it off.</p></div><button class="btn" data-go onclick="svOffer(this,'bday')">Save birthday offer</button>`;
  return back() + `<h2 class="a-title">Surprise offer</h2><div class="a-card"><p class="sub">A bonus coupon that unlocks when a customer reaches certain stamps.</p>${fld('ca', 'On stamp number(s)', biz.sur_stamps, '', 'e.g. 3,6')}${fld('co', 'Offer', biz.sur_offer, '', 'e.g. 20% off your next order')}<p class="hint">Leave the offer blank to switch it off.</p></div><button class="btn" data-go onclick="svOffer(this,'sur')">Save surprise offer</button>`;
}

// ---------- images ----------
// Images live in the public Supabase Storage bucket "brand" (folder = business id). If the bucket is not set up yet
// (schema.sql not re-run), small images fall back to being stored inside the database as before.
const IMG_OK = /^image\/(png|jpeg|webp|gif)$/i, EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const toDataUrl = file => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject('read'); r.readAsDataURL(file) });
const inBucket = u => typeof u == 'string' && u.includes('/storage/v1/object/public/brand/' + biz.id + '/');
async function dropOld(u) {
  if (!inBucket(u)) return;
  try { await sb.storage.from('brand').remove([decodeURIComponent(u.split('/brand/')[1].split('?')[0])]) } catch (e) { }
}
async function readImg(file, kind) {
  if (!IMG_OK.test(file.type || '')) throw 'type';
  file = await shrink(file);
  if (file.size > 2e6) throw 'too big';
  const path = biz.id + '/' + kind + '-' + Date.now().toString(36) + '.' + EXT[file.type.toLowerCase()];
  const { error } = await sb.storage.from('brand').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (!error) return sb.storage.from('brand').getPublicUrl(path).data.publicUrl;
  if (file.size > 300000) throw 'no bucket';
  return toDataUrl(file);
}
// Down-scale large images before upload so customers aren't served megabytes on mobile data.
async function shrink(file) {
  if (file.type == 'image/gif' || file.size < 150000) return file;
  const bm = await createImageBitmap(file), k = Math.min(1, 640 / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k);
  c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/webp', .85));
  return blob ? new File([blob], 'img.webp', { type: 'image/webp' }) : file;
}
// One-click: move images that are still stored inside the database into the storage bucket.
async function moveImgs(btn) {
  btn.disabled = true;
  try {
    const patch = {};
    for (const [col, kind] of [['logo_url', 'logo'], ['stamp_url', 'stamp']]) {
      const u = biz[col]; if (!u || !u.startsWith('data:')) continue;
      const blob = await (await fetch(u)).blob();
      patch[col] = await readImg(new File([blob], kind, { type: blob.type }), kind);
      if (patch[col].startsWith('data:')) throw 'no bucket';
    }
    if (!Object.keys(patch).length) return toast('Nothing to move');
    const { error } = await sb.from('businesses').update(patch).eq('id', biz.id);
    if (error) throw error;
    Object.assign(biz, patch); toast('Images moved to storage'); render();
  } catch (e) { toast(e == 'no bucket' ? 'Storage is not set up yet. Run the latest supabase/schema.sql.' : nice(e)) }
  finally { btn.disabled = false }
}
const dbImgs = () => ['logo_url', 'stamp_url'].filter(c => (biz[c] || '').startsWith('data:')).length;
function pvImg(fid, pvid, hid) {
  const f = $('#' + fid).files[0]; if (!f) return;
  const p = $('#' + pvid); p.hidden = false;
  p.innerHTML = `<img src="${esc(URL.createObjectURL(f))}" alt=""><button type="button" class="lnk" onclick="rmImg('${hid}','${pvid}')">Remove this image</button>`;
  $('#' + hid).value = '0';
}
function rmImg(hid, pvid) { $('#' + hid).value = '1'; const p = $('#' + pvid); p.hidden = true; p.innerHTML = '' }
const imgErr = e => toast(e == 'too big' ? 'Image too big (max 2 MB)' : e == 'no bucket' ? 'Storage is not set up yet: run the latest supabase/schema.sql, or use an image under 300 KB' : e == 'type' ? 'Use a PNG, JPG, WebP or GIF image' : 'Could not read that image');

// ---------- saving ----------
async function save(patch, btn, after) {
  if (btn) btn.disabled = true;
  const oldLogo = biz.logo_url, oldStamp = biz.stamp_url;
  const { error } = await sb.from('businesses').update(patch).eq('id', biz.id);
  if (btn) btn.disabled = false;
  if (error) return toast(nice(error));
  Object.assign(biz, patch); brand(biz);
  if ('logo_url' in patch && patch.logo_url != oldLogo) await dropOld(oldLogo);
  if ('stamp_url' in patch && patch.stamp_url != oldStamp) await dropOld(oldStamp);
  toast('Saved');
  if (after) after(); else render();
}
async function svStamp(btn) {
  let stampUrl = v('stx') == '1' ? '' : biz.stamp_url || '';
  const f = $('#stfile').files[0];
  if (f) { try { stampUrl = await readImg(f, 'stamp') } catch (e) { return imgErr(e) } }
  const need = Math.max(2, Math.min(20, Math.round(+v('cn2')) || 8));
  await save({
    need, reward: v('cr').trim(), stamp_url: stampUrl,
    exp_days: Math.max(0, Math.min(365, Math.round(+v('cx')) || 0)),
    cooldown_min: Math.max(0, Math.round((+v('cd') || 0) * (v('cu') == 'h' ? 60 : 1))),
    join_stamp: v('js') != '0', card_months: Math.max(0, Math.min(60, Math.round(+v('cm')) || 0))
  }, btn, () => go('o'));
}
async function svOffer(btn, kind) {
  const t = i => v(i).trim();
  const patch = kind == 'welcome' ? { welcome_offer: t('wo') } : kind == 'bday' ? { bday_offer: t('bo') } : { sur_stamps: t('ca'), sur_offer: t('co') };
  if (kind == 'sur' && patch.sur_offer && !/^\s*\d+(\s*,\s*\d+)*\s*$/.test(patch.sur_stamps)) return toast('Enter stamp numbers like 3 or 3,6');
  await save(patch, btn, () => go('o'));
}
// One save button for the whole More tab: brand, links, "What's new" note and refer-a-friend.
async function svBrand(btn) {
  const t = i => v(i).trim(), ok = x => !x || /^https:\/\//.test(x);
  // One line per prize/message: trimmed, empty lines dropped, each capped at 80 characters.
  const lines = i => v(i).split('\n').map(s => s.trim().slice(0, 80)).filter(Boolean).join('\n');
  if (!['ci', 'cf', 'cw', 'cs', 'crv'].map(t).every(ok)) return toast('Links must start with https://');
  const dg = dgGet(), prizes = dg.prizes.map(p => ({ text: String(p.text).trim().slice(0, 80), chance: Math.round(Math.max(0, Math.min(100, +p.chance || 0)) * 10) / 10 }));
  if (prizes.some(p => !p.text)) return toast('Give every prize a name, or remove the empty row.');
  if (prizes.reduce((a, p) => a + p.chance, 0) > 100.0001) return toast('Prize chances add up to more than 100%.');
  if (!dg.days.length) return toast('Pick at least one day for the daily scratch card.');
  let logoUrl = v('clx') == '1' ? '' : biz.logo_url || '';
  const f = $('#clfile').files[0];
  if (f) { try { logoUrl = await readImg(f, 'logo') } catch (e) { return imgErr(e) } }
  const nw = t('nw').slice(0, 280);
  const connP = cnOk() ? { connect_on: v('cnon') == '1', connect_title: t('cnt').slice(0, 80), connect_sub: t('cns').slice(0, 240), review_url: t('crv') } : {};   // only if supabase/2026-10-15-connect.sql has been run
  if (!HEX6.test(v('cc') || biz.color)) return toast('Pick the brand colour with the colour box');
  const themeP = 'theme' in biz ? { theme: Object.assign({}, brLook(), { done: true }) } : {};   // only if the 2026-10-12-branding.sql update has been run
  await save({
    ...themeP,
    name: t('cn') || biz.name, tagline: t('ct'), logo_url: logoUrl, color: v('cc') || biz.color,
    ig: t('ci'), fb: t('cf'), wa: t('cw'), web: t('cs'),
    ...connP,
    news_text: nw, news_at: nw ? (nw == (biz.news_text || '') && biz.news_at ? biz.news_at : new Date().toISOString()) : null,
    ref_on: v('rfon') == '1', ref_offer: t('rfo') || '20% off your next bill', ref_cap: Math.max(1, Math.min(100, Math.round(+v('rfc')) || 5)),
    daily_on: v('dailon') == '1',
    daily_week_cap: (dw => isNaN(dw) ? 2 : Math.max(0, Math.min(7, dw)))(Math.round(+v('dwc'))),
    daily_prizes: prizes, daily_days: dg.days.join(','), daily_offers: '', daily_notes: lines('dno'),
    daily_valid_days: (n => isNaN(n) ? 7 : Math.max(1, Math.min(90, n)))(Math.round(+v('dvd'))),
    lapsed_days: Math.max(1, Math.min(365, Math.round(+v('wl')) || 10)),
    winback_offer: t('wb'),
    winback_valid_days: v('wv') === '' ? 7 : Math.max(0, Math.min(90, Math.round(+v('wv')) || 0))
  }, btn, () => { DG = null; render(); });
}

// ---------- Daily scratch card editor (prizes, chances, weekdays) ----------
// Edits live in DG until "Save settings" so typing never loses focus; DG resets after a save.
let DG = null;
const DGN = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function dgGet() {
  if (!DG) DG = {
    prizes: (Array.isArray(biz.daily_prizes) ? biz.daily_prizes : []).map(p => ({ text: String(p.text || ''), chance: +p.chance || 0 })),
    days: String(biz.daily_days || '1,2,3,4,5,6,7').split(',').map(Number).filter(n => n >= 1 && n <= 7)
  };
  return DG;
}
function dgRowsV() {
  const d = dgGet();
  return d.prizes.map((p, i) => `<div class="dg-row"><input class="dg-n" maxlength="80" aria-label="Prize ${i + 1} name" placeholder="e.g. 5% off your next bill" value="${esc(p.text)}" oninput="dgSet(${i},'text',this.value)">
    <span class="dg-c"><input type="number" inputmode="decimal" min="0" max="100" step="0.5" aria-label="Chance of prize ${i + 1} in percent" value="${esc(p.chance)}" oninput="dgSet(${i},'chance',this.value)"><b>%</b></span>
    <button type="button" class="btn sm alt" aria-label="Remove prize ${i + 1}" onclick="dgDel(${i})">Remove</button></div>`).join('')
    + (d.prizes.length ? '' : '<p class="hint">No prizes yet. Add your first one below.</p>');
}
function dgDaysV() {
  const d = dgGet();
  return DGN.slice(1).map((n, k) => `<button type="button" class="chip${d.days.includes(k + 1) ? ' on' : ''}" aria-pressed="${d.days.includes(k + 1)}" onclick="dgDay(${k + 1})">${n}</button>`).join('');
}
// Average prizes a customer wins per week: n prize days, chance p each, capped at c a week.
function dgExpected(n, p, c) {
  if (p >= 1) return Math.min(n, c);
  let e = 0, pk = Math.pow(1 - p, n);
  for (let k = 0; k <= n; k++) { e += Math.min(k, c) * pk; pk = pk * (n - k) / (k + 1) * p / (1 - p); }
  return e;
}
function dgSum() {
  const d = dgGet(), tot = Math.round(d.prizes.reduce((a, p) => a + (Math.max(0, +p.chance) || 0), 0) * 10) / 10;
  const cap = Math.max(0, Math.min(7, Math.round(+v('dwc')) || 0)), n = d.days.length;
  const el = $('#dgsum'); if (el) {
    const bad = tot > 100.0001;
    el.className = 'hint' + (bad ? ' bad' : '');
    el.innerHTML = bad ? `Chances add up to <b>${tot}%</b>. They must add up to 100% or less.`
      : `Chances add up to <b>${tot}%</b>, so on a prize day <b>${Math.round((100 - tot) * 10) / 10}%</b> of scratches win nothing.`
      + (n && cap && tot ? ` With ${n} prize ${n == 1 ? 'day' : 'days'} and a limit of ${cap} a week, an average customer wins about <b>${(Math.round(dgExpected(n, tot / 100, cap) * 10) / 10)}</b> prizes a week.` : '');
  }
  const w = $('#dwarn'); if (w) w.hidden = !(v('dailon') == '1' && !d.prizes.some(p => p.text.trim() && +p.chance > 0));
  const ds = $('#dgdaywarn'); if (ds) ds.hidden = n > 0;
}
function dgRefresh() { const r = $('#dgrows'); if (r) r.innerHTML = dgRowsV(); const c = $('#dgdays'); if (c) c.innerHTML = dgDaysV(); const a = $('#dgadd'); if (a) a.disabled = dgGet().prizes.length >= 12; dgSum(); }
function dgSet(i, k, val) { const p = dgGet().prizes[i]; if (p) p[k] = val; dgSum(); }
function dgAdd() { const d = dgGet(); if (d.prizes.length < 12) d.prizes.push({ text: '', chance: 0 }); dgRefresh(); const r = document.querySelectorAll('#dgrows .dg-n'); if (r.length) r[r.length - 1].focus(); }
function dgDel(i) { dgGet().prizes.splice(i, 1); dgRefresh(); }
function dgDay(n) { const d = dgGet(); d.days = d.days.includes(n) ? d.days.filter(x => x != n) : [...d.days, n].sort((a, b) => a - b); dgRefresh(); }
function dailyWarn() { dgSum() }
// ---------- Brand kit: colour, look, live preview ----------
const LOOKS = { radius: [['sharp', 'Sharp'], ['soft', 'Soft'], ['round', 'Round']], font: [['serif', 'Classic (serif)'], ['sans', 'Clean (sans)']], hero: [['gradient', 'Gradient'], ['solid', 'Solid']] };
const brLook = () => { const t = biz.theme || {}; return { radius: v('brr') || t.radius || 'soft', font: v('brf') || t.font || 'serif', hero: v('brh') || t.hero || 'gradient' } };
function brandKit() {
  const t = biz.theme || {}, sel = (id, k, lab) => `<label class="lb">${lab}</label><select id="${id}">${LOOKS[k].map(o => `<option value="${o[0]}"${(t[k] || LOOKS[k][k == 'radius' ? 1 : 0][0]) == o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  return `<label class="lb">Brand colour</label><div class="row"><input id="cc" type="color" value="${esc(HEX6.test(biz.color) ? biz.color : '#8a4b2a')}"><button type="button" class="btn sm alt" onclick="pickLogo(this)">Pick from logo</button></div>
  ${'theme' in biz ? sel('brr', 'radius', 'Corners') + sel('brf', 'font', 'Headings') + sel('brh', 'hero', 'Header') : '<p class="hint">Run supabase/2026-10-12-branding.sql to unlock corner, font and header options.</p>'}
  <label class="lb">Preview <span>(what customers see)</span></label><div id="brpv" class="br"></div><p class="hint" id="brinfo"></p>`;
}
function brPv() {
  const el = $('#brpv'); if (!el) return;
  const c = HEX6.test(v('cc')) ? v('cc') : biz.color, vars = themeVars(c, brLook());
  Object.entries(vars).forEach(([k, x]) => el.style.setProperty(k, x));
  const im = $('#clfilepv img'), pv = $('#clfilepv'), logo = im && pv && !pv.hidden ? im.src : '', name = v('cn') || biz.name;
  el.innerHTML = `<div class="br-h"><div class="br-lg">${logo ? `<img src="${esc(logo)}" alt="">` : esc((name || '?').trim().slice(0, 1).toUpperCase())}</div><div><b>${esc(name)}</b><span>${esc(v('ct'))}</span></div></div>
    <div class="br-b"><div class="br-s">${[1, 1, 1, 0, 0, 0].map(f => `<i class="${f ? 'f' : ''}"></i>`).join('')}</div><button type="button" tabindex="-1">Collect stamp</button><p>Offer text in the brand colour</p></div>`;
  const on = vars['--on-brand'], r = contrast(c, on).toFixed(1), tx = vars['--brand-t-l'] != c.toLowerCase();
  const i = $('#brinfo'); if (i) i.textContent = `Button text is ${on == '#ffffff' ? 'white' : 'dark'} (${r}:1 contrast).` + (tx ? ' Where the colour is used as text it is darkened a little so it stays readable.' : '');
}
async function pickLogo(btn) {
  const im = $('#clfilepv img'), pv = $('#clfilepv');
  if (!im || pv.hidden) return toast('Add a logo first');
  btn.disabled = true;
  try {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = im.src; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 48, 48);
    const d = x.getImageData(0, 0, 48, 48).data, bins = {};
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = (mx - mn) / (mx || 1), l = (mx + mn) / 510;
      if (d[i + 3] < 200 || l > .92 || l < .08 || sat < .25) continue;      // skip transparent, near-white, near-black and grey pixels
      const k = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5), e = bins[k] || (bins[k] = [0, 0, 0, 0]);
      e[0]++; e[1] += r; e[2] += g; e[3] += b;
    }
    const top = Object.values(bins).sort((a, b) => b[0] - a[0])[0];
    if (!top) return toast('This logo has no clear colour (it is black, white or grey). Pick one by hand.');
    $('#cc').value = _hex([top[1] / top[0], top[2] / top[0], top[3] / top[0]]); brPv();
  } catch (e) { toast('Could not read the logo colours here. Pick one by hand.') }
  finally { btn.disabled = false }
}
document.addEventListener('input', e => { if (e.target && /^(cc|cn|ct|brr|brf|brh)$/.test(e.target.id)) brPv() });
document.addEventListener('change', e => { if (e.target && (e.target.id == 'brr' || e.target.id == 'brf' || e.target.id == 'brh' || e.target.id == 'clfile')) setTimeout(brPv, 0) });

// ---------- Support access log (what the platform team did in this shop) ----------
const SUPL = { support_open: 'Support opened your dashboard', settings_changed: 'Settings changed', view_customers: 'Customer list viewed', export: 'Data exported', delete_customer: 'A customer was deleted', reset_customer_password: 'A customer password was reset', import_customers: 'Customers imported', domain_added: 'Domain added', domain_removed: 'Domain removed', owner_changed: 'Owner changed', shop_created: 'Shop created', owner_reset_email: 'Password reset email sent' };
function supV() {
  if (!SUP || !SUP.length || support) return '';
  return `<div class="a-card"><h2>Support access</h2><p class="sub">If you ask Innondu to change something for you, they open your dashboard and it shows up here. Nothing else touches your account.</p>
    ${SUP.slice(0, 10).map(x => `<div class="of"><div><b>${esc(SUPL[x.action] || x.action)}</b>${x.detail && x.detail.fields ? `<div class="mut sm">${esc(x.detail.fields.join(', '))}</div>` : ''}</div><span class="mut sm">${esc(fdt(x.created_at))}</span></div>`).join('')}</div>`;
}
// ---------- MORE ----------
function moreV() {
  return `<div class="a-card"><h2>Brand</h2>${fld('cn', 'Business name', biz.name)}${fld('ct', 'Tagline', biz.tagline)}${upl('clfile', 'clx', biz.logo_url, 'Logo image')}${brandKit()}${dbHint()}</div>
  <div class="a-card"><h2>Links</h2>${fld('ci', 'Instagram', biz.ig, '', 'https://…')}${fld('cf', 'Facebook', biz.fb, '', 'https://…')}${fld('cw', 'WhatsApp', biz.wa, '', 'https://wa.me/…')}${fld('cs', 'Website', biz.web, '', 'https://…')}</div>
  ${connectCard()}
  <div class="a-card"><h2>What's new</h2><p class="sub">A short note shown at the top of every customer's card (an event, new menu item, holiday hours). Leave blank to hide it.</p><textarea id="nw" rows="3" maxlength="280">${esc(biz.news_text || '')}</textarea><p class="hint">Up to 280 characters. Customers who already closed the old note see the new one.</p></div>
  <div class="a-card"><h2>Refer a friend</h2><p class="sub">Each customer gets a personal code. A friend who enters it when joining gets this offer, and the customer gets it too after the friend's next stamp.</p>
    <label class="lb">Referrals</label><select id="rfon"><option value="1"${biz.ref_on ? ' selected' : ''}>On</option><option value="0"${biz.ref_on ? '' : ' selected'}>Off</option></select>
    ${fld('rfo', 'Offer for both', biz.ref_offer, '', 'e.g. 20% off your next bill')}${fld('rfc', 'Most referral rewards per customer in 30 days', biz.ref_cap, 'type=number min=1 max=100')}</div>
  <div class="a-card"><h2>Daily scratch card</h2>
    <p class="sub">A game your customers can play once a day. Everyone scratches every day, but a prize only drops on the days you choose, with the chances you set, and never more than your weekly limit. This is how you bring people back on your quiet days.</p>
    <label class="lb">Daily scratch</label><select id="dailon" onchange="dailyWarn()"><option value="1"${biz.daily_on ? ' selected' : ''}>On</option><option value="0"${biz.daily_on ? '' : ' selected'}>Off</option></select>
    <label class="lb">1. Prizes and their chance</label>
    <p class="hint" style="margin-top:0">Each scratch on a prize day picks at random. Example: "5% off" at 60% and "20% off" at 10% means 60 in every 100 scratches win 5% off, 10 win 20% off, and the other 30 win nothing.</p>
    <div id="dgrows">${dgRowsV()}</div>
    <button type="button" class="btn sm alt" id="dgadd" onclick="dgAdd()"${dgGet().prizes.length >= 12 ? ' disabled' : ''}>Add a prize</button>
    <p class="hint" id="dgsum"></p>
    <p class="hint bad" id="dwarn"${biz.daily_on && !dgGet().prizes.some(p => p.text.trim() && +p.chance > 0) ? '' : ' hidden'}>No prizes yet: customers will only see messages.</p>
    <label class="lb">2. Days a prize can drop</label>
    <p class="hint" style="margin-top:0">Pick the days you want customers to come in. Customers see these days on their card. On the other days they can still scratch but will only see a message.</p>
    <div class="chips" id="dgdays">${dgDaysV()}</div>
    <p class="hint bad" id="dgdaywarn"${dgGet().days.length ? ' hidden' : ''}>Pick at least one day.</p>
    ${fld('dwc', '3. Most prizes one customer can win per week (Monday to Sunday)', biz.daily_week_cap == null ? 2 : biz.daily_week_cap, 'type=number min=0 max=7 oninput=dgSum()')}
    ${fld('dvd', '4. Days a won prize stays valid', biz.daily_valid_days || 7, 'type=number min=1 max=90')}
    <label class="lb">5. Messages for scratches that win nothing, one per line (optional)</label><textarea id="dno" rows="3" maxlength="500">${esc(biz.daily_notes || '')}</textarea>
    <p class="hint">Won prizes appear in the customer's Offers with a code your staff redeem like any other coupon. Changes apply to the next scratch; nothing is paid or promised until a customer wins.</p></div>
  <div class="a-card"><h2>Win-back</h2><p class="sub">Bring back customers who stopped visiting. Leave the offer blank to switch it off.</p>
    ${fld('wl', 'Count a customer as lapsed after (days)', biz.lapsed_days || 10, 'type=number min=1 max=365')}
    ${fld('wb', 'Win-back offer (e.g. 15% off your next visit)', biz.winback_offer || '', '')}
    ${fld('wv', 'Offer is valid for (days, 0 = never expires)', biz.winback_valid_days == null ? 7 : biz.winback_valid_days, 'type=number min=0 max=90')}
  </div>
  <button class="btn" data-go onclick="svBrand(this)">Save settings</button>
  <div class="a-card" style="margin-top:16px"><h2>Stamp tag</h2><p class="sub">The tap-only link behind your NFC tag — staff collect stamps after the first one by tapping the customer's phone on it.</p>
    <label class="lb">Link for the NFC tag</label><input readonly class="ro" value="${esc(scanUrl())}" onclick="this.select()">
    <div class="row" style="margin-top:12px"><button class="btn sm alt" onclick="cpL('s')">Copy link</button><button class="btn sm alt" onclick="regen('scan_token')">Regenerate code</button></div>
    <details class="a-det2"><summary>How to write an NFC tag</summary><p class="sub" style="margin-top:8px">Buy NTAG213 or NTAG215 stickers. In a free app such as NFC Tools, write the link above as a URL record. Staff then tap the customer's phone on the tag. Do not print it as a QR — one stamp per customer per cooldown period either way. If the link ever leaks, regenerate the code and rewrite the tags.</p></details>
    <p class="hint">If you printed the old QR with the stamp link, press Regenerate code and rewrite your tags: the old QR then stops adding stamps.</p></div>
  <div class="a-card" style="margin-top:16px"><h2>Moving to a new address</h2><p class="sub">Innondu has a new web address. Your sign-up QR and NFC stamp tag are built from the address you opened this dashboard on, so the links below are already the new ones.</p>
    <div class="row" style="margin-top:12px"><button class="btn sm" onclick="dlQR()">Download the new QR</button><button class="btn sm alt" onclick="cpL('s')">Copy the stamp link</button></div>
    <p class="hint">Current address: ${esc(location.origin)}</p>
    <details class="a-det2"><summary>Rewrite each NFC tag</summary><ol class="sub" style="margin-top:8px"><li>Install a free NFC app such as NFC Tools.</li><li>Tap Write, then Add a record and choose URL / URI.</li><li>Paste the stamp link copied above.</li><li>Hold the phone on the tag and tap Write.</li><li>Lock the tag so it cannot be overwritten.</li><li>Test the tag on one iPhone and one Android phone.</li></ol></details>
    <p class="hint">Keep any old printed QR in place until the new one replaces it: download the new QR above and print it at the counter.</p></div>
${supV()}
  <div class="a-card"><h2>Account</h2><div class="row"><a class="btn sm alt" href="${appBase()}">Open customer page</a><button class="btn sm alt" onclick="out()">Sign out</button></div></div>`;
}
// ---------- Connect page: on/off switch, texts, locations and offers ----------
// The public page lives at /app/<shop>/connect (see connect/index.html). It only shows while the switch is On.
const cnOk = () => 'connect_on' in biz;
const cnUrl = () => pubOrigin() + appBase() + 'connect';
let CN = null, cnEd = null;   // CN: null | 'loading' | 'err' | { locs: [], promos: [] }
const cnErr = e => /function|schema cache|does not exist|relation/i.test(String((e && e.message) || e)) ? 'Run supabase/2026-10-15-connect.sql in the Supabase SQL editor first.' : nice(e);
function connectCard() {
  if (!cnOk()) return `<div class="a-card"><h2>Connect page</h2><p class="sub" style="margin:0">A public page with your links, menu, locations and offers. It needs one database update: run <b>supabase/2026-10-15-connect.sql</b> in the Supabase SQL editor, then reload.</p></div>`;
  return `<div class="a-card"><div class="a-h"><h2>Connect page</h2><span class="a-tag">${biz.connect_on ? 'Live' : 'Off'}</span></div>
    <p class="sub">One link for your Instagram bio, WhatsApp status or a table card: join rewards, menu, WhatsApp, Google review, where to find you and your current offers.</p>
    <label class="lb">Connect page</label><select id="cnon"><option value="1"${biz.connect_on ? ' selected' : ''}>On: anyone with the link can see it</option><option value="0"${biz.connect_on ? '' : ' selected'}>Off: the link shows "not available"</option></select>
    <label class="lb">Link to share</label><input readonly class="ro" value="${esc(cnUrl())}" onclick="this.select()">
    <div class="row" style="margin-top:10px"><button type="button" class="btn sm alt" onclick="copyText('${esc(cnUrl())}','Link copied')">Copy link</button><a class="btn sm alt" href="${esc(appBase())}connect" target="_blank" rel="noopener">Open page</a></div>
    ${fld('cnt', 'Headline', biz.connect_title, 'maxlength=80', biz.name)}${fld('cns', 'Short line under it', biz.connect_sub, 'maxlength=240', biz.tagline || 'e.g. Fresh desserts, made daily')}
    ${fld('crv', 'Google review link', biz.review_url, '', 'https://g.page/…')}
    <div class="row" style="margin-top:14px"><button type="button" class="btn sm alt" onclick="cnOpen('cnloc')">Locations</button><button type="button" class="btn sm alt" onclick="cnOpen('cnpro')">Offers on the page</button></div>
    <p class="hint">The switch, headline and review link are saved with the Save settings button below. Instagram, Facebook, WhatsApp and Website come from Links above. The menu comes from your Menu tab.</p></div>`;
}
async function loadCn(quiet) {
  if (!quiet) { CN = 'loading'; render() }
  try {
    const [a, b] = await Promise.all([
      sb.from('shop_locations').select('*').eq('business_id', biz.id).order('sort').order('created_at'),
      sb.from('shop_promos').select('*').eq('business_id', biz.id).order('created_at', { ascending: false })]);
    if (a.error) throw a.error; if (b.error) throw b.error;
    CN = { locs: a.data, promos: b.data };
  } catch (e) { CN = 'err'; toast(cnErr(e)) }
  render();
}
function cnOpen(k) { cnEd = null; go('m', k); loadCn() }
const cnBack = () => `<button class="a-back" onclick="go('m')">${AI.back}<span>Back to settings</span></button>`;
const cnChk = (i, l, on) => `<label class="chk"><input type="checkbox" id="${i}"${on ? ' checked' : ''}> ${l}</label>`;
function connEditV() {
  if (CN == 'loading' || CN == null) return cnBack() + '<div class="a-card sk" aria-busy="true"><i></i><i style="width:60%"></i><i></i></div>';
  if (CN == 'err') return cnBack() + `<div class="a-card"><p class="sub" style="margin:0">Could not load this. Run <b>supabase/2026-10-15-connect.sql</b> in the Supabase SQL editor, then reload.</p></div>`;
  return ov == 'cnloc' ? cnLocV() : cnProV();
}
function cnLocV() {
  const e = cnEd && cnEd.kind == 'loc' ? CN.locs.find(x => x.id == cnEd.id) : null, L = CN.locs;
  const st = (id, cur) => `<select${id ? ` onchange="cnLocStatus('${id}',this.value)"` : ' id="lst"'} style="width:auto">${[['open', 'Open'], ['closed', 'Closed'], ['temporarily_closed', 'Temporarily closed']].map(o => `<option value="${o[0]}"${cur == o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  return cnBack() + `<h2 class="a-title">Locations</h2><p class="sub" style="margin-bottom:14px">Where customers can find you: a shop, a stall, a branch. Switch a place to Closed on days it is not out.</p>
  ${L.length ? `<div class="a-card flush">${L.map(l => `<div class="ct-row" style="padding:12px 16px;gap:10px;flex-wrap:wrap;align-items:center"><span class="ct-n" style="flex:1;min-width:160px"><b>${esc(l.name)}${l.active ? '' : ' (hidden)'}</b><small>${esc(l.address || '—')}</small></span>${st(l.id, l.status)}<button class="btn sm alt" onclick="cnEdit('loc','${l.id}')">Edit</button><button class="btn sm alt" onclick="cnDel('loc','${l.id}')">Delete</button></div>`).join('')}</div>` : '<div class="a-card"><p class="sub" style="margin:0">No locations yet. Add your first one below.</p></div>'}
  <div class="a-card"><h2>${e ? 'Edit location' : 'Add a location'}</h2>${fld('lname', 'Name', e ? e.name : '', 'maxlength=80', 'e.g. Hoskote stall')}${fld('laddr', 'Address', e ? e.address : '', 'maxlength=240')}${fld('lmap', 'Google Maps link', e ? e.maps_url : '', '', 'https://maps.app.goo.gl/…')}${fld('lhr', 'Hours or note', e ? e.hours_note : '', 'maxlength=120', 'e.g. 5 pm to 10 pm, closed Mondays')}
    <label class="lb">Today</label>${st('', e ? e.status : 'open')}
    ${cnChk('lfe', 'Show this one first', e && e.featured)}${cnChk('lac', 'Show on the connect page', e ? e.active : true)}
    <div class="row" style="margin-top:14px"><button class="btn" data-go onclick="cnSaveLoc(this)">${e ? 'Save changes' : 'Add location'}</button>${e ? '<button class="btn alt" onclick="cnEd=null;render()">Cancel</button>' : ''}</div></div>`;
}
function cnProV() {
  const e = cnEd && cnEd.kind == 'promo' ? CN.promos.find(x => x.id == cnEd.id) : null, L = CN.promos;
  return cnBack() + `<h2 class="a-title">Offers on the page</h2><p class="sub" style="margin-bottom:14px">Things worth telling people about: a festive special, a weekend deal. These are public notices, separate from the coupons customers collect in the app. Ended offers hide themselves.</p>
  ${L.length ? `<div class="a-card flush">${L.map(p => `<div class="ct-row" style="padding:12px 16px;gap:10px;flex-wrap:wrap;align-items:center"><span class="ct-n" style="flex:1;min-width:160px"><b>${esc(p.title)}${p.active ? '' : ' (hidden)'}</b><small>${p.ends_on ? 'Until ' + esc(fbd(p.ends_on)) : 'No end date'}</small></span><button class="btn sm alt" onclick="cnEdit('promo','${p.id}')">Edit</button><button class="btn sm alt" onclick="cnDel('promo','${p.id}')">Delete</button></div>`).join('')}</div>` : '<div class="a-card"><p class="sub" style="margin:0">No offers yet. Add one below.</p></div>'}
  <div class="a-card"><h2>${e ? 'Edit offer' : 'Add an offer'}</h2>${fld('ptitle', 'Title', e ? e.title : '', 'maxlength=80', 'e.g. Diwali gift boxes')}
    <label class="lb">Details</label><textarea id="pbody" rows="3" maxlength="300">${esc(e ? e.body : '')}</textarea>
    <label class="lb">Kind</label><select id="pkind"><option value="offer"${e && e.kind == 'offer' || !e ? ' selected' : ''}>Offer</option><option value="festive"${e && e.kind == 'festive' ? ' selected' : ''}>Festive special</option></select>
    ${fld('pend', 'Last day (optional)', e && e.ends_on ? e.ends_on : '', 'type=date')}
    ${cnChk('pac', 'Show on the connect page', e ? e.active : true)}
    <div class="row" style="margin-top:14px"><button class="btn" data-go onclick="cnSavePro(this)">${e ? 'Save changes' : 'Add offer'}</button>${e ? '<button class="btn alt" onclick="cnEd=null;render()">Cancel</button>' : ''}</div></div>`;
}
function cnEdit(kind, id) { cnEd = { kind, id }; render(); window.scrollTo(0, document.body.scrollHeight) }
async function cnSaveLoc(btn) {
  const t = i => v(i).trim(); if (!t('lname')) return toast('Give the location a name');
  if (t('lmap') && !/^https:\/\//.test(t('lmap'))) return toast('The map link must start with https://');
  btn.disabled = true;
  try { await rpc(sb, 'save_location', { p_slug: CFG.slug, p_id: cnEd && cnEd.kind == 'loc' ? cnEd.id : null, p_name: t('lname'), p_address: t('laddr'), p_maps_url: t('lmap'), p_status: v('lst') || 'open', p_hours: t('lhr'), p_featured: $('#lfe').checked, p_active: $('#lac').checked }); cnEd = null; await loadCn(true); toast('Saved') }
  catch (e) { toast(cnErr(e)) }
  btn.disabled = false;
}
async function cnSavePro(btn) {
  const t = i => v(i).trim(); if (!t('ptitle')) return toast('Give the offer a title');
  btn.disabled = true;
  try { await rpc(sb, 'save_promo', { p_slug: CFG.slug, p_id: cnEd && cnEd.kind == 'promo' ? cnEd.id : null, p_title: t('ptitle'), p_body: t('pbody'), p_kind: v('pkind') || 'offer', p_ends: t('pend') || null, p_active: $('#pac').checked }); cnEd = null; await loadCn(true); toast('Saved') }
  catch (e) { toast(cnErr(e)) }
  btn.disabled = false;
}
async function cnLocStatus(id, st) {
  try { await rpc(sb, 'set_location_status', { p_id: id, p_status: st }); const l = CN.locs.find(x => x.id == id); if (l) l.status = st; toast('Updated') } catch (e) { toast(cnErr(e)); render() }
}
async function cnDel(kind, id) {
  if (!confirm(kind == 'loc' ? 'Delete this location?' : 'Delete this offer?')) return;
  try { await rpc(sb, kind == 'loc' ? 'delete_location' : 'delete_promo', { p_id: id }); if (cnEd && cnEd.id == id) cnEd = null; await loadCn(true) } catch (e) { toast(cnErr(e)) }
}

async function regen(col) {
  if (!confirm(col == 'join_token' ? 'The old sign-up QR will stop working and you will need to print the new one. Continue?' : 'Old NFC tags and any printed stamp QR will stop adding stamps. Continue?')) return;
  const tok = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('businesses').update({ [col]: tok }).eq('id', biz.id);
  if (error) return toast(nice(error));
  biz[col] = tok; render(); toast(col == 'join_token' ? 'New sign-up code created. Print the new QR.' : 'New stamp code created. Rewrite your tags.');
}

// ---------- QR, export, CSV import ----------
function qrSvg() { if (typeof qrcode == 'undefined') return ''; const z = qrcode(0, 'M'); z.addData(joinUrl()); z.make(); return z.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) }
function drawQR() { const b = $('#qrb'); if (b) b.innerHTML = qrSvg() || '<p class="mut">QR library could not load.</p>' }
async function cpL(k) { try { await navigator.clipboard.writeText(k == 's' ? scanUrl() : joinUrl()); toast('Link copied') } catch (e) { toast('Tap the link box and copy it') } }
function dl(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove() }
const slug = () => biz.name.replace(/\W+/g, '-');
function dlQR() { const x = qrSvg(); if (x) dl(slug() + '-signup-QR.svg', x, 'image/svg+xml') }
function exp() {
  const cell = x => { let s = String(x == null ? '' : x); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' };
  const rows = [['Name', 'Phone', 'Birthday', 'Current stamps', 'Card ends', 'Total visits', 'Rewards redeemed', 'Joined', 'Last visit', 'WhatsApp opted out']]
    .concat(M.map(u => [u.name, u.phone, u.bday || '', u.stamps, cardEnd(u) ? fd(cardEnd(u)) : '', u.total, u.redeemed, fd(u.joined), fd(u.last_stamp), optedOut(u) ? 'yes' : '']));
  dl(slug() + '-customers.csv', '﻿' + rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv');
}

// ---- CSV import (e.g. a paper stamp book): saved as "waiting" cards claimed when that phone joins ----
function parseCsv(t) {
  const out = []; let row = [], c = '', q = false;
  t = t.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch == '"') { if (t[i + 1] == '"') { c += '"'; i++ } else q = false } else c += ch }
    else if (ch == '"') q = true;
    else if (ch == ',') { row.push(c); c = '' }
    else if (ch == '\n' || ch == '\r') { if (ch == '\r' && t[i + 1] == '\n') i++; row.push(c); c = ''; if (row.some(x => x.trim())) out.push(row); row = [] }
    else c += ch;
  }
  row.push(c); if (row.some(x => x.trim())) out.push(row);
  return out;
}
function csvBday(x) {
  x = (x || '').trim(); let m;
  if ((m = x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = x.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
function impParse(text) {
  const R = parseCsv(text); if (R.length < 2) return null;
  const H = R[0].map(h => h.trim().toLowerCase()), col = (...n) => H.findIndex(h => n.some(x => h == x || h.startsWith(x)));
  const ci = { name: col('name'), phone: col('phone', 'mobile'), bday: col('birth'), stamps: col('current stamps', 'stamps'), total: col('total', 'visits'), red: col('rewards', 'redeemed') };
  if (ci.phone < 0) return null;
  const have = new Set(M.map(u => u.phone)), seen = new Set(), good = []; let bad = 0, dup = 0;
  R.slice(1).forEach(x => {
    const phone = normPhone(x[ci.phone] || ''), n = i => i < 0 ? 0 : Math.max(0, Math.round(+(x[i] || 0)) || 0);
    if (!phone) { bad++; return }
    if (have.has(phone) || seen.has(phone)) { dup++; return }
    seen.add(phone);
    good.push({ name: ci.name < 0 ? '' : (x[ci.name] || '').trim(), phone, bday: ci.bday < 0 ? '' : csvBday(x[ci.bday]), stamps: n(ci.stamps), total: n(ci.total), redeemed: n(ci.red) });
  });
  return { good, bad, dup };
}
function impPick(inp) {
  const f = inp.files[0]; if (!f) return; inp.value = '';
  if (f.size > 2e6) return toast('File too big (max 2 MB)');
  const rd = new FileReader();
  rd.onload = () => {
    const r = impParse(String(rd.result)), box = $('#imp');
    if (!r) return toast('Could not find a Phone column. Use the exported CSV as a template.');
    impRows = r.good;
    box.innerHTML = `<div class="a-card"><h2>Import ${r.good.length} customer${r.good.length == 1 ? '' : 's'}?</h2><p class="sub">${r.dup} already ${r.dup == 1 ? 'is a member' : 'are members'} (skipped), ${r.bad} without a valid 10-digit phone (skipped). Imported customers become real members, with their stamps, when they join with that phone number. They are not messaged and cannot log in until then.</p>
    <div class="row"><button class="btn sm" ${r.good.length ? '' : 'disabled'} onclick="impGo(this)">Import</button><button class="btn sm alt" onclick="impRows=null;$('#imp').innerHTML=''">Cancel</button></div></div>`;
  };
  rd.readAsText(f);
}
async function impGo(btn) {
  btn.disabled = true; let added = 0;
  try {
    for (let i = 0; i < impRows.length; i += 500) { const r = await rpc(sb, 'import_members', { p_slug: CFG.slug, p_rows: impRows.slice(i, i + 500) }); added += r.added }
    $('#imp').innerHTML = ''; impRows = null; toast(added + ' customers imported. They join with their phone number.'); burst();
  } catch (e) { btn.disabled = false; toast(/function|schema cache/i.test(String(e && e.message || e)) ? 'Run the latest supabase/schema.sql first' : nice(e)) }
}

// ---------- MENU ----------
// Items live in public.menu_items, categories in public.menu_categories (owner reads via RLS, writes only through the save_/delete_ functions).
// CATS: null (not loaded) | 'err' (database not updated yet) | [{ id, name, sort }]. mfilt: which category the item list is showing.
let CATS = null, mfilt = 'all';
const priceShow = p => { p = String(p || '').trim(); return /^\d+([.,]\d+)?$/.test(p) ? '₹' + p : p };
const mthumb = u => `<span class="mi-ph">${u ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</span>`;
const catOk = () => Array.isArray(CATS);
const catName = id => ((catOk() ? CATS : []).find(c => c.id == id) || {}).name || '';
const catErr = e => /function|schema cache|relation|does not exist/i.test(String(e && e.message || e)) ? 'Run supabase/2026-10-11-menu-categories-fast-stamp.sql first' : nice(e);
const MCOLS = 'id,title,description,price,image_url,available,sort,created_at';
async function loadCats() {
  const r = await sb.from('menu_categories').select('id,name,sort').eq('business_id', biz.id).order('sort').order('created_at');
  CATS = r.error ? 'err' : r.data;
}
async function loadMenuAdm() {
  const q = cols => sb.from('menu_items').select(cols).eq('business_id', biz.id).order('sort').order('created_at');
  const [it, ct] = await Promise.all([q(MCOLS + ',category_id'), sb.from('menu_categories').select('id,name,sort').eq('business_id', biz.id).order('sort').order('created_at')]);
  let items = it;
  if (it.error) items = await q(MCOLS);                       // database not updated yet: items still work, just without categories
  MENU = items.error ? 'err' : items.data.map(x => ({ category_id: null, ...x }));
  CATS = ct.error ? 'err' : ct.data;
  if (tab == 'p') render();
}
function setMf(id) { mfilt = id; render() }
function menuV() {
  if (MENU == null) { loadMenuAdm(); return `<h2 class="a-title">Menu</h2><div class="a-card"><p class="sub" style="margin:0">Loading…</p></div>` }
  if (MENU == 'err') return `<h2 class="a-title">Menu</h2><div class="a-card"><p class="sub" style="margin:0">The menu is not set up in your database yet. Run <b>supabase/2026-10-11-menu-leads.sql</b> in the Supabase SQL editor, then reload.</p></div>`;
  if (ov == 'cats') return catsV();
  if (String(ov || '').startsWith('cat:')) return catEditV();
  if (ov) return menuEditV();
  const cats = catOk() ? CATS : [], loose = MENU.filter(x => !x.category_id || !cats.some(c => c.id == x.category_id));
  if (mfilt != 'all' && !(mfilt == 'none' ? loose.length : cats.some(c => c.id == mfilt))) mfilt = 'all';
  const L = MENU.filter(x => mfilt == 'all' || (mfilt == 'none' ? loose.includes(x) : x.category_id == mfilt));
  const chip = (id, l, n) => `<button type="button" class="a-mchip${mfilt == id ? ' on' : ''}" onclick="setMf('${id}')">${esc(l)}<i>${n}</i></button>`;
  const chips = cats.length ? `<div class="a-mchips">${chip('all', 'All', MENU.length)}${cats.map(c => chip(c.id, c.name, MENU.filter(x => x.category_id == c.id).length)).join('')}${loose.length ? chip('none', 'No category', loose.length) : ''}</div>` : '';
  return `<h2 class="a-title">Menu</h2><p class="sub" style="margin-bottom:14px">Add what you sell and group it into categories. Customers see it in the Menu tab of their app.</p>
  <button class="btn" onclick="go('p','new')">Add an item</button>
  <button class="btn alt" style="margin-top:10px" onclick="go('p','cats')">${catOk() ? (cats.length ? 'Manage categories (' + cats.length + ')' : 'Add categories') : 'Categories'}</button>
  ${CATS == 'err' ? `<p class="hint">Categories need one database update: run <b>supabase/2026-10-11-menu-categories-fast-stamp.sql</b> in the Supabase SQL editor.</p>` : ''}
  ${chips}
  ${L.length ? `<div class="a-card flush" style="margin-top:14px">${L.map(x => `<button type="button" class="mi-row" onclick="go('p','${x.id}')">${mthumb(x.image_url)}
    <span class="mi-tx"><b>${esc(x.title)}</b>${x.available ? '' : '<em>Hidden</em>'}${catName(x.category_id) ? `<small class="mi-cat">${esc(catName(x.category_id))}</small>` : ''}</span><span class="mi-pr">${esc(priceShow(x.price))}</span><i class="mi-ch">${AI.chev}</i></button>`).join('')}</div>`
  : `<div class="a-card" style="margin-top:14px"><p class="sub" style="margin:0">${MENU.length ? 'Nothing in this category yet. Open Manage categories to choose its items.' : 'No items yet. Add your first one: a name, a price and a photo is enough.'}</p></div>`}`;
}

// ----- Categories: add, rename, reorder, choose which items belong -----
function catsV() {
  const back = `<button class="a-back" onclick="go('p')">${AI.back}<span>Back to menu</span></button><h2 class="a-title">Categories</h2>`;
  if (!catOk()) return back + `<div class="a-card"><p class="sub" style="margin:0">Categories need one database update. Run <b>supabase/2026-10-11-menu-categories-fast-stamp.sql</b> in the Supabase SQL editor, then reload.</p></div>`;
  const n = id => MENU.filter(x => x.category_id == id).length;
  return back + `<p class="sub" style="margin-bottom:14px">Group your menu: Starters, Drinks, Desserts, anything you like. Make as many as you want. Customers get them as a swipeable row at the top of their menu.</p>
  <div class="a-card"><label class="lb" style="margin-top:0">New category</label><div class="row"><input id="cnew" maxlength="40" autocomplete="off" placeholder="e.g. Starters" onkeydown="if(event.key==='Enter')addCat()"><button class="btn sm" onclick="addCat()">Add</button></div></div>
  ${CATS.length ? `<div class="a-card flush">${CATS.map((c, i) => `<div class="ct-row"><button type="button" class="ct-main" onclick="go('p','cat:${c.id}')"><span class="ct-n"><b>${esc(c.name)}</b><small>${n(c.id)} ${n(c.id) == 1 ? 'item' : 'items'}</small></span><i class="mi-ch">${AI.chev}</i></button>
    <span class="ct-mv"><button type="button" aria-label="Move up" class="up"${i ? '' : ' disabled'} onclick="moveCat('${c.id}',-1)">${AI.back}</button><button type="button" aria-label="Move down" class="dn"${i < CATS.length - 1 ? '' : ' disabled'} onclick="moveCat('${c.id}',1)">${AI.back}</button></span></div>`).join('')}</div>
  <p class="hint">Tap a category to rename it or tick the items that belong in it. Use the arrows to set the order customers see.</p>`
  : `<div class="a-card"><p class="sub" style="margin:0">No categories yet. Add your first one above, then choose which items go in it.</p></div>`}`;
}
async function addCat() {
  const i = $('#cnew'), name = i ? i.value.trim() : ''; if (!name) return toast('Type a category name');
  try { await rpc(sb, 'save_menu_category', { p_slug: CFG.slug, p_id: null, p_name: name }); await loadCats(); render(); toast('Category added'); const j = $('#cnew'); if (j) j.focus() }
  catch (e) { toast(catErr(e)) }
}
async function moveCat(id, d) {
  const a = CATS.map(c => c.id), i = a.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; CATS = a.map(x => CATS.find(c => c.id == x)); render();
  try { await rpc(sb, 'reorder_menu_categories', { p_slug: CFG.slug, p_ids: a }) } catch (e) { toast(catErr(e)); await loadCats(); render() }
}
function catEditV() {
  const id = String(ov).slice(4), c = catOk() && CATS.find(x => x.id == id);
  if (!c) { ov = 'cats'; return catsV() }
  return `<button class="a-back" onclick="go('p','cats')">${AI.back}<span>Back to categories</span></button><h2 class="a-title">${esc(c.name)}</h2>
  <div class="a-card">${fld('cname', 'Category name', c.name, 'maxlength="40" autocomplete="off"')}</div>
  <div class="a-card flush"><div class="ct-hd"><b>Items in this category</b><span><button type="button" class="lnk" onclick="pickAll(true)">All</button> &nbsp;·&nbsp; <button type="button" class="lnk" onclick="pickAll(false)">None</button></span></div>
  ${MENU.length ? MENU.map(x => `<label class="ct-pick">${mthumb(x.image_url)}<span class="mi-tx"><b>${esc(x.title)}</b>${x.category_id && x.category_id != id && catName(x.category_id) ? `<small class="mi-cat">now in ${esc(catName(x.category_id))}</small>` : ''}</span><input type="checkbox" class="cpick" value="${x.id}"${x.category_id == id ? ' checked' : ''}></label>`).join('')
    : '<p class="sub" style="padding:4px 16px 16px;margin:0">Add some menu items first, then come back to put them here.</p>'}</div>
  <p class="hint">An item sits in one category. Ticking it here moves it out of its old one.</p>
  <button class="btn" data-go onclick="saveCat(this,'${id}')">Save category</button>
  <button class="btn alt" style="margin-top:10px" onclick="delCat(this,'${id}')">Delete this category</button>`;
}
function pickAll(on) { document.querySelectorAll('.cpick').forEach(x => x.checked = on) }
async function saveCat(btn, id) {
  const name = v('cname').trim(); if (!name) return toast('Give the category a name');
  const ids = [...document.querySelectorAll('.cpick:checked')].map(x => x.value);
  btn.disabled = true;
  try {
    await rpc(sb, 'save_menu_category', { p_slug: CFG.slug, p_id: id, p_name: name });
    await rpc(sb, 'set_category_items', { p_slug: CFG.slug, p_category: id, p_items: ids });
    await loadMenuAdm(); toast('Saved'); go('p', 'cats');
  } catch (e) { btn.disabled = false; toast(catErr(e)) }
}
async function delCat(btn, id) {
  if (!confirm('Delete the category "' + catName(id) + '"? Its items stay on the menu, they just lose the category.')) return;
  btn.disabled = true;
  try { await rpc(sb, 'delete_menu_category', { p_id: id }); await loadMenuAdm(); if (mfilt == id) mfilt = 'all'; toast('Deleted'); go('p', 'cats') }
  catch (e) { btn.disabled = false; toast(catErr(e)) }
}

// ----- Items -----
function catNew(sel) { const w = $('#mcatnw'); if (!w) return; w.hidden = sel.value != '__new'; if (!w.hidden) { const i = $('#mcatn'); if (i) i.focus() } }
function menuEditV() {
  const x = ov == 'new' ? { title: '', description: '', price: '', image_url: '', available: true, category_id: mfilt != 'all' && mfilt != 'none' ? mfilt : '' } : MENU.find(i => i.id == ov);
  if (!x) { ov = null; return menuV() }
  const catPick = catOk() ? `<label class="lb">Category</label><select id="mcat" onchange="catNew(this)"><option value="">No category</option>${CATS.map(c => `<option value="${c.id}"${x.category_id == c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__new">+ New category…</option></select>
    <div id="mcatnw" hidden><input id="mcatn" maxlength="40" autocomplete="off" placeholder="New category name" style="margin-top:8px"></div>` : '';
  return `<button class="a-back" onclick="go('p')">${AI.back}<span>Back to menu</span></button><h2 class="a-title">${ov == 'new' ? 'New item' : 'Edit item'}</h2>
  <div class="a-card">${fld('mt', 'Name', x.title, 'maxlength="80" autocomplete="off"', 'e.g. Masala dosa')}
    ${catPick}
    ${fld('mp', 'Price', x.price, 'maxlength="24" autocomplete="off"', 'e.g. 120')}
    <p class="hint">A plain number shows with a ₹. For sizes you can type "80 / 120".</p>
    <label class="lb">Description <span>(optional)</span></label><textarea id="md" rows="4" maxlength="600" placeholder="What is it, what is in it?">${esc(x.description)}</textarea>
    ${upl('mfile', 'mx', x.image_url, 'Photo')}
    <label class="lb">Show on the menu</label><select id="mav"><option value="1"${x.available ? ' selected' : ''}>Yes</option><option value="0"${x.available ? '' : ' selected'}>Hidden for now</option></select></div>
  <button class="btn" data-go onclick="svMenu(this)">Save item</button>
  ${ov == 'new' ? '' : `<button class="btn alt" style="margin-top:10px" onclick="delMenu(this)">Delete this item</button>`}`;
}
async function svMenu(btn) {
  const isNew = ov == 'new', cur = isNew ? null : MENU.find(i => i.id == ov), title = v('mt').trim();
  if (!title) return toast('Give the item a name');
  btn.disabled = true;
  try {
    let img = v('mx') == '1' ? '' : (cur && cur.image_url) || '';
    const f = $('#mfile').files[0];
    if (f) img = await readImg(f, 'menu');
    const args = { p_slug: CFG.slug, p_id: isNew ? null : ov, p_title: title, p_description: v('md').trim(), p_price: v('mp').trim(), p_image: img, p_available: v('mav') != '0' };
    if (catOk()) {
      let cat = v('mcat') || null;
      if (cat == '__new') {
        const nm = v('mcatn').trim();
        if (!nm) { btn.disabled = false; return toast('Type the new category name') }
        cat = await rpc(sb, 'save_menu_category', { p_slug: CFG.slug, p_id: null, p_name: nm });
      }
      args.p_category = cat;
    }
    await rpc(sb, 'save_menu_item', args);
    if (cur && cur.image_url && cur.image_url != img) await dropOld(cur.image_url);
    MENU = null; CATS = null; toast('Saved'); go('p');
  } catch (e) { btn.disabled = false; typeof e == 'string' ? imgErr(e) : toast(/function|schema cache/i.test(String(e && e.message || e)) ? 'Run supabase/2026-10-11-menu-categories-fast-stamp.sql first' : nice(e)) }
}
async function delMenu(btn) {
  const cur = MENU.find(i => i.id == ov); if (!cur || !confirm('Delete "' + cur.title + '" from the menu?')) return;
  btn.disabled = true;
  try { await rpc(sb, 'delete_menu_item', { p_id: ov }); await dropOld(cur.image_url); MENU = null; toast('Deleted'); go('p') }
  catch (e) { btn.disabled = false; toast(nice(e)) }
}

// ---------- INSIGHTS (owner analytics from the analytics() SQL function) ----------
let INS = null, insDays = 90, insBusy = false, insErr = '';
function openIns() { go('h', 'ins'); loadIns() }
async function loadIns(days) {
  if (days) insDays = days;
  insBusy = true; insErr = ''; render();
  try { INS = await rpc(sb, 'analytics', { p_slug: CFG.slug, p_days: insDays }) }
  catch (e) { INS = null; insErr = /function|schema cache/i.test(String(e && e.message || e)) ? 'Run supabase/2026-10-12-analytics.sql in Supabase first.' : nice(e) }
  insBusy = false; if (tab == 'h' && ov == 'ins') render();
}
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + '%' : '—';
const ymd = k => new Date(k + 'T00:00:00Z');                     // a YYYY-MM-DD key as a UTC date (no time zone drift)
const keyOf = d => d.toISOString().slice(0, 10);
const hr12 = h => (h % 12 || 12) + (h < 12 ? 'am' : 'pm');
const DOWN = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function insBars(items, cap) {
  const max = Math.max(1, ...items.map(i => i.n)), few = items.length <= 14;
  return `<div class="in-bars" role="img" aria-label="${esc(cap)}">${items.map((i, k) => `<div class="in-b" title="${esc(i.tip)}: ${i.n}">${few ? `<b>${i.n || ''}</b>` : ''}<i style="height:${i.n ? Math.max(3, Math.round(i.n / max * 90)) : 2}px"></i><span>${i.lab}</span></div>`).join('')}</div>`;
}
function insDailyV(I) {
  const n = Math.min(I.days, 30), by = {}; I.daily.forEach(x => by[x.d] = x.n);
  const items = [...Array(n)].map((_, i) => {
    const k = bizDay(Date.now() - (n - 1 - i) * 864e5), d = ymd(k);
    return { n: by[k] || 0, tip: d.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }), lab: (i % 5 == 0 || n <= 14) ? d.getUTCDate() : '' };
  });
  const tot = items.reduce((a, x) => a + x.n, 0);
  return `<div class="a-card"><div class="a-h"><h2>Stamps per day</h2><span class="mut sm">last ${n} days · ${tot}</span></div>${tot ? insBars(items, 'Stamps per day') : '<p class="a-empty">No stamps in this period.</p>'}</div>`;
}
function insWeeklyV(I) {
  const by = {}; I.weekly.forEach(x => by[x.d] = x.n);
  const wk = k => { const d = ymd(k); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return keyOf(d) };
  const keys = []; for (let i = I.days; i >= 0; i--) { const k = wk(bizDay(Date.now() - i * 864e5)); if (keys[keys.length - 1] != k) keys.push(k) }
  const items = keys.map((k, i) => ({ n: by[k] || 0, tip: 'Week of ' + ymd(k).toLocaleDateString(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short' }), lab: (i % 2 == 0 || keys.length <= 8) ? ymd(k).toLocaleDateString(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short' }) : '' }));
  const part = '<p class="hint">The first and last weeks may be partial.</p>';
  return `<div class="a-card"><div class="a-h"><h2>Stamps per week</h2><span class="mut sm">weeks start Monday</span></div>${items.some(x => x.n) ? insBars(items, 'Stamps per week') + part : '<p class="a-empty">No stamps in this period.</p>'}</div>`;
}
function insHoursV(I) {
  const g = {}; let max = 0; const dayTot = Array(8).fill(0), hrTot = Array(24).fill(0), cells = [];
  I.hours.forEach(([d, h, n]) => { g[d + '-' + h] = n; max = Math.max(max, n); dayTot[d] += n; hrTot[h] += n; cells.push({ d, h, n }) });
  if (!cells.length) return '<div class="a-card"><h2>Busiest times</h2><p class="a-empty">No stamps in this period.</p></div>';
  const top = cells.sort((a, b) => b.n - a.n).slice(0, 3).map(c => `${DOWN[c.d]} ${hr12(c.h)}–${hr12((c.h + 1) % 24)} (${c.n})`);
  const bestDay = dayTot.indexOf(Math.max(...dayTot));
  let grid = '<span></span>' + [...Array(24)].map((_, h) => `<em>${h % 6 == 0 ? hr12(h) : ''}</em>`).join('');
  for (let d = 1; d <= 7; d++) {
    grid += `<span>${DOWN[d].slice(0, 3)}</span>` + [...Array(24)].map((_, h) => { const n = g[d + '-' + h] || 0; return `<i style="${n ? '--v:' + (0.18 + 0.82 * n / max).toFixed(2) : ''}" class="${n ? 'on' : ''}" title="${DOWN[d]} ${hr12(h)}: ${n}"></i>` }).join('');
  }
  return `<div class="a-card"><div class="a-h"><h2>Busiest times</h2><span class="mut sm">${esc(I.tz)}</span></div>
    <p class="sub">Busiest slots: <b>${top.map(esc).join(' · ')}</b>. Best day overall: <b>${DOWN[bestDay]}</b>.</p>
    <div class="in-hm" role="img" aria-label="Heatmap of stamps by weekday and hour">${grid}</div><p class="hint">Darker means more stamps. Hover or tap a cell for the count.</p></div>`;
}
function insRetentionV(I) {
  const r = I.retention, c = I.cohorts;
  const rows = c.map(x => `<div class="of"><div><b>${esc(ymd(x.m + '-01').toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' }))}</b><div class="mut sm">${x.joined} joined</div></div><span>${x.mature ? pct(x.back, x.joined) : '<span class="mut sm">too recent</span>'}</span></div>`).join('');
  return `<div class="a-card"><h2>Do customers come back?</h2>
    <p class="sub">"Came back" means a stamp after the sign-up day, within 30 days of joining. Only people who joined 30+ days ago are counted, so nobody is judged too early.</p>
    <div class="a-sts"><div class="a-st"><b>${pct(r.back30, r.mature)}</b><span>Came back in 30 days${r.mature ? ' (of ' + r.mature + ')' : ''}</span></div>
    <div class="a-st"><b>${pct(r.repeat, r.members)}</b><span>Have 2+ visits</span></div>
    <div class="a-st"><b>${r.active30}</b><span>Stamped in last 30 days</span></div></div>
    ${r.mature < 20 && r.mature > 0 ? '<p class="hint">Small sample: with fewer than 20 people, one customer moves this by several points.</p>' : ''}
    ${rows ? '<h2 style="font-size:16px;margin-top:16px">By month joined</h2>' + rows : ''}</div>`;
}
function insWinbackV(I) {
  const w = I.winback;
  return `<div class="a-card"><h2>Win-back messages</h2>
    ${w.sent ? `<div class="a-sts"><div class="a-st"><b>${w.sent}</b><span>Messages</span></div><div class="a-st"><b>${pct(w.returned, w.sent)}</b><span>Stamped within 30 days (${w.returned})</span></div><div class="a-st"><b>${pct(w.redeemed, w.sent)}</b><span>Used their coupon (${w.redeemed})</span></div></div>
    <p class="hint">Honest reading: the coupon-used figure is the solid one. "Stamped within 30 days" also counts people who would have come back anyway, and the app only knows you opened WhatsApp, not that the message was delivered or read.</p>`
      : '<p class="a-empty">No win-back messages in this period. Send some from Home → Come back.</p>'}</div>`;
}
function insCouponsV(I) {
  const rows = I.coupons.map(c => `<div class="of"><div><b>${esc(c.type)}</b><div class="mut sm">${c.issued} issued · ${c.redeemed} redeemed · ${c.expired} expired · ${c.open} open</div></div><b>${pct(c.redeemed, c.issued)}</b></div>`).join('');
  const t = I.coupons.reduce((a, c) => ({ i: a.i + c.issued, r: a.r + c.redeemed }), { i: 0, r: 0 });
  return `<div class="a-card"><div class="a-h"><h2>Coupons</h2><span class="mut sm">${t.r} of ${t.i} redeemed</span></div>
    <p class="sub">Coupons created in this period, by type. "Open" ones can still be used, so recent coupons look lower than they will end up.</p>${rows || '<p class="a-empty">No coupons in this period.</p>'}</div>`;
}
function insightsV() {
  const head = `<div class="a-h" style="margin:4px 0 12px"><button class="lnk" onclick="go('h')">← Home</button><div class="chips" style="margin:0">${[30, 90, 365].map(d => `<button class="chip${insDays == d ? ' on' : ''}" aria-pressed="${insDays == d}" onclick="loadIns(${d})">${d == 365 ? '1 year' : d + ' days'}</button>`).join('')}</div></div>`;
  if (insBusy && !INS) return head + '<div class="a-card sk" aria-busy="true"><i></i><i style="width:60%"></i><i></i></div>';
  if (insErr) return head + `<div class="a-card"><h2>Insights unavailable</h2><p class="sub">${esc(insErr)}</p><button class="btn sm" onclick="loadIns()">Try again</button></div>`;
  if (!INS) return head;
  const I = INS, t = I.totals;
  return head + `<div class="a-card"><div class="a-sts"><div class="a-st"><b>${t.stamps}</b><span>Stamps, ${I.days} days</span></div><div class="a-st"><b>${t.people}</b><span>Different customers</span></div><div class="a-st"><b>${(t.stamps / I.days).toFixed(1)}</b><span>Stamps a day</span></div></div></div>`
    + insDailyV(I) + insWeeklyV(I) + insHoursV(I) + insRetentionV(I) + insWinbackV(I) + insCouponsV(I);
}

// ---------- render ----------
function view() {
  if (tab == 'h') return ov == 'ins' ? insightsV() : homeV();
  if (tab == 'c') return customersV();
  if (tab == 'r') return redeemV();
  if (tab == 'b') { if (!binit) { bpick(); binit = true } return msgV() }
  if (tab == 'o') return offersV();
  if (tab == 'p') return menuV();
  if (ov == 'cnloc' || ov == 'cnpro') return connEditV();
  return moreV();
}
function render() {
  const y = window.scrollY;
  const sg = signed && !recover && biz;
  $('#top').innerHTML = sg ? hero() + nav() : '';
  const m = $('#app'); m.className = sg ? 'a' : '';
  m.innerHTML = recover ? recoverV() : !signed ? loginV() : !biz ? deniedV() : view();
  if (sg && tab == 'h') drawQR();
  if (sg && tab == 'm') { dgSum(); brPv() }
  if (sg && tab == 'o' && ov == 'stamp') pvStamps();
  if (y) window.scrollTo(0, y);
}

(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  if (!(await resolveShop())) { $('#app').innerHTML = noShopMsg; return }
  sb.auth.onAuthStateChange(ev => { if (ev == 'PASSWORD_RECOVERY') { recover = true; signed = true; render() } });
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enter(); else render();
})();
