// Renders the static pages that draw on the shared media library.
//
//   node scripts/build.mjs
//
// Inputs:  media/manifest.json   (built by ~/.claude/major-distributions/portfolio/build_media.py)
//          content/projects.json (project copy)
// Outputs: resume.html, work.html, sitemap.xml, robots.txt. (index.html is
//          scripts/build-home.mjs.)
//
// Everything is pre-rendered so both pages read fully with JavaScript off;
// assets/js/portfolio.js only adds filters, the lightbox and motion.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = process.env.SITE_URL || 'https://www.majordistributionco.com';
const NOINDEX = process.env.NOINDEX === '1';
// The business inbox is suspended: every contact action goes to the homepage
// form, which delivers to the Boss's inbox without printing an address.
const CONTACT_URL = '/#contact';
const LINKEDIN = 'https://www.linkedin.com/in/major-hurley';
// Boss, 2026-10-27: resume off for now. false = no resume.html, no links, /resume redirects (vercel.json).
const SHOW_RESUME = false;
const UPDATED = '2026-10-27'; // bump when page content changes; feeds sitemap lastmod

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const { items } = read('media/manifest.json');
const { projects, systems } = read('content/projects.json');
const media = items.filter((m) => !m.hold);
const byProject = (id) => media.filter((m) => m.project === id);
const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
// content/work.json (Boss's pick): which pieces /work shows. No file = every piece.
const workPick = existsSync(join(ROOT, 'content/work.json')) ? read('content/work.json').pieces : null;
const workMedia = workPick ? media.filter((m) => workPick.includes(m.id)) : media;
const allProjects = projects;

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON-LD lives in a <script> data block; escape "<" so text can never close it.
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const pad = (n) => String(n).padStart(2, '0');
const fmtDur = (s) => (s ? `0:${pad(Math.round(s))}` : '');
const KIND_LABEL = { ad: 'Ad', video: 'Video', photo: 'Photo', web: 'Website', design: 'Design' };

// ---------- shared chrome ----------
function head({ title, description, path, ogImage, extraLd = [] }) {
  const url = SITE_URL + path;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
${NOINDEX ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE_URL}${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE_URL}${ogImage}">
<meta name="theme-color" content="#141414">
<link rel="icon" href="/assets/icon.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/Archivo-var-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/portfolio.css">
<script src="/assets/js/mark.js"></script>
<script src="/assets/js/portfolio.js" defer></script>
${[
    ld({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Major Distribution',
      url: SITE_URL,
      areaServed: 'California',
    }),
    ...extraLd,
  ].join('\n')}
</head>`;
}

function topbar(active) {
  const link = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="topbar" id="top">
  <a class="brand" href="/" aria-label="Major Distribution home"><img src="/assets/brand/md-wordmark.png" alt="Major Distribution logo" width="434" height="144"></a>
  <nav aria-label="Main">
    ${SHOW_RESUME ? link('/resume', 'Resume', 'resume') : ''}
    ${link('/work', 'Work', 'work')}
    <a class="btn btn-red btn-sm magnet" href="/#contact">Start a project</a>
  </nav>
</header>`;
}

const footer = `<footer class="foot">
  <a class="brand" href="/"><img src="/assets/brand/md-wordmark.png" alt="Major Distribution logo" width="434" height="144"></a>
  <ul>
    <li><a href="/">Home</a></li>
    ${SHOW_RESUME ? '<li><a href="/resume">Resume</a></li>' : ''}
    <li><a href="/work">Work</a></li>
    <li><a href="${CONTACT_URL}">Contact</a></li>
  </ul>
  <p class="mono">© 2026 Major Distribution</p>
</footer>`;

