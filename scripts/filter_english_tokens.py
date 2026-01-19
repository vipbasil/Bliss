#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path


def normalize_english_to_tokens(english: str) -> set[str]:
    s = (english or "").lower()
    s = s.replace("-(to)", "")
    s = re.sub(r"\([^)]*\)", " ", s)
    s = s.replace("-", "_")
    s = re.sub(r"[^a-z0-9_]+", " ", s)
    tokens = {t for t in s.split() if t}
    return tokens


def read_allowlist(path: Path) -> set[str]:
    out: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        out.add(line.lower())
    return out


def read_exclude_ids(path: Path) -> set[str]:
    out: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.isdigit():
            out.add(line)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Filter a CSV by matching allowlisted tokens in the English column."
    )
    parser.add_argument("--in", dest="in_path", type=Path, required=True, help="Input CSV.")
    parser.add_argument("--out", type=Path, required=True, help="Output CSV.")
    parser.add_argument(
        "--allowlist",
        type=Path,
        required=True,
        help="Text file with one token per line.",
    )
    parser.add_argument(
        "--english-column",
        default="English",
        help="Column to tokenize (default: English).",
    )
    parser.add_argument(
        "--pos",
        help="Optional POS filter (comma-separated, matches the POS column).",
    )
    parser.add_argument(
        "--pos-column",
        default="POS",
        help="POS column name (default: POS).",
    )
    parser.add_argument(
        "--derivation-substring",
        help="Optional substring filter against the derivation column.",
    )
    parser.add_argument(
        "--derivation-column",
        default="Derivation - explanation",
        help="Derivation column name (default: Derivation - explanation).",
    )
    parser.add_argument(
        "--select",
        help="Optional comma-separated list of output columns (default: all columns).",
    )
    parser.add_argument(
        "--exclude-ids-file",
        type=Path,
        help="Optional text file with one numeric id per line to exclude.",
    )
    parser.add_argument(
        "--id-column",
        default="BCI-AV#",
        help="Id column name for --exclude-ids-file (default: BCI-AV#).",
    )
    parser.add_argument(
        "--min-matches",
        type=int,
        default=1,
        help="Minimum number of token matches required (default: 1).",
    )
    args = parser.parse_args()

    allow = read_allowlist(args.allowlist)
    pos_filter = None
    if args.pos:
        pos_filter = {p.strip().upper() for p in args.pos.split(",") if p.strip()}
    exclude_ids = set()
    if args.exclude_ids_file:
        exclude_ids = read_exclude_ids(args.exclude_ids_file)

    with args.in_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise SystemExit(f"No header found in {args.in_path}")
        if args.english_column not in reader.fieldnames:
            raise SystemExit(
                f"Missing column {args.english_column!r} in {args.in_path}. Found: {reader.fieldnames}"
            )
        if args.pos_column not in reader.fieldnames:
            if pos_filter:
                raise SystemExit(
                    f"Missing POS column {args.pos_column!r} in {args.in_path}. Found: {reader.fieldnames}"
                )
        if args.derivation_column not in reader.fieldnames:
            if args.derivation_substring:
                raise SystemExit(
                    f"Missing derivation column {args.derivation_column!r} in {args.in_path}. Found: {reader.fieldnames}"
                )

        rows = []
        for row in reader:
            if exclude_ids:
                symbol_id = (row.get(args.id_column) or "").strip()
                if symbol_id in exclude_ids:
                    continue
            if pos_filter:
                pos = (row.get(args.pos_column) or "").strip().upper()
                if pos not in pos_filter:
                    continue
            if args.derivation_substring:
                deriv = row.get(args.derivation_column) or ""
                if args.derivation_substring not in deriv:
                    continue
            tokens = normalize_english_to_tokens(row.get(args.english_column) or "")
            hits = tokens & allow
            if len(hits) >= args.min_matches:
                rows.append(row)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    out_fieldnames = reader.fieldnames
    if args.select:
        requested = [c.strip() for c in args.select.split(",") if c.strip()]
        missing = [c for c in requested if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"Requested columns not in input: {missing}")
        out_fieldnames = requested

    with args.out.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=out_fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in out_fieldnames})

    print(f"Wrote {len(rows)} rows to {args.out}")


if __name__ == "__main__":
    main()
