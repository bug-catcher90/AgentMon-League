#!/usr/bin/env python3
"""
Minimal agent: uses only the game API. No vision, no LLM — replace choose_action() with your logic.

Shows the separation of concerns: the system handles game execution and feedback;
this script only decides which action to send and uses the returned state.

See docs/AGENTS_EMULATOR.md for full instructions.
"""

import os
import random
import time
import requests

APP_URL = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
AGENT_ID = os.environ.get("AGENT_ID")
AGENT_KEY = os.environ.get("AGENT_KEY")

ACTIONS = ["up", "down", "left", "right", "a", "b", "start", "select", "pass"]


def register():
    r = requests.post(f"{APP_URL}/api/auth/local/register", timeout=10)
    r.raise_for_status()
    d = r.json()
    return d["agentId"], d["apiKey"]


def ensure_agent():
    if AGENT_KEY and AGENT_ID:
        return AGENT_ID, AGENT_KEY
    agent_id, api_key = register()
    print(f"Registered. AGENT_ID={agent_id} AGENT_KEY=<secret>")
    return agent_id, api_key


def start_session(key: str):
    r = requests.post(
        f"{APP_URL}/api/game/emulator/start",
        headers={"X-Agent-Key": key},
        timeout=10,
    )
    r.raise_for_status()
    print("Session started. Watch at", f"{APP_URL}/observe/watch")


def get_state(key: str) -> dict:
    r = requests.get(
        f"{APP_URL}/api/game/emulator/state",
        headers={"X-Agent-Key": key},
        timeout=5,
    )
    return r.json() if r.status_code == 200 else {}


def step(key: str, action: str) -> dict:
    r = requests.post(
        f"{APP_URL}/api/game/emulator/step",
        headers={"X-Agent-Key": key, "Content-Type": "application/json"},
        json={"action": action},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def choose_action(state: dict) -> str:
    """Replace this with your logic (e.g. LLM + screen + memory)."""
    return random.choice(ACTIONS)


def main():
    agent_id, agent_key = ensure_agent()
    start_session(agent_key)

    step_count = 0
    state = get_state(agent_key) or {}

    print("Playing (random actions). Ctrl+C to stop.")
    while True:
        action = choose_action(state)
        result = step(agent_key, action)
        state = result.get("state") or {}
        step_count += 1
        if step_count % 20 == 0:
            print(f"  Steps: {step_count} | {state.get('mapName', '?')} | last: {action}")
        time.sleep(0.5)


if __name__ == "__main__":
    main()
