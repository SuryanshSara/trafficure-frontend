/* =====================================================================
   ORB NAV — floating globe that blooms into a radial disk
   Items are laid out along an arc on the left half of an ink disk
   anchored to the right screen edge. Esc / veil / item click closes.
   ===================================================================== */
(() => {
  const orb  = document.getElementById('navOrb');
  const wrap = document.getElementById('navDisk');
  if (!orb || !wrap) return;
  const disk  = wrap.querySelector('.nav-disk');
  const links = [...wrap.querySelectorAll('.nav-ring a')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const A0 = 242, A1 = 118;          /* arc: top -> bottom (180 = left) */

  function layout() {
    /* disk radius: fits the viewport height and width */
    const R = Math.min(450, innerHeight * 0.46, innerWidth * 0.62);
    disk.style.width = disk.style.height = (R * 2) + 'px';
    disk.style.setProperty('--R', R + 'px');
    const r = R - Math.max(74, R * 0.21);          /* item ring radius */
    links.forEach((a, i) => {
      const deg = A0 + (A1 - A0) * (links.length === 1 ? .5 : i / (links.length - 1));
      const rad = deg * Math.PI / 180;
      a.style.left = (R + Math.cos(rad) * r) + 'px';
      a.style.top  = (R + Math.sin(rad) * r) + 'px';
    });
  }

  let open = false;
  function setOpen(v) {
    open = v;
    orb.setAttribute('aria-expanded', String(v));
    if (v) {
      layout();
      wrap.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() =>
        wrap.classList.add('open')));
      document.body.classList.add('nav-open');
      (links[0] || disk).focus({ preventScroll: true });
    } else {
      wrap.classList.remove('open');
      document.body.classList.remove('nav-open');
      const done = () => { wrap.hidden = true; };
      reduced ? done() : setTimeout(done, 480);
      orb.focus({ preventScroll: true });
    }
  }

  orb.addEventListener('click', () => setOpen(!open));
  wrap.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) setOpen(false);
  });
  links.forEach(a => a.addEventListener('click', () => setOpen(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && open) setOpen(false); });
  addEventListener('resize', () => { if (open) layout(); });
})();
