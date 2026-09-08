import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const companies = JSON.parse(read('hk-top100-reports/data/companies.json')).companies;
const pages = ['index.html', 'free-tools.html', 'about.html', 'research/index.html', 'research/briefing/index.html', 'archive/index.html', ...companies.map(c => `research/hk/${c.symbol}/index.html`)];
const origin = 'https://ai10xpro.com';
const assets = { fetch: async request => {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  let file = resolve(root, '.' + pathname);
  if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
  if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, 'index.html');
  return new Response(existsSync(file) ? readFileSync(file) : null, { status: existsSync(file) ? 200 : 404 });
} };
let links = 0;
const checked = new Set();
for (const path of pages) {
  const html = read(path);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${path}: one main heading`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `${path}: unique IDs`);
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), `${path}: no template placeholders`);
  assert.ok(/name="description" content="[^"]+"/.test(html));
  const canonical = html.match(/rel="canonical" href="([^"]+)"/)[1];
  assert.ok(canonical.startsWith(origin + '/'));
  assert.ok(html.includes(`property="og:url" content="${canonical}"`));
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = m[1].replace(/&amp;/g, '&');
    if (!raw.startsWith('/') && !raw.startsWith('#')) continue;
    const url = new URL(raw, canonical);
    if (url.pathname === new URL(canonical).pathname && url.hash) {
      assert.ok(ids.includes(decodeURIComponent(url.hash.slice(1))), `${path}: missing anchor ${raw}`);
    }
    if (checked.has(url.pathname)) continue;
    checked.add(url.pathname);
    const response = await worker.fetch(new Request(url), { ASSETS: assets });
    assert.ok(response.status === 200 || response.status === 301, `${path}: broken internal link ${raw} (${response.status})`);
    links++;
  }
}
for (const c of companies) {
  const html = read(`research/hk/${c.symbol}/index.html`);
  assert.ok(html.includes(c.code), `${c.symbol}: company identifier`);
  const [, year, month, day] = c.file.match(/_(\d{4})(\d{2})(\d{2})\.md$/);
  assert.ok(html.includes(`<time datetime="${year}-${month}-${day}">`), `${c.symbol}: report version date, not an IPO or accounting period date`);
  assert.ok(html.includes('class="report-body"'), `${c.symbol}: full report`);
  assert.ok(html.length > 5000, `${c.symbol}: not an empty client-rendered shell`);
  assert.ok(read('sitemap-research.xml').includes(`${origin}/research/hk/${c.symbol}/`));
}
assert.ok(read('index.html').includes('+10%') && read('index.html').includes('+12%') && read('index.html').includes('+14%'), 'Homepage preview retains the supplied report figures');
assert.equal((read('archive/index.html').match(/data-archive-search=/g) || []).length, 504, 'All existing archive entries retained');
assert.ok(read('robots.txt').includes('Disallow: /member/'));
assert.ok(read('robots.txt').includes('Disallow: /*.enc'));
console.log(`PASS: ${pages.length} generated pages, ${companies.length} complete reports, ${links} internal paths, metadata, anchors and archive coverage.`);
