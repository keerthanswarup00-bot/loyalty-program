// Owner app: login, overview, redeem, customers, message (WhatsApp), QR & NFC, settings.
const sb = notReady() ? null : mkClient('lk-admin');
let signed = false, recover = false, biz = null, M = [], V = [], tab = 'o', q = '', rq = '', rc = '', rp = '', rd = null, rbusy = false;
// Customers tab + Message tab state
let sel = new Set(), bsel = new Set(), sortBy = 'joined', bseg = 'all', bmsg = 'Hi {name}! ', bimg = '', bfile = null, blink = true, bstop = true, bq = null, binit = false;
const first = u => (u.name || '').split(' ')[0];

const scanUrl = () => location.origin + '/#scan=' + biz.scan_token;
const joinUrl = () => location.origin + '/#join=' + biz.join_token;
const heldOffers = u => (u.offers || []).filter(x => !x.used_at && !isExp(x)).length;
// When this customer's current card runs out (null = no deadline: no stamps yet, full card, or the owner set no limit).
const cardEnd = u => { if (!biz.card_months || !u.card_started_at || !(u.stamps > 0) || u.stamps >= biz.need) return null; const d = new Date(u.card_started_at); d.setMonth(d.getMonth() + biz.card_months); return d };
const sameMonth = d => d && +d.slice(5, 7) == new Date().getMonth() + 1;
const go = t => { tab = t; render(); window.scrollTo({ top: 0, behavior: 'smooth' }) };

async function enter() { signed = true; await load(); render() }

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
async function load() {
  try {
    const { data, error } = await sb.from('businesses').select('*').eq('slug', CFG.slug).maybeSingle();
    if (error) throw error;
    biz = data;
    if (biz) {
      brand(biz); document.title = 'Owner dashboard · ' + biz.name;
      M = await pages(() => sb.from('members').select('*,offers(id,type,text,code,valid_from,used_at,expires_at)').eq('business_id', biz.id).order('joined', { ascending: false }).order('id'));
      try {
        const since = new Date(Date.now() - 14 * 864e5).toISOString();
        V = (await pages(() => sb.from('visits').select('id,created_at').eq('business_id', biz.id).gte('created_at', since).order('id'))).map(x => x.created_at);
      } catch (e) { V = [] }
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
async function out() { await sb.auth.signOut(); signed = false; biz = null; M = []; V = []; sel = new Set(); bsel = new Set(); bq = null; binit = false; render() }

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
  <button class="btn" data-go onclick="setPw(this)">Save password</button></div>`;

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
  <button class="btn" data-go onclick="login(this)">Sign in</button>
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
    if (r.ok && r.confirmed) { toast('Coupon redeemed'); haptic(); rc = rp = ''; await load() }
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
  ${rd && rd.ok && !rd.confirmed ? '' : `<button class="btn" data-go ${rbusy ? 'disabled' : ''} onclick="chk(false)">Check coupon</button>`}${res ? '<div style="margin-top:14px">' + res + '</div>' : ''}</div>
  <div class="card"><div class="row2"><h2>Redeemed coupons</h2></div><input placeholder="Search name, phone or code" value="${esc(rq)}" oninput="rq=this.value;$('#rl').innerHTML=rlog()"><div id="rl">${rlog()}</div></div>`;
}
function rlog() {
  const s = rq.toLowerCase(), L = M.flatMap(u => (u.offers || []).filter(x => x.used_at).map(x => ({ u, x }))).sort((a, b) => new Date(b.x.used_at) - new Date(a.x.used_at)).filter(r => (r.u.name + r.u.phone + r.x.code + r.x.text).toLowerCase().includes(s)).slice(0, 50);
  return L.map(r => `<div class="of"><div><div class="tag">${esc(r.x.type)} · ${esc(r.x.code || '')}</div><b>${esc(r.x.text)}</b><div class="mut sm">${esc(r.u.name)} · ${esc(r.u.phone)}</div></div><span class="mut sm">${fdt(r.x.used_at)}</span></div>`).join('') || '<p class="sub" style="margin:12px 0 0">Nothing redeemed yet.</p>';
}

// Reminders: birthdays in the next 7 days and offers ending within 3 days, each with a ready-to-send WhatsApp message.
function remList() {
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
  return L.sort((a, b) => a.k - b.k);
}
function reminders(L) {
  return `<div class="card" style="margin-top:16px"><h2>Reminders</h2><p class="sub">Birthdays this week, offers ending soon and cards about to run out. Tap WhatsApp to send a ready-made message.</p>`
    + (L.map(r => `<div class="of"><div><div class="tag">${r.tag} · ${r.when}</div><b>${esc(r.u.name)}</b><div class="mut sm">${esc(r.u.phone)}</div></div>${optedOut(r.u) ? '<span class="mut sm">Opted out</span>' : `<a class="btn sm" href="${esc(waLink(r.u.phone, r.msg))}" target="_blank" rel="noopener">WhatsApp</a>`}</div>`).join('')
      || '<p class="sub" style="margin:0">Nothing due right now.</p>') + '</div>';
}
const deniedV = () => `<div class="card" style="margin-top:40px"><h2>No access</h2><p class="sub">This account doesn't manage this business. Sign in with the owner account, or ask for access.</p></div>`;

// Stamps given per day over the last 14 days (from the visits log).
function chartV() {
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d });
  const by = {}; V.forEach(t => { const k = new Date(t).toDateString(); by[k] = (by[k] || 0) + 1 });
  const cnt = days.map(d => by[d.toDateString()] || 0), max = Math.max(1, ...cnt), total = cnt.reduce((a, b) => a + b, 0);
  return `<div class="card" style="margin-top:16px"><div class="row2"><h2>Stamps, last 14 days</h2><span class="mut sm">${total} in total</span></div>`
    + (total ? `<div class="bars">${days.map((d, i) => `<div class="bar" title="${esc(d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))}: ${cnt[i]}"><b>${cnt[i] || ''}</b><i style="height:${Math.max(3, Math.round(cnt[i] / max * 84))}px;animation-delay:${i * 30}ms"></i><span>${esc(d.toLocaleDateString(undefined, { weekday: 'narrow' }))}</span></div>`).join('')}</div>`
      : '<p class="sub" style="margin:8px 0 0">No stamps yet. They will show up here as customers tap the tag.</p>') + '</div>';
}

