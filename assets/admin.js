// Owner app: login, overview, redeem, customers, QR & NFC, settings.
const sb = notReady() ? null : mkClient('lk-admin');
let signed = false, recover = false, biz = null, M = [], tab = 'o', q = '', rq = '', rc = '', rp = '', rd = null, rbusy = false;
const first = u => (u.name || '').split(' ')[0];

const scanUrl = () => location.origin + '/#scan=' + biz.scan_token;
const heldOffers = u => (u.offers || []).filter(x => !x.used_at && !isExp(x)).length;
// When this customer's current card runs out (null = no deadline: no stamps yet, full card, or the owner set no limit).
const cardEnd = u => { if (!biz.card_months || !u.card_started_at || !(u.stamps > 0) || u.stamps >= biz.need) return null; const d = new Date(u.card_started_at); d.setMonth(d.getMonth() + biz.card_months); return d };
const sameMonth = d => d && +d.slice(5, 7) == new Date().getMonth() + 1;

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

async function login(btn) {
  const email = v('em').trim(), password = v('pw');
  if (!email || !password) return toast('Enter your email and password');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { btn.disabled = false; return toast(nice(error)) }
  await enter();
}
async function out() { await sb.auth.signOut(); signed = false; biz = null; M = []; render() }

// Owner forgot password: Supabase emails a link that returns to /admin/ and opens the "new password" form.
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
const recoverV = () => `<div class="card" style="margin-top:40px"><h2>Set a new password</h2><p class="sub">Choose a new password for your owner account.</p>
  <label class="lb">New password <span>(6+ characters)</span></label>${pwField('np', 'new-password')}
  <button class="btn" onclick="setPw(this)">Save password</button></div>`;

// Customers have no real email, so the owner sets a temporary password for them.
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function genPw() {
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function resetPw(id) {
  const u = M.find(x => x.id == id);
  if (!u) return toast('Customer not found.');
  if (!confirm("Reset this customer's password?\n\nAfter resetting, give the temporary password to the customer. They can change it after signing in.")) return;
  const p = genPw();
  try {
    await rpc(sb, 'reset_member_password', { p_member: id, p_password: p });
    const msg = `Password reset successfully.\n\nTemporary password\n${p}\n\nGive this temporary password to the customer.`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(p).then(() => toast('Password reset successfully. Temporary password copied.')).catch(() => alert(msg));
    } else {
      alert(msg);
      toast('Password reset successfully.');
    }
  } catch (e) {
    const m = String((e && e.message) || e);
    if (/not allowed/i.test(m)) toast('You are not allowed to reset this customer.');
    else if (/password.*(at least|short|characters)/i.test(m)) toast('Password must be at least 6 characters.');
    else toast('Couldn\'t reset the password. Please try again.');
  }
}

function loginV() {
  return `<div class="card" style="margin-top:40px"><h2>Owner login</h2><p class="sub">Sign in to manage your rewards programme.</p>
  <label class="lb">Email</label><input id="em" type="email" autocomplete="email">
  <label class="lb">Password</label>${pwField('pw', 'current-password')}
  <button class="btn" onclick="login(this)">Sign in</button>
  <p class="note" style="margin:14px 0 0"><a href="#" onclick="forgot();return false">Forgot password?</a></p></div>`;
}

