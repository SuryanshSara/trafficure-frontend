/* =====================================================================
   SCROLL SECTIONS
   1. reveal-on-scroll (fade/lift)
   2. typed statement (caret, ~2.4s)
   3. scroll-scrubbed: stair pour-down, split headline slide,
      method cards scatter -> settle into a line (+ ambient float)
   4. single-open services accordion
   All motion is skipped under prefers-reduced-motion.
   ===================================================================== */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vh = () => innerHeight;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = p => p * p * (3 - 2 * p);                 // smoothstep
  const remap = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

  if (!reduced) document.documentElement.classList.add('anim');

  /* ---------------- 1 · reveal ---------------- */
  const items = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }, { threshold: 0.18 });
    items.forEach(el => io.observe(el));
  }

  /* ---------------- 2 · typed statement ---------------- */
  const stmt = document.querySelector('.statement');
  if (stmt && !reduced) {
    const ghost = stmt.querySelector('.ghost');
    const live  = stmt.querySelector('.live');
    const full  = ghost.textContent.replace(/\s+/g, ' ').trim();
    ghost.textContent = full;            // normalize so live wraps identically
    stmt.classList.add('typing');

    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      const DUR = 2400;
      let t0 = null;
      const tick = t => {
        if (t0 === null) t0 = t;
        const p = clamp((t - t0) / DUR, 0, 1);
        live.textContent = full.slice(0, Math.round(p * full.length));
        if (p < 1) requestAnimationFrame(tick);
        else stmt.classList.add('done');
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.45 });
    io.observe(stmt);
  }

  /* ---------------- 3 · scroll scrub ---------------- */
  const scrubs = [];

  // stair: ink pours down out of the statement block, step by step
  const band = document.querySelector('.step-band');
  if (band) {
    const sB = band.querySelector('.sB');
    const sC = band.querySelector('.sC');
    scrubs.push(() => {
      const r = band.getBoundingClientRect();
      const p = clamp((vh() - r.top) / (vh() * 0.85), 0, 1);
      sB.style.transform = `scaleY(${smooth(remap(p, 0.05, 0.55))})`;
      sC.style.transform = `scaleY(${smooth(remap(p, 0.18, 0.85))})`;
    });
  }

  // split headline: halves slide in from opposite sides
  document.querySelectorAll('[data-slide]').forEach(el => {
    const dir = +el.dataset.slide;
    scrubs.push(() => {
      const r = el.getBoundingClientRect();
      const e = smooth(clamp((vh() * 0.96 - r.top) / (vh() * 0.42), 0, 1));
      el.style.transform = `translateX(${dir * (1 - e) * 9}vw)`;
      el.style.opacity = e;
    });
  });

  // method cards: scattered + tilted, settle into a straight line
  document.querySelectorAll('.card').forEach(card => {
    const rot = +card.dataset.rot || 0;
    const x   = +card.dataset.x   || 0;          // vw
    scrubs.push(() => {
      const r = card.getBoundingClientRect();
      const e = smooth(clamp((vh() * 0.94 - r.top) / (vh() * 0.5), 0, 1));
      card.style.transform =
        `translateX(${x * (1 - e)}vw) rotate(${rot * (1 - e)}deg)`;
      card.style.opacity = Math.min(1, 0.1 + 1.15 * e);
    });
  });

  if (!reduced && scrubs.length) {
    let ticking = false;
    const run = () => { scrubs.forEach(f => f()); ticking = false; };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(run); }
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    run();
  }

  /* ---------------- 4 · stat counters (google maps section) ---------------- */
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    const show = (el, v) => el.textContent = Math.round(v).toLocaleString('en-US');
    if (reduced || !('IntersectionObserver' in window)) {
      counters.forEach(el => show(el, +el.dataset.count));
    } else {
      const io = new IntersectionObserver(es => {
        for (const e of es) if (e.isIntersecting) {
          io.unobserve(e.target);
          const el = e.target, target = +el.dataset.count;
          const dur = +el.dataset.dur || 1100;
          let t0 = null;
          const tick = t => {
            if (t0 === null) t0 = t;
            const p = clamp((t - t0) / dur, 0, 1);
            show(el, smooth(p) * target);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      }, { threshold: 0.6 });
      counters.forEach(el => io.observe(el));
    }
  }

  /* ---------------- 5 · feature cards: tap to flip on touch ---------------- */
  if (!matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.feature').forEach(f =>
      f.addEventListener('click', () => f.classList.toggle('flipped')));
  }
})();
