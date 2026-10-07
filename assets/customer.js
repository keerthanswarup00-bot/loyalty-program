// Customer app: sign up / sign in, stamp card, offers.
const sb = notReady() ? null : mkClient('lk-customer');
let biz = null, card = null, form = 'new', view = 'home', pend = null, sur = null, reward = null, anim = -1, ip = null, pop = null, rt = null, intro = true, joinTok = null, refTok = '', fx = true, wasCard = null;

const mail = p => `${p}.${CFG.slug}@${CFG.emailDomain}`;
const fmtWait = s => s < 60 ? 'under a minute' : s < 5400 ? Math.ceil(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';
const busy = (b, on) => { if (b) b.disabled = on };

// ---------- Haptic: fires now if the page has had a tap, otherwise on the first tap after the stamp lands ----------
// Chrome blocks navigator.vibrate until the page has had a user gesture. An NFC tap opens the page with none,
// so the buzz is queued and fired by the first pointerup (the event Chrome counts as a gesture on touch).
// iOS Safari has no Vibration API at all: those customers get the animation and the card "thump" only.
let buzzQ = null;
function buzz(p) {
  if (!navigator.vibrate) return;
  if (navigator.userActivation && navigator.userActivation.hasBeenActive) { try { navigator.vibrate(p || 30) } catch (e) { } buzzQ = null; return }
  buzzQ = { p: p || 30, t: Date.now() };
}
addEventListener('pointerup', () => {
  if (!buzzQ) return;
  const q = buzzQ; buzzQ = null;
  if (Date.now() - q.t < 8000) { try { navigator.vibrate(q.p) } catch (e) { } }   // a buzz 8s late would feel random
}, { capture: true, passive: true });


// ---------- Scratch-to-reveal (Surprise offers only) ----------
const scrMem = new Set();
const scrDone = id => { if (scrMem.has(id)) return true; try { return localStorage.getItem('lk-scr-' + id) == '1' } catch (e) { return false } };
const scrOn = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrLocked = x => scrOn() && x.type == 'Surprise' && !scrDone(x.id);
let prevPct = 0;


function scrV(x, more) {
  return `<div class="scr-wrap"><div class="scr"><div class="rw scr-under"><small>Surprise unlocked</small><b>${esc(x.text)}</b><span class="mut">${when(x)}</span></div><canvas class="scr-cv" data-id="${esc(x.id)}" aria-hidden="true"></canvas></div>
  <p class="hint" style="text-align:center">Scratch the card to reveal your surprise.${more > 0 ? ' ' + more + ' more waiting.' : ''} <button type="button" class="lnk" onclick="scrReveal('${esc(x.id)}')">Reveal without scratching</button></p></div>`;
}
function scrReveal(id) {
  if (scrDone(id)) return;
  const x = ((card && card.offers) || []).find(o => o.id == id); if (!x) return;
  scrMem.add(id); try { localStorage.setItem('lk-scr-' + id, '1') } catch (e) { }
  sur = { t: 'Surprise unlocked', x: x.text };   // no .scratch flag, so the normal banner shows
  render(); burst(); buzz();
  toast('Saved to your offers');
}
function initScratch() {
  document.querySelectorAll('.scr-cv').forEach(cv => {
    const id = cv.dataset.id, box = cv.parentNode, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = box.clientWidth, h = box.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.scale(dpr, dpr);
    const c = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#8a4b2a';
    const f = g.createLinearGradient(0, 0, w, h); f.addColorStop(0, c); f.addColorStop(.5, '#d9c7a3'); f.addColorStop(1, c);
    g.fillStyle = f; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '600 15px Inter,system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Scratch here', w / 2, h / 2);
    g.globalCompositeOperation = 'destination-out'; g.lineWidth = 42; g.lineCap = g.lineJoin = 'round';
    let down = false, lx = 0, ly = 0, n = 0, fin = false;
    const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] };
    const check = () => {
      if (fin) return;
      let d; try { d = g.getImageData(0, 0, cv.width, cv.height).data } catch (e) { return }
      let clear = 0, tot = 0; for (let i = 3; i < d.length; i += 64) { tot++; if (d[i] < 128) clear++ }
      if (clear / tot > .5) { fin = true; cv.classList.add('gone'); setTimeout(() => scrReveal(id), 450) }
    };
    cv.onpointerdown = e => { down = true; try { cv.setPointerCapture(e.pointerId) } catch (x) { } [lx, ly] = pt(e); g.beginPath(); g.arc(lx, ly, 21, 0, 7); g.fill(); e.preventDefault() };
    cv.onpointermove = e => { if (!down || fin) return; const [x, y] = pt(e); g.beginPath(); g.moveTo(lx, ly); g.lineTo(x, y); g.stroke(); lx = x; ly = y; if (++n % 6 == 0) check() };
    cv.onpointerup = cv.onpointercancel = () => { down = false; check() };
  });
}