// Redeem: staff type the customer's coupon code (and optionally their phone). Check first, then confirm.
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
  else if (rd && rd.ok) res = `<div class="rw"><small>${esc(o.type)} · valid</small><b>${esc(o.text)}</b><span>${esc(o.name)} · ${esc(o.phone)}</span>${o.valid_from ? `<span>Valid only on this day</span>` : o.expires_at ? `<span>Valid until ${fd(o.expires_at)}</span>` : ''}</div>
    <div class="row"><button class="btn" onclick="chk(true)">Confirm and mark as used</button><button class="btn alt" onclick="clearRd()">Cancel</button></div>`;
  else if (rd) res = `<div class="rw"><small class="bad">Cannot redeem</small><b>${esc(RERR[rd.error] || rd.error)}</b>${o ? `<span>${esc(o.type || '')} ${esc(o.text || '')} · ${esc(o.name || '')}${o.used_at ? ' · used ' + fdt(o.used_at) : ''}${rd.error == 'early' ? ' · valid from ' + fd(o.valid_from) : ''}${rd.error == 'expired' ? ' · ended ' + fd(o.expires_at) : ''}</span>` : ''}</div>`;
  return `<div class="card"><h2>Redeem a coupon</h2><p class="sub">The customer shows a 6-character code on their card. Type it here. Adding their phone number is optional but checks it is really theirs.</p>
  <div class="row"><div><label class="lb">Coupon code</label><input id="rc" class="big" maxlength="8" autocapitalize="characters" autocomplete="off" value="${esc(rc)}"></div><div><label class="lb">Phone <span>(optional)</span></label><input id="rp" type="tel" inputmode="numeric" placeholder="10 digits" value="${esc(rp)}"></div></div>
  ${rd && rd.ok && !rd.confirmed ? '' : `<button class="btn" ${rbusy ? 'disabled' : ''} onclick="chk(false)">Check coupon</button>`}${res ? '<div style="margin-top:14px">' + res + '</div>' : ''}</div>
  <div class="card"><div class="row2"><h2>Redeemed coupons</h2></div><input placeholder="Search name, phone or code" value="${esc(rq)}" oninput="rq=this.value;$('#rl').innerHTML=rlog()"><div id="rl">${rlog()}</div></div>`;
}
function rlog() {
  const s = rq.toLowerCase(), L = M.flatMap(u => (u.offers || []).filter(x => x.used_at).map(x => ({ u, x }))).sort((a, b) => new Date(b.x.used_at) - new Date(a.x.used_at)).filter(r => (r.u.name + r.u.phone + r.x.code + r.x.text).toLowerCase().includes(s)).slice(0, 50);
  return L.map(r => `<div class="of"><div><div class="tag">${esc(r.x.type)} · ${esc(r.x.code || '')}</div><b>${esc(r.x.text)}</b><div class="mut sm">${esc(r.u.name)} · ${esc(r.u.phone)}</div></div><span class="mut sm">${fdt(r.x.used_at)}</span></div>`).join('') || '<p class="sub" style="margin:12px 0 0">Nothing redeemed yet.</p>';
}

// Reminders: birthdays in the next 7 days and offers ending within 3 days, each with a ready-to-send WhatsApp message.
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
  return `<div class="card" style="margin-top:16px"><h2>Reminders</h2><p class="sub">Birthdays this week, offers ending soon and cards about to run out. Tap WhatsApp to send a ready-made message.</p>`
    + (L.map(r => `<div class="of"><div><div class="tag">${r.tag} · ${r.when}</div><b>${esc(r.u.name)}</b><div class="mut sm">${esc(r.u.phone)}</div></div><a class="btn sm" href="${esc(waLink(r.u.phone, r.msg))}" target="_blank" rel="noopener">WhatsApp</a></div>`).join('')
      || '<p class="sub" style="margin:0">Nothing due right now.</p>') + '</div>';
}
const deniedV = () => `<div class="card" style="margin-top:40px"><h2>No access</h2><p class="sub">This account doesn't manage this business. Sign in with the owner account, or ask for access.</p></div>`;

