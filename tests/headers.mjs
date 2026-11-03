// Replays vercel.json headers locally and proves the CSP is enforced (not
// report-only) and that the pages break none of it: zero violations, fonts
// loaded, scripts ran.   node tests/headers.mjs
import { chromium } from 'playwright';
import { start, headersFor } from '../scripts/serve.mjs';

const PORT = 4176, O = `http://localhost:${PORT}`;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };

for (const path of ['/', '/work']) {
  const h = headersFor(path);
  ok(/script-src 'self'(;|$)/.test(h['Content-Security-Policy'] || ''), `${path} strict script-src in vercel.json`);
  ok(/connect-src 'self' https:\/\/formsubmit\.co/.test(h['Content-Security-Policy'] || ''), `${path} connect-src allows the form endpoint`);
  ok(!('Content-Security-Policy-Report-Only' in h), `${path} CSP is report-only`);
  for (const k of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'X-Frame-Options']) ok(h[k], `${path} missing ${k}`);
}
ok(headersFor('/media/x.mp4')['Cache-Control'].includes('max-age=86400'), 'media cache header');
ok(!/immutable/.test(JSON.stringify(headersFor('/assets/css/portfolio.css'))), 'unhashed asset served immutable');

const server = await start(PORT);
const b = await chromium.launch();
for (const path of ['/', '/work']) {
  const p = await b.newPage();
  await p.addInitScript(() => {
    window.__v = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__v.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const res = await p.goto(O + path, { waitUntil: 'load' });
  ok(res.headers()['content-security-policy'], `${path} served without CSP`);
  await p.waitForTimeout(800);
  const r = await p.evaluate(async () => ({
    v: window.__v,
    font: (await document.fonts.ready, document.fonts.check('40px "MD Display"') && document.fonts.check('16px "Archivo"')),
    js: document.documentElement.dataset.ready === '1',
  }));
  ok(r.v.length === 0, `${path} CSP violations: ${r.v.join(', ')}`);
  ok(r.font, `${path} self-hosted fonts did not load`);
  ok(r.js, `${path} portfolio.js did not run`);
  await p.close();
}
await b.close();
server.close();
console.log(fails ? `FAIL: ${fails}` : 'PASS: headers + CSP clean in a real browser');
process.exit(fails ? 1 : 0);
