// Smoke test for /work and the homepage (the resume is off: build.mjs SHOW_RESUME).   node tests/smoke.mjs
import { chromium } from 'playwright';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { start } from '../scripts/serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4175, O = `http://localhost:${PORT}`;
const { items } = JSON.parse(readFileSync(join(ROOT, 'media/manifest.json'), 'utf8'));
const { services } = JSON.parse(readFileSync(join(ROOT, 'content/services.json'), 'utf8'));
const SUB = [...services.map((x) => `/services/${x.slug}`), ...readdirSync(join(ROOT, 'work')).map((f) => `/work/${f.replace(/\.html$/, '')}`)];
const PAGES = ['/', '/work', ...SUB];
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('  FAIL', msg); } };

const server = await start(PORT);
const b = await chromium.launch();
// Playwright's bundled Chromium has no H.264, so video playback is only
// provable in real Chrome. Fall back (and say so) if it isn't installed.
const chrome = await chromium.launch({ channel: 'chrome' }).catch(() => null);

// 1. Media library: every manifest file serves; nothing held ships.
for (const m of items) for (const k of ['src', 'poster', 'thumb']) {
  if (!m[k]) continue;
  const r = await fetch(O + m[k], { method: 'HEAD' });
  ok(r.status === 200, `${m.id} ${k} ${m[k]} -> ${r.status}`);
}
ok(items.every((m) => !m.hold), 'manifest contains a held item');
const shipped = readdirSync(join(ROOT, 'media'), { recursive: true }).map(String);
ok(!shipped.some((f) => f.includes('gv-chato')), 'held file gv-chato is inside media/');

// 2. Every local src/href/poster on the three pages resolves.
for (const page of PAGES) {
  const html = await (await fetch(O + page)).text();
  const refs = [...html.matchAll(/(src|href|poster|srcset)="([^"]+)"/g)]
    .filter((x) => !x[2].startsWith('data:'))
    .flatMap((x) => (x[1] === 'srcset' ? x[2].split(',') : [x[2]]).map((s) => s.trim().split(' ')[0]))
    .filter((u) => u.startsWith('/') && !u.startsWith('//'));
  for (const u of new Set(refs)) {
    const r = await fetch(O + u.split('#')[0], { method: 'HEAD', redirect: 'manual' });
    ok(r.status === 200, `${page} references ${u} -> ${r.status}`);
  }
}

// 3. Pages: SEO basics, no console errors.
for (const path of PAGES) {
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const r = await p.goto(O + path, { waitUntil: 'load' });
  ok(r.status() === 200, `${path} status ${r.status()}`);
  ok((await p.locator('h1').count()) === 1, `${path} has exactly one h1`);
  ok((await p.getAttribute('link[rel=canonical]', 'href')) === `https://www.majordistributionco.com${path === '/' ? '' : path}`, `${path} canonical`);
  ok((await p.locator('script[type="application/ld+json"]').count()) >= 1, `${path} JSON-LD`);
  const lds = (await p.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
  const biz = lds.find((x) => x['@type'] === 'ProfessionalService');
  ok(biz && biz.areaServed.some((a) => a.name === 'La Verne, CA') && !biz.telephone && !biz.address, `${path} business schema: service area, no phone/address`);
  const desc = await p.getAttribute('meta[name=description]', 'content');
  ok(desc && desc.length >= 70 && desc.length <= 170, `${path} meta description length ${desc?.length}`);
  const faqN = await p.locator('.faq details').count();
  if (path.startsWith('/services/')) ok(faqN > 0 && lds.some((x) => x['@type'] === 'FAQPage' && x.mainEntity.length === faqN), `${path} FAQPage matches visible FAQ`);
  await p.waitForTimeout(600);
  ok(errors.length === 0, `${path} console errors: ${errors.join(' | ')}`);
  await p.close();
}

// 3b. Service + case-study pages fit a 320px phone (long display-font words).
{
  const p = await b.newPage({ viewport: { width: 320, height: 640 } });
  for (const path of SUB) {
    await p.goto(O + path, { waitUntil: 'load' });
    await p.waitForTimeout(300);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= 320, `${path} overflows 320px: scrollWidth ${sw}`);
  }
  await p.close();
}

