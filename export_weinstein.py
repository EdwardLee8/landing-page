#!/usr/bin/env python3.12
"""
Export latest Weinstein Stage data → {market}_weinstein_latest.{json,enc}

Reads latest week from quant.weinstein_stage and writes encrypted JSON for
each market. Joined with company names from quant.company_info / stock_info.

Usage:
    python export_weinstein.py --market US
    python export_weinstein.py --market ALL
"""
import sys, os, json, argparse, base64, warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'quant-db'))
from config.settings import (CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB,
                              CLICKHOUSE_USER, CLICKHOUSE_PASSWORD)

import clickhouse_connect
import pandas as pd

MARKETS = {
    'US': dict(market='US', prefix='us_weinstein_latest', password='Inv-2604-H8rW'),
    'HK': dict(market='HK', prefix='hk_weinstein_latest', password='Inv-2604-H8rW'),
    'CN': dict(market='CN', prefix='cn_weinstein_latest', password='Inv-2604-H8rW'),
}

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


def get_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST or 'localhost',
        port=int(CLICKHOUSE_PORT or 8123),
        database=CLICKHOUSE_DB or 'quant',
        username=CLICKHOUSE_USER or 'quant',
        password=CLICKHOUSE_PASSWORD or 'quant123',
        send_receive_timeout=120,
    )


def encrypt_json(json_path: str, password: str):
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    with open(json_path, 'rb') as f:
        plaintext = f.read()
    salt  = os.urandom(16)
    nonce = os.urandom(12)
    kdf   = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
                       salt=salt, iterations=100_000)
    key   = kdf.derive(password.encode())
    ct    = AESGCM(key).encrypt(nonce, plaintext, None)
    enc   = base64.b64encode(salt + nonce + ct).decode()
    out   = json_path.replace('.json', '.enc')
    with open(out, 'w') as f:
        f.write(enc)
    print(f'  Encrypted: {os.path.basename(out)} '
          f'({len(plaintext)//1024}KB → {len(enc)//1024}KB)')


