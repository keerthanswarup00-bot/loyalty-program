// Offline checks: link-preview middleware (main + collection pages) and the pure parts of assets/img.js.
const assert = require('assert'), fs = require('fs'), path = require('path');
const BrandImg = require('../assets/img.js');

(async () => {
  // ---- img.js
  assert.deepStrictEqual(BrandImg.fit(4000, 2000, 1000), { w: 1000, h: 500 });
  assert.deepStrictEqual(BrandImg.fit(300, 200, 1000), { w: 300, h: 200 });
  const U = 'https://x.supabase.co/storage/v1/object/public/brand/biz1/logo-abc.webp?t=1';
  assert.strictEqual(BrandImg.storagePath(U, 'biz1'), 'biz1/logo-abc.webp');
  assert.strictEqual(BrandImg.storagePath(U, 'biz2'), null);
  assert.strictEqual(BrandImg.storagePath('data:image/png;base64,AA', 'biz1'), null);
  assert.strictEqual(BrandImg.storagePath('/assets/x.svg', 'biz1'), null);
  assert.match(BrandImg.pathFor('b', 'hero', 'image/webp', 1, 'zz'), /^b\/hero-1zz\.webp$/);
  const blob = BrandImg.dataToBlob('data:image/png;base64,aGk=');
  assert.strictEqual(blob.type, 'image/png'); assert.strictEqual(blob.size, 2);
  assert.strictEqual(BrandImg.classify({ message: 'Bucket not found' }), 'no bucket');
  assert.strictEqual(BrandImg.classify({ message: 'new row violates row-level security policy' }), 'denied');
  assert.strictEqual(BrandImg.classify({ statusCode: '413', message: 'x' }), 'too big');
  assert.strictEqual(BrandImg.classify({ message: 'Failed to fetch' }), 'network');
  assert.ok(BrandImg.isData('data:image/png;base64,AA') && !BrandImg.isData('https://a/b.png'));

  // ---- middleware
  const src = fs.readFileSync(path.join(__dirname, '../middleware.js'), 'utf8').replace('export const config', 'const config').replace('export default async function', 'async function');
  const mod = new Function('fetch', 'Response', 'URL', src + '\nreturn { middleware, config };');
  const BIZ = { name: 'Aroma <Co>', tagline: 'Tea', about: '', logo_url: 'data:image/png;base64,AA', hero_url: 'https://cdn/hero.jpg', vertical: 'cafe' };
  const MENU = { categories: [], items: [{ title: 'Chai', image_url: 'data:x' }, { title: 'Mug', image_url: 'https://cdn/mug.png' }] };
  const calls = [];
  const fakeFetch = async (u, o) => {
    u = String(u); calls.push(u);
    if (u.includes('/rpc/get_business')) return { ok: true, json: async () => BIZ };
    if (u.includes('/rpc/get_menu')) return { ok: true, json: async () => MENU };
    if (u.endsWith('/connect-shop/index.html')) return { ok: true, text: async () => '<html><head><title>x</title></head><body></body></html>' };
    return { ok: false };
  };
  class R { constructor(b, i) { this.body = b; this.headers = i.headers } }
  const { middleware } = mod(fakeFetch, R, URL);
  const req = (p, ua) => ({ url: 'https://royalty-prog.vercel.app' + p, headers: { get: () => ua } });
  const BOT = 'WhatsApp/2.23';

  assert.strictEqual(await middleware(req('/connect/aroma/collection/', 'Mozilla/5.0 Chrome')), undefined, 'non-bot passes through');
  assert.strictEqual(await middleware(req('/connect/aroma/admin/', BOT)), undefined, 'admin route skipped');

  let r = await middleware(req('/connect/aroma/collection/', BOT));
  assert.ok(r, 'collection handled');
  assert.match(r.body, /<title>Aroma &lt;Co&gt; · Collection<\/title>/);
  assert.match(r.body, /og:image" content="https:\/\/cdn\/mug\.png"/, 'first https product image wins');
  assert.match(r.body, /og:url" content="https:\/\/royalty-prog\.vercel\.app\/connect\/aroma\/collection\/"/);
  assert.match(r.body, /canonical" href="https:\/\/royalty-prog\.vercel\.app\/connect\/aroma\/collection\/"/);
  assert.match(r.body, /Browse 2 products/);
  const ld = JSON.parse(/ld\+json">([\s\S]*?)<\/script>/.exec(r.body)[1].replace(/\\u003c/g, '<'));
  assert.strictEqual(ld['@type'], 'CollectionPage'); assert.strictEqual(ld.mainEntity.itemListElement.length, 2);
  assert.strictEqual((r.body.match(/<title>/g) || []).length, 1);

  r = await middleware(req('/connect/aroma', BOT));
  assert.match(r.body, /<title>Aroma &lt;Co&gt; · Connect<\/title>/);
  assert.match(r.body, /og:image" content="https:\/\/cdn\/hero\.jpg"/);
  assert.ok(!calls.slice(-3).some(c => c.includes('get_menu')), 'main page does not fetch menu');
  assert.strictEqual(JSON.parse(/ld\+json">([\s\S]*?)<\/script>/.exec(r.body)[1])['@type'], 'Restaurant');

  MENU.items = [];
  r = await middleware(req('/connect/aroma/collection', BOT));
  assert.match(r.body, /og:image" content="https:\/\/cdn\/hero\.jpg"/, 'falls back to hero when no product images');
  console.log('connect meta checks passed');
})().catch(e => { console.error(e); process.exit(1) });
