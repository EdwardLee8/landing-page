#!/usr/bin/env python3
"""由會員資料產生「支持創作」層嘅原始 CSV 下載。

點解要有呢個腳本:
    所有資料庫本來只喺網頁睇得到,download 唔到 —— 想自己用 Excel 跑
    一次、或者接落自己個模型,冇門。「支持創作」層之前三個賣點冇一個
    係真正獨有(「付費訂閱全部內容」即係同 Pro 一樣),所以攞原始檔落
    機做呢層嘅實際內容:邊際成本近乎零,但係 Pro 確實冇。

安全:
    產出嘅 .csv.enc 同其他會員資料一樣用 AES-256-GCM 加密(enc_utils),
    再由 worker 按 cookie 角色擋 —— 淨係 supporter session 拎得到
    /exports/ 底下嘅嘢(見 worker/index.js 嘅 isSupporterOnly)。
    明文 CSV 唔會寫入 repo,只存在記憶體。

用法:
    export MEMBER_DATA_PASSWORD='...'
    python3 scripts/build_supporter_exports.py

    資料更新之後要再跑一次。
"""
import csv
import gzip
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import enc_utils  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "exports")

# (輸出檔名, 來源 .enc, 取哪一層, 中文說明)
# path=None 代表個檔本身就係 list。
TABLES = [
    ("hk_stocks_h2_2025", "hk_stocks_data.enc", None,
     "港股業績資料庫(2025 下半年):收入／毛利增長、相對恒指表現、RS 評分、"
     "四種分類。type_1m / type_3m 係按「增長 ≥ 10% × RS 百分位 ≥ 50」分"
     "(1個月用 rs_5d、3個月用 rs_composite);beat_1m / beat_3m 係舊版指標"
     "(單純 vs 恒指正負),同標籤唔一定夾"),
    ("us_stocks", "us_stocks_data.enc", None,
     "美股業績資料庫:收入／毛利增長、相對大市表現"),
    ("hk_rs_ratings", "hk_rs_latest.enc", ["ratings"],
     "港股相對強弱評分:5/10/20/30/50/100/200/365 日八個時間框 + 綜合評分"),
    ("us_rs_ratings", "us_rs_latest.enc", ["ratings"],
     "美股相對強弱評分:同上八個時間框"),
    ("cn_rs_ratings", "cn_rs_latest.enc", ["ratings"],
     "A 股相對強弱評分:同上八個時間框"),
    ("hk_weinstein_stages", "hk_weinstein_latest.enc", ["stages"],
     "港股 Weinstein 四階段分析:階段、信心度、四個分數、30 週線關係"),
    ("us_weinstein_stages", "us_weinstein_latest.enc", ["stages"],
     "美股 Weinstein 四階段分析"),
    ("cn_weinstein_stages", "cn_weinstein_latest.enc", ["stages"],
     "A 股 Weinstein 四階段分析"),
    ("hk_outlook_2026", "hk_h1_2026_data.enc", ["rows"],
     "港股 2026 中期業績前景庫:評分、財務主線、催化劑、風險、6–18 個月展望"),
    ("us_transcripts_index", "us_transcript_index.enc", None,
     "美股業績電話會議索引:指引變化、情緒分數、管理層語氣、主題關鍵字"),
    ("cn_irm_index", "cn_irm_index.enc", None,
     "A 股互動易調研索引:公司、記錄數、日期範圍"),
]

# 關鍵字庫係巢狀(每間公司一堆關鍵字)。攤平做長表先入到 Excel,但業務
# 摘要唔可以跟住每一行複製 —— 一間公司平均十幾個關鍵字,摘要重複十幾
# 次,單係港股就由 1MB 谷到 11MB。所以拆兩個檔:公司一個、關鍵字一個,
# 用 symbol 對返(VLOOKUP / merge 都方便過一個大闊表)。
KEYWORD_TABLES = [
    ("hk", "hk_keywords_export.enc", "港股"),
    ("us", "us_keywords_export.enc", "美股"),
    ("cn", "cn_keywords_export.enc", "A 股"),
]


def cell(v):
    """CSV 每格都要係一個純量。list/dict 攤平,唔好寫 Python repr 落去。"""
    if v is None:
        return ""
    if isinstance(v, (list, tuple)):
        return "; ".join(cell(x) for x in v)
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    return v


def columns(rows):
    """欄序以第一筆為準,之後出現嘅新欄接喺後面 —— 唔好每次跑都調位。"""
    order, seen = [], set()
    for r in rows:
        for k in r:
            if k not in seen:
                seen.add(k)
                order.append(k)
    return order


