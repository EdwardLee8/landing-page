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

import { handleBlog } from './blog.js';

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

// ── 電郵訂閱 ────────────────────────────────────────────────────────
// 沒有另外開一個 KV namespace,借用現有 LOGIN_RATE_LIMIT(key 前綴
// "sub:" 跟登入節流的 "rl:" 不會撞)。每個電郵一個 key、值係訂閱時間,
// 寫入互不影響,唔會有並發覆蓋的問題;要匯出名單用
// `wrangler kv key list --binding LOGIN_RATE_LIMIT --prefix sub:`。
const subKey = (email) => `sub:${email.toLowerCase()}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// ── 乾淨網址 ────────────────────────────────────────────────────────
// 網站原本是 24 個 .html 平鋪在根目錄,網址像 /hk-rs-rating.html,而且
// 命名沒有規則(-db 後綴有的免費有的付費、日期寫死在檔名裡)。這裡把對外
// 網址整理成有層次的形式,實體檔案位置不動 —— 檔案搬家會弄斷資料的相對
// 路徑與各處內部連結,風險遠大於收益。
//
// assets 設定了 run_worker_first,所有請求都會先到這裡,所以 _redirects
// 不一定生效,轉址一律在這裡處理。
const CLEAN_URLS = {
  "/blog/":                     "/blog.html",
  "/blog/author/":              "/blog-author.html",
  "/member/":                   "/login.html",
  "/member/rs/hk":              "/hk-rs-rating.html",
  "/member/rs/us":              "/us-rs-rating.html",
  "/member/rs/cn":              "/cn-rs-rating.html",
  "/member/movers":             "/movers.html",
  "/member/keywords/hk":        "/hk-keywords-pro.html",
  "/member/keywords/hk-full":   "/hk-keywords.html",
  "/member/keywords/us":        "/us-keywords.html",
  "/member/keywords/cn":        "/cn-keywords.html",
  "/member/stocks/hk":          "/hk-stocks-pro.html",
  "/member/stocks/us":          "/us-stocks-db.html",
  "/member/outlook-2026":       "/hk-h1-2026-db.html",
  "/member/outlook-2026/top3":  "/hk-h1-2026-industry-top3.html",
  "/member/transcripts":        "/us-transcript-db.html",
  "/member/research":           "/us-research-reports-db.html",
  "/member/irm":                "/cn-irm-db.html",
  "/free/":                     "/free-tools.html",
  "/free/stocks/hk":            "/hk-stocks-db.html",
  "/free/keywords/hk":          "/hk-keywords-free.html",
  "/free/themes":               "/theme-strength-dashboard.html",
  "/free/outlook-2026-archive": "/hk-h1-2026-archive-20260820.html",
  "/free/sp500-top20":          "/sp500-top20-reports.html",
};

// 反向表:舊的 .html 網址 301 轉到新網址,書籤與外部連結不會斷。
const LEGACY_REDIRECTS = Object.fromEntries(
  Object.entries(CLEAN_URLS).map(([clean, file]) => [file, clean]),
);

/** 把乾淨網址正規化:去掉結尾斜線以外的差異。 */
function lookupClean(pathname) {
  if (CLEAN_URLS[pathname]) return CLEAN_URLS[pathname];
  // /member 與 /member/ 視為同一個
  const withSlash = pathname.endsWith("/") ? pathname : pathname + "/";
  if (CLEAN_URLS[withSlash]) return CLEAN_URLS[withSlash];
  const withoutSlash = pathname.replace(/\/$/, "");
  return CLEAN_URLS[withoutSlash] || null;
}

// Cloudflare 嘅靜態資產層自己都有一套「.html 網址 → 去掉副檔名」的自動
// 轉址(html_handling,預設 auto-trailing-slash),同呢個檔案自己嘅
// CLEAN_URLS/LEGACY_REDIRECTS 完全獨立、互不知道對方存在。大部分情況
// 兩者唔會打架,但 "/blog/" 呢個乾淨網址剛好同「去掉 .blog.html 副檔名」
// 之後嘅結果(/blog)撞埋一齊,變成:
//   /blog → (呢個檔案)rewrite 去 /blog.html → (Cloudflare)轉址去 /blog
//   → 又行番呢個檔案 → 又 rewrite 去 /blog.html → 無限循環,瀏覽器見到
//   ERR_TOO_MANY_REDIRECTS。
// 唔可以成個網站關咗 html_handling(改成 "none"):首頁 "/" 、
// "/hk-top100-reports/" 呢啲靠 Cloudflare 自動揾 index.html 嘅目錄式網址
// 會即刻連帶壞晒。所以喺呢度攔截:如果內部 fetch 資產返嚟嘅係轉址,
// 我哋自己跟埋佢(伺服器端),唔會將轉址交返俾瀏覽器 —— 瀏覽器見到嘅
// 網址永遠係原本嗰個乾淨網址,唔會再彈嚟彈去。
async function fetchAssetFollowingRedirects(env, request) {
  let current = request;
  for (let hop = 0; hop < 5; hop++) {
    const res = await env.ASSETS.fetch(current);
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("Location") : null;
    if (!location) return res;
    current = new Request(new URL(location, current.url).toString(), current);
  }
  return env.ASSETS.fetch(current);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const blogResponse = await handleBlog(request, env);
    if (blogResponse) return blogResponse;

    // 舊的 .html 網址 → 301 到新網址
    const redirectTo = LEGACY_REDIRECTS[url.pathname];
    if (redirectTo) {
      return Response.redirect(new URL(redirectTo + url.search, url).toString(), 301);
    }

    // 乾淨網址 → 內部改抓實體檔案(網址列維持乾淨的那個)
    const target = lookupClean(url.pathname);
    if (target) {
      const assetFor = (p) =>
        fetchAssetFollowingRedirects(env, new Request(new URL(p + url.search, url).toString(), request));
      // Cloudflare 資產層預設會將 /x.html 轉址去 /x(html_handling),
      // 所以直接攞 /x 就慳返嗰一跳。萬一將來個設定改咗、/x 揾唔到,
      // 就退回原本嘅 .html —— 唔會因為呢個優化而爆晒所有乾淨網址。
      const bare = target.replace(/\.html$/, "");
      if (bare !== target) {
        const res = await assetFor(bare);
        if (res.status !== 404) return res;
      }
      return assetFor(target);
    }

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

    if (url.pathname === "/api/subscribe") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      if (env.LOGIN_LIMITER) {
        const { success } = await env.LOGIN_LIMITER.limit({ key: `sub:${ip}` });
        if (!success) return json({ error: "請求太頻密,請稍後再試" }, 429);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid body" }, 400);
      }
      const email = String(body?.email ?? "").trim();
      if (!EMAIL_RE.test(email) || email.length > 254) {
        return json({ error: "電郵格式不正確" }, 400);
      }
      const kv = env.LOGIN_RATE_LIMIT;
      if (kv) {
        const writing = kv.put(subKey(email), new Date().toISOString());
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(writing);
        else await writing;
      }
      return json({ ok: true });
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

    return fetchAssetFollowingRedirects(env, request);
  },
};
