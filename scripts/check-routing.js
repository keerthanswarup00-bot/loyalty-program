// Sanity test for path-based shop helpers in assets/common.js (run: node scripts/check-routing.js)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../assets/common.js', 'utf8');
const start = src.indexOf('const CFG_SLUG');
const end = src.indexOf('function uniqueSlug');
const endFn = src.indexOf('\n}', end) + 2;
const chunk = src.slice(start, endFn);
function run(pathname, cfgSlug) {
  const ctx = { CFG: { slug: cfgSlug }, location: { pathname, origin: 'https://www.innondu.com' } };
  vm.createContext(ctx);
  vm.runInContext(chunk + ';this.out={PATH_SHOP,SCOPED,shopPath,skey,slugify,uniqueSlug,CFG}', ctx);
  return ctx.out;
}
let o = run('/app/cheesora-bliss', 'cheesora-bliss');
assert.strictEqual(o.SCOPED, false); assert.strictEqual(o.skey('lk-x'), 'lk-x');
assert.strictEqual(o.shopPath('cheesora-bliss', false), '/app/');
o = run('/app/other-shop/admin/', 'cheesora-bliss');
assert.strictEqual(o.CFG.slug, 'other-shop'); assert.strictEqual(o.SCOPED, true);
assert.strictEqual(o.skey('lk-x'), 'lk-x-other-shop');
assert.strictEqual(o.shopPath('other-shop', true), '/app/other-shop/admin/');
assert.strictEqual(o.shopPath('cheesora-bliss', false), '/app/');
o = run('/app/', 'cheesora-bliss'); assert.strictEqual(o.PATH_SHOP, null);
o = run('/app/index.html', 'cheesora-bliss'); assert.strictEqual(o.PATH_SHOP, null);
assert.strictEqual(o.slugify('Café Bean & Brew'), 'cafe-bean-and-brew');
assert.strictEqual(o.uniqueSlug('docs', () => false), 'docs-2');
assert.strictEqual(o.uniqueSlug('tea-house', s => s === 'tea-house'), 'tea-house-2');
assert.strictEqual(o.uniqueSlug('ab', () => false), '');
console.log('routing checks passed');
