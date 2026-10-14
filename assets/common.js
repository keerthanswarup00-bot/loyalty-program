// Shared helpers for the customer app and the owner app.
const CFG = window.LK;
// Resolve path-based shop routes synchronously before either app creates its Supabase client.
const _shopPath = location.pathname.match(/^\/app\/([a-z0-9-]+)(?:\/admin)?\/?$/i);
if (_shopPath) CFG.slug = _shopPath[1].toLowerCase();
const $ = s => document.querySelector(s);
const v = i => ($('#' + i) || {}).value || '';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ico = (p, fill) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  ig: ico('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>'),
  fb: ico('<path d="M13.5 21v-7.5H16l.5-3h-3V8.8c0-.9.3-1.5 1.6-1.5h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.3 0-3.9 1.4-3.9 4v2H7.5v3H10V21z"/>', 1),
  wa: ico('<path d="M20 11.8a8 8 0 0 1-11.9 7L4 20l1.2-4A8 8 0 1 1 20 11.8z"/><path d="M9.2 8.6c-.3.6-.2 1.6.7 2.9s2 2.1 3.2 2.5c.7.2 1.5-.1 1.8-.8l-1.6-.9-.7.6c-.9-.4-1.6-1.1-2-2l.6-.7z"/>'),
  web: ico('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/>'),
  chk: ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  eye: ico('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  off: ico('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.7A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/>')
};

// Separate storage keys so an owner and a customer can be signed in on the same browser.
// persistSession/autoRefreshToken are stated explicitly so the login survives reloads; detectSessionInUrl stays at its default (admin password recovery needs the hash).
const mkClient = key => window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { storageKey: key, persistSession: true, autoRefreshToken: true } });
async function rpc(c, fn, args) { const { data, error } = await c.rpc(fn, args); if (error) throw error; return data }

const toast = m => { $('#t').innerHTML = '<div class="toast">' + esc(m) + '</div>'; setTimeout(() => $('#t').innerHTML = '', 3200) };
const fd = t => t ? new Date(t).toLocaleDateString() : '—';
const fbd = b => b ? new Date(b + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const isExp = x => !!x.expires_at && new Date(x.expires_at) < Date.now();
const daysTo = iso => Math.ceil((new Date(iso) - Date.now()) / 864e5);
// Phone numbers: accept "+91 98765 43210", "098765-43210", "919876543210" etc. and reduce to exactly 10 digits (or null).
const PHONE_MSG = 'Enter a valid 10-digit mobile number (without +91 or spaces)';
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length == 12 && d.slice(0, 2) == '91') d = d.slice(2);
  if (!/^\d{10}$/.test(d)) return null;
  if ((CFG.countryCode || '91') == '91' && !/^[6-9]/.test(d)) return null;
  return d;
}
const isEarly = x => !!x.valid_from && new Date(x.valid_from) > Date.now();
const fdt = t => t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
const waLink = (phone, text) => { const d = normPhone(phone) || String(phone).replace(/\D/g, ''); const p = d.length == 10 ? (CFG.countryCode || '') + d : d; return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text) };
const tp = (id, b) => { const i = $('#' + id), sh = i.type == 'password'; i.type = sh ? 'text' : 'password'; b.innerHTML = sh ? IC.off : IC.eye };
const pwField = (id, auto) => `<div class="pw"><input id="${id}" type="password" autocomplete="${auto}"><button type="button" class="eye" aria-label="Show or hide password" onclick="tp('${id}',this)">${IC.eye}</button></div>`;

function nice(e) {
  const m = String((e && e.message) || e);
  if (/already (been )?registered/i.test(m)) return 'This number is already registered. Use Sign in.';
  if (/invalid login/i.test(m)) return 'Wrong login details';
  if (/password.*(at least|short|characters)/i.test(m)) return 'Password must be at least 6 characters';
  if (/not allowed/i.test(m)) return 'You are not allowed to perform this action.';
  if (/customer not found/i.test(m) || /member.*not found/i.test(m)) return 'Customer not found.';
  if (/fetch|network/i.test(m)) return 'No connection. Check your internet and try again.';
  return m;
}

