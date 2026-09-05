"""把明文 JSON 資料加密成 .enc(AES-256-GCM + PBKDF2 100k)。

密碼由環境變數 MEMBER_DATA_PASSWORD 提供(見 .env.example),
絕不可寫死在檔案中 —— 本 repo 為 public。

用法:
    export MEMBER_DATA_PASSWORD='...'
    python encrypt_assets.py
"""
import os

import enc_utils

# 會員資料:登入後 login.html 會把原始密碼存進 sessionStorage,
# 各子頁再讀出來解密這些檔案。
FILES = [
    "hk_keywords_export.json",
    "hk_corr_clusters.json",
    "us_keywords_export.json",
    "us_corr_clusters_v2.json",
    "cn_keywords_export.json",
    "cn_corr_clusters.json",
    "us_rs_latest.json",
    "hk_rs_latest.json",
    "cn_rs_latest.json",
]


def main():
    password = enc_utils.get_password()
    base = os.path.dirname(os.path.abspath(__file__))
    print("Encrypting assets...")
    for fname in FILES:
        src = os.path.join(base, fname)
        dst = src.replace(".json", ".enc")
        enc_utils.encrypt_file(src, dst, password)
        print(f"  {fname} ({os.path.getsize(src)/1024:.0f}KB)"
              f" → {os.path.basename(dst)} ({os.path.getsize(dst)/1024:.0f}KB)")
    print("Done.")


if __name__ == "__main__":
    main()
