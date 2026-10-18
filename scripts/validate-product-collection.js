// Lightweight checks for the collection route's critical behaviour.
const fs = require('node:fs');
const assert = require('node:assert/strict');

const source = fs.readFileSync('assets/connect.js', 'utf8');
const common = fs.readFileSync('assets/common.js', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

assert(source.includes('const collectionRoute ='));
assert(source.includes('function productCollectionSection()'));
assert(source.includes('const productText ='));
assert(source.includes('waHref(wd, productText(product))'), 'product sheet uses the per-product prefill');
assert(source.includes('retryMenu') && source.includes('MENU_ERR'), 'failed load has a retry');
assert(source.includes('${collectionLink()}'));
assert.match(common, /admin\|collection/);
assert(vercel.rewrites.some(r => r.source === '/connect/:slug/collection/'));

const digits = raw => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '0') d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d;
};
const text = 'Hi Sample Shop, I am interested in: Handmade Mug (₹499). https://x.test/connect/sample/collection/';
const href = number => 'https://wa.me/' + digits(number) + '?text=' + encodeURIComponent(text);
const url = new URL(href('9876543210'));
assert.equal(url.hostname, 'wa.me');
assert.equal(url.pathname, '/919876543210');
assert.equal(new URLSearchParams(url.search).get('text'), text);
console.log('Product collection route and WhatsApp enquiry checks passed.');
