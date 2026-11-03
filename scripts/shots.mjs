// Mobile audit at 320/360/390/430 + screenshots at 390 and 1440.
// Exits non-zero on any finding.   node scripts/shots.mjs
// Asserts: no horizontal page scroll, no element wider than the viewport,
// tap targets >= 44px tall (links inside running text exempt).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { start } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'renders');
mkdirSync(OUT, { recursive: true });
const PORT = 4174, O = `http://localhost:${PORT}`;
const PAGES = ['/', '/work']; // /resume is off for now (build.mjs SHOW_RESUME)
const server = await start(PORT);
const b = await chromium.launch();
let issues = 0;

for (const w of [320, 360, 390, 430]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  for (const path of PAGES) {
    await p.goto(O + path, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    const found = await p.evaluate((vw) => {
      const out = [];
      if (document.documentElement.scrollWidth > vw) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
      const scrollers = [...document.querySelectorAll('.reel-track, .filters')];
      // .stage clips its field (overflow: clip), so the field's 3D tilt can't widen the page;
      // the scrollWidth check above still catches any real overflow.
      for (const el of document.querySelectorAll('body *')) {
        if (scrollers.some((s) => s !== el && s.contains(el))) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('dialog,.skip,.hp,.stage'))
          out.push(`overflow ${el.tagName.toLowerCase()}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      for (const el of document.querySelectorAll('a, button')) {
        // .hp: the honeypot is off-screen on purpose. .bt: board tiles are measured
        // at the zoomed-out overview scale; at close-up scale they are >=140px.
        // #lib .st: the homepage gallery's pieces are gathered small until the
        // gallery is on screen; they are measured at rest below.
        if (el.closest('dialog,.skip,.hp,.bt,#lib') || el.closest('p, li:not(.foot li)') && !el.matches('.btn,.arrow')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height < 44 && !el.closest('.tile')) out.push(`target ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}" ${Math.round(r.height)}px`);
      }
      return [...new Set(out)].slice(0, 12);
    }, w);
    if (path === '/') {
      // The gallery at rest: every piece a tappable size.
      await p.evaluate(() => scrollTo({ top: document.getElementById('work').offsetTop - 77, behavior: 'instant' }));
      await p.waitForTimeout(1600);
      found.push(...(await p.$$eval('#lib .st:not(.echo)', (ts) => ts.map((t) => t.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).map((r) => `gallery piece ${Math.round(r.width)}x${Math.round(r.height)}px at rest`))));
    }
    for (const f of found) { console.log(`  ${w} ${path}: ${f}`); issues++; }
    if (w === 390 && path !== '/') await p.screenshot({ path: join(OUT, `${path.slice(1)}-390.png`), fullPage: true });
  }
  await ctx.close();
}
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
for (const path of PAGES.filter((x) => x !== '/')) {
  await p.goto(O + path, { waitUntil: 'load' });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 120)); } scrollTo({ top: 0, behavior: 'instant' }); });
  await p.waitForTimeout(900);
  await p.screenshot({ path: join(OUT, `${path.slice(1)}-1440.png`), fullPage: true });
}
await b.close();
server.close();
console.log(issues ? `FAIL: ${issues} issue(s)` : 'PASS: mobile audit clean at 320/360/390/430');
process.exit(issues ? 1 : 0);
