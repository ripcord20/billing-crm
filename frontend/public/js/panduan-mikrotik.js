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
      if (btn.id === 'mkCopyPeer') return copy(textOf('mkPhonePeer'), btn);
      if (btn.id === 'mkCopyConf') return copy(textOf('mkPhoneConf'), btn);
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

  const qrBtn = document.getElementById('mkPhoneQrBtn');
  if (qrBtn && window.App && App.api) {
    qrBtn.addEventListener('click', async () => {
      const err = document.getElementById('mkPhoneQrErr');
      const box = document.getElementById('mkPhoneQrBox');
      if (err) { err.style.display = 'none'; err.textContent = ''; }
      qrBtn.disabled = true;
      const old = qrBtn.textContent;
      qrBtn.textContent = 'Membuat…';
      try {
        const r = await App.api('/nas/wireguard/phone-qr', {
          method: 'POST',
          body: JSON.stringify({ label: 'HP tes' })
        });
        if (!r || !r.success) {
          if (err) {
            err.style.display = '';
            err.textContent = (r && r.message) || 'Gagal membuat QR';
          }
          return;
        }
        const d = r.data || {};
        const img = document.getElementById('mkPhoneQrImg');
        if (img) img.src = d.qr_data_url || '';
        const peer = document.getElementById('mkPhonePeer');
        if (peer) peer.textContent = d.server_peer_block || '';
        const conf = document.getElementById('mkPhoneConf');
        if (conf) conf.textContent = d.client_config || '';
        const warn = document.getElementById('mkPhoneQrWarn');
        if (warn) {
          if (d.endpoint_is_private) {
            warn.style.display = '';
            warn.textContent = 'Endpoint masih IP LAN. HP di data seluler tidak handshake sampai concentrator Fiberix punya IP/DNS publik.';
          } else {
            warn.style.display = 'none';
          }
        }
        if (box) box.style.display = '';
      } finally {
        qrBtn.disabled = false;
        qrBtn.textContent = old;
      }
    });
  }
})();
