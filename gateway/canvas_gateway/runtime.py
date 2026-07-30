"""Shared runtime state, wired by app.py on startup."""

from __future__ import annotations

from pathlib import Path
from typing import Any

_state: dict[str, Any] = {}
_jobs: dict[str, dict[str, Any]] = {}
_save_state: callable = lambda: None  # type: ignore[assignment]
_results_dir: Path = Path(".")
_tavern_images_dir: Path = Path(".")
_favorites_dir: Path = Path(".")
_log_dir: Path = Path(".")


def init_runtime(
    state: dict[str, Any],
    jobs: dict[str, dict[str, Any]],
    save_fn: callable,
    results_dir: Path,
    tavern_images_dir: Path,
    favorites_dir: Path,
    log_dir: Path,
) -> None:
    global _state, _jobs, _save_state, _results_dir, _tavern_images_dir, _favorites_dir, _log_dir
    _state = state
    _jobs = jobs
    _save_state = save_fn
    _results_dir = results_dir
    _tavern_images_dir = tavern_images_dir
    _favorites_dir = favorites_dir
    _log_dir = log_dir


def get_state() -> dict[str, Any]:
    return _state


def get_jobs() -> dict[str, dict[str, Any]]:
    return _jobs


def save_state() -> None:
    _save_state()


def results_dir() -> Path:
    return _results_dir


def tavern_images_dir() -> Path:
    return _tavern_images_dir


def favorites_dir() -> Path:
    return _favorites_dir


def log_dir() -> Path:
    return _log_dir
