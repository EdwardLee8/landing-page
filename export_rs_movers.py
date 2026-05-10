#!/usr/bin/env python3.12
"""
Export top-100 RS rating movers per market → {market}_rs_movers.{json,enc}.

Reads quant.{market}_rs_movers + enriches with name_zh/sector/market_cap/
amount/composite/all-tf-ratings (so the page can show 5d/20d/50d snapshot too).

Usage:
    python export_rs_movers.py --market US|HK|CN
    python export_rs_movers.py             # all 3 markets
"""
import sys, os, json, argparse, base64, warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'quant-db'))
from config.settings import (
    CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD,
)

import clickhouse_connect
import pandas as pd


MARKETS = {
    # Unified member password — same as login.html / RS rating files.
    'US': dict(market='US', movers='us_rs_movers', rs='us_rs_rating',
               currency='USD', password='Inv-2604-H8rW',
               output_prefix='us_rs_movers'),
    'HK': dict(market='HK', movers='hk_rs_movers', rs='hk_rs_rating',
               currency='HKD', password='Inv-2604-H8rW',
               output_prefix='hk_rs_movers'),
    'CN': dict(market='CN', movers='cn_rs_movers', rs='cn_rs_rating',
               currency='CNY', password='Inv-2604-H8rW',
               output_prefix='cn_rs_movers'),
}


def get_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST or 'localhost',
        port=int(CLICKHOUSE_PORT or 8123),
        database=CLICKHOUSE_DB or 'quant',
        username=CLICKHOUSE_USER or 'quant',
        password=CLICKHOUSE_PASSWORD or 'quant123',
        send_receive_timeout=600,
    )


