#!/usr/bin/env python3.12
"""
Backtest US RS Rating composite formulas — optimized version.

Pulls rating data + forward returns from ClickHouse efficiently.
"""
import sys, os, warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'quant-db'))
from config.settings import CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD

import clickhouse_connect
import pandas as pd
import numpy as np

def get_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST or 'localhost',
        port=int(CLICKHOUSE_PORT or 8123),
        database=CLICKHOUSE_DB or 'quant',
        username=CLICKHOUSE_USER or 'quant',
        password=CLICKHOUSE_PASSWORD or 'quant123',
        send_receive_timeout=600
    )

def load_data(client, lookback_days=90):
    """Load ratings + fwd returns for backtest. Limit lookback to keep query fast."""
    latest = client.query(
        "SELECT MAX(trade_date) FROM quant.us_rs_rating"
    ).result_rows[0][0]
    start_dt = (pd.Timestamp(latest) - pd.Timedelta(days=lookback_days)).isoformat()[:10]

    print(f"Loading {lookback_days}-day lookback: {start_dt} → {latest}")

    # Use sample of ~500 stocks to keep query fast (top by ohlcv amount)
    # First get top symbols by recent volume
    top_syms_q = f"""
    SELECT symbol FROM (
        SELECT symbol, sum(volume * close) as total_amount
        FROM quant.daily_ohlcv
        WHERE market = 'US' AND trade_date >= '{start_dt}'
        GROUP BY symbol
        ORDER BY total_amount DESC
        LIMIT 500
    )
    """
    top_syms = [r[0] for r in client.query(top_syms_q).result_rows]
    sym_list = "','".join(top_syms)
    print(f"  Top {len(top_syms)} symbols by turnover")

    # Pull fwd returns (computed in Python to avoid heavy SQL window)
    # Get close prices with 5-day lead
    price_q = f"""
    SELECT
        symbol,
        trade_date,
        close,
        close * volume as turnover
    FROM quant.daily_ohlcv
    WHERE market = 'US'
      AND trade_date >= '{start_dt}'
      AND symbol IN ('{sym_list}')
    ORDER BY symbol, trade_date
    """
    price_cols = ['symbol', 'trade_date', 'close', 'turnover']
    price_df = pd.DataFrame(client.query(price_q).result_rows, columns=price_cols)

    # Compute forward return in Python (vectorized)
    price_df = price_df.sort_values(['symbol', 'trade_date'])
    price_df['close_lead5'] = price_df.groupby('symbol')['close'].shift(-5)
    price_df['fwd_ret_5d'] = (price_df['close_lead5'] - price_df['close']) / price_df['close']
    price_df = price_df.dropna(subset=['fwd_ret_5d'])

    # Pull ratings
    rat_q = f"""
    SELECT
        symbol,
        trade_date,
        rs_rating_5d, rs_rating_10d, rs_rating_20d, rs_rating_50d
    FROM quant.us_rs_rating
    WHERE trade_date >= '{start_dt}'
      AND symbol IN ('{sym_list}')
    """
    rat_cols = ['symbol', 'trade_date', 'rs_rating_5d', 'rs_rating_10d',
                'rs_rating_20d', 'rs_rating_50d']
    rat_df = pd.DataFrame(client.query(rat_q).result_rows, columns=rat_cols)

    # Merge
    df = rat_df.merge(
        price_df[['symbol', 'trade_date', 'fwd_ret_5d']],
        on=['symbol', 'trade_date'],
        how='inner'
    )
    df = df.dropna(subset=['rs_rating_5d', 'rs_rating_10d', 'rs_rating_20d', 'rs_rating_50d', 'fwd_ret_5d'])

    print(f"  Loaded {len(df):,} rows, {df['symbol'].nunique()} symbols, "
          f"{df['trade_date'].nunique()} dates")
    return df

def generate_weight_combos(step_pct=5):
    """Generate weight combos that sum to 1.0."""
    combos = []
    step = step_pct
    for a in range(0, 101, step):
        for b in range(0, 101 - a, step):
            for c in range(0, 101 - a - b, step):
                d = 100 - a - b - c
                combos.append((a/100, b/100, c/100, d/100))
    return combos

