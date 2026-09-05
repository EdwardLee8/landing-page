#!/usr/bin/env python3.12
"""
Multi-timeframe RS Rating backtest — vectorized.
"""
import sys, os, warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'quant-db'))
from config.settings import CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD

import clickhouse_connect
import pandas as pd
import numpy as np
from itertools import product

TIMEFRAMES = [
    ('5d',   4),
    ('10d',  9),
    ('15d',  14),
    ('20d',  19),
    ('30d',  29),
    ('50d',  49),
    ('100d', 99),
    ('200d', 199),
    ('365d', 364),
]

def get_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST or 'localhost',
        port=int(CLICKHOUSE_PORT or 8123),
        database=CLICKHOUSE_DB or 'quant',
        username=CLICKHOUSE_USER or 'quant',
        password=CLICKHOUSE_PASSWORD or 'quant123',
        send_receive_timeout=600
    )

def load_data(client):
    min_dt = client.query(
        "SELECT MIN(trade_date) FROM quant.us_rs_rating"
    ).result_rows[0][0]
    max_dt = client.query(
        "SELECT MAX(trade_date) FROM quant.us_rs_rating"
    ).result_rows[0][0]
    start_out = min_dt.isoformat()[:10]
    end_out   = max_dt.isoformat()[:10]

    rating_cols = [f'rating_{name}' for name, _ in TIMEFRAMES]

    q = f"""
    WITH
    spy_raw AS (
        SELECT trade_date, close
        FROM quant.daily_ohlcv
        WHERE market='US' AND symbol='SPY'
          AND trade_date <= '{end_out}'
    ),
    spy_lag AS (
        SELECT trade_date, close,
            lag(close, 4)   OVER (ORDER BY trade_date) AS c5,
            lag(close, 9)   OVER (ORDER BY trade_date) AS c10,
            lag(close, 14)  OVER (ORDER BY trade_date) AS c15,
            lag(close, 19)  OVER (ORDER BY trade_date) AS c20,
            lag(close, 29)  OVER (ORDER BY trade_date) AS c30,
            lag(close, 49)  OVER (ORDER BY trade_date) AS c50,
            lag(close, 99)   OVER (ORDER BY trade_date) AS c100,
            lag(close, 199) OVER (ORDER BY trade_date) AS c200,
            lag(close, 364) OVER (ORDER BY trade_date) AS c365
        FROM spy_raw
    ),
    spy_ret AS (
        SELECT trade_date,
            (close-c5)/c5   AS sr5,   (close-c10)/c10  AS sr10,
            (close-c15)/c15 AS sr15,  (close-c20)/c20  AS sr20,
            (close-c30)/c30 AS sr30,  (close-c50)/c50  AS sr50,
            (close-c100)/c100 AS sr100,(close-c200)/c200 AS sr200,
            (close-c365)/c365 AS sr365
        FROM spy_lag
        WHERE c5>0 AND c10>0 AND c15>0 AND c20>0 AND c30>0 AND c50>0 AND c100>0 AND c200>0 AND c365>0
    ),
    stk_raw AS (
        SELECT symbol, trade_date, close
        FROM quant.daily_ohlcv
        WHERE market='US' AND symbol NOT IN ('SPY','') AND close>0
    ),
    stk_lag AS (
        SELECT symbol, trade_date, close,
            lag(close, 4)   OVER (PARTITION BY symbol ORDER BY trade_date) AS c5,
            lag(close, 9)   OVER (PARTITION BY symbol ORDER BY trade_date) AS c10,
            lag(close, 14)  OVER (PARTITION BY symbol ORDER BY trade_date) AS c15,
            lag(close, 19)  OVER (PARTITION BY symbol ORDER BY trade_date) AS c20,
            lag(close, 29)  OVER (PARTITION BY symbol ORDER BY trade_date) AS c30,
            lag(close, 49)  OVER (PARTITION BY symbol ORDER BY trade_date) AS c50,
            lag(close, 99)   OVER (PARTITION BY symbol ORDER BY trade_date) AS c100,
            lag(close, 199) OVER (PARTITION BY symbol ORDER BY trade_date) AS c200,
            lag(close, 364) OVER (PARTITION BY symbol ORDER BY trade_date) AS c365
        FROM stk_raw
    ),
    stk_ret AS (
        SELECT symbol, trade_date,
            (close-c5)/c5   AS sr5,   (close-c10)/c10  AS sr10,
            (close-c15)/c15 AS sr15,  (close-c20)/c20  AS sr20,
            (close-c30)/c30 AS sr30,  (close-c50)/c50  AS sr50,
            (close-c100)/c100 AS sr100,(close-c200)/c200 AS sr200,
            (close-c365)/c365 AS sr365
        FROM stk_lag
        WHERE c5>0 AND c10>0 AND c15>0 AND c20>0 AND c30>0 AND c50>0 AND c100>0 AND c200>0 AND c365>0
          AND trade_date BETWEEN '{start_out}' AND '{end_out}'
    ),
    rs AS (
        SELECT s.symbol, s.trade_date,
            s.sr5-b.sr5 AS rs5,   s.sr10-b.sr10 AS rs10,
            s.sr15-b.sr15 AS rs15, s.sr20-b.sr20 AS rs20,
            s.sr30-b.sr30 AS rs30, s.sr50-b.sr50 AS rs50,
            s.sr100-b.sr100 AS rs100, s.sr200-b.sr200 AS rs200,
            s.sr365-b.sr365 AS rs365
        FROM stk_ret s
        JOIN spy_ret b ON b.trade_date = s.trade_date
    ),
    rated AS (
        SELECT *,
            round(percentRank(rs5)   OVER (PARTITION BY trade_date ORDER BY rs5   ASC)*98+1) AS rating_5d,
            round(percentRank(rs10)  OVER (PARTITION BY trade_date ORDER BY rs10  ASC)*98+1) AS rating_10d,
            round(percentRank(rs15)  OVER (PARTITION BY trade_date ORDER BY rs15  ASC)*98+1) AS rating_15d,
            round(percentRank(rs20)  OVER (PARTITION BY trade_date ORDER BY rs20  ASC)*98+1) AS rating_20d,
            round(percentRank(rs30)  OVER (PARTITION BY trade_date ORDER BY rs30  ASC)*98+1) AS rating_30d,
            round(percentRank(rs50)  OVER (PARTITION BY trade_date ORDER BY rs50  ASC)*98+1) AS rating_50d,
            round(percentRank(rs100) OVER (PARTITION BY trade_date ORDER BY rs100 ASC)*98+1) AS rating_100d,
            round(percentRank(rs200) OVER (PARTITION BY trade_date ORDER BY rs200 ASC)*98+1) AS rating_200d,
            round(percentRank(rs365) OVER (PARTITION BY trade_date ORDER BY rs365 ASC)*98+1) AS rating_365d
        FROM rs
    ),
    fwd_raw AS (
        SELECT symbol, trade_date, close,
            (lead(close,5) OVER (PARTITION BY symbol ORDER BY trade_date)-close)/close AS fwd_ret_5d
        FROM stk_raw
        WHERE trade_date BETWEEN '{start_out}' AND '{end_out}'
    )
    SELECT
        r.symbol, r.trade_date,
        r.rating_5d, r.rating_10d, r.rating_15d, r.rating_20d, r.rating_30d,
        r.rating_50d, r.rating_100d, r.rating_200d, r.rating_365d,
        f.fwd_ret_5d
    FROM rated r
    JOIN fwd_raw f ON f.symbol=r.symbol AND f.trade_date=r.trade_date
    WHERE f.fwd_ret_5d IS NOT NULL
      AND r.rating_5d IS NOT NULL AND r.rating_10d IS NOT NULL AND r.rating_15d IS NOT NULL
      AND r.rating_20d IS NOT NULL AND r.rating_30d IS NOT NULL AND r.rating_50d IS NOT NULL
      AND r.rating_100d IS NOT NULL AND r.rating_200d IS NOT NULL AND r.rating_365d IS NOT NULL
    ORDER BY r.trade_date, r.symbol
    """

    print(f"Loading data: {start_out} → {end_out} ({len(TIMEFRAMES)} timeframes)...")
    import time; t0 = time.time()
    result = client.query(q)
    cols = ['symbol', 'trade_date'] + rating_cols + ['fwd_ret_5d']
    df = pd.DataFrame(result.result_rows, columns=cols).dropna()
    print(f"  {len(df):,} rows, {df['symbol'].nunique()} symbols, "
          f"{df['trade_date'].nunique()} dates  ({time.time()-t0:.1f}s)")
    return df, rating_cols


