// Author-only publishing. Drafts and published copies use separate KV keys.
import { escapeHTML as esc, renderMarkdown } from '../js/blog-format.js';
const PREFIX = 'blog:v1:';
const COOKIE = '__Host-blog_author';
const TTL = 8 * 60 * 60;
const MAX_BYTES = 512 * 1024;
const ID = /^[0-9a-f-]{36}$/;
const enc = new TextEncoder();
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Vary': 'Cookie' };
const reply = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { ...headers, ...extra } });
const cookie = (token, age) => `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
const key = (kind, id) => `${PREFIX}${kind}:${id}`;
function equal(a, b) { if (a.length !== b.length) return false; let n = 0; for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i); return n === 0; }
async function sign(env, text) {
  // Including the author password invalidates old cookies after a password rotation.
  const k = await crypto.subtle.importKey('raw', enc.encode(`${env.SESSION_SECRET}:blog:${env.BLOG_ADMIN_PASSWORD}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function configured(env) { return typeof env.BLOG_ADMIN_PASSWORD === 'string' && env.BLOG_ADMIN_PASSWORD.length >= 16 && env.BLOG_ADMIN_PASSWORD !== env.MEMBER_PASSWORD && Boolean(env.SESSION_SECRET); }
async function authenticated(request, env) {
  if (!configured(env)) return false;
  const token = (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
  const [expiry, nonce, signature] = token.split('.');
  if (!/^\d{10}$/.test(expiry || '') || !/^[0-9a-f-]{36}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  const seconds = Math.floor(Date.now() / 1000);
  if (Number(expiry) <= seconds || Number(expiry) > seconds + TTL) return false;
  return equal(signature, await sign(env, `${expiry}.${nonce}`));
}
async function bodyJSON(request, limit = MAX_BYTES) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw Object.assign(new Error('請以 JSON 傳送內容。'), { status: 415 });
  if (Number(request.headers.get('Content-Length')) > limit) throw Object.assign(new Error('文章太大，請縮短至 512 KB 以內。'), { status: 413 });
  const reader = request.body?.getReader(); if (!reader) throw Object.assign(new Error('沒有收到內容。'), { status: 400 });
  const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw Object.assign(new Error('內容超過大小上限。'), { status: 413 }); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  try { const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error(); return data; }
  catch { throw Object.assign(new Error('內容格式不正確。'), { status: 400 }); }
}
function validate(body) {
  const limits = { title: 100, excerpt: 120, category: 24, body: 120000 };
  const post = {};
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof body[field] !== 'string' || body[field].trim().length > limit) throw Object.assign(new Error(`${field} 欄位格式或長度不正確。`), { status: 400 });
    post[field] = body[field].trim();
  }
  if (!post.title || !post.body) throw Object.assign(new Error('請填寫文章標題及內文。'), { status: 400 });
  post.category ||= '研究筆記';
  post.excerpt ||= post.body.replace(/[#*>`\[\]]/g, '').replace(/\s+/g, ' ').slice(0, 120);
  return post;
}
function metadata(post) { return { id: post.id, title: post.title, excerpt: post.excerpt, category: post.category, date: post.date, updatedAt: post.updatedAt }; }
async function catalogue(kv, kind) {
  const entries = []; let cursor;
  do {
    const page = await kv.list({ prefix: key(kind, ''), limit: 1000, ...(cursor ? { cursor } : {}) });
    entries.push(...page.keys.map(k => k.metadata).filter(m => m && ID.test(m.id)));
    if (page.list_complete) break;
    if (!page.cursor || page.cursor === cursor) throw new Error('KV pagination failed');
    cursor = page.cursor;
  } while (true);
  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function readPost(kv, kind, id) { const raw = await kv.get(key(kind, id)); return raw ? JSON.parse(raw) : null; }

export async function handleBlog(request, env) {
  const url = new URL(request.url), path = url.pathname;
  const articlePage = path.match(/^\/blog\/p\/([0-9a-f-]{36})\/?$/);
  const isSitemap = path === '/blog/sitemap.xml';
  if (!(path === '/api/blog' || path.startsWith('/api/blog/') || path.startsWith('/blog/p/') || isSitemap)) return null;
  try {
    const method = request.method;
    const storage = env.BLOG_STORE || env.LOGIN_RATE_LIMIT;
    if (isSitemap) {
      if (!['GET', 'HEAD'].includes(method)) return reply({ error: '不支援此操作。' }, 405);
      if (!storage) return reply({ error: '文章服務尚未啟用。' }, 503);
      const posts = await catalogue(storage, 'published');
      const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${posts.map(p => `<url><loc>https://ai10xpro.com/blog/p/${esc(p.id)}</loc><lastmod>${esc(p.updatedAt)}</lastmod></url>`).join('')}</urlset>`;
      return new Response(method === 'HEAD' ? null : xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (path.startsWith('/blog/p/')) {
      if (!['GET', 'HEAD'].includes(method)) return reply({ error: '不支援此操作。' }, 405);
      if (!storage) return reply({ error: '文章服務尚未啟用。' }, 503);
      const post = articlePage ? await readPost(storage, 'published', articlePage[1]) : null;
      const title = post?.title || '找不到文章';
      const html = `<!doctype html><html lang="zh-Hant-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}｜Edward LEE</title><meta name="description" content="${esc(post?.excerpt || '文章尚未發佈或不存在。')}">${post ? `<link rel="canonical" href="https://ai10xpro.com/blog/p/${esc(post.id)}"><meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(post.excerpt)}"><meta property="og:url" content="https://ai10xpro.com/blog/p/${esc(post.id)}">` : '<meta name="robots" content="noindex">'}<link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/blog.css?v=1"></head><body class="blog-theme"><header class="blog-nav"><a class="brand" href="/blog/"><span class="mark">10×</span> EDWARD LEE</a><nav><a href="/blog/">免費文章</a><a href="/free/">研究工具</a></nav></header><main class="reader"><a class="back" href="/blog/">← 返回免費文章</a><h1>${esc(title)}</h1>${post ? `<p class="eyebrow">Edward LEE · ${esc(post.category)} · ${esc(post.date.slice(0, 10))}</p><article class="prose">${renderMarkdown(post.body)}</article>` : '<p>文章尚未發佈或不存在，請返回文章列表。</p>'}</main><footer class="blog-footer">Edward LEE · 發掘十倍股</footer></body></html>`;
      return new Response(method === 'HEAD' ? null : html, { status: post ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" } });
    }
    if (!['GET', 'POST', 'PUT'].includes(method)) return reply({ error: '不支援此操作。' }, 405);
    if (method !== 'GET' && request.headers.get('Origin') !== url.origin) return reply({ error: '請從本站操作。' }, 403);
    const kv = env.BLOG_STORE || env.LOGIN_RATE_LIMIT;
    if (path === '/api/blog/author/session') return reply({ authenticated: await authenticated(request, env), configured: configured(env), storageReady: Boolean(kv) });
    if (path === '/api/blog/author/login') {
      if (method !== 'POST') return reply({ error: '請使用登入表格。' }, 405);
      if (!configured(env) || !env.LOGIN_LIMITER) return reply({ error: '作者登入尚未啟用，請先設定獨立作者密碼及登入保護。' }, 503);
      const { success } = await env.LOGIN_LIMITER.limit({ key: `blog-author:${request.headers.get('CF-Connecting-IP') || 'unknown'}` });
      if (!success) return reply({ error: '嘗試太頻密，請一分鐘後再試。' }, 429);
      const body = await bodyJSON(request, 4096);
      if (typeof body.password !== 'string' || !equal(body.password, env.BLOG_ADMIN_PASSWORD)) return reply({ error: '作者密碼不正確。' }, 401);
      const payload = `${Math.floor(Date.now() / 1000) + TTL}.${crypto.randomUUID()}`;
      return reply({ ok: true }, 200, { 'Set-Cookie': cookie(`${payload}.${await sign(env, payload)}`, TTL) });
    }
    if (path === '/api/blog/author/logout') {
      if (method !== 'POST') return reply({ error: '不支援此操作。' }, 405);
      return reply({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
    }
    if (!kv) return reply({ error: '文章儲存服務尚未啟用。' }, 503);
    if (path === '/api/blog/posts') {
      if (method !== 'GET') return reply({ error: '不支援此操作。' }, 405);
      const posts = await catalogue(kv, 'published');
      return reply({ posts: posts.sort((a, b) => b.date.localeCompare(a.date)) });
    }
    const publicMatch = path.match(/^\/api\/blog\/posts\/([0-9a-f-]{36})$/);
    if (publicMatch) {
      if (method !== 'GET') return reply({ error: '不支援此操作。' }, 405);
      const post = await readPost(kv, 'published', publicMatch[1]);
      return post ? reply({ post }) : reply({ error: '找不到文章，或文章尚未發佈。' }, 404);
    }
    if (!path.startsWith('/api/blog/author/')) return reply({ error: '找不到此頁。' }, 404);
    if (!await authenticated(request, env)) return reply({ error: '請先以作者身分登入。' }, 401);
    if (path === '/api/blog/author/posts' && method === 'GET') return reply({ drafts: await catalogue(kv, 'draft'), published: await catalogue(kv, 'published') });
    const editMatch = path.match(/^\/api\/blog\/author\/posts\/([0-9a-f-]{36})(\/publish)?$/);
    if (!editMatch) return reply({ error: '找不到此操作。' }, 404);
    const [, id, publish] = editMatch;
    if (method === 'GET' && !publish) {
      const draft = await readPost(kv, 'draft', id), published = await readPost(kv, 'published', id);
      const post = draft && (!published || draft.updatedAt > published.updatedAt) ? draft : published;
      return post ? reply({ post, draftRevision: draft?.revision || null, publishedRevision: published?.revision || null }) : reply({ error: '找不到文章。' }, 404);
    }
    if ((!publish && method !== 'PUT') || (publish && method !== 'POST')) return reply({ error: '不支援此操作。' }, 405);
    const data = await bodyJSON(request);
    const content = validate(data);
    const existing = await readPost(kv, publish ? 'published' : 'draft', id);
    // Best-effort stale-tab detection; KV is eventually consistent, not transactional.
    if (existing && data.revision !== existing.revision) return reply({ error: '這篇文章已有較新的版本。請先匯出備份，再重新載入文章。' }, 409);
    const other = await readPost(kv, publish ? 'draft' : 'published', id);
    const now = new Date(Math.max(Date.now(), Date.parse(existing?.updatedAt || '') + 1 || 0, Date.parse(other?.updatedAt || '') + 1 || 0)).toISOString();
    const post = { ...content, id, revision: crypto.randomUUID(), date: existing?.date || now, updatedAt: now };
    const meta = metadata(post);
    if (enc.encode(JSON.stringify(meta)).length > 1024) return reply({ error: '標題或摘要太長，請稍為縮短。' }, 400);
    await kv.put(key(publish ? 'published' : 'draft', id), JSON.stringify(post), { metadata: meta });
    return reply({ post, published: Boolean(publish), message: publish ? '已發佈；各地讀者可能稍後才看到更新。' : '草稿已儲存。' });
  } catch (error) {
    if (!error.status) console.error('Blog operation failed:', error.name || 'Error');
    return reply({ error: error.status ? error.message : '文章服務暫時無法使用，請保留內容並稍後重試。' }, error.status || 503);
  }
}
