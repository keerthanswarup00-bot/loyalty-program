// Owner app (v2): mobile-first dashboard.
// Tabs: Home (stats, stamp QR, reminders) · Customers · Redeem · Offers (visual editors) · More (brand, tag, account).
const sb = notReady() ? null : mkClient('lk-admin');
let signed = false, recover = false, biz = null, M = [], tab = 'h', ov = null, openId = null;
let q = '', rq = '', rc = '', rp = '', rd = null, rbusy = false;
const first = u => (u.name || '').split(' ')[0];

const scanUrl = () => location.origin + '/#scan=' + biz.scan_token;
const heldOffers = u => (u.offers || []).filter(x => !x.used_at && !isExp(x)).length;
// When this customer's current card runs out (null = no deadline).
const cardEnd = u => { if (!biz.card_months || !u.card_started_at || !(u.stamps > 0) || u.stamps >= biz.need) return null; const d = new Date(u.card_started_at); d.setMonth(d.getMonth() + biz.card_months); return d };
const sameMonth = d => d && +d.slice(5, 7) == new Date().getMonth() + 1;

// ---------- icons ----------
const AI = {
  home: ico('<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  users: ico('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .7 3.5 2.4 3.5 5.6"/>'),
  ok: ico('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
  gift: ico('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2 0-4-1-4-3s3-2.5 4 3c1-5.5 4-5 4-3s-2 3-4 3"/>'),
  cog: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
  stamp: ico('<path d="M9 14V9a3 3 0 1 1 6 0v5M5 14h14v3H5zM6 20h12"/>'),
  smile: ico('<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.5 2.5 2 4 2s3-.5 4-2M9 9.5v.01M15 9.5v.01"/>'),
  cake: ico('<path d="M4 20h16v-7H4zM4 16c2 1.5 4-1.5 8 0s6 1.5 8 0M12 13V9M12 6v.01"/>'),
  spark: ico('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>'),
  refresh: ico('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  back: ico('<path d="M15 5l-7 7 7 7"/>'),
  trend: ico('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  repeat: ico('<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>')
};

// ---------- data ----------
async function enter() { signed = true; await load(); render() }
async function load() {
  try {
    const { data, error } = await sb.from('businesses').select('*').eq('slug', CFG.slug).maybeSingle();
    if (error) throw error;
    biz = data;
    if (biz) {
      brand(biz); document.title = 'Owner dashboard · ' + biz.name;
      const r = await sb.from('members').select('*,offers(id,type,text,code,valid_from,used_at,expires_at)').eq('business_id', biz.id).order('joined', { ascending: false });
      if (r.error) throw r.error;
      M = r.data;
    }
  } catch (e) { toast(nice(e)) }
}
async function refresh() { await load(); render(); toast('Updated') }
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
async function out() { await sb.auth.signOut(); signed = false; biz = null; M = []; tab = 'h'; ov = null; render() }
async function forgot() {
  const email = v('em').trim();
  if (!email) return toast('Enter your email above first');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/admin/' });
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
  <button class="btn" onclick="setPw(this)">Save password</button></div>`;
const loginV = () => `<div class="a-card" style="margin-top:40px"><h2>Owner login</h2><p class="sub">Sign in to manage your rewards programme.</p>
  <label class="lb">Email</label><input id="em" type="email" autocomplete="email">
  <label class="lb">Password</label>${pwField('pw', 'current-password')}
  <button class="btn" onclick="login(this)">Sign in</button>
  <p class="note" style="margin:14px 0 0"><a href="#" onclick="forgot();return false">Forgot password?</a></p></div>`;
const deniedV = () => `<div class="a-card" style="margin-top:40px"><h2>No access</h2><p class="sub">This account doesn't manage this business. Sign in with the owner account, or ask for access.</p><button class="btn alt" onclick="out()">Sign out</button></div>`;

// ---------- shell: hero + bottom nav ----------
function hero() {
  const home = tab == 'h' && !ov;
  const n = M.length, tot = M.reduce((a, u) => a + u.total, 0), rw = M.reduce((a, u) => a + u.redeemed, 0);
  const rep = n ? Math.round(M.filter(u => u.total >= 2).length / n * 100) : 0;
  const chip = (ic, val, lab) => `<div class="a-chip">${ic}<b>${val}</b><span>${lab}</span></div>`;
  return `<header class="a-hero${home ? '' : ' slim'}"><div class="a-in">
    <div class="a-brand"><div class="a-logo">${mark(biz)}</div><div class="a-bt"><b>${esc(biz.name)}</b><span>Owner dashboard</span></div>
    <button class="a-ib" aria-label="Refresh" onclick="refresh()">${AI.refresh}</button></div>
    ${home ? `<div class="a-chips">${chip(AI.trend, tot, 'Stamps')}${chip(AI.users, n, 'Members')}${chip(AI.gift, rw, 'Rewards')}${chip(AI.repeat, rep + '%', 'Repeat')}</div>` : ''}
  </div></header>`;
}
function nav() {
  const T = [['h', 'Home', AI.home], ['c', 'Customers', AI.users], ['r', 'Redeem', AI.ok], ['o', 'Offers', AI.gift], ['m', 'More', AI.cog]];
  return `<nav class="a-nav"><div class="a-in">${T.map(t => `<button class="${tab == t[0] ? 'on' : ''}" onclick="go('${t[0]}')"><i>${t[2]}</i><span>${t[1]}</span></button>`).join('')}</div></nav>`;
}

// ---------- HOME ----------
function reminders() {
  const L = [], t = new Date(), today = new Date(t.getFullYear(), t.getMonth(), t.getDate()), link = location.origin + '/';
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
    (u.offers || []).filter(o => !o.used_at && !o.valid_from && o.expires_at && !isExp(o) && daysTo(o.expires_at) <= 3).forEach(o => {
      const k = daysTo(o.expires_at);
      L.push({ k, tag: 'Offer expiring', when: k <= 1 ? 'within a day' : 'in ' + k + ' days', u,
        msg: `Hi ${first(u)}, your offer at ${biz.name} ("${o.text}") expires on ${fd(o.expires_at)}. Open your card to see your code: ${link}` });
    });
  });
  L.sort((a, b) => a.k - b.k);
  return `<div class="a-card"><div class="a-h"><h2>Reminders</h2>${L.length ? `<span class="pill">${L.length}</span>` : ''}</div>
    <p class="sub">Birthdays this week, offers ending soon, cards about to run out. One tap sends a ready message on WhatsApp.</p>`
    + (L.map(r => `<div class="of"><div><div class="tag">${r.tag} · ${r.when}</div><b>${esc(r.u.name)}</b><div class="mut sm">${esc(r.u.phone)}</div></div><a class="btn sm" href="${esc(waLink(r.u.phone, r.msg))}" target="_blank" rel="noopener">WhatsApp</a></div>`).join('')
      || '<p class="a-empty">Nothing due right now.</p>') + '</div>';
}
function homeV() {
  const wk = Date.now() - 6048e5, today0 = new Date().setHours(0, 0, 0, 0);
  const stat = (b, l) => `<div class="a-st"><b>${b}</b><span>${l}</span></div>`;
  const redeemedToday = M.reduce((a, u) => a + (u.offers || []).filter(x => x.used_at && new Date(x.used_at) > today0).length, 0);
  const ending = M.filter(u => { const e = cardEnd(u); return e && daysTo(e) <= 14 && daysTo(e) >= 0 }).length;
  return `<div class="a-card"><div class="a-h"><h2>Stamp QR</h2><span class="a-tag">At the counter</span></div>
    <p class="sub">Customers scan this, or tap the NFC tag, to collect a stamp.</p>
    <div class="qr" id="qrb"></div>
    <div class="row"><button class="btn sm" onclick="dlQR()">Download</button><button class="btn sm alt" onclick="cpL()">Copy link</button></div></div>
  <div class="a-quick"><button onclick="go('r')">${AI.ok}<b>Redeem a coupon</b><span>Enter a customer's code</span></button><button onclick="go('o')">${AI.gift}<b>Edit offers</b><span>Stamps, welcome, birthday</span></button></div>
  <div class="a-card"><h2>At a glance</h2><div class="a-sts">${stat(M.filter(u => u.last_stamp && new Date(u.last_stamp) > wk).length, 'Active, 7 days')}${stat(redeemedToday, 'Redeemed today')}${stat(M.reduce((a, u) => a + heldOffers(u), 0), 'Coupons out')}${stat(ending, 'Cards ending')}${stat(M.filter(u => sameMonth(u.bday)).length, 'Birthdays this month')}</div></div>
  ${reminders()}
  <div class="a-card"><div class="a-h"><h2>Latest sign-ups</h2><button class="lnk" onclick="go('c')">See all</button></div>${M.slice(0, 5).map(u => `<div class="of"><b>${esc(u.name)}</b><span class="mut sm">${esc(u.phone)} · ${fd(u.joined)}</span></div>`).join('') || '<p class="a-empty">No members yet. Print the QR above and put it at the counter.</p>'}</div>`;
}

// ---------- CUSTOMERS ----------
function detail(u) {
  const f = (l, x) => `<div><span>${l}</span><b>${x}</b></div>`;
  const msg = `Hi ${first(u)}, thanks for being part of ${biz.name} rewards! ${location.origin}/`;
  return `<div class="a-det"><div class="a-facts">${f('Birthday', fbd(u.bday))}${f('Visits', u.total)}${f('Rewards earned', u.redeemed)}${f('Coupons held', heldOffers(u))}${f('Joined', fd(u.joined))}${f('Card ends', cardEnd(u) ? fd(cardEnd(u)) : '—')}</div>
    <div class="row"><a class="btn sm" href="${esc(waLink(u.phone, msg))}" target="_blank" rel="noopener">WhatsApp</a><button class="btn sm alt" onclick="resetPw('${u.id}')">Reset password</button><button class="btn sm alt a-del" onclick="del('${u.id}')">Delete</button></div></div>`;
}
function clist() {
  const s = q.toLowerCase(), need = +biz.need;
  const L = M.filter(u => (u.name + u.phone).toLowerCase().includes(s));
  return L.map(u => `<div class="a-cu${openId == u.id ? ' on' : ''}"><button class="a-cr" onclick="tg('${u.id}')"><span class="a-av">${esc((first(u)[0] || '?').toUpperCase())}</span><span class="a-cm"><b>${esc(u.name)}</b><small>${esc(u.phone)} · last visit ${fd(u.last_stamp)}</small><span class="a-bar"><span style="width:${Math.min(100, u.stamps / need * 100)}%"></span></span></span><span class="a-sc">${u.stamps}/${need}</span></button>${openId == u.id ? detail(u) : ''}</div>`).join('')
    || `<p class="a-empty">${M.length ? 'No match.' : 'No customers yet.'}</p>`;
}
function tg(id) { openId = openId == id ? null : id; $('#cl').innerHTML = clist() }
const customersV = () => `<div class="a-bar2"><input placeholder="Search name or phone" value="${esc(q)}" oninput="q=this.value;$('#cl').innerHTML=clist()"><button class="btn sm alt" onclick="exp()">Export CSV</button></div>
  <div class="a-card flush" id="cl">${clist()}</div>`;

// Customers have no real email, so the owner sets a temporary password for them.
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const genPw = () => [...crypto.getRandomValues(new Uint32Array(8))].map(n => chars[n % chars.length]).join('');
async function resetPw(id) {
  const u = M.find(x => x.id == id);
  if (!u) return toast('Customer not found.');
  if (!confirm("Reset this customer's password?\n\nGive them the temporary password afterwards. They can change it after signing in.")) return;
  const p = genPw();
  try {
    await rpc(sb, 'reset_member_password', { p_member: id, p_password: p });
    const msg = `Password reset.\n\nTemporary password\n${p}\n\nGive this to the customer.`;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(p).then(() => toast('Password reset. Temporary password copied.')).catch(() => alert(msg));
    else alert(msg);
  } catch (e) {
    const m = String((e && e.message) || e);
    toast(/not allowed/i.test(m) ? 'You are not allowed to reset this customer.' : "Couldn't reset the password. Please try again.");
  }
}
async function del(id) {
  if (!confirm('Delete this customer and all their data permanently?')) return;
  try { await rpc(sb, 'delete_member', { p_member: id }); M = M.filter(u => u.id != id); openId = null; render() } catch (e) { toast(nice(e)) }
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
    if (r.ok && r.confirmed) { toast('Coupon redeemed'); rc = rp = ''; await load() }
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
  ${rd && rd.ok && !rd.confirmed ? '' : `<button class="btn" ${rbusy ? 'disabled' : ''} onclick="chk(false)">Check coupon</button>`}${res ? '<div style="margin-top:14px">' + res + '</div>' : ''}</div>
  <div class="a-card"><h2>Redeemed coupons</h2><input placeholder="Search name, phone or code" value="${esc(rq)}" oninput="rq=this.value;$('#rl').innerHTML=rlog()"><div id="rl">${rlog()}</div></div>`;
}
function rlog() {
  const s = rq.toLowerCase(), L = M.flatMap(u => (u.offers || []).filter(x => x.used_at).map(x => ({ u, x }))).sort((a, b) => new Date(b.x.used_at) - new Date(a.x.used_at)).filter(r => (r.u.name + r.u.phone + r.x.code + r.x.text).toLowerCase().includes(s)).slice(0, 50);
  return L.map(r => `<div class="of"><div><div class="tag">${esc(r.x.type)} · ${esc(r.x.code || '')}</div><b>${esc(r.x.text)}</b><div class="mut sm">${esc(r.u.name)} · ${esc(r.u.phone)}</div></div><span class="mut sm">${fdt(r.x.used_at)}</span></div>`).join('') || '<p class="a-empty">Nothing redeemed yet.</p>';
}

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
const upl = (fid, hid, cur, lbl) => `<label class="lb">${lbl}</label><div class="pv" id="${fid}pv"${cur ? '' : ' hidden'}>${cur ? `<img src="${esc(cur)}" alt=""><button type="button" class="lnk" onclick="rmImg('${hid}','${fid}pv')">Remove this image</button>` : ''}</div><input type="file" id="${fid}" accept="image/png,image/jpeg,image/webp,image/gif" onchange="pvImg('${fid}','${fid}pv','${hid}')"><input type="hidden" id="${hid}" value="0"><p class="hint">PNG, JPG, WebP or GIF, up to 300 KB.</p>`;

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
    <div class="a-card"><h2>Stamp image</h2>${upl('stfile', 'stx', biz.stamp_url, 'Shown in place of the tick')}<p class="hint" style="margin:0">Leave empty to keep the normal tick stamps.</p></div>
    <button class="btn" onclick="svStamp(this)">Save stamp card</button>`;
  }
  if (ov == 'welcome') return back() + `<h2 class="a-title">Welcome offer</h2><div class="a-card"><p class="sub">Given automatically when a customer joins.</p>${fld('wo', 'Offer', biz.welcome_offer, '', 'e.g. 10% off your next visit')}<p class="hint">Leave blank to switch it off.</p></div><button class="btn" onclick="svOffer(this,'welcome')">Save welcome offer</button>`;
  if (ov == 'bday') return back() + `<h2 class="a-title">Birthday offer</h2><div class="a-card"><p class="sub">Reserved up to a week ahead, but usable only on the birthday itself.</p>${fld('bo', 'Offer', biz.bday_offer, '', 'e.g. Free dessert on your birthday')}<p class="hint">Leave blank to switch it off.</p></div><button class="btn" onclick="svOffer(this,'bday')">Save birthday offer</button>`;
  return back() + `<h2 class="a-title">Surprise offer</h2><div class="a-card"><p class="sub">A bonus coupon that unlocks when a customer reaches certain stamps.</p>${fld('ca', 'On stamp number(s)', biz.sur_stamps, '', 'e.g. 3,6')}${fld('co', 'Offer', biz.sur_offer, '', 'e.g. 20% off your next order')}<p class="hint">Leave the offer blank to switch it off.</p></div><button class="btn" onclick="svOffer(this,'sur')">Save surprise offer</button>`;
}

// ---------- images ----------
const readImg = file => new Promise((resolve, reject) => {
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type || '')) return reject('type');
  if (file.size > 300000) return reject('too big');
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject('read');
  r.readAsDataURL(file);
});
function pvImg(fid, pvid, hid) {
  const f = $('#' + fid).files[0]; if (!f) return;
  const p = $('#' + pvid); p.hidden = false;
  p.innerHTML = `<img src="${esc(URL.createObjectURL(f))}" alt=""><button type="button" class="lnk" onclick="rmImg('${hid}','${pvid}')">Remove this image</button>`;
  $('#' + hid).value = '0';
}
function rmImg(hid, pvid) { $('#' + hid).value = '1'; const p = $('#' + pvid); p.hidden = true; p.innerHTML = '' }
const imgErr = e => toast(e == 'too big' ? 'Image too big (max 300 KB)' : e == 'type' ? 'Use a PNG, JPG, WebP or GIF image' : 'Could not read that image');

