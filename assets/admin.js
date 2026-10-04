// Owner app: login, overview, customers, QR & NFC, settings.
const sb = notReady() ? null : mkClient('lk-admin');
let signed = false, biz = null, M = [], tab = 'o', q = '';

const scanUrl = () => location.origin + '/#scan=' + biz.scan_token;
const heldOffers = u => (u.offers || []).filter(x => !x.used_at && !isExp(x)).length;
const sameMonth = d => d && +d.slice(5, 7) == new Date().getMonth() + 1;

async function enter() {
  signed = true;
  try {
    const { data, error } = await sb.from('businesses').select('*').eq('slug', CFG.slug).maybeSingle();
    if (error) throw error;
    biz = data;
    if (biz) {
      brand(biz); document.title = 'Owner dashboard · ' + biz.name;
      const r = await sb.from('members').select('*,offers(id,used_at,expires_at)').eq('business_id', biz.id).order('joined', { ascending: false });
      if (r.error) throw r.error;
      M = r.data;
    }
  } catch (e) { toast(nice(e)) }
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
async function out() { await sb.auth.signOut(); signed = false; biz = null; M = []; render() }

function loginV() {
  return `<div class="card" style="margin-top:40px"><h2>Owner login</h2><p class="sub">Sign in to manage your rewards programme.</p>
  <label class="lb">Email</label><input id="em" type="email" autocomplete="email">
  <label class="lb">Password</label>${pwField('pw', 'current-password')}
  <button class="btn" onclick="login(this)">Sign in</button></div>`;
}
const deniedV = () => `<div class="card" style="margin-top:40px"><h2>No access</h2><p class="sub">This account doesn't manage this business. Sign in with the owner account, or ask for access.</p></div>`;

function rows() {
  const s = q.toLowerCase(), L = M.filter(u => (u.name + u.phone).toLowerCase().includes(s));
  return L.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.phone)}</td><td>${fbd(u.bday)}</td><td>${u.stamps}</td><td>${u.total}</td><td>${u.redeemed}</td><td>${heldOffers(u)}</td><td>${fd(u.joined)}</td><td>${fd(u.last_stamp)}</td><td><a href="#" onclick="del('${u.id}');return false" style="color:#c33">Delete</a></td></tr>`).join('') || '<tr><td colspan="10" class="mut">No customers yet</td></tr>';
}

function dash() {
  const tabs = [['o', 'Overview'], ['c', 'Customers'], ['q', 'QR & NFC'], ['s', 'Settings']];
  let o = `<div class="tabs">${tabs.map(t => `<button class="${tab == t[0] ? 'on' : ''}" onclick="tab='${t[0]}';render()">${t[1]}</button>`).join('')}</div>`;
  if (tab == 'o') {
    const wk = Date.now() - 6048e5, tot = M.reduce((a, u) => a + u.total, 0), rd = M.reduce((a, u) => a + u.redeemed, 0);
    o += `<div class="stats"><div class="stat"><b>${M.length}</b>Members</div><div class="stat"><b>${tot}</b>Stamps given</div><div class="stat"><b>${rd}</b>Rewards redeemed</div><div class="stat"><b>${M.filter(u => u.last_stamp && new Date(u.last_stamp) > wk).length}</b>Active, 7 days</div><div class="stat"><b>${M.filter(u => sameMonth(u.bday)).length}</b>Birthdays this month</div></div>
    <div class="card" style="margin-top:16px"><h2>Latest sign-ups</h2>${M.slice(0, 5).map(u => `<div class="of"><b>${esc(u.name)}</b><span class="mut sm">${esc(u.phone)} · ${fd(u.joined)}</span></div>`).join('') || '<p class="sub" style="margin:0">No members yet. Share your customer page to get started.</p>'}</div>`;
  }
  if (tab == 'c') o += `<div class="row"><input placeholder="Search name or phone" value="${esc(q)}" oninput="q=this.value;$('#tb').innerHTML=rows()"><button class="btn sm" onclick="exp()">Export CSV</button></div>
  <div class="card tw" style="margin-top:12px"><table><thead><tr><th>Name</th><th>Phone</th><th>Birthday</th><th>Stamps</th><th>Visits</th><th>Rewards</th><th>Offers held</th><th>Joined</th><th>Last visit</th><th></th></tr></thead><tbody id="tb">${rows()}</tbody></table></div>`;
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
    <div class="card"><h2>Offers</h2><p class="sub">Leave any offer blank to switch it off.</p>${f('wo', 'Welcome offer (given when a customer joins)', biz.welcome_offer)}${f('bo', 'Birthday offer (given in their birthday month)', biz.bday_offer)}${f('ca', 'Surprise on stamp number(s), e.g. 3,6', biz.sur_stamps)}${f('co', 'Surprise offer', biz.sur_offer)}${f('cx', 'Offers expire after (days, 0 = never)', biz.exp_days, 'type=number min=0')}</div>
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
    exp_days: Math.max(0, Math.round(+v('cx')) || 0)
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
  const rows = [['Name', 'Phone', 'Birthday', 'Current stamps', 'Total visits', 'Rewards redeemed', 'Joined', 'Last visit']]
    .concat(M.map(u => [u.name, u.phone, u.bday || '', u.stamps, u.total, u.redeemed, fd(u.joined), fd(u.last_stamp)]));
  dl(slug() + '-customers.csv', '﻿' + rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv');
}

function render() {
  $('#top').innerHTML = signed ? `<div class="top"><b>${esc(biz ? biz.name : 'Owner')}</b><span><a class="lnk" href="/">Customer page</a> &nbsp;·&nbsp; <button class="lnk" onclick="out()">Sign out</button></span></div>` : '';
  const m = $('#app'); m.className = signed && biz ? 'wide' : '';
  m.innerHTML = !signed ? loginV() : !biz ? deniedV() : dash();
  if (signed && biz && tab == 'q') drawQR();
}

(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enter(); else render();
})();
