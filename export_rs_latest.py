#!/usr/bin/env python3.12
"""
Export latest RS Rating from ClickHouse → {market}_rs_latest.json (+ .enc).

Per-market generic export. Replaces export_us_rs_latest.py.

Usage:
    python export_rs_latest.py --market US           # US, latest date
    python export_rs_latest.py --market HK
    python export_rs_latest.py --market CN
    python export_rs_latest.py --market US 2026-05-08  # specific date
"""
import sys, os, json, argparse, warnings, base64, re
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'quant-db'))
from config.settings import (
    CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD,
)

import clickhouse_connect
import pandas as pd


# Per-market configuration
MARKETS = {
    # Unified member password — same as login.html. All .enc readable only
    # after user logs in via /login (which stores raw pw in sessionStorage).
    'US': dict(table='us_rs_rating',  market='US', currency='USD',
               password='Inv-2604-H8rW', output_prefix='us_rs_latest'),
    'HK': dict(table='hk_rs_rating',  market='HK', currency='HKD',
               password='Inv-2604-H8rW', output_prefix='hk_rs_latest'),
    'CN': dict(table='cn_rs_rating',  market='CN', currency='CNY',
               password='Inv-2604-H8rW', output_prefix='cn_rs_latest'),
}

# Preferred-share regex (US: -PA/-PD/-PK; HK preferred shares are rare;
# CN doesn't use this pattern). Safe to apply globally.
_PREF_RE = re.compile(r'-P[A-Z]{1,3}$')


def get_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST or 'localhost',
        port=int(CLICKHOUSE_PORT or 8123),
        database=CLICKHOUSE_DB or 'quant',
        username=CLICKHOUSE_USER or 'quant',
        password=CLICKHOUSE_PASSWORD or 'quant123',
        send_receive_timeout=600,
    )


def get_latest_date(client, table: str) -> str:
    r = client.query(f"SELECT MAX(trade_date) FROM quant.{table}")
    return r.result_rows[0][0].isoformat()


def _load_local_metadata(market: str) -> dict:
    """Fallback metadata when quant.stock_info is absent.

    HK/CN keyword exports keep raw market_cap. US stocks DB stores market cap
    in 億 USD, so convert to raw dollars.
    """
    base = os.path.dirname(os.path.abspath(__file__))
    meta = {}

    if market in ('HK', 'CN'):
        path = os.path.join(base, f"{market.lower()}_keywords_export.json")
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                for r in json.load(f):
                    sym = r.get('s')
                    if not sym:
                        continue
                    meta[sym] = {
                        'name_en': r.get('n'),
                        'name_zh': r.get('nz'),
                        'sector': r.get('sec') or r.get('ind'),
                        'market_cap': r.get('mcap'),
                    }
    elif market == 'US':
        path = os.path.join(base, 'us_stocks_data.json')
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                for r in json.load(f):
                    code = (r.get('code') or '').split('.')[0]
                    if not code:
                        continue
                    mcap = None
                    try:
                        # us_stocks_data mktcap is 億 USD (e.g. 308.2 = $30.82B)
                        mcap = float(str(r.get('mktcap', '')).replace(',', '')) * 100_000_000
                    except Exception:
                        pass
                    meta[code] = {
                        'name_en': r.get('en_name'),
                        'name_zh': r.get('name'),
                        'sector': r.get('industry'),
                        'market_cap': mcap,
                    }
    return meta


def _fill_from_local_metadata(df: pd.DataFrame, market: str) -> pd.DataFrame:
    meta = _load_local_metadata(market)
    if not meta:
        return df
    for col in ['name_en', 'name_zh', 'sector', 'market_cap']:
        if col not in df.columns:
            df[col] = pd.NA
    for i, row in df.iterrows():
        m = meta.get(row['symbol'])
        if not m:
            continue
        for col in ['name_en', 'name_zh', 'sector']:
            cur = row.get(col)
            if pd.isna(cur) or str(cur).strip() == '':
                df.at[i, col] = m.get(col)
        if pd.isna(row.get('market_cap')) and m.get('market_cap') is not None:
            df.at[i, 'market_cap'] = m.get('market_cap')
    return df