// ---------- saving ----------
async function save(patch, btn, after) {
  if (btn) btn.disabled = true;
  const { error } = await sb.from('businesses').update(patch).eq('id', biz.id);
  if (btn) btn.disabled = false;
  if (error) return toast(nice(error));
  Object.assign(biz, patch); brand(biz); toast('Saved');
  if (after) after(); else render();
}
async function svStamp(btn) {
  let stampUrl = v('stx') == '1' ? '' : biz.stamp_url || '';
  const f = $('#stfile').files[0];
  if (f) { try { stampUrl = await readImg(f) } catch (e) { return imgErr(e) } }
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
async function svBrand(btn) {
  const t = i => v(i).trim(), ok = x => !x || /^https:\/\//.test(x);
  if (!['ci', 'cf', 'cw', 'cs'].map(t).every(ok)) return toast('Links must start with https://');
  let logoUrl = v('clx') == '1' ? '' : biz.logo_url || '';
  const f = $('#clfile').files[0];
  if (f) { try { logoUrl = await readImg(f) } catch (e) { return imgErr(e) } }
  await save({ name: t('cn') || biz.name, tagline: t('ct'), logo_url: logoUrl, color: v('cc') || biz.color, ig: t('ci'), fb: t('cf'), wa: t('cw'), web: t('cs') }, btn);
}

// ---------- MORE ----------
function moreV() {
  return `<div class="a-card"><h2>Brand</h2>${fld('cn', 'Business name', biz.name)}${fld('ct', 'Tagline', biz.tagline)}${upl('clfile', 'clx', biz.logo_url, 'Logo image')}${fld('cc', 'Brand colour', biz.color, 'type=color')}</div>
  <div class="a-card"><h2>Links</h2>${fld('ci', 'Instagram', biz.ig, '', 'https://…')}${fld('cf', 'Facebook', biz.fb, '', 'https://…')}${fld('cw', 'WhatsApp', biz.wa, '', 'https://wa.me/…')}${fld('cs', 'Website', biz.web, '', 'https://…')}</div>
  <button class="btn" onclick="svBrand(this)">Save brand and links</button>
  <div class="a-card" style="margin-top:16px"><h2>Stamp tag</h2><p class="sub">The link behind your QR code and NFC tags.</p>
    <input readonly class="ro" value="${esc(scanUrl())}" onclick="this.select()">
    <div class="row" style="margin-top:12px"><button class="btn sm alt" onclick="cpL()">Copy link</button><button class="btn sm alt" onclick="regen()">Regenerate code</button></div>
    <details class="a-det2"><summary>How to write an NFC tag</summary><p class="sub" style="margin-top:8px">Buy NTAG213 or NTAG215 stickers. In a free app such as NFC Tools, write the link above as a URL record. Staff then tap the customer's phone on the tag. If the link ever leaks, regenerate the code and rewrite the tags.</p></details></div>
  <div class="a-card"><h2>Account</h2><div class="row"><a class="btn sm alt" href="/">Open customer page</a><button class="btn sm alt" onclick="out()">Sign out</button></div></div>`;
}
async function regen() {
  if (!confirm('Old printed QR codes and NFC tags will stop working. Continue?')) return;
  const tok = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('businesses').update({ scan_token: tok }).eq('id', biz.id);
  if (error) return toast(nice(error));
  biz.scan_token = tok; render(); toast('New code created. Rewrite your tags.');
}

// ---------- QR + export ----------
function qrSvg() { if (typeof qrcode == 'undefined') return ''; const z = qrcode(0, 'M'); z.addData(scanUrl()); z.make(); return z.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) }
function drawQR() { const b = $('#qrb'); if (b) b.innerHTML = qrSvg() || '<p class="mut">QR library could not load.</p>' }
async function cpL() { try { await navigator.clipboard.writeText(scanUrl()); toast('Link copied') } catch (e) { toast('Tap the link box and copy it') } }
function dl(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove() }
const slug = () => biz.name.replace(/\W+/g, '-');
function dlQR() { const x = qrSvg(); if (x) dl(slug() + '-QR.svg', x, 'image/svg+xml') }
function exp() {
  const cell = x => { let s = String(x == null ? '' : x); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' };
  const rows = [['Name', 'Phone', 'Birthday', 'Current stamps', 'Card ends', 'Total visits', 'Rewards redeemed', 'Joined', 'Last visit']]
    .concat(M.map(u => [u.name, u.phone, u.bday || '', u.stamps, cardEnd(u) ? fd(cardEnd(u)) : '', u.total, u.redeemed, fd(u.joined), fd(u.last_stamp)]));
  dl(slug() + '-customers.csv', '﻿' + rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv');
}

// ---------- render ----------
function view() { return tab == 'h' ? homeV() : tab == 'c' ? customersV() : tab == 'r' ? redeemV() : tab == 'o' ? offersV() : moreV() }
function render() {
  const sg = signed && !recover && biz;
  $('#top').innerHTML = sg ? hero() + nav() : '';
  const m = $('#app'); m.className = sg ? 'a' : '';
  m.innerHTML = recover ? recoverV() : !signed ? loginV() : !biz ? deniedV() : view();
  if (sg && tab == 'h') drawQR();
  if (sg && tab == 'o' && ov == 'stamp') pvStamps();
}

(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  sb.auth.onAuthStateChange(ev => { if (ev == 'PASSWORD_RECOVERY') { recover = true; signed = true; render() } });
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enter(); else render();
})();
