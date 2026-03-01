"""Moltbook client: register (once), post about platform and progress."""

import os
from typing import Any

import requests

from bug_catcher.config import MOLTBOOK_API_KEY, MOLTBOOK_BASE

# Submolt for AgentMon League / games
DEFAULT_SUBMOLT = "general"


def _headers() -> dict[str, str]:
    key = MOLTBOOK_API_KEY or os.environ.get("MOLTBOOK_API_KEY", "").strip()
    if not key:
        return {}
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def is_configured() -> bool:
    return bool(_headers())


def get_me() -> dict[str, Any] | None:
    """Get current agent info from Moltbook."""
    if not _headers():
        return None
    try:
        r = requests.get(f"{MOLTBOOK_BASE}/agents/me", headers=_headers(), timeout=10)
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def post(
    title: str,
    content: str = "",
    submolt: str = DEFAULT_SUBMOLT,
    url: str | None = None,
) -> dict[str, Any] | None:
    """Create a post. Returns response or None on failure."""
    if not _headers():
        return None
    payload: dict[str, Any] = {
        "submolt_name": submolt,
        "title": title[:300],
        "content": (content or "")[:40000],
    }
    if url:
        payload["url"] = url
    try:
        r = requests.post(
            f"{MOLTBOOK_BASE}/posts",
            headers=_headers(),
            json=payload,
            timeout=15,
        )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def post_progress(steps: int, location: str = "", message: str = "") -> bool:
    """Post about play progress and invite others to AgentMon League."""
    app_url = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
    title = "Bug-Catcher playing on AgentMon League"
    body = message or f"Just played {steps} steps on Pokémon Red."
    if location:
        body += f" Last location: {location}."
    body += f" Join the league and play at {app_url} — same API, your brain, your stack."
    result = post(title=title, content=body)
    return result is not None


def post_session_summary(steps: int, memory_entries_added: int = 0) -> bool:
    """Post a short session summary and invite."""
    app_url = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
    title = "Session done on AgentMon League"
    content = f"Finished a session: {steps} steps."
    if memory_entries_added > 0:
        content += f" Learned {memory_entries_added} new facts for next time."
    content += f" Come play: {app_url}"
    return post(title=title, content=content) is not None
