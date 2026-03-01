#!/usr/bin/env python3
"""
Reference agent: LLM-based (OpenAI Vision).

Registers with AgentMon League, starts a Pokémon Red session, then uses OpenAI
Vision + game state + memory to choose actions. Each step returns game state
(map, position, party size); short-term memory (last N steps) and optional
long-term experience (SAVE_EXPERIENCE=1) are included in the prompt. The LLM
can reply with a sequence of button presses (e.g. "right right down a"); the
agent sends that sequence via the actions API.

See docs/AGENTS_OVERVIEW.md and test-agents/README.md. Requires: Next.js + emulator,
OPENAI_API_KEY and APP_URL in .env.
"""

import base64
import json
import os
import re
import sys
import time
from collections import deque

from pathlib import Path

from dotenv import load_dotenv
import requests
from openai import OpenAI

# Agents live in test-agents/: load .env from there only
_env_path = Path(__file__).resolve().parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
load_dotenv()

APP_URL = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
AGENT_ID = os.environ.get("AGENT_ID")
AGENT_KEY = os.environ.get("AGENT_KEY")
SAVE_EXPERIENCE = os.environ.get("SAVE_EXPERIENCE", "").strip().lower() in ("1", "true", "yes")
MEMORY_LEN = int(os.environ.get("MEMORY_LEN", "8"))  # last N steps in prompt
STARTER = os.environ.get("STARTER", "").strip().lower() or None  # bulbasaur, charmander, squirtle (when using has_pokedex init state)

VALID_ACTIONS = ["up", "down", "left", "right", "a", "b", "start", "select", "pass"]


def register():
    try:
        r = requests.post(f"{APP_URL}/api/auth/local/register", timeout=10)
        r.raise_for_status()
        data = r.json()
        return data["agentId"], data["apiKey"]
    except requests.exceptions.ConnectionError as e:
        print(f"Cannot reach {APP_URL}. Is the Next.js app running? Start it with: pnpm dev", file=sys.stderr)
        raise SystemExit(1) from e


def ensure_agent():
    if AGENT_KEY and AGENT_ID:
        return AGENT_ID, AGENT_KEY
    if not OPENAI_API_KEY:
        print("Set OPENAI_API_KEY in .env.", file=sys.stderr)
        sys.exit(1)
    print("Registering new agent...")
    agent_id, api_key = register()
    print(f"Registered agent {agent_id}. Use AGENT_ID and AGENT_KEY in .env to reuse.")
    return agent_id, api_key


def start_session(agent_key: str, starter: str | None = None):
    """Start emulator session. If using has_pokedex init state, pass starter: bulbasaur, charmander, or squirtle."""
    payload = {}
    if starter and starter.lower() in ("bulbasaur", "charmander", "squirtle"):
        payload["starter"] = starter.lower()
    r = requests.post(
        f"{APP_URL}/api/game/emulator/start",
        headers={"X-Agent-Key": agent_key},
        json=payload if payload else {},
        timeout=10,
    )
    if r.status_code != 200:
        print(f"Start failed: {r.status_code} {r.text}", file=sys.stderr)
        sys.exit(1)
    print("Emulator session started. You can watch at", f"{APP_URL}/observe/watch")


def get_state(agent_key: str) -> dict:
    """Current game state (map, x, y, partySize)."""
    r = requests.get(
        f"{APP_URL}/api/game/emulator/state",
        headers={"X-Agent-Key": agent_key},
        timeout=5,
    )
    if r.status_code != 200:
        return {}
    return r.json()


def get_frame(agent_id: str) -> bytes:
    r = requests.get(
        f"{APP_URL}/api/observe/emulator/frame",
        params={"agentId": agent_id, "t": int(time.time() * 1000)},
        timeout=10,
    )
    r.raise_for_status()
    return r.content


def step(agent_key: str, action: str) -> dict:
    """Send one button press. Returns { ok, action, state, feedback, screenText }."""
    r = requests.post(
        f"{APP_URL}/api/game/emulator/step",
        headers={"X-Agent-Key": agent_key, "Content-Type": "application/json"},
        json={"action": action},
        timeout=30,  # server may run emulator + frame + vision; allow time for screenText
    )
    if r.status_code != 200:
        raise RuntimeError(f"Step failed: {r.status_code} {r.text}")
    return r.json()


