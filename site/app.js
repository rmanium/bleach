// Scroll-scrubbed film: one continuous WebP frame sequence drawn to a canvas.
// The page alternates HOLD beats (rest on a junction frame, chapter text shows)
// and TRANSFORM beats (scrub one transition clip). See SHOTLIST.md.

// Every word of copy is in index.html (SEO). This file only reads the chapter
// articles and drives their opacity; accents come from each article's --c.
const chapterEls = [...document.querySelectorAll('.chapter')];
const CHAPTERS = chapterEls.map((el) => ({ accent: el.style.getPropertyValue('--c').trim() }));

const OPEN_VH = 110;
const HOLD_VH = 100;
const LAST_HOLD_VH = 150;
const TRANSFORM_VH = 250;

const $ = (id) => document.getElementById(id);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
};

// index.html starts in the stills layout (body.reduced) and an inline script drops it
// unless the visitor prefers reduced motion, so without JS every chapter stays readable.
const reduced = document.body.classList.contains('reduced');

markLongTitles();
if (!reduced) start();

// ---------------------------------------------------------------------------

async function start() {
  const manifest = await (await fetch('frames/manifest.json')).json();
  const count = manifest.count;
  const clips = manifest.clips;
  // Junction frames: hold i rests on the frame where clip i-1 ends / clip i starts.
  // (Clamped so a partial build with fewer clips still loads.)
  const holdFrame = CHAPTERS.map((_, i) => (i === 0 ? 0 : clips[Math.min(i, clips.length) - 1].end));

  // Timeline of beats, in vh of scroll.
  const beats = [{ type: 'open', vh: OPEN_VH }];
  CHAPTERS.forEach((_, i) => {
    beats.push({ type: 'hold', ch: i, vh: i === CHAPTERS.length - 1 ? LAST_HOLD_VH : HOLD_VH });
    if (i < clips.length) beats.push({ type: 'transform', clip: i, vh: TRANSFORM_VH });
  });
  let acc = 0;
  for (const b of beats) { b.from = acc; acc += b.vh; b.to = acc; }
  const totalVh = acc;

  const film = $('film');
  film.style.height = `${totalVh + 100}vh`;

  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const dim = $('dim');
  const open = $('open');
  const scrim = $('scrim');
  const rail = $('rail');
  const railCount = $('rail-count');
  const railFill = $('rail-fill');

  // ---------- frame loading (nearest-first, all frames kept) ----------
  let set = pickSet();
  let images = new Array(count);
  let requested = new Uint8Array(count);
  let inflight = 0;
  let loadedCount = 0;
  let wanted = 0;
  const MAX_INFLIGHT = 6;

  function pickSet() {
    return innerWidth / innerHeight < 0.8 ? 'm' : 'd';
  }
  const src = (i) => `frames/${set}/${String(i + 1).padStart(4, '0')}.webp`;

  function nextToLoad() {
    for (let d = 0; d < count; d++) {
      for (const i of [wanted + d, wanted - d]) {
        if (i >= 0 && i < count && !requested[i]) return i;
      }
    }
    return -1;
  }

  function pump() {
    while (inflight < MAX_INFLIGHT) {
      const i = nextToLoad();
      if (i === -1) return;
      requested[i] = 1;
      inflight++;
      const img = new Image();
      img.decoding = 'async';
      const mySet = set;
      // Count a frame as ready on load; decode() is only a head start, since
      // browsers can defer it indefinitely for background tabs.
      img.onload = () => {
        if (mySet !== set) return;
        images[i] = img;
        loadedCount++;
        inflight--;
        dirty = true;
        img.decode?.().catch(() => {});
        pump();
      };
      img.onerror = () => {
        if (mySet !== set) return;
        requested[i] = 0;
        inflight--;
        setTimeout(pump, 500);
      };
      img.src = src(i);
    }
  }

  function nearestLoaded(i) {
    for (let d = 0; d < 40; d++) {
      if (images[i - d]) return i - d;
      if (images[i + d]) return i + d;
    }
    return -1;
  }

  // ---------- canvas sizing ----------
  let cw = 0, ch = 0;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cw = Math.round(innerWidth * dpr);
    ch = Math.round(canvas.getBoundingClientRect().height * dpr);
    canvas.width = cw;
    canvas.height = ch;
    const nextSet = pickSet();
    if (nextSet !== set) {
      set = nextSet;
      images = new Array(count);
      requested = new Uint8Array(count);
      inflight = 0;
      loadedCount = 0;
      pump();
    }
    lastDrawn = -1;
    dirty = true;
  }

  // ---------- scroll → state ----------
  let shown = 0;
  let lastDrawn = -1;
  let lastZoom = 0;
  let dirty = true;

  function scrollVh() {
    const top = film.getBoundingClientRect().top;
    return clamp01(-top / (film.offsetHeight - innerHeight)) * totalVh;
  }

  function beatAt(v) {
    for (const b of beats) if (v < b.to) return b;
    return beats[beats.length - 1];
  }

  function update() {
    const v = scrollVh();
    const b = beatAt(v);
    const p = clamp01((v - b.from) / b.vh);

    let target = 0;
    let zoom = 1;
    let accent = CHAPTERS[0].accent;
    let activeCh = 0;

    if (b.type === 'open') {
      target = 0;
    } else if (b.type === 'hold') {
      target = holdFrame[b.ch];
      zoom = 1 + 0.025 * Math.sin(Math.PI * p);
      accent = CHAPTERS[b.ch].accent;
      activeCh = b.ch;
    } else {
      const c = clips[b.clip];
      target = c.start + p * (c.end - c.start);
      accent = mixHex(CHAPTERS[b.clip].accent, CHAPTERS[b.clip + 1].accent, smooth(0.35, 0.75, p));
      activeCh = p < 0.6 ? b.clip : b.clip + 1;
    }

    // cold open overlay
    const openP = b.type === 'open' ? p : 1;
    open.style.opacity = String(1 - smooth(0.05, 0.75, openP));
    open.style.transform = `translateY(${-openP * 6}vh)`;
    dim.style.opacity = String(0.92 * (1 - smooth(0.2, 1, openP)));

    // chapter text
    let scrimOpacity = 0;
    chapterEls.forEach((el, i) => {
      let o = 0;
      if (b.type === 'hold' && b.ch === i) {
        const last = i === CHAPTERS.length - 1;
        o = smooth(0, 0.28, p) * (last ? 1 : 1 - smooth(0.78, 1, p));
        el.style.setProperty('--rise', `${(1 - smooth(0, 0.28, p)) * 24}px`);
      }
      el.style.opacity = String(o);
      el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
      if (o > scrimOpacity) {
        scrimOpacity = o;
        scrim.classList.toggle('right', el.classList.contains('right'));
      }
    });
    scrim.style.opacity = String(scrimOpacity);

    // accent + rail
    document.documentElement.style.setProperty('--accent', accent);
    rail.classList.toggle('on', b.type !== 'open');
    railCount.textContent = `${String(activeCh + 1).padStart(2, '0')} / ${String(CHAPTERS.length).padStart(2, '0')}`;
    railFill.style.transform = `scaleY(${v / totalVh})`;

    return { target, zoom };
  }

  // ---------- render loop ----------
  function draw(i, zoom) {
    const img = images[i];
    if (!img) return false;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * zoom;
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    return true;
  }

  function frame() {
    const { target, zoom } = update();
    if (Math.abs(target - shown) > 60) shown = target; // big jump (e.g. outro links): don't scrub through it
    shown += (target - shown) * 0.22;
    if (Math.abs(target - shown) < 0.05) shown = target;
    wanted = Math.round(target);
    const idx = nearestLoaded(Math.round(shown));
    if (idx !== -1 && (idx !== lastDrawn || Math.abs(zoom - lastZoom) > 0.0005 || dirty)) {
      if (draw(idx, zoom)) { lastDrawn = idx; lastZoom = zoom; dirty = false; }
    }
    pump();
    requestAnimationFrame(frame);
  }

  // ---------- boot ----------
  addEventListener('resize', resize);
  resize();
  wanted = Math.round(update().target);
  pump();

  const loader = $('loader');
  const pct = $('loader-pct');
  const READY = Math.min(36, count);
  await new Promise((resolve) => {
    const tick = () => {
      wanted = Math.round(update().target);
      const hi = Math.min(count, Math.max(0, wanted - READY / 2) + READY);
      const lo = Math.max(0, hi - READY);
      const near = images.slice(lo, hi).filter(Boolean).length;
      pct.textContent = `${Math.round((near / (hi - lo)) * 100)}%`;
      if (near >= hi - lo || loadedCount >= count) resolve();
      else setTimeout(tick, 80);
    };
    tick();
  });
  loader.classList.add('done');
  requestAnimationFrame(frame);

  // outro links jump to their chapter's hold beat
  document.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const hold = beats.find((b) => b.type === 'hold' && b.ch === Number(btn.dataset.jump));
      const v = hold.from + hold.vh * 0.45;
      const y = film.offsetTop + (v / totalVh) * (film.offsetHeight - innerHeight);
      scrollTo({ top: y, behavior: 'instant' });
    });
  });
}

// Titles with one very long word ("Hollowfication") get a smaller size.
function markLongTitles() {
  for (const el of chapterEls) {
    const words = el.querySelector('h2').textContent.split(/\s+/);
    el.classList.toggle('long', Math.max(...words.map((w) => w.length)) > 10);
  }
}
