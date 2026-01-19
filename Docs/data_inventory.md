# Data inventory (Bliss project)

## What’s in this folder

### 1) Main lexicon + translations (CSV)
File:
- `Copy of BCI-AV_SKOG_2025-02-15_(en+sv+no+fi+hu+de+nl+af+ru+is+lt+lv+po+fr+es+pt+it+dk)+derivations_8483-29642 - 8483-29642.csv`

High-level:
- **6419 rows** (unique `BCI-AV#`), id range **8483–29642**
- English label for every row, translations for many languages
- `POS` is a color tag: `YELLOW`, `RED`, `GREEN`, `BLUE`, `WHITE`, `GRAY/GREY` (likely grammatical/category metadata)
- `WinBliss` is present for most rows (an encoded representation used by WinBliss-style tooling)
- Some “derivation/explanation” text exists in English + partial Swedish/Norwegian columns

Columns (as of the current file):
- `BCI-AV#` (numeric id)
- `English`
- `Derivation - explanation`
- `POS` (color)
- Language columns: `Swedish`, `Norwegian`, `Finnish`, `Hungarian`, `German`, `Dutch`, `Afrikaans`, `Russian`, `Icelandic`, `Lithuanian`, `Latvian`, `Polish`, `French`, `Spanish`, `Portugese`, `Italian`, `Danish`
- `WinBliss`
- `Blissymbol` is currently empty in this CSV (all null)

Notes:
- English, Norwegian are fully filled; other languages are partially filled.
- The CSV contains **more ids than the included image sets** (see “Missing assets” below).

### 2) ID → keyword(s) mapping (TXT)
File:
- `map.txt`

Format:
- One entry per line: `<id><TAB><comma-separated keywords>`
- Example: `8483\texclamation_mark`

Stats:
- **6183 entries**, id range **8483–29111**
- Keywords are primarily English-ish “slugs” (underscores, parentheses), often with synonyms/aliases.

### 3) Symbol image assets (SVG + PNG)
Folders:
- `bliss_svg_id/` — **6182** files named `<id>.svg`, id range **8483–29111**
- `bliss_h188_documentation_id_png/` — **6182** files named `<id>.png`, id range **8483–29111**
- `bliss_h1000_transp_png/` — **6182** PNGs named by keyword (e.g. `exclamation_mark.png`)

Also:
- `zip/bliss_svg_id.zip`
- `zip/bliss_h1000_transp_png (1).zip`

Remote (complete h188 PNG set by id):
- `http://www.blissymbolics.net/png_h188_doc/<id>.png`

Downloader script (fills missing ids into the local PNG folder):
- `scripts/download_h188_doc_png.py`

## How these pieces connect (practical linking rules)

### Best “stable id” join key
- Use `BCI-AV#` from the CSV as the canonical symbol id.

### To load an image by id (recommended)
- SVG: `bliss_svg_id/<BCI-AV#>.svg`
- PNG: `bliss_h188_documentation_id_png/<BCI-AV#>.png`

### To load an image by keyword (alternative)
- Use `map.txt` to pick a primary keyword, then load:
  - `bliss_h1000_transp_png/<keyword>.png`

## Missing assets / coverage gaps

### CSV ids that don’t have SVG/PNG in this repo
- **236 ids**: **29201–29642** exist in the CSV but are not present in `map.txt` and have no `<id>.svg/.png` in the included image folders.
- **1 id inside the “asset range” is missing an image**: `25458` (`indicator_(diminutive_form)_(OLD)` in CSV; `indicator_(diminutive_form)_OLD` in `map.txt`).

You can fetch most missing PNGs by id from the remote endpoint above (for example, ids 29201–29642 return 200). `25458` appears to be 404 on the remote endpoint.

## Implications for the HTML5 game (what data you already have)
- A large multilingual dictionary keyed by `BCI-AV#` with:
  - English concept labels
  - Many translations
  - A categorical tag (`POS` colors)
  - Some explanation/derivation text
- A mostly-complete image set for ids **8483–29111** (6182 symbols), in both SVG and PNG forms.
- A keyword/synonym map (useful for search, fuzzy matching, “type to find”, etc.).

## Suggested next decision (before coding UI)
- Pick an “initial playable subset” of symbol ids (e.g. 100–300 items) that match your target children + therapy goals, and ensure those ids have assets (≤29111 and not 25458).