// ---------- Pages, top card, bottom nav ----------
let pg = 'home', nfcRd = null;
const NI = {
  home: ico('<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  gift: ico('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2 0-4-1-4-3s3-2.5 4 3c1-5.5 4-5 4-3s-2 3-4 3"/>'),
  star: ico('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  user: ico('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>'),
  tap: ico('<path d="M7 9a6 6 0 0 1 0 6M11 6.5a10 10 0 0 1 0 11M15 4a14 14 0 0 1 0 16"/>')
};
function goTo(p) { pg = p; view = 'home'; fx = true; render(); window.scrollTo(0, 0) }


function ctx() {
  const m = card.member, need = +biz.need, s = m.stamps, ready = s >= need, of = card.offers || [];
  const liveAll = of.filter(x => !x.used_at && !isExp(x)), past = of.filter(x => x.used_at || isExp(x));
  const locked = liveAll.filter(scrLocked), live = liveAll.filter(x => !scrLocked(x));
  return { m, need, s, ready, past, locked, live };
}


function heroV() {
  const { need, s } = ctx();
  const pct = Math.min(100, s / need * 100), from = anim >= 0 ? prevPct : pct;
  const slim = pg != 'home' || view == 'pw';
  return `<header class="c-hero${slim ? ' slim' : ''}"><div class="c-brand"><div class="c-logo">${mark(biz)}</div><div class="c-bt"><b>${esc(biz.name)}</b><span>${esc(biz.tagline)}</span></div></div>
  <div class="c-count">${Math.min(s, need)} of ${need} Stamps${s < need ? '<small>' + (need - s) + ' to go</small>' : ''}</div>
  <div class="prog"><i style="width:${from}%" data-to="${pct}"></i></div></header>`;
}


function navV() {
  const { live, locked } = ctx(), n = live.length + locked.length, cur = view == 'pw' ? 'profile' : pg;
  const t = (id, lab, ic, badge) => `<button type="button" class="t${cur == id ? ' on' : ''}" onclick="goTo('${id}')">${ic}<span>${lab}</span>${badge ? `<i class="bd">${badge}</i>` : ''}</button>`;
  return `<nav class="c-nav"><div>${t('home', 'Home', NI.home)}${t('offers', 'Offers', NI.gift, n)}
  <button type="button" class="go" aria-label="Collect a stamp" onclick="tapStamp()">${NI.tap}</button>
  ${t('rewards', 'Rewards', NI.star)}${t('profile', 'Profile', NI.user)}</div></nav>`;
}


// Centre button. Android Chrome can read the NFC tag inside the page (needs this button press as the gesture).
// iPhone has no Web NFC, so it can only tell the customer to tap the tag.
async function tapStamp() {
  if (!('NDEFReader' in window)) return toast('Hold the top of your phone on the stamp tag at the counter. Your stamp is added when the page opens.');
  if (nfcRd) return toast('Ready. Hold your phone near the stamp tag.');
  try {
    nfcRd = new NDEFReader(); await nfcRd.scan();
    toast('Hold your phone near the stamp tag');
    nfcRd.onreading = e => {
      for (const rec of e.message.records) {
        let t = ''; try { t = new TextDecoder().decode(rec.data) } catch (x) { }
        const m = t.match(/scan=([\w-]+)/);
        if (m) { pend = m[1]; scan(); return }
      }
      toast('That is not a stamp tag');
    };
  } catch (e) { nfcRd = null; toast('NFC is off or blocked. Turn it on in phone settings, or just tap the tag.') }
}


const offerRow = x => `<div class="of"><div><div class="tag">${esc(x.type)}</div><b>${esc(x.text)}</b><div class="mut sm">${when(x)}</div></div>${x.code ? `<button type="button" class="cd" aria-label="Coupon code ${esc(x.code)}, tap to copy" onclick="copyText('${esc(x.code)}','Code copied')">${esc(x.code)}</button>` : ''}</div>`;
const pastRow = x => `<div class="of u"><div><div class="tag">${esc(x.type)}</div><b>${esc(x.text)}</b><div class="mut sm">${x.used_at ? 'Used ' + fd(x.used_at) : 'Expired ' + fd(x.expires_at)}</div></div></div>`;


function homePgV() {
  const { m, need, s, ready, live, locked } = ctx();
  const soon = live.filter(x => !isEarly(x) && x.expires_at && daysTo(x.expires_at) <= 3);
  const left = m.card_ends_at && !ready ? daysTo(m.card_ends_at) : null;
  const wait = m.last_stamp && biz.cooldown_min > 0 ? Math.ceil((new Date(m.last_stamp).getTime() + biz.cooldown_min * 6e4 - Date.now()) / 1000) : 0;
  const img = biz.stamp_url && (biz.stamp_url.startsWith('http') || biz.stamp_url.startsWith('data:'));
  let g = ''; for (let i = 0; i < need; i++) g += i < s ? `<div class="st f ${i == anim ? 'pop' : ''} ${intro ? 'in' : ''}" style="--i:${i}">${img ? `<img src="${esc(biz.stamp_url)}" alt="stamp" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : IC.chk}</div>` : `<div class="st">${i + 1}</div>`;
  let o = newsV() + `<div class="card${anim >= 0 ? ' thump' : ''}"><div class="eyebrow">Hello, ${esc(m.name.split(' ')[0])}</div><div class="grid">${g}</div>
  <p class="rule">Collect ${need} stamps to earn <b>${esc(biz.reward)}</b>.</p>`;
  if (m.card_ends_at && !ready) o += `<p class="mut sm">${left <= 14 ? '<span class="expiry">Card ends in ' + Math.max(left, 0) + (left == 1 ? ' day' : ' days') + '</span> · finish it before ' + fd(m.card_ends_at) : 'Card valid until ' + fd(m.card_ends_at)}</p>`;
  if (card.lost > 0) o += `<div class="rw"><small>Card expired</small><b>${card.lost} ${card.lost == 1 ? 'stamp was' : 'stamps were'} reset</b><span class="mut">Your last card ran out of time. A fresh card starts with your next stamp.</span></div>`;
  if (sur && !sur.scratch) o += `<div class="rw"><small>${esc(sur.t)}</small><b>${esc(sur.x)}</b><button type="button" class="lnk" onclick="goTo('offers')">View in Offers</button></div>`;
  if (locked.length) o += scrV(locked[0], locked.length - 1);
  if (reward) o += `<div class="rw"><small>Show this code to staff</small><div class="code" role="button" tabindex="0" onclick="copyText('${esc(reward)}','Code copied')">${esc(reward)}</div><span class="mut">Tap the code to copy it.</span></div>`;
  if (soon.length) o += `<div class="rw"><small>Expiring soon</small><b>${soon.length == 1 ? '1 offer ends' : soon.length + ' offers end'} within 3 days</b><button type="button" class="lnk" onclick="goTo('offers')">See offers</button></div>`;
  if (ready) o += `<div class="rw"><small>Reward unlocked</small><b>${esc(biz.reward)}</b></div><button class="btn" onclick="claim()">Get my reward code</button>`;
  o += `<p class="hint" style="text-align:center;margin-top:18px">Tap your phone on the stamp tag at the counter to collect a stamp.${wait > 0 ? ' <b>Next stamp in ' + fmtWait(wait) + '.</b>' : ''}</p></div>`;
  return o + a2hsV() + socials(biz);
}


function offersPgV() {
  const { live, locked, past } = ctx();
  let o = '';
  if (locked.length) o += `<div class="card"><h2>Scratch to reveal</h2>${scrV(locked[0], locked.length - 1)}</div>`;
  o += `<div class="card"><div class="row2"><h2>Your offers</h2><span class="pill">${live.length}</span></div>${live.length ? live.map(offerRow).join('') + '<p class="hint">Show the code to staff at the counter (tap a code to copy it).</p>' : '<p class="sub" style="margin:0">Welcome, birthday and surprise offers will appear here.</p>'}</div>`;
  if (past.length) o += `<div class="card"><h2>History</h2>${past.map(pastRow).join('')}</div>`;
  return o;
}


function rewardsPgV() {
  const { m, need, s, ready } = ctx();
  let o = `<div class="card"><div class="row2"><h2>${esc(biz.reward)}</h2><span class="st-chip${ready ? ' ok' : ''}">${ready ? 'Achieved' : (need - s) + ' to go'}</span></div>
  <p class="sub">Collect ${need} stamps to earn this reward.${m.redeemed ? ' You have earned it ' + m.redeemed + (m.redeemed == 1 ? ' time.' : ' times.') : ''}</p>`;
  if (reward) o += `<div class="rw"><small>Show this code to staff</small><div class="code" role="button" tabindex="0" onclick="copyText('${esc(reward)}','Code copied')">${esc(reward)}</div><span class="mut">Tap the code to copy it. It is also saved in Offers.</span></div>`;
  if (ready) o += `<button class="btn" onclick="claim()">Get my reward code</button>`;
  return o + '</div>' + (refV() || '<div class="card"><p class="sub" style="margin:0">More ways to earn rewards are coming soon.</p></div>');
}


function profilePgV() {
  const { m, live, locked } = ctx();
  return `<div class="card"><div class="eyebrow">Member</div><h2>${esc(m.name)}</h2><p class="sub">${esc(m.phone)}</p>
  <div class="pf"><div><b>${m.total}</b>Visits</div><div><b>${m.redeemed}</b>Rewards</div><div><b>${live.length + locked.length}</b>Offers</div></div>
  <button class="btn alt" onclick="reload()">Refresh my card</button>
  <button class="btn alt" onclick="waPref()">${m.wa_optout ? 'Turn WhatsApp offers on' : 'Stop WhatsApp offers'}</button>
  <button class="btn alt" onclick="view='pw';render()">Change password</button>
  <button class="btn alt" onclick="out()">Sign out</button>
  <p class="note"><a href="#" onclick="delMe();return false" style="color:#b91c1c">Delete my account</a></p></div>`;
}

async function load() {
  card = await rpc(sb, 'my_card', { p_slug: CFG.slug });
  if (card && card.granted) sur = { t: 'Happy birthday', x: biz.bday_offer };
}

// Re-fetch the card and pop up a message if any coupon became "used" since last time.
async function sync() {
  if (!card) return;
  const before = new Set((card.offers || []).filter(o => o.used_at).map(o => o.id));
  try { await load() } catch (e) { return }
  const n = (card.offers || []).find(o => o.used_at && !before.has(o.id));
  if (n) pop = { t: n.type, x: n.text };
  render();
}
function live() {
  if (rt || !card) return;
  rt = sb.channel('my-offers')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'offers' }, () => sync())
    .subscribe();
}
function unlive() { if (rt) { sb.removeChannel(rt); rt = null } }
// Phones pause websockets in the background, so also re-sync when the page becomes visible again.
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync() });
const popV = () => `<div class="ov" onclick="pop=null;render()"><div class="mdl" onclick="event.stopPropagation()">
  <div class="tag">${esc(pop.t)} redeemed</div><h2>${esc(pop.x)}</h2><p class="sub">Enjoy! This coupon has been used.</p>
  <button class="btn" onclick="pop=null;render()">Done</button></div></div>`;

// Make sure the signed-in user has a card; finish joining from signup details if a previous attempt was cut off.
async function ensureCard() {
  await load();
  if (card) return true;
  const { data } = await sb.auth.getUser();
  const m = (data && data.user && data.user.user_metadata) || {};
  if (m.name && m.phone) {
    const j = ref => rpc(sb, 'join_business', { p_slug: CFG.slug, p_name: m.name, p_phone: m.phone, p_bday: m.bday || null, p_consent: true, p_join_token: m.jt || null, p_ref: ref });
    try { await j(m.rf || null) } catch (e) { if (m.rf) await j(null); else throw e }
    await load();
  }
  return !!card;
}

async function scan() {
  const t = pend; pend = null; sur = null; reward = null;
  let got = false;
  try { history.replaceState(null, '', location.pathname + location.search) } catch (e) { }
  try {
    const r = await rpc(sb, 'add_stamp', { p_slug: CFG.slug, p_token: t });
    if (r.ok) {
      if (r.surprise) sur = { t: 'Surprise unlocked', x: r.surprise, scratch: scrOn() };
      await load();
      anim = Math.min(card.member.stamps, +biz.need) - 1;
      got = true;
    } else if (r.error == 'cooldown') toast('You already collected a stamp recently. Next one in ' + fmtWait(r.wait));
    else toast('This code is no longer valid. Ask staff to tap again.');
  } catch (e) { toast(nice(e)) }
  render();
  if (got) {
    const full = card.member.stamps >= +biz.need;
    buzz(full ? [40, 60, 40, 60, 90] : 30);       // longer pattern when the card completes
    if (full) burst();                             // no confetti for a surprise: the scratch reveal fires its own
  }
}

async function reg(btn) {
  const n = v('n').trim(), p = normPhone(v('p')), w = v('w'), b = v('b');
  if (n.length < 2) return toast('Enter your name');
  if (!p) return toast(PHONE_MSG);
  if (w.length < 6) return toast('Password must be at least 6 characters');
  if (!$('#cons').checked) return toast('Please tick the consent box to join');
  busy(btn, true);
  try {
    const { data, error } = await sb.auth.signUp({ email: mail(p), password: w, options: { data: { name: n, phone: p, bday: b || null, consent: true, jt: joinTok, rf: v('rf').trim() || null } } });
    if (error) throw error;
    if (!data.session) throw new Error('Sign-ups are paused: turn off "Confirm email" in Supabase (see README).');
    await rpc(sb, 'join_business', { p_slug: CFG.slug, p_name: n, p_phone: p, p_bday: b || null, p_consent: true, p_join_token: joinTok, p_ref: v('rf').trim() || null });
    await load();
    if (card) {
      const w = card.offers.find(o => o.type == 'Welcome');
      if (w && !sur) sur = { t: 'Welcome gift', x: w.text };
      if (card.member.stamps > 0) anim = Math.min(card.member.stamps, +biz.need) - 1;
    }
    view = 'home'; form = 'new';
    render(); burst(); buzz();
    if (pend) await scan();
  } catch (e) {
    const msg = String((e && e.message) || e);
    // signUp may have worked while join failed on a rule: remove the half-made login so they can retry
    if (/friend code|sign-up QR|Consent|full name|10-digit/i.test(msg)) {
      try { await rpc(sb, 'delete_me') } catch (x) { }
      try { await sb.auth.signOut() } catch (x) { }
    }
    toast(nice(e)); busy(btn, false)
  }
}

async function login(btn) {
  const p = normPhone(v('p')), w = v('w');
  if (!p) return toast(PHONE_MSG);
  if (!w) return toast('Enter your password');
  busy(btn, true);
  try {
    const { error } = await sb.auth.signInWithPassword({ email: mail(p), password: w });
    if (error) throw error;
    if (!(await ensureCard())) { await sb.auth.signOut(); throw new Error('No card found for this number. Please join first.') }
    view = 'home'; form = 'in';
    render();
    if (pend) await scan();
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (/invalid login/i.test(m) || /invalid.*credentials/i.test(m) || /wrong.*password|wrong.*phone/i.test(m)) {
      toast('Incorrect phone number or password.');
    } else if (/no card found/i.test(m)) {
      toast('No account found with this number. Please join the rewards club first.');
    } else {
      toast('Something went wrong. Please try again.');
    }
    busy(btn, false);
  }
}

async function out() { unlive(); await sb.auth.signOut(); card = null; view = 'home'; pg = 'home'; sur = reward = null; render() }

// Change password (customers have no real email, so there is no emailed reset: the owner can set a temporary one).
function pwV() {
  return `<div class="card"><h2>Change password</h2><p class="sub">Choose a new password for your card.</p>
  <label class="lb">New password <span>(6+ characters)</span></label>${pwField('np', 'new-password')}
  <button class="btn" data-go onclick="savePw(this)">Save password</button><button class="btn alt" onclick="view='home';render()">Cancel</button></div>`;
}
async function savePw(btn) {
  const p = v('np');
  if (p.length < 6) return toast('Password must be at least 6 characters');
  busy(btn, true);
  try {
    const { error } = await sb.auth.updateUser({ password: p });
    if (error) throw error;
    view = 'home'; render(); toast('Password updated');
  } catch (e) { toast(nice(e)); busy(btn, false) }
}

// Add to home screen: Android/Chrome shows a button, iPhone shows the Share steps. Hidden once installed or dismissed.
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ip = e; if (card && view == 'home') render() });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform == 'MacIntel' && navigator.maxTouchPoints > 1);
const a2hsOff = () => { try { return localStorage.getItem('lk-a2hs') == '1' } catch (e) { return false } };
function a2hsV() {
  if (standalone() || a2hsOff() || !(ip || isIos())) return '';
  return `<div class="card"><h2>Keep your card on your phone</h2><p class="sub">${ip ? 'Add this card to your home screen to open it in one tap.' : 'Tap the Share button in your browser, then choose <b>Add to Home Screen</b>.'}</p>
  <div class="row" style="margin-top:12px">${ip ? '<button class="btn sm" onclick="install()">Add to home screen</button>' : ''}<button class="btn sm alt" onclick="hideA2hs()">Not now</button></div></div>`;
}
async function install() { try { ip.prompt(); await ip.userChoice } catch (e) { } ip = null; render() }
function hideA2hs() { try { localStorage.setItem('lk-a2hs', '1') } catch (e) { } render() }

// Home-screen icon and name for this business, generated from its colour and first letter.
function icon(size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.fillStyle = biz.color || '#8a4b2a'; x.fillRect(0, 0, size, size);
  x.fillStyle = '#fff'; x.font = `600 ${Math.round(size * .5)}px Georgia,serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText((biz.name || '?').trim().slice(0, 1).toUpperCase(), size / 2, size / 2 + size * .03);
  return c.toDataURL('image/png');
}
function pwa() {
  try {
    const add = (tag, attrs) => { const e = document.createElement(tag); Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k])); document.head.appendChild(e) };
    const man = { name: biz.name + ' Rewards', short_name: biz.name.slice(0, 12), start_url: location.origin + '/', scope: location.origin + '/', display: 'standalone', background_color: '#f6f2ec', theme_color: biz.color || '#8a4b2a',
      icons: [{ src: icon(192), sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: icon(512), sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] };
    add('link', { rel: 'manifest', href: URL.createObjectURL(new Blob([JSON.stringify(man)], { type: 'application/manifest+json' })) });
    add('link', { rel: 'apple-touch-icon', href: icon(180) });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: biz.name.slice(0, 12) });
    const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.setAttribute('content', biz.color || '#8a4b2a');
  } catch (e) { }
}

