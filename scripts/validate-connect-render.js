// Renders the public Connect page in Node with stubbed browser globals and checks what visitors see:
// a failed menu load is not shown as "empty" (and retries), one primary button by shop type, the hours badge,
// and the per-product WhatsApp text.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function load(pathname, state) {
  const app = { innerHTML: '' };
  const ctx = {
    console, Intl, Date, URLSearchParams, encodeURIComponent, decodeURIComponent, setTimeout,
    location: { pathname, search: '', origin: 'https://x.test' },
    document: { head: { querySelector: () => null, appendChild() { } }, createElement: () => ({ setAttribute() { } }), body: { classList: { add() { }, remove() { } } }, getElementById: () => null },
    navigator: {}, CFG: { countryCode: '91', slug: 'aroma' }, linkSlug: 'aroma',
    notReady: () => true, setupMsg: '', mkClient: () => ({}),
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    ico: () => '<svg/>', IC: { wa: '<wa/>', ig: '', fb: '', web: '' }, $: s => (s == '#app' ? app : null),
    rpc: async () => { if (state.fail) throw new Error('offline'); return { categories: [], items: state.items } },
    connectBase: () => '/connect/aroma/', appBase: () => '/app/aroma/', HEX6: /^#[0-9a-f]{6}$/i,
    mark: () => '', brand() { }, themeVars: () => ({}), toast() { }
  };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['assets/verticals.js', 'assets/connect-core.js', 'assets/connect.js']) vm.runInContext(read(f), ctx);
  const run = c => vm.runInContext(c, ctx);
  run('0'); // let the (stubbed, not-ready) bootstrap finish
  return {
    app, run,
    shop(vertical, extra) { run(`B = Object.assign({ slug:'aroma', name:'Aroma', vertical:'${vertical}', phone:'9876543210', wa_phone:'9876543210', maps_url:'https://maps.app/x', connect_loyalty:true, tz:'Asia/Kolkata' }, ${JSON.stringify(extra || {})}); V = vertical(B.vertical);`) }
  };
}
const primaries = html => html.match(/<a class="cn-act pri"[^>]*>[\s\S]*?<\/a>/g) || [];
const ITEMS = [{ id: 'm1', title: 'Mug', price: '₹499' }];

(async () => {
  // ---- 1. failed load vs empty, and retry
  const st = { fail: true, items: ITEMS };
  let p = load('/connect/aroma/collection/', st);
  p.shop('boutique'); await p.run('loadMenu()');
  assert.strictEqual(p.run('MENU_ERR'), true);
  let html = p.run('view()');
  assert.match(html, /Couldn.t load the collection/); assert.match(html, /onclick="retryMenu\(this\)"/); assert.ok(!/coming soon/i.test(html), 'failure is not "empty"');
  st.fail = false; await p.run('retryMenu()');
  assert.strictEqual(p.run('MENU_ERR'), false);
  assert.match(p.app.innerHTML, /Mug/); assert.ok(!/Couldn.t load/.test(p.app.innerHTML), 'retry recovers');
  // a real empty collection still says so
  st.items = []; await p.run('loadMenu()');
  assert.match(p.run('view()'), /Collection coming soon/);
  // main page: failure shows retry in place of the collection card
  st.fail = true; p = load('/connect/aroma/', st); p.shop('boutique'); await p.run('loadMenu()');
  assert.match(p.run('view()'), /Couldn.t load collection/);

  // ---- 2. one primary button, chosen by shop type, with fallbacks
  st.fail = false; st.items = ITEMS;
  const lab = (type, extra) => { p = load('/connect/aroma/', st); p.shop(type, extra); return p.run('loadMenu()').then(() => { const h = p.run('view()'); const a = primaries(h); assert.strictEqual(a.length, 1, type + ': ' + a.length + ' primary buttons'); return { h, a: a[0] } }) };
  let r = await lab('cafe'); assert.match(r.a, /Get directions/); assert.ok(!/<span>Directions<\/span>/.test(r.h), 'no duplicate Directions shortcut'); assert.match(r.h, /<span>Call<\/span>/);
  r = await lab('salon'); assert.match(r.a, /Book on WhatsApp/); assert.match(r.a, /wa\.me\/919876543210\?text=Hi%20Aroma%2C%20I%20would%20like%20to%20book%20an%20appointment/);
  r = await lab('repair'); assert.match(r.a, /Call now/); assert.match(r.a, /tel:\+919876543210/);
  r = await lab('boutique'); assert.match(r.a, /See the Collection/); assert.ok(!/cn-collection-cta/.test(r.h), 'collection card not repeated');
  r = await lab('repair', { phone: '' }); assert.match(r.a, /Ask on WhatsApp/, 'call missing -> WhatsApp');
  r = await lab('repair', { phone: '', wa_phone: '', maps_url: '' }); assert.match(r.a, /See what we fix/, 'only the collection left');
  st.items = []; p = load('/connect/aroma/', st); p.shop('repair', { phone: '', wa_phone: '', maps_url: '' }); await p.run('loadMenu()');
  assert.match(primaries(p.run('view()'))[0], /Join the loyalty card/, 'loyalty leads only when nothing else exists');
  st.items = ITEMS;

  // ---- 3. hours badge
  p = load('/connect/aroma/', st); p.shop('cafe', { hours: { mon: [['00:00', '24:00']], tue: [['00:00', '24:00']], wed: [['00:00', '24:00']], thu: [['00:00', '24:00']], fri: [['00:00', '24:00']], sat: [['00:00', '24:00']], sun: [['00:00', '24:00']] } });
  await p.run('loadMenu()'); html = p.run('view()');
  assert.match(html, /class="cn-hb open"/); assert.match(html, /Open 24 hours/); assert.strictEqual((html.match(/<li/g) || []).length, 7);
  p.shop('cafe', { hours: {} }); assert.ok(!/cn-hours/.test(p.run('view()')), 'no hours, no badge');

  // ---- 4. per-product WhatsApp text
  p = load('/connect/aroma/collection/', st); p.shop('bakery'); await p.run('loadMenu()');
  const txt = p.run('productText(MENU.items[0])');
  assert.strictEqual(txt, "Hi Aroma, I'd like to order: Mug (₹499). /connect/aroma/collection/");
  console.log('connect render checks passed');
})().catch(e => { console.error(e); process.exit(1) });
