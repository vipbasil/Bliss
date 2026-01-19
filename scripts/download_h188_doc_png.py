#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://www.blissymbolics.net/png_h188_doc"


def iter_ids_from_csv(csv_path: Path, id_column: str = "BCI-AV#") -> list[int]:
    ids: list[int] = []
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or id_column not in reader.fieldnames:
            raise SystemExit(
                f"CSV {csv_path} is missing expected id column {id_column!r}. "
                f"Found columns: {reader.fieldnames}"
            )
        for row in reader:
            raw = (row.get(id_column) or "").strip()
            if not raw:
                continue
            try:
                ids.append(int(raw))
            except ValueError:
                continue
    return sorted(set(ids))


def parse_ids_arg(ids_arg: str) -> list[int]:
    out: list[int] = []
    for part in ids_arg.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            lo_s, hi_s = part.split("-", 1)
            lo = int(lo_s.strip())
            hi = int(hi_s.strip())
            if hi < lo:
                lo, hi = hi, lo
            out.extend(range(lo, hi + 1))
        else:
            out.append(int(part))
    return sorted(set(out))


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class DownloadResult:
    symbol_id: int
    status: str  # ok | skipped | not_found | error
    url: str
    path: str | None = None
    error: str | None = None


def _download_one(
    *,
    symbol_id: int,
    base_url: str,
    out_dir: Path,
    timeout_s: float,
    throttle_ms: int,
    overwrite: bool,
    retries: int,
    retry_backoff_ms: int,
    user_agent: str,
) -> DownloadResult:
    url = f"{base_url.rstrip('/')}/{symbol_id}.png"
    out_path = out_dir / f"{symbol_id}.png"
    if out_path.exists() and not overwrite:
        return DownloadResult(symbol_id=symbol_id, status="skipped", url=url, path=str(out_path))

    tmp_path = out_dir / f"{symbol_id}.png.part"

    if throttle_ms > 0:
        time.sleep(throttle_ms / 1000)

    try:
        last_err: str | None = None
        for attempt in range(retries + 1):
            try:
                req = Request(url, headers={"User-Agent": user_agent})
                with urlopen(req, timeout=timeout_s) as resp:
                    status = getattr(resp, "status", None) or 200
                    if status != 200:
                        last_err = f"HTTP {status}"
                        raise URLError(last_err)
                    content_type = (resp.headers.get("Content-Type") or "").lower()
                    if "image/png" not in content_type:
                        return DownloadResult(
                            symbol_id=symbol_id,
                            status="error",
                            url=url,
                            error=f"unexpected content-type: {content_type or 'unknown'}",
                        )
                    data = resp.read()
                    ensure_dir(out_dir)
                    tmp_path.write_bytes(data)
                    os.replace(tmp_path, out_path)
                    return DownloadResult(
                        symbol_id=symbol_id, status="ok", url=url, path=str(out_path)
                    )
            except HTTPError as e:
                if e.code == 404:
                    return DownloadResult(
                        symbol_id=symbol_id, status="not_found", url=url, error="HTTP 404"
                    )
                last_err = f"HTTP {e.code}"
            except (URLError, TimeoutError) as e:
                last_err = str(e)
            except Exception as e:  # noqa: BLE001
                last_err = repr(e)

            if attempt < retries:
                time.sleep((retry_backoff_ms / 1000) * (2**attempt))

        return DownloadResult(
            symbol_id=symbol_id, status="error", url=url, error=last_err or "unknown"
        )
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


def filter_only_missing(ids: Iterable[int], out_dir: Path) -> list[int]:
    out: list[int] = []
    for i in ids:
        if not (out_dir / f"{i}.png").exists():
            out.append(i)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download Blissymbolics h188 documentation PNGs by id."
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument("--csv", type=Path, help="CSV file to read ids from (BCI-AV# column).")
    parser.add_argument(
        "--id-column",
        default="BCI-AV#",
        help="CSV column name for the symbol id (default: BCI-AV#).",
    )
    parser.add_argument(
        "--ids",
        help="Comma-separated ids and/or ranges (example: 8483,8484,29201-29210).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("bliss_h188_documentation_id_png"),
        help="Output directory (default: bliss_h188_documentation_id_png).",
    )
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="Only download files not already present in --out.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing files.")
    parser.add_argument(
        "--workers",
        type=int,
        default=2,
        help="Number of parallel downloads (default: 2).",
    )
    parser.add_argument(
        "--throttle-ms",
        type=int,
        default=50,
        help="Sleep this many ms before each request (default: 50).",
    )
    parser.add_argument(
        "--timeout-s",
        type=float,
        default=20.0,
        help="Request timeout in seconds (default: 20).",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retries for transient errors (default: 2).",
    )
    parser.add_argument(
        "--retry-backoff-ms",
        type=int,
        default=250,
        help="Base backoff between retries in ms (default: 250).",
    )
    parser.add_argument(
        "--max",
        type=int,
        default=0,
        help="Limit the number of ids processed (0 means no limit).",
    )
    args = parser.parse_args()

    if not args.csv and not args.ids:
        raise SystemExit("Provide either --csv or --ids.")

    ids: list[int] = []
    if args.csv:
        ids.extend(iter_ids_from_csv(args.csv, id_column=args.id_column))
    if args.ids:
        ids.extend(parse_ids_arg(args.ids))
    ids = sorted(set(ids))

    if args.only_missing and not args.overwrite:
        ids = filter_only_missing(ids, args.out)

    if args.max and args.max > 0:
        ids = ids[: args.max]

    ensure_dir(args.out)

    user_agent = "BlissDownloader/1.0 (+https://example.invalid)"
    results: list[DownloadResult] = []
    started = time.time()

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futures = [
            ex.submit(
                _download_one,
                symbol_id=i,
                base_url=args.base_url,
                out_dir=args.out,
                timeout_s=args.timeout_s,
                throttle_ms=args.throttle_ms,
                overwrite=args.overwrite,
                retries=max(0, args.retries),
                retry_backoff_ms=max(0, args.retry_backoff_ms),
                user_agent=user_agent,
            )
            for i in ids
        ]
        for fut in as_completed(futures):
            res = fut.result()
            results.append(res)
            if res.status in {"ok", "not_found", "error"}:
                msg = res.status
                if res.error:
                    msg += f" ({res.error})"
                print(f"{res.symbol_id}: {msg}")

    elapsed_s = time.time() - started
    summary = {
        "base_url": args.base_url,
        "out_dir": str(args.out),
        "count_requested": len(ids),
        "count_ok": sum(1 for r in results if r.status == "ok"),
        "count_skipped": sum(1 for r in results if r.status == "skipped"),
        "count_not_found": sum(1 for r in results if r.status == "not_found"),
        "count_error": sum(1 for r in results if r.status == "error"),
        "elapsed_s": round(elapsed_s, 3),
        "not_found_ids": sorted([r.symbol_id for r in results if r.status == "not_found"]),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
