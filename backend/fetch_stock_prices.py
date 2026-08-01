"""One-off/periodic script: fetches historical daily closing stock prices for
the 10 companies tracked elsewhere in this app (COMPANY_ALIASES in app.py)
and writes data/stock_prices.csv, which app.py loads at import time the same
way it loads company_metrics.csv.

Run manually whenever the data needs refreshing:
    python fetch_stock_prices.py

auto_adjust=True (passed explicitly, though it's yfinance's own default) so
"close_price" already reflects stock splits and dividends. An unadjusted
close would show a misleading cliff on split dates (e.g. NVDA's 10-for-1
split in 2024) that has nothing to do with the business actually changing —
exactly the kind of false signal this app's charts are trying to avoid
elsewhere (see the CHART_* styling in app.py).
"""

from pathlib import Path

import pandas as pd
import yfinance as yf

# Keep in sync with COMPANY_ALIASES' keys in app.py — this is intentionally a
# separate literal dict rather than an import, since importing app.py here
# would trigger its full module-level setup (loading the filing corpus,
# building the TF-IDF matrix, constructing the Gradio UI) just to fetch a
# CSV.
TICKERS = {
    "apple": "AAPL",
    "microsoft": "MSFT",
    "nvidia": "NVDA",
    "alphabet": "GOOGL",
    "amazon": "AMZN",
    "meta": "META",
    "broadcom": "AVGO",
    "tesla": "TSLA",
    "oracle": "ORCL",
    "salesforce": "CRM",
}

START_DATE = "2022-01-01"
OUT_PATH = Path(__file__).parent / "data" / "stock_prices.csv"


def main():
    rows = []
    for company, ticker in TICKERS.items():
        hist = yf.Ticker(ticker).history(start=START_DATE, auto_adjust=True)
        if hist.empty:
            print(f"WARNING: no data returned for {ticker} ({company})")
            continue
        for date, row in hist.iterrows():
            rows.append(
                {
                    "ticker": ticker,
                    "date": date.strftime("%Y-%m-%d"),
                    "close_price": round(float(row["Close"]), 2),
                }
            )
        print(f"{ticker}: {len(hist)} rows ({hist.index[0].date()} to {hist.index[-1].date()})")

    df = pd.DataFrame(rows, columns=["ticker", "date", "close_price"])
    # The most recent trading day can come back with a NaN close if the
    # session hasn't finished (or hasn't settled) yet at fetch time — drop
    # those so "most recent close" always means a completed trading day.
    before = len(df)
    df = df.dropna(subset=["close_price"])
    if before != len(df):
        print(f"Dropped {before - len(df)} incomplete row(s) (unsettled/in-progress trading day)")
    df.to_csv(OUT_PATH, index=False)
    print(f"\nWrote {len(df)} rows to {OUT_PATH}")


if __name__ == "__main__":
    main()
