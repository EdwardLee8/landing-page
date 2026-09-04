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

console.log(`\n${pass} 通過, ${fail} 失敗`);
process.exit(fail ? 1 : 0);