async function delMe() {
  unlive();
  if (!confirm('Delete your account, card and offers permanently?')) return;
  try { await rpc(sb, 'delete_me'); await sb.auth.signOut(); card = null; sur = reward = null; form = 'new'; view = 'home'; pg = 'home'; render(); toast('Your account was deleted') } catch (e) { toast(nice(e)) }
}

async function claim() {
  try { const r = await rpc(sb, 'claim_reward', { p_slug: CFG.slug }); reward = r.code; sur = null; await load(); render(); burst(); buzz() } catch (e) { toast(nice(e)); await load(); render() }
}

function authV() {
  const nw = form == 'new';
  const isLoginTab = form == 'in' || view == 'signin' || view == 'forgot';
  return head(biz) + `<div class="card"><div class="tabs"><button class="${nw && !isLoginTab ? 'on' : ''}" onclick="form='new';view='home';render()">New member</button><button class="${isLoginTab ? 'on' : ''}" onclick="form='in';view='signin';render()">Login</button></div>
  ${view == 'forgot' ? forgotV() : (isLoginTab ? signinV() : joinV())}</div>` + socials(biz);
}

function joinV() {
  if (!joinTok) return `<h2>Join the rewards club</h2><p class="sub">To join, scan the sign-up QR code at the counter with your phone camera. Already a member? Use the Login tab.</p>`;
  return `<h2>Join the rewards club</h2><p class="sub">${pend ? 'Sign in to collect your stamp.' : (biz.join_stamp ? 'Create your card and get your first stamp free.' : 'Create your card in under a minute.')}</p>
  <label class="lb">Full name</label><input id="n" autocomplete="name">
  <label class="lb">Phone number</label><input id="p" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="10-digit mobile number">
  <label class="lb">Password <span>(6+ characters)</span></label>${pwField('w', 'new-password')}
  <label class="lb">Birthday <span>(optional)</span></label><input id="b" type="date"><p class="hint">Your birthday offer is valid only on that day each year.</p>
  ${biz.ref_on ? `<label class="lb">Friend's code <span>(optional, for ${esc(biz.ref_offer)})</span></label><input id="rf" autocapitalize="characters" placeholder="e.g. ASHA-4K7">` : ''}
  <label class="chk"><input type="checkbox" id="cons"><span>I agree to receive offers and to ${esc(biz.name)} storing my details.</span></label>
  <button class="btn" data-go onclick="reg(this)">Join</button>`;
}

function signinV() {
  return `<h2>Welcome back</h2><p class="sub">Login to view your rewards.</p>
  <label class="lb">Phone number</label><input id="p" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="10-digit mobile number">
  <label class="lb">Password</label>${pwField('w', 'current-password')}
  <div style="text-align:right;margin-top:8px"><a href="#" onclick="view='forgot';form='in';render();return false" style="color:var(--mut);font-size:14px">Forgot password?</a></div>
  <button class="btn" data-go onclick="login(this)">Login</button>
  <p class="note" style="margin:16px 0 0">New here? <a href="#" onclick="form='new';view='home';render();return false">Join the rewards club</a></p>`;
}

function forgotV() {
  const w = /^https?:\/\//.test(biz.wa || '') ? `<a class="btn" href="${esc(biz.wa)}" target="_blank" rel="noopener">Message the store on WhatsApp</a>` : '';
  return `<h2>Forgot your password?</h2><p class="sub">Ask the store to reset it. Staff give you a temporary password. Sign in with it, then change it under Profile.</p>${w}<button class="btn alt" onclick="form='in';view='signin';render()">Back to login</button>`;
}

const onDay = x => new Date(+new Date(x.valid_from) + 12 * 36e5).toLocaleDateString(undefined, { timeZone: biz.tz || 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const when = x => x.valid_from ? 'Valid only on <b>' + onDay(x) + '</b>' : x.expires_at ? (daysTo(x.expires_at) <= 3 ? '<span class="expiry">Expires in ' + daysTo(x.expires_at) + (daysTo(x.expires_at) == 1 ? ' day' : ' days') + '</span>' : 'Valid until ' + fd(x.expires_at)) : 'No expiry';

const newsKey = () => 'lk-news-' + (biz.news_at || '');
function newsSeen() { try { return localStorage.getItem(newsKey()) == '1' } catch (e) { return false } }
function newsV() {
  if (!biz.news_text || newsSeen()) return '';
  return `<div class="card news"><div class="row2"><span class="tag">What's new</span><button class="lnk" onclick="hideNews()" aria-label="Close">Got it</button></div><p style="margin:6px 0 0">${esc(biz.news_text)}</p></div>`;
}
function hideNews() { try { localStorage.setItem(newsKey(), '1') } catch (e) { biz.news_text = '' } render() }

