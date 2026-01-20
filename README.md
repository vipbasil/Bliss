# Bliss Toddler Translator (Phaser 3 + Vite)

Translator prototype using the toddler noun subset (`POS=YELLOW`) from `Docs/toddler_nouns_yellow.csv`.

## Run (dev)

- `npm install`
- `npm run dev`

## Generate picture cards (Flux)

This game expects optional “picture cards” at `public/picto/<id>.png`. If present, the left prompt will show the picture; otherwise it falls back to the concept name.

- Install: `python3 -m pip install gradio-client pillow`
- Generate: `python3 scripts/generate_pictos_flux.py --limit 10` (remove `--limit` for all). If the endpoint changes, pass `--endpoint <url>`.

## Build (production)

- `npm run build`
- `npm run preview`

Notes:
- Build copies only the toddler PNGs into `dist/bliss_h188_documentation_id_png/` (85 files) via `vite.config.cjs`.
- If you update `Docs/toddler_nouns_yellow.csv`, regenerate data with `npm run build:data`.
