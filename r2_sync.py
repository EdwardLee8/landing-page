#!/usr/bin/env python3
"""把本機的 .enc 上傳到 Cloudflare R2,取代「進 git 才能部署」的做法。

背景:.enc 每次重新加密都會產生全新的 salt/nonce,即使底層資料沒變,
內容看起來也完全不同 —— git 沒辦法 delta 壓縮,每天的匯出都會讓 repo
多長幾十 MB。這支腳本讓資料改成上傳到 R2,不再進 git,repo 大小就跟
資料更新頻率脫鉤。

前置作業(只需做一次):
    npx wrangler r2 bucket create landing-page-member-data
    # 並在 wrangler.jsonc 確認 r2_buckets 綁定(已預先寫好)

用法:
    # 上傳所有現有 .enc(初次遷移用一次即可)
    python r2_sync.py

    # 只想看看會上傳什麼,不實際跑
    python r2_sync.py --dry-run

    # 平常的每日匯出流程,最後接這一行即可
    python r2_sync.py --only us_rs_latest.enc hk_rs_latest.enc cn_rs_latest.enc

本腳本透過 `wrangler r2 object put` 上傳,沿用你部署時已經登入的
Cloudflare 帳號,不需要另外申請 R2 的 S3 API 金鑰。
"""
from __future__ import annotations

import argparse
import concurrent.futures
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUCKET = "landing-page-member-data"

# 與 worker/index.js 的 PUBLIC_ENC_PATHS 一致:免費頁用自己的密碼,
# 資料留在一般靜態部署即可,不必也不應該搬進 R2。
EXCLUDE = {"hk_stocks_data_orig.enc"}

ENC_DIRS = [HERE, HERE / "cn_irm_data", HERE / "us_transcript_data",
            HERE / "us_research_data", HERE / "etf-report" / "data"]


def find_enc_files(only: list[str] | None) -> list[Path]:
    if only:
        files = [HERE / f for f in only]
        missing = [f for f in files if not f.exists()]
        if missing:
            sys.exit(f"錯誤:找不到這些檔案:{', '.join(str(m) for m in missing)}")
        return files
    files: list[Path] = []
    for d in ENC_DIRS:
        if d.is_dir():
            files.extend(sorted(d.glob("*.enc")))
    return [f for f in files if f.name not in EXCLUDE]


def upload_one(path: Path, dry_run: bool) -> tuple[Path, str]:
    key = path.relative_to(HERE).as_posix()
    if dry_run:
        return path, "would upload"
    result = subprocess.run(
        ["npx", "wrangler", "r2", "object", "put", f"{BUCKET}/{key}",
         "--file", str(path), "--content-type", "text/plain; charset=utf-8"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        return path, f"error: {result.stderr.strip()[:200]}"
    return path, "uploaded"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="只列出會上傳什麼")
    ap.add_argument("--only", nargs="+", metavar="FILE",
                    help="只同步指定檔案(相對於本檔所在目錄),用於每日流程")
    ap.add_argument("--jobs", type=int, default=4, help="平行上傳數(預設 4)")
    args = ap.parse_args()

    files = find_enc_files(args.only)
    print(f"{'將' if args.dry_run else '開始'}上傳 {len(files)} 個檔案到 R2 bucket "
          f"'{BUCKET}'{'(dry-run)' if args.dry_run else ''}")

    ok, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = [pool.submit(upload_one, f, args.dry_run) for f in files]
        for i, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            path, status = fut.result()
            rel = path.relative_to(HERE)
            (errors if status.startswith("error") else ok).append((rel, status))
            if i % 200 == 0:
                print(f"  進度 {i}/{len(files)}")

    print(f"\n完成 {len(ok)} 個")
    if errors:
        print(f"失敗 {len(errors)} 個:")
        for p, msg in errors:
            print(f"  - {p}: {msg}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
