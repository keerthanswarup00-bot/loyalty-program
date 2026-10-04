// Customer app: sign up / sign in, stamp card, offers.
const sb = notReady() ? null : mkClient('lk-customer');
let biz = null, card = null, form = 'new', pend = null, sur = null, reward = null, anim = -1;

const mail = p => `${p}.${CFG.slug}@${CFG.emailDomain}`;
const digits = id => v(id).replace(/\D/g, '');
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
  const n = v('n').trim(), p = digits('p'), w = v('w'), b = v('b');
  if (n.length < 2 || p.length < 7 || w.length < 6) return toast('Enter your name, a valid phone number and a password of 6+ characters');
  if (!$('#cons').checked) return toast('Please tick the consent box to join');
  busy(btn, true);
  try {
    const { data, error } = await sb.auth.signUp({ email: mail(p), password: w, options: { data: { name: n, phone: p, bday: b || null, consent: true } } });
    if (error) throw error;
    if (!data.session) throw new Error('Sign-ups are paused: turn off "Confirm email" in Supabase (see README).');
    await rpc(sb, 'join_business', { p_slug: CFG.slug, p_name: n, p_phone: p, p_bday: b || null, p_consent: true });
    await load();
    if (card && card.offers.length && !sur) { const o = card.offers[0]; sur = { t: 'Welcome gift', x: o.text } }
    render();
    if (pend) await scan();
  } catch (e) { toast(nice(e)); busy(btn, false) }
}

async function login(btn) {
  const p = digits('p'), w = v('w');
  if (p.length < 7 || !w) return toast('Enter your phone number and password');
  busy(btn, true);
  try {
    const { error } = await sb.auth.signInWithPassword({ email: mail(p), password: w });
    if (error) throw error;
    if (!(await ensureCard())) { await sb.auth.signOut(); throw new Error('No card found for this number. Please join first.') }
    render();
    if (pend) await scan();
  } catch (e) { toast(e.message && /invalid login/i.test(e.message) ? 'Wrong phone or password' : nice(e)); busy(btn, false) }
}

async function out() { await sb.auth.signOut(); card = null; sur = reward = null; render() }

async function delMe() {
  if (!confirm('Delete your account, card and offers permanently?')) return;
  try { await rpc(sb, 'delete_me'); await sb.auth.signOut(); card = null; sur = reward = null; form = 'new'; render(); toast('Your account was deleted') } catch (e) { toast(nice(e)) }
}

async function redeem() {
  try { const r = await rpc(sb, 'redeem_reward', { p_slug: CFG.slug }); reward = r.code; sur = null; await load(); render() } catch (e) { toast(nice(e)) }
}

async function useOffer(id) {
  if (!confirm('Redeem now? Only confirm at the counter, in front of staff.')) return;
  try { const r = await rpc(sb, 'use_offer', { p_offer: id }); reward = r.code; sur = null; await load(); render() } catch (e) { toast(nice(e)); await load(); render() }
}

function authV() {
  const nw = form == 'new';
  return head(biz) + `<div class="card"><div class="tabs"><button class="${nw ? 'on' : ''}" onclick="form='new';render()">New member</button><button class="${nw ? '' : 'on'}" onclick="form='in';render()">Sign in</button></div>
  <h2>${nw ? 'Join the rewards club' : 'Welcome back'}</h2><p class="sub">${pend ? 'Sign in to collect your stamp.' : nw ? 'Create your card in under a minute.' : 'Enter your details to open your card.'}</p>
  ${nw ? '<label class="lb">Full name</label><input id="n" autocomplete="name">' : ''}
  <label class="lb">Phone number</label><input id="p" type="tel" autocomplete="tel">
  <label class="lb">Password${nw ? ' <span>(6+ characters)</span>' : ''}</label>${pwField('w', nw ? 'new-password' : 'current-password')}
  ${nw ? `<label class="lb">Birthday <span>(optional)</span></label><input id="b" type="date"><p class="hint">Choose your birthday to receive a special offer every year.</p>
  <label class="chk"><input type="checkbox" id="cons"><span>I agree to receive offers and to ${esc(biz.name)} storing my details.</span></label>` : ''}
  <button class="btn" onclick="${nw ? 'reg' : 'login'}(this)">${nw ? 'Join' : 'Sign in'}</button></div>` + socials(biz);
}

