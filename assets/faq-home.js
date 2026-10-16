(function () {
  var cfg = window.SITE || {};
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isTodo(v) { return typeof v === 'string' && /TODO_/.test(v); }
  function real(v) { return typeof v === 'string' && !isTodo(v) && v.trim() ? v.trim() : ''; }
  function ph(v, key) { return real(v) ? esc(v) : '<span class="tbd-ph">[' + esc(key) + ']</span>'; }
  function append(container, q, a) {
    var item = document.createElement('details');
    item.className = 'faq-item reveal';
    var sum = document.createElement('summary');
    sum.textContent = q;
    var ans = document.createElement('div');
    ans.className = 'faq-answer';
    ans.innerHTML = a;
    item.appendChild(sum);
    item.appendChild(ans);
    container.appendChild(item);
  }
  var list = document.getElementById('faq-list-home');
  if (!list) return;
  var faqs = [
    ['What does it cost, during and after the pilot?', ph(cfg.faq && cfg.faq.cost, 'faq.cost')],
    ['How long does setup take and what do I need to do?', ph(cfg.faq && cfg.faq.setup, 'faq.setup')],
    ['Do my customers need to install anything?', ph(cfg.faq && cfg.faq.install, 'faq.install')],
    ['Who owns the customer data, and can I export or delete it?', ph(cfg.faq && cfg.faq.ownership, 'faq.ownership')]
  ];
  faqs.forEach(function (f) { append(list, f[0], f[1]); });
})();
