// Renders index.html: the one-scroll homepage.
//
//   node scripts/build-home.mjs        (npm run build runs it after build.mjs)
//
// Scenes, top to bottom:
//   1. hero     slogan builds in on load; dissolves on the first scroll
//   2. library  every piece scattered small over a white field; it drifts
//               against the cursor, a hovered piece grows, a click opens it
//   3. services
//   4. contact  form -> FormSubmit -> the Boss's inbox
//
// The markup is complete without JavaScript: the scatter is plain CSS and every scene is a normal section. assets/js/home.js adds the hero's
// pinned dissolve and the field's drift and hover only when it can run them well.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = process.env.SITE_URL || 'https://www.majordistributionco.com';
const NOINDEX = process.env.NOINDEX === '1';
// FormSubmit alias: the random string FormSubmit emails after the inbox is
// activated. It stands in for the address, so the inbox never appears in the
// page source. Override with FORM_ID=... for a one-off build.
const FORM_ID = process.env.FORM_ID || JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8')).formsubmit_id;
const FORM_ACTION = `https://formsubmit.co/${FORM_ID}`;
const FORM_AJAX = `https://formsubmit.co/ajax/${FORM_ID}`;

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const { items } = read('media/manifest.json');
const { projects } = read('content/projects.json');
const client = Object.fromEntries(projects.map((p) => [p.id, p.client]));
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

// ---------- the library ----------
// content/home.json: one flat list. The homepage shows it as a scattered
// field of small pieces on white (after the Simon Wheatley portfolio the Boss
// pinned, 2026-10-22): the field drifts against the cursor, a hovered piece
// grows and plays, a click opens the viewer. Positions are worked out here,
// seeded, so every build is identical and the layout needs no JavaScript:
// a jittered grid sized to the piece count, one layout for landscape
// screens and one for portrait, each exactly one screen. Each piece uses its vertical homepage
// crop (manifest `board`) when it has one.
// `native`: pieces shown in their own shape and file, never the vertical
// board crop (Boss, 2026-10-27: the Cafe Wang film plays at 16:9).
const { pieces: ids, native: nativeIds = [] } = read('content/home.json');
const native = new Set(nativeIds);
const byId = Object.fromEntries(items.map((m) => [m.id, m]));

// Guard the brief: marketing media only, vertical only, no two consecutive
// pieces from one client, nothing held, missing or repeated.
const problems = [];
const resolved = ids.map((id, k) => {
  const m = byId[id];
  if (!m) { problems.push(`unknown id ${id}`); return null; }
  if (m.hold) problems.push(`${id} is held`);
  if (m.kind === 'design' || m.kind === 'web') problems.push(`${id} is ${m.kind} (homepage is marketing media only)`);
  const v = native.has(id) ? m : m.board || m;
  if (!native.has(id) && !(v.height > v.width)) problems.push(`${id} is not vertical (${v.width}x${v.height})`);
  if (k && byId[ids[k - 1]]?.project === m.project) problems.push(`${ids[k - 1]} and ${id} are both ${m.project}`);
  return { m, v };
});
if (new Set(ids).size !== ids.length) problems.push('a piece appears twice');
if (problems.length) { console.error('content/home.json:\n  ' + problems.join('\n  ')); process.exit(1); }

// Seeded PRNG (mulberry32): same build, same scatter.
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// ---------- the 3D field ----------
// Boss, 2026-10-27: the pin's "3D space" — pieces on different levels, dense
// like the reference, nothing covered when you hover. Every piece sits at its
// own depth z in a real CSS 3D space (home.css: perspective PERSP on the
// stage, translateZ(--z) per piece). Near pieces are larger; far ones small.
// The layout below is what the eye should see (no overlaps, spread evenly by
// best-candidate sampling); unproject() turns it into pre-perspective CSS so
// each piece still lands there at its depth. home.js tilts the space with the
// cursor (on touch screens it floats), so the levels slide past each other.
//
// Density: while the library is small, every homepage video lends two stills
// from its own footage (echo_frames.py -> <id>-e1/-e2.webp). They sit on the
// far levels, open the same video, and are hidden from assistive tech and
// skipped by the viewer, so the work is never counted twice.
const PERSP = 1200;
const Z_NEAR = 160, Z_FAR = -720;

