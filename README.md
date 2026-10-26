# 13-Week Cash Flow Forecast

An interactive 13-week direct cash flow forecast, the format treasury teams and lenders use to manage short-term liquidity. It runs best, base and worst-case scenarios side by side, draws on a revolving credit facility to protect minimum cash, and tests a liquidity covenant every week.

**Live demo:** https://dewapriya.com/projects/cash-flow/

> The sample is **fictional**: a Maldives seaplane operator moving from the low season into the December peak (the same company as my [AR Collections Dashboard](https://github.com/amila-nandasiri/ar-collections-dashboard)). No real company information is used.

## Why I built it

As Head of Finance I prepared forecasts and reporting for banks and funding partners. Their first questions are always the same: how low does cash get, when, and does the business stay within its facility and covenants if things go wrong? This model answers those questions in one screen, and lets you test the answers with sliders.

## What it does

- **Three scenarios at once.** Best, base and worst case each have their own assumptions, and all three stay on the charts.
- **Six drivers:**
  - **Sales volume** flexes collections from new sales, and fuel use with activity.
  - **Collection delay** spreads receipts over later weeks with the chosen average delay.
  - **Bad debt** reduces collections from opening receivables.
  - **Fuel price** changes the cost of fuel.
  - **Cost savings or overrun** applies to suppliers and other payments.
  - **Capex deferral** pushes capital spending into later weeks.
- **Credit facility.** It's drawn automatically to keep cash at the minimum, repaid from cash above 1.5× the minimum, and charged interest weekly.
- **Covenant test.** Liquidity (cash plus undrawn facility) is checked against the covenant minimum every week, with breach weeks and any funding gap flagged.
- **Charts:**
  - closing cash by week
  - liquidity against the covenant
  - a cash bridge from opening to closing cash
- **Tables:** the full 13-week table in lender format (USD thousands, payments in brackets), by line item or by category, and a scenario comparison.

## Use your own forecast

Select **Use your data** and upload the Excel template (Settings and Forecast sheets) or a forecast CSV:

- **Forecast:** one row per receipt or payment, with columns `week_1` to `week_13` (or week-commencing dates), a `type` (receipt or payment) and a `category` that tells the sliders what to flex.
- **Settings:** opening cash, minimum cash, facility limit, amount drawn, interest rate and covenant. These can also be typed into the upload form.

Files are read and calculated entirely in the browser. Nothing is uploaded or stored.

## Reports

- **Excel:** a summary of assumptions and results, plus a 13-week sheet for each scenario
- **PDF:** prints the selected scenario on landscape A4 pages
- **CSV:** the selected scenario's 13-week table

## Offline version

`npm run build` also produces `dist/cash-flow-forecast.html`: the whole model, with the sample, in one self-contained file that works without an internet connection.

## Tech

- **App:** React, TypeScript, Recharts and Tailwind CSS, built with Vite
- **Model:** [`src/lib/model.ts`](src/lib/model.ts) covers scenarios, the facility and the covenant. Import is in [`src/lib/importer.ts`](src/lib/importer.ts).
- **Sample data:** [`data/forecast.csv`](data/forecast.csv) and [`data/settings.csv`](data/settings.csv), in the same format as the upload template
- **Excel:** [read-excel-file](https://www.npmjs.com/package/read-excel-file) and [write-excel-file](https://www.npmjs.com/package/write-excel-file), running in the browser

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # hosted build in dist/, plus the single-file offline version
```

---

Built by [Amila Dewapriya](https://dewapriya.com), CMA: finance professional building with data and code.
