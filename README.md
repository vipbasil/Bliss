# Bliss Toddler Translator (Phaser 3 + Vite)

Translator prototype using the toddler noun subset (`POS=YELLOW`) from `Docs/toddler_nouns_yellow.csv`.

## Run (dev)

- `npm install`
- `npm run dev`

## Build (production)

- `npm run build`
- `npm run preview`

Notes:
- Build copies only the toddler PNGs into `dist/bliss_h188_documentation_id_png/` (85 files) via `vite.config.cjs`.
- If you update `Docs/toddler_nouns_yellow.csv`, regenerate data with `npm run build:data`.

