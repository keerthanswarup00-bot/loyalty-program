// Customer app: sign up / sign in, stamp card, offers.
const sb = notReady() ? null : mkClient('lk-customer');
let biz = null, card = null, form = 'new', view = 'home', pend = null, sur = null, reward = null, anim = -1, ip = null;

const mail = p => `${p}.${CFG.slug}@${CFG.emailDomain}`;
const fmtWait = s => s < 60 ? 'under a minute' : s < 5400 ? Math.ceil(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';
const busy = (b, on) => { if (b) b.disabled = on };

async function load() {
  card = await rpc(sb, 'my_card', { p_slug: CFG.slug });
  if (card && card.granted) sur = { t: 'Happy birthday', x: biz.bday_offer };
}

// Make sure the signed-in user has a card; finish joining from signup details if a previous attempt was cut off.
async function ensureCard() {
  await load();
  if (card) return true;
  const { data } = await sb.auth.getUser();
  const m = (data && data.user && data.user.user_metadata) || {};
  if (m.name && m.phone) {
    await rpc(sb, 'join_business', { p_slug: CFG.slug, p_name: m.name, p_phone: m.phone, p_bday: m.bday || null, p_consent: true });
    await load();
  }
  return !!card;
}

async function scan() {
  const t = pend; pend = null; sur = null; reward = null;
  try { history.replaceState(null, '', location.pathname + location.search) } catch (e) { }
  try {
    const r = await rpc(sb, 'add_stamp', { p_slug: CFG.slug, p_token: t });
    if (r.ok) {
      if (r.surprise) sur = { t: 'Surprise unlocked', x: r.surprise };
      await load();
      anim = Math.min(card.member.stamps, +biz.need) - 1;
    } else if (r.error == 'cooldown') toast('You already collected a stamp recently. Next one in ' + fmtWait(r.wait));
    else toast('This code is no longer valid. Ask staff to tap again.');
  } catch (e) { toast(nice(e)) }
  render();
}

async function reg(btn) {
  const n = v('n').trim(), p = normPhone(v('p')), w = v('w'), b = v('b');
  if (n.length < 2) return toast('Enter your name');
  if (!p) return toast(PHONE_MSG);
  if (w.length < 6) return toast('Password must be at least 6 characters');
  if (!$('#cons').checked) return toast('Please tick the consent box to join');
  busy(btn, true);
  try {
    const { data, error } = await sb.auth.signUp({ email: mail(p), password: w, options: { data: { name: n, phone: p, bday: b || null, consent: true } } });
    if (error) throw error;
    if (!data.session) throw new Error('Sign-ups are paused: turn off "Confirm email" in Supabase (see README).');
    await rpc(sb, 'join_business', { p_slug: CFG.slug, p_name: n, p_phone: p, p_bday: b || null, p_consent: true });
    await load();
    if (card) {
      const w = card.offers.find(o => o.type == 'Welcome');
      if (w && !sur) sur = { t: 'Welcome gift', x: w.text };
      if (card.member.stamps > 0) anim = Math.min(card.member.stamps, +biz.need) - 1;
    }
    view = 'home'; form = 'new';
    render();
    if (pend) await scan();
  } catch (e) { toast(nice(e)); busy(btn, false) }
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

async function out() { await sb.auth.signOut(); card = null; view = 'home'; sur = reward = null; render() }

// Change password (customers have no real email, so there is no emailed reset: the owner can set a temporary one).
function pwV() {
  return head(biz) + `<div class="card"><h2>Change password</h2><p class="sub">Choose a new password for your card.</p>
  <label class="lb">New password <span>(6+ characters)</span></label>${pwField('np', 'new-password')}
  <button class="btn" onclick="savePw(this)">Save password</button><button class="btn alt" onclick="view='home';render()">Cancel</button></div>`;
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
  if (!confirm('Delete your account, card and offers permanently?')) return;
  try { await rpc(sb, 'delete_me'); await sb.auth.signOut(); card = null; sur = reward = null; form = 'new'; render(); toast('Your account was deleted') } catch (e) { toast(nice(e)) }
}

async function claim() {
  try { const r = await rpc(sb, 'claim_reward', { p_slug: CFG.slug }); reward = r.code; sur = null; await load(); render() } catch (e) { toast(nice(e)); await load(); render() }
}

function authV() {
  const nw = form == 'new';
  const isLoginTab = form == 'in' || view == 'signin' || view == 'forgot';
  return head(biz) + `<div class="card"><div class="tabs"><button class="${nw && !isLoginTab ? 'on' : ''}" onclick="form='new';view='home';render()">New member</button><button class="${isLoginTab ? 'on' : ''}" onclick="form='in';view='signin';render()">Login</button></div>
  ${view == 'forgot' ? forgotV() : (isLoginTab ? signinV() : joinV())}</div>` + socials(biz);
}

function joinV() {
  return `<h2>Join the rewards club</h2><p class="sub">${pend ? 'Sign in to collect your stamp.' : (biz.join_stamp ? 'Create your card and get your first stamp free.' : 'Create your card in under a minute.')}</p>
  <label class="lb">Full name</label><input id="n" autocomplete="name">
  <label class="lb">Phone number</label><input id="p" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="10-digit mobile number">
  <label class="lb">Password <span>(6+ characters)</span></label>${pwField('w', 'new-password')}
  <label class="lb">Birthday <span>(optional)</span></label><input id="b" type="date"><p class="hint">Your birthday offer is valid only on that day each year.</p>
  <label class="chk"><input type="checkbox" id="cons"><span>I agree to receive offers and to ${esc(biz.name)} storing my details.</span></label>
  <button class="btn" onclick="reg(this)">Join</button>`;
}

function signinV() {
  return `<h2>Welcome back</h2><p class="sub">Login to view your rewards.</p>
  <label class="lb">Phone number</label><input id="p" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="10-digit mobile number">
  <label class="lb">Password</label>${pwField('w', 'current-password')}
  <div style="text-align:right;margin-top:8px"><a href="#" onclick="view='forgot';form='in';render();return false" style="color:var(--mut);font-size:14px">Forgot password?</a></div>
  <button class="btn" onclick="login(this)" onkeydown="if(event.key==='Enter'){login(this)}">Login</button>
  <p class="note" style="margin:16px 0 0">New here? <a href="#" onclick="form='new';view='home';render();return false">Join the rewards club</a></p>`;
}

function forgotV() {
  return `<h2>Forgot your password?</h2><p class="sub">Please ask the store to reset your password.</p>
  <label class="lb">Phone number</label><input id="fp" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="10-digit mobile number">
  <button class="btn alt" onclick="form='in';view='signin';render();return false">Back to login</button>`;
}

const onDay = x => new Date(+new Date(x.valid_from) + 12 * 36e5).toLocaleDateString(undefined, { timeZone: biz.tz || 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const when = x => x.valid_from ? 'Valid only on <b>' + onDay(x) + '</b>' : x.expires_at ? (daysTo(x.expires_at) <= 3 ? '<span class="expiry">Expires in ' + daysTo(x.expires_at) + (daysTo(x.expires_at) == 1 ? ' day' : ' days') + '</span>' : 'Valid until ' + fd(x.expires_at)) : 'No expiry';

function homeV() {
  const m = card.member, need = +biz.need, s = m.stamps, ready = s >= need, of = card.offers || [];
  const live = of.filter(x => !x.used_at && !isExp(x)), past = of.filter(x => x.used_at || isExp(x));
  const soon = live.filter(x => !isEarly(x) && x.expires_at && daysTo(x.expires_at) <= 3);
  const left = m.card_ends_at && !ready ? daysTo(m.card_ends_at) : null;
  let g = ''; for (let i = 0; i < need; i++) g += i < s ? `<div class="st f ${i == anim ? 'pop' : ''}">${IC.chk}</div>` : `<div class="st">${i + 1}</div>`;
  let o = head(biz) + `<div class="card"><div class="eyebrow">Hello, ${esc(m.name.split(' ')[0])}</div><div class="count"><b>${Math.min(s, need)}</b><span>of ${need} stamps</span></div><div class="prog"><i style="width:${Math.min(100, s / need * 100)}%"></i></div><div class="grid">${g}</div>
  <p class="rule">Collect ${need} stamps to earn <b>${esc(biz.reward)}</b>.</p>`;
  if (m.card_ends_at && !ready) o += `<p class="mut sm">${left <= 14 ? '<span class="expiry">Card ends in ' + Math.max(left, 0) + (left == 1 ? ' day' : ' days') + '</span> · finish it before ' + fd(m.card_ends_at) : 'Card valid until ' + fd(m.card_ends_at)}</p>`;
  if (card.lost > 0) o += `<div class="rw"><small>Card expired</small><b>${card.lost} ${card.lost == 1 ? 'stamp was' : 'stamps were'} reset</b><span class="mut">Your last card ran out of time. A fresh card starts with your next stamp.</span></div>`;
  if (sur) o += `<div class="rw"><small>${esc(sur.t)}</small><b>${esc(sur.x)}</b><span class="mut">Saved in Your offers below.</span></div>`;
  if (reward) o += `<div class="rw"><small>Show this code to staff</small><div class="code">${esc(reward)}</div></div>`;
  if (soon.length) o += `<div class="rw"><small>Expiring soon</small><b>${soon.length == 1 ? '1 offer ends' : soon.length + ' offers end'} within 3 days</b><span class="mut">See Your offers below.</span></div>`;
  if (ready) o += `<div class="rw"><small>Reward unlocked</small><b>${esc(biz.reward)}</b></div><button class="btn" onclick="claim()">Get my reward code</button>`;
  o += `<p class="hint" style="text-align:center;margin-top:18px">Tap your phone on the stamp tag at the counter to collect a stamp.</p></div>
  <div class="card"><div class="row2"><h2>Your offers</h2><span class="pill">${live.length}</span></div>${live.length ? live.map(x =>
    `<div class="of"><div><div class="tag">${esc(x.type)}</div><b>${esc(x.text)}</b><div class="mut sm">${when(x)}</div></div>${x.code ? `<div class="cd" aria-label="Coupon code">${esc(x.code)}</div>` : ''}</div>`
  ).join('') + '<p class="hint">Show the code to staff at the counter. Staff enter it to apply the offer.</p>' : '<p class="sub" style="margin:0">Welcome, birthday and surprise offers will appear here.</p>'}</div>`
    + (past.length ? `<div class="card"><h2>History</h2>${past.map(x => `<div class="of u"><div><div class="tag">${esc(x.type)}</div><b>${esc(x.text)}</b><div class="mut sm">${x.used_at ? 'Used ' + fd(x.used_at) : 'Expired ' + fd(x.expires_at)}</div></div></div>`).join('')}</div>` : '')
    + a2hsV() + socials(biz) + `<p class="note"><a href="#" onclick="view='pw';render();return false">Change password</a> &nbsp;·&nbsp; <a href="#" onclick="out();return false">Sign out</a> &nbsp;·&nbsp; <a href="#" onclick="delMe();return false">Delete my account</a></p>`;
  return o;
}

function render() {
  $('#app').innerHTML = !card ? authV() : view == 'pw' ? pwV() : homeV();
  if (anim >= 0) setTimeout(() => anim = -1, 900);
}

(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  try {
    const m = location.hash.match(/scan=([\w-]+)/); if (m) pend = m[1];
    biz = await rpc(sb, 'get_business', { p_slug: CFG.slug });
    if (!biz) { $('#app').innerHTML = '<div class="card"><h2>Not found</h2><p class="sub">This business is not set up yet.</p></div>'; return }
    brand(biz); pwa();
    const { data: { session } } = await sb.auth.getSession();
    if (session && !(await ensureCard())) await sb.auth.signOut();
    render();
    if (card && pend) await scan();
  } catch (e) { $('#app').innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="sub">${esc(nice(e))}</p></div>` }
})();
