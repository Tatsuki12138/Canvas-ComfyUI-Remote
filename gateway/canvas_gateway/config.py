from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

PACKAGE_ROOT = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
_appdata = Path(os.getenv("APPDATA") or Path.home() / ".config")
DATA_ROOT = Path(os.getenv("CANVAS_DATA_DIR", _appdata / "CanvasGateway"))
CONFIG_PATH = Path(os.getenv("CANVAS_CONFIG", DATA_ROOT / "config.json"))

# ---- defaults (no hardcoded machine paths) ----
DEFAULT_CONFIG: dict[str, Any] = {
    "comfy_url": "http://127.0.0.1:8188",
    "comfy_python": "python",
    "comfy_workdir": "",
    "comfy_args": ["main.py", "--listen", "127.0.0.1", "--port", "8188"],
    "comfy_output_dir": "",
    "lora_dirs": [],
    "checkpoint_dirs": [],
    "retention_hours": 24,
    "tavern_image_retention_hours": 720,
    "proxy_url": "",
    "danbooru_base_url": "https://danbooru.donmai.us",
    "default_workflow": "anima_base",
    "workflows": [],
    "node_map": {},
}

DEFAULT_WORKFLOWS: list[dict[str, Any]] = [
    {
        "id": "anima_base",
        "label": "Anima Base",
        "path": "workflows/anima_base.json",
        "model_kind": "unet",
        "model_dirs": [],
        "features": ["txt2img"],
        "defaults": {"width": 1024, "height": 1024, "steps": 28, "cfg": 6.0, "seed": -1},
        "node_map": {
            "positive": {"node": "7", "input": "text"},
            "negative": {"node": "8", "input": "text"},
            "width": {"node": "9", "input": "width"},
            "height": {"node": "9", "input": "height"},
            "steps": {"node": "10", "input": "steps"},
            "cfg": {"node": "10", "input": "cfg"},
            "seed": {"node": "10", "input": "seed"},
            "filename_prefix": {"node": "12", "input": "filename_prefix"},
            "lora_stack": {"node": "5", "input": "lora_str"},
            "base_model": {"node": "2", "input": "unet_name"},
        },
    },
    {
        "id": "il_2_6_hires",
        "label": "IL 2.6 Hi-Res",
        "path": "workflows/il_2_6_hires.json",
        "model_kind": "checkpoint",
        "model_dirs": [],
        "features": ["txt2img", "hires"],
        "defaults": {
            "width": 896,
            "height": 1152,
            "steps": 24,
            "cfg": 7.0,
            "hires_steps": 15,
            "hires_cfg": 7.0,
            "hires_denoise": 0.6,
            "seed": -1,
        },
        "node_map": {
            "positive": {"node": "96", "input": "positive"},
            "negative": {"node": "5", "input": "text"},
            "width": {"node": "107", "input": "width"},
            "height": {"node": "107", "input": "height"},
            "steps": {"node": "103", "input": "steps"},
            "cfg": {"node": "103", "input": "cfg"},
            "seed": {"node": "103", "input": "seed"},
            "hires_seed": {"node": "42", "input": "seed"},
            "hires_steps": {"node": "42", "input": "steps"},
            "hires_cfg": {"node": "42", "input": "cfg"},
            "hires_denoise": {"node": "42", "input": "denoise"},
            "kernel_size": {"node": "42", "input": "kernel_size"},
            "hires_sampler_name": {"node": "42", "input": "sampler_name"},
            "hires_scheduler": {"node": "42", "input": "scheduler"},
            "filename_prefix": {"node": "350", "input": "filename_prefix"},
            "lora_stack": {"node": "8", "input": "lora_str"},
            "base_model": {"node": "398", "input": "ckpt_name"},
        },
    },
]


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = {**base}
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


CONFIG: dict[str, Any] = {}


def load_config() -> dict[str, Any]:
    global CONFIG
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(
            json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    try:
        loaded = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        loaded = {}

    config = _deep_merge(DEFAULT_CONFIG, loaded)

    # backfill workflows if config has none
    if not config.get("workflows"):
        config["workflows"] = DEFAULT_WORKFLOWS

    comfy_output_default = config.get("comfy_output_dir", "")
    if not comfy_output_default and config.get("comfy_workdir"):
        config["comfy_output_dir"] = str(
            Path(config["comfy_workdir"]) / "output"
        ).replace("\\", "/")

    CONFIG = config
    return config


def resolve_package_path(value: str | Path) -> Path:
    """Resolve user paths next to the config first, then bundled package assets."""
    path = Path(value)
    if path.is_absolute():
        return path
    user_candidate = (CONFIG_PATH.parent / path).resolve()
    if user_candidate.exists():
        return user_candidate
    return (PACKAGE_ROOT / path).resolve()