def export_movers(client, cfg: dict) -> dict:
    market = cfg['market']
    movers = cfg['movers']
    rs     = cfg['rs']

    # 1. Latest movers
    end_date = client.query(
        f"SELECT MAX(trade_date) FROM quant.{movers}"
    ).result_rows[0][0].isoformat()

    movers_q = f"""
    SELECT rank, symbol, delta, composite_today, composite_yesterday
    FROM quant.{movers} FINAL
    WHERE trade_date = '{end_date}'
    ORDER BY rank
    """
    movers_df = pd.DataFrame(client.query(movers_q).result_rows,
                             columns=['rank', 'symbol', 'delta',
                                      'composite_today', 'composite_yesterday'])
    if movers_df.empty:
        return {'date': end_date, 'market': market, 'count': 0, 'movers': []}

    sym_list = "','".join(movers_df['symbol'].tolist())

    # 2. Today's RS rating snapshot for these tickers (5d/20d/50d/100d/200d)
    rs_q = f"""
    SELECT symbol, rs_rating_5d, rs_rating_20d, rs_rating_50d,
           rs_rating_100d, rs_rating_200d, rs_ret_5d, rs_ret_20d
    FROM quant.{rs} FINAL
    WHERE trade_date='{end_date}' AND symbol IN ('{sym_list}')
    """
    rs_df = pd.DataFrame(client.query(rs_q).result_rows,
                         columns=['symbol', 'rs_rating_5d', 'rs_rating_20d',
                                  'rs_rating_50d', 'rs_rating_100d', 'rs_rating_200d',
                                  'rs_ret_5d', 'rs_ret_20d'])

    # 3. Company info (same fallback chain as export_rs_latest.py)
    ci_q = f"""
    SELECT symbol, name_en, name_zh, sector, industry
    FROM quant.company_info FINAL WHERE symbol IN ('{sym_list}')
    """
    ci_a = pd.DataFrame(client.query(ci_q).result_rows,
                        columns=['symbol', 'name_en', 'name_zh', 'sector', 'industry'])

    si_q = f"""
    SELECT symbol, name AS name_si, sector AS sector_si, industry AS industry_si
    FROM quant.stock_info FINAL
    WHERE market = '{market}' AND symbol IN ('{sym_list}')
    """
    ci_b = pd.DataFrame(client.query(si_q).result_rows,
                        columns=['symbol', 'name_si', 'sector_si', 'industry_si'])

    ci_df = ci_b.merge(ci_a, on='symbol', how='outer')
    ci_df['name_en'] = ci_df['name_en'].replace('', pd.NA).fillna(ci_df['name_si'])
    ci_df['sector']  = ci_df['sector'].replace('', pd.NA) \
                                     .fillna(ci_df['sector_si'].replace('', pd.NA)) \
                                     .fillna(ci_df['industry'].replace('', pd.NA)) \
                                     .fillna(ci_df['industry_si'])
    ci_df = ci_df[['symbol', 'name_en', 'name_zh', 'sector']]

    # 4. Latest OHLCV (close + amount, deduped)
    ohlcv_q = f"""
    SELECT symbol, close, volume, close * volume AS amount FROM (
        SELECT symbol, any(close) AS close, max(volume) AS volume
        FROM quant.daily_ohlcv
        WHERE market='{market}' AND trade_date='{end_date}'
          AND symbol IN ('{sym_list}')
        GROUP BY symbol
    )
    """
    ohlcv_df = pd.DataFrame(client.query(ohlcv_q).result_rows,
                            columns=['symbol', 'close', 'volume', 'amount'])

    # 5. Market cap (shares × close, fallback to stored mc)
    mc_q = f"""
    SELECT s.symbol,
           if(s.shares_outstanding > 0, s.shares_outstanding * o.close, s.market_cap) AS market_cap
    FROM (SELECT symbol, shares_outstanding, market_cap FROM quant.stock_info FINAL
          WHERE market='{market}' AND symbol IN ('{sym_list}')
            AND (shares_outstanding > 0 OR market_cap > 0)) AS s
    LEFT JOIN (SELECT symbol, argMax(close, trade_date) AS close
               FROM quant.daily_ohlcv
               WHERE market='{market}' AND trade_date<='{end_date}'
                 AND symbol IN ('{sym_list}')
               GROUP BY symbol) AS o ON o.symbol=s.symbol
    """
    mc_df = pd.DataFrame(client.query(mc_q).result_rows, columns=['symbol', 'market_cap'])

    # 6. Merge all
    df = (movers_df
          .merge(rs_df,    on='symbol', how='left')
          .merge(ci_df,    on='symbol', how='left')
          .merge(ohlcv_df, on='symbol', how='left')
          .merge(mc_df,    on='symbol', how='left'))

    # 7. Build records
    rs_ret_keys = [c for c in df.columns if c.startswith('rs_ret_')]
    movers_list = []
    for _, row in df.iterrows():
        r = {}
        for k, v in row.items():
            if isinstance(v, float) and v != v:
                r[k] = None
            else:
                r[k] = v
        movers_list.append(r)

    for r in movers_list:
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
        'count': len(movers_list),
        'movers': movers_list,
    }


def encrypt_json(json_path: str, password: str):
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    with open(json_path, 'rb') as f:
        plaintext = f.read()
    salt  = os.urandom(16)
    nonce = os.urandom(12)
    kdf   = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key   = kdf.derive(password.encode())
    ct    = AESGCM(key).encrypt(nonce, plaintext, None)
    enc   = base64.b64encode(salt + nonce + ct).decode()
    out   = json_path.replace('.json', '.enc')
    with open(out, 'w') as f:
        f.write(enc)
    print(f"  Encrypted: {os.path.basename(out)} ({len(plaintext)/1024:.0f}KB → {len(enc)/1024:.0f}KB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--market', choices=list(MARKETS.keys()), default=None)
    args = ap.parse_args()

    client  = get_client()
    base    = os.path.dirname(os.path.abspath(__file__))
    markets = [args.market] if args.market else list(MARKETS.keys())

    for m in markets:
        cfg = MARKETS[m]
        print(f"\n=== Exporting {m} RS Movers ===")
        data = export_movers(client, cfg)
        print(f"  date={data['date']}, count={data['count']}")
        json_path = os.path.join(base, f"{cfg['output_prefix']}.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        encrypt_json(json_path, cfg['password'])

    print("\nDone.")


if __name__ == '__main__':
    main()
