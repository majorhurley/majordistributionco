// Keeps media the pages don't use out of the public repo and the deploy.
// The library (media/) holds every piece, but the pages show only the picks
// (content/home.json, content/work.json). Anything under media/ that no page
// references is listed in .gitignore and .vercelignore between the markers.
// Runs at the end of `npm run build`.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sub = (d) => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.html')).map((f) => `${d}/${f}`) : []);
const PAGES = ['index.html', 'work.html', 'resume.html', ...sub('services'), ...sub('work')].filter((f) => existsSync(join(ROOT, f)));
const used = new Set();
for (const f of PAGES) for (const m of readFileSync(join(ROOT, f), 'utf8').matchAll(/media\/[\w./-]+\.\w+/g)) used.add(m[0]);
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const unlisted = walk(join(ROOT, 'media')).map((p) => relative(ROOT, p)).filter((p) => !used.has(p) && !p.endsWith('.DS_Store')).sort();

const START = '# >>> unlisted media (scripts/unlisted.mjs) — generated, do not edit', END = '# <<< unlisted media';
for (const file of ['.gitignore', '.vercelignore']) {
  const path = join(ROOT, file);
  const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const kept = old.replace(new RegExp(`\\n?${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}\\n?`), '\n').trimEnd();
  writeFileSync(path, `${kept}\n\n${START}\n${unlisted.map((p) => '/' + p).join('\n')}\n${END}\n`);
}
console.log(`unlisted media: ${unlisted.length} files kept out of git + deploy (${used.size} used)`);
