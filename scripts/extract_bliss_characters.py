#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract rows whose English derivation contains '- Character'."
    )
    parser.add_argument(
        "--csv",
        type=Path,
        required=True,
        help="Source CSV (expects 'BCI-AV#' and 'Derivation - explanation' columns).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output CSV path.",
    )
    parser.add_argument(
        "--substring",
        default="- Character",
        help="Substring to match inside the derivation field (default: '- Character').",
    )
    parser.add_argument(
        "--pos",
        help="Optional POS filter (comma-separated, e.g. YELLOW,WHITE).",
    )
    args = parser.parse_args()

    src = args.csv
    out = args.out
    substring = args.substring
    pos_filter = None
    if args.pos:
        pos_filter = {p.strip().upper() for p in args.pos.split(",") if p.strip()}

    with src.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise SystemExit(f"No header found in {src}")

        required = {"BCI-AV#", "English", "Derivation - explanation", "POS", "WinBliss"}
        missing = [c for c in required if c not in reader.fieldnames]
        if missing:
            raise SystemExit(f"Missing columns in {src}: {missing}. Found: {reader.fieldnames}")

        rows = []
        for row in reader:
            deriv = (row.get("Derivation - explanation") or "")
            if substring in deriv:
                pos = (row.get("POS") or "").strip()
                if pos_filter and pos.strip().upper() not in pos_filter:
                    continue
                rows.append(
                    {
                        "BCI-AV#": (row.get("BCI-AV#") or "").strip(),
                        "English": (row.get("English") or "").strip(),
                        "POS": pos,
                        "Derivation - explanation": deriv.strip(),
                        "WinBliss": (row.get("WinBliss") or "").strip(),
                    }
                )

    rows.sort(key=lambda r: int(r["BCI-AV#"]) if r["BCI-AV#"].isdigit() else 0)

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["BCI-AV#", "English", "POS", "Derivation - explanation", "WinBliss"],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {out}")


if __name__ == "__main__":
    main()