def to_csv(rows):
    cols = columns(rows)
    buf = io.StringIO()
    # BOM:冇佢 Excel 會將 UTF-8 中文當成亂碼
    buf.write("﻿")
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore", lineterminator="\r\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: cell(r.get(k)) for k in cols})
    return buf.getvalue()


def load(password, source, path):
    data = json.loads(enc_utils.decrypt_file(os.path.join(ROOT, source), password))
    for step in (path or []):
        data = data[step]
    if not isinstance(data, list):
        raise SystemExit(f"{source}{path} 唔係 list,係 {type(data).__name__}")
    return data


def split_keywords(companies):
    """→ (公司表, 關鍵字長表)。兩張表用 symbol 對返。"""
    firms, kws = [], []
    for co in companies:
        symbol = co.get("s", "")
        items = co.get("kws") or []
        firms.append({
            "symbol": symbol,
            "name": co.get("n", ""),
            "name_en": co.get("nz", ""),
            "sector": co.get("sec", ""),
            "industry": co.get("ind", ""),
            "market_cap": co.get("mcap", ""),
            "keyword_count": len(items),
            "summary": co.get("sum", ""),
        })
        for kw in items:
            kws.append({"symbol": symbol, "name": co.get("n", ""),
                        "keyword_en": kw.get("e", ""),
                        "keyword_zh": kw.get("z", ""),
                        "weight": kw.get("w", "")})
    return firms, kws


def write(name, desc, rows, password, manifest):
    """CSV → gzip → AES-GCM → .csv.gz.enc。

    先 gzip 先加密:CSV 壓得好勁(成套由 53MB 變 6MB),而且每次重新產生
    都係一份全新密文,唔壓縮嘅話 git 每次會多幾十 MB。瀏覽器嗰邊用
    DecompressionStream("gzip") 解返(見 member-downloads.js)。
    """
    body = to_csv(rows).encode("utf-8")
    packed = gzip.compress(body, mtime=0)  # mtime=0:同樣資料要產生同樣輸出
    target = os.path.join(OUT_DIR, name + ".csv.gz.enc")
    enc_utils.encrypt_data(packed, target, password)
    size = os.path.getsize(target)
    manifest.append({"file": name + ".csv.gz.enc", "name": name + ".csv",
                     "desc": desc, "rows": len(rows), "bytes": size,
                     "plain_bytes": len(body)})
    print(f"  {name + '.csv':28} {len(rows):>7,} 行  "
          f"明文 {len(body) / 1024:>7,.0f}KB → 封裝 {size / 1024:>6,.0f}KB")


def build():
    password = enc_utils.get_password()
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = []

    for name, source, path, desc in TABLES:
        src = os.path.join(ROOT, source)
        if not os.path.exists(src):
            print(f"  !! 揾唔到 {source},跳過")
            continue
        write(name, desc, load(password, source, path), password, manifest)

    for market, source, label in KEYWORD_TABLES:
        src = os.path.join(ROOT, source)
        if not os.path.exists(src):
            print(f"  !! 揾唔到 {source},跳過")
            continue
        firms, kws = split_keywords(load(password, source, None))
        write(f"{market}_companies", f"{label}公司資料:行業、市值、業務摘要、關鍵字數目",
              firms, password, manifest)
        write(f"{market}_keywords", f"{label}業務關鍵字長表:一行一個關鍵字,用 symbol 對返公司表",
              kws, password, manifest)

    # 港股行先(網站主場),再美股、A 股。純字母排序會變成 cn_ 打頭,
    # 大部分讀者最想要嗰幾個反而要碌到最底。
    order = {"hk": 0, "us": 1, "cn": 2}
    manifest.sort(key=lambda m: (order.get(m["name"][:2], 9), m["name"]))
    enc_utils.encrypt_data(json.dumps(manifest, ensure_ascii=False),
                           os.path.join(OUT_DIR, "index.json.enc"), password)
    total = sum(m["bytes"] for m in manifest)
    print(f"\n{len(manifest)} 個 CSV,合共 {total / 1024 / 1024:.1f}MB(已加密)")
    print(f"輸出:{OUT_DIR}")

    plain = [f for f in os.listdir(OUT_DIR) if not f.endswith(".enc")]
    if plain:
        raise SystemExit(f"停手:{OUT_DIR} 有未加密檔案 {plain}")
    print("已確認 exports/ 只有加密檔。")


if __name__ == "__main__":
    build()
