#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import os
import re
import shutil
import subprocess
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


def _in_venv() -> bool:
    base_prefix = getattr(sys, "base_prefix", None)
    if base_prefix is None:
        return False
    return sys.prefix != base_prefix


def _dep_error(extra: str | None = None) -> str:
    hint = (
        "Missing dependency: gradio_client.\n\n"
        f"Python used: {sys.executable}\n"
        f"Python version: {sys.version.split()[0]}\n\n"
        "Install with:\n"
        f'  "{sys.executable}" -m pip install gradio-client pillow\n'
    )
    if extra:
        return f"{hint}\n{extra}"
    return hint


def _ensure_gradio_client(auto_install: bool) -> type:
    try:
        from gradio_client import Client  # type: ignore

        return Client
    except Exception as e:
        if not auto_install:
            raise SystemExit(_dep_error(f"Import error: {e}"))

        pip_cmd = [sys.executable, "-m", "pip", "install"]
        if not _in_venv():
            pip_cmd.append("--user")
        pip_cmd += ["gradio-client", "pillow"]

        pip_result = subprocess.run(pip_cmd, capture_output=True, text=True)
        if pip_result.returncode != 0:
            ensurepip_cmd = [sys.executable, "-m", "ensurepip", "--upgrade"]
            ensurepip_result = subprocess.run(ensurepip_cmd, capture_output=True, text=True)
            if ensurepip_result.returncode == 0:
                pip_result = subprocess.run(pip_cmd, capture_output=True, text=True)

        if pip_result.returncode != 0:
            extra = (
                "Auto-install failed.\n\n"
                f"Command: {' '.join(pip_cmd)}\n\n"
                f"stdout:\n{pip_result.stdout}\n\n"
                f"stderr:\n{pip_result.stderr}\n"
            )
            raise SystemExit(_dep_error(extra))

        try:
            from gradio_client import Client  # type: ignore

            return Client
        except Exception as e2:
            raise SystemExit(_dep_error(f"Still cannot import after install: {e2}"))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Batch-generate toddler pictos via a Gradio FLUX endpoint."
    )
    parser.add_argument(
        "--endpoint",
        default="https://dea985e8601d759ce0.gradio.live/",
        help="Gradio base URL (default: current live link).",
    )
    parser.add_argument(
        "--in-csv",
        type=Path,
        default=Path("Docs/toddler_nouns_yellow.csv"),
        help="Input CSV (default: Docs/toddler_nouns_yellow.csv).",
    )
    parser.add_argument(
        "--ids",
        help="Optional comma-separated ids to generate (example: 12357,12405).",
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
    parser.add_argument(
        "--auto-install-deps",
        action="store_true",
        help="Try installing missing Python deps automatically (dev convenience).",
    )
    args = parser.parse_args()

    Client = _ensure_gradio_client(args.auto_install_deps)  # noqa: N806

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
    only_ids: set[str] | None = None
    if args.ids:
        only_ids = {p.strip() for p in args.ids.split(",") if p.strip()}

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
            if only_ids is not None and symbol_id not in only_ids:
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