// ---- Customers tab ----
const SORTS = { joined: 'Newest first', name: 'Name A to Z', stamps: 'Most stamps', visit: 'Latest visit', total: 'Most visits' };
function sorted(L) {
  const t = x => x ? +new Date(x) : 0;
  const f = { joined: null, name: (a, b) => (a.name || '').localeCompare(b.name || ''), stamps: (a, b) => b.stamps - a.stamps, visit: (a, b) => t(b.last_stamp) - t(a.last_stamp), total: (a, b) => b.total - a.total }[sortBy];
  return f ? L.slice().sort(f) : L;
}
const filtered = () => { const s = q.toLowerCase(); return sorted(M.filter(u => (u.name + u.phone).toLowerCase().includes(s))) };
function rows() {
  const L = filtered();
  return L.map(u => `<tr><td><input type="checkbox" aria-label="Select ${esc(u.name)}" ${sel.has(u.id) ? 'checked' : ''} onchange="tg('${u.id}',this.checked)"></td><td>${esc(u.name)}${optedOut(u) ? ' <span class="pill" title="Will not be sent bulk WhatsApp messages">Opted out</span>' : ''}</td><td>${esc(u.phone)}</td><td>${fbd(u.bday)}</td><td>${u.stamps}</td><td>${cardEnd(u) ? fd(cardEnd(u)) : '—'}</td><td>${u.total}</td><td>${u.redeemed}</td><td>${heldOffers(u)}</td><td>${fd(u.joined)}</td><td>${fd(u.last_stamp)}</td><td><a href="${esc(waLink(u.phone, 'Hi ' + first(u) + '! '))}" target="_blank" rel="noopener">WhatsApp</a> &nbsp;·&nbsp; <a href="#" onclick="optOut('${u.id}');return false">${optedOut(u) ? 'Opted out (undo)' : 'Mark opted out'}</a> &nbsp;·&nbsp; <a href="#" onclick="resetPw('${u.id}');return false">Reset password</a> &nbsp;·&nbsp; <a href="#" onclick="del('${u.id}');return false" style="color:#c33">Delete</a></td></tr>`).join('') || '<tr><td colspan="12" class="mut">No customers found</td></tr>';
}
function selBtn() { const b = $('#selb'); if (b) { b.textContent = sel.size ? `Message selected (${sel.size})` : 'Message selected'; b.disabled = !sel.size } }
function tg(id, on) { on ? sel.add(id) : sel.delete(id); selBtn() }
function tgAll(on) { filtered().forEach(u => on ? sel.add(u.id) : sel.delete(u.id)); $('#tb').innerHTML = rows(); selBtn() }
async function optOut(id) {
  const u = M.find(x => x.id == id); if (!u) return;
  const on = !optedOut(u);
  try { await rpc(sb, 'set_wa_optout', { p_member: id, p_optout: on }); u.wa_optout = on; bsel.delete(id); $('#tb').innerHTML = rows(); toast(on ? u.name + ' will not get WhatsApp messages' : u.name + ' can get messages again') }
  catch (e) { toast(/function|schema cache/i.test(String(e && e.message || e)) ? 'Run the latest supabase/schema.sql first' : nice(e)) }
}
function msgSel() { if (!sel.size) return; bsel = new Set(sel); bseg = 'custom'; binit = true; go('b') }