const echoes = [];
resolved.forEach(({ m }, i) => {
  if (m.type !== 'video') return;
  for (const k of [1, 2]) {
    const src = m.src.replace(/\.mp4$/, `-e${k}.webp`);
    if (!existsSync(join(ROOT, src))) continue;
    // Stills match the piece's shape: native = the film's own, else the 4:5 crop.
    const v = resolved[i].v;
    const a = native.has(m.id) || m.width <= m.height ? m.height / m.width : 1.25;
    echoes.push({ m, v, of: i, thumb: src, a });
  }
});
const r0 = rng(2027);
// Depth: originals near-to-middle (a third of them on the near level), echoes far.
const order = resolved.map((_, i) => i).sort(() => r0() - 0.5);
const nodes = [
  ...resolved.map(({ m, v }, i) => {
    const rank = order.indexOf(i) / Math.max(1, resolved.length - 1); // 0..1
    const z = rank < 0.34 ? Z_NEAR - r0() * 90 : -60 - r0() * 330;
    return { m, v, of: i, echo: false, thumb: m.type === 'video' ? v.poster : v.thumb || v.src, a: v.height / v.width, z };
  }),
  ...echoes.map((e) => ({ ...e, echo: true, z: -430 - r0() * (-430 - Z_FAR) })),
];
// Seen size falls off with depth: near 1, far ~0.42. Landscape pieces are
// widened so they carry the same area as a 9:16-ish vertical one.
const depthScale = (z) => 0.42 + (0.58 * (z - Z_FAR)) / (Z_NEAR - Z_FAR);
const shapeScale = (a) => (a < 1 ? Math.sqrt(1.6 / a) : 1);
const sOf = (z) => PERSP / (PERSP - z);