function refV() {
  const m = card.member; if (!biz.ref_on || !m.ref_code) return '';
  const msg = `Join the ${biz.name} rewards club! Scan the sign-up QR at the counter and enter my friend code ${m.ref_code} to get ${biz.ref_offer}.`;
  return `<div class="card"><h2>Refer a friend</h2><p class="sub">Your friend gets <b>${esc(biz.ref_offer)}</b> when they join with your code, and you get it too after their next visit.${m.ref_count ? ' <b>' + m.ref_count + (m.ref_count == 1 ? ' friend has' : ' friends have') + ' joined.</b>' : ''}</p>
  <div class="code" role="button" tabindex="0" onclick="copyText('${esc(m.ref_code)}','Code copied')">${esc(m.ref_code)}</div>
  <a class="btn" style="margin-top:12px" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Share on WhatsApp</a></div>`;
}

function render() {
  let y = 0;
  try {
    const app = $('#app');
    y = window.scrollY;
    if (wasCard !== !!card) { fx = true; wasCard = !!card }
    app.className = (card ? 'has-nav' : '') + (fx ? ' fx' : ''); fx = false;
    app.innerHTML = (!card ? authV() : heroV() + (view == 'pw' ? pwV() : pg == 'offers' ? offersPgV() : pg == 'rewards' ? rewardsPgV() : pg == 'profile' ? profilePgV() : homePgV())) + (card ? navV() : '') + (pop ? popV() : '');
  } catch (e) {
    $('#app').innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="sub">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Reload</button></div>`;
  }
  if (card) live(); else unlive();
  if (card) intro = false;
  if (card) {
    initScratch();
    const p = $('.prog i');
    if (p) { const to = +p.dataset.to; requestAnimationFrame(() => requestAnimationFrame(() => { p.style.width = to + '%' })); prevPct = to }
  }
  if (anim >= 0) setTimeout(() => anim = -1, 900);
  if (y) window.scrollTo(0, y);
}

async function waPref() {
  const on = !card.member.wa_optout;
  try { await rpc(sb, 'set_my_wa_optout', { p_slug: CFG.slug, p_optout: on }); card.member.wa_optout = on; render(); toast(on ? 'Done. You will not get WhatsApp offers.' : 'WhatsApp offers are back on') }
  catch (e) { toast(nice(e)) }
}
async function reload() { try { await load(); render(); toast('Up to date') } catch (e) { toast(nice(e)) } }
addEventListener('hashchange', () => {
  const s = location.hash.match(/scan=([\w-]+)/), j = location.hash.match(/join=([\w-]+)/);
  if (j) { joinTok = j[1]; try { sessionStorage.setItem('lk-join', j[1]) } catch (e) { } render() }
  if (s) { pend = s[1]; if (card) scan(); else render() }
});
// Coming back to the page (e.g. after staff taps the tag, or a day later) shows fresh stamps and offers.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !card || view != 'home' || pend) return;
  try {
    const before = JSON.stringify(card);
    await load();
    if (JSON.stringify(card) !== before && !document.querySelector('.scr-cv:not(.gone)')) render();
  } catch (e) { }
});

(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  try {
    const m = location.hash.match(/scan=([\w-]+)/); if (m) pend = m[1];
    const jm = location.hash.match(/join=([\w-]+)/);
    try { if (jm) sessionStorage.setItem('lk-join', jm[1]); joinTok = jm ? jm[1] : sessionStorage.getItem('lk-join') } catch (e) { joinTok = jm ? jm[1] : null }
    biz = await rpc(sb, 'get_business', { p_slug: CFG.slug });
    if (!biz) { $('#app').innerHTML = '<div class="card"><h2>Not found</h2><p class="sub">This business is not set up yet.</p></div>'; return }
    brand(biz); pwa();
    const { data: { session } } = await sb.auth.getSession();
    if (session && !(await ensureCard())) await sb.auth.signOut();
    render();
    if (card && pend) await scan();
  } catch (e) { $('#app').innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="sub">${esc(nice(e))}</p></div>` }
})();
