"""LLM decision: state + screenText + short-term + memory dataset (no images)."""

import re
from collections import deque
from typing import Any

from openai import OpenAI

from bug_catcher.config import VALID_ACTIONS


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
) -> list[str]:
    """Return a list of 1+ action words. Uses text only (state + screenText + memory)."""
    state_desc = (
        f"Location: {state.get('mapName', '?')} (x={state.get('x')}, y={state.get('y')}), "
        f"party size: {state.get('partySize', 0)}."
    )
    if state.get("localMap"):
        state_desc += f" Local map name: {state.get('localMap')}."
    short_text = format_short_term(short_term)
    long_text = format_memory_entries(memory_entries)

    prompt = f"""You are playing Pokémon Red on a Game Boy. Use the current game state and on-screen text to choose what to do next. Do NOT describe the image — you receive text only.

**Current state:** {state_desc}

**On-screen text (from the game):**
{screen_text or '(none yet)'}

**What you did recently (last steps):**
{short_text}

**What you've learned from past play (locations, NPCs, battles, layout):**
{long_text}

Reply with a sequence of button presses. Each word is one press. Valid words: up, down, left, right, a, b, start, select, pass.

Examples: "a" or "up" or "right right down a" or "a a a a"
Plan a short path when you know the goal; use one word when you need to see the result first. Prefer 2–6 moves per reply.

Reply with only the space-separated word(s), nothing else."""

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=60,
    )
    text = (response.choices[0].message.content or "").strip().lower()
    tokens = re.findall(r"\b(" + "|".join(VALID_ACTIONS) + r")\b", text)
    return tokens if tokens else ["pass"]
