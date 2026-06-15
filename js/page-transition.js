/* =====================================================================
   page-transition.js — smooth cross-fade between pages.
   On internal link click: the page fades down to its own ink background,
   then we navigate. The incoming page starts covered (a synchronous
   shield prevents any flash) and fades up into view. Because the fade
   colour matches the site background (--ink #07291B), it reads as a
   clean dissolve rather than a flash to another colour.
   Respects reduced-motion; falls back to plain navigation if unsupported.
   Drop in with: <script src="js/page-transition.js"></script>
   ===================================================================== */
(function () {
  var REDUCED  = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INK      = '#07291B';   /* must match html,body background */
  var OUT_MS   = 300;         /* fade-out (leaving) duration      */
  var IN_MS    = 420;         /* fade-in (arriving) duration       */
  var EASE      = 'cubic-bezier(.4,0,.2,1)';

  /* ---------- synchronous anti-flash shield (entry only) ---------- */
  var ENTERING = false;
  try { ENTERING = sessionStorage.getItem('pt') === '1'; } catch (_) {}

  /* ---------- the fade overlay ---------- */
  var ov = document.createElement('div');
  ov.setAttribute('aria-hidden', 'true');
  ov.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:' + INK + ';' +
    'opacity:0;pointer-events:none;will-change:opacity';
  function attach() { if (!ov.parentNode) (document.body || document.documentElement).appendChild(ov); }
  /* if we're arriving via a transition, cover instantly before first paint */
  if (ENTERING && !REDUCED) { ov.style.opacity = '1'; attach(); }

  /* ---------- phases ---------- */
  function cover(done) {
    if (REDUCED) { done(); return; }
    attach();
    ov.style.transition = 'none';
    ov.style.opacity = '0';
    void ov.offsetWidth;
    ov.style.transition = 'opacity ' + OUT_MS + 'ms ' + EASE;
    requestAnimationFrame(function () {
      ov.style.opacity = '1';
      setTimeout(done, OUT_MS + 20);
    });
  }
  function reveal() {
    attach();
    if (REDUCED) { ov.style.opacity = '0'; return; }
    ov.style.transition = 'none';
    ov.style.opacity = '1';
    void ov.offsetWidth;
    ov.style.transition = 'opacity ' + IN_MS + 'ms ' + EASE;
    requestAnimationFrame(function () { ov.style.opacity = '0'; });
  }

  /* ---------- link interception ---------- */
  function dest(a) {
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return null;
    var url; try { url = new URL(a.href, location.href); } catch (e) { return null; }
    if (url.origin !== location.origin) return null;
    if (url.href === location.href) return null;
    if (url.pathname === location.pathname && url.hash) return null;
    return url.href;
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a') : null;
    var to = dest(a);
    if (!to) return;
    e.preventDefault();
    try { sessionStorage.setItem('pt', '1'); } catch (_) {}
    cover(function () { location.href = to; });
  });

  /* ---------- reveal on entry ---------- */
  function maybeReveal() {
    if (!ENTERING) return;
    try { sessionStorage.removeItem('pt'); } catch (_) {}
    reveal();
  }
  if (document.readyState !== 'loading') maybeReveal();
  else document.addEventListener('DOMContentLoaded', maybeReveal);
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) { try { ENTERING = sessionStorage.getItem('pt') === '1'; } catch (_) {} if (ENTERING) { attach(); maybeReveal(); } }
  });
})();
