(function () {
  function textOf(id) {
    const el = document.getElementById(id);
    return el ? el.textContent : '';
  }

  function copy(text, btn) {
    const done = () => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = 'Tersalin';
      setTimeout(() => { btn.textContent = old; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
    } else {
      fallback(text, done);
    }
  }

  function fallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
    done();
  }

  document.querySelectorAll('.mk-tab[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-tab');
      document.querySelectorAll('.mk-tab[data-tab]').forEach((t) => t.classList.toggle('on', t === tab));
      document.querySelectorAll('[data-pane]').forEach((pane) => {
        pane.style.display = pane.getAttribute('data-pane') === name ? '' : 'none';
      });
    });
  });

  document.querySelectorAll('.mk-tab[data-verify]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-verify');
      document.querySelectorAll('.mk-tab[data-verify]').forEach((t) => t.classList.toggle('on', t === tab));
      document.querySelectorAll('[data-vfy]').forEach((pane) => {
        pane.style.display = pane.getAttribute('data-vfy') === name ? '' : 'none';
      });
    });
  });

  document.querySelectorAll('.mk-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.getAttribute('data-copy');
      const map = {
        v7: 'mkScriptV7',
        v6: 'mkScriptV6',
        verify7: 'mkVerify7',
        verify6: 'mkVerify6',
        verify: 'mkVerify7'
      };
      copy(textOf(map[which] || 'mkScriptV7'), btn);
    });
  });
})();
