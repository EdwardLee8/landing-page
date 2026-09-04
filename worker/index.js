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
 * 尚未啟用 —— 部署方式與前端改動見 docs/server-auth.md。
 */

const SESSION_COOKIE = "member_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 小時

/** 需要登入才能取得的路徑。 */
function isProtected(pathname) {
  return pathname.endsWith(".enc")
    || pathname.startsWith("/cn_irm_data/")
    || pathname.startsWith("/us_transcript_data/")
    || pathname.startsWith("/us_research_data/")
    || pathname.startsWith("/etf-report/data/");
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/login") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      if (missingConfig(env)) return json({ error: "server not configured" }, 500);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid body" }, 400);
      }
      if (!timingSafeEqual(String(body?.password ?? ""), env.MEMBER_PASSWORD)) {
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
      return json({ authenticated: ok });
    }

    if (isProtected(url.pathname)) {
      if (missingConfig(env)) return json({ error: "server not configured" }, 500);
      const ok = await verifyToken(readCookie(request, SESSION_COOKIE), env.SESSION_SECRET);
      if (!ok) return json({ error: "需要登入" }, 401);
    }

    return env.ASSETS.fetch(request);
  },
};