function rows() {
  const s = q.toLowerCase(), L = M.filter(u => (u.name + u.phone).toLowerCase().includes(s));
  return L.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.phone)}</td><td>${fbd(u.bday)}</td><td>${u.stamps}</td><td>${cardEnd(u) ? fd(cardEnd(u)) : '—'}</td><td>${u.total}</td><td>${u.redeemed}</td><td>${heldOffers(u)}</td><td>${fd(u.joined)}</td><td>${fd(u.last_stamp)}</td><td><a href="#" onclick="resetPw('${u.id}');return false">Reset password</a> &nbsp;·&nbsp; <a href="#" onclick="del('${u.id}');return false" style="color:#c33">Delete</a></td></tr>`).join('') || '<tr><td colspan="11" class="mut">No customers yet</td></tr>';
}

function dash() {
  const tabs = [['o', 'Overview'], ['r', 'Redeem'], ['c', 'Customers'], ['q', 'QR & NFC'], ['s', 'Settings']];
  let o = `<div class="tabs">${tabs.map(t => `<button class="${tab == t[0] ? 'on' : ''}" onclick="tab='${t[0]}';render()">${t[1]}</button>`).join('')}</div>`;
  if (tab == 'o') {
    const wk = Date.now() - 6048e5, tot = M.reduce((a, u) => a + u.total, 0), rd = M.reduce((a, u) => a + u.redeemed, 0);
    o += `<div class="stats"><div class="stat"><b>${M.length}</b>Members</div><div class="stat"><b>${tot}</b>Stamps given</div><div class="stat"><b>${rd}</b>Rewards redeemed</div><div class="stat"><b>${M.filter(u => u.last_stamp && new Date(u.last_stamp) > wk).length}</b>Active, 7 days</div><div class="stat"><b>${M.filter(u => sameMonth(u.bday)).length}</b>Birthdays this month</div>
    <div class="stat"><b>${M.reduce((a, u) => a + heldOffers(u), 0)}</b>Coupons outstanding</div><div class="stat"><b>${M.reduce((a, u) => a + (u.offers || []).filter(x => x.used_at && new Date(x.used_at) > new Date().setHours(0, 0, 0, 0)).length, 0)}</b>Redeemed today</div><div class="stat"><b>${M.filter(u => { const e = cardEnd(u); return e && daysTo(e) <= 14 && daysTo(e) >= 0 }).length}</b>Cards ending in 14 days</div></div>
    ${reminders()}
    <div class="card" style="margin-top:16px"><h2>Latest sign-ups</h2>${M.slice(0, 5).map(u => `<div class="of"><b>${esc(u.name)}</b><span class="mut sm">${esc(u.phone)} · ${fd(u.joined)}</span></div>`).join('') || '<p class="sub" style="margin:0">No members yet. Share your customer page to get started.</p>'}</div>`;
  }
  if (tab == 'r') o += redeemV();
  if (tab == 'c') o += `<div class="row"><input placeholder="Search name or phone" value="${esc(q)}" oninput="q=this.value;$('#tb').innerHTML=rows()"><button class="btn sm" onclick="exp()">Export CSV</button></div>
  <div class="card tw" style="margin-top:12px"><table><thead><tr><th>Name</th><th>Phone</th><th>Birthday</th><th>Stamps</th><th>Card ends</th><th>Visits</th><th>Rewards</th><th>Offers held</th><th>Joined</th><th>Last visit</th><th></th></tr></thead><tbody id="tb">${rows()}</tbody></table></div>`;
  if (tab == 'q') o += `<div class="card"><h2>Stamp link</h2><p class="sub">Opening this link on a customer's phone adds a stamp (after sign-in). Put it on a QR code or write it to NFC tags for your staff.</p>
  <label>Link for the QR code or NFC tag</label><input readonly class="ro" value="${esc(scanUrl())}" onclick="this.select()">
  <div class="qr" id="qrb"></div>
  <div class="row"><button class="btn sm" onclick="dlQR()">Download QR (SVG)</button><button class="btn sm alt" onclick="cpL()">Copy link</button><button class="btn sm alt" onclick="regen()">Regenerate code</button></div></div>
  <div class="card"><h2>NFC tags for staff</h2><p class="sub" style="margin:0">Buy NTAG213 or NTAG215 stickers. In a free app such as NFC Tools, write the link above as a URL record. Staff then tap the customer's phone on the tag. If the link ever leaks, regenerate the code and rewrite the tags. One stamp per customer per cooldown period either way.</p></div>`;
  if (tab == 's') {
    const f = (i, l, x, t) => `<label>${l}</label><input id="${i}" ${t || ''} value="${esc(x)}">`;
    const h = biz.cooldown_min > 0 && biz.cooldown_min % 60 == 0, cv = h ? biz.cooldown_min / 60 : biz.cooldown_min;
    o += `<div class="card"><h2>Brand</h2>${f('cn', 'Business name', biz.name)}${f('ct', 'Tagline', biz.tagline)}${f('cl', 'Logo image link (https://…, optional)', biz.logo_url)}${f('cc', 'Brand colour', biz.color, 'type=color')}
    ${f('ci', 'Instagram link', biz.ig)}${f('cf', 'Facebook link', biz.fb)}${f('cw', 'WhatsApp link (https://wa.me/…)', biz.wa)}${f('cs', 'Website link', biz.web)}</div>
    <div class="card"><h2>Rewards</h2><div class="row"><div>${f('cn2', 'Stamps needed', biz.need, 'type=number min=2 max=20')}</div><div><label>Time between stamps</label><div class="row" style="gap:6px;flex-wrap:nowrap"><input id="cd" type="number" min="0" value="${cv}"><select id="cu"><option value="m"${h ? '' : ' selected'}>minutes</option><option value="h"${h ? ' selected' : ''}>hours</option></select></div></div></div>${f('cr', 'Reward when card is full', biz.reward)}</div>
    <div class="card"><h2>Stamp card</h2><div class="row"><div><label>First stamp when a customer joins</label><select id="js"><option value="1"${biz.join_stamp ? ' selected' : ''}>Yes, give a free first stamp</option><option value="0"${biz.join_stamp ? '' : ' selected'}>No</option></select></div><div>${f('cm', 'Each card lasts (months from first stamp, 0 = never)', biz.card_months, 'type=number min=0 max=60')}</div></div>
    <p class="hint">An unfinished card that passes its end date starts again from zero. A full card never expires, so the customer can always claim the reward.</p></div>
    <div class="card"><h2>Offers</h2><p class="sub">Leave any offer blank to switch it off.</p>${f('wo', 'Welcome offer (given when a customer joins)', biz.welcome_offer)}${f('bo', 'Birthday offer (valid only on their birthday)', biz.bday_offer)}${f('ca', 'Surprise on stamp number(s), e.g. 3,6', biz.sur_stamps)}${f('co', 'Surprise offer', biz.sur_offer)}${f('cx', 'Offers expire after (days, 0 = never)', biz.exp_days, 'type=number min=0')}</div>
    <button class="btn" onclick="sv(this)">Save settings</button>`;
  }
  return o;
}

