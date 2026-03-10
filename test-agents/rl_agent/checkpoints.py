"""Checkpoint and metrics storage for the RL template. Train script saves here; play loads best/latest."""

import json
import os
import time
from pathlib import Path

from rl_agent.config import CHECKPOINT_DIR, METRICS_DIR, SAVE_BEST

BEST_FILENAME = "best_model.zip"
METRICS_FILENAME = "metrics.jsonl"


def get_checkpoint_dir() -> Path:
    p = Path(CHECKPOINT_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_metrics_path() -> Path:
    p = Path(METRICS_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p / METRICS_FILENAME


def save_model(model, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(path))


def load_latest_path() -> str | None:
    """Path to the most recently saved checkpoint (by mtime), or None."""
    d = get_checkpoint_dir()
    zips = list(d.glob("*.zip"))
    if not zips:
        return None
    latest = max(zips, key=lambda p: p.stat().st_mtime)
    return str(latest)


def load_best_path() -> str | None:
    """Path to best_model.zip if it exists and SAVE_BEST is on."""
    if not SAVE_BEST:
        return None
    p = get_checkpoint_dir() / BEST_FILENAME
    return str(p) if p.exists() else None


def get_load_path(prefer_best: bool = True) -> str | None:
    """Preferred path for play: best if available, else latest."""
    if prefer_best:
        best = load_best_path()
        if best:
            return best
    return load_latest_path()


def log_metrics(episode: int, total_steps: int, episode_reward: float, episode_len: int, **kwargs) -> None:
    """Append one line of metrics (for upgrade tracking)."""
    path = get_metrics_path()
    record = {
        "episode": episode,
        "total_steps": total_steps,
        "episode_reward": episode_reward,
        "episode_len": episode_len,
        **kwargs,
    }
    with open(path, "a") as f:
        f.write(json.dumps(record) + "\n")


PLAY_RUNS_FILENAME = "play_runs.jsonl"


def get_play_runs_path() -> Path:
    p = Path(METRICS_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p / PLAY_RUNS_FILENAME


def log_play_run(total_steps: int, **kwargs) -> None:
    """Append one line for a play run (for stop/store and later training data)."""
    path = get_play_runs_path()
    record = {
        "total_steps": total_steps,
        "ts": time.time(),
        **kwargs,
    }
    with open(path, "a") as f:
        f.write(json.dumps(record) + "\n")


