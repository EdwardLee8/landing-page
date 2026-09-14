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
    或 SUPPORTER_PASSWORD(兩個都會比較,唔 short-circuit)
  → 發出 HttpOnly + Secure + SameSite=Lax 的簽章 cookie(HMAC-SHA256,12 小時)
    payload = `<到期時間>|<角色>`,角色 m = 會員、s = 支持創作層
  → 回應 { dataPassword, supporter: bool },供前端解密 .enc

GET  /api/session → { authenticated: bool, supporter: bool, dataPassword }
POST /api/logout  → 清除 cookie

其餘請求:
  受保護路徑(*.enc、exports/、cn_irm_data/、us_transcript_data/、
  us_research_data/、etf-report/data/)必須帶有效 cookie,否則 401。
  當中 exports/ 再多一層:角色唔係 s 就 403。
  其他一律交給靜態資源。
```

### 兩個層點分

Patreon 有「付費訂閱」同「支持創作」兩個層,但網站本來只有一個密碼,
分唔到邊個係邊個。所以另開一個 `SUPPORTER_PASSWORD`:兩個密碼都登入
得到、網站內容一樣睇得晒,分別淨係 `/exports/`(原始 CSV 下載)只有
supporter 拎得到。

舊 cookie 嘅 payload 淨係一個到期時間(未有角色概念嗰陣簽嘅),一樣係
有效簽名,當作會員 —— 唔係嘅話一部署就會踢晒所有登入緊嘅人出去。12
小時之後全部自然過期。

Secret 未設定時,受保護路徑一律回 500 而非放行 —— 設定漏掉不會變成靜默
的資料外洩。

行為測試:

```bash
node worker/index.test.mjs
```

## 支持者 CSV 下載

`/exports/*.csv.gz.enc` 由 `scripts/build_supporter_exports.py` 產生:

```bash
export MEMBER_DATA_PASSWORD='...'
python3 scripts/build_supporter_exports.py
```

會由各個會員 `.enc` 抽資料 → CSV(帶 UTF-8 BOM,Excel 開中文唔亂碼)
→ gzip → AES-256-GCM 加密。明文由頭到尾唔落地,避免手多 commit 入
public repo;腳本最後會檢查 `exports/` 有冇未加密嘅檔。

資料更新之後要再跑一次,否則下載嘅係舊資料。

## 部署步驟

1. 設定四個 secret:

   ```bash
   npx wrangler secret put MEMBER_PASSWORD     
   npx wrangler secret put MEMBER_DATA_PASSWORD
   npx wrangler secret put SUPPORTER_PASSWORD  
   npx wrangler secret put SESSION_SECRET      
   ```

   - `MEMBER_PASSWORD` — 會員在登入頁輸入的密碼
   - `MEMBER_DATA_PASSWORD` — `.enc` 的 AES 密碼(即 `MEMBER_DATA_PASSWORD`
     環境變數的值)。兩者可以不同,建議不同。
   - `SUPPORTER_PASSWORD` — 「支持創作」層嘅密碼,只多咗 `/exports/` 權限。
     一定要同 `MEMBER_PASSWORD` 唔同,否則分唔到兩個層。未設定嗰陣冇人
     拎到 `/exports/`(403),其餘一切照常。
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
