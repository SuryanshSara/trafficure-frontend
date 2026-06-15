/* =====================================================================
   GOOGLE MAPS SECTION — Delhi halftone panel
   Dot-matrix render of central Delhi (texture in js/gm-map-data.js).
   Routes auto-ignite: a wave of green / amber / red spreads from a
   random seed along connected road dots, holds, fades — no hover needed.
   Pauses off-screen. Static single frame under prefers-reduced-motion.
   ===================================================================== */
(() => {
  const wrap   = document.querySelector('.gm-map');
  const cv     = document.getElementById('gmCanvas');
  if (!wrap || !cv || typeof GM_MAP === 'undefined') return;
  const ctx     = cv.getContext('2d');
  const chipsEl = wrap.querySelector('.gm-chips');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DPR  = Math.min(devicePixelRatio || 1, 1.5);
  const CELL = 9 * DPR;
  const REST = { r: 46, g: 143, b: 95 };               /* --leaf */
  const CLS = [
    { col: [61, 220, 104], css: '#3DDC68', v: [34, 52], w: .45 }, /* clear */
    { col: [255, 197, 61], css: '#FFC53D', v: [13, 24], w: .30 }, /* slow  */
    { col: [255, 65, 54],  css: '#FF4136', v: [4, 11],  w: .25 }, /* jam   */
  ];
  const SPREAD = 34;                  /* wavefront, cells / second   */
  const ATT = .2, HOLD = 1.8, REL = .7, MAXD = 24;
  const LIFE = MAXD / SPREAD + ATT + HOLD + REL;

  let img = null, cols = 0, rows = 0, S = null, road = null, w = 0, h = 0;
  let igs = [], lastSpawn = 0, inView = false, raf = 0;

  const pickCls = () => {
    let r = Math.random(), a = 0;
    for (const c of CLS) { a += c.w; if (r <= a) return c; }
    return CLS[0];
  };

  /* ---------- grid (re)build from texture ---------- */
  function resize() {
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (!cw || !ch || !img) return;
    w = Math.round(cw * DPR); h = Math.round(ch * DPR);
    cv.width = w; cv.height = h;
    cols = Math.ceil(w / CELL); rows = Math.ceil(h / CELL);
    const oc = document.createElement('canvas');
    oc.width = cols; oc.height = rows;
    oc.getContext('2d').drawImage(img, 0, 0, cols, rows);
    const d = oc.getContext('2d').getImageData(0, 0, cols, rows).data;
    S = new Float32Array(cols * rows);
    road = new Uint8Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) {
      const s = d[i * 4] / 255;
      S[i] = s; road[i] = s > 0.55 ? 1 : 0;   /* majors only — ignition follows corridors */
    }
    igs = []; chipsEl.innerHTML = '';
    if (reduced) staticFrame();
  }

  /* ---------- BFS distance along road dots ---------- */
  function bfs(seed) {
    const dist = new Int16Array(cols * rows).fill(-1);
    let q = [seed]; dist[seed] = 0;
    while (q.length) {
      const nq = [];
      for (const i of q) {
        const d = dist[i]; if (d >= MAXD) continue;
        const x = i % cols, y = (i / cols) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (road[j] && dist[j] < 0) { dist[j] = d + 1; nq.push(j); }
        }
      }
      q = nq;
    }
    return dist;
  }

  /* ---------- ignition + speed chip ---------- */
  function spawn(now, opts) {
    let seed = -1;
    for (let t = 0; t < 80; t++) {
      const i = (Math.random() * cols * rows) | 0;
      if (road[i] && S[i] > 0.72) { seed = i; break; }
    }
    if (seed < 0) return;
    const cls = pickCls();
    const ig = { seed, cls, t0: now, dist: bfs(seed), chip: null };
    if (opts && opts.preset) ig.t0 = now - (MAXD / SPREAD + ATT) * 1000;
    igs.push(ig);

    const x = (seed % cols) * CELL / DPR, y = ((seed / cols) | 0) * CELL / DPR;
    const el = document.createElement('span');
    el.className = 'gm-chip-live';
    el.textContent = ((cls.v[0] + Math.random() * (cls.v[1] - cls.v[0])) | 0) + ' KM/H';
    el.style.color = cls.css;
    el.style.left = Math.max(60, Math.min(wrap.clientWidth - 60, x)) + 'px';
    el.style.top  = Math.max(48, Math.min(wrap.clientHeight - 26, y)) + 'px';
    chipsEl.appendChild(el);
    if (opts && opts.preset) el.classList.add('on');
    else requestAnimationFrame(() => el.classList.add('on'));
    ig.chip = el;
  }

  /* ---------- draw one frame ---------- */
  function draw(now) {
    const t = now / 1000;
    ctx.clearRect(0, 0, w, h);

    igs = igs.filter(ig => {
      const age = (now - ig.t0) / 1000;
      if (age > LIFE) {
        if (ig.chip) { const c = ig.chip; c.classList.remove('on'); setTimeout(() => c.remove(), 500); ig.chip = null; }
        return false;
      }
      if (ig.chip && age > LIFE - REL) ig.chip.classList.remove('on');
      return true;
    });

    for (let y = 0; y < rows; y++) {
      const py = y * CELL + CELL / 2;
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x, s = S[i];
        const px = x * CELL + CELL / 2;

        if (s < 0.06) {            /* ambient dot field over empty city */
          ctx.fillStyle = 'rgba(184,245,210,0.07)';
          ctx.fillRect(px - .7 * DPR, py - .7 * DPR, 1.4 * DPR, 1.4 * DPR);
          continue;
        }

        const br = .5 + .5 * Math.sin(t * 1.9 + i * .61);   /* breathing */
        let r = (0.8 + 2.6 * s) * DPR + br * .5 * DPR * s;
        let cr = REST.r, cg = REST.g, cb = REST.b, al = .30 + .66 * s;

        let e = 0, col = null;
        for (const ig of igs) {
          const d = ig.dist[i]; if (d < 0) continue;
          const lt = (now - ig.t0) / 1000 - d / SPREAD;
          if (lt <= 0) continue;
          let ev;
          if (lt < ATT) ev = lt / ATT;
          else if (lt < ATT + HOLD) ev = 1;
          else ev = Math.max(0, 1 - (lt - ATT - HOLD) / REL);
          if (ev > e) { e = ev; col = ig.cls.col; }
        }
        if (e > 0) {
          cr += (col[0] - cr) * e; cg += (col[1] - cg) * e; cb += (col[2] - cb) * e;
          al += (1 - al) * e;
          r += 1.4 * DPR * e * s;
        }

        ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${al})`;
        ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill();
      }
    }
  }

  function frame(now) {
    raf = 0;
    if (now - lastSpawn > 900 + Math.random() * 800 && igs.length < 3) {
      lastSpawn = now; spawn(now);
    }
    draw(now);
    if (inView && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function staticFrame() {            /* reduced motion: one frozen frame */
    const now = performance.now();
    for (let k = 0; k < 3; k++) spawn(now, { preset: true });
    draw(now);
    igs = [];                         /* keep chips, stop tracking */
  }

  function play()  { if (!raf && !reduced) raf = requestAnimationFrame(frame); }
  function pause() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  /* ---------- boot ---------- */
  img = new Image();
  img.onload = () => {
    resize();
    if (reduced) return;
    const io = new IntersectionObserver(es => {
      inView = es.some(e => e.isIntersecting);
      inView ? play() : pause();
    }, { threshold: 0.05 });
    io.observe(wrap);
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () =>
      document.hidden ? pause() : (inView && play()));
  };
  img.src = GM_MAP;
})();
