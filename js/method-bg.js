/* =====================================================================
   ROAD-PRINT BACKGROUNDS + PROBE TRAILS — all paper sections
   Every light section gets a faint halftone print of the road network
   (texture in js/method-map-data.js) with a mirrored crop per section,
   plus live "probe" dots that travel the roads, fade after ~8s, and
   respawn. Each section animates only while on screen; static prints
   only under prefers-reduced-motion.
   ===================================================================== */
(() => {
  if (typeof METHOD_MAP === 'undefined') return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SDPR = Math.min(devicePixelRatio || 1, 1.5);
  const LDPR = 1;
  const CELL = 11 * SDPR;

  const PRINTS = [
    { sel: '.s-method',   fx: false, fy: false },
    { sel: '.s-gmaps',    fx: false, fy: true  },
    { sel: '.s-features', fx: true,  fy: false },
    { sel: '.s-compare',  fx: true,  fy: true  },
  ];

  const COLS = [
    { c: '46,143,95',  w: .70 },
    { c: '224,168,34', w: .18 },
    { c: '226,74,63',  w: .12 },
  ];
  const N = 6;                       /* walkers per section          */
  const LIFE = 8, FIN = .5, FOUT = 1.3;
  const SPEED = 60;                  /* texture px / second          */
  const PROBE = 4, DOTGAP = 7;
  const FADE = 0.065;                /* trail fade per frame         */

  let tw = 0, th = 0, mask = null;
  let prints = [], raf = 0, lastT = 0;

  const mAt = (x, y) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= tw || y >= th) return 0;
    return mask[y * tw + x] / 255;
  };

  function pickCol() {
    let r = Math.random(), a = 0;
    for (const c of COLS) { a += c.w; if (r <= a) return c.c; }
    return COLS[0].c;
  }

  /* ---------- one print panel ---------- */
  function makePrint(cfg) {
    const sec = document.querySelector(cfg.sel);
    if (!sec) return null;
    const bg = document.createElement('div');
    bg.className = 'print-bg';
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = '<canvas class="pb-static"></canvas><canvas class="pb-live"></canvas>';
    sec.prepend(bg);
    const p = {
      sec, cfg,
      sCv: bg.querySelector('.pb-static'),
      lCv: bg.querySelector('.pb-live'),
      cw: 0, ch: 0, scale: 1, ox: 0, oy: 0,
      walkers: [], inView: false,
    };
    p.sCtx = p.sCv.getContext('2d');
    p.lCtx = p.lCv.getContext('2d');
    /* mirrored texture lookup so trails align with the static print */
    p.samp = (x, y) => mAt(cfg.fx ? tw - 1 - x : x, cfg.fy ? th - 1 - y : y);
    return p;
  }

  function drawStatic(p) {
    const { sCtx, sCv } = p;
    sCtx.clearRect(0, 0, sCv.width, sCv.height);
    const cols = Math.ceil(sCv.width / CELL), rows = Math.ceil(sCv.height / CELL);
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2;
        const s = p.samp((px / SDPR - p.ox) / p.scale, (py / SDPR - p.oy) / p.scale);
        if (s < 0.18) continue;
        sCtx.fillStyle = `rgba(7,41,27,${(.045 + .075 * s).toFixed(3)})`;
        sCtx.beginPath();
        sCtx.arc(px, py, (.8 + 1.7 * s) * SDPR, 0, 6.2832);
        sCtx.fill();
      }
    }
  }

  function resizePrint(p) {
    p.cw = p.sec.clientWidth; p.ch = p.sec.clientHeight;
    if (!p.cw || !p.ch) return;
    p.sCv.width = Math.round(p.cw * SDPR); p.sCv.height = Math.round(p.ch * SDPR);
    p.lCv.width = Math.round(p.cw * LDPR); p.lCv.height = Math.round(p.ch * LDPR);
    p.scale = Math.max(p.cw / tw, p.ch / th);
    p.ox = (p.cw - tw * p.scale) / 2; p.oy = (p.ch - th * p.scale) / 2;
    drawStatic(p);
  }

  /* ---------- probe walkers ---------- */
  function spawnWalker(p, w) {
    for (let t = 0; t < 200; t++) {
      const x = Math.random() * tw, y = Math.random() * th;
      if (p.samp(x, y) > 0.55) {
        let best = -1, ba = 0;
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * 6.2832;
          const v = p.samp(x + Math.cos(a) * PROBE, y + Math.sin(a) * PROBE);
          if (v > best) { best = v; ba = a; }
        }
        if (best < 0.4) continue;
        w.x = x; w.y = y; w.a = ba;
        w.t0 = performance.now() / 1000 + Math.random() * .8;
        w.col = pickCol();
        w.acc = 0;
        return;
      }
    }
  }

  function step(p, w, dt, now) {
    const age = now - w.t0;
    if (age < 0) return;
    if (age > LIFE) { spawnWalker(p, w); return; }
    let dist = SPEED * dt;
    while (dist > 0) {
      const stepLen = Math.min(dist, 2);
      let best = -1, ba = w.a;
      for (const da of [0, .35, -.35, .8, -.8, 1.3, -1.3]) {
        const a = w.a + da;
        const v = p.samp(w.x + Math.cos(a) * PROBE, w.y + Math.sin(a) * PROBE)
                  - Math.abs(da) * 0.18;
        if (v > best) { best = v; ba = a; }
      }
      if (best < 0.25) { w.t0 = now - (LIFE - FOUT); break; }
      w.a = ba;
      w.x += Math.cos(w.a) * stepLen;
      w.y += Math.sin(w.a) * stepLen;
      dist -= stepLen;

      w.acc += stepLen * p.scale;
      if (w.acc >= DOTGAP) {
        w.acc = 0;
        let e = 1;
        if (age < FIN) e = age / FIN;
        else if (age > LIFE - FOUT) e = (LIFE - age) / FOUT;
        const px = p.ox + w.x * p.scale, py = p.oy + w.y * p.scale;
        p.lCtx.fillStyle = `rgba(${w.col},${(.7 * e).toFixed(3)})`;
        p.lCtx.beginPath();
        p.lCtx.arc(px * LDPR, py * LDPR, 2.6 * LDPR, 0, 6.2832);
        p.lCtx.fill();
      }
    }
  }

  function anyInView() { return prints.some(p => p.inView); }

  function frame(nowMs) {
    raf = 0;
    const now = nowMs / 1000;
    const dt = Math.min(now - lastT, .05); lastT = now;
    for (const p of prints) {
      if (!p.inView) continue;
      p.lCtx.globalCompositeOperation = 'destination-out';
      p.lCtx.fillStyle = `rgba(0,0,0,${FADE})`;
      p.lCtx.fillRect(0, 0, p.lCv.width, p.lCv.height);
      p.lCtx.globalCompositeOperation = 'source-over';
      for (const w of p.walkers) step(p, w, dt, now);
    }
    if (anyInView() && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function play()  { if (!raf && !reduced) { lastT = performance.now() / 1000; raf = requestAnimationFrame(frame); } }
  function pause() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  /* ---------- boot ---------- */
  const img = new Image();
  img.onload = () => {
    tw = img.width; th = img.height;
    const oc = document.createElement('canvas');
    oc.width = tw; oc.height = th;
    oc.getContext('2d').drawImage(img, 0, 0);
    const d = oc.getContext('2d').getImageData(0, 0, tw, th).data;
    mask = new Uint8Array(tw * th);
    for (let i = 0; i < tw * th; i++) mask[i] = d[i * 4];

    prints = PRINTS.map(makePrint).filter(Boolean);
    prints.forEach(resizePrint);
    addEventListener('resize', () => prints.forEach(resizePrint));
    if (reduced) return;

    prints.forEach(p => {
      p.walkers = Array.from({ length: N }, () => {
        const w = {}; spawnWalker(p, w); return w;
      });
    });
    const io = new IntersectionObserver(es => {
      for (const e of es) {
        const p = prints.find(q => q.sec === e.target);
        if (p) p.inView = e.isIntersecting;
      }
      anyInView() ? play() : pause();
    }, { threshold: 0.02 });
    prints.forEach(p => io.observe(p.sec));
    document.addEventListener('visibilitychange', () =>
      document.hidden ? pause() : (anyInView() && play()));
  };
  img.src = METHOD_MAP;
})();
