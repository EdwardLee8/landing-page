# 伺服器端會員授權

## 為什麼需要

目前會員資料的保護只有一層前端加密:`.enc` 檔對所有人開放下載,只是需要
密碼才能解開。這代表:

- 密碼一旦流出(會員轉發、有人翻查頁面原始碼),所有歷史與未來資料都守不住;
- 無法針對個別會員停權,只能全站換密碼、重新加密全部檔案;
- 無從得知誰在什麼時候取用了什麼。

`worker/index.js` 把「誰可以下載 `.enc`」變成伺服器決定的事。加密層保留
作為縱深防禦 —— 就算 Worker 設定失誤導致檔案外流,內容仍是密文。

**已於 2026-09-05 啟用。** `wrangler.jsonc` 就是本文說的 Worker 設定
（原本分成兩個檔案，但 Cloudflare Workers Builds 的自動部署只會讀
`wrangler.jsonc`，一直把站台部署回沒有驗證的純靜態版本，因此已合併）。

## 運作方式

```
POST /api/login   { password }
  → 以 timing-safe 比較驗證 Worker secret MEMBER_PASSWORD
  → 發出 HttpOnly + Secure + SameSite=Lax 的簽章 cookie(HMAC-SHA256,12 小時)
  → 回應 { dataPassword },供前端解密 .enc

GET  /api/session → { authenticated: bool }
POST /api/logout  → 清除 cookie

其餘請求:
  受保護路徑(*.enc、cn_irm_data/、us_transcript_data/、
  us_research_data/、etf-report/data/)必須帶有效 cookie,否則 401。
  其他一律交給靜態資源。
```

Secret 未設定時,受保護路徑一律回 500 而非放行 —— 設定漏掉不會變成靜默
的資料外洩。

行為測試:

```bash
node worker/index.test.mjs
```

## 部署步驟

1. 設定三個 secret:

   ```bash
   npx wrangler secret put MEMBER_PASSWORD     
   npx wrangler secret put MEMBER_DATA_PASSWORD
   npx wrangler secret put SESSION_SECRET      
   ```

   - `MEMBER_PASSWORD` — 會員在登入頁輸入的密碼
   - `MEMBER_DATA_PASSWORD` — `.enc` 的 AES 密碼(即 `MEMBER_DATA_PASSWORD`
     環境變數的值)。兩者可以不同,建議不同。
   - `SESSION_SECRET` — cookie 簽章金鑰,用 `openssl rand -base64 32` 產生

2. 先在本機驗證:

   ```bash
   npx wrangler dev
   ```

3. 部署:

   ```bash
   npx wrangler deploy
   ```

## 前端需要的改動

切換後前端不再自行比對密碼雜湊,而是問伺服器。`js/member-auth.js` 需要
加入(並讓 `gate()` 改走這條路):

```js
async function login(rawPassword) {
  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: rawPassword }),
    credentials: "same-origin",
  });
  if (!r.ok) return false;
  const { dataPassword } = await r.json();
  sessionStorage.setItem("unified_auth", "1");
  sessionStorage.setItem("unified_auth_pw", dataPassword);
  return true;
}
```

同時:

- 所有 `fetch("*.enc")` 加上 `credentials: "same-origin"`,cookie 才會送出;
- `.enc` 請求要處理 401(session 過期)→ 清除 sessionStorage 並重新顯示密碼框;
- 頁面內的 `_PW_HASH` 可以整批移除 —— 驗證已經在伺服器端。

CSP 的 `connect-src 'self'` 已涵蓋 `/api/*`,不需調整。

## 之後可以再做

這層架好之後,以下才有意義:

- **逐一會員帳號**:把單一密碼換成帳號表(Cloudflare KV 或 D1),就能個別
  停權,不必全站換密碼。
- **Patreon 綁定**:以 Patreon OAuth 驗證訂閱狀態後才發 cookie,退訂即自動
  失效。
- **取用記錄**:Worker 已在請求路徑上,加上記錄即可看出異常的大量下載。
