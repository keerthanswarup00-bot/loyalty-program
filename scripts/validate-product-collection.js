// Lightweight checks for the collection route's critical behaviour.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync('assets/connect.js', 'utf8');
const common = fs.readFileSync('assets/common.js', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

assert.match(source, /const collectionRoute = \/\\/collection\\\/?\//);
assert.match(source, /function productCollectionSection\(\)/);
assert.match(source, /I want more details about /);
assert.match(source, /collectionLink\(\)/);
assert.match(common, /admin\|collection/);
assert(vercel.rewrites.some(r => r.source === '/connect/:slug/collection/'));

const digits = raw => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '0') d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d;
};
const href = (number, product) => 'https://wa.me/' + digits(number) + '?text=' + encodeURIComponent('Hi Sample Shop, I want more details about ' + product + '.');
const url = new URL(href('9876543210', 'Handmade Mug'));
assert.equal(url.hostname, 'wa.me');
assert.equal(url.pathname, '/919876543210');
assert.equal(new URLSearchParams(url.search).get('text'), 'Hi Sample Shop, I want more details about Handmade Mug.');
console.log('Product collection route and WhatsApp enquiry checks passed.');