def backtest(df, w5, w10, w20, w50, top_n=50):
    """Score a weight combo by avg fwd return of top-N stocks each day."""
    results = []
    dates = sorted(df['trade_date'].unique())

    for date in dates:
        daily = df[df['trade_date'] == date].copy()
        if len(daily) < top_n:
            continue

        daily['comp'] = (daily['rs_rating_5d'] * w5 +
                         daily['rs_rating_10d'] * w10 +
                         daily['rs_rating_20d'] * w20 +
                         daily['rs_rating_50d'] * w50)

        top = daily.nlargest(top_n, 'comp')
        avg_ret = top['fwd_ret_5d'].mean()
        win_rate = (top['fwd_ret_5d'] > 0).mean()
        results.append({
            'date': date,
            'avg_ret': avg_ret,
            'win_rate': win_rate,
            'n': len(top)
        })

    if not results:
        return None

    rd = pd.DataFrame(results)
    return {
        'w5': w5, 'w10': w10, 'w20': w20, 'w50': w50,
        'avg_ret': rd['avg_ret'].mean(),
        'median_ret': rd['avg_ret'].median(),
        'win_rate': rd['win_rate'].mean(),
        'n_dates': len(rd),
        'std': rd['avg_ret'].std(),
        'pct_positive': (rd['avg_ret'] > 0).mean(),
    }

def main():
    print("=== US RS Rating Composite Backtest ===\n")
    client = get_client()
    df = load_data(client, lookback_days=90)

    combos = generate_weight_combos(step_pct=5)
    print(f"\nTesting {len(combos)} weight combos...")
    print(f"Top-N selection: 50 stocks per day")
    print(f"Metric: average 5-day forward return\n")

    # Test all combos
    results = []
    for i, (w5, w10, w20, w50) in enumerate(combos):
        r = backtest(df, w5, w10, w20, w50, top_n=50)
        if r:
            results.append(r)
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(combos)} combos...")

    rd = pd.DataFrame(results).sort_values('avg_ret', ascending=False)

    # Top 15
    print(f"\n{'='*75}")
    print(f"TOP 15 FORMULAS (Avg 5-Day Forward Return)")
    print(f"{'='*75}")
    print(f"{'Rank':<5} {'W5':>5} {'W10':>5} {'W20':>5} {'W50':>5} "
          f"{'AvgRet%':>8} {'Median%':>8} {'WinRate%':>9} {'%Pos':>6} {'Std%':>7}")
    print(f"{'-'*75}")
    for rank, (_, row) in enumerate(rd.head(15).iterrows(), 1):
        print(f"{rank:<5} {row['w5']:>5.0%} {row['w10']:>5.0%} "
              f"{row['w20']:>5.0%} {row['w50']:>5.0%} "
              f"{row['avg_ret']*100:>8.2f} {row['median_ret']*100:>8.2f} "
              f"{row['win_rate']*100:>9.1f} {row['pct_positive']*100:>6.1f} "
              f"{row['std']*100:>7.2f}")

    # Also show current formula
    curr = rd[(rd['w5']==0.35) & (rd['w10']==0.30) & (rd['w20']==0.20) & (rd['w50']==0.15)]
    if not curr.empty:
        c = curr.iloc[0]
        print(f"\n{'='*75}")
        print(f"CURRENT (35/30/20/15):  AvgRet={c['avg_ret']*100:.2f}%, "
              f"WinRate={c['win_rate']*100:.1f}%, Rank={rd.index.get_loc(curr.index[0])+1}")
        print(f"{'='*75}")

    # Worst 5
    print(f"\nWORST 5 FORMULAS:")
    for _, row in rd.tail(5).iterrows():
        print(f"  {row['w5']:.0%}/{row['w10']:.0%}/{row['w20']:.0%}/{row['w50']:.0%} "
              f"→ Avg: {row['avg_ret']*100:.2f}%")

    # Save
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backtest_results.csv')
    rd.to_csv(out, index=False)
    print(f"\nFull results: {out}")

    # Also test top_n sensitivity for best formula
    print(f"\n{'='*75}")
    print(f"TOP-N SENSITIVITY (for best formula)")
    print(f"{'='*75}")
    best = rd.iloc[0]
    print(f"Best: {best['w5']:.0%}/{best['w10']:.0%}/{best['w20']:.0%}/{best['w50']:.0%}")
    for n in [10, 20, 30, 50, 75, 100]:
        r = backtest(df, best['w5'], best['w10'], best['w20'], best['w50'], top_n=n)
        if r:
            print(f"  Top-{n:3d}: AvgRet={r['avg_ret']*100:+.2f}%, WinRate={r['win_rate']*100:.1f}%, "
                  f"%Pos={r['pct_positive']*100:.1f}%")

if __name__ == '__main__':
    main()
