// Local static server that applies the rewrites in vercel.json, so /app/<shop>/ works the same as on Vercel.
// Run:  node scripts/dev-server.js [port]     (default 4173)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), port = +process.argv[2] || 4173;
const rewrites = (JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).rewrites || [])
  .map(r => ({ re: new RegExp('^' + r.source.replace(/:[a-z]+/gi, '[^/]+') + '$'), to: r.destination }));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const file = p => { try { const s = fs.statSync(p); return s.isDirectory() ? file(path.join(p, 'index.html')) : p } catch (e) { return null } };
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]), abs = p => path.join(root, path.normalize(p));
  let f = u.includes('..') ? null : file(abs(u));
  if (!f) { const r = rewrites.find(x => x.re.test(u)); if (r) f = file(abs(r.to)) }
  if (!f) { res.writeHead(404); return res.end('Not found') }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('http://127.0.0.1:' + port));
