// Renders the /resume and /work share cards (1200x630) from HTML, so they
// re-render when the work changes.   node scripts/og.mjs
// The homepage card and the icons are the 2026 brand exports in assets/.
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { start } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { items } = JSON.parse(readFileSync(join(ROOT, 'media/manifest.json'), 'utf8'));
const get = (id) => items.find((m) => m.id === id);
const PORT = 4179, O = `http://localhost:${PORT}`;
const img = (id) => { const m = get(id); return O + (m.poster || m.src); };

const base = `<link rel="stylesheet" href="${O}/assets/css/portfolio.css"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#2a2a2a;color:#ebe8dd}
.c{display:grid;grid-template-columns:560px 1fr;height:630px}
.t{padding:56px 0 48px 64px;display:flex;flex-direction:column;justify-content:space-between}
.t h1{font:400 76px/.95 'MD Display';text-transform:uppercase;margin:0}
.t p{font:500 24px/1.35 'Archivo';color:#a8a59b;max-width:22ch;margin:0}
.b{display:block;height:56px;width:auto}
.m{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:28px 28px 28px 0;background:#2a2a2a}
.m img{width:100%;height:100%;object-fit:cover}
.m img:nth-child(2){margin-top:36px;height:calc(100% - 36px)}
</style>`;
const card = (title, sub, ids) => `${base}<div class="c"><div class="t"><img class="b" src="${O}/assets/brand/md-wordmark.png" alt=""><h1>${title}</h1><p>${sub}</p></div><div class="m">${ids.map((i) => `<img src="${img(i)}">`).join('')}</div></div>`;

const server = await start(PORT);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
// Same origin as the server, or the woff2 fetch is cross-origin and silently falls back.
await p.goto(`${O}/robots.txt`);
const shoot = async (html, out, opts = {}) => {
  await p.setContent(html, { waitUntil: 'load' });
  const ok = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('40px "MD Display"'); });
  if (!ok) throw new Error(`fonts did not load for ${out}`);
  await p.screenshot({ path: join(ROOT, out), type: out.endsWith('.png') ? 'png' : 'jpeg', quality: out.endsWith('.png') ? undefined : 84, ...opts });
  console.log('wrote', out);
};
await shoot(card('Major<br>Hurley', 'Ads, video, photography and websites for local brands.', ['gv-oc-before-after', 'md-four-pack', 'amor-street']), 'media/og-resume.jpg');
// /work shows the Boss's pick (content/work.json; no file = every piece).
const workFile = join(ROOT, 'content/work.json');
const work = existsSync(workFile) ? JSON.parse(readFileSync(workFile, 'utf8')).pieces : items.map((m) => m.id);
const shown = work.filter((id) => !id.startsWith('_'));
const strip = ['md-pato-loco-canning', 'gv-interior', 'md-honey-pot-sky'].filter((id) => shown.includes(id));
for (const id of shown) if (strip.length < 3 && !strip.includes(id) && get(id)?.type === 'image') strip.push(id);
await shoot(card('The<br>work', `${shown.length} pieces across ads, video and photo.`, strip), 'media/og-work.jpg');
await b.close();
server.close();