// Lay out one field shape. Units: the field is W wide and H tall.
// `list`: the nodes to place (default all). `tc`: the title's centre.
// `flatY`: the camera's vertical origin follows the screen (phones, see
// PHONE below), so a piece is unprojected about its own height, not the
// field's centre. Returns one entry per node in `list`.
const layout = ({ W, H, inset, title, cover, seed, gap, list = nodes, tc = [W / 2, H / 2], flatY = false, gatherY = 50, zk = 1, slide = 0, ds = depthScale }) => {
  const [il, it, ir, ib] = inset;
  const free = (W - il - ir) * (H - it - ib) - title[0] * title[1];
  const tb = { x0: tc[0] - title[0] / 2, y0: tc[1] - title[1] / 2, x1: tc[0] + title[0] / 2, y1: tc[1] + title[1] / 2 };
  const want = cover * free;
  // Width of a near piece, solved so the pieces cover `cover` of the field.
  const areaPerBase2 = list.reduce((s, n) => s + (ds(n.z) * shapeScale(n.a)) ** 2 * n.a, 0);
  let base = Math.sqrt(want / areaPerBase2);
  const byBig = list.map((n, i) => i).sort((p, q) => ds(list[q].z) - ds(list[p].z));
  for (let attempt = 0; attempt < 40; attempt++, base *= 0.96) {
    const r = rng(seed + attempt);
    const placed = [];
    const out = new Array(list.length);
    let ok = true;
    for (const i of byBig) {
      const n = list[i];
      const w = base * ds(n.z) * shapeScale(n.a), h = w * n.a;
      let best = null, bestScore = -1;
      for (let c = 0; c < 400; c++) {
        const x = il + r() * (W - il - ir - w), y = it + r() * (H - it - ib - h);
        const R = { x0: x, y0: y, x1: x + w, y1: y + h, s: sOf(n.z * zk) };
        // `slide`: on phones the planes slide vertically against each other
        // as the page scrolls, by up to |s1 - s2| * slide; keep that clear too.
        const clear = (o) => {
          const gy = gap + (o.s ? Math.abs(R.s - o.s) * slide : 0);
          return R.x1 + gap <= o.x0 || o.x1 + gap <= R.x0 || R.y1 + gy <= o.y0 || o.y1 + gy <= R.y0;
        };
        if (!clear(tb) || !placed.every(clear)) continue;
        // Score: distance to the nearest neighbour (edge to edge), so the
        // field spreads evenly instead of clumping.
        let d = Infinity;
        for (const o of placed) {
          const dx = Math.max(o.x0 - R.x1, R.x0 - o.x1, 0), dy = Math.max(o.y0 - R.y1, R.y0 - o.y1, 0);
          d = Math.min(d, Math.hypot(dx, dy));
        }
        if (d > bestScore) { bestScore = d; best = R; }
      }
      if (!best) { ok = false; break; }
      placed.push(best);
      out[i] = best;
    }
    if (ok) {
      return out.map((R, i) => {
        const n = list[i], s = sOf(n.z * zk);
        const w = R.x1 - R.x0, h = R.y1 - R.y0, cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2;
        // To %, then unproject about the field's centre.
        const pw = (w / W) * 100, ph = (h / H) * 100, pcx = (cx / W) * 100, pcy = (cy / H) * 100;
        const ox = pcx < 33 ? 'left' : pcx > 67 ? 'right' : 'center';
        const oy = pcy < 33 ? 'top' : pcy > 67 ? 'bottom' : 'center';
        return {
          x: 50 + (pcx - pw / 2 - 50) / s, y: flatY ? pcy - ph / s / 2 : 50 + (pcy - ph / 2 - 50) / s, w: pw / s, s,
          o: `${ox} ${oy}`, fx: 50 - pcx, fy: (flatY ? gatherY : 50) - pcy,
        };
      });
    }
  }
  throw new Error('home field: could not place every piece');
};
// Landscape: ~1.75:1 under the header.
const LAND = layout({ W: 175, H: 100, inset: [9, 7, 9, 9], title: [44, 11], cover: 0.36, seed: 2026, gap: 1.3 });
// Phones (Boss, 2026-11-05: "media not showing, gaps in the gallery: put it
// all firmly on the 3D design"): a packed three-column masonry, each column on
// its own depth plane (left far, middle near, right between). home.js moves
// the camera's vertical origin with the screen, so the columns slide past
// each other as you scroll; inside a column every piece shares one depth, so
// none can drift into a neighbour or open a hole. Each column's spacing is
// solved so it starts flush under the title when the gallery arrives and ends
// flush on the bottom labels when it leaves. Units: screen-widths x100, so the
// layout is exact on every phone (home.css sizes the stage from the width).
// PH_M: the camera's height above the field's top at arrival (half a phone
// screen under the 77px header). Real pieces only: echoes would be too small
// to tap. With JS off (--q*), the columns lie flat in the same places.
const PH_COLS = [
  { x: 3, w: 28.5, z: -150 },
  { x: 34, w: 32, z: 60 },
  { x: 68.5, w: 28.5, z: -60 },
];
const PH_GAP = 2.5, PH_T = 27, PH_B = 13, PH_M = 86, PH_TITLE = 17;
const real = nodes.filter((n) => !n.echo);
const phCols = PH_COLS.map((c) => {
  const s = sOf(c.z);
  return { ...c, s, k: (2 * PH_M - PH_T - PH_B) / s };
});
// Field height a column needs for its pieces at the natural gap.
const needH = (c, list) =>
  list.reduce((t, n) => t + (c.w / c.s) * n.a, 0) + ((list.length - 1) * PH_GAP) / c.s + 2 * PH_M - c.k;
