#!/usr/bin/env python3
"""輪換會員資料密碼:用舊密碼解密全站 .enc,再用新密碼重新加密。

使用時機:舊密碼外洩(例如曾被硬編碼進 public repo)。因為 git 歷史無法
可靠地抹除,唯一有效的補救是換一把新密碼並重新加密所有資料。

用法:
    # 先看會動到哪些檔案,不寫入任何東西
    python rotate_password.py --old '舊密碼' --new '新密碼' --dry-run

    # 實際輪換,並同步更新各 HTML 頁面內的 _PW_HASH
    python rotate_password.py --old '舊密碼' --new '新密碼' --update-html

無法用舊密碼解密的檔案會被略過並列出。這是預期行為:例如
hk_stocks_data_orig.enc 屬於免費頁,使用頁面內自帶的另一組密碼。
"""
from __future__ import annotations

import argparse
import concurrent.futures
import os
import re
import sys
from pathlib import Path

from cryptography.exceptions import InvalidTag

import enc_utils

HERE = Path(__file__).resolve().parent

# 只掃這些目錄,避免誤觸 node_modules / .git 等
ENC_DIRS = [HERE, HERE / "cn_irm_data", HERE / "us_transcript_data",
            HERE / "us_research_data", HERE / "etf-report" / "data"]


def find_enc_files() -> list[Path]:
    files: list[Path] = []
    for d in ENC_DIRS:
        if d.is_dir():
            files.extend(sorted(d.glob("*.enc")))
    return files


def rotate_one(path: Path, old_pw: str, new_pw: str, dry_run: bool) -> tuple[Path, str]:
    """回傳 (path, 'rotated' | 'skipped' | 'error: ...')。"""
    try:
        plain = enc_utils.decrypt_file(path, old_pw)
    except InvalidTag:
        return path, "skipped"
    except Exception as e:  # 損毀或非預期格式
        return path, f"error: {type(e).__name__}: {e}"

    if dry_run:
        return path, "rotated"

    # 先寫暫存檔再 replace,避免中途失敗留下半個檔案
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp.write_text(enc_utils.encrypt_bytes(plain, new_pw), encoding="utf-8")
        # 寫回前先驗證新檔真的能用新密碼解回同樣內容
        if enc_utils.decrypt_bytes(tmp.read_text(encoding="utf-8"), new_pw) != plain:
            tmp.unlink(missing_ok=True)
            return path, "error: 驗證失敗,內容不一致"
        os.replace(tmp, path)
    except Exception as e:
        tmp.unlink(missing_ok=True)
        return path, f"error: {type(e).__name__}: {e}"
    return path, "rotated"


def update_html_hashes(old_pw: str, new_pw: str, dry_run: bool) -> list[str]:
    """把各頁面內的 _PW_HASH 由舊密碼的 SHA-256 換成新密碼的。"""
    old_hash = enc_utils.password_hash(old_pw)
    new_hash = enc_utils.password_hash(new_pw)
    changed = []
    for html in sorted(HERE.glob("*.html")) + sorted((HERE / "etf-report").glob("*.html")):
        text = html.read_text(encoding="utf-8")
        if old_hash not in text:
            continue
        if not dry_run:
            html.write_text(text.replace(old_hash, new_hash), encoding="utf-8")
        changed.append(str(html.relative_to(HERE)))
    return changed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--old", help=f"舊密碼(預設讀環境變數 {enc_utils.ENV_VAR})")
    ap.add_argument("--new", help="新密碼(預設讀環境變數 MEMBER_DATA_PASSWORD_NEW)")
    ap.add_argument("--dry-run", action="store_true", help="只顯示會動到什麼,不寫入")
    ap.add_argument("--update-html", action="store_true",
                    help="同步更新 HTML 內的 _PW_HASH")
    ap.add_argument("--jobs", type=int, default=min(8, (os.cpu_count() or 4)),
                    help="平行處理數(預設依 CPU 核心數)")
    args = ap.parse_args()

    old_pw = args.old or os.environ.get(enc_utils.ENV_VAR)
    new_pw = args.new or os.environ.get("MEMBER_DATA_PASSWORD_NEW")
    if not old_pw or not new_pw:
        ap.error("必須同時提供舊密碼與新密碼(--old / --new 或對應環境變數)")
    if old_pw == new_pw:
        ap.error("新舊密碼相同,無需輪換")

    files = find_enc_files()
    print(f"掃到 {len(files)} 個 .enc 檔"
          f"{'(dry-run,不會寫入)' if args.dry_run else ''}")

    rotated, skipped, errors = [], [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = [pool.submit(rotate_one, f, old_pw, new_pw, args.dry_run) for f in files]
        for i, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            path, status = fut.result()
            rel = path.relative_to(HERE)
            if status == "rotated":
                rotated.append(rel)
            elif status == "skipped":
                skipped.append(rel)
            else:
                errors.append((rel, status))
            if i % 200 == 0:
                print(f"  進度 {i}/{len(files)}")

    print(f"\n已輪換 {len(rotated)} 個檔案")
    if skipped:
        print(f"略過 {len(skipped)} 個(舊密碼解不開,通常是使用其他密碼的免費資料):")
        for p in skipped:
            print(f"  - {p}")
    if errors:
        print(f"\n失敗 {len(errors)} 個:")
        for p, msg in errors:
            print(f"  - {p}: {msg}")

    if args.update_html:
        changed = update_html_hashes(old_pw, new_pw, args.dry_run)
        print(f"\n更新 _PW_HASH 的頁面({len(changed)}):")
        for c in changed:
            print(f"  - {c}")

    if errors:
        return 1
    if not args.dry_run:
        print(f"\n完成。請將 {enc_utils.ENV_VAR} 更新為新密碼後再執行任何匯出腳本。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