def export_latest(client, end_date: str, cfg: dict) -> dict:
    market = cfg['market']
    table  = cfg['table']

    # 1. RS ratings — pull all 8 timeframes + composite. Use FINAL to dedup
    #    in case ReplacingMergeTree hasn't merged today's run yet.
    rs_q = f"""
    SELECT symbol,
           rs_ret_5d, rs_ret_10d, rs_ret_20d, rs_ret_30d,
           rs_ret_50d, rs_ret_100d, rs_ret_200d, rs_ret_365d,
           rs_rating_5d, rs_rating_10d, rs_rating_20d, rs_rating_30d,
           rs_rating_50d, rs_rating_100d, rs_rating_200d, rs_rating_365d,
           rs_rating_composite
    FROM quant.{table} FINAL WHERE trade_date = '{end_date}'
    """
    rs_cols = ['symbol',
               'rs_ret_5d','rs_ret_10d','rs_ret_20d','rs_ret_30d',
               'rs_ret_50d','rs_ret_100d','rs_ret_200d','rs_ret_365d',
               'rs_rating_5d','rs_rating_10d','rs_rating_20d','rs_rating_30d',
               'rs_rating_50d','rs_rating_100d','rs_rating_200d','rs_rating_365d',
               'rs_rating_composite']
    rs_df = pd.DataFrame(client.query(rs_q).result_rows, columns=rs_cols)

    # Drop preferred shares
    rs_df = rs_df[~rs_df['symbol'].str.contains(_PREF_RE, na=False)].copy()

    if rs_df.empty:
        return {'date': end_date, 'count': 0, 'ratings': []}

    sym_list = "','".join(rs_df['symbol'].tolist())

    # 2. Company info — pull from BOTH tables, then merge in pandas so neither
    #    side's missing rows shadow the other (ClickHouse FULL OUTER JOIN fills
    #    missing string columns with '' not NULL, breaking coalesce).
    ci_q = f"""
    SELECT symbol, name_en, name_zh, sector, industry
    FROM quant.company_info FINAL
    WHERE symbol IN ('{sym_list}')
    """
    ci_a = pd.DataFrame(client.query(ci_q).result_rows,
                        columns=['symbol', 'name_en', 'name_zh', 'sector', 'industry'])

    stock_info_exists = client.query("EXISTS TABLE quant.stock_info").result_rows[0][0] == 1
    if stock_info_exists:
        si_q = f"""
        SELECT symbol, name AS name_si, sector AS sector_si, industry AS industry_si
        FROM quant.stock_info FINAL
        WHERE market = '{market}' AND symbol IN ('{sym_list}')
        """
        ci_b = pd.DataFrame(client.query(si_q).result_rows,
                            columns=['symbol', 'name_si', 'sector_si', 'industry_si'])
    else:
        ci_b = pd.DataFrame(columns=['symbol', 'name_si', 'sector_si', 'industry_si'])

    ci_df = ci_b.merge(ci_a, on='symbol', how='outer')
    # Use name_en if non-empty, otherwise stock_info.name
    ci_df['name_en']  = ci_df['name_en'].replace('', pd.NA).fillna(ci_df['name_si'])
    # Sector: company_info > stock_info > industry (CN cache has 47% sector
    # but 100% industry coverage — Chinese 行業 classifications work as fallback)
    ci_df['sector']   = ci_df['sector'].replace('', pd.NA) \
                                       .fillna(ci_df['sector_si'].replace('', pd.NA)) \
                                       .fillna(ci_df['industry'].replace('', pd.NA)) \
                                       .fillna(ci_df['industry_si'])
    ci_df = ci_df[['symbol', 'name_en', 'name_zh', 'sector']]

    # 3. Latest OHLCV (close + amount). GROUP BY symbol to dedup
    #    ReplacingMergeTree unmerged rows (caused user-visible duplicate
    #    rows in HK/CN tables 2026-05-10).
    ohlcv_q = f"""
    SELECT symbol, close, volume, close * volume AS amount FROM (
        SELECT symbol,
               any(close)  AS close,
               max(volume) AS volume
        FROM quant.daily_ohlcv
        WHERE market = '{market}' AND trade_date = '{end_date}'
          AND symbol IN ('{sym_list}')
        GROUP BY symbol
    )
    """
    ohlcv_df = pd.DataFrame(client.query(ohlcv_q).result_rows,
                            columns=['symbol', 'close', 'volume', 'amount'])

    df = rs_df.merge(ci_df, on='symbol', how='left') \
              .merge(ohlcv_df[['symbol', 'close', 'volume', 'amount']],
                     on='symbol', how='left')

    # 4. Market cap = shares × today's close (always fresh; stock_info.market_cap
    #    is a yfinance snapshot that goes stale daily).
    #    Dedup: stock_info uses ReplacingMergeTree so use FINAL; daily_ohlcv
    #    de-duped via argMax inside the subquery.
    # Prefer fresh shares×close; fallback to stored market_cap when shares=0
    # (e.g. CN tickers imported from akshare cache only have market_cap).
    if stock_info_exists:
        mc_q = f"""
        SELECT s.symbol,
               if(s.shares_outstanding > 0,
                  s.shares_outstanding * o.close,
                  s.market_cap) AS market_cap
        FROM (SELECT symbol, shares_outstanding, market_cap
              FROM quant.stock_info FINAL
              WHERE market='{market}' AND symbol IN ('{sym_list}')
                AND (shares_outstanding > 0 OR market_cap > 0)) AS s
        LEFT JOIN (
            SELECT symbol, argMax(close, trade_date) AS close
            FROM quant.daily_ohlcv
            WHERE market = '{market}' AND trade_date <= '{end_date}'
              AND symbol IN ('{sym_list}')
            GROUP BY symbol
        ) AS o ON o.symbol = s.symbol
        """
        mc_df = pd.DataFrame(client.query(mc_q).result_rows, columns=['symbol', 'market_cap'])
    else:
        mc_df = pd.DataFrame(columns=['symbol', 'market_cap'])
    df = df.merge(mc_df, on='symbol', how='left')

    # 4b. Fallback local metadata. Required when quant.stock_info is absent;
    #     preserves company name / industry / market cap on landing-page.
    df = _fill_from_local_metadata(df, market)

    # 5a. Dedupe by ticker — final safety net in case any earlier step still
    #     returned >1 row per symbol (e.g. unmerged ReplacingMergeTree).
    df = df.drop_duplicates(subset=['symbol'], keep='first').reset_index(drop=True)

    # 5b. Dedupe by company name — keep most-liquid ticker per name_en
    if 'name_en' in df.columns:
        with_name = df['name_en'].notna() & (df['name_en'].astype(str).str.strip() != '')
        named = df[with_name].copy()
        named['_rank_amt'] = named['amount'].fillna(0)
        named['_rank_mc']  = named['market_cap'].fillna(0)
        named = (named.sort_values(['_rank_amt', '_rank_mc'], ascending=[False, False])
                      .drop_duplicates(subset=['name_en'], keep='first')
                      .drop(columns=['_rank_amt', '_rank_mc']))
        df = pd.concat([named, df[~with_name]], ignore_index=True)

    # 6. Build records
    rs_ret_keys = [c for c in df.columns if c.startswith('rs_ret_')]
    ratings = []
    for _, row in df.iterrows():
        r = {}
        for k, v in row.items():
            if isinstance(v, float) and v != v:  # NaN
                r[k] = None
            else:
                r[k] = v
        ratings.append(r)

    for r in ratings:
        for k in rs_ret_keys:
            if r.get(k) is not None:
                r[k] = round(r[k], 6)
        if r.get('amount') is not None:
            r['amount'] = int(round(r['amount']))
        if r.get('market_cap') is not None:
            r['market_cap'] = int(r['market_cap'])

    return {
        'date': end_date,
        'market': market,
        'currency': cfg['currency'],
        'count': len(ratings),
        'ratings': ratings,
    }


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
    orig_kb = len(plaintext) / 1024
    enc_kb  = len(enc) / 1024
    print(f"  Encrypted: {os.path.basename(out)} ({orig_kb:.0f}KB → {enc_kb:.0f}KB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('end_date', nargs='?', default=None,
                    help='YYYY-MM-DD (default: latest in table)')
    ap.add_argument('--market', required=True, choices=list(MARKETS.keys()))
    args = ap.parse_args()

    cfg    = MARKETS[args.market]
    client = get_client()
    end_date = args.end_date or get_latest_date(client, cfg['table'])

    print(f"Exporting {args.market} RS Rating for {end_date}...")
    data = export_latest(client, end_date, cfg)
    print(f"  {data['count']} stocks ({data['currency']})")

    base      = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base, f"{cfg['output_prefix']}.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f"  Written: {json_path}")

    encrypt_json(json_path, cfg['password'])
    print("Done.")


if __name__ == '__main__':
    main()
