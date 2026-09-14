"""基本面排名建置嘅共用部分(港股 V12.x、美股 V11.x 都用)。

兩個市場嘅模型唔一樣 —— 港股係「業務/財務/質素風險」50/30/20 加權,
美股係「基本面分(指引前) + 指引修正」相加,而且美股嗰邊有幾欄喺現有
市場快照未單列,前言明講留空。所以分數嗰部分各自驗證,但讀檔、排名、
排名變動呢啲共通嘢擺喺呢度,免得兩邊各寫一份然後靜靜地行開。
"""
import csv
import io
import re


def fail(msg):
    raise SystemExit(f"停手:{msg}")


def num(v, cast=float):
    v = (v or "").strip()
    if not v:
        return None
    try:
        return cast(float(v)) if cast is int else cast(v)
    except ValueError:
        return None


def read_csv(path):
    """讀匯出檔。回傳 (rows, 市場快照日期, 前言)。

    港股嗰份係 Big5-HKSCS、美股嗰份係 UTF-8 BOM,兩份都有幾行前言先至到
    欄名。唔好寫死跳幾行 —— 下次多咗一行註腳就會靜靜地讀錯成個檔。改為
    揾第一行含「股票代號」嗰行做欄名。
    """
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "big5hkscs", "cp950"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        fail("解唔到編碼(試過 utf-8 / big5hkscs / cp950)")

    lines = text.splitlines()
    head = next((i for i, ln in enumerate(lines[:10]) if "股票代號" in ln), None)
    if head is None:
        fail("頭 10 行揾唔到欄名行(要有「股票代號」)")
    preamble = " ".join(lines[:head])
    rows = list(csv.DictReader(io.StringIO("\n".join(lines[head:]))))
    dates = re.findall(r"\d{4}-\d{2}-\d{2}", preamble)
    return rows, (dates[-1] if dates else None), preamble


def parse(rows, colmap):
    """照 colmap [(中文欄名, key, cast)] 抽欄位。缺欄即刻停。"""
    missing = [cn for cn, _, _ in colmap if cn not in rows[0]]
    if missing:
        fail(f"CSV 缺欄位 {missing}")
    out = []
    for raw in rows:
        rec = {}
        for cn, key, cast in colmap:
            rec[key] = (raw[cn] or "").strip() if cast is str else num(raw[cn], cast)
        if rec.get("ticker"):
            out.append(rec)
    return out


def check_ranking(rows, score_key="fundamental"):
    """排名連續、同總分方向一致、排名變動對得返。

    唔可以攞自己 sort 出嚟嘅次序逐個對 rank —— 有同分(港股 3 對、美股
    66 組),邊隻排前係源頭決定,唔係我哋。所以改為檢查「按 rank 行落去,
    分數唔可以升返上去」:容納同分,但一樣捉到真正排錯。
    """
    if sorted(r["rank"] for r in rows) != list(range(1, len(rows) + 1)):
        fail("rank 唔係由 1 連續到 N")
    by_rank = sorted(rows, key=lambda r: r["rank"])
    off = [b["ticker"] for a, b in zip(by_rank, by_rank[1:])
           if b[score_key] > a[score_key] + 1e-6]
    if off:
        fail(f"排名行落去總分反而升返:{off[:5]}")

    drift = [r["ticker"] for r in rows
             if r.get("rank_prev") is not None and r.get("rank_change") is not None
             and r["rank_prev"] - r["rank"] != r["rank_change"]]
    if drift:
        fail(f"排名變動 ≠ 舊排名 − 新排名:{drift[:5]}")


def check_tickers(rows, pad=None):
    """代號唯一。港股要補到 5 位數字,美股係字母 symbol,唔補。"""
    if pad:
        for r in rows:
            r["ticker"] = r["ticker"].zfill(pad)
        odd = {r["ticker"] for r in rows
               if len(r["ticker"]) != pad or not r["ticker"].isdigit()}
        if odd:
            fail(f"ticker 唔係 {pad} 位數字:{sorted(odd)[:5]}")
    t = [r["ticker"] for r in rows]
    if len(set(t)) != len(t):
        dup = sorted({x for x in t if t.count(x) > 1})
        fail(f"有重複 ticker:{dup[:5]}")


def check_range(rows, keys, lo=0, hi=100):
    for k in keys:
        bad = [r["ticker"] for r in rows
               if r.get(k) is None or not (lo <= r[k] <= hi)]
        if bad:
            fail(f"{k} 有 {len(bad)} 筆缺失或者唔喺 {lo}–{hi}:{bad[:5]}")


def add_ref_rank(rows, score_key="ref_5050", out_key="ref_rank"):
    """由參考 50/50 綜合分排多一次,寫入 out_key。

    兩個市場嘅匯出檔前言都明講「參考50/50只作輔助,不改寫正式排名」。
    所以呢個係<b>另一個視角</b>,唔係第二個官方排名 —— 頁面同欄名都要
    標住「參考」。擺喺建置度算(唔喺前端),咁支持者下載嗰份 CSV 都有,
    而且兩邊數字一定夾得返。

    同分用並列排名(1, 2, 2, 4):美股有 318 組同分,夾硬逐隻畀唔同名次
    等於憑空作一個先後出嚟。港股冇同分,行為一樣。
    """
    scored = [r for r in rows if r.get(score_key) is not None]
    for r in rows:
        r[out_key] = None
    for i, r in enumerate(sorted(scored, key=lambda x: -x[score_key])):
        r[out_key] = i + 1
    prev = None
    for r in sorted(scored, key=lambda x: x[out_key]):
        if prev is not None and r[score_key] == prev[score_key]:
            r[out_key] = prev[out_key]
        prev = r
    return len(scored)


def file_date(path):
    """由檔名抽 YYYYMMDD → YYYY-MM-DD。"""
    m = re.search(r"(\d{8})", path)
    if not m:
        return None
    g = m.group(1)
    return f"{g[:4]}-{g[4:6]}-{g[6:]}"