def backtest_fast(df, weights, rating_cols, top_n=50):
    """Vectorized backtest using numpy dot product."""
    w = np.array(weights, dtype=np.float64)
    rating_data = df[rating_cols].values.astype(np.float64)  # (n_rows, 9)
    comp = rating_data @ w  # (n_rows,) composite score per row
    df = df.copy()
    df['_comp'] = comp

    results = []
    for date, grp in df.groupby('trade_date', sort=True):
        if len(grp) < top_n:
            continue
        top_idx = np.argpartition(grp['_comp'].values, -top_n)[-top_n:]
        top_rets = grp.iloc[top_idx]['fwd_ret_5d'].values
        results.append(dict(
            avg_ret=top_rets.mean(),
            win_rate=(top_rets > 0).mean(),
        ))
    if not results:
        return None
    rd = pd.DataFrame(results)
    return dict(
        weights=weights,
        avg_ret=rd['avg_ret'].mean(),
        median_ret=rd['avg_ret'].median(),
        win_rate=rd['win_rate'].mean(),
        pct_pos=(rd['avg_ret'] > 0).mean(),
        std=rd['avg_ret'].std(),
        n_dates=len(rd),
    )


def grid_search(df, rating_cols):
    """Coarse 20% → Nelder-Mead optimization around top candidates."""

    # Phase 1: coarse 20% steps
    vals_c = [0, 20, 40, 60, 80, 100]
    combos_c = []
    for combo in product(vals_c, repeat=9):
        if sum(combo) == 100:
            combos_c.append(tuple(c/100 for c in combo))
    print(f"\nPhase 1: {len(combos_c)} coarse combos (20% step)...")

    results_c = []
    for i, w in enumerate(combos_c):
        r = backtest_fast(df, w, rating_cols)
        if r:
            results_c.append(r)
        if (i+1) % 400 == 0:
            print(f"  {i+1}/{len(combos_c)} combos done...")

    df_c = pd.DataFrame(results_c).sort_values('avg_ret', ascending=False)
    print(f"\nTop 5 (coarse):")
    for rank, (_, row) in enumerate(df_c.head(5).iterrows(), 1):
        print(f"  {rank}. " + " ".join(f"{wi:.0%}" for wi in row['weights'])
              + f"  avg={row['avg_ret']*100:+.2f}%  win={row['win_rate']*100:.0f}%")

    # Phase 2: smart fine grid — vary only top-3 timeframes ±15% in 5% steps
    print(f"\nPhase 2: fine 5% grid (varying top-3 timeframes only)...")
    top3 = df_c.head(3)
    all_fine = []

    for idx, (_, cand) in enumerate(top3.iterrows()):
        center = list(cand['weights'])
        print(f"  Candidate {idx+1}: " + " ".join(f"{wi:.0%}" for wi in center)
              + f"  base={cand['avg_ret']*100:+.2f}%")

        # Find top-3 timeframes by weight
        tf_idx = sorted(range(len(center)), key=lambda i: center[i], reverse=True)[:3]
        print(f"    Top-3 timeframes: {[TIMEFRAMES[i][0] for i in tf_idx]}")

        # Generate fine combos: vary only these 3, step 5%
        step = 5
        # The other 6 dims stay at nearest 5% of center
        fixed = []
        for i, wi in enumerate(center):
            if i in tf_idx:
                fixed.append(None)  # to be varied
            else:
                # Round to nearest 5%
                fixed.append(round(wi / step) * step)

        # Generate combos varying only tf_idx
        # Total must sum to 100
        base_fixed = sum(fixed[i] for i in range(9) if fixed[i] is not None)
        remaining = 100 - base_fixed

        # Vary only the top-3, sum constraint
        fine_combos = []
        vals = list(range(0, 101, step))
        for a in vals:
            for b in vals:
                for c in vals:
                    if a + b + c == remaining:
                        combo = list(center)
                        combo[tf_idx[0]] = a / 100
                        combo[tf_idx[1]] = b / 100
                        combo[tf_idx[2]] = c / 100
                        fine_combos.append(tuple(combo))

        print(f"    Testing {len(fine_combos)} fine combos...")
        for w in fine_combos:
            r = backtest_fast(df, w, rating_cols)
            if r:
                all_fine.append(r)

    df_f = pd.DataFrame(all_fine).sort_values('avg_ret', ascending=False)
    return df_c, df_f


