/**
 * Pull-to-refresh untuk app mobile Fiberix (shell /mobile dan tampilan HP).
 * Tarik ke bawah di puncak halaman → muat ulang data.
 *
 * Halaman boleh set window.mobileRefresh = function(){ ... return Promise }
 * supaya refresh tanpa reload penuh. Default: location.reload().
 */
(function () {
  if (window.__flynPtr) return;
  window.__flynPtr = true;

  var THRESHOLD = 72;
  var MAX_PULL = 108;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function isMobileShell() {
    return !!(document.querySelector('.wrap') && document.querySelector('.mdr, .mtop, .bottomnav'));
  }

  function hasOwnPtr() {
    if (document.getElementById('ptr')) return true;
    var path = (location.pathname || '').replace(/\/+$/, '') || '/';
    if (path === '/hotspot') return true;
    return false;
  }

  function shouldRun() {
    if (hasOwnPtr()) return false;
    if (isMobileShell()) return true;
    var touch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    return touch && window.innerWidth <= 768;
  }

  function scroller() {
    var wrap = document.querySelector('.wrap');
    if (wrap) {
      try {
        var oy = window.getComputedStyle(wrap).overflowY;
        if (oy === 'auto' || oy === 'scroll') return wrap;
      } catch (_) {}
    }
    return null;
  }

  function atTop() {
    var el = scroller();
    if (el) return (el.scrollTop || 0) <= 1;
    return (window.scrollY || window.pageYOffset || 0) <= 1;
  }

  function overlayOpen() {
    if (document.body.classList.contains('sheet-open')) return true;
    var open = document.querySelector(
      '.mdr.open, #mdrPanel.open, .mdr-overlay.open, .msearch.open, #mSearch.open,' +
      '.mnotif.open, .dm-sheet.open, .sheet.open, .add-sheet.open, .add-overlay.open,' +
      '.pn-sheet.open, .pd-sheet.open, .modal-overlay[style*="flex"], #userModal.open'
    );
    return !!open;
  }

  function ignoreTouch(target) {
    if (!target || !target.closest) return false;
    return !!target.closest(
      'input, textarea, select, .bottomnav, .bottom-nav, .mdr, .mdr-overlay,' +
      ' .msearch, .mnotif, .dm-sheet, .sheet, .add-sheet, .pn-sheet, .pd-sheet,' +
      ' .fab, .leaflet-container, .modal-overlay, #userModal'
    );
  }

  function injectCss() {
    if (document.getElementById('flynPtrCss')) return;
    var st = document.createElement('style');
    st.id = 'flynPtrCss';
    st.textContent =
      '.flyn-ptr{position:fixed;top:env(safe-area-inset-top,0px);left:50%;transform:translate(-50%,-56px);' +
      'z-index:2800;pointer-events:none;display:flex;align-items:center;gap:8px;' +
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

  function setBar(el, pull, ready, spinning) {
    var y = Math.min(pull, MAX_PULL) - 50;
    el.style.transform = 'translate(-50%,' + y + 'px)';
    el.classList.toggle('show', pull > 12 || spinning);
    el.classList.toggle('spin', !!(ready || spinning));
    var txt = el.querySelector('.flyn-ptr-txt');
    if (txt) {
      txt.textContent = spinning ? 'Memuat ulang…' : (ready ? 'Lepas untuk refresh' : 'Tarik untuk refresh');
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
    return new Promise(function () { /* page unloads */ });
  }

  ready(function () {
    if (!shouldRun()) return;
    injectCss();
    var ptr = indicator();
    var startY = 0;
    var dist = 0;
    var pulling = false;
    var refreshing = false;
    var armed = false;

    document.addEventListener('touchstart', function (e) {
      if (refreshing || overlayOpen() || !atTop() || ignoreTouch(e.target)) {
        pulling = false;
        return;
      }
      startY = e.touches[0].clientY;
      dist = 0;
      pulling = true;
      armed = false;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!pulling || refreshing) return;
      if (!atTop()) {
        pulling = false;
        resetBar(ptr);
        return;
      }
      dist = e.touches[0].clientY - startY;
      if (dist <= 0) {
        resetBar(ptr);
        return;
      }
      var pull = Math.min(dist * 0.46, MAX_PULL);
      var readyPull = dist >= THRESHOLD;
      if (readyPull && !armed) {
        armed = true;
        haptic();
      }
      if (!readyPull) armed = false;
      setBar(ptr, pull, readyPull, false);
    }, { passive: true });

    document.addEventListener('touchend', function () {
      if (!pulling || refreshing) {
        pulling = false;
        return;
      }
      pulling = false;
      if (dist >= THRESHOLD) {
        refreshing = true;
        setBar(ptr, 70, true, true);
        haptic();
        Promise.resolve(doRefresh()).finally(function () {
          setTimeout(function () {
            resetBar(ptr);
            refreshing = false;
          }, 450);
        });
      } else {
        resetBar(ptr);
      }
      dist = 0;
    }, { passive: true });

    document.addEventListener('touchcancel', function () {
      pulling = false;
      if (!refreshing) resetBar(ptr);
    }, { passive: true });
  });
})();
