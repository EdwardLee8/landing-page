import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';
import { renderMarkdown, safeLink } from '../js/blog-format.js';
import { readFile } from 'node:fs/promises';
const origin = 'https://example.com';
function setup() {
  const records = new Map();
  const kv = {
    async get(k) { return records.get(k)?.value ?? null; },
    async put(k, value, options = {}) { assert.equal(options.expirationTtl, undefined, 'articles must not expire'); records.set(k, { value, metadata: options.metadata }); },
    async list({ prefix, cursor }) { const all = [...records].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })); const start = Number(cursor || 0); return { keys: all.slice(start, start + 1), list_complete: start + 1 >= all.length, cursor: String(start + 1) }; }
  };
  const env = { BLOG_ADMIN_PASSWORD: 'test-author-password-strong', MEMBER_PASSWORD: 'member-password', SESSION_SECRET: 'test-session-secret', LOGIN_RATE_LIMIT: kv, LOGIN_LIMITER: { limit: async () => ({ success: true }) }, ASSETS: { fetch: async req => new Response(new URL(req.url).pathname) } };
  const request = (path, method = 'GET', body, cookie, from = origin) => worker.fetch(new Request(origin + path, { method, headers: { Origin: from, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env);
  const login = async () => { const r = await request('/api/blog/author/login', 'POST', { password: env.BLOG_ADMIN_PASSWORD }); assert.equal(r.status, 200); return r.headers.get('Set-Cookie').split(';')[0]; };
  return { records, kv, env, request, login };
}
const article = { title: '我的免費文章', excerpt: '公開摘要', category: '研究筆記', body: '# 研究方法\n\n這是完整內容。\n\n- 先看業績\n- 再看產業' };
test('drafts remain private, publish serves full article, subsequent drafts do not change live content', async () => {
  const { request, login } = setup(), auth = await login(), id = crypto.randomUUID();
  let r = await request(`/api/blog/author/posts/${id}`, 'PUT', article, auth); assert.equal(r.status, 200); const draft = (await r.json()).post;
  assert.deepEqual((await (await request('/api/blog/posts')).json()).posts, []);
  assert.equal((await request(`/api/blog/posts/${id}`)).status, 404);
  assert.equal((await request(`/blog/p/${id}`)).status, 404);
  assert.equal((await request(`/api/blog/author/posts/${id}`)).status, 401);
  r = await request(`/api/blog/author/posts/${id}/publish`, 'POST', article, auth); assert.equal(r.status, 200); const live = (await r.json()).post;
  const html = await (await request(`/blog/p/${id}`)).text(); assert.match(html, /這是完整內容/); assert.match(html, /<h2>研究方法<\/h2>/);
  r = await request(`/api/blog/author/posts/${id}`, 'PUT', { ...article, body: 'PRIVATE NEW DRAFT', revision: draft.revision }, auth); assert.equal(r.status, 200);
  assert.equal((await (await request(`/api/blog/posts/${id}`)).json()).post.body, article.body);
  assert.doesNotMatch(await (await request('/blog/sitemap.xml')).text(), /PRIVATE/);
  r = await request(`/api/blog/author/posts/${id}`, 'GET', undefined, auth); const edit = await r.json(); assert.equal(edit.post.body, 'PRIVATE NEW DRAFT'); assert.equal(edit.publishedRevision, live.revision);
});
test('member cookies do not authorize publishing', async () => {
  const { request } = setup(); const r = await request('/api/login', 'POST', { password: 'member-password' }); const member = r.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await request('/api/blog/author/posts', 'GET', undefined, member)).status, 401);
  assert.equal((await request(`/api/blog/author/posts/${crypto.randomUUID()}/publish`, 'POST', article, member)).status, 401);
});
test('author login fails closed without independent password, signing secret or limiter', async () => {
  for (const field of ['BLOG_ADMIN_PASSWORD', 'SESSION_SECRET', 'LOGIN_LIMITER']) { const s = setup(); delete s.env[field]; assert.equal((await s.request('/api/blog/author/login', 'POST', { password: 'x' })).status, 503); }
  const s = setup(); s.env.BLOG_ADMIN_PASSWORD = s.env.MEMBER_PASSWORD; assert.equal((await s.request('/api/blog/author/login', 'POST', { password: s.env.MEMBER_PASSWORD })).status, 503);
});
test('rate limited login, secure cookies, password rotation and forged sessions', async () => {
  const s = setup(); const auth = await s.login();
  assert.equal((await (await s.request('/api/blog/author/session', 'GET', undefined, auth)).json()).authenticated, true);
  const r = await s.request('/api/blog/author/login', 'POST', { password: s.env.BLOG_ADMIN_PASSWORD }); const c = r.headers.get('Set-Cookie'); assert.match(c, /HttpOnly; Secure; SameSite=Strict/); assert.match(c, /__Host-blog_author=/);
  assert.equal((await s.request('/api/blog/author/posts', 'GET', undefined, auth + 'x')).status, 401);
  s.env.BLOG_ADMIN_PASSWORD = 'a-new-independent-password'; assert.equal((await s.request('/api/blog/author/posts', 'GET', undefined, auth)).status, 401);
  s.env.LOGIN_LIMITER.limit = async () => ({ success: false }); assert.equal((await s.request('/api/blog/author/login', 'POST', { password: s.env.BLOG_ADMIN_PASSWORD })).status, 429);
});
test('cross-origin writes and non-JSON payloads are rejected', async () => {
  const s = setup(), auth = await s.login();
  assert.equal((await s.request(`/api/blog/author/posts/${crypto.randomUUID()}`, 'PUT', article, auth, 'https://attacker.example')).status, 403);
  assert.equal((await s.request('/api/blog/author/logout', 'POST', {}, auth, 'null')).status, 403);
  const r = await worker.fetch(new Request(origin + '/api/blog/author/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' }), s.env); assert.equal(r.status, 415);
});
test('size limits, invalid fields and stale revision preserve the existing article', async () => {
  const s = setup(), auth = await s.login(), id = crypto.randomUUID();
  for (const invalid of [{ ...article, title: '' }, { ...article, title: 'x'.repeat(101) }, { ...article, body: 1 }]) assert.equal((await s.request(`/api/blog/author/posts/${id}`, 'PUT', invalid, auth)).status, 400);
  assert.equal((await s.request(`/api/blog/author/posts/${id}`, 'PUT', { ...article, body: 'x'.repeat(600000) }, auth)).status, 413);
  const r = await s.request(`/api/blog/author/posts/${id}`, 'PUT', article, auth); const first = (await r.json()).post;
  assert.equal((await s.request(`/api/blog/author/posts/${id}`, 'PUT', { ...article, body: 'overwrite', revision: 'old' }, auth)).status, 409);
  assert.equal((await (await s.request(`/api/blog/author/posts/${id}`, 'GET', undefined, auth)).json()).post.revision, first.revision);
});
test('public catalog traverses KV pages and omits body/draft content', async () => {
  const s = setup(), auth = await s.login();
  for (let i = 0; i < 3; i++) assert.equal((await s.request(`/api/blog/author/posts/${crypto.randomUUID()}/publish`, 'POST', { ...article, title: '文章' + i }, auth)).status, 200);
  const r = await s.request('/api/blog/posts'); assert.equal(r.headers.get('Cache-Control'), 'no-store'); const data = await r.json(); assert.equal(data.posts.length, 3); assert.equal(data.posts[0].body, undefined);
  const xml = await (await s.request('/blog/sitemap.xml')).text(); assert.equal((xml.match(/<url>/g) || []).length, 3);
});
test('storage failure is visible, never reported as successful saving', async () => {
  const s = setup(), auth = await s.login(); s.kv.put = async () => { throw new Error('KV unavailable'); };
  assert.equal((await s.request(`/api/blog/author/posts/${crypto.randomUUID()}`, 'PUT', article, auth)).status, 503);
  delete s.env.LOGIN_RATE_LIMIT; assert.equal((await s.request('/api/blog/posts')).status, 503);
});
test('Markdown and published metadata cannot inject scripts or dangerous URLs', async () => {
  const text = '<img src=x onerror=alert(1)>\n\n[bad](javascript:alert)\n\n**bold**\n\n```\n<script>x</script>\n```';
  const html = renderMarkdown(text); assert.doesNotMatch(html, /<script>|<img|href="javascript:/); assert.match(html, /&lt;img/); assert.match(html, /<strong>bold/);
  assert.equal(safeLink('//evil.example'), '#'); assert.equal(safeLink('data:text/html,x'), '#'); assert.equal(safeLink('/\\evil.example'), '#');
  const s = setup(), auth = await s.login(), id = crypto.randomUUID(); await s.request(`/api/blog/author/posts/${id}/publish`, 'POST', { ...article, title: '\"><script>alert(1)</script>', body: text }, auth);
  const response = await s.request(`/blog/p/${id}`); assert.match(response.headers.get('Content-Security-Policy'), /script-src 'none'/); assert.doesNotMatch(await response.text(), /<script>|<img/);
});
test('clean routes, legacy URLs and page metadata', async () => {
  const s = setup(); assert.equal(await (await s.request('/blog/')).text(), '/blog.html'); assert.equal(await (await s.request('/blog/author/')).text(), '/blog-author.html'); assert.equal((await s.request('/blog.html')).status, 301);
  assert.equal((await s.request('/blog/p/not-an-id')).status, 404);
  const publicSource = await readFile(new URL('../js/blog.js', import.meta.url), 'utf8'); assert.doesNotMatch(publicSource, /web_data|archive-grid/); assert.match(publicSource, /SITE_CONTENT\.articles/);
  const author = await readFile(new URL('../blog-author.html', import.meta.url), 'utf8'); assert.match(author, /noindex,nofollow/); assert.match(author, /\.md,.markdown,.txt/);
});