function homeV() {
  const m = card.member, need = +biz.need, s = m.stamps, ready = s >= need, of = card.offers || [];
  const av = of.filter(x => !x.used_at && !isExp(x));
  let g = ''; for (let i = 0; i < need; i++) g += i < s ? `<div class="st f ${i == anim ? 'pop' : ''}">${IC.chk}</div>` : `<div class="st">${i + 1}</div>`;
  let o = head(biz) + `<div class="card"><div class="eyebrow">Hello, ${esc(m.name.split(' ')[0])}</div><div class="count"><b>${Math.min(s, need)}</b><span>of ${need} stamps</span></div><div class="prog"><i style="width:${Math.min(100, s / need * 100)}%"></i></div><div class="grid">${g}</div>
  <p class="rule">Collect ${need} stamps to earn <b>${esc(biz.reward)}</b>.</p>`;
  if (sur) o += `<div class="rw"><small>${esc(sur.t)}</small><b>${esc(sur.x)}</b><span class="mut">Saved in Your offers below.</span></div>`;
  if (reward) o += `<div class="rw"><small>Show this code to staff</small><div class="code">${esc(reward)}</div></div>`;
  if (ready) o += `<div class="rw"><small>Reward unlocked</small><b>${esc(biz.reward)}</b></div><button class="btn" onclick="redeem()">Redeem reward</button>`;
  o += `<p class="hint" style="text-align:center;margin-top:18px">Tap your phone on the stamp tag at the counter to collect a stamp.</p></div>
  <div class="card"><div class="row2"><h2>Your offers</h2><span class="pill">${av.length}</span></div>${of.length ? of.map(x => {
    const dead = x.used_at || isExp(x);
    return `<div class="of ${dead ? 'u' : ''}"><div><div class="tag">${esc(x.type)}</div><b>${esc(x.text)}</b><div class="mut sm">${x.used_at ? 'Used ' + fd(x.used_at) : x.expires_at ? (isExp(x) ? 'Expired ' + fd(x.expires_at) : 'Valid until ' + fd(x.expires_at)) : 'No expiry'}</div></div>${dead ? '' : `<button class="btn sm" onclick="useOffer('${x.id}')">Use</button>`}</div>`
  }).join('') : '<p class="sub" style="margin:0">Welcome, birthday and surprise offers will appear here.</p>'}</div>`
    + socials(biz) + `<p class="note"><a href="#" onclick="out();return false">Sign out</a> &nbsp;·&nbsp; <a href="#" onclick="delMe();return false">Delete my account</a></p>`;
  return o;
}

function render() {
  $('#app').innerHTML = card ? homeV() : authV();
  if (anim >= 0) setTimeout(() => anim = -1, 900);
}

(async () => {
  if (notReady()) { $('#app').innerHTML = setupMsg; return }
  try {
    const m = location.hash.match(/scan=([\w-]+)/); if (m) pend = m[1];
    biz = await rpc(sb, 'get_business', { p_slug: CFG.slug });
    if (!biz) { $('#app').innerHTML = '<div class="card"><h2>Not found</h2><p class="sub">This business is not set up yet.</p></div>'; return }
    brand(biz);
    const { data: { session } } = await sb.auth.getSession();
    if (session && !(await ensureCard())) await sb.auth.signOut();
    render();
    if (card && pend) await scan();
  } catch (e) { $('#app').innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="sub">${esc(nice(e))}</p></div>` }
})();
