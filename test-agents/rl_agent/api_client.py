"""API client for the AgentMon League emulator."""

import time

import requests

from rl_agent.config import APP_URL, AGENT_ID, AGENT_KEY, STARTER


def register():
    try:
        r = requests.post(f"{APP_URL}/api/auth/local/register", timeout=10)
        r.raise_for_status()
        data = r.json()
        return data["agentId"], data["apiKey"]
    except requests.exceptions.ConnectionError as e:
        raise RuntimeError(f"Cannot reach {APP_URL}. Is the Next.js app running?") from e


def ensure_agent():
    if AGENT_KEY and AGENT_ID:
        return AGENT_ID, AGENT_KEY
    agent_id, api_key = register()
    return agent_id, api_key


def start_session(
    agent_key: str,
    starter: str | None = None,
    load_session_id: str | None = None,
) -> dict:
    """Start a game session. Returns the API response; use response.get('agentId') for frame/state (correct after DB reset)."""
    payload: dict = {}
    if load_session_id:
        payload["loadSessionId"] = load_session_id.strip()
    elif (starter or STARTER) and (starter or STARTER).lower() in ("bulbasaur", "charmander", "squirtle"):
        payload["starter"] = (starter or STARTER).lower()
    r = requests.post(
        f"{APP_URL}/api/game/emulator/start",
        headers={"X-Agent-Key": agent_key},
        json=payload,
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Start failed: {r.status_code} {r.text}")
    return r.json()


def stop_session(agent_key: str) -> dict:
    r = requests.post(
        f"{APP_URL}/api/game/emulator/stop",
        headers={"X-Agent-Key": agent_key},
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Stop failed: {r.status_code} {r.text}")
    return r.json()


def list_saves(agent_key: str) -> list[dict]:
    r = requests.get(
        f"{APP_URL}/api/game/emulator/saves",
        headers={"X-Agent-Key": agent_key},
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"List saves failed: {r.status_code} {r.text}")
    data = r.json()
    return data.get("saves") or []


def save_session(agent_key: str, label: str | None = None) -> dict:
    payload = {}
    if label and label.strip():
        payload["label"] = label.strip()
    r = requests.post(
        f"{APP_URL}/api/game/emulator/save",
        headers={"X-Agent-Key": agent_key, "Content-Type": "application/json"},
        json=payload,
        timeout=15,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Save failed: {r.status_code} {r.text}")
    return r.json()


def get_state(agent_key: str) -> dict:
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


def check_session_ready(agent_id: str) -> None:
    """
    Verify the emulator has an active session for this agent (e.g. after start).
    Raises RuntimeError with a helpful message if the session is missing (404).
    """
    r = requests.get(
        f"{APP_URL}/api/observe/emulator/frame",
        params={"agentId": agent_id, "t": int(time.time() * 1000)},
        timeout=10,
    )
    if r.status_code == 404:
        raise RuntimeError(
            "Emulator has no session for this agent (404). "
            "Is the emulator running? If it restarted after you started the game, sessions are lost. "
            "Start the emulator (e.g. cd emulator && .venv/bin/uvicorn server:app --port 8765), "
            "then run 'agentmongenesis start new game' again."
        )
    r.raise_for_status()


def run_action(agent_key: str, action_name: str) -> dict:
    r = requests.post(
        f"{APP_URL}/api/game/emulator/actions",
        headers={"X-Agent-Key": agent_key, "Content-Type": "application/json"},
        json={"actions": [action_name]},
        timeout=15,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Actions failed: {r.status_code} {r.text}")
    return r.json()
