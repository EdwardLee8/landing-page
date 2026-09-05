/**
 * 伺服器端會員授權 Worker。
 *
 * 目前網站的保護只有前端加密:.enc 對所有人開放下載,密碼一旦流出(會員
 * 轉發、頁面被翻查)就再也收不回來,而且無法針對個別會員停權。這個 Worker
 * 把「誰可以下載 .enc」變成伺服器決定的事。
 *
 * 流程:
 *   1. POST /api/login  { password }
 *      → 驗證密碼(比對 Worker secret MEMBER_PASSWORD)
 *      → 發出 HttpOnly、Secure、SameSite=Lax 的簽章 cookie
 *      → 回傳 { dataPassword } 供前端解密 .enc(仍保留加密層作為縱深防禦)
 *   2. 之後所有受保護路徑(*.enc 等)都必須帶著有效 cookie,否則 401。
 *   3. POST /api/logout 清除 cookie。
 *
 * 資料來源(可選):若綁定了 R2 bucket(env.DATA_BUCKET,見
 * wrangler.worker.jsonc 的 r2_buckets),受保護路徑會從 R2 讀取,不再
 * 從隨 git 部署的靜態資產讀取 —— 這是解決「.enc 每次重新加密都是全新
 * 內容、git 每天多存幾十 MB」的正解。沒有綁定 R2 時退回原本的靜態資產,
 * 方便本機 `wrangler dev` 不需要先建好 bucket 就能測。
 *
 * 尚未啟用 —— 部署方式與前端改動見 docs/server-auth.md 與
 * docs/r2-data-storage.md。
 */

const SESSION_COOKIE = "member_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 小時

// hk-stocks-db.html 是免費頁,用頁面自帶的另一組密碼(不是會員密碼),
// 不應該被這裡的 cookie 檢查擋下 —— 否則免費頁會連帶失效。
const PUBLIC_ENC_PATHS = new Set(["/hk_stocks_data_orig.enc"]);

/** 需要登入才能取得的路徑。 */
function isProtected(pathname) {
  if (PUBLIC_ENC_PATHS.has(pathname)) return false;
  return pathname.endsWith(".enc")
    || pathname.startsWith("/cn_irm_data/")
    || pathname.startsWith("/us_transcript_data/")
    || pathname.startsWith("/us_research_data/")
    || pathname.startsWith("/etf-report/data/")
    || pathname.startsWith("/hk_h1_2026_industry_top3_data/");
}

/** R2 object key = 拿掉開頭的 "/"。目錄結構原封不動搬過去。 */
function r2Key(pathname) {
  return pathname.replace(/^\/+/, "");
}

async function serveProtected(request, env, pathname) {
  if (!env.DATA_BUCKET) {
    // 尚未接上 R2:退回舊行為,從靜態資產讀(本機開發、或 R2 遷移前的過渡期)。
    return env.ASSETS.fetch(request);
  }
  const obj = await env.DATA_BUCKET.get(r2Key(pathname));
  if (obj === null) return new Response("Not Found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  if (!headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("cache-control", "private, max-age=3600"); // 會員資料,不给共用快取存
  return new Response(obj.body, { headers });
}

const encoder = new TextEncoder();

function base64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** 不隨內容提前結束的比較,避免以回應時間逐字元試出密碼。 */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function issueToken(secret) {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiry);
  return `${payload}.${await hmac(secret, payload)}`;
}

