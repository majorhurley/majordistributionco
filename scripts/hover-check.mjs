// Desktop: sweep the mouse across pieces at several speeds; fail if any piece is left hidden.  node scripts/hover-check.mjs
import { chromium, webkit } from 'playwright';
import { start } from './serve.mjs';
await start(4179);
let bad = 0;
for (const type of [chromium, webkit]) {
  const b = await type.launch(type === chromium ? { channel: 'chrome' } : {}); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto('http://localhost:4179/', { waitUntil: 'load' });
  await p.evaluate(() => scrollTo({ top: document.getElementById('work').offsetTop - 77, behavior: 'instant' })); await p.waitForTimeout(2500);
  const pts = await p.$$eval('#lib .st:not(.echo)', ts => ts.map(t => { const r = t.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }).filter(([x, y]) => y > 120 && y < 820));
  for (const delay of [0, 60, 150, 400]) for (const [x, y] of pts.slice(0, 20)) { await p.mouse.move(x, y, { steps: 3 }); if (delay) await p.waitForTimeout(delay); }
  await p.mouse.move(5, 880, { steps: 5 }); await p.waitForTimeout(800);
  const stuck = await p.$$eval('#lib .st', ts => ts.filter(t => t.classList.contains('lifted') || getComputedStyle(t).opacity === '0').length);
  console.log(type.name(), 'hidden pieces after sweeps:', stuck); bad += stuck; await b.close();
}
process.exit(bad ? 1 : 0);