def main():
    print("=" * 70)
    print("US RS Rating — Multi-Timeframe Backtest")
    print(f"Timeframes: {[t[0] for t in TIMEFRAMES]}")
    print("=" * 70)

    client = get_client()
    df, rating_cols = load_data(client)

    dates = sorted(df['trade_date'].unique())
    print(f"Backtest period: {dates[0]} → {dates[-1]} ({len(dates)} trading days)")

    df_c, df_f = grid_search(df, rating_cols)

    # Final report
    print(f"\n{'='*70}")
    print("FINAL TOP 20 (fine grid)")
    print(f"{'='*70}")
    hdr = f"{'Rk':<3}  " + "  ".join(f"{n:>5}" for n, _ in TIMEFRAMES)
    hdr += f"  {'Avg%':>7}  {'Med%':>7}  {'Win%':>6}  {'+ve%':>6}  {'Std%':>6}"
    print(hdr)
    print("-" * 100)

    for rank, (_, row) in enumerate(df_f.head(20).iterrows(), 1):
        w = row['weights']
        line = f"{rank:<3}  " + "  ".join(f"{wi:>5.0%}" for wi in w)
        line += f"  {row['avg_ret']*100:>7.2f}  {row['median_ret']*100:>7.2f}"
        line += f"  {row['win_rate']*100:>6.1f}  {row['pct_pos']*100:>6.1f}  {row['std']*100:>6.2f}"
        print(line)

    # Top-N sensitivity
    best = df_f.iloc[0]
    print(f"\n{'='*70}")
    print(f"TOP-N SENSITIVITY (formula: " + " ".join(f"{wi:.0%}" for wi in best['weights']) + ")")
    print(f"{'='*70}")
    print(f"{'N':>4}  {'AvgRet%':>8}  {'WinRate%':>9}  {'%Positive':>9}")
    for n in [10, 20, 30, 50, 75, 100, 150, 200]:
        r = backtest_fast(df, best['weights'], rating_cols, top_n=n)
        if r:
            print(f"  {n:>3}  {r['avg_ret']*100:>+8.2f}  {r['win_rate']*100:>9.1f}  {r['pct_pos']*100:>9.1f}")

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        'backtest_multi_tf_results.csv')
    df_f.to_csv(out, index=False)
    print(f"\nFull results: {out}")


if __name__ == '__main__':
    main()