// ---------- media rendering ----------
function mediaEl(m, { autoplay = false, sizes = '(max-width: 700px) 92vw, 33vw', eager = false } = {}) {
  const ratio = `aspect-ratio:${m.width}/${m.height}`;
  if (m.type === 'video') {
    return `<video class="mv" ${autoplay ? 'data-autoplay muted loop playsinline' : 'muted playsinline'} preload="none" poster="${m.poster}" width="${m.width}" height="${m.height}" style="${ratio}" aria-label="${esc(m.title)}"><source src="${m.src}" type="video/mp4"></video>`;
  }
  return `<img class="mv" src="${m.thumb}" srcset="${m.thumb} 640w, ${m.src} ${m.width}w" sizes="${sizes}" width="${m.width}" height="${m.height}" style="${ratio}" alt="${esc(m.title)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
}

// A tile is a plain link to the full file, so it works with JS off; the
// script upgrades the click into the lightbox.
function tile(m, i, opts = {}) {
  const p = projectById[m.project];
  const thumb = m.type === 'video' ? m.poster : m.thumb;
  return `<a class="tile rv" href="${m.src}" data-i="${i}" data-kind="${m.kind}" data-project="${m.project}" data-type="${m.type}" data-src="${m.src}" data-poster="${m.poster || ''}" data-w="${m.width}" data-h="${m.height}" data-title="${esc(m.title)}" data-client="${esc(p?.client)}" data-caption="${esc(m.caption || '')}" data-credit="${esc(m.credit || '')}" style="--d:${(i % 6) * 60}ms">
  <span class="tile-media${m.type === 'video' ? ' is-video' : ''}">
    <img src="${thumb}" width="${m.width}" height="${m.height}" style="aspect-ratio:${m.width}/${m.height}" alt="${esc(m.title)}" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async">
    ${m.type === 'video' ? `<span class="play" aria-hidden="true"></span><span class="dur mono">${fmtDur(m.duration)}</span>` : ''}
  </span>
  <span class="tile-cap"><span class="mono">${KIND_LABEL[m.kind]}</span><strong>${esc(m.title)}</strong><span class="tile-client">${esc(p?.client)}</span></span>
</a>`;
}

// ---------- /resume ----------
function resumePage() {
  const count = (k) => media.filter((m) => m.kind === k).length;
  const videos = media.filter((m) => m.type === 'video').length;
  const featured = media.filter((m) => m.featured);
  const hero = media.find((m) => m.id === 'gv-oc-before-after');
  const ctaBg = media.find((m) => m.id === 'md-four-pack');

  const reel = featured
    .map((m, i) => `<figure class="reel-item">${mediaEl(m, { autoplay: m.type === 'video', sizes: '(max-width: 700px) 70vw, 24vw' })}<figcaption><span class="mono">${pad(i + 1)}A</span> ${esc(projectById[m.project].client)} — ${esc(m.title)}</figcaption></figure>`)
    .join('\n');

  const cases = projects
    .map((p, idx) => {
      const pm = byProject(p.id);
      if (!pm.length) return '';
      // Lead with the featured piece, then fill with a mix of kinds.
      const isSite = pm.every((m) => m.kind === 'web');
      const pick = [...pm.filter((m) => m.featured), ...pm.filter((m) => !m.featured)].slice(0, isSite ? 2 : 4);
      const meta = [p.where, p.when].filter(Boolean).map(esc).join(' · ');
      return `<article class="case rv${idx % 2 ? ' flip' : ''}" id="${p.id}">
  <div class="case-text">
    <p class="mono case-no">${pad(idx + 1)} / ${pad(projects.length)}${p.status ? ` <span class="chip${p.status === 'Live' ? ' chip-live' : ''}">${esc(p.status)}</span>` : ''}</p>
    <h3>${esc(p.client)}</h3>
    ${meta ? `<p class="case-meta mono">${meta}</p>` : ''}
    <p class="case-head">${esc(p.headline)}</p>
    <ul class="did">${p.did.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    <p class="tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p>
    <p class="case-links"><a class="arrow" href="/work#${p.id}">All ${pm.length} piece${pm.length > 1 ? 's' : ''}</a>${p.url ? ` <a class="arrow" href="${p.url}" rel="noopener">${esc(p.url_label || p.url.replace('https://', ''))}</a>` : ''}</p>
  </div>
  <div class="case-media n${pick.length}${isSite ? ' site' : ''}${!isSite && pick.filter((m) => m.width > m.height).length > pick.length / 2 ? ' wide' : ''}">${pick.map((m) => mediaEl(m, { autoplay: m.type === 'video', sizes: '(max-width: 700px) 46vw, 22vw' })).join('')}</div>
</article>`;
    })
    .join('\n');

  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Major Hurley',
    jobTitle: 'Founder, Major Distribution',
    url: `${SITE_URL}/resume`,
    sameAs: [LINKEDIN],
    worksFor: { '@type': 'Organization', name: 'Major Distribution', url: SITE_URL },
    alumniOf: [{ '@type': 'CollegeOrUniversity', name: 'University of La Verne' }, { '@type': 'CollegeOrUniversity', name: 'Long Beach City College' }],
  };
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Resume', item: `${SITE_URL}/resume` },
    ],
  };

  return `${head({
    title: 'Major Hurley — Resume | Major Distribution',
    description: 'Major Hurley, founder of Major Distribution: Meta ads, short-form video, product photography and websites for local brands, with the work to show for it.',
    path: '/resume',
    ogImage: '/media/og-resume.jpg',
    extraLd: [ld(person), ld(crumbs)],
  })}
<body class="pf">
<a class="skip" href="#main">Skip to content</a>
${topbar('resume')}
<main id="main">

<section class="r-hero">
  <div class="r-hero-text">
    <p class="mono kicker rv">Resume · Updated Oct 2026</p>
    <h1 class="rv" style="--d:80ms">Major<br>Hurley</h1>
    <p class="role rv" style="--d:160ms">Founder, <strong>Major Distribution</strong>. I find the clients, shoot the work, cut it, and build the sites it lives on.</p>
    <div class="actions rv" style="--d:240ms">
      <a class="btn btn-red magnet" href="${CONTACT_URL}">Get in touch</a>
      <a class="btn btn-line magnet" href="/work">See all ${media.length} pieces</a>
    </div>
    <dl class="stats rv" style="--d:320ms">
      <div><dt>Client brands</dt><dd>${projects.filter((p) => !p.personal).length}</dd></div>
      <div><dt>Ads &amp; videos</dt><dd>${videos}</dd></div>
      <div><dt>Photos &amp; designs</dt><dd>${count('photo') + count('design')}</dd></div>
      <div><dt>Live store</dt><dd>1</dd></div>
    </dl>
  </div>
  <figure class="r-hero-media rv" style="--d:120ms">
    <span class="loupe" aria-hidden="true"></span>
    ${mediaEl(hero, { autoplay: true, eager: true })}
    <figcaption class="mono">01A — ${esc(hero.title)} · Golden Vision</figcaption>
  </figure>
</section>

<div class="sprockets" aria-hidden="true"></div>

<section class="reel" aria-labelledby="reel-h">
  <div class="sec-head"><p class="mono">The reel</p><h2 id="reel-h">Selected work</h2></div>
  <div class="reel-track" tabindex="0" aria-label="Selected work, scroll sideways">
${reel}
  </div>
</section>

<div class="sprockets" aria-hidden="true"></div>

<section class="cases" aria-labelledby="cases-h">
  <div class="sec-head"><p class="mono">Clients</p><h2 id="cases-h">What I made, for whom</h2></div>
${cases}
</section>

<section class="rows" aria-labelledby="sys-h">
  <div class="sec-head"><p class="mono">Behind the work</p><h2 id="sys-h">Systems I built to run it</h2></div>
  ${systems.map((s) => `<div class="row rv"><h3>${esc(s.name)}</h3><p>${esc(s.what)}</p></div>`).join('\n  ')}
</section>

<section class="rows" aria-labelledby="exp-h">
  <div class="sec-head"><p class="mono">Experience</p><h2 id="exp-h">Where I've worked</h2></div>
  <div class="row rv"><h3>Founder — Major Distribution</h3><p class="mono when">Jan 2026 – present</p><p>Prospect, pitch, close and deliver. Social content, ad creative and web builds for local brands, run from a self-built lead pipeline.</p></div>
  <div class="row rv"><h3>Integrated Business Core — University of La Verne</h3><p class="mono when">Cohort program</p><p>A 16-unit program where the cohort forms a real company, secures financing and operates it.</p></div>
  <div class="row rv"><h3>Food Service &amp; Club Operations — Long Beach Yacht Club</h3><p class="mono when">Jun 2023 – Aug 2024 · returned Apr – May 2026</p><p>Member and event service at a private club where the standard was the product. Invited back for the spring season.</p></div>
</section>

<section class="rows" aria-labelledby="edu-h">
  <div class="sec-head"><p class="mono">Education</p><h2 id="edu-h">School &amp; sport</h2></div>
  <div class="row rv"><h3>B.S. Business Administration &amp; Management — University of La Verne</h3><p class="mono when">Expected June 2027</p></div>
  <div class="row rv"><h3>A.A. — Long Beach City College</h3></div>
  <div class="row rv"><h3>Collegiate basketball</h3><p>Long Beach City College and University of La Verne.</p></div>
</section>

<section class="rows skills" aria-labelledby="sk-h">
  <div class="sec-head"><p class="mono">Toolkit</p><h2 id="sk-h">Skills</h2></div>
  <div class="row rv"><h3>Marketing</h3><p>Meta &amp; Reels ads · short-form video · content strategy · copywriting · brand kits · local SEO</p></div>
  <div class="row rv"><h3>Production</h3><p>Shooting (Sony) · Premiere Pro · ffmpeg · photo editing from RAW · motion and captions</p></div>
  <div class="row rv"><h3>Build</h3><p>Websites and online stores · Stripe · Vercel · automation with n8n and Python · AI tooling with Claude</p></div>
</section>

<section class="cta" aria-labelledby="cta-h">
  <img class="cta-bg" src="${ctaBg.src}" width="${ctaBg.width}" height="${ctaBg.height}" alt="" loading="lazy" decoding="async">
  <div class="cta-in">
    <p class="mono">Hiring, or need the work?</p>
    <h2 id="cta-h">Let's talk.</h2>
    <div class="actions">
      <a class="btn btn-red magnet" href="${CONTACT_URL}">Send a message</a>
      <a class="btn btn-white magnet" href="${LINKEDIN}" rel="noopener">LinkedIn</a>
    </div>
  </div>
</section>

</main>
${footer}
</body>
</html>
`;
}

// ---------- /work ----------
function workPage() {
  const media = workMedia;
  const projects = allProjects.filter((p) => media.some((m) => m.project === p.id));
  const kinds = ['ad', 'video', 'photo', 'web', 'design'].filter((k) => media.some((m) => m.kind === k));
  const order = projects.map((p) => p.id);
  const sorted = [...media].sort((a, b) => order.indexOf(a.project) - order.indexOf(b.project) || (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const list = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Work — Major Distribution',
    url: `${SITE_URL}/work`,
    hasPart: projects.map((p) => ({ '@type': 'CreativeWork', name: p.client, description: p.headline })),
  };
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Work', item: `${SITE_URL}/work` },
    ],
  };
  return `${head({
    title: 'Work — Ads, Video, Photo & Websites | Major Distribution',
    description: `${media.length} pieces from Major Distribution: Meta ads, short-form video, product photography, designs and websites for ${projects.filter((p) => !p.personal).length} brands.`,
    path: '/work',
    ogImage: '/media/og-work.jpg',
    extraLd: [ld(list), ld(crumbs)],
  })}
<body class="pf">
<a class="skip" href="#main">Skip to content</a>
${topbar('work')}
<main id="main">
<section class="w-head">
  <p class="mono kicker rv">${media.length} pieces · ${projects.filter((p) => !p.personal).length} brands · 2026</p>
  <h1 class="rv" style="--d:80ms">The work</h1>
  <p class="lede rv" style="--d:160ms">Ads, short-form video, photography, designs and websites. Tap any piece to open it.</p>
  <div class="filters rv" style="--d:240ms" role="group" aria-label="Filter by type">
    <button type="button" class="chip-btn" aria-pressed="true" data-filter-kind="all">All <span>${media.length}</span></button>
    ${kinds.map((k) => `<button type="button" class="chip-btn" aria-pressed="false" data-filter-kind="${k}">${KIND_LABEL[k]}s <span>${media.filter((m) => m.kind === k).length}</span></button>`).join('\n    ')}
  </div>
  <div class="filters filters-p rv" style="--d:300ms" role="group" aria-label="Filter by client">
    <button type="button" class="chip-btn" aria-pressed="true" data-filter-project="all">Every client</button>
    ${projects.filter((p) => byProject(p.id).length).map((p) => `<button type="button" class="chip-btn" aria-pressed="false" data-filter-project="${p.id}">${esc(p.client)}</button>`).join('\n    ')}
  </div>
  <p class="mono count" aria-live="polite" id="count"></p>
</section>
<section class="grid" id="grid" aria-label="Gallery">
${sorted.map((m, i) => tile(m, i, { eager: i < 6 })).join('\n')}
</section>
<p class="empty mono" id="empty" hidden>Nothing here yet for that filter.</p>
</main>
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
${footer}
</body>
</html>
`;
}

// ---------- write ----------
if (SHOW_RESUME) writeFileSync(join(ROOT, 'resume.html'), resumePage());
else if (existsSync(join(ROOT, 'resume.html'))) unlinkSync(join(ROOT, 'resume.html'));
writeFileSync(join(ROOT, 'work.html'), workPage());

const pages = [
  { path: '', lastmod: UPDATED },
  ...(SHOW_RESUME ? [{ path: '/resume', lastmod: UPDATED }] : []),
  { path: '/work', lastmod: UPDATED },
];
writeFileSync(
  join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((p) => `  <url><loc>${SITE_URL}${p.path}</loc><lastmod>${p.lastmod}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(
  join(ROOT, 'robots.txt'),
  NOINDEX ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);
console.log(`built ${SHOW_RESUME ? 'resume.html, ' : '(resume off) '}work.html, sitemap.xml, robots.txt — ${media.length} media items (${items.length - media.length} held) for ${SITE_URL}${NOINDEX ? ' [NOINDEX]' : ''}`);
