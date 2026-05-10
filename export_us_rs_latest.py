#!/usr/bin/env python3.12
"""
Export latest US RS Rating from ClickHouse → us_rs_latest.json
Then encrypt to us_rs_latest.enc

Enriches with company name (en/zh), sector, market cap, and turnover.

Usage:
    python3.12 export_us_rs_latest.py [end_date]
"""
import sys, os, json, warnings, time
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'quant-db'))
from config.settings import CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD

import clickhouse_connect
import pandas as pd

def get_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST or 'localhost',
        port=int(CLICKHOUSE_PORT or 8123),
        database=CLICKHOUSE_DB or 'quant',
        username=CLICKHOUSE_USER or 'quant',
        password=CLICKHOUSE_PASSWORD or 'quant123',
        send_receive_timeout=600
    )

def get_latest_date(client):
    r = client.query("SELECT MAX(trade_date) FROM quant.us_rs_rating")
    return r.result_rows[0][0].isoformat()

def _fetch_market_cap_batch(symbols, batch_size=50):
    """Fetch market cap from yfinance in batches."""
    import yfinance as yf
    mktcap = {}
    symbols = [s for s in symbols if s]  # remove empty
    total = len(symbols)
    for i in range(0, total, batch_size):
        batch = symbols[i:i+batch_size]
        for sym in batch:
            try:
                ticker = yf.Ticker(sym)
                info = ticker.info
                mc = info.get('marketCap', None)
                mktcap[sym] = mc
            except Exception:
                mktcap[sym] = None
        if (i + batch_size) % 250 == 0:
            print(f"  Market cap: {i+batch_size}/{total}")
        time.sleep(0.05)  # be gentle to yfinance
    return mktcap

def export_latest(client, end_date: str) -> dict:
    # ── 1. RS ratings ───────────────────────────────────────────────────────
    rs_q = f"""
    SELECT
        r.symbol,
        r.rs_ret_5d, r.rs_ret_10d, r.rs_ret_20d, r.rs_ret_50d,
        r.rs_rating_5d, r.rs_rating_10d, r.rs_rating_20d, r.rs_rating_50d,
        r.rs_rating_composite
    FROM quant.us_rs_rating r
    WHERE r.trade_date = '{end_date}'
    """
    rs_cols = [
        'symbol',
        'rs_ret_5d', 'rs_ret_10d', 'rs_ret_20d', 'rs_ret_50d',
        'rs_rating_5d', 'rs_rating_10d', 'rs_rating_20d', 'rs_rating_50d',
        'rs_rating_composite'
    ]
    rs_df = pd.DataFrame(client.query(rs_q).result_rows, columns=rs_cols)

    # ── 2. Company info (name, sector) ─────────────────────────────────────
    sym_list = "','".join(rs_df['symbol'].tolist())
    ci_q = f"""
    SELECT symbol, name_en, name_zh, sector
    FROM quant.company_info
    WHERE symbol IN ('{sym_list}')
    """
    ci_cols = ['symbol', 'name_en', 'name_zh', 'sector']
    ci_df = pd.DataFrame(client.query(ci_q).result_rows, columns=ci_cols)

    # ── 3. Latest OHLCV (turnover = close × volume) ─────────────────────
    ohlcv_q = f"""
    SELECT
        symbol,
        close,
        volume,
        close * volume AS amount
    FROM quant.daily_ohlcv
    WHERE market = 'US'
      AND trade_date = '{end_date}'
      AND symbol IN ('{sym_list}')
    """
    ohlcv_cols = ['symbol', 'close', 'volume', 'amount']
    ohlcv_df = pd.DataFrame(client.query(ohlcv_q).result_rows, columns=ohlcv_cols)

    # ── 4. Merge ────────────────────────────────────────────────────────────
    df = rs_df.merge(ci_df, on='symbol', how='left')
    df = df.merge(ohlcv_df[['symbol', 'close', 'volume', 'amount']], on='symbol', how='left')

    # ── 5. Turnover group (5 groups: 1=small, 5=large) ─────────────────
    amounts = df['amount'].dropna()
    non_zero = amounts[amounts > 0]
    if len(non_zero) > 4:
        bins = list(non_zero.quantile([0.2, 0.4, 0.6, 0.8]).values)
        bins = sorted(set(bins))
        edges = [-float('inf')] + bins + [float('inf')]
        if len(edges) == 6:
            labels = [1, 2, 3, 4, 5]
        else:
            labels = list(range(1, len(edges)))
        df['turnover_group'] = pd.cut(
            df['amount'],
            bins=edges,
            labels=labels,
            duplicates='drop'
        ).astype(float).fillna(1).astype(int)
    else:
        df['turnover_group'] = 3

    # ── 6. Market cap from yfinance (OPTIONAL — skip for now, very slow) ──
    # Uncomment below to enable:
    # print("  Fetching market cap from yfinance...")
    # mktcap = _fetch_market_cap_batch(df['symbol'].tolist())
    # mc_df = pd.DataFrame(list(mktcap.items()), columns=['symbol', 'market_cap'])
    # df = df.merge(mc_df, on='symbol', how='left')
    df['market_cap'] = None  # placeholder — yfinance too slow for 1885 stocks

    # ── 7. Build records ─────────────────────────────────────────────────
    ratings = []
    for _, row in df.iterrows():
        r = {}
        for k, v in row.items():
            if isinstance(v, float) and v != v:  # NaN
                r[k] = None
            else:
                r[k] = v
        ratings.append(r)

    # Round floats
    for r in ratings:
        for k in ['rs_ret_5d', 'rs_ret_10d', 'rs_ret_20d', 'rs_ret_50d']:
            if r.get(k) is not None:
                r[k] = round(r[k], 6)
        if r.get('amount') is not None:
            r['amount'] = int(round(r['amount']))
        if r.get('market_cap') is not None:
            r['market_cap'] = int(r['market_cap'])

    return {
        'date': end_date,
        'count': len(ratings),
        'ratings': ratings
    }

def main():
    client = get_client()

    if len(sys.argv) >= 2:
        end_date = sys.argv[1]
    else:
        end_date = get_latest_date(client)
        print(f"No date given — using latest: {end_date}")

    print(f"Exporting US RS Rating for {end_date}...")
    data = export_latest(client, end_date)
    print(f"  {data['count']} stocks")

    base = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base, 'us_rs_latest.json')
    with open(json_path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f"  Written: {json_path}")

    _encrypt_json(json_path, "US_stock_Key_worD")
    print("Done.")

def _encrypt_json(json_path, password):
    import base64, os
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    with open(json_path, 'rb') as f:
        plaintext = f.read()
    salt = os.urandom(16)
    nonce = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, plaintext, None)
    enc = base64.b64encode(salt + nonce + ct).decode()
    out = json_path.replace('.json', '.enc')
    with open(out, 'w') as f:
        f.write(enc)
    orig_kb = len(plaintext) / 1024
    enc_kb = len(enc) / 1024
    print(f"  Encrypted: {os.path.basename(out)} ({orig_kb:.0f}KB → {enc_kb:.0f}KB)")

if __name__ == '__main__':
    main()
