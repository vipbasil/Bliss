# Bliss Toddler Translator (HTML5)

Uses the toddler noun subset (`POS=YELLOW`) from `Docs/toddler_nouns_yellow.csv`.

## Run

From the repo root:
- `python3 -m http.server 8000`
- Open `http://localhost:8000/web/`

## Rebuild dataset

- `python3 scripts/build_toddler_translator_data.py --in-csv Docs/toddler_nouns_yellow.csv --out-js web/toddlerData.js`

