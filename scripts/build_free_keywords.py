#!/usr/bin/env python3
"""由會員版關鍵字資料產生「免費版」JSON。

背景(2026-09-05,commit 0bf487d):
    /hk_keywords_export.json 本來直接放喺公開目錄,但嗰個檔係會員版
    嘅 1.6MB 完整明文 —— 連 1,238 間公司嘅業務摘要都喺入面。安全修正
    封鎖咗個檔,但 hk-keywords-free.html 一直仲係 fetch 緊佢,所以免費
    關鍵字頁由嗰日起就壞咗(畫面顯示 "Unexpected token 'N'")。

    正解唔係解封嗰個檔(咁等於再洩漏一次),而係另外整一份真.係免費
    層嘅資料。呢個腳本就係做呢件事。

免費版同會員版嘅分別:
    欄位   免費版保留 s / n / nz / sec / kws,拿走 sum(業務摘要)
           同 ind / mcap(免費頁根本冇用)
    關鍵字 每間公司只保留權重最高嘅 8 個(會員版平均 12.3 個)

    結果:1,236 間公司全部有得搜,5,216 個獨立關鍵字,約 627KB。
    工具本身完整可用;會員版嘅價值喺完整關鍵字同業務摘要。

用法:
    export MEMBER_DATA_PASSWORD='...'      # 同 encrypt_assets.py 一樣
    python3 scripts/build_free_keywords.py

    資料更新之後(即係重新產生咗 hk_keywords_export.enc)要再跑一次。
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import enc_utils  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "hk_keywords_export.enc")
TARGET = os.path.join(ROOT, "hk_keywords_export_free.json")

# 每間公司保留幾多個關鍵字。調呢個數就可以改免費層嘅闊度:
#   6 → 497KB / 4,003 個獨立關鍵字
#   8 → 627KB / 5,216 個(目前)
#  12 → 824KB / 7,051 個
KEYWORDS_PER_COMPANY = 8

# 免費頁實際會讀嘅欄位(見 hk-keywords-free.html 的 initApp)。
# sum 係洩漏過嗰個欄位,一定唔可以入免費檔。
KEEP = ("s", "n", "nz", "sec")


def build():
    password = enc_utils.get_password()
    companies = json.loads(enc_utils.decrypt_file(SOURCE, password))

    out = []
    for co in companies:
        kws = co.get("kws") or []
        if not kws:
            continue
        top = sorted(kws, key=lambda k: -k.get("w", 0))[:KEYWORDS_PER_COMPANY]
        row = {k: co.get(k, "") for k in KEEP}
        row["kws"] = [
            {"e": k["e"], "z": k.get("z", ""), "w": round(k.get("w", 0.5), 2)}
            for k in top if k.get("e")
        ]
        out.append(row)

    with open(TARGET, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    unique = len({k["e"].lower() for c in out for k in c["kws"]})
    size = os.path.getsize(TARGET) / 1024
    print(f"{os.path.basename(TARGET)}:{len(out)} 間公司、"
          f"{unique} 個獨立關鍵字、{size:.0f}KB")

    leaked = [c for c in out if "sum" in c]
    if leaked:
        raise SystemExit(f"停手:有 {len(leaked)} 筆仲帶住 sum 欄位")
    print("已確認唔含業務摘要(sum)。")


if __name__ == "__main__":
    build()