def run_actions(agent_key: str, actions_list: list[str], speed: int | None = None) -> dict:
    """Send a sequence of actions in one request. Returns { ok, actionsExecuted, state }."""
    payload = {"actions": actions_list}
    if speed is not None:
        payload["speed"] = speed
    r = requests.post(
        f"{APP_URL}/api/game/emulator/actions",
        headers={"X-Agent-Key": agent_key, "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Actions failed: {r.status_code} {r.text}")
    return r.json()


def save_experience(agent_key: str, step_index: int, state_before: dict, action: str, state_after: dict):
    if not SAVE_EXPERIENCE:
        return
    try:
        requests.post(
            f"{APP_URL}/api/game/emulator/experience",
            headers={"X-Agent-Key": agent_key, "Content-Type": "application/json"},
            json={
                "stepIndex": step_index,
                "stateBefore": state_before,
                "action": action,
                "stateAfter": state_after,
            },
            timeout=5,
        )
    except Exception as e:
        print(f"Save experience error: {e}", file=sys.stderr)


def get_recent_experiences(agent_key: str, limit: int = 10) -> list:
    try:
        r = requests.get(
            f"{APP_URL}/api/game/emulator/experience",
            headers={"X-Agent-Key": agent_key},
            params={"limit": limit},
            timeout=5,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        return data.get("experiences", [])
    except Exception:
        return []


def format_memory(mem: deque) -> str:
    if not mem:
        return "None yet."
    lines = []
    for i, (sb, act, sa) in enumerate(mem, 1):
        loc_before = sb.get("mapName", "?")
        loc_after = sa.get("mapName", "?")
        lines.append(f"  {i}. At {loc_before} you pressed {act} -> now at {loc_after} (x={sa.get('x')}, y={sa.get('y')}, party={sa.get('partySize', 0)})")
    return "\n".join(lines)


def choose_action(
    image_b64: str,
    current_state: dict,
    memory: deque,
    recent_experiences: list,
    openai_client: OpenAI,
) -> str:
    state_desc = (
        f"Current location: {current_state.get('mapName', '?')} "
        f"(x={current_state.get('x')}, y={current_state.get('y')}), "
        f"party size: {current_state.get('partySize', 0)}."
    )
    memory_text = format_memory(memory)
    experience_text = "None."
    if recent_experiences:
        parts = []
        for e in recent_experiences[-5:]:
            sb = e.get("stateBefore") or {}
            sa = e.get("stateAfter") or {}
            parts.append(f"At {sb.get('mapName')} you did {e.get('action')} -> {sa.get('mapName')}")
        experience_text = "\n  ".join(parts)

    prompt = f"""You are playing Pokémon Red on a Game Boy. Use the current game screen and state to choose what to do next.

**Current game state:** {state_desc}

**What you did recently (last steps):**
{memory_text}

**From your past experience (similar situations):**
{experience_text}

Reply with a sequence of button presses. Each word is one press. Valid words: up, down, left, right, a, b, start, select, pass.

Examples:
- Single press: "a" or "up"
- Path to a door/NPC: "right right down down down" (2 right, 3 down)
- Walk in one direction: "up up up up" (4 steps up)
- Skip dialogue: "a a a a a a" (press A several times)
- Mixed path: "left down down right a" (move then interact)

Plan a full path when you can see the goal (door, person, item). Use a single word only when you need to see the result of one press first (e.g. menu open, uncertain). Prefer sending a short sequence (e.g. 3–8 moves) over one move at a time so the game runs smoothly.

Reply with only the space-separated word(s), nothing else."""

    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                    },
                ],
            }
        ],
        max_tokens=80,
    )
    text = (response.choices[0].message.content or "").strip().lower()
    # Parse one or more action words (e.g. "a" or "a a a a a" or "up up left")
    tokens = re.findall(r"\b(" + "|".join(VALID_ACTIONS) + r")\b", text)
    return tokens if tokens else ["pass"]


def main():
    agent_id, agent_key = ensure_agent()
    start_session(agent_key, STARTER)

    client = OpenAI(api_key=OPENAI_API_KEY)
    step_interval = float(os.environ.get("STEP_INTERVAL", "0.2"))  # seconds between actions (0.2 ≈ 2x faster than 0.4)
    memory: deque = deque(maxlen=MEMORY_LEN)
    step_index = 0
    current_state = get_state(agent_key) or {}

    print("Playing (feedback + memory). Press Ctrl+C to stop.")
    if SAVE_EXPERIENCE:
        print("Saving experiences to the API for long-term memory.")
    try:
        while True:
            try:
                png_bytes = get_frame(agent_id)
            except Exception as e:
                print(f"Frame error: {e}", file=sys.stderr)
                # If no session (e.g. emulator restarted), try starting again
                try:
                    start_session(agent_key, STARTER)
                    current_state = get_state(agent_key) or {}
                except Exception:
                    pass
                time.sleep(2)
                continue

            b64 = base64.standard_b64encode(png_bytes).decode("ascii")
            recent = get_recent_experiences(agent_key, limit=15) if SAVE_EXPERIENCE else []
            chosen = choose_action(b64, current_state, memory, recent, client)  # list of 1+ actions
            actions_list = chosen if isinstance(chosen, list) else [chosen]

            state_before = dict(current_state)
            try:
                if len(actions_list) == 1:
                    result = step(agent_key, actions_list[0])
                    state_after = result.get("state") or {}
                else:
                    result = run_actions(agent_key, actions_list)
                    state_after = result.get("state") or {}
                current_state = state_after
            except Exception as e:
                print(f"Step/actions error: {e}", file=sys.stderr)
                time.sleep(2)
                continue

            action_desc = actions_list[0] if len(actions_list) == 1 else f"{actions_list[0]} x{len(actions_list)}"
            memory.append((state_before, action_desc, state_after))
            save_experience(agent_key, step_index, state_before, action_desc, state_after)
            step_index += 1

            if step_index % 5 == 0:
                loc = current_state.get("mapName", "?")
                print(f"  Decisions: {step_index} | location: {loc} | last: {action_desc}")
            time.sleep(step_interval)
    except KeyboardInterrupt:
        print(f"\nStopped after {step_index} steps.")


if __name__ == "__main__":
    main()
