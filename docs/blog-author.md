# 免費文章與作者後台

## 頁面

- `/blog/`：黑金卡片式免費文章頁，搜尋、內容來源及分類篩選。
- `/blog/author/`：作者登入、直接寫作、匯入 `.md` / `.markdown` / `.txt`、預覽、草稿、公開發佈及備份匯出。
- `/blog/p/{uuid}`：新文章的公開全文頁，由 Worker 產生 HTML。
- `/blog/sitemap.xml`：只列出已發佈的本站文章。

以往免費內容直接使用 `js/content.js` 的 `SITE_CONTENT.articles`（目前 8 個入口）。不載入 `web_data.json` 的 504 篇 Patreon 摘要，不把摘要冒充全文。以往原文不在 repo 的文章保留原站連結；原有其他頁面的 Patreon archive 不受影響。

## 一次性啟用

沿用目前 Cloudflare Worker，無需遷移網站或重新建立會員系統。

1. 在 Cloudflare 的 `landing-page` Worker → Settings → Variables and Secrets，新增 **Secret** `BLOG_ADMIN_PASSWORD`。使用至少 16 字元的獨立長密碼，不可與會員密碼相同。不要把密碼貼到 GitHub、聊天或前端程式。
2. 保留既有 `SESSION_SECRET`、`LOGIN_LIMITER` 及 `LOGIN_RATE_LIMIT` bindings。
3. 部署含此變更的版本；現有 master 分支的 Workers Builds 流程會處理部署。
4. 前往 `/blog/author/` 登入，寫一篇草稿、重新載入，再發佈並於另一個未登入的瀏覽器核對全文。

也可在可信任終端機執行 `npx wrangler secret put BLOG_ADMIN_PASSWORD`，由互動提示輸入。缺少作者密碼、簽章金鑰或登入節流器時，登入會回 503，不會沿用會員密碼。密碼輪換會使所有作者 cookie 失效。

## 儲存與一致性

優先使用選配的 `BLOG_STORE` KV binding；未配置時沿用已存在的 `LOGIN_RATE_LIMIT` namespace，以 `blog:v1:draft:` 和 `blog:v1:published:` 分開儲存。文章**不設 TTL**，與既有 `rl:`、`sub:` key 互不覆蓋。不要清空整個登入節流 namespace；如需整理，只清理 `rl:` 前綴。

每篇文章獨立 key，完整正文在 value，公開索引使用 metadata，不建立可被並行覆蓋的共用文章清單。發佈時只寫 published copy，編輯草稿不會修改公開全文。前端只在 KV 寫入成功後顯示成功；失敗時保留編輯器內容，可匯出備份。

此版本適用於單一作者、低頻發文。KV 為最終一致，發佈／更新可能需約一分鐘或更久才在所有地區可見。不要跨裝置同時編輯同篇文章；版本欄位只提供盡力而為的舊分頁衝突偵測，並非交易鎖。需要多人即時協作、保證立即撤文或強一致編輯時，應改用 D1／Durable Objects。

參考：[Cloudflare KV 寫入與一致性](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)。

如日後新增獨立 `BLOG_STORE`，先把全部 `blog:v1:` key（連 metadata）複製至新 namespace，再切換 binding；直接切換空庫會使現有文章暫時消失。

## 編輯及發佈

- 匯入最多 350 KB 的 UTF-8 Markdown／文字檔；不支援 Word、PDF 或圖片附件。
- 正文最多 120,000 字元；整個 API 請求最大 512 KB。
- 標題 100 字元、摘要 120 字元、分類 24 字元；metadata 超過 KV 1,024 bytes 時顯示縮短提示。
- 支援段落、標題、粗體、清單、引用、程式碼和連結；原始 HTML 永遠當文字顯示。
- 匯入只填入編輯器；按儲存草稿才持久保存，按確認發佈才公開全文。
- 本版不提供刪除／撤文；公開後有需要可修改並重新發佈。
- 備份匯出為 Markdown，包含標題及內文，分類與摘要留在網站儲存。

## 授權邊界與測試

作者使用獨立 `__Host-blog_author` HttpOnly / Secure / SameSite=Strict cookie，8 小時到期。所有寫入驗證 Origin；作者 API 驗證 cookie，會員 cookie 無作者權限。API 不設共用快取；公開全文只讀 published key。上載不接受可執行 HTML，連結僅接受 HTTP(S) 及安全站內路徑。

執行 `node worker/index.test.mjs`（現有會員／路由回歸）及 `node --test worker/blog.test.mjs`（草稿隔離、發佈、授權、節流、CSRF、大小上限、錯誤處理及 HTML escaping）。KV 測試替身不模擬全球最終一致或生產限額，正式啟用仍須做上述一次部署後核對。

Netlify 靜態部署不會執行此 Worker，作者後台需使用現有 Cloudflare 部署。