// ---- Branding: one colour plus a few fixed look options ----
// Everything derived from the brand colour is computed here so any colour stays readable:
//   --on-brand  text on top of the colour (white or near-black, whichever contrasts more)
//   --brand-t-l / --brand-t-d  the colour as TEXT on a light / dark card (darkened or lightened until it reaches 4.5:1)
//   --brand-2   the second stop of the header gradient
const HEX6 = /^#[0-9a-f]{6}$/i;
const _ch = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const _hex = a => '#' + a.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const _lum = a => { const f = x => (x /= 255) <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); return .2126 * f(a[0]) + .7152 * f(a[1]) + .0722 * f(a[2]) };
const contrast = (h1, h2) => { const a = _lum(_ch(h1)), b = _lum(_ch(h2)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
const _mix = (h, to, t) => { const a = _ch(h), b = _ch(to); return _hex(a.map((x, i) => x + (b[i] - x) * t)) };
// Move a colour towards `to` in small steps until it reaches 4.5:1 against `bg` (or hits `to`).
const _legible = (h, bg, to) => { let c = h; for (let t = 0; t <= 1.0001 && contrast(c, bg) < 4.5; t += .05) c = _mix(h, to, t); return c };
const RADII = { sharp: ['8px', '6px', '6px'], soft: ['22px', '12px', '12px'], round: ['30px', '99px', '16px'] };
// The CSS variables for a colour and theme. Used for the live app and for the preview in the owner's editor.
function themeVars(color, theme) {
  const c = HEX6.test(color || '') ? color : '#8a4b2a', t = theme && typeof theme == 'object' ? theme : {};
  const on = contrast(c, '#ffffff') >= contrast(c, '#111111') ? '#ffffff' : '#111111';
  const r = RADII[t.radius] || RADII.soft;
  return {
    '--brand': c, '--on-brand': on,
    '--brand-t-l': _legible(c, '#fffdfa', '#000000'), '--brand-t-d': _legible(c, '#1d1b19', '#ffffff'),
    '--brand-2': t.hero == 'solid' ? c : on == '#ffffff' ? _mix(c, '#000000', .45) : _mix(c, '#ffffff', .3),
    '--r-card': r[0], '--r-btn': r[1], '--r-in': r[2],
    '--f-d': t.font == 'sans' ? 'Inter,system-ui,sans-serif' : 'Fraunces,Georgia,serif'
  };
}
function brand(b) {
  const st = document.documentElement.style;
  Object.entries(themeVars(b.color, b.theme)).forEach(([k, x]) => st.setProperty(k, x));
  document.title = b.name + ' Rewards';
}
const mark = b => (b.logo_url && (b.logo_url.startsWith('http') || b.logo_url.startsWith('data:'))) ? `<img src="${esc(b.logo_url)}" alt="">` : esc((b.name || '?').trim().slice(0, 1).toUpperCase());
const head = b => `<div class="bh"><div class="logo">${mark(b)}</div><h1>${esc(b.name)}</h1><p>${esc(b.tagline)}</p></div>`;
function socials(b) {
  const L = [['Instagram', b.ig, 'ig'], ['Facebook', b.fb, 'fb'], ['WhatsApp', b.wa, 'wa'], ['Website', b.web, 'web']].filter(x => /^https?:\/\//.test(x[1]));
  return L.length ? `<div class="soc">${L.map(x => `<a href="${esc(x[1])}" target="_blank" rel="noopener" aria-label="${x[0]}">${IC[x[2]]}</a>`).join('')}</div>` : '';
}
// ---- Which shop is this page for? ----
// Single-shop deployment: config.js sets `slug` and nothing changes.
// Multi-shop deployment: leave `slug` empty. The shop comes from the address:
//   1) subdomain of config.js `baseDomain`   (cheesora.example.com -> "cheesora", needs no database lookup)
//   2) a custom domain registered for the shop (looked up once with resolve_host(), remembered for the tab)
//   3) ?shop=slug, on localhost only (for testing)
async function resolveShop() {
  if (/^\/app\/?$/.test(location.pathname)) return false;
  if (CFG.slug) return true;
  const h = location.hostname.toLowerCase(), base = String(CFG.baseDomain || '').toLowerCase().replace(/^\./, '');
  if (/^(localhost|127\.0\.0\.1)$/.test(h)) { const q = new URLSearchParams(location.search).get('shop'); if (q && /^[a-z0-9-]+$/.test(q)) { CFG.slug = q; return true } }
  if (base && h.endsWith('.' + base)) { const s = h.slice(0, -base.length - 1); if (/^[a-z0-9-]+$/.test(s) && !['www', 'app', 'admin', 'platform'].includes(s)) { CFG.slug = s; return true } }
  const key = 'lk-host-' + h;
  try { const c = sessionStorage.getItem(key); if (c) { CFG.slug = c; return true } } catch (e) { }
  try {
    const r = await fetch(CFG.supabaseUrl + '/rest/v1/rpc/resolve_host', { method: 'POST', headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_host: h }) });
    const s = r.ok ? await r.json() : null;
    if (typeof s == 'string' && /^[a-z0-9-]+$/.test(s)) { CFG.slug = s; try { sessionStorage.setItem(key, s) } catch (e) { } return true }
  } catch (e) { }
  return false;
}
const noShopMsg = /^\/app\/?$/.test(location.pathname) ? '<div class="card"><h2>Find your shop</h2><p class="sub">Open the rewards link or scan the QR code provided by your shop to get started.</p><p class="sub"><a href="/">Back to Innondu</a></p></div>' : '<div class="card"><h2>Shop not found</h2><p class="sub">This web address is not linked to a shop. Check the link, or ask the shop for their rewards link.</p><p class="sub"><a href="/">Back to Innondu</a></p></div>';
const notReady = () => /YOUR-/.test(CFG.supabaseUrl + CFG.supabaseKey) || !window.supabase;
const setupMsg = '<div class="card"><h2>Almost there</h2><p class="sub">Add your Supabase URL and key in <b>assets/config.js</b>, then reload. See README.md.</p></div>';

// ---- Small touches shared by both apps ----
async function copyText(t, msg) { try { await navigator.clipboard.writeText(t); toast(msg || 'Copied') } catch (e) { toast('Press and hold to copy: ' + t) } }
const haptic = () => { try { navigator.vibrate && navigator.vibrate(30) } catch (e) { } };
// Confetti from a point on the screen. o = the burst origin as a fraction of the viewport (0..1),
// or the viewport centre when called with no origin (admin app). big = more pieces + a second wave.
// Skipped entirely for people who prefer reduced motion. Only transform/opacity animate, and the
// wrapper is a single element so cleanup is one remove().
const _lt = hex => { const s = String(hex || '').replace('#', ''); if (s.length != 6) return '#e8e0d5'; const n = parseInt(s, 16); const m = v => Math.round(v * .55 + 255 * .45); return '#' + [m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)].map(x => x.toString(16).padStart(2, '0')).join('') };
function burst(o, big) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.confetti').forEach(el => el.remove());   // cap DOM nodes: one overlay at a time
  const w = document.createElement('div'); w.className = 'confetti'; w.setAttribute('aria-hidden', 'true');
  document.body.appendChild(w);
  const c = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#8a4b2a';
  const cols = [c, '#f5b942', '#ffffff', _lt(c), c];
  const ox = o && o.x >= 0 && o.x <= 1 ? o.x : .5, oy = o && o.y >= 0 && o.y <= 1 ? o.y : .5;
  const star = 'clip-path:polygon(50% 0%,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0% 50%,39% 39%)';
  const shape = () => { const k = Math.random(); return k < .5 ? 'width:8px;height:12px;border-radius:2px' : k < .72 ? 'width:11px;height:11px;border-radius:50%' : k < .9 ? 'width:4px;height:17px;border-radius:2px' : 'width:12px;height:12px;border-radius:2px;' + star };
  const drop = n => {
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const ang = Math.random() * Math.PI * 2, R = .7 + Math.random() * .8;
      const dx = Math.cos(ang) * 130 * R, dy = -Math.sin(ang) * (90 + Math.random() * 190) - 30;
      p.style.cssText = `left:${(ox * 100).toFixed(1)}%;top:${(oy * 100).toFixed(1)}%;background:${cols[i % cols.length]};--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * .1).toFixed(2)}s;${shape()}`;
      w.appendChild(p);
    }
  };
  drop(big ? 54 : 28);
  if (big) setTimeout(() => drop(36), 250);
  setTimeout(() => w.remove(), big ? 2100 : 1800);
}
// Enter in a text box presses the primary button of the same card (buttons opt in with the data-go attribute).
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const t = e.target;
  if (!t || t.tagName !== 'INPUT' || t.type === 'checkbox' || t.type === 'file') return;
  const card = t.closest('.card, .a-card'), b = card && card.querySelector('[data-go]:not([disabled])');
  if (b) { e.preventDefault(); b.click() }
});