async function sv(btn) {
  const t = i => v(i).trim(), ok = x => !x || /^https:\/\//.test(x);
  const links = ['ci', 'cf', 'cw', 'cs', 'cl'].map(t);
  if (!links.every(ok)) return toast('Links must start with https://');
  const patch = {
    name: t('cn') || biz.name, tagline: t('ct'), logo_url: t('cl'), color: v('cc') || biz.color,
    ig: t('ci'), fb: t('cf'), wa: t('cw'), web: t('cs'),
    need: Math.max(2, Math.min(20, Math.round(+v('cn2')) || 8)),
    cooldown_min: Math.max(0, Math.round((+v('cd') || 0) * (v('cu') == 'h' ? 60 : 1))),
    reward: t('cr'), welcome_offer: t('wo'), bday_offer: t('bo'), sur_stamps: t('ca'), sur_offer: t('co'),
    exp_days: Math.max(0, Math.round(+v('cx')) || 0),
    join_stamp: v('js') != '0', card_months: Math.max(0, Math.min(60, Math.round(+v('cm')) || 0))
  };
  btn.disabled = true;
  const { error } = await sb.from('businesses').update(patch).eq('id', biz.id);
  btn.disabled = false;
  if (error) return toast(nice(error));
  Object.assign(biz, patch); brand(biz); toast('Saved'); render();
}

async function del(id) {
  if (!confirm('Delete this customer and all their data permanently?')) return;
  try { await rpc(sb, 'delete_member', { p_member: id }); M = M.filter(u => u.id != id); render() } catch (e) { toast(nice(e)) }
}

async function regen() {
  if (!confirm('Old printed QR codes and NFC tags will stop working. Continue?')) return;
  const tok = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('businesses').update({ scan_token: tok }).eq('id', biz.id);
  if (error) return toast(nice(error));
  biz.scan_token = tok; render(); toast('New code created. Rewrite your tags.');
}

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

function render() {
  $('#top').innerHTML = signed && !recover ? `<div class="top"><b>${esc(biz ? biz.name : 'Owner')}</b><span><button class="lnk" onclick="refresh()">Refresh</button> &nbsp;·&nbsp; <a class="lnk" href="/">Customer page</a> &nbsp;·&nbsp; <button class="lnk" onclick="out()">Sign out</button></span></div>` : '';
  const m = $('#app'); m.className = signed && biz ? 'wide' : '';
  m.innerHTML = recover ? recoverV() : !signed ? loginV() : !biz ? deniedV() : dash();
  if (signed && biz && tab == 'q') drawQR();
}

(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  sb.auth.onAuthStateChange(ev => { if (ev == 'PASSWORD_RECOVERY') { recover = true; signed = true; render() } });
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enter(); else render();
})();
