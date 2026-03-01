"""Raw step logs and memory dataset storage for Bug-Catcher."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from bug_catcher.config import MEMORY_DATASET_PATH, RAW_LOGS_DIR


def ensure_dirs() -> None:
    RAW_LOGS_DIR.mkdir(parents=True, exist_ok=True)
    MEMORY_DATASET_PATH.parent.mkdir(parents=True, exist_ok=True)


def raw_log_path(run_id: str) -> Path:
    return RAW_LOGS_DIR / f"run_{run_id}.jsonl"


def append_raw_step(run_id: str, record: dict[str, Any]) -> None:
    ensure_dirs()
    path = raw_log_path(run_id)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def list_raw_runs() -> list[Path]:
    ensure_dirs()
    return sorted(RAW_LOGS_DIR.glob("run_*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)


def read_raw_log(path: Path) -> Iterator[dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def load_memory_dataset(limit: int = 0) -> list[dict[str, Any]]:
    """Load memory dataset entries (newest last). limit=0 means all."""
    ensure_dirs()
    if not MEMORY_DATASET_PATH.exists():
        return []
    out: list[dict[str, Any]] = []
    with open(MEMORY_DATASET_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
    if limit > 0 and len(out) > limit:
        return out[-limit:]
    return out


def append_memory_entries(entries: list[dict[str, Any]]) -> None:
    ensure_dirs()
    with open(MEMORY_DATASET_PATH, "a", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