async function verifyToken(token, secret) {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!timingSafeEqual(signature, await hmac(secret, payload))) return false;
  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > Math.floor(Date.now() / 1000);
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function cookieHeader(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/** 缺少 secret 時必須明確失敗,不能悄悄放行。 */
function missingConfig(env) {
  return !env.MEMBER_PASSWORD || !env.SESSION_SECRET;
}

// /api/login 節流,分兩層:
//   1. 每分鐘 10 次 —— 用 Cloudflare 原生節流器(env.LOGIN_LIMITER),喺邊緣
//      即時判斷。之前用 KV 做:阻塞寫入會令每次登入慢 0.6 秒以上,改成背景
//      寫入又會因為 KV 最終一致而擋唔到連發,兩邊都唔work。
//   2. 24 小時累計 100 次密碼錯誤就鎖住 —— 用 KV(env.LOGIN_RATE_LIMIT),
//      只喺登入時讀一次,而且淨係密碼錯先寫,寫入交畀 ctx.waitUntil()。
//      登入成功嘅路徑完全冇 KV 寫入。
// 兩個 binding 都係冇綁就跳過,行為等同未加此功能前。
const LOGIN_FAIL_LIMIT = 100;
const LOGIN_STATE_TTL_SECONDS = 24 * 60 * 60;

const rateKey = (ip) => `rl:${ip}`;

/** 讀取該 IP 24 小時內的密碼錯誤次數。 */
async function readRateState(kv, ip) {
  const raw = await kv.get(rateKey(ip));
  if (!raw) return { f: 0 };
  try {
    return { f: JSON.parse(raw).f | 0 };
  } catch {
    return { f: 0 };
  }
}

/** 寫回錯誤次數。有 ctx 就唔阻塞回應,冇(測試環境)就直接等佢完成。 */
function saveRateState(ctx, kv, ip, state) {
  const writing = kv.put(rateKey(ip), JSON.stringify(state), {
    expirationTtl: LOGIN_STATE_TTL_SECONDS,
  });
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(writing);
    return null;
  }
  return writing;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/login") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      if (missingConfig(env)) return json({ error: "server not configured" }, 500);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      // 每分鐘上限:原生節流器喺邊緣即時判斷,唔使等 KV。
      if (env.LOGIN_LIMITER) {
        const { success } = await env.LOGIN_LIMITER.limit({ key: ip });
        if (!success) return json({ error: "請求太頻密,請稍後再試" }, 429);
      }
      const kv = env.LOGIN_RATE_LIMIT;
      let state = null;
      if (kv) {
        state = await readRateState(kv, ip);
        if (state.f >= LOGIN_FAIL_LIMIT) {
          return json({ error: "錯誤次數過多,已暫時鎖定,請稍後再試" }, 429);
        }
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid body" }, 400);
      }
      if (!timingSafeEqual(String(body?.password ?? ""), env.MEMBER_PASSWORD)) {
        if (kv) {
          state.f += 1;
          const pending = saveRateState(ctx, kv, ip, state);
          if (pending) await pending;
        }
        return json({ error: "密碼錯誤" }, 401);
      }
      const token = await issueToken(env.SESSION_SECRET);
      return json(
        // .enc 仍是加密的,前端要用這把密碼解開。它只交給已通過驗證的請求。
        { ok: true, dataPassword: env.MEMBER_DATA_PASSWORD || env.MEMBER_PASSWORD },
        200,
        { "Set-Cookie": cookieHeader(token, SESSION_TTL_SECONDS) },
      );
    }

    if (url.pathname === "/api/logout") {
      return json({ ok: true }, 200, { "Set-Cookie": cookieHeader("", 0) });
    }

    if (url.pathname === "/api/session") {
      if (missingConfig(env)) return json({ authenticated: false }, 200);
      const ok = await verifyToken(readCookie(request, SESSION_COOKIE), env.SESSION_SECRET);
      // 已持有有效 cookie 的人本來就可以直接下載 .enc,所以一併給回解密
      // 密碼 —— 新分頁/書籤直接開內頁時就唔使再叫一次密碼。
      if (!ok) return json({ authenticated: false });
      return json({
        authenticated: true,
        dataPassword: env.MEMBER_DATA_PASSWORD || env.MEMBER_PASSWORD,
      });
    }

    if (isProtected(url.pathname)) {
      if (missingConfig(env)) return json({ error: "server not configured" }, 500);
      const ok = await verifyToken(readCookie(request, SESSION_COOKIE), env.SESSION_SECRET);
      if (!ok) return json({ error: "需要登入" }, 401);
      return serveProtected(request, env, url.pathname);
    }

    return env.ASSETS.fetch(request);
  },
};
