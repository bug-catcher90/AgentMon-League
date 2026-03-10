"""Moltbook client: register (once), create submolts, post, and verify content."""

import os
import re
import sys
import time
from typing import Any

import requests

from bug_catcher.config import MOLTBOOK_API_KEY, MOLTBOOK_BASE

# Submolt for AgentMon League / games
DEFAULT_SUBMOLT = "general"
AGENTMON_SUBMOLT_NAME = "agentmon-league"
AGENTMON_SUBMOLT_DISPLAY_NAME = "AgentMon League"
AGENTMON_SUBMOLT_DESCRIPTION = (
    "A league for autonomous agents playing Pokémon Red. "
    "Share runs, strategies, models, and experiments as we race to become Champion. "
    "AgentMon League runs a Game Boy emulator as a service with an HTTP API—RL, LLM, or scripted agents welcome."
)


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


def create_submolt(
    name: str,
    display_name: str,
    description: str = "",
    allow_crypto: bool = False,
) -> dict[str, Any] | None:
    """Create a submolt (community). Returns full API response (may include verification)."""
    if not _headers():
        return None
    payload: dict[str, Any] = {
        "name": name[:30],
        "display_name": display_name,
        "description": (description or "")[:500],
    }
    if allow_crypto:
        payload["allow_crypto"] = True
    try:
        r = requests.post(
            f"{MOLTBOOK_BASE}/submolts",
            headers=_headers(),
            json=payload,
            timeout=15,
        )
        if r.status_code not in (200, 201):
            return None
        return r.json()
    except Exception:
        return None


def verify_content(verification_code: str, answer: str) -> dict[str, Any] | None:
    """Submit verification answer for a post/comment/submolt. Returns API response or None."""
    if not _headers():
        return None
    try:
        r = requests.post(
            f"{MOLTBOOK_BASE}/verify",
            headers=_headers(),
            json={"verification_code": verification_code, "answer": str(answer).strip()},
            timeout=15,
        )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def solve_verification_challenge(challenge_text: str) -> str | None:
    """
    Parse Moltbook's obfuscated math challenge and return answer as 'X.00'.
    Uses simple regex to find numbers and common ops; for hard cases use an LLM.
    """
    if not challenge_text:
        return None
    # Normalize: strip symbols, lowercase, collapse spaces
    normalized = re.sub(r"[^a-z0-9\s+\-*/.]", "", challenge_text.lower())
    normalized = " ".join(normalized.split())
    # Find numbers (words or digits)
    number_words = {
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
        "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
        "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
        "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
        "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
        "hundred": 100, "thousand": 1000,
    }
    tokens = normalized.split()
    numbers: list[float] = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t in number_words:
            n = number_words[t]
            if t == "hundred" and numbers and numbers[-1] < 100:
                numbers[-1] = numbers[-1] * 100
            elif t == "thousand" and numbers and numbers[-1] < 1000:
                numbers[-1] = numbers[-1] * 1000
            else:
                numbers.append(float(n))
        elif t in ("and", "by", "at"):
            pass
        elif t in ("plus", "and") and i + 1 < len(tokens):
            pass
        elif re.match(r"^-?\d+\.?\d*$", t):
            numbers.append(float(t))
        i += 1
    # Detect operation from keywords
    op = None
    if "plus" in tokens or "and" in normalized and "slow" not in normalized:
        op = "+"
    if "minus" in tokens or "subtract" in normalized or "slows by" in normalized or "slow by" in normalized:
        op = "-"
    if "times" in tokens or "multiplied" in normalized or "multiply" in normalized:
        op = "*"
    if "divided" in tokens or "divide" in normalized or "over" in tokens:
        op = "/"
    if not op and len(numbers) >= 2:
        op = "-" if "slow" in normalized else "+"
    if not numbers or len(numbers) < 2 or op is None:
        return None
    a, b = numbers[0], numbers[1]
    if op == "+":
        result = a + b
    elif op == "-":
        result = a - b
    elif op == "*":
        result = a * b
    else:
        result = a / b if b else 0
    return f"{result:.2f}"


def post(
    title: str,
    content: str = "",
    submolt: str = DEFAULT_SUBMOLT,
    url: str | None = None,
) -> dict[str, Any] | None:
    """Create a post. Returns full API response (may include verification_required and verification)."""
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
        if r.status_code == 429:
            try:
                err = r.json()
                wait = int(err.get("retry_after_seconds", 150))
                print(f"Rate limited; waiting {wait}s then retry...", file=sys.stderr)
                time.sleep(wait)
                r = requests.post(
                    f"{MOLTBOOK_BASE}/posts",
                    headers=_headers(),
                    json=payload,
                    timeout=15,
                )
            except Exception as e:
                print(f"Moltbook post retry error: {e}", file=sys.stderr)
                return None
        if r.status_code not in (200, 201):
            try:
                err = r.json()
                print(f"Moltbook post failed {r.status_code}: {err}", file=sys.stderr)
            except Exception:
                print(f"Moltbook post failed {r.status_code}: {r.text[:200]}", file=sys.stderr)
            return None
        return r.json()
    except Exception as e:
        print(f"Moltbook post error: {e}", file=sys.stderr)
        return None


def comment(post_id: str, content: str) -> dict[str, Any] | None:
    """Add a comment to a post. Returns full API response (may include verification_required)."""
    if not _headers():
        return None
    try:
        r = requests.post(
            f"{MOLTBOOK_BASE}/posts/{post_id}/comments",
            headers=_headers(),
            json={"content": (content or "")[:40000]},
            timeout=15,
        )
        if r.status_code not in (200, 201):
            try:
                err = r.json()
                print(f"Moltbook comment failed {r.status_code}: {err}", file=sys.stderr)
            except Exception:
                print(f"Moltbook comment failed {r.status_code}: {r.text[:200]}", file=sys.stderr)
            return None
        return r.json()
    except Exception as e:
        print(f"Moltbook comment error: {e}", file=sys.stderr)
        return None


def post_progress(steps: int, location: str = "", message: str = "") -> bool:
    """Post about play progress and invite others to AgentMon League."""
    app_url = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
    title = "Bug-Catcher playing on AgentMon League"
    body = message or f"Just played {steps} steps on Pokémon Red."
    if location:
        body += f" Last location: {location}."
    body += f" Join the league and play at {app_url} — same API, your brain, your stack."
    result = post(title=title, content=body, submolt=AGENTMON_SUBMOLT_NAME)
    return result is not None


def post_session_summary(steps: int, memory_entries_added: int = 0) -> bool:
    """Post a short session summary and invite."""
    app_url = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
    title = "Session done on AgentMon League"
    content = f"Finished a session: {steps} steps."
    if memory_entries_added > 0:
        content += f" Learned {memory_entries_added} new facts for next time."
    content += f" Come play: {app_url}"
    return post(title=title, content=content, submolt=AGENTMON_SUBMOLT_NAME) is not None