let phBest = null;
for (let seed = 0; seed < 4000; seed++) {
  const r = rng(5000 + seed);
  const order = real.map((n, i) => [r(), i]).sort((p, q) => p[0] - q[0]).map(([, i]) => i);
  const stacks = phCols.map(() => []);
  for (const i of order) {
    const n = real[i];
    // Shortest column first; never the same client twice in a row down a column.
    const byShort = phCols.map((c, j) => j).sort((p, q) => needH(phCols[p], stacks[p]) - needH(phCols[q], stacks[q]));
    const j = byShort.find((j) => stacks[j].at(-1)?.m.project !== n.m.project) ?? byShort[0];
    stacks[j].push(n);
  }
  const hs = stacks.map((st, j) => needH(phCols[j], st));
  const spread = Math.max(...hs) - Math.min(...hs);
  const clash = stacks.some((st) => st.some((n, k) => k && st[k - 1].m.project === n.m.project));
  if (!clash && (!phBest || spread < phBest.spread)) phBest = { spread, stacks, hs };
}
const PHONE_H = Math.ceil(Math.max(...phBest.hs) * 10) / 10;
const PORT = new Array(nodes.length).fill(null);
phBest.stacks.forEach((st, j) => {
  const c = phCols[j];
  // Spare height (columns are balanced to within a fraction of a piece) goes
  // into the gaps, so every column runs exactly top to bottom.
  const gl = PH_GAP / c.s + (PHONE_H - phBest.hs[j]) / Math.max(1, st.length - 1);
  const flatLen = st.reduce((t, n) => t + c.w * n.a, 0) + (st.length - 1) * PH_GAP;
  const f = Math.min(1, (PHONE_H - PH_T - PH_B) / flatLen);
  let y = PH_M + (PH_T - PH_M) / c.s, qy = PH_T;
  for (const n of st) {
    const w = c.w / c.s, h = w * n.a;
    PORT[nodes.indexOf(n)] = {
      x: 50 + (c.x - 50) / c.s, y: (y / PHONE_H) * 100, w, z: c.z,
      qx: c.x + (c.w * (1 - f)) / 2, qy: (qy / PHONE_H) * 100, qw: c.w * f,
      fx: 50 - (c.x + c.w / 2), fy: ((PH_TITLE - (y + h / 2)) / PHONE_H) * 100,
    };
    y += h + gl;
    qy += (c.w * n.a + PH_GAP) * f;
  }
});

const f2 = (n) => n.toFixed(2);
const piece = (n, i) => {
  const { m, v } = n;
  const L = LAND[i], P = PORT[i];
  // Near videos play on their own (home.js), muted, while the field is on screen.
  const auto = !n.echo && m.type === 'video' && n.z > 0;
  const style = `--z:${n.z.toFixed(0)}px;--x:${f2(L.x)}%;--y:${f2(L.y)}%;--w:${f2(L.w)}%;--o:${L.o};--fx:${f2(L.fx)};--fy:${f2(L.fy)};${P ? `--px:${f2(P.x)}%;--py:${f2(P.y)}%;--pw:${f2(P.w)}%;--pz:${P.z}px;--qx:${f2(P.qx)}%;--qy:${f2(P.qy)}%;--qw:${f2(P.qw)}%;--pfx:${f2(P.fx)};--pfy:${f2(P.fy)}` : '--pfx:0;--pfy:0'}`;
  const echo = n.echo ? ` echo" aria-hidden="true" tabindex="-1" data-of="${n.of}` : '';
  return `<a class="st${echo}" href="${v.src}" style="${style}"${auto ? ' data-auto="1"' : ''} data-type="${m.type}" data-src="${v.preview || v.src}"${v.preview ? ` data-full="${v.src}"` : ''} data-poster="${n.thumb}" data-w="${v.width}" data-h-px="${v.height}" data-title="${esc(m.title)}" data-client="${esc(client[m.project])}" data-caption="${esc(m.caption || '')}" data-credit="${esc(m.credit || '')}">
  <img src="${n.thumb}" width="480" height="${Math.round(480 * n.a)}" alt="${n.echo ? '' : `${esc(client[m.project])} — ${esc(m.title)}`}" ${i < 24 ? '' : 'fetchpriority="low" '}decoding="async">
</a>`;
};
const libHtml = nodes.map(piece).join('\n');
const total = ids.length;

