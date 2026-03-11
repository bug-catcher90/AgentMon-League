"""LLM decision: state + screenText + short-term + memory dataset; optionally game screenshot (vision).
Uses agent/ (AGENT, SOUL, skills) for persona and hybrid step-count: LLM decides
how many actions to output, we execute them then send a new query.
When frame_bytes is provided, sends image to a vision-capable model for richer context."""

import base64
import re
from collections import deque
from pathlib import Path
from typing import Any

from openai import OpenAI

from bug_catcher.config import VALID_ACTIONS

_AGENT_DIR = Path(__file__).resolve().parent / "agent"
_MAX_AGENT_CONTEXT_CHARS = 4000


def _load_agent_context() -> str:
    """Load AGENT.md + SOUL.md + skills/play_pokemon.md for prompt persona. Capped to avoid token overflow."""
    parts: list[str] = []
    for name in ("AGENT.md", "SOUL.md", "skills/play_pokemon.md"):
        p = _AGENT_DIR / name
        if p.exists():
            try:
                parts.append(p.read_text(encoding="utf-8").strip())
            except OSError:
                pass
    if not parts:
        return ""
    combined = "\n\n---\n\n".join(parts)
    if len(combined) > _MAX_AGENT_CONTEXT_CHARS:
        combined = combined[: _MAX_AGENT_CONTEXT_CHARS] + "\n\n[...truncated]"
    return combined


def format_short_term(mem: deque) -> str:
    if not mem:
        return "None yet."
    lines = []
    for i, (sb, act, sa, st) in enumerate(mem, 1):
        loc_before = sb.get("mapName", "?")
        loc_after = sa.get("mapName", "?")
        text = (st or "")[:80] + ("..." if len(st or "") > 80 else "")
        lines.append(f"  {i}. {loc_before} -> {act} -> {loc_after}. Screen: {text or '(none)'}")
    return "\n".join(lines)


def format_memory_entries(entries: list[dict[str, Any]]) -> str:
    if not entries:
        return "None yet."
    lines = []
    for e in entries[-80:]:  # last 80 entries to avoid token overflow
        kind = e.get("type", "fact")
        content = e.get("content", "")
        if content:
            lines.append(f"  - [{kind}] {content}")
    return "\n".join(lines) if lines else "None yet."


def choose_action(
    client: OpenAI,
    state: dict[str, Any],
    screen_text: str,
    short_term: deque,
    memory_entries: list[dict[str, Any]],
    model: str = "gpt-4o",
    frame_bytes: bytes | None = None,
) -> list[str]:
    """Return a list of 1+ action words. Uses agent persona + state + screenText + memory.
    If frame_bytes is provided, sends the current game screenshot so the model can use vision.
    Hybrid: you decide how many steps to output; we execute them then send a new query."""
    state_desc = (
        f"Location: {state.get('mapName', '?')} (x={state.get('x')}, y={state.get('y')}), "
        f"party size: {state.get('partySize', 0)}."
    )
    if state.get("localMap"):
        state_desc += f" Local map name: {state.get('localMap')}."
    short_text = format_short_term(short_term)
    long_text = format_memory_entries(memory_entries)

    agent_context = _load_agent_context()
    context_block = (
        f"{agent_context}\n\n"
        if agent_context
        else ""
    )

    prompt = f"""{context_block}**Current state:** {state_desc}

**On-screen text (from the game):**
{screen_text or '(none yet)'}

**What you did recently (last steps):**
{short_text}

**What you've learned from past play (locations, NPCs, battles, layout):**
{long_text}

You must reply with a sequence of 1–6 button presses. **You decide how many:**
- Output **1** when you need to see the result (e.g. dialogue, menu, battle choice).
- Output **2–6** when you know the path (e.g. walking to a door, crossing a known room).
Valid words only: up, down, left, right, a, b, start, select, pass.

Reply with only the space-separated word(s), nothing else."""

    if frame_bytes:
        prompt_with_image = (
            "Below is the current game screen (Pokémon Red, Game Boy). Use it together with the state and text above to decide your next actions.\n\n"
            + prompt
        )
        b64 = base64.standard_b64encode(frame_bytes).decode("ascii")
        content: list[dict[str, Any]] = [
            {"type": "text", "text": prompt_with_image},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ]
    else:
        content = prompt

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": content}],
        max_tokens=80,
    )
    text = (response.choices[0].message.content or "").strip().lower()
    tokens = re.findall(r"\b(" + "|".join(VALID_ACTIONS) + r")\b", text)
    return tokens if tokens else ["pass"]
