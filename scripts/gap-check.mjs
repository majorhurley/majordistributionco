// Walk the gallery on phone + desktop; report on-screen pieces with no loaded image.  node scripts/gap-check.mjs [outDir]
import { chromium, webkit, devices } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { start } from './serve.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'renders');
mkdirSync(OUT, { recursive: true });
const PORT = 4176;
await start(PORT);
const runs = [
  ['webkit-iphone', webkit, devices['iPhone 13']],
  ['chrome-phone', chromium, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }],
  ['chrome-1440', chromium, { viewport: { width: 1440, height: 900 } }],
];
let bad = 0;
for (const [name, type, opt] of runs) {
  const b = await type.launch(type === chromium ? { channel: 'chrome' } : {});
  const ctx = await b.newContext(opt);
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await p.evaluate(() => { document.documentElement.style.scrollSnapType = 'none'; document.documentElement.style.scrollBehavior = 'auto'; });
  const top = await p.evaluate(() => document.getElementById('work').offsetTop - 77);
  const end = await p.evaluate(() => { const s = document.querySelector('#work .stage'); return s.getBoundingClientRect().bottom + scrollY - innerHeight; });
  const step = opt.viewport.height * 0.5;
  for (let y = top, k = 0; y <= Math.max(top, end) + 1; y += step, k++) {
    await p.evaluate((y) => scrollTo(0, y), y);
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      const out = { on: 0, empty: [], over: 0, edge: 0 }, rs = [];
      for (const t of document.querySelectorAll('#lib .st')) {
        const b = t.getBoundingClientRect();
        if (getComputedStyle(t).display === 'none' || b.width < 2) continue;
        if (b.bottom < 77 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue;
        out.on++; if (innerWidth < innerHeight) { rs.push(b); if (b.left < -1 || b.right > innerWidth + 1) out.edge++; }
        const img = t.querySelector('img');
        if (!img.complete || !img.naturalWidth) out.empty.push(img.getAttribute('src').split('/').pop());
      }
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], c = rs[j]; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) out.over++; }
      return out;
    });
    bad += r.empty.length + r.over + r.edge;
    console.log(name, 'stop', k, 'on-screen', r.on, 'empty', r.empty.length, 'overlap', r.over, 'off-edge', r.edge, r.empty.slice(0, 4).join(' '));
    await p.screenshot({ path: join(OUT, `gap-${name}-${k}.png`) });
  }
  await b.close();
}
console.log(bad ? `FAIL ${bad} problems (empty / overlapping / off-edge pieces)` : 'OK no empty pieces');
process.exit(bad ? 1 : 0);
