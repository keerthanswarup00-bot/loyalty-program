(function () {
  var cfg = window.SITE || {};
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isTodo(v) { return typeof v === 'string' && /TODO_/.test(v); }
  function real(v) { return typeof v === 'string' && !isTodo(v) && v.trim() ? v.trim() : ''; }
  function ph(v, key) {
    return real(v) ? esc(v) : '<span class="tbd-ph">[' + esc(key) + ']</span>';
  }
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
  var list = document.getElementById('faq-list');
  if (!list) return;
  var faqs = [
    ['How does a customer identify themselves?', ph(cfg.faq && cfg.faq.identity, 'faq.identity'), 'identity'],
    ['What stops someone farming stamps by tapping repeatedly?', ph(cfg.faq && cfg.faq.abuse, 'faq.abuse'), 'abuse'],
    ['Who owns the customer data, and can I export or delete it?', ph(cfg.faq && cfg.faq.ownership, 'faq.ownership'), 'ownership'],
    ['How long does setup take and what do I need to do?', ph(cfg.faq && cfg.faq.setup, 'faq.setup'), 'setup'],
    ['What does it cost, during and after the pilot?', ph(cfg.faq && cfg.faq.cost, 'faq.cost'), 'cost'],
    ['What if I stop using it or you shut down?', ph(cfg.faq && cfg.faq.exit, 'faq.exit'), 'exit'],
    ['Does it work on cheap Android phones and slow data?', ph(cfg.faq && cfg.faq.compat, 'faq.compat'), 'compat'],
    ['Do my customers need to install anything?', ph(cfg.faq && cfg.faq.install, 'faq.install'), 'install']
  ];
  faqs.forEach(function (f) { append(list, f[0], f[1]); });
  var ld = document.getElementById('ld-faq');
  if (ld) {
    var main = [];
    faqs.forEach(function (f) {
      var txt = (cfg.faq && cfg.faq[f[2]]) || '';
      if (!real(txt)) return;
      main.push({
        '@type': 'Question',
        name: f[0],
        acceptedAnswer: { '@type': 'Answer', text: txt }
      });
    });
    if (main.length) ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: main }, null, 2);
    else ld.textContent = '{}';
  }
})();
