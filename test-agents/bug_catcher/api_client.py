"""AgentMon League API client for Bug-Catcher."""

import time
from typing import Any

import requests

from bug_catcher.config import APP_URL, AGENT_ID, AGENT_KEY, STARTER


def register(display_name: str | None = "Bug-Catcher") -> tuple[str, str]:
    payload: dict = {}
    if display_name and display_name.strip():
        payload["displayName"] = display_name.strip()
    r = requests.post(
        f"{APP_URL}/api/auth/local/register",
        json=payload if payload else {},
        timeout=10,
        headers={"Content-Type": "application/json"},
    )
    r.raise_for_status()
    data = r.json()
    # API returns agentId and apiKey (camelCase)
    agent_id = data.get("agentId") or data.get("agent_id")
    api_key = data.get("apiKey") or data.get("api_key")
    if not agent_id or not api_key:
        raise RuntimeError("Register response missing agentId or apiKey")
    return agent_id, api_key


def get_credentials() -> tuple[str | None, str | None]:
    """Return (agent_id, agent_key) from config. (None, None) if either is missing."""
    if AGENT_ID and AGENT_KEY:
        return AGENT_ID, AGENT_KEY
    return None, None


def require_credentials() -> tuple[str, str]:
    """Return (agent_id, agent_key). Raises RuntimeError if BUG_CATCHER_AGENT_ID or BUG_CATCHER_AGENT_KEY not set."""
    agent_id, agent_key = get_credentials()
    if not agent_id or not agent_key:
        raise RuntimeError(
            "Bug-Catcher credentials not set. Run 'bugcatcher register' once, "
            "then add BUG_CATCHER_AGENT_ID and BUG_CATCHER_AGENT_KEY to .env"
        )
    return agent_id, agent_key


def start_session(
    agent_key: str,
    *,
    starter: str | None = None,
    load_session_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if load_session_id:
        payload["loadSessionId"] = load_session_id.strip()
    else:
        # New game: always send a starter (caller should pass one of the three, or we use STARTER env / default)
        choice = (starter or STARTER or "").strip().lower()
        if choice not in ("bulbasaur", "charmander", "squirtle"):
            choice = "charmander"
        payload["starter"] = choice
    r = requests.post(
        f"{APP_URL}/api/game/emulator/start",
        headers={"X-Agent-Key": agent_key},
        json=payload,
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Start failed: {r.status_code} {r.text}")
    return r.json()


def stop_session(agent_key: str) -> dict[str, Any]:
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


def save_session(agent_key: str, label: str | None = None) -> dict[str, Any]:
    payload: dict = {}
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


def get_state(agent_key: str) -> dict[str, Any]:
    r = requests.get(
        f"{APP_URL}/api/game/emulator/state",
        headers={"X-Agent-Key": agent_key},
        timeout=5,
    )
    if r.status_code != 200:
        return {}
    return r.json()


def step(agent_key: str, action: str) -> dict[str, Any]:
    """One button press. Returns { ok, action, state, feedback, screenText }."""
    r = requests.post(
        f"{APP_URL}/api/game/emulator/step",
        headers={"X-Agent-Key": agent_key, "Content-Type": "application/json"},
        json={"action": action},
        timeout=30,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Step failed: {r.status_code} {r.text}")
    return r.json()


def run_actions(
    agent_key: str,
    actions: list[str],
    speed: int | None = None,
) -> dict[str, Any]:
    payload: dict = {"actions": actions}
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


def check_session_ready(agent_id: str) -> None:
    r = requests.get(
        f"{APP_URL}/api/observe/emulator/frame",
        params={"agentId": agent_id, "t": int(time.time() * 1000)},
        timeout=10,
    )
    if r.status_code == 404:
        raise RuntimeError(
            "Emulator has no session for this agent (404). "
            "Is the emulator running? Start it, then run 'bugcatcher start new game' again."
        )
    r.raise_for_status()


def publish_dataset(
    agent_key: str,
    file_path: str,
    *,
    label: str = "memory",
    description: str | None = None,
    format: str = "jsonl",
) -> dict[str, Any]:
    """Publish a dataset file (e.g. memory_dataset.jsonl) to the agent's profile. Max 500MB."""
    description = description or "Bug-Catcher memory dataset (locations, NPCs, battles from play)."
    with open(file_path, "rb") as f:
        data = f.read()
    if len(data) > 500 * 1024 * 1024:
        raise RuntimeError("Dataset file too large (max 500MB)")
    files = {"file": (file_path.split("/")[-1].split("\\")[-1], data, "application/octet-stream")}
    payload = {
        "label": label,
        "description": description,
        "format": format,
    }
    r = requests.post(
        f"{APP_URL}/api/agents/me/datasets",
        headers={"X-Agent-Key": agent_key},
        files=files,
        data=payload,
        timeout=60,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Publish dataset failed: {r.status_code} {r.text}")
    return r.json()


def _model_display_name(model_name: str) -> str:
    """Human-readable name for profile (e.g. gpt-4o -> OpenAI GPT-4o, gpt-3.5-turbo -> ChatGPT 3.5 Turbo)."""
    n = (model_name or "").strip().lower()
    if "gpt-4o" in n or "gpt-4-o" in n:
        return "OpenAI GPT-4o"
    if "gpt-4" in n:
        return "OpenAI GPT-4"
    if "gpt-3.5" in n or "3.5-turbo" in n:
        return "OpenAI ChatGPT 3.5 Turbo"
    if "gpt-3" in n:
        return "OpenAI GPT-3"
    if "claude" in n:
        return "Anthropic Claude"
    return f"LLM: {model_name}" if model_name else "LLM (external)"


def publish_model_placeholder(
    agent_key: str,
    *,
    model_name: str = "gpt-4o",
    label: str = "llm",
    description: str | None = None,
) -> dict[str, Any]:
    """Publish a placeholder 'model' so the profile shows which LLM the agent uses (e.g. OpenAI GPT-4o). No downloadable weights."""
    import io
    import zipfile

    display = _model_display_name(model_name)
    description = description or f"{display} (no weights; policy is external API)."
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", f'{{"type":"llm","model":"{model_name}"}}')
    buf.seek(0)
    files = {"file": ("llm_placeholder.zip", buf.getvalue(), "application/zip")}
    payload = {"label": label, "description": description}
    r = requests.post(
        f"{APP_URL}/api/agents/me/models",
        headers={"X-Agent-Key": agent_key},
        files=files,
        data=payload,
        timeout=30,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Publish model failed: {r.status_code} {r.text}")
    return r.json()
