# 把 .enc 資料搬到 R2

## 為什麼

`.enc` 的格式是 `base64(隨機 salt ‖ 隨機 nonce ‖ AES-GCM 密文)`。salt 跟
nonce 每次加密都重新產生 —— 這是 AES-GCM 的正確用法,不能省(nonce 重複
使用同一把 key 會直接洩漏明文,是不能妥協的紅線)。副作用是:即使底層
股票資料一個字都沒變,重新加密出來的位元組也完全不同,git 沒辦法做
delta 壓縮,每次匯出都是完整存一份新的 blob。

現在資料管線每天都在跑(`export_rs_latest.py`、`export_weinstein.py` 等),
119MB 的 `.enc` 全部這樣重新產生,repo 就以「檔案總大小 × 更新頻率」的
速度線性膨脹。

## 解法

把 `.enc` 從「隨 git 部署的靜態資產」改成「存在 R2、由 Worker 動態讀取」。
**前端不用改一行** —— `worker/index.js` 攔截同樣的路徑(例如
`/us_rs_latest.enc`),驗證 cookie 後改從 R2 讀取再回傳,瀏覽器看到的
網址、行為完全一樣。

這個改動綁在伺服器端授權 Worker 上(見 `docs/server-auth.md`)—— 兩者
是同一個 `worker/index.js`,啟用其中一個等於兩個一起啟用。沒有接上 R2
時(`env.DATA_BUCKET` 不存在),Worker 會自動退回讀取靜態資產,所以本機
`wrangler dev` 不需要先建好 bucket 就能測。

**目前尚未啟用**,`.enc` 仍在 git 裡、仍走靜態部署。在你完成下面的遷移
步驟並確認 Worker 已經接上 R2 之前,請不要把 `.enc` 從 `.gitignore` /
`.assetsignore` 移除 —— 那樣做會讓正式站當場 404(檔案不再部署,但
還沒有替代來源)。

## 遷移步驟

1. 建立 bucket(只需一次):

   ```bash
   npx wrangler r2 bucket create landing-page-member-data
   ```

   `wrangler.jsonc` 已經預先寫好對應的 `r2_buckets` 綁定。

2. 先啟用伺服器端授權 Worker(見 `docs/server-auth.md`),確認 `/api/login`
   等端點正常運作。

3. 把現有全部 `.enc` 上傳到 R2:

   ```bash
   python r2_sync.py --dry-run   # 先看看會上傳什麼
   python r2_sync.py             # 實際上傳(1854 個檔案,排除免費頁那 1 個)
   ```

4. 部署接上 R2 的 Worker:

   ```bash
   npx wrangler deploy
   ```

5. 用 Playwright 或手動測試幾個會員頁,確認資料還是拿得到(這時應該是
   從 R2 讀,而不是靜態資產)。

6. **確認沒問題之後**,才把 `.enc` 從 git 與部署中移除(跟 Task 1 移除
   明文 `.json`的做法一樣):

   ```bash
   git rm --cached '*.enc' 'cn_irm_data/*.enc' 'us_transcript_data/*.enc' \
     'us_research_data/*.enc' 'etf-report/data/*.enc'
   # hk_stocks_data_orig.enc 是免費頁資料,不受影響,不要動它
   ```

   並在 `.gitignore` / `.assetsignore` 加入對應規則。

## 之後的每日流程

現有的匯出/加密腳本(`export_rs_latest.py` 等)不用改 —— 它們照樣在
本機產生 `.enc`。差別只是最後多接一步同步:

```bash
python export_rs_latest.py
python export_rs_movers.py
python export_weinstein.py
python r2_sync.py --only us_rs_latest.enc hk_rs_latest.enc cn_rs_latest.enc \
  us_rs_movers.enc hk_rs_movers.enc cn_rs_movers.enc \
  us_weinstein_latest.enc hk_weinstein_latest.enc cn_weinstein_latest.enc
```

這幾個檔案再也不會被 git 追蹤,repo 大小跟每日更新完全脫鉤。