// ---------- services ----------
const services = [
  { n: '01', name: 'Content creation', body: 'We shoot, edit and deliver content that stops the scroll: video ads, product photography, Reels and brand visuals.', tags: ['Video ads', 'Product photography', 'Reels & short-form', 'Brand visuals'] },
  { n: '02', name: 'Ad campaigns', body: 'Paid ads that work as hard as the content looks. We build the creative, target the right people and put every dollar where it pays.', tags: ['Meta ads', 'Google ads', 'Creative strategy', 'Retargeting'] },
  { n: '03', name: 'Websites', body: 'Fast, mobile-first sites built around your brand, so the people the ads bring in stay and buy.', tags: ['Custom design', 'Online stores', 'Lead capture', 'Care plans'] },
];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Major Distribution — Can't Buy What You Can't See</title>
<meta name="description" content="Major Distribution makes marketing media for local brands: video ads, product photography, Reels and the campaigns that put them in front of buyers.">
<link rel="canonical" href="${SITE_URL}">
${NOINDEX ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<meta property="og:type" content="website">
<meta property="og:title" content="Major Distribution — Can't Buy What You Can't See">
<meta property="og:description" content="Video ads, product photography and Reels for local brands.">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL}/assets/brand/og-default.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE_URL}/assets/brand/og-default.png">
<meta name="theme-color" content="#141414">
<link rel="icon" href="/assets/icon.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/Archivo-var-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/portfolio.css">
<link rel="stylesheet" href="/assets/css/home.css">
<script src="/assets/js/home-mark.js"></script>
<script src="/assets/js/home.js" defer></script>
${ld({ '@context': 'https://schema.org', '@type': 'LocalBusiness', name: 'Major Distribution', url: SITE_URL, slogan: "Can't buy what you can't see.", areaServed: 'California' })}
</head>
<body class="home">
<a class="skip" href="#main">Skip to content</a>
<header class="hbar" id="top">
  <a class="brand" href="/" aria-label="Major Distribution home"><img src="/assets/brand/md-wordmark.png" alt="Major Distribution logo" width="434" height="144"></a>
  <nav aria-label="Sections">
    <a href="#work">Work</a>
    <a href="#services">Services</a>
    <a class="btn btn-red btn-sm magnet" href="#contact">Get in touch</a>
  </nav>
</header>
<main id="main">

<section class="scene scene-hero" id="hero" aria-label="Introduction">
  <div class="pin">
    <h1 class="slogan" aria-label="Can't buy what you can't see.">
      <span class="ln" aria-hidden="true"><span>Can't buy</span></span>
      <span class="ln" aria-hidden="true"><span>what you</span></span>
      <span class="ln ln-red" aria-hidden="true"><span>can't see.</span></span>
    </h1>
    <p class="hero-sub mono">Major Distribution · marketing media for local brands</p>
    <p class="cue mono" aria-hidden="true"><span></span>Scroll</p>
  </div>
</section>

<section class="scene-lib" id="work" aria-labelledby="lib-h">
  <div class="stage" id="stage" style="--persp:${PERSP}px;--phone-h:${PHONE_H / 100}">
    <div class="lib" id="lib">
${libHtml}
    </div>
    <h2 class="sr-only" id="lib-h">The work</h2>
    <div class="lib-title" aria-hidden="true">
      <p id="lib-a">Major Distribution</p>
      <p id="lib-b">The work (©2026)</p>
    </div>
    <p class="lib-c lib-tl">©2026</p>
    <a class="lib-c lib-tr" href="/work">Index</a>
    <button type="button" class="lib-c lib-bl" id="lib-dark" aria-pressed="false" hidden>Dark mode</button>
    <p class="lib-c lib-bc" aria-hidden="true"><span class="hint-fine">Hover to look · click to open</span><span class="hint-touch">Tap to open</span></p>
    <a class="lib-c lib-br" href="#services">Services</a>
  </div>
