// Customer page FX: animated hero, smooth scroll-linked motion, reveal-on-scroll, interactive bits.
// Self-contained: only reads the DOM that customer.js renders. Stamp card, scratch card, .c-count and .prog are never modified.
(() => {
  const app = document.getElementById('app');
  if (!app || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e };

  // ---- fixed bits: progress bar + mini header ----
  const bar = mk('div', 'fx-bar'); bar.setAttribute('aria-hidden', 'true');
  const mini = mk('button', 'fx-mini'); mini.type = 'button'; mini.setAttribute('aria-label', 'Back to top');
  mini.tabIndex = -1;
  mini.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  document.body.append(bar, mini);

  let hero = null, played = false, sy = window.scrollY, px = 0, py = 0, tx = 0, ty = 0, taps = 0, tapT = 0, last = '';

  // ---- scroll reveal ----
  const io = new IntersectionObserver(es => es.forEach(e => {
    // also reveal anything already scrolled past (re-renders while the user is lower on the page)
    if (e.isIntersecting || e.boundingClientRect.top < 0) { e.target.classList.add('in'); io.unobserve(e.target) }
  }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });

  function reveal() {
    [...app.children].forEach(c => {
      if (!c.classList.contains('card') || c.dataset.fx) return;
      // skip on purpose: loading skeleton, "what's new" note, the stamp card (.grid) and the daily scratch card
      // (its canvas measures its own box, so it must never be transformed)
      if (c.classList.contains('sk') || c.classList.contains('news') || c.id == 'daily-scr' || c.querySelector('.grid, canvas')) return;
      c.dataset.fx = '1';
      if (c.getBoundingClientRect().top < innerHeight * .92) return; // first screen keeps its normal entrance
      c.classList.add('fx-r');
      c.querySelectorAll('.of').forEach((r, i) => r.style.setProperty('--i', Math.min(i, 8)));
      io.observe(c);
    });
  }

  // ---- hero ----
  function logoTap(logo) {
    logo.classList.remove('wig'); void logo.offsetWidth; logo.classList.add('wig');
    if (typeof haptic == 'function') haptic();
    clearTimeout(tapT); tapT = setTimeout(() => taps = 0, 1200);
    if (++taps >= 5) {
      taps = 0;
      if (typeof burst == 'function') { burst(); setTimeout(burst, 250) }
      if (typeof toast == 'function') toast('You found the secret confetti!');
    } else if (taps == 1 && typeof burst == 'function') burst();
  }

  function enhanceHero() {
    const h = app.querySelector('.c-hero');
    hero = h;
    if (!h || h.dataset.fx) return;
    h.dataset.fx = '1'; h.classList.add('fxh');
    if (played) h.classList.add('still');
    const nm = h.querySelector('.c-bt b');
    if (nm) {
      const words = nm.textContent.trim().split(/\s+/);
      nm.textContent = '';
      words.forEach((w, i) => {
        const o = mk('span', 'fx-w'), s = mk('span'); s.textContent = w; s.style.setProperty('--i', i);
        o.appendChild(s); nm.appendChild(o);
        if (i < words.length - 1) nm.appendChild(document.createTextNode(' '));
      });
    }
    const orbs = mk('div', 'fx-orbs'); orbs.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) orbs.appendChild(mk('i'));
    for (let i = 0; i < 9; i++) {
      const b = mk('b');
      b.style.cssText = `left:${(i * 37 + 8) % 96}%;top:${(i * 53 + 10) % 90}%;--k:${(i % 2 ? 1 : -1) * (14 + i * 4)};--t:${3 + (i % 4)}s;--d:${(i * .4).toFixed(1)}s`;
      orbs.appendChild(b);
    }
    h.prepend(orbs);
    const logo = h.querySelector('.c-logo');
    if (logo) { logo.setAttribute('role', 'button'); logo.addEventListener('click', () => logoTap(logo)) }
    played = true;
  }

  // ---- mini header mirrors the hero + stamp count ----
  function syncMini() {
    mini.textContent = '';
    if (!hero) return;
    const wrap = mk('div', 'fx-mi-in'), logo = hero.querySelector('.c-logo'), name = hero.querySelector('.c-bt b');
    if (logo) wrap.appendChild(logo.cloneNode(true));
    const b = mk('b'); b.textContent = name ? name.textContent : ''; wrap.appendChild(b);
    const cnt = app.querySelector('.c-count'), m = cnt && cnt.textContent.match(/^\s*(\d+) of (\d+)/);
    if (m) { const p = mk('span', 'fx-pill'); p.textContent = m[1] + ' / ' + m[2]; wrap.appendChild(p) }
    mini.appendChild(wrap);
  }

  function enhance() { enhanceHero(); syncMini(); reveal() }
  new MutationObserver(enhance).observe(app, { childList: true });
  enhance();

  // ---- pointer: hero parallax (mouse/pen only) + card spotlight ----
  addEventListener('pointermove', e => {
    if (e.pointerType == 'touch') return;
    tx = (e.clientX / innerWidth - .5) * 2; ty = (e.clientY / innerHeight - .5) * 2;
  }, { passive: true });
  app.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.fx-r'); if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    c.classList.add('hot');
  }, { passive: true });
  app.addEventListener('pointerleave', () => app.querySelectorAll('.fx-r.hot').forEach(c => c.classList.remove('hot')), true);

  // ---- smoothed scroll-linked values (native scrolling is left alone; only the effects are eased) ----
  (function tick() {
    const y = window.scrollY;
    sy = Math.abs(sy - y) < .1 ? y : lerp(sy, y, .12);
    px = lerp(px, tx, .08); py = lerp(py, ty, .08);
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = 'scaleX(' + (max > 0 ? clamp(y / max, 0, 1) : 0).toFixed(4) + ')';
    if (hero) {
      const p = clamp(sy / ((hero.offsetHeight || 200) + 40), 0, 1);
      const s = p.toFixed(3) + '|' + px.toFixed(3) + '|' + py.toFixed(3);
      if (s != last) {
        last = s;
        hero.style.setProperty('--p', p.toFixed(3)); hero.style.setProperty('--px', px.toFixed(3)); hero.style.setProperty('--py', py.toFixed(3));
      }
      mini.classList.toggle('on', y > (hero.offsetHeight || 200) + 30);
    }
    requestAnimationFrame(tick);
  })();
})();
