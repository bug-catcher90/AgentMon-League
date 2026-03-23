"""API client for the AgentMon League emulator."""

import time

import requests

from rl_agent.config import APP_URL, AGENT_ID, AGENT_KEY, STARTER


class ApiClientError(RuntimeError):
    """Structured API error with HTTP status code."""

    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def get_status(agent_key: str) -> dict:
    """Authenticated emulator status: { state: running|stopped, ... }."""
    r = requests.get(
        f"{APP_URL}/api/game/emulator/status",
        headers={"X-Agent-Key": agent_key},
        timeout=10,
    )
    if r.status_code != 200:
        return {"state": "unknown"}
    return r.json()


def _error_message(r: requests.Response, prefix: str) -> str:
    """Build a short error message from response; avoid dumping HTML."""
    try:
        data = r.json()
        err = data.get("error") or data.get("detail") or data.get("message")
        if err:
            return f"{prefix}: {r.status_code} {err}"
    except Exception:
        pass
    if r.text.strip().lower().startswith("<!DOCTYPE") or "<html" in r.text[:200].lower():
        return (
            f"{prefix}: {r.status_code}. Server returned HTML (check Railway app and emulator logs; "
            "ensure EMULATOR_URL is set and the emulator service has the ROM)."
        )
    return f"{prefix}: {r.status_code} {r.text[:200]}"


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
    mode: str | None = None,  # new|load|restart
) -> dict:
    """Start a game session. Returns the API response; use response.get('agentId') for frame/state (correct after DB reset)."""
    payload: dict = {}
    if mode and mode.strip():
        payload["mode"] = mode.strip().lower()
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
        msg = _error_message(r, "Start failed")
        raise RuntimeError(msg)
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
        return {"_state_error_status": r.status_code}
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
        raise ApiClientError(f"Actions failed: {r.status_code} {r.text}", status_code=r.status_code)
    return r.json()


def ensure_session(
    agent_key: str,
    *,
    mode: str = "new",
    starter: str | None = None,
    load_session_id: str | None = None,
) -> dict:
    return start_session(
        agent_key,
        starter=starter,
        load_session_id=load_session_id,
        mode=mode,
    )


def run_action_with_auto_restart(agent_key: str, action_name: str, *, starter: str | None = None) -> dict:
    """
    Run one action via /actions; if the session is missing (404), restart and retry once.
    """
    try:
        return run_action(agent_key, action_name)
    except ApiClientError as e:
        if e.status_code != 404:
            raise
        restart_data = ensure_session(agent_key, mode="restart", starter=starter)
        resp = run_action(agent_key, action_name)
        # Attach restart metadata so the RL env can avoid mixing rewards across
        # sessions when the emulator reboots mid-episode.
        resp["_session_restarted"] = True
        if isinstance(restart_data, dict):
            resp["_restarted_agent_id"] = (
                restart_data.get("agentId")
                or restart_data.get("agent_id")
                or restart_data.get("agentID")
            )
        return resp