// ---- Message tab: WhatsApp to many customers ----
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
const optedOut = u => !!u.wa_optout;
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
  if (blink) t += '\n' + location.origin + '/';
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
  return `<div class="card"><h2>Who to message</h2><p class="sub">Everyone here agreed to receive offers when they joined.${M.some(optedOut) ? ` <b>${M.filter(optedOut).length}</b> ${M.filter(optedOut).length == 1 ? 'customer has' : 'customers have'} opted out and ${M.filter(optedOut).length == 1 ? 'is' : 'are'} left out automatically.` : ''}</p>
  <label class="lb">Group</label><select onchange="bseg=this.value;bpick();render()">${SEGS.map(s => `<option value="${s[0]}"${bseg == s[0] ? ' selected' : ''}>${s[1]} (${s[0] == 'custom' ? bto().length : M.filter(u => !optedOut(u) && SEGF[s[0]](u)).length})</option>`).join('')}</select>
  <div class="row2" style="margin-top:12px"><span class="mut sm" id="bcount">${n} ${n == 1 ? 'customer' : 'customers'} selected</span><span><button class="lnk" onclick="bAll(true)">Select all</button> &nbsp;·&nbsp; <button class="lnk" onclick="bAll(false)">Clear</button></span></div>
  <div class="plist" id="pl">${plistV()}</div></div>
  <div class="card"><h2>Your message</h2>
  <div class="chips">${BT().map((t, i) => `<button type="button" class="chip" onclick="tpl(${i})">${esc(t[0])}</button>`).join('')}</div>
  <label class="lb">Message <span>(write {name} to use their first name)</span></label>
  <textarea id="bm" rows="5" maxlength="1000" oninput="bmsg=this.value;bpv()">${esc(bmsg)}</textarea>
  <label class="lb">Image link <span>(optional, https://…)</span></label><input id="bi" value="${esc(bimg)}" placeholder="https://…" oninput="bimg=this.value.trim();bpv()">
  <label class="lb">Or an image from this device <span>(optional)</span></label><input type="file" id="bf" accept="image/png,image/jpeg,image/webp" onchange="bpickImg(this)"><div id="bfn">${imgNote()}</div>
  <label class="chk"><input type="checkbox" ${blink ? 'checked' : ''} onchange="blink=this.checked;bpv()"><span>Add a link to the rewards card</span></label>
  <label class="chk"><input type="checkbox" ${bstop ? 'checked' : ''} onchange="bstop=this.checked;bpv()"><span>Add "Reply STOP to opt out" (when someone replies STOP, tick Opted out for them in Customers and they are never messaged again)</span></label>
  <div class="lb" style="margin-top:18px">Preview</div><div class="bubble" id="bpv">${esc(bText(bto()[0] || { name: 'Priya' }))}</div></div>
  <div class="card" id="bsend">${bsendV()}</div>`;
}
function bStart() {
  if (!bmsg.trim()) return toast('Write a message first');
  const ids = bto().map(u => u.id);
  if (!ids.length) return toast('Select at least one customer');
  bq = { ids, i: 0, opened: false, sent: 0 }; render(); window.scrollTo({ top: 0 });
}
function queueV() {
  const U = bq.ids.map(id => M.find(u => u.id == id)).filter(Boolean), n = U.length, u = U[bq.i];
  if (!u) return `<div class="card"><h2>All done</h2><button class="btn" onclick="bStop()">Back</button></div>`;
  return `<div class="card"><div class="row2"><h2>Customer ${bq.i + 1} of ${n}</h2><button class="lnk" onclick="bStop()">Stop</button></div>
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

function dash() {
  const L = remList();
  const tabs = [['o', 'Overview', L.length], ['r', 'Redeem'], ['c', 'Customers'], ['b', 'Message'], ['q', 'QR & NFC'], ['s', 'Settings']];
  let o = `<div class="tabs" role="tablist">${tabs.map(t => `<button role="tab" aria-selected="${tab == t[0]}" class="${tab == t[0] ? 'on' : ''}" onclick="go('${t[0]}')">${t[1]}${t[2] ? `<i class="bd">${t[2]}</i>` : ''}</button>`).join('')}</div>`;
  if (tab == 'o') {
    const wk = Date.now() - 6048e5, tot = M.reduce((a, u) => a + u.total, 0), rd = M.reduce((a, u) => a + u.redeemed, 0);
    o += `<div class="qa"><button class="btn sm" onclick="go('r')">Redeem a coupon</button><button class="btn sm alt" onclick="go('b')">Message customers</button><a class="btn sm alt" href="/">Open customer page</a></div>
    <div class="stats"><div class="stat"><b>${M.length}</b>Members</div><div class="stat"><b>${tot}</b>Stamps given</div><div class="stat"><b>${rd}</b>Rewards redeemed</div><div class="stat"><b>${M.filter(u => u.last_stamp && new Date(u.last_stamp) > wk).length}</b>Active, 7 days</div><div class="stat"><b>${M.filter(u => sameMonth(u.bday)).length}</b>Birthdays this month</div>
    <div class="stat"><b>${M.reduce((a, u) => a + heldOffers(u), 0)}</b>Coupons outstanding</div><div class="stat"><b>${M.reduce((a, u) => a + (u.offers || []).filter(x => x.used_at && new Date(x.used_at) > new Date().setHours(0, 0, 0, 0)).length, 0)}</b>Redeemed today</div><div class="stat"><b>${M.filter(u => { const e = cardEnd(u); return e && daysTo(e) <= 14 && daysTo(e) >= 0 }).length}</b>Cards ending in 14 days</div></div>
    ${chartV()}
    ${reminders(L)}
    <div class="card" style="margin-top:16px"><h2>Latest sign-ups</h2>${M.slice(0, 5).map(u => `<div class="of"><b>${esc(u.name)}</b><span class="mut sm">${esc(u.phone)} · ${fd(u.joined)}</span></div>`).join('') || '<p class="sub" style="margin:0">No members yet. Share your customer page to get started.</p>'}</div>`;
  }
  if (tab == 'r') o += redeemV();
  if (tab == 'c') o += `<div class="row"><input placeholder="Search name or phone" value="${esc(q)}" oninput="q=this.value;$('#tb').innerHTML=rows()"><select aria-label="Sort" onchange="sortBy=this.value;$('#tb').innerHTML=rows()">${Object.keys(SORTS).map(k => `<option value="${k}"${sortBy == k ? ' selected' : ''}>${SORTS[k]}</option>`).join('')}</select><button class="btn sm" id="selb" ${sel.size ? '' : 'disabled'} onclick="msgSel()">${sel.size ? `Message selected (${sel.size})` : 'Message selected'}</button><button class="btn sm alt" onclick="exp()">Export CSV</button><button class="btn sm alt" onclick="$('#impf').click()">Import CSV</button><input type="file" id="impf" accept=".csv,text/csv" hidden onchange="impPick(this)"></div><div id="imp"></div>
  <div class="card tw" style="margin-top:12px"><table><thead><tr><th><input type="checkbox" aria-label="Select all shown" onchange="tgAll(this.checked)"></th><th>Name</th><th>Phone</th><th>Birthday</th><th>Stamps</th><th>Card ends</th><th>Visits</th><th>Rewards</th><th>Offers held</th><th>Joined</th><th>Last visit</th><th></th></tr></thead><tbody id="tb">${rows()}</tbody></table></div>`;
  if (tab == 'b') { if (!binit) { bpick(); binit = true } o += msgV() }
  if (tab == 'q') o += `<div class="card"><h2>Sign-up QR</h2><p class="sub">Print this QR for the counter or door. Scanning it lets a new customer join and get their first stamp. It cannot add any later stamps, so a photo of it is of no use for stamping.</p>
  <label>Sign-up link</label><input readonly class="ro" value="${esc(joinUrl())}" onclick="this.select()">
  <div class="qr" id="qrb"></div>
  <div class="row"><button class="btn sm" onclick="dlQR()">Download QR (SVG)</button><button class="btn sm alt" onclick="cpL('j')">Copy link</button><button class="btn sm alt" onclick="regen('join_token')">Regenerate sign-up code</button></div></div>
  <div class="card"><h2>NFC stamp tag</h2><p class="sub">Every stamp after the first comes from this tap-only link. Write it to an NTAG213 or NTAG215 sticker (free app "NFC Tools", URL record) and keep the sticker at the counter. Do not print it as a QR. One stamp per customer per cooldown period either way.</p>
  <label>Link for the NFC tag</label><input readonly class="ro" value="${esc(scanUrl())}" onclick="this.select()">
  <div class="row"><button class="btn sm alt" onclick="cpL('s')">Copy link</button><button class="btn sm alt" onclick="regen('scan_token')">Regenerate stamp code</button></div>
  <p class="hint">If you printed the old QR with the stamp link, press Regenerate stamp code and rewrite your tags: the old QR then stops adding stamps.</p></div>`;
  if (tab == 's') {
    const f = (i, l, x, t) => `<label>${l}</label><input id="${i}" ${t || ''} value="${esc(x)}">`;
    const up = (fid, hid, cur, lbl) => `<label>${lbl}</label><div class="pv" id="${fid}pv"${cur ? '' : ' hidden'}>${cur ? `<img src="${esc(cur)}" alt=""><button type="button" class="lnk" onclick="rmImg('${hid}','${fid}pv')">Remove this image</button>` : ''}</div><input type="file" id="${fid}" accept="image/png,image/jpeg,image/webp,image/gif" onchange="pvImg('${fid}','${fid}pv','${hid}')"><input type="hidden" id="${hid}" value="0"><p class="hint">Upload a PNG, JPG, WebP or GIF, up to 2 MB.</p>`;
    const h = biz.cooldown_min > 0 && biz.cooldown_min % 60 == 0, cv = h ? biz.cooldown_min / 60 : biz.cooldown_min;
    o += `<div class="card"><h2>Brand</h2>${f('cn', 'Business name', biz.name)}${f('ct', 'Tagline', biz.tagline)}${up('clfile', 'clx', biz.logo_url, 'Logo image')}${f('cc', 'Brand colour', biz.color, 'type=color')}
    ${f('ci', 'Instagram link', biz.ig)}${f('cf', 'Facebook link', biz.fb)}${f('cw', 'WhatsApp link (https://wa.me/…)', biz.wa)}${f('cs', 'Website link', biz.web)}</div>
    <div class="card"><h2>Stamp image</h2>${up('stfile', 'stx', biz.stamp_url, 'Stamp image')}<p class="hint" style="margin:0">Shown in place of the collected stamps on the customer's card. Leave empty to keep the normal tick stamps.</p>${dbImgs() ? `<p class="hint">Your ${dbImgs() == 1 ? 'image is' : 'images are'} still stored inside the database. <button type="button" class="lnk" onclick="moveImgs(this)">Move to storage</button> to make the app load faster.</p>` : ''}</div>
    <div class="card"><h2>What's new</h2><p class="sub">A short note shown at the top of every customer's card (an event, new menu item, holiday hours). Leave blank to hide it.</p><textarea id="nw" rows="3" maxlength="280">${esc(biz.news_text || '')}</textarea><p class="hint">Up to 280 characters. Customers who already closed the old note see the new one.</p></div>
    <div class="card"><h2>Refer a friend</h2><p class="sub">Each customer gets a personal code. A friend who enters it when joining gets this offer, and the customer gets it too after the friend's next stamp.</p>
    <label>Referrals</label><select id="rfon"><option value="1"${biz.ref_on ? ' selected' : ''}>On</option><option value="0"${biz.ref_on ? '' : ' selected'}>Off</option></select>
    ${f('rfo', 'Offer for both', biz.ref_offer)}${f('rfc', 'Most referral rewards per customer in 30 days', biz.ref_cap, 'type=number min=1 max=100')}</div>
    <div class="card"><h2>Rewards</h2><div class="row"><div>${f('cn2', 'Stamps needed', biz.need, 'type=number min=2 max=20')}</div><div><label>Time between stamps</label><div class="row" style="gap:6px;flex-wrap:nowrap"><input id="cd" type="number" min="0" value="${cv}"><select id="cu"><option value="m"${h ? '' : ' selected'}>minutes</option><option value="h"${h ? ' selected' : ''}>hours</option></select></div></div></div>${f('cr', 'Reward when card is full', biz.reward)}</div>
    <div class="card"><h2>Stamp card</h2><div class="row"><div><label>First stamp when a customer joins</label><select id="js"><option value="1"${biz.join_stamp ? ' selected' : ''}>Yes, give a free first stamp</option><option value="0"${biz.join_stamp ? '' : ' selected'}>No</option></select></div><div>${f('cm', 'Each card lasts (months from first stamp, 0 = never)', biz.card_months, 'type=number min=0 max=60')}</div></div>
    <p class="hint">An unfinished card that passes its end date starts again from zero. A full card never expires, so the customer can always claim the reward.</p></div>
    <div class="card"><h2>Offers</h2><p class="sub">Leave any offer blank to switch it off.</p>${f('wo', 'Welcome offer (given when a customer joins)', biz.welcome_offer)}${f('bo', 'Birthday offer (valid only on their birthday)', biz.bday_offer)}${f('ca', 'Surprise on stamp number(s), e.g. 3,6', biz.sur_stamps)}${f('co', 'Surprise offer', biz.sur_offer)}${f('cx', 'Offers expire after (days, 0 = never)', biz.exp_days, 'type=number min=0')}</div>
    <div class="savebar"><button class="btn" onclick="sv(this)">Save settings</button></div>`;
  }
  return o;
}

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
  if (file.size > 2e6) throw 'too big';
  const path = biz.id + '/' + kind + '-' + Date.now().toString(36) + '.' + EXT[file.type.toLowerCase()];
  const { error } = await sb.storage.from('brand').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (!error) return sb.storage.from('brand').getPublicUrl(path).data.publicUrl;
  if (file.size > 300000) throw 'no bucket';
  return toDataUrl(file);
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
  const f = $('#' + fid).files[0];
  if (!f) return;
  const p = $('#' + pvid);
  p.hidden = false;
  p.innerHTML = `<img src="${esc(URL.createObjectURL(f))}" alt=""><button type="button" class="lnk" onclick="rmImg('${hid}','${pvid}')">Remove this image</button>`;
  $('#' + hid).value = '0';
}
function rmImg(hid, pvid) {
  $('#' + hid).value = '1';
  const p = $('#' + pvid);
  p.hidden = true;
  p.innerHTML = '';
}
async function sv(btn) {
  const t = i => v(i).trim(), ok = x => !x || /^https:\/\//.test(x);
  if (!['ci', 'cf', 'cw', 'cs'].map(t).every(ok)) return toast('Links must start with https://');
  let logoUrl = v('clx') == '1' ? '' : biz.logo_url || '';
  let stampUrl = v('stx') == '1' ? '' : biz.stamp_url || '';
  const lfile = $('#clfile').files[0], sfile = $('#stfile').files[0];
  btn.disabled = true;
  try {
    if (lfile) logoUrl = await readImg(lfile, 'logo');
    if (sfile) stampUrl = await readImg(sfile, 'stamp');
  } catch (e) {
    btn.disabled = false;
    return toast(e == 'too big' ? 'Image too big (max 2 MB)' : e == 'no bucket' ? 'Storage is not set up yet: run the latest supabase/schema.sql, or use an image under 300 KB' : e == 'type' ? 'Use a PNG, JPG, WebP or GIF image' : 'Could not read that image');
  }
  await doSave({ logoUrl, stampUrl, t, btn });
}

async function doSave({ logoUrl, stampUrl, t, btn }) {
  const patch = {
    name: t('cn') || biz.name, tagline: t('ct'), logo_url: logoUrl || '', stamp_url: stampUrl || '', color: v('cc') || biz.color,
    ig: t('ci'), fb: t('cf'), wa: t('cw'), web: t('cs'),
    need: Math.max(2, Math.min(20, Math.round(+v('cn2')) || 8)),
    cooldown_min: Math.max(0, Math.round((+v('cd') || 0) * (v('cu') == 'h' ? 60 : 1))),
    reward: t('cr'), welcome_offer: t('wo'), bday_offer: t('bo'), sur_stamps: t('ca'), sur_offer: t('co'),
    news_text: t('nw').slice(0, 280), news_at: t('nw') ? (t('nw') == (biz.news_text || '') && biz.news_at ? biz.news_at : new Date().toISOString()) : null,
    ref_on: v('rfon') == '1', ref_offer: t('rfo') || '20% off your next bill', ref_cap: Math.max(1, Math.min(100, Math.round(+v('rfc')) || 5)),
    exp_days: Math.max(0, Math.round(+v('cx')) || 0),
    join_stamp: v('js') != '0', card_months: Math.max(0, Math.min(60, Math.round(+v('cm')) || 0))
  };
  const { error } = await sb.from('businesses').update(patch).eq('id', biz.id);
  btn.disabled = false;
  if (error) return toast(nice(error));
  if (logoUrl != biz.logo_url) await dropOld(biz.logo_url);
  if (stampUrl != biz.stamp_url) await dropOld(biz.stamp_url);
  toast('Saved');
  await enter();
}

async function del(id) {
  if (!confirm('Delete this customer and all their data permanently?')) return;
  try { await rpc(sb, 'delete_member', { p_member: id }); M = M.filter(u => u.id != id); sel.delete(id); render() } catch (e) { toast(nice(e)) }
}

async function regen(col) {
  if (!confirm(col == 'join_token' ? 'The old sign-up QR will stop working and you will need to print the new one. Continue?' : 'Old NFC tags and any printed stamp QR will stop adding stamps. Continue?')) return;
  const tok = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('businesses').update({ [col]: tok }).eq('id', biz.id);
  if (error) return toast(nice(error));
  biz[col] = tok; render(); toast(col == 'join_token' ? 'New sign-up code created. Print the new QR.' : 'New stamp code created. Rewrite your tags.');
}

function qrSvg() { if (typeof qrcode == 'undefined') return ''; const z = qrcode(0, 'M'); z.addData(joinUrl()); z.make(); return z.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) }
function drawQR() { const b = $('#qrb'); if (b) b.innerHTML = qrSvg() || '<p class="mut">QR library could not load.</p>' }
async function cpL(k) { try { await navigator.clipboard.writeText(k == 'j' ? joinUrl() : scanUrl()); toast('Link copied') } catch (e) { toast('Tap the link box and copy it') } }
function dl(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove() }
const slug = () => biz.name.replace(/\W+/g, '-');
function dlQR() { const x = qrSvg(); if (x) dl(slug() + '-signup-QR.svg', x, 'image/svg+xml') }
function exp() {
  const cell = x => { let s = String(x == null ? '' : x); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' };
  const rows = [['Name', 'Phone', 'Birthday', 'Current stamps', 'Card ends', 'Total visits', 'Rewards redeemed', 'Joined', 'Last visit', 'WhatsApp opted out']]
    .concat(M.map(u => [u.name, u.phone, u.bday || '', u.stamps, cardEnd(u) ? fd(cardEnd(u)) : '', u.total, u.redeemed, fd(u.joined), fd(u.last_stamp), optedOut(u) ? 'yes' : '']));
  dl(slug() + '-customers.csv', '﻿' + rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv');
}

// ---- CSV import (e.g. a paper stamp book): saved as "waiting" cards that are claimed when that phone number joins ----
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
let impRows = null;
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
    box.innerHTML = `<div class="card" style="margin-top:12px"><h2>Import ${r.good.length} customer${r.good.length == 1 ? '' : 's'}?</h2><p class="sub">${r.dup} already ${r.dup == 1 ? 'is a member' : 'are members'} (skipped), ${r.bad} without a valid 10-digit phone (skipped). Imported customers become real members, with their stamps, when they join with that phone number. They are not messaged and cannot log in until then.</p>
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