def export_market(client, cfg: dict):
    market = cfg['market']

    # ── Latest week date (global, for display only) ───────────────────────────
    r = client.query(
        f"SELECT MAX(week_date) FROM quant.weinstein_stage WHERE market = '{market}'"
    )
    latest = r.result_rows[0][0]
    if not latest:
        print(f'  [{market}] No data in weinstein_stage, skipping')
        return
    latest_str = str(latest)

    # ── Main weinstein data — per-symbol latest week ───────────────────────────
    # Use JOIN on (symbol, MAX week_date) so halted/low-liquidity stocks still
    # appear using their last available week rather than being dropped.
    w_q = f"""
        SELECT w.symbol, w.week_date, w.stage, w.stage_label, w.confidence,
               w.stage1_score, w.stage2_score, w.stage3_score, w.stage4_score,
               w.stage_duration_weeks, w.signal, w.reason_codes,
               w.ma30w, w.ma30w_slope_10w, w.price_vs_ma30w,
               w.ret_26w, w.ret_52w, w.rs_composite, w.volume_ratio,
               w.down_up_vol_ratio, w.weeks_above_8w, w.data_quality
        FROM (
            SELECT symbol, week_date, stage, stage_label, confidence,
                   stage1_score, stage2_score, stage3_score, stage4_score,
                   stage_duration_weeks, signal, reason_codes,
                   ma30w, ma30w_slope_10w, price_vs_ma30w,
                   ret_26w, ret_52w, rs_composite, volume_ratio,
                   down_up_vol_ratio, weeks_above_8w, data_quality
            FROM quant.weinstein_stage FINAL
            WHERE market = '{market}'
        ) w
        INNER JOIN (
            SELECT symbol, MAX(week_date) AS max_wk
            FROM quant.weinstein_stage
            WHERE market = '{market}'
            GROUP BY symbol
        ) m ON w.symbol = m.symbol AND w.week_date = m.max_wk
        WHERE w.data_quality != 'insufficient'
          AND w.stage_label NOT IN ('Insufficient', '')
        ORDER BY w.stage2_score DESC, w.rs_composite DESC
    """
    rows = client.query(w_q).result_rows
    if not rows:
        print(f'  [{market}] No rows at {latest_str}')
        return

    w_cols = ['symbol', 'week_date', 'stage', 'stage_label', 'confidence',
              'stage1_score', 'stage2_score', 'stage3_score', 'stage4_score',
              'stage_duration_weeks', 'signal', 'reason_codes',
              'ma30w', 'ma30w_slope_10w', 'price_vs_ma30w',
              'ret_26w', 'ret_52w', 'rs_composite', 'volume_ratio',
              'down_up_vol_ratio', 'weeks_above_8w', 'data_quality']
    df = pd.DataFrame(rows, columns=w_cols)
    df['week_date'] = df['week_date'].astype(str)

    sym_list = "','".join(df['symbol'].tolist())

    # ── Company names (coalesce company_info + stock_info, same as export_rs_latest) ──
    ci_q = f"""
        SELECT symbol, name_en, name_zh
        FROM quant.company_info FINAL
        WHERE symbol IN ('{sym_list}')
    """
    ci_a = pd.DataFrame(client.query(ci_q).result_rows,
                        columns=['symbol', 'name_en', 'name_zh'])

    si_q = f"""
        SELECT symbol, name AS name_si
        FROM quant.stock_info FINAL
        WHERE market = '{market}' AND symbol IN ('{sym_list}')
    """
    ci_b = pd.DataFrame(client.query(si_q).result_rows,
                        columns=['symbol', 'name_si'])

    names = ci_b.merge(ci_a, on='symbol', how='outer')
    names['name_en'] = names['name_en'].replace('', pd.NA).fillna(names['name_si'])
    names['name_zh'] = names['name_zh'].replace('', pd.NA)
    names = names[['symbol', 'name_en', 'name_zh']]

    df = df.merge(names, on='symbol', how='left')

    # ── Build records (NaN → None for JSON serialisation) ─────────────────────
    float_cols = ['confidence', 'ma30w', 'ma30w_slope_10w', 'price_vs_ma30w',
                  'ret_26w', 'ret_52w', 'volume_ratio', 'down_up_vol_ratio']
    for c in float_cols:
        df[c] = df[c].where(df[c].notna(), other=None)
        df[c] = df[c].apply(lambda v: round(v, 4) if v is not None else None)

    records = []
    for _, row in df.iterrows():
        rec = {}
        for k, v in row.items():
            if isinstance(v, float) and v != v:
                rec[k] = None
            elif hasattr(v, 'item'):          # numpy scalar
                rec[k] = v.item()
            else:
                rec[k] = v
        records.append(rec)

    payload = {
        'week_date': latest_str,
        'market':    market,
        'count':     len(records),
        'stages':    records,
    }

    # ── Write JSON + enc ───────────────────────────────────────────────────────
    json_path = os.path.join(OUTPUT_DIR, f"{cfg['prefix']}.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'), default=str)
    print(f'  [{market}] {len(records)} records → {os.path.basename(json_path)}  (week: {latest_str})')

    encrypt_json(json_path, cfg['password'])

    # Stage breakdown summary
    from collections import Counter
    dist = Counter(r['stage_label'] for r in records)
    for lbl in sorted(dist):
        sig = sum(1 for r in records if r.get('stage_label') == lbl and r.get('signal'))
        print(f'    {lbl:<14} {dist[lbl]:>5}  signals: {sig}')


def main():
    ap = argparse.ArgumentParser(description='Export Weinstein Stage data to enc files')
    ap.add_argument('--market', default='ALL', choices=['US', 'HK', 'CN', 'ALL'])
    args = ap.parse_args()

    client = get_client()
    for m in (['US', 'HK', 'CN'] if args.market == 'ALL' else [args.market]):
        export_market(client, MARKETS[m])
    print('Done.')


if __name__ == '__main__':
    main()
