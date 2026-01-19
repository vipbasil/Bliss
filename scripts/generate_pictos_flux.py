#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import os
import re
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path


def normalize_phrase(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = s.replace("_", " ")
    s = s.replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def primary_concept(english_field: str) -> str:
    if not english_field:
        return ""
    first = english_field.split(",", 1)[0].strip()
    return normalize_phrase(first)


@dataclass(frozen=True)
class FluxParams:
    width: int
    height: int
    seed: int
    steps: int
    sampler_name: str
    scheduler: str
    guidance: float
    lora1_source: str
    lora1_url: str
    lora1_strength_model: float
    lora1_strength_clip: float
    lora2_source: str
    lora2_url: str
    lora2_strength_model: float
    lora2_strength_clip: float
    clip_skip: int


def build_gradio_args(prompt: str, p: FluxParams) -> list[object]:
    return [
        prompt,
        p.width,
        p.height,
        p.seed,
        p.steps,
        p.sampler_name,
        p.scheduler,
        p.guidance,
        p.lora1_source,
        p.lora1_url,
        p.lora1_strength_model,
        p.lora1_strength_clip,
        p.lora2_source,
        p.lora2_url,
        p.lora2_strength_model,
        p.lora2_strength_clip,
        p.clip_skip,
    ]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Batch-generate toddler pictos via a Gradio FLUX endpoint."
    )
    parser.add_argument(
        "--endpoint",
        default="https://caa0ba7f2d0549cc90.gradio.live/",
        help="Gradio base URL (default: provided live link).",
    )
    parser.add_argument(
        "--in-csv",
        type=Path,
        default=Path("Docs/toddler_nouns_yellow.csv"),
        help="Input CSV (default: Docs/toddler_nouns_yellow.csv).",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("public/picto"),
        help="Output directory for generated PNGs (default: public/picto).",
    )
    parser.add_argument(
        "--prompt-template",
        default=(
            "Simple flat children’s illustration of {concept}, centered, single object, "
            "white background, thick outline, minimal details, soft colors, high contrast, "
            "sticker icon style, toddler-friendly, no text, no watermark."
        ),
        help="Python format string with {concept}.",
    )
    parser.add_argument("--width", type=int, default=768)
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--steps", type=int, default=20)
    parser.add_argument("--guidance", type=float, default=3.5)
    parser.add_argument("--sampler", default="dpmpp_2m")
    parser.add_argument("--scheduler", default="sgm_uniform")
    parser.add_argument(
        "--seed",
        type=int,
        default=0,
        help="0 means random (default: 0).",
    )
    parser.add_argument(
        "--sleep-s",
        type=float,
        default=0.0,
        help="Sleep between requests (default: 0).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit number of images generated (0 means all).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing images.",
    )
    args = parser.parse_args()

    try:
        from gradio_client import Client  # type: ignore
    except Exception:
        raise SystemExit(
            "Missing dependency: gradio_client. Install with: python3 -m pip install gradio-client pillow"
        )

    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    p = FluxParams(
        width=args.width,
        height=args.height,
        seed=args.seed,
        steps=args.steps,
        sampler_name=args.sampler,
        scheduler=args.scheduler,
        guidance=args.guidance,
        lora1_source="civitai",
        lora1_url="",
        lora1_strength_model=1.0,
        lora1_strength_clip=1.0,
        lora2_source="civitai",
        lora2_url="",
        lora2_strength_model=1.0,
        lora2_strength_clip=1.0,
        clip_skip=0,
    )

    client = Client(args.endpoint)

    count = 0
    with args.in_csv.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise SystemExit(f"No header found in {args.in_csv}")
        if "BCI-AV#" not in reader.fieldnames or "English" not in reader.fieldnames:
            raise SystemExit(
                f"Expected columns BCI-AV# and English in {args.in_csv}. Found: {reader.fieldnames}"
            )

        for row in reader:
            symbol_id = (row.get("BCI-AV#") or "").strip()
            if not symbol_id.isdigit():
                continue
            concept = primary_concept(row.get("English") or "")
            if not concept:
                continue

            out_path = out_dir / f"{symbol_id}.png"
            if out_path.exists() and not args.overwrite:
                continue

            prompt = args.prompt_template.format(concept=concept)
            gradio_args = build_gradio_args(prompt, p)

            try:
                result_path = client.predict(*gradio_args, api_name="/generate")
            except Exception as e:
                print(f"{symbol_id}: ERROR {e}", file=sys.stderr)
                continue

            try:
                tmp = Path(str(result_path))
                if not tmp.exists():
                    raise FileNotFoundError(str(tmp))
                tmp_out = out_path.with_suffix(".png.part")
                shutil.copyfile(tmp, tmp_out)
                os.replace(tmp_out, out_path)
                print(f"{symbol_id}: ok -> {out_path}")
            except Exception as e:
                print(f"{symbol_id}: SAVE_ERROR {e}", file=sys.stderr)

            count += 1
            if args.limit and count >= args.limit:
                break
            if args.sleep_s and args.sleep_s > 0:
                time.sleep(args.sleep_s)


if __name__ == "__main__":
    main()

