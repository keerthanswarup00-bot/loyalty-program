// Home page: scratch card, confetti, draggable stamp, branded phone demo, decorative poster QR.
(function () {
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Confetti (one fixed canvas, created on first use) ---------- */
  var cc = null, cx = null, parts = [], raf = 0;
  var COLORS = ['#3a2ee0', '#8c84ff', '#f5b700', '#ef476f', '#06d6a0', '#ffffff'];
  function confetti(x, y, n, power, colors) {
    if (calm) return;
    if (!cc) {
      cc = document.createElement('canvas');
      cc.setAttribute('aria-hidden', 'true');
      cc.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60';
      document.body.appendChild(cc);
      cx = cc.getContext('2d');
    }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cc.width = Math.round(innerWidth * dpr); cc.height = Math.round(innerHeight * dpr);
    var pal = colors || COLORS;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (.4 + Math.random() * .6) * power;
      parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * .45,
        w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, r: Math.random() * 6.28, vr: (Math.random() - .5) * .4,
        c: pal[(Math.random() * pal.length) | 0], life: 0, max: 70 + Math.random() * 50, dpr: dpr
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    cx.clearRect(0, 0, cc.width, cc.height);
    parts = parts.filter(function (p) { return p.life < p.max; });
    parts.forEach(function (p) {
      p.life++; p.vy += .22; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cx.save(); cx.globalAlpha = Math.max(0, 1 - Math.pow(p.life / p.max, 2));
      cx.translate(p.x * p.dpr, p.y * p.dpr); cx.rotate(p.r); cx.fillStyle = p.c;
      cx.fillRect(-p.w * p.dpr / 2, -p.h * p.dpr / 2, p.w * p.dpr, p.h * p.dpr); cx.restore();
    });
    if (parts.length) raf = requestAnimationFrame(tick);
    else { raf = 0; cx.clearRect(0, 0, cc.width, cc.height); }
  }
  function burstAt(el, n, power, colors) {
    var r = el.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2, n, power, colors);
  }

  /* ---------- Scratch card ---------- */
  var fc = document.getElementById('fc'), cv = document.getElementById('foil'), ctx = cv.getContext('2d', { willReadFrequently: true });
  var prizeTxt = document.getElementById('prizeTxt'), cap = document.getElementById('cap'), again = document.getElementById('again'), reveal = document.getElementById('reveal');
  // Scratch is pointer-only, so the caption doubles as a polite live region for keyboard and
  // screen-reader users who use the "Reveal it for me" button instead of scrubbing the canvas.
  cap.setAttribute('role', 'status');
  function sayLive(t) { if (cap) cap.textContent = t; }
  var prizes = ['10% off your next visit', 'One extra stamp on your card', 'A free add-on, on us', 'Not this time. Try again tomorrow.'];
  var pi = 0, dpr = 1, down = false, last = null, done = false, tmr = null, lastW = 0;
  function size() {
    var r = fc.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); lastW = r.width; paint();
  }
  function paint() {
    var w = cv.width, h = cv.height; ctx.globalCompositeOperation = 'source-over';
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#aeb5bd'); g.addColorStop(.32, '#e8ebee'); g.addColorStop(.6, '#b7bec6'); g.addColorStop(1, '#dde1e5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < w * h / 110; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * .4) + ')'; ctx.fillRect(Math.random() * w, Math.random() * h, 1.6 * dpr, 1.6 * dpr); }
    for (var j = 0; j < w * h / 260; j++) { ctx.fillStyle = 'rgba(90,100,110,' + (Math.random() * .14) + ')'; ctx.fillRect(Math.random() * w, Math.random() * h, 1.4 * dpr, 1.4 * dpr); }
    ctx.fillStyle = '#667078'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + (26 * dpr) + 'px "Bricolage Grotesque",system-ui,sans-serif';
    ctx.fillText('SCRATCH HERE', w / 2, h / 2);
    ctx.font = '500 ' + (11 * dpr) + 'px "JetBrains Mono",monospace';
    ctx.fillText('INNONDU  +1', w / 2, h / 2 + 30 * dpr);
  }
  function pt(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
  function scratch(e) {
    var p = pt(e); ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 46 * dpr; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); if (last) { ctx.moveTo(last[0], last[1]); } else { ctx.moveTo(p[0], p[1]); }
    ctx.lineTo(p[0] + .01, p[1]); ctx.stroke(); last = p;
    fc.classList.add('touched');
    if (!tmr) { tmr = setTimeout(function () { tmr = null; check(); }, 180); }
  }
  function check() {
    if (done) return;
    var w = cv.width, h = cv.height, d = ctx.getImageData(0, 0, w, h).data, clear = 0, n = 0, step = 16;
    for (var y = 0; y < h; y += step) { for (var x = 0; x < w; x += step) { n++; if (d[(y * w + x) * 4 + 3] < 40) clear++; } }
    if (clear / n > .5) finish();
  }
  function finish() {
    if (done) return;
    done = true; fc.classList.add('done'); again.hidden = false; reveal.hidden = true;
    cap.textContent = 'A sample prize. On a real card, a new one unlocks every day.';
    sayLive('Scratch card revealed. ' + prizeTxt.textContent);
    if (pi !== prizes.length - 1) { burstAt(fc, 70, 9); setTimeout(function () { burstAt(fc, 40, 6); }, 220); }
  }
  function resetCard() {
    done = false; fc.classList.remove('done', 'touched'); pi = (pi + 1) % prizes.length; prizeTxt.textContent = prizes[pi];
    again.hidden = true; reveal.hidden = false; cap.textContent = 'Scratch it with your finger or mouse.'; last = null; paint();
    sayLive('A new scratch card. Scratch it or reveal it.');
  }
  cv.addEventListener('pointerdown', function (e) { down = true; last = null; try { cv.setPointerCapture(e.pointerId); } catch (_) { } scratch(e); });
  cv.addEventListener('pointermove', function (e) { if (down) scratch(e); });
  ['pointerup', 'pointercancel'].forEach(function (t) { cv.addEventListener(t, function () { down = false; last = null; check(); }); });
  again.addEventListener('click', resetCard); reveal.addEventListener('click', finish);
  size();
  if (window.ResizeObserver) { new ResizeObserver(function () { var w = fc.getBoundingClientRect().width; if (!done && Math.abs(w - lastW) > 2) size(); }).observe(fc); }
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { if (!done) paint(); }); }

  /* ---------- Phone demo: draggable stamp ---------- */
  var NEED = 8, s = 3, phone = document.getElementById('phone');
  var grid = document.getElementById('phGrid'), nEl = document.getElementById('phN'), bar = document.getElementById('phBar'), rew = document.getElementById('phReward');
  var again2 = document.getElementById('phAgain'), card = document.getElementById('phCard');
  var st = document.getElementById('stamp'), hint = document.getElementById('stampHint');
  var nameIn = document.getElementById('brandName'), phName = document.getElementById('phName'), phLogo = document.getElementById('phLogo');
  var busy = false, moved = false, dragging = false, dx = 0, dy = 0, sx = 0, sy = 0, tried = false;

  function draw(popIdx) {
    var h = '';
    for (var i = 0; i < NEED; i++) {
      h += i < s ? '<div class="ph-st f' + (i === popIdx ? ' pop' : '') + '"><svg aria-hidden="true"><use href="#tick"/></svg></div>' : '<div class="ph-st">' + (i + 1) + '</div>';
    }
    grid.innerHTML = h; nEl.textContent = s; bar.style.width = (s / NEED * 100) + '%';
    var full = s >= NEED; rew.hidden = !full; again2.hidden = !full; st.classList.toggle('off', full);
    st.disabled = full;
  }
  function slotEl() { return grid.children[Math.min(s, NEED - 1)]; }
  function setPos(x, y) { dx = x; dy = y; st.style.setProperty('--dx', x + 'px'); st.style.setProperty('--dy', y + 'px'); }
  function tip() { var r = st.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - r.height * .08, r: r }; }
  function over(t) {
    var g = card.getBoundingClientRect(), m = 12;
    return t.x > g.left - m && t.x < g.right + m && t.y > g.top - m && t.y < g.bottom + m;
  }
  function hot(on) { card.classList.toggle('hot', on); }

  function land() {
    // Stamp is already hovering over the next empty slot. Press, ink, return.
    var slot = slotEl(), sr = slot.getBoundingClientRect(), t = tip();
    st.classList.add('snap'); setPos(dx + (sr.left + sr.width / 2 - t.x), dy + (sr.top + sr.height / 2 - t.y));
    setTimeout(function () {
      st.classList.add('press');
      setTimeout(function () {
        s++; draw(s - 1);
        var full = s >= NEED, el = grid.children[s - 1];
        sayStamp(s);
        burstAt(el, full ? 90 : 26, full ? 10 : 5, [getComputedStyle(phone).getPropertyValue('--brand').trim() || COLORS[0], '#f5b700', '#ffffff', '#06d6a0']);
        st.classList.remove('press');
        setTimeout(function () { st.classList.remove('snap'); st.classList.add('home'); setPos(0, 0); setTimeout(function () { st.classList.remove('home'); busy = false; }, 520); }, 160);
      }, 110);
    }, 230);
  }
  function auto() {
    if (busy || s >= NEED) return;
    busy = true; hide(); sayStamp(s + 1);
    // Aim the stamp at the next slot from where it rests.
    var slot = slotEl(), sr = slot.getBoundingClientRect(), t = tip();
    st.classList.add('lift', 'snap'); setPos(dx + (sr.left + sr.width / 2 - t.x), dy + (sr.top + sr.height / 2 - t.y));
    setTimeout(function () { st.classList.remove('lift'); land(); }, 320);
  }
  function hide() { if (hint) hint.classList.add('gone'); }
  // A polite live region so a screen reader hears the stamp count change (the grid is decorative markup).
  function sayStamp(n) {
    var live = document.getElementById('phLive');
    if (live) live.textContent = n >= NEED
      ? 'Card full. ' + NEED + ' of ' + NEED + ' stamps. A reward is unlocked.'
      : 'Stamp added. ' + n + ' of ' + NEED + ' stamps.';
  }

  st.addEventListener('pointerdown', function (e) {
    if (busy || s >= NEED || e.button > 0) return;
    dragging = true; moved = false; tried = true; hide();
    sx = e.clientX - dx; sy = e.clientY - dy;
    st.classList.remove('home', 'snap'); st.classList.add('lift');
    try { st.setPointerCapture(e.pointerId); } catch (_) { }
    e.preventDefault();
  });
  st.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var nx = e.clientX - sx, ny = e.clientY - sy;
    if (Math.abs(nx - dx) + Math.abs(ny - dy) > 3) moved = true;
    setPos(nx, ny); hot(over(tip()));
  });
  function drop() {
    if (!dragging) return;
    dragging = false; hot(false);
    if (!moved) { st.classList.remove('lift'); return; }          // a tap: click handler runs the stamp
    st.classList.remove('lift');
    if (over(tip())) { busy = true; land(); }
    else { st.classList.add('home'); setPos(0, 0); setTimeout(function () { st.classList.remove('home'); }, 520); }
  }
  st.addEventListener('pointerup', drop); st.addEventListener('pointercancel', drop);
  st.addEventListener('click', function () { if (moved) { moved = false; return; } auto(); });
  again2.addEventListener('click', function () { s = 0; draw(-1); });

  function setName() { var v = nameIn.value.trim() || 'Your shop'; phName.textContent = v; phLogo.textContent = v.charAt(0).toUpperCase(); }
  nameIn.addEventListener('input', setName);
  document.getElementById('sw').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    phone.style.setProperty('--brand', b.dataset.c);
    [].forEach.call(this.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
  });
  draw(-1);

  /* ---------- Illustrative QR for the poster (decorative, not scannable) ---------- */
  (function () {
    var N = 21, seed = 7, cells = '';
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    function finder(x, y) { return x < 7 && y < 7 || x >= N - 7 && y < 7 || x < 7 && y >= N - 7; }
    function ring(x, y) { var cx0 = x < 7 ? 0 : N - 7, cy0 = y < 7 ? 0 : N - 7, ddx = x - cx0, ddy = y - cy0; return ddx === 0 || ddx === 6 || ddy === 0 || ddy === 6 || (ddx >= 2 && ddx <= 4 && ddy >= 2 && ddy <= 4); }
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var on; if (finder(x, y)) on = ring(x, y); else if ((x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8)) on = false; else on = rnd() > .5;
        if (on) cells += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
      }
    }
    var host = document.getElementById('qrArt');
    if (host) host.innerHTML = '<svg viewBox="0 0 ' + N + ' ' + N + '" fill="#12161a" shape-rendering="crispEdges" aria-hidden="true">' + cells + '</svg>';
  })();
})();