</section>

<section class="scene-services" id="services" aria-labelledby="svc-h">
  <div class="svc-head rv">
    <p class="mono">What we do</p>
    <h2 id="svc-h">Made to be seen.</h2>
  </div>
  <ol class="svc">
${services.map((s, i) => `    <li class="svc-row rv" style="--d:${i * 90}ms">
      <span class="svc-n">${s.n}</span>
      <div><h3>${s.name}</h3><p>${s.body}</p></div>
      <ul class="svc-tags">${s.tags.map((t) => `<li>${t}</li>`).join('')}</ul>
    </li>`).join('\n')}
  </ol>
</section>

<section class="scene-contact" id="contact" aria-labelledby="contact-h">
  <div class="contact-in">
    <div class="contact-copy rv">
      <p class="mono">Let's work</p>
      <h2 id="contact-h">Let's make them<br>see you.</h2>
      <p>Tell us about the brand and what you need, and we'll get back to you.</p>
    </div>
    <form class="cform rv" id="cform" action="${FORM_ACTION}" method="POST" data-ajax="${FORM_AJAX}" style="--d:120ms" novalidate>
      <input type="hidden" name="_subject" value="New lead — majordistributionco.com">
      <input type="hidden" name="_template" value="table">
      <input type="hidden" name="_next" value="${SITE_URL}/?sent=1#contact">
      <div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="_honey" tabindex="-1" autocomplete="off"></label></div>
      <div class="f2">
        <label class="fld"><span>Your name</span><input name="name" autocomplete="name" required maxlength="120"></label>
        <label class="fld"><span>Business</span><input name="business" autocomplete="organization" maxlength="160"></label>
      </div>
      <div class="f2">
        <label class="fld"><span>Email</span><input type="email" name="email" autocomplete="email" required maxlength="200"></label>
        <label class="fld"><span>Phone <em>(optional)</em></span><input type="tel" name="phone" autocomplete="tel" maxlength="40"></label>
      </div>
      <label class="fld"><span>What do you need?</span>
        <select name="service" required>
          <option value="">Pick one</option>
          <option>Content creation (video ads + photography)</option>
          <option>Ad campaigns (Meta, Google)</option>
          <option>Website</option>
          <option>All of it</option>
        </select>
      </label>
      <label class="fld"><span>Tell us about the brand</span><textarea name="message" rows="4" required maxlength="4000"></textarea></label>
      <button class="btn btn-red magnet" type="submit">Send it</button>
      <p class="form-status" id="formStatus" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>

</main>
<footer class="hfoot">
  <span class="brand"><img src="/assets/brand/md-wordmark.png" alt="Major Distribution logo" width="434" height="144"></span>
  <span class="mono">© 2026 Major Distribution</span>
</footer>
<dialog class="lb" id="lb" aria-label="Viewer">
  <div class="lb-stage" id="lb-stage"></div>
  <div class="lb-info">
    <p class="mono" id="lb-n"></p>
    <h2 id="lb-title"></h2>
    <p id="lb-client" class="lb-client"></p>
    <p id="lb-caption"></p>
    <p id="lb-credit" class="mono lb-credit"></p>
  </div>
  <button type="button" class="lb-btn lb-close" id="lb-close" aria-label="Close">×</button>
  <button type="button" class="lb-btn lb-prev" id="lb-prev" aria-label="Previous">‹</button>
  <button type="button" class="lb-btn lb-next" id="lb-next" aria-label="Next">›</button>
</dialog>
</body>
</html>
`;

writeFileSync(join(ROOT, 'index.html'), html);
console.log(`built index.html — library of ${total} pieces, scattered, form -> ${FORM_ID}`);
if (FORM_ID === 'PENDING-ACTIVATION') console.warn('WARNING: FORM_ID not set — the contact form will not deliver. See CLAUDE.md "Contact form".');
