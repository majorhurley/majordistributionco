// Gallery-at-rest screenshots, phone + desktop.   node scripts/gallery-shot.mjs [outDir]
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { start } from './serve.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'renders');
mkdirSync(OUT, { recursive: true });
const PORT = 4175;
await start(PORT);
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
for (const [name, opt] of [
  ['home-390', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }],
  ['home-360', { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }],
  ['home-1440', { viewport: { width: 1440, height: 900 } }],
]) {
  const ctx = await b.newContext(opt);
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await p.screenshot({ path: join(OUT, `${name}-hero.png`) });
  await p.evaluate(() => scrollTo({ top: document.getElementById('work').offsetTop - 77, behavior: 'instant' }));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: join(OUT, `${name}-gallery.png`) });
  const sizes = await p.$$eval('#lib .st:not(.echo)', (ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); }));
  console.log(name, 'pieces', sizes.length, 'min side', Math.min(...sizes));
  if (opt.isMobile) for (const k of [1, 2]) {
    await p.evaluate((k) => scrollBy({ top: innerHeight * 0.55, behavior: 'instant' }), k);
    await p.waitForTimeout(900);
    await p.screenshot({ path: join(OUT, `${name}-gallery${k + 1}.png`) });
  }
  await ctx.close();
}
await b.close();
process.exit(0);