// 4. JavaScript off: nothing hidden.
{
  const ctx = await b.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  for (const path of PAGES) {
    await p.goto(O + path);
    const hidden = await p.evaluate(() => [...document.querySelectorAll('.rv, .tile, .bt, .slogan')].filter((e) => getComputedStyle(e).opacity === '0').length);
    ok(hidden === 0, `${path} JS off: ${hidden} element(s) hidden`);
  }
  await ctx.close();
}

// 5. Watchdog: main script blocked -> content shows within 2.5s.
{
  const ctx = await b.newContext();
  await ctx.route('**/portfolio.js', (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(O + '/work');
  await p.waitForTimeout(2900);
  const hidden = await p.evaluate(() => [...document.querySelectorAll('.rv')].filter((e) => getComputedStyle(e).opacity === '0').length);
  ok(hidden === 0, `watchdog: ${hidden} reveal(s) still hidden with portfolio.js blocked`);
  await ctx.close();
}

// 5b. Resume off: no page, no links, /resume redirects to /work on Vercel.
{
  ok(!existsSync(join(ROOT, 'resume.html')), 'resume.html still generated');
  for (const page of ['/', '/work']) ok(!(await (await fetch(O + page)).text()).includes('href="/resume"'), `${page} links to /resume`);
  const vc = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  ok((vc.redirects || []).some((r) => r.source === '/resume' && r.destination === '/work'), 'vercel.json /resume redirect');
}

// 6. Gallery filters, hash filter and lightbox. /work shows the Boss's pick (content/work.json).
{
  const wp = existsSync(join(ROOT, 'content/work.json')) ? JSON.parse(readFileSync(join(ROOT, 'content/work.json'), 'utf8')).pieces : null;
  const shown = wp ? items.filter((m) => wp.includes(m.id)) : items;
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(O + '/work', { waitUntil: 'load' });
  const vis = () => p.evaluate(() => [...document.querySelectorAll('.tile')].filter((t) => !t.hidden).length);
  ok((await vis()) === shown.length, `all ${shown.length} tiles visible`);
  await p.click('[data-filter-kind="photo"]');
  ok((await vis()) === shown.filter((m) => m.kind === 'photo').length, 'Photos filter count');
  await p.click('[data-filter-kind="all"]');
  const hp = shown[0].project;
  await p.goto(O + '/work#' + hp);
  await p.waitForTimeout(200);
  ok((await vis()) === shown.filter((m) => m.project === hp).length, `#${hp} hash filter count`);
  ok((await p.getAttribute(`[data-filter-project="${hp}"]`, 'aria-pressed')) === 'true', `#${hp} chip pressed`);
  await p.goto(O + '/work', { waitUntil: 'load' });
  await p.click('.tile >> nth=0');
  ok(await p.locator('#lb[open]').isVisible(), 'lightbox opens');
  ok((await p.locator('#lb-stage video, #lb-stage img').count()) === 1, 'lightbox shows media');
  const t1 = await p.textContent('#lb-title');
  await p.click('#lb-next');
  ok((await p.textContent('#lb-title')) !== t1, 'lightbox next changes item');
  await p.keyboard.press('Escape');
  ok(!(await p.locator('#lb[open]').count()), 'Escape closes lightbox');
  await p.close();
}

// 7. Homepage: one screen per section, snapping: slogan -> the library (a scattered field on white) -> services -> contact.
{
  const { pieces: flat } = JSON.parse(readFileSync(join(ROOT, 'content/home.json'), 'utf8'));
  const byId = Object.fromEntries(items.map((m) => [m.id, m]));
  const p = await (chrome || b).newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(O + '/', { waitUntil: 'load' });
  ok((await p.textContent('h1')).replace(/\s+/g, ' ').trim().toLowerCase().includes("can't buy what you can't see"), 'hero slogan');
  ok((await p.locator('#lib .st:not(.echo)').count()) === flat.length, `library shows all ${flat.length} pieces`);
  // Echo stills (density padding from the videos' own footage) stay out of the a11y tree and tab order.
  ok(await p.evaluate(() => [...document.querySelectorAll('#lib .st.echo')].every((t) => t.getAttribute('aria-hidden') === 'true' && t.tabIndex === -1 && t.dataset.of !== undefined)), 'echo stills are hidden from assistive tech');
  ok(flat.every((id) => !['design', 'web'].includes(byId[id].kind)), 'no designs or website shots');
  ok(flat.every((id) => { const v = byId[id].board || byId[id]; return v.height > v.width; }), 'every piece is vertical');
  ok(flat.every((id, k) => !k || byId[id].project !== byId[flat[k - 1]].project), 'no two consecutive pieces from one client');
  const html = await p.content();
  ok(!/\d+ pieces ·|photos &amp; designs|\d+ brands/.test(html), 'stats text block is gone');
  ok((await p.locator('#services, #contact, #cform').count()) === 3, 'services + contact present');
  const order = await p.evaluate(() => ['hero', 'work', 'services', 'contact'].map((id) => document.getElementById(id).offsetTop));
  ok(order.every((v, i) => i === 0 || v > order[i - 1]), 'scene order hero < work < services < contact');
  const settle = () => p.waitForTimeout(1600);
  const op = () => p.evaluate(() => +getComputedStyle(document.querySelector('.slogan')).opacity);
  ok((await op()) > 0.95, 'slogan visible at load');
  // One screen per section: each wheel flick or PageDown rests on exactly one
  // section (contact shares its screen with the footer), never half and half.
  await p.mouse.move(1435, 895);
  const shown = () => p.evaluate(() => {
    const H = 77, vh = innerHeight;
    const on = ['hero', 'work', 'services', 'contact'].filter((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.bottom > H + 1 && r.top < vh - 1; });
    if (document.querySelector('.hfoot').getBoundingClientRect().top < vh - 1) on.push('foot');
    return on.join('+');
  });
  const stops = [await shown()];
  for (let i = 0; i < 3; i++) {
    if (i % 2) await p.keyboard.press('PageDown'); else await p.mouse.wheel(0, 500);
    await settle();
    stops.push(await shown());
  }
  ok(stops.join(' > ') === 'hero > work > services > contact+foot', `snaps one section per screen (${stops.join(' > ')})`);
  await p.evaluate(() => scrollTo({ top: document.getElementById('work').offsetTop - 77, behavior: 'instant' })); await settle();
  ok((await op()) < 0.1, 'slogan gone once the gallery is up');
  ok((await p.evaluate(() => +getComputedStyle(document.getElementById('lib')).getPropertyValue('--g'))) > 0.99, 'gallery fully spread at rest');
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await settle();
  ok((await p.evaluate(() => +getComputedStyle(document.getElementById('lib')).getPropertyValue('--g'))) < 0.05, 'gallery gathered while the slogan is up');

  // The field: one screen under the header, white, pieces scattered across it.
  await p.evaluate(() => scrollTo({ top: document.getElementById('work').offsetTop - 77, behavior: 'instant' }));
  await p.mouse.move(720, 480); await settle();
  const f = await p.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    const rs = [...document.querySelectorAll('#lib .st')].map((t) => t.getBoundingClientRect());
    const inside = rs.filter((r) => { const x = r.left + r.width / 2, y = r.top + r.height / 2; return x > st.left && x < st.right && y > st.top && y < st.bottom; }).length;
    const ws = rs.map((r) => r.width);
    return { inside, st: { t: st.top, b: st.bottom, h: st.height }, vh: innerHeight, bg: getComputedStyle(document.getElementById('work')).backgroundColor, minW: Math.min(...ws), maxW: Math.max(...ws) };
  });
  ok(Math.abs(f.st.t - 77) < 2 && Math.abs(f.st.b - f.vh) < 2, `the field fills the screen under the header (${f.st.t}-${f.st.b})`);
  ok(f.bg === 'rgb(255, 255, 255)', `the field is white (${f.bg})`);
  ok(f.inside >= flat.length - 4, `most pieces sit inside the field (${f.inside}/${flat.length})`);
  ok(f.maxW < 1440 * 0.2 && f.minW > 30, `pieces range small to mid (${Math.round(f.minW)}-${Math.round(f.maxW)}px)`);

  // Drift: against the cursor, and the field's edge never shows.
  const lib = () => p.evaluate(() => { const l = document.getElementById('lib').getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(); return { dx: l.left - s.left, cover: l.left <= s.left + 0.5 && l.right >= s.right - 0.5 && l.top <= s.top + 0.5 && l.bottom >= s.bottom - 0.5 }; });
  const mid = await lib();
  const corners = [];
  for (const [x, y] of [[1430, 90], [10, 890], [10, 90], [1430, 890]]) { await p.mouse.move(x, y, { steps: 6 }); await settle(); corners.push(await lib()); }
  ok(corners[0].dx < mid.dx - 20, `cursor right -> field drifts left (${mid.dx.toFixed(0)} -> ${corners[0].dx.toFixed(0)})`);
  // The field turns in 3D now, so its box no longer matches the stage; the
  // stage paints the ground itself, so no edge can show.
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('stage')).backgroundColor === 'rgb(255, 255, 255)'), 'the stage paints the white ground under the turning field');

  // Hover: the piece grows, the title names it, a video plays.
  await p.mouse.move(720, 480); await settle();
  // A video piece well inside the field (clear of the header and the edges).
  const vi = await p.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return [...document.querySelectorAll('#lib .st')].findIndex((t) => { const r = t.getBoundingClientRect(); return t.dataset.type === 'video' && !t.dataset.auto && !t.classList.contains('echo') && r.top > s.top + 40 && r.bottom < s.bottom - 60 && r.left > 40 && r.right < innerWidth - 40; }); });
  ok(vi >= 0, 'a video piece sits inside the field');
  const tile = p.locator('#lib .st').nth(vi);
  const bx = await tile.boundingBox();
  await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
  await p.waitForTimeout(1500);
  // Hover lifts the piece into .peek, a flat copy above the 3D space.
  const under = await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.peek'), [bx.x + bx.width / 2, bx.y + bx.height / 2]);
  ok(under, 'the lifted copy sits on top under the cursor (nothing covers it)');
  const pk = await p.locator('.peek').boundingBox();
  ok(pk && pk.width / bx.width > 1.5, `hovered piece grows (${pk ? (pk.width / bx.width).toFixed(2) : 0}x)`);
  ok(pk && Math.abs(pk.height / pk.width - bx.height / bx.width) < 0.03, 'lifted copy keeps the piece\'s shape');
  ok((await p.textContent('#lib-a')) === (await tile.getAttribute('data-client')), 'title names the hovered piece');
  const playing = await p.evaluate(() => { const v = document.querySelector('.peek video'); return !!v && !v.paused; });
  if (chrome) {
    ok(playing, 'hovered video plays');
    ok(await p.evaluate(() => [...document.querySelectorAll('#lib .st[data-auto]')].every((t) => { const v = t.querySelector('video'); return v && !v.paused; })), 'near videos autoplay');
  }
  else console.log('  SKIP video playback: real Chrome not installed (bundled Chromium has no H.264)');
  // Leave to an empty spot in the field (a fixed point can land on a piece as the library grows).
  const [ex, ey] = await p.evaluate(() => {
    const s = document.getElementById('stage').getBoundingClientRect();
    for (let y = s.top + 60; y < s.bottom - 60; y += 20) for (let x = 60; x < innerWidth - 60; x += 20) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest('.st, .peek, a, button')) return [x, y];
    }
    return [720, 480];
  });
  await p.mouse.move(ex, ey); await p.waitForTimeout(700);
  ok((await p.textContent('#lib-a')) === 'Major Distribution', 'title returns when the cursor leaves');
  ok(await p.evaluate(() => document.querySelector('.peek').hidden && !document.querySelector('.peek video')), 'lifted copy and its video go when the cursor leaves');

  // Keyboard focus on an edge piece must not scroll the field sideways.
  await p.locator('#lib .st').last().focus();
  ok((await p.evaluate(() => document.getElementById('stage').scrollLeft + document.getElementById('stage').scrollTop)) === 0, 'focus does not scroll the field');
  await p.locator('#lib .st').last().blur();

  // Dark mode flips the field only.
  await p.click('#lib-dark'); await p.waitForTimeout(700);
  ok((await p.evaluate(() => getComputedStyle(document.getElementById('work')).backgroundColor)) !== 'rgb(255, 255, 255)', 'dark mode darkens the field');
  ok((await p.getAttribute('#lib-dark', 'aria-pressed')) === 'true', 'dark mode button pressed');
  await p.click('#lib-dark');

  // A click opens the viewer.
  const ii = await p.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return [...document.querySelectorAll('#lib .st')].findIndex((t) => { const r = t.getBoundingClientRect(); return t.dataset.type === 'image' && r.top > s.top + 40 && r.bottom < s.bottom - 60 && r.left > 40 && r.right < innerWidth - 40; }); });
  const t2 = p.locator('#lib .st').nth(ii);
  const b2 = await t2.boundingBox();
  await p.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
  ok(await p.locator('#lb[open]').isVisible(), 'a piece opens the lightbox');
  ok((await p.textContent('#lb-title')) === (await t2.getAttribute('data-title')), 'lightbox shows the clicked piece');
  await p.keyboard.press('Escape');

  // Form: validation, unconfigured guard, and a mocked delivery.
  await p.evaluate(() => document.getElementById('contact').scrollIntoView({ behavior: 'instant' }));
  await p.click('#cform button[type=submit]');
  ok(/highlighted/.test(await p.textContent('#formStatus')), 'empty submit shows validation');
  ok((await p.locator('#cform [aria-invalid="true"]').count()) >= 4, 'required fields flagged');
  await p.fill('[name=name]', 'Test Lead'); await p.fill('[name=email]', 'lead@example.com');
  await p.selectOption('[name=service]', { index: 1 }); await p.fill('[name=message]', 'Smoke test');
  let posted = null;
  await p.route('https://formsubmit.co/**', (r) => { posted = { url: r.request().url(), body: r.request().postDataJSON() }; r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":"true"}' }); });
  const pending = /PENDING-ACTIVATION/.test(await p.getAttribute('#cform', 'data-ajax'));
  if (pending) {
    await p.click('#cform button[type=submit]');
    ok(/being set up/.test(await p.textContent('#formStatus')), 'unconfigured form says so instead of failing silently');
    ok(posted === null, 'unconfigured form sends nothing');
    console.log('  NOTE contact form not configured yet (content/site.json formsubmit_id)');
    await p.evaluate(() => { const f = document.getElementById('cform'); f.dataset.ajax = 'https://formsubmit.co/ajax/test-id'; });
  }
  await p.click('#cform button[type=submit]');
  await p.waitForTimeout(500);
  ok(posted && /formsubmit\.co\/ajax\//.test(posted.url), 'form posts to FormSubmit ajax');
  ok(posted && posted.body.email === 'lead@example.com' && !('_honey' in posted.body), 'payload carries fields, not the honeypot');
  ok(/Sent/.test(await p.textContent('#formStatus')), 'success message shown');
  const src = await (await fetch(O + '/')).text();
  ok(!/@gmail\.com/i.test(src), 'no personal email address in the page source');
  await p.close();
}

// 8. Field on a phone and with JS off: everything inside the width, no toggle.
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(O + '/', { waitUntil: 'load' });
  const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, out: [...document.querySelectorAll('#lib .st')].filter((t) => { const r = t.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).length }));
  ok(r.sw === 390 && r.out === 0, `phone: no piece past the screen edge (scrollWidth ${r.sw}, ${r.out} outside)`);
  await p.close();
  const ctx = await b.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const q = await ctx.newPage();
  await q.goto(O + '/');
  ok(!(await q.locator('#lib-dark').isVisible()), 'JS off: no dead dark-mode button');
  ok((await q.locator('#lib .st').evaluateAll((ts) => ts.filter((t) => t.getBoundingClientRect().width > 20).length)) === (await q.locator('#lib .st').count()), 'JS off: every piece laid out');
  await ctx.close();
}

await b.close();
if (chrome) await chrome.close();
server.close();
console.log(fails ? `FAIL: ${fails} of ${checks} checks` : `PASS: ${checks} checks`);
process.exit(fails ? 1 : 0);
