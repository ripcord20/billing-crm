/**
 * Pull-to-refresh Fiberix — app mobile (Capacitor/WebView) dan tampilan HP.
 *
 * WAJIB preventDefault pada touchmove saat tarik di puncak .wrap.
 * Tanpa itu Android WebView memakan gesture sebagai scroll (overscroll contain)
 * jadi indikator tidak muncul dan refresh tidak jalan.
 *
 * Halaman boleh set window.mobileRefresh = function(){ ... return Promise }
 */
(function () {
  if (window.__flynPtr && window.__flynPtrVer >= 2) return;
  window.__flynPtr = true;
  window.__flynPtrVer = 2;

  var THRESHOLD = 64;
  var MAX_PULL = 120;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function isMobileShell() {
    return !!(document.querySelector('.wrap') && document.querySelector('.mdr, .mtop, .bottomnav'));
  }

  function hasOwnPtr() {
    if (document.getElementById('ptr') && !document.getElementById('flynPtr')) return true;
    var path = (location.pathname || '').replace(/\/+$/, '') || '/';
    return path === '/hotspot';
  }

  function shouldRun() {
    if (hasOwnPtr()) return false;
    if (isMobileShell()) return true;
    var touch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    return touch && window.innerWidth <= 768;
  }

  function scroller() {
    var wrap = document.querySelector('.wrap');
    return wrap || null;
  }

  function scrollTop() {
    var el = scroller();
    if (el) return el.scrollTop || 0;
    return window.scrollY || window.pageYOffset || 0;
  }

  function atTop() {
    return scrollTop() <= 2;
  }

  function overlayOpen() {
    if (document.body.classList.contains('sheet-open')) return true;
    return !!(
      document.querySelector('.mdr.open, #mdrPanel.open, .mdr-overlay.open') ||
      document.querySelector('.msearch.open, #mSearch.open, .mnotif.open') ||
      document.querySelector('.dm-sheet.open, .sheet.open, .add-sheet.open, .add-overlay.open') ||
      document.querySelector('.pn-sheet.open, .pd-sheet.open, .modal-overlay[style*="flex"], #userModal.open')
    );
  }

  function ignoreTouch(target) {
    if (!target || !target.closest) return false;
    if (target.closest('input, textarea, select')) return true;
    if (target.closest('.leaflet-container')) return true;
    if (target.closest('.bottomnav, .bottom-nav')) return true;
    if (target.closest('.mdr.open, .msearch.open, .mnotif.open')) return true;
    return false;
  }

  function injectCss() {
    if (document.getElementById('flynPtrCss')) return;
    var st = document.createElement('style');
    st.id = 'flynPtrCss';
    st.textContent =
      '.flyn-ptr{position:fixed;top:env(safe-area-inset-top,0px);left:50%;transform:translate(-50%,-56px);' +
      'z-index:4000;pointer-events:none;display:flex;align-items:center;gap:8px;' +
      'background:#fff;border:1px solid #e8edf5;border-radius:999px;padding:8px 14px;' +
      'box-shadow:0 8px 22px rgba(15,27,52,.14);font-family:inherit;font-size:12px;' +
      'font-weight:700;color:#334155;opacity:0;transition:transform .18s ease,opacity .18s ease;' +
      'max-width:calc(100% - 32px);}' +
      '.flyn-ptr.show{opacity:1;}' +
      '.flyn-ptr svg{width:16px;height:16px;flex-shrink:0;color:#0ea5e9;}' +
      '.flyn-ptr.spin svg{animation:flynPtrSpin .75s linear infinite;}' +
      '@keyframes flynPtrSpin{to{transform:rotate(360deg);}}';
    document.head.appendChild(st);
  }

  function indicator() {
    var el = document.getElementById('flynPtr');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'flynPtr';
    el.className = 'flyn-ptr';
    el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8"/>' +
        '<path d="M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/>' +
      '</svg><span class="flyn-ptr-txt">Tarik untuk refresh</span>';
    document.body.appendChild(el);
    return el;
  }

  function setBar(el, pull, readyPull, spinning) {
    var y = Math.min(pull, MAX_PULL) - 46;
    el.style.transform = 'translate(-50%,' + y + 'px)';
    el.classList.toggle('show', pull > 8 || spinning);
    el.classList.toggle('spin', !!(readyPull || spinning));
    var txt = el.querySelector('.flyn-ptr-txt');
    if (txt) {
      txt.textContent = spinning ? 'Memuat ulang…' : (readyPull ? 'Lepas untuk refresh' : 'Tarik untuk refresh');
    }
  }

  function resetBar(el) {
    el.classList.remove('show', 'spin');
    el.style.transform = 'translate(-50%,-56px)';
  }

  function haptic() {
    try {
      if (typeof window.haptic === 'function') window.haptic(12);
      else if (navigator.vibrate) navigator.vibrate(12);
    } catch (_) {}
  }

  function doRefresh() {
    try {
      if (typeof window.mobileRefresh === 'function') {
        return Promise.resolve(window.mobileRefresh());
      }
    } catch (_) {}
    location.reload();
    return new Promise(function () {});
  }

  ready(function () {
    if (!shouldRun()) return;
    injectCss();
    var ptr = indicator();
    var wrap = scroller();
    var startY = 0;
    var startX = 0;
    var dist = 0;
    var pulling = false;
    var tracking = false;
    var refreshing = false;
    var armed = false;
    var locked = false;
    var wrapOverflow = '';
    var wrapOverscroll = '';

    function lockScroll() {
      if (locked || !wrap) return;
      locked = true;
      wrapOverflow = wrap.style.overflowY;
      wrapOverscroll = wrap.style.overscrollBehaviorY;
      wrap.style.overflowY = 'hidden';
      wrap.style.overscrollBehaviorY = 'none';
    }

    function unlockScroll() {
      if (!locked || !wrap) return;
      locked = false;
      wrap.style.overflowY = wrapOverflow;
      wrap.style.overscrollBehaviorY = wrapOverscroll;
      wrap.style.transform = '';
      wrap.style.transition = '';
    }

    function rubber(pull) {
      if (!wrap) return;
      wrap.style.transition = 'none';
      wrap.style.transform = 'translateY(' + Math.round(pull * 0.38) + 'px)';
    }

    function onStart(e) {
      if (refreshing || overlayOpen()) { tracking = pulling = false; return; }
      if (!e.touches || !e.touches.length) return;
      if (ignoreTouch(e.target)) { tracking = pulling = false; return; }
      if (!atTop()) { tracking = pulling = false; return; }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      dist = 0;
      tracking = true;
      pulling = false;
      armed = false;
    }

    function onMove(e) {
      if (!tracking || refreshing) return;
      if (!e.touches || !e.touches.length) return;
      var y = e.touches[0].clientY;
      var x = e.touches[0].clientX;
      var dy = y - startY;
      var dx = x - startX;

      if (!pulling) {
        if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy)) {
          tracking = false;
          return;
        }
        if (dy > 6 && atTop()) {
          pulling = true;
          lockScroll();
        } else if (dy < -8) {
          tracking = false;
          return;
        } else {
          return;
        }
      }

      if (!atTop() && dy <= 0) {
        pulling = tracking = false;
        unlockScroll();
        resetBar(ptr);
        return;
      }

      dist = Math.max(0, dy);
      if (dist <= 0) {
        resetBar(ptr);
        rubber(0);
        return;
      }

      if (e.cancelable) e.preventDefault();
      var pull = Math.min(dist * 0.5, MAX_PULL);
      var readyPull = dist >= THRESHOLD;
      if (readyPull && !armed) {
        armed = true;
        haptic();
      }
      if (!readyPull) armed = false;
      rubber(pull);
      setBar(ptr, pull, readyPull, false);
    }

    function finish() {
      if (refreshing) return;
      var should = pulling && dist >= THRESHOLD;
      tracking = false;
      pulling = false;
      if (should) {
        refreshing = true;
        setBar(ptr, 72, true, true);
        rubber(36);
        haptic();
        Promise.resolve(doRefresh()).finally(function () {
          setTimeout(function () {
            if (wrap) wrap.style.transition = 'transform .22s ease';
            unlockScroll();
            resetBar(ptr);
            refreshing = false;
          }, 280);
        });
      } else {
        if (wrap) wrap.style.transition = 'transform .18s ease';
        unlockScroll();
        resetBar(ptr);
      }
      dist = 0;
    }

    function onEnd() {
      if (!tracking && !pulling) return;
      finish();
    }

    function onCancel() {
      tracking = pulling = false;
      if (!refreshing) {
        unlockScroll();
        resetBar(ptr);
      }
      dist = 0;
    }

    var optsPassive = { passive: true, capture: true };
    var optsMove = { passive: false, capture: true };
    document.addEventListener('touchstart', onStart, optsPassive);
    document.addEventListener('touchmove', onMove, optsMove);
    document.addEventListener('touchend', onEnd, optsPassive);
    document.addEventListener('touchcancel', onCancel, optsPassive);
    if (wrap) {
      wrap.addEventListener('touchstart', onStart, optsPassive);
      wrap.addEventListener('touchmove', onMove, optsMove);
      wrap.addEventListener('touchend', onEnd, optsPassive);
      wrap.addEventListener('touchcancel', onCancel, optsPassive);
    }
  });
})();
