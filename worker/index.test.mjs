/**
 * worker/index.js 的行為測試。不需要任何相依套件:
 *   node worker/index.test.mjs
 */
import worker from './index.js';

const env = {
  MEMBER_PASSWORD: 'correct-horse',
  MEMBER_DATA_PASSWORD: 'aes-pw-xyz',
  SESSION_SECRET: 'signing-secret',
  ASSETS: { fetch: async () => new Response('ASSET', { status: 200 }) },
};
const B = 'https://example.com';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
};

// 未登入取受保護檔案 → 401
let r = await worker.fetch(new Request(`${B}/us_rs_latest.enc`), env);
check('未登入取 .enc 被擋', r.status === 401, `status=${r.status}`);

r = await worker.fetch(new Request(`${B}/us_transcript_data/A.enc`), env);
check('未登入取子目錄資料被擋', r.status === 401, `status=${r.status}`);

// 公開資源照常
r = await worker.fetch(new Request(`${B}/index.html`), env);
check('公開頁面照常提供', r.status === 200 && (await r.text()) === 'ASSET');

// 錯誤密碼
r = await worker.fetch(new Request(`${B}/api/login`, {
  method: 'POST', body: JSON.stringify({ password: 'wrong' }) }), env);
check('錯誤密碼被拒', r.status === 401);
check('錯誤密碼不發 cookie', !r.headers.get('Set-Cookie'));

// 正確密碼
r = await worker.fetch(new Request(`${B}/api/login`, {
  method: 'POST', body: JSON.stringify({ password: 'correct-horse' }) }), env);
const body = await r.json();
const setCookie = r.headers.get('Set-Cookie') || '';
check('正確密碼登入成功', r.status === 200 && body.ok === true);
check('回傳解密用密碼', body.dataPassword === 'aes-pw-xyz');
check('cookie 為 HttpOnly + Secure + SameSite',
  /HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Lax/.test(setCookie));

const token = setCookie.split(';')[0].split('=').slice(1).join('=');
const authed = { headers: { Cookie: `member_session=${token}` } };

// 帶 cookie 取資料
r = await worker.fetch(new Request(`${B}/us_rs_latest.enc`, authed), env);
check('登入後可取 .enc', r.status === 200 && (await r.text()) === 'ASSET');

r = await worker.fetch(new Request(`${B}/api/session`, authed), env);
check('session 端點回報已登入', (await r.json()).authenticated === true);

// 竄改簽章
const tampered = { headers: { Cookie: `member_session=${token.slice(0, -3)}xyz` } };
r = await worker.fetch(new Request(`${B}/us_rs_latest.enc`, tampered), env);
check('簽章被竄改則拒絕', r.status === 401);

// 偽造未過期時間但無有效簽章
r = await worker.fetch(new Request(`${B}/us_rs_latest.enc`, {
  headers: { Cookie: `member_session=99999999999.fakesig` } }), env);
check('偽造 token 被拒', r.status === 401);

// 過期 token
const expiredPayload = String(Math.floor(Date.now() / 1000) - 10);
const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode('signing-secret'),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const sigBytes = await crypto.subtle.sign('HMAC', keyMat, new TextEncoder().encode(expiredPayload));
let s = ''; for (const b of new Uint8Array(sigBytes)) s += String.fromCharCode(b);
const sig = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
r = await worker.fetch(new Request(`${B}/us_rs_latest.enc`, {
  headers: { Cookie: `member_session=${expiredPayload}.${sig}` } }), env);
check('簽章有效但已過期則拒絕', r.status === 401);

// 未設定 secret 時必須失敗而非放行
r = await worker.fetch(new Request(`${B}/us_rs_latest.enc`), { ASSETS: env.ASSETS });
check('未設定 secret 時不放行', r.status === 500, `status=${r.status}`);

// 登出
r = await worker.fetch(new Request(`${B}/api/logout`, { method: 'POST' }), env);
check('登出清除 cookie', /Max-Age=0/.test(r.headers.get('Set-Cookie') || ''));

// ── 免費頁的資料檔不應被會員 cookie 檔住 ──────────────────────────
// hk-stocks-db.html 用頁面自帶密碼(非會員密碼),不登入也該拿得到。
r = await worker.fetch(new Request(`${B}/hk_stocks_data_orig.enc`), env);
check('免費頁資料不需 cookie', r.status === 200 && (await r.text()) === 'ASSET',
  `status=${r.status}`);

// ── 接上 R2 之後,受保護路徑改從 R2 讀,不再走 ASSETS ──────────────
const fakeBucket = {
  store: new Map([['us_rs_latest.enc', 'r2-content']]),
  async get(key) {
    if (!this.store.has(key)) return null;
    const body = this.store.get(key);
    return {
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
      }),
      httpEtag: '"fake-etag"',
      writeHttpMetadata() {},
    };
  },
};
const envWithR2 = { ...env, DATA_BUCKET: fakeBucket };

r = await worker.fetch(new Request(`${B}/us_rs_latest.enc`, authed), envWithR2);
check('接上 R2 後,登入可從 R2 取得資料',
  r.status === 200 && (await r.text()) === 'r2-content', `status=${r.status}`);

r = await worker.fetch(new Request(`${B}/us_rs_latest.enc`), envWithR2);
check('接上 R2 後,未登入仍被擋', r.status === 401);

r = await worker.fetch(new Request(`${B}/hk_rs_latest.enc`, authed), envWithR2);
check('R2 裡不存在的物件回 404', r.status === 404, `status=${r.status}`);

// ── /api/login 節流(每分鐘上限 + 24 小時累計錯誤上限) ──────────────
function fakeKv() {
  const store = new Map();
  return {
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); },
  };
}
const loginReq = (password, ip) => new Request(`${B}/api/login`, {
  method: 'POST', body: JSON.stringify({ password }),
  headers: { 'CF-Connecting-IP': ip },
});

const envRateLimit = { ...env, LOGIN_RATE_LIMIT: fakeKv() };
for (let i = 0; i < 10; i++) {
  r = await worker.fetch(loginReq('wrong', '1.2.3.4'), envRateLimit);
}
check('每分鐘上限之內仍正常回應(401)', r.status === 401, `status=${r.status}`);
r = await worker.fetch(loginReq('wrong', '1.2.3.4'), envRateLimit);
check('超過每分鐘上限回 429', r.status === 429, `status=${r.status}`);
r = await worker.fetch(loginReq('wrong', '9.9.9.9'), envRateLimit);
check('另一個 IP 唔受影響', r.status === 401, `status=${r.status}`);

const kvFailLimit = fakeKv();
await kvFailLimit.put('fail:5.5.5.5', '100');
const envFailLimit = { ...env, LOGIN_RATE_LIMIT: kvFailLimit };
r = await worker.fetch(loginReq('correct-horse', '5.5.5.5'), envFailLimit);
check('24 小時內累計 100 次錯誤後,即使密碼啱都鎖住', r.status === 429, `status=${r.status}`);

console.log(`\n${pass} 通過, ${fail} 失敗`);
process.exit(fail ? 1 : 0);
