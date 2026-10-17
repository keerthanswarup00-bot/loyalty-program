// Connect marketing page: a tappable sample shop page. Every tap is "one more" customer or order.
(function () {
  var V = window.VERTICALS || {};
  var TYPES = [['cafe', 'Cafe'], ['bakery', 'Bakery'], ['salon', 'Salon'], ['boutique', 'Store'], ['repair', 'Repair'], ['generic', 'Other']];
  var COLORS = ['#7c5cff', '#e8590c', '#0f9d6b', '#d6336c', '#1c7ed6'];
  var st = { name: 'Your shop', type: 'cafe', color: COLORS[0], cust: 0, ord: 0 };
  var $ = function (id) { return document.getElementById(id); };
  var screen = document.querySelector('.cx-screen');
  if (!screen || !$('cxTypes')) return;
  var toastT;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shopName() { return st.name.trim() || 'Your shop'; }
  function vt() { return V[st.type] || V.generic || { section: 'Menu', sample: { tagline: '', items: [] }, orderText: function (s, i) { return 'Hi ' + s + ', I am interested in: ' + i + '.'; } }; }

  function toast(msg) {
    var t = $('cxToast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }
  function bump(id) { var el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function pop(from) {
    var ph = $('cxPhone'), r = from.getBoundingClientRect(), p = ph.getBoundingClientRect();
    var s = document.createElement('span'); s.className = 'cx-pop'; s.textContent = '+1';
    s.style.left = (r.left - p.left + r.width / 2 - 10) + 'px'; s.style.top = (r.top - p.top) + 'px';
    ph.appendChild(s); setTimeout(function () { s.remove(); }, 850);
  }
  function count(kind, from) {
    st[kind]++; $(kind === 'cust' ? 'cxCust' : 'cxOrd').textContent = st[kind];
    bump(kind === 'cust' ? 'cxCust' : 'cxOrd'); pop(from);
  }

  function render() {
    var v = vt(), n = shopName();
    screen.style.setProperty('--b', st.color);
    $('cxLogo').textContent = n.charAt(0).toUpperCase();
    $('cxShop').textContent = n;
    $('cxTag').textContent = (v.sample && v.sample.tagline) || '';
    $('cxSec').textContent = v.section;
    $('cxItems').innerHTML = ((v.sample && v.sample.items) || []).slice(0, 3).map(function (it, i) {
      return '<button type="button" class="cx-item" data-item="' + i + '"><span>' + esc(it.title) + '</span><em>' + esc(it.price) + '</em></button>';
    }).join('');
    [].forEach.call($('cxTypes').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.k === st.type)); });
    [].forEach.call($('cxColors').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.c === st.color)); });
  }

  $('cxTypes').innerHTML = TYPES.map(function (t) { return '<button type="button" data-k="' + t[0] + '" aria-pressed="false">' + t[1] + '</button>'; }).join('');
  $('cxColors').innerHTML = COLORS.map(function (c, i) { return '<button type="button" data-c="' + c + '" style="background:' + c + '" aria-label="Colour ' + (i + 1) + '" aria-pressed="false"></button>'; }).join('');

  $('cxTypes').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { st.type = b.dataset.k; render(); } });
  $('cxColors').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { st.color = b.dataset.c; render(); } });
  $('cxName').addEventListener('input', function (e) { st.name = e.target.value; render(); });

  $('cxPhone').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !screen.contains(b)) return;
    var n = shopName(), act = b.dataset.act;
    if (b.dataset.item != null) {
      var it = vt().sample.items[+b.dataset.item];
      toast('Opens WhatsApp: “' + vt().orderText(n, it.title) + '”'); count('ord', b); return;
    }
    if (act === 'dir') { toast('Opens Google Maps, straight to ' + n + '.'); count('cust', b); }
    else if (act === 'call') { toast('Dials ' + n + ' in one tap.'); count('cust', b); }
    else if (act === 'join') { toast('Opens your loyalty card, ready for the first stamp.'); count('cust', b); }
    else if (act === 'wa') { toast('Opens WhatsApp: “Hi ' + n + ', I have a question.”'); count('ord', b); }
  });

  render();
})();
