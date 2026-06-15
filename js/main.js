/* =====================================================================
   ROUTE-AWARE HALFTONE HERO
   The embedded PNG packs three layers per pixel:
     R = luminance        -> base dot size (the map)
     G = traffic class    -> 85 green / 170 yellow / 255 red
     B = route ID         -> connected road segment (per class)
   Hovering a route lights every dot sharing its ID in the route's
   live congestion color, spreading outward from the cursor.
   ===================================================================== */
(() => {
  const canvas = document.getElementById('halftone');
  const gl = canvas.getContext('webgl', { antialias:false, alpha:false });
  if (!gl) { canvas.style.display = 'none'; return; }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR  = Math.min(window.devicePixelRatio || 1, 1.5);
  const CELL = 9 * DPR;

  const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16) / 255);
  const COL_BG     = hex('#07291B');
  const COL_DOT    = hex('#2E8F5F');
  const COL_DOT_HI = hex('#B8F5D2');
  /* live congestion palette — the one place duotone is allowed to break */
  const TRAFFIC = {
    85:  { col: hex('#3DDC68'), css:'#3DDC68', label:'FLOWING'    },
    170: { col: hex('#FFC53D'), css:'#FFC53D', label:'SLOW'       },
    255: { col: hex('#FF4136'), css:'#FF4136', label:'CONGESTED'  },
  };


  /* ---------------- texture + CPU-side picking data ----------------- */
  const mapImg = new Image();
  let mapReady = false, pick = null, pickW = 0, pickH = 0;
  mapImg.onload = () => {
    mapReady = true;
    const pc = document.createElement('canvas');
    pickW = pc.width = mapImg.width; pickH = pc.height = mapImg.height;
    const px = pc.getContext('2d', { willReadFrequently:true });
    px.drawImage(mapImg, 0, 0);
    pick = px.getImageData(0, 0, pickW, pickH).data;
    uploadMap();
  };
  mapImg.src = window.MAP_SRC;   // from js/map-data.js

  // cover-fit transform (device px) — must match CPU picking
  let fit = { scale:1, offX:0, offY:0 };
  function buildMapTexture(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    if (!mapReady) return c;
    const scale = Math.max(w / mapImg.width, h / mapImg.height);
    const dw = mapImg.width * scale, dh = mapImg.height * scale;
    const offX = (w - dw) / 2, offY = (h - dh) / 2;
    fit = { scale, offX, offY };
    x.imageSmoothingEnabled = false;        // never blend route IDs
    x.drawImage(mapImg, offX, offY, dw, dh);
    return c;
  }

  /* ========================= WebGL pipeline ========================= */
  const VERT = `
    attribute vec2 p;
    void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const FRAG = `
    precision highp float;
    uniform vec2  u_res;
    uniform float u_time;
    uniform vec2  u_mouse;
    uniform float u_active;
    uniform float u_cell;
    uniform sampler2D u_map;
    uniform vec3  u_bg, u_dot, u_dotHi;
    uniform float u_routeClass;   // 0..1 (class/255), 0 = none
    uniform float u_routeId;      // 0..1 (id/255)
    uniform float u_spread;       // px radius of the ignition wave
    uniform float u_routeMix;     // 0..1 fade of the route highlight
    uniform vec3  u_routeColor;   // live congestion color

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i),              hash(i + vec2(1, 0)), u.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++){ v += a * vnoise(p); p *= 2.03; a *= 0.5; }
      return v;
    }

    void main(){
      vec2 frag   = gl_FragCoord.xy;
      vec2 cellId = floor(frag / u_cell);
      vec2 center = (cellId + 0.5) * u_cell;

      /* cursor: pin-art swell + swarm push */
      float md        = distance(center, u_mouse);
      float reach     = u_res.x * 0.16;
      float influence = smoothstep(reach, 0.0, md);
      float swell     = influence * influence * u_active;

      vec2 dir  = md > 0.001 ? (center - u_mouse) / md : vec2(0.0);
      vec2 disp = dir * swell * u_cell * 0.5;
      disp += (vec2(vnoise(cellId * 3.1 + u_time * 1.4),
                    vnoise(cellId * 5.7 - u_time * 1.2)) - 0.5)
              * swell * u_cell * 0.6;

      /* idle: drifting noise blobs */
      float blob    = fbm(cellId * 0.045 + vec2(u_time * 0.07, -u_time * 0.05));
      float idleAmp = mix(0.62, 0.20, u_active);
      float ambient = (blob - 0.42) * idleAmp;

      /* map layers */
      vec3  m   = texture2D(u_map, center / u_res).rgb;
      float b   = m.r;              // dot size
      float cls = m.g;              // traffic class
      float id  = m.b;              // route id

      /* route match: same class AND same id, hovered route active */
      float onRoute = step(0.001, u_routeClass)
                    * step(abs(cls - u_routeClass), 1.5/255.0)
                    * step(abs(id  - u_routeId),   1.5/255.0);
      /* ignition wave expanding from the cursor along the route */
      float wave  = 1.0 - smoothstep(u_spread - 160.0, u_spread, md);
      float lit   = onRoute * wave * u_routeMix;
      /* congested routes throb gently */
      float pulse = 1.0 + 0.10 * sin(u_time * 3.2 - md * 0.012) * lit;

      /* per-dot breathing: every dot oscillates at its own phase + rate,
         so the field shimmers instead of sitting still */
      float ph      = hash(cellId) * 6.2831;
      float rate    = mix(3.0, 6.5, hash(cellId + 17.3));
      float breathe = 1.0 + 0.32 * sin(u_time * rate + ph);

      float radius = u_cell * 0.5 *
                     clamp((0.10 + b * 0.92 + ambient + swell * 1.05
                            + lit * 0.22) * pulse * breathe, 0.0, 1.3);

      float d = distance(frag, center + disp);
      float a = 1.0 - smoothstep(radius - 0.9, radius + 0.9, d);

      float heat  = clamp(swell * 1.3 + max(0.0, blob - 0.58) * idleAmp * 3.0, 0.0, 1.0);
      vec3 dotCol = mix(u_dot, u_dotHi, heat);
      dotCol      = mix(dotCol, u_routeColor, lit);     // route takes over

      gl_FragColor = vec4(mix(u_bg, dotCol, a), 1.0);
    }`;

  function shader(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog); gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = n => gl.getUniformLocation(prog, n);
  const u = { res:U('u_res'), time:U('u_time'), mouse:U('u_mouse'),
              active:U('u_active'), cell:U('u_cell'), map:U('u_map'),
              bg:U('u_bg'), dot:U('u_dot'), hi:U('u_dotHi'),
              rCls:U('u_routeClass'), rId:U('u_routeId'),
              spread:U('u_spread'), rMix:U('u_routeMix'), rCol:U('u_routeColor') };

  gl.uniform3fv(u.bg,  COL_BG);
  gl.uniform3fv(u.dot, COL_DOT);
  gl.uniform3fv(u.hi,  COL_DOT_HI);
  gl.uniform1f(u.cell, CELL);
  gl.uniform1i(u.map, 0);

  const tex = gl.createTexture();
  function uploadMap(){
    const mapCanvas = buildMapTexture(canvas.width, canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, mapCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);  // IDs must not blend
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function resize(){
    canvas.width  = Math.round(innerWidth  * DPR);
    canvas.height = Math.round(innerHeight * DPR);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.res, canvas.width, canvas.height);
    uploadMap();
  }
  addEventListener('resize', resize);
  resize();

  /* ------------------------ route picking -------------------------- */
  const statusDot  = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const route = { cls:0, id:0, mix:0, targetMix:0, spreadStart:0, color:[0,0,0] };

  function pickRoute(clientX, clientY){
    if (!pick) return null;
    // screen (CSS px, y-down) -> image px
    const ix = Math.round((clientX * DPR - fit.offX) / fit.scale);
    const iy = Math.round((clientY * DPR - fit.offY) / fit.scale);
    const R = 9;                                   // search radius (image px)
    let best = null, bestD = 1e9;
    for (let dy = -R; dy <= R; dy++){
      const y = iy + dy; if (y < 0 || y >= pickH) continue;
      for (let dx = -R; dx <= R; dx++){
        const x = ix + dx; if (x < 0 || x >= pickW) continue;
        const i = (y * pickW + x) * 4;
        const id = pick[i + 2];
        if (id === 0) continue;
        const d = dx*dx + dy*dy;
        if (d < bestD){ bestD = d; best = { cls: pick[i + 1], id }; }
      }
    }
    return best;
  }

  /* ------------------------- interaction --------------------------- */
  const mouse = { x:-9999, y:-9999, tx:-9999, ty:-9999 };
  let active = 0, targetActive = 0, lastMove = -1e9;

  function setPointer(cx, cy){
    mouse.tx = cx * DPR;
    mouse.ty = canvas.height - cy * DPR;
    targetActive = 1;
    lastMove = performance.now();

    const hit = pickRoute(cx, cy);
    if (hit && TRAFFIC[hit.cls]) {
      if (hit.cls !== route.cls || hit.id !== route.id) {
        route.cls = hit.cls; route.id = hit.id;
        route.spreadStart = performance.now();
        route.color = TRAFFIC[hit.cls].col;
        statusDot.style.background = TRAFFIC[hit.cls].css;
        statusText.textContent = 'ROUTE ' + String(hit.id).padStart(2,'0') +
                                 ' — ' + TRAFFIC[hit.cls].label;
      }
      route.targetMix = 1;
    } else {
      route.targetMix = 0;
    }
  }
  addEventListener('pointermove', e => setPointer(e.clientX, e.clientY));
  addEventListener('pointerdown', e => setPointer(e.clientX, e.clientY));
  addEventListener('pointerleave', () => { targetActive = 0; route.targetMix = 0; });

  /* --------------------------- render loop ------------------------- */
  const t0 = performance.now();
  function frame(now){
    if (now - lastMove > 1200) { targetActive = 0; route.targetMix = 0; }
    active    += (targetActive - active) * 0.06;
    route.mix += (route.targetMix - route.mix) * 0.10;
    mouse.x   += (mouse.tx - mouse.x) * 0.12;
    mouse.y   += (mouse.ty - mouse.y) * 0.12;

    if (route.mix < 0.01 && route.targetMix === 0) {
      statusDot.style.background = 'var(--pulse)';
      statusText.textContent = 'HOVER A ROUTE — LIVE NETWORK';
      route.cls = 0; route.id = 0;
    }

    const spread = (now - route.spreadStart) * 2.4 * DPR;   // px, ~2400px/s

    gl.uniform1f(u.time, reducedMotion ? 0 : (now - t0) / 1000);
    gl.uniform2f(u.mouse, mouse.x, mouse.y);
    gl.uniform1f(u.active, reducedMotion ? 0 : active);
    gl.uniform1f(u.rCls, route.cls / 255);
    gl.uniform1f(u.rId,  route.id  / 255);
    gl.uniform1f(u.spread, reducedMotion ? 1e5 : spread);
    gl.uniform1f(u.rMix, route.mix);
    gl.uniform3fv(u.rCol, route.color);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
