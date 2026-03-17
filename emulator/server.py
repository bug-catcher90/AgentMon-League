"""
Emulator service for Agentmon League.
Runs Pokemon Red (Game Boy) via PyBoy. One session per agent; agents send button
inputs and observers can fetch the current frame.

Inspired by https://github.com/PWhiddy/PokemonRedExperiments

Usage:
  Set EMULATOR_ROM_PATH to your Pokemon Red ROM (e.g. PokemonRed.gb).
  Optional: EMULATOR_INIT_STATE path to a .state file to skip intro.
  Run: uvicorn server:app --host 0.0.0.0 --port 8765
"""

import io
import logging
import os
import time
from collections import deque
from pathlib import Path
import threading

# Silence PyBoy sound buffer overrun spam (hits Railway 500 logs/sec limit when headless)
_log_sound = logging.getLogger("pyboy.core.sound")
_log_sound.setLevel(logging.CRITICAL + 1)
logging.getLogger("pyboy.core").setLevel(logging.CRITICAL + 1)

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

try:
    from game_state import (
        get_game_state,
        inject_names,
        inject_starter,
        compute_step_feedback,
        build_exploration_grid,
    )
except ImportError:
    def get_game_state(pyboy, session_started_at=None):
        return {"mapId": 0, "mapName": "Unknown", "x": 0, "y": 0, "partySize": 0, "badges": 0, "pokedexOwned": 0, "pokedexSeen": 0, "inBattle": 0, "battleKind": "none", "eventFlags": [], "levels": []}
    def compute_step_feedback(action, state_before, state_after):
        return {"effects": ["unknown"], "message": "Feedback unavailable."}
    def inject_names(pyboy, player_name: str, rival_name: str = "Rival"):
        pass
    def inject_starter(pyboy, starter: str):
        pass
    def build_exploration_grid(explored):
        return [[0] * 48 for _ in range(48)]

# PyBoy is optional at import so the rest of the app can run without it
try:
    from pyboy import PyBoy
    from pyboy.utils import WindowEvent
    PYBOY_AVAILABLE = True
except ImportError:
    PYBOY_AVAILABLE = False
    PyBoy = None
    WindowEvent = None

app = FastAPI(title="Agentmon Emulator", version="0.1.0")

ROM_PATH = os.environ.get("EMULATOR_ROM_PATH", "PokemonRed.gb")
INIT_STATE_PATH = os.environ.get("EMULATOR_INIT_STATE", "")
# When EMULATOR_INIT_STATE is unset, look for this file in the emulator directory (start after Oak's parcel).
DEFAULT_INIT_STATE_FILENAME = "has_pokedex.state"
ACTION_FREQ = int(os.environ.get("EMULATOR_ACTION_FREQ", "6"))  # ticks per button (lower = faster; 6 ≈ 2x faster than 12)

# Session liveness / reclamation
SESSION_TTL_SECONDS = max(5, int(os.environ.get("EMULATOR_SESSION_TTL_SECONDS", "180")))
SESSION_REAPER_INTERVAL_SECONDS = max(1, int(os.environ.get("EMULATOR_SESSION_REAPER_INTERVAL_SECONDS", "10")))


def _valid_actions():
    if not WindowEvent:
        return [], {}
    actions = [
        ("up", WindowEvent.PRESS_ARROW_UP, WindowEvent.RELEASE_ARROW_UP),
        ("down", WindowEvent.PRESS_ARROW_DOWN, WindowEvent.RELEASE_ARROW_DOWN),
        ("left", WindowEvent.PRESS_ARROW_LEFT, WindowEvent.RELEASE_ARROW_LEFT),
        ("right", WindowEvent.PRESS_ARROW_RIGHT, WindowEvent.RELEASE_ARROW_RIGHT),
        ("a", WindowEvent.PRESS_BUTTON_A, WindowEvent.RELEASE_BUTTON_A),
        ("b", WindowEvent.PRESS_BUTTON_B, WindowEvent.RELEASE_BUTTON_B),
        ("start", WindowEvent.PRESS_BUTTON_START, WindowEvent.RELEASE_BUTTON_START),
        ("select", WindowEvent.PRESS_BUTTON_SELECT, WindowEvent.RELEASE_BUTTON_SELECT),
        ("pass", None, None),
    ]
    return actions, {name: i for i, (name, _, _) in enumerate(actions)}


VALID_ACTIONS, ACTION_INDEX = _valid_actions() if PYBOY_AVAILABLE else ([], {})

sessions: dict[str, dict] = {}  # agent_id -> session record
_sessions_lock = threading.RLock()


def _now() -> float:
    return time.time()


def _touch_session(rec: dict, now: float | None = None) -> None:
    """Refresh the session lease (write endpoints only)."""
    t = now if now is not None else _now()
    rec["last_heartbeat_at"] = t
    rec["lease_expires_at"] = t + SESSION_TTL_SECONDS


def _safe_stop_pyboy(pyboy) -> None:
    """Best-effort stop/close; never raise."""
    try:
        pyboy.stop()  # PyBoy 2.x
        return
    except Exception:
        pass
    try:
        pyboy.close()
    except Exception:
        pass


def _stop_and_delete_session(agent_id: str, *, reason: str) -> bool:
    """Stop PyBoy and delete session record. Returns True if existed."""
    with _sessions_lock:
        rec = sessions.get(agent_id)
        if not rec:
            return False
        rec["stop_reason"] = reason
        pyboy = rec.get("pyboy")
        # Remove from dict first so concurrent requests see it as gone.
        del sessions[agent_id]
    if pyboy is not None:
        _safe_stop_pyboy(pyboy)
    return True


def _reap_expired_sessions_once() -> int:
    """Reap all sessions whose lease has expired. Returns number reaped."""
    now = _now()
    expired: list[str] = []
    with _sessions_lock:
        for agent_id, rec in list(sessions.items()):
            exp = rec.get("lease_expires_at")
            if isinstance(exp, (int, float)) and now > float(exp):
                expired.append(agent_id)
    n = 0
    for agent_id in expired:
        if _stop_and_delete_session(agent_id, reason="expired_ttl"):
            n += 1
            logging.warning("Reaped expired session agent_id=%s ttl=%ss", agent_id, SESSION_TTL_SECONDS)
    return n


def _reaper_loop(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        try:
            _reap_expired_sessions_once()
        except Exception as e:
            logging.exception("Session reaper error: %s", e)
        stop_event.wait(SESSION_REAPER_INTERVAL_SECONDS)


_reaper_stop_event = threading.Event()
_reaper_thread: threading.Thread | None = None


@app.on_event("startup")
def _startup_reaper():
    global _reaper_thread
    if _reaper_thread and _reaper_thread.is_alive():
        return
    _reaper_stop_event.clear()
    _reaper_thread = threading.Thread(
        target=_reaper_loop,
        args=(_reaper_stop_event,),
        name="session-reaper",
        daemon=True,
    )
    _reaper_thread.start()


@app.on_event("shutdown")
def _shutdown_reaper():
    _reaper_stop_event.set()
    # Best-effort stop all sessions so the process exits cleanly.
    with _sessions_lock:
        agent_ids = list(sessions.keys())
    for aid in agent_ids:
        _stop_and_delete_session(aid, reason="shutdown")


def _rom_path() -> Path:
    """Resolve ROM path. Tries default locations if unset or placeholder."""
    raw = (ROM_PATH or "").strip()
    # Placeholder or default: try emulator/rom/, emulator/, and project root
    if not raw or raw == "PokemonRed.gb" or "/path/to/your" in raw or "path/to" in raw:
        base = Path(__file__).resolve().parent
        for candidate in [
            base / "rom" / "PokemonRed.gb",
            base / "PokemonRed.gb",
            base.parent / "PokemonRed.gb",
        ]:
            if candidate.exists():
                return candidate
        return base / "rom" / "PokemonRed.gb"  # so error message shows where we looked
    p = Path(raw)
    if not p.is_absolute():
        p = Path(__file__).resolve().parent / p
    return p


def _init_state_path() -> Path | None:
    """
    Resolve path to the init state file (load when starting a new session).
    - If EMULATOR_INIT_STATE is set and the file exists, use it.
    - Else if has_pokedex.state exists in emulator/rom/ or emulator/, use it.
    - Else return None (game starts from ROM).
    """
    base = Path(__file__).resolve().parent
    if (INIT_STATE_PATH or "").strip():
        p = Path(INIT_STATE_PATH.strip())
        if not p.is_absolute():
            p = base / p
        if p.exists():
            return p
        return None
    for candidate in [base / "rom" / DEFAULT_INIT_STATE_FILENAME, base / DEFAULT_INIT_STATE_FILENAME]:
        if candidate.exists():
            return candidate
    return None


@app.get("/")
def root():
    return {"service": "agentmon-emulator", "ok": True}


@app.get("/health")
def health():
    return {"ok": True, "pyboy": PYBOY_AVAILABLE}


@app.get("/api/health")
def api_health():
    """Alias for Railway healthcheck (repo railway.json uses healthcheckPath /api/health)."""
    return {"ok": True, "pyboy": PYBOY_AVAILABLE}


class StartBody(BaseModel):
    agent_id: str
    player_name: str | None = None  # Main character name; default "Agent". Rival is always "Rival".
    starter: str | None = None  # bulbasaur, charmander, or squirtle (used when init state is "after Oak's parcel").
    speed: int | str | None = None  # 1=normal, 2=2x, 4=4x, 0 or "unlimited" = run as fast as possible. Default 1.
    initial_state_base64: str | None = None  # Load this saved state instead of INIT_STATE_PATH (for "load session").


class StepBody(BaseModel):
    action: str  # up, down, left, right, a, b, start, select, pass


class ActionsBody(BaseModel):
    actions: list[str]  # sequence of actions to run without returning until done
    speed: int | None = None  # override session speed for this batch (optional)


@app.post("/session/start")
def session_start(body: StartBody):
    if not PYBOY_AVAILABLE:
        raise HTTPException(status_code=503, detail="PyBoy not installed")
    agent_id = body.agent_id
    with _sessions_lock:
        existing = sessions.get(agent_id)
        if existing:
            _touch_session(existing)
            return {"ok": True, "agent_id": agent_id, "message": "Session already exists"}

    rom = _rom_path()
    if not rom.exists():
        raise HTTPException(
            status_code=400,
            detail=(
                f"ROM not found at {rom}. "
                "Put your Pokemon Red ROM in emulator/rom/, emulator/, or project root, "
                "or set EMULATOR_ROM_PATH to its full path before starting the server."
            ),
        )

    # Headless: no display, sound off to avoid buffer overrun log spam
    try:
        pyboy = PyBoy(str(rom), window="null", sound_emulated=False)
    except TypeError:
        try:
            pyboy = PyBoy(str(rom), window="null")
        except TypeError:
            pyboy = PyBoy(str(rom))

    init_state_used = None
    if body.initial_state_base64:
        import base64
        try:
            state_bytes = base64.b64decode(body.initial_state_base64)
            pyboy.load_state(io.BytesIO(state_bytes))
        except Exception as e:
            pyboy.close()
            raise HTTPException(status_code=400, detail=f"Invalid initial_state_base64: {e!s}")
    else:
        state_path = _init_state_path()
        if state_path is not None:
            with open(state_path, "rb") as f:
                pyboy.load_state(f)
            init_state_used = state_path.name

    player_name = (body.player_name or "Agent").strip() or "Agent"
    # Inject names so the game shows agent as player and "Rival" as rival (bypass name entry)
    inject_names(pyboy, player_name, "Rival")
    # When using "after Oak's parcel" init state (e.g. has_pokedex.state), set first party Pokémon to chosen starter.
    # If the caller did not pass starter, use EMULATOR_DEFAULT_STARTER or "charmander" so the session is valid.
    starter_choice = (body.starter or "").strip().lower()
    if init_state_used and init_state_used.lower() == DEFAULT_INIT_STATE_FILENAME.lower():
        if starter_choice not in ("bulbasaur", "charmander", "squirtle"):
            starter_choice = os.environ.get("EMULATOR_DEFAULT_STARTER", "charmander").strip().lower()
            if starter_choice not in ("bulbasaur", "charmander", "squirtle"):
                starter_choice = "charmander"
        inject_starter(pyboy, starter_choice)
    elif starter_choice in ("bulbasaur", "charmander", "squirtle"):
        inject_starter(pyboy, starter_choice)
    # Speed: 0 = unlimited (no frame limit), 1 = 1x real-time, 2 = 2x, etc. Default 0 so game doesn't feel laggy.
    speed = 0
    if body.speed is not None:
        if body.speed in (0, "unlimited", "max"):
            speed = 0
        elif isinstance(body.speed, int) and body.speed >= 1:
            speed = min(body.speed, 8)
    try:
        pyboy.set_emulation_speed(speed)
    except AttributeError:
        pass
    rec = {
        "pyboy": pyboy,
        "player_name": player_name,
        "started_at": time.time(),
        "speed": speed,
        "explored": set(),  # (map_id, x, y) for exploration map
        "step_count": 0,
        "recent_actions": deque(maxlen=30),  # { "step", "mapName", "action", "ts" }
    }
    _touch_session(rec)
    with _sessions_lock:
        sessions[agent_id] = rec
    out = {"ok": True, "agent_id": agent_id}
    if init_state_used:
        out["init_state"] = init_state_used
    if starter_choice in ("bulbasaur", "charmander", "squirtle"):
        out["starter"] = starter_choice
    return out


def _run_one_action(pyboy, action_name: str, speed: int) -> None:
    """Apply one button press and advance the game. speed: 0 = 1 tick/step (unlimited), else tick speed per sub-step."""
    idx = ACTION_INDEX.get(action_name)
    if idx is None:
        return
    _, press_ev, release_ev = VALID_ACTIONS[idx]
    mult = max(1, speed) if speed else 1
    if press_ev is not None:
        pyboy.send_input(press_ev)
    for i in range(ACTION_FREQ):
        if i == 8 and release_ev is not None:
            pyboy.send_input(release_ev)
        for _ in range(mult):
            pyboy.tick(1, True)
    if release_ev is not None:
        pyboy.send_input(release_ev)


@app.post("/session/{agent_id}/step")
def session_step(agent_id: str, body: StepBody):
    with _sessions_lock:
        rec = sessions.get(agent_id)
        if not rec:
            raise HTTPException(status_code=404, detail="No session for this agent")
        _touch_session(rec)
    idx = ACTION_INDEX.get(body.action.strip().lower())
    if idx is None:
        raise HTTPException(status_code=400, detail=f"Invalid action. Use: {list(ACTION_INDEX.keys())}")

    name, press_ev, release_ev = VALID_ACTIONS[idx]
    pyboy = rec["pyboy"]
    started_at = rec.get("started_at")
    speed = rec.get("speed", 1)

    state_before = get_game_state(pyboy, started_at)
    _run_one_action(pyboy, body.action.strip().lower(), speed)
    state_after = get_game_state(pyboy, started_at)
    if state_after.get("partySize", 0) == 0:
        player_name = rec.get("player_name", "Agent")
        inject_names(pyboy, player_name, "Rival")

    explored = rec.setdefault("explored", set())
    explored.add((state_after.get("mapId", 0), state_after.get("x", 0), state_after.get("y", 0)))
    state_after["explorationMap"] = build_exploration_grid(explored)

    step_count = rec.setdefault("step_count", 0) + 1
    rec["step_count"] = step_count
    rec.setdefault("recent_actions", deque(maxlen=30)).append({
        "step": step_count,
        "mapName": state_after.get("mapName", "?"),
        "action": name,
        "ts": time.time(),
    })

    feedback = compute_step_feedback(name, state_before, state_after)

    return {"ok": True, "action": name, "state": state_after, "feedback": feedback}


@app.post("/session/{agent_id}/actions")
def session_actions(agent_id: str, body: ActionsBody):
    """
    Run a sequence of actions at session speed (or override with body.speed).
    No per-step response; returns final state after all actions. Use for query-driven agents.
    """
    with _sessions_lock:
        rec = sessions.get(agent_id)
        if not rec:
            raise HTTPException(status_code=404, detail="No session for this agent")
        _touch_session(rec)
    pyboy = rec["pyboy"]
    started_at = rec.get("started_at")
    run_speed = body.speed if body.speed is not None else rec.get("speed", 1)
    if run_speed == 0:
        run_speed = 1  # still tick at least once per sub-step
    valid = set(ACTION_INDEX.keys())
    step_count = rec.setdefault("step_count", 0)
    recent = rec.setdefault("recent_actions", deque(maxlen=30))
    for a in body.actions:
        name = (a or "").strip().lower()
        if name and name in valid:
            _run_one_action(pyboy, name, run_speed)
            step_count += 1
            recent.append({
                "step": step_count,
                "mapName": "",  # filled below
                "action": name,
                "ts": time.time(),
            })
    rec["step_count"] = step_count
    state = get_game_state(pyboy, started_at)
    map_name = state.get("mapName", "?")
    n = min(len([a for a in body.actions if (a or "").strip().lower() in valid]), len(recent))
    for i in range(1, n + 1):
        recent[-i]["mapName"] = map_name
    if state.get("partySize", 0) == 0:
        player_name = rec.get("player_name", "Agent")
        inject_names(pyboy, player_name, "Rival")
    explored = rec.setdefault("explored", set())
    explored.add((state.get("mapId", 0), state.get("x", 0), state.get("y", 0)))
    state["explorationMap"] = build_exploration_grid(explored)
    return {"ok": True, "actionsExecuted": len(body.actions), "state": state}


@app.get("/session/{agent_id}/frame")
def session_frame(agent_id: str):
    with _sessions_lock:
        rec = sessions.get(agent_id)
        if not rec:
            raise HTTPException(status_code=404, detail="No session for this agent")
    try:
        pyboy = rec["pyboy"]
        # PyBoy 2.x: pyboy.screen.image is PIL Image (RGBA 160x144)
        img = pyboy.screen.image.copy()
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Frame capture failed: {e!s}")


@app.post("/session/{agent_id}/stop")
def session_stop(agent_id: str):
    existed = _stop_and_delete_session(agent_id, reason="explicit_stop")
    if not existed:
        return {"ok": True, "message": "No session"}
    return {"ok": True}


@app.get("/session/{agent_id}/recent_actions")
def session_recent_actions(agent_id: str):
    """Last 30 inputs (step, mapName, action, ts) for activity log."""
    with _sessions_lock:
        rec = sessions.get(agent_id)
        if not rec:
            return {"recent_actions": []}
        recent = rec.get("recent_actions") or []
    return {"recent_actions": list(recent)}


@app.get("/session/{agent_id}/state")
def session_state(agent_id: str):
    """Current game state (position, map, party, badges, pokedex, eventFlags, levels, explorationMap) for agent/observer."""
    with _sessions_lock:
        rec = sessions.get(agent_id)
        if not rec:
            raise HTTPException(status_code=404, detail="No session for this agent")
    import time
    pyboy = rec["pyboy"]
    started_at = rec.get("started_at")
    if started_at is None:
        started_at = time.time()
        rec["started_at"] = started_at
    state = get_game_state(pyboy, started_at)
    explored = rec.setdefault("explored", set())
    explored.add((state.get("mapId", 0), state.get("x", 0), state.get("y", 0)))
    state["explorationMap"] = build_exploration_grid(explored)
    return state


@app.get("/session/{agent_id}/state/export")
def session_state_export(agent_id: str):
    """Export current PyBoy save state as raw bytes (for platform save-storage)."""
    with _sessions_lock:
        rec = sessions.get(agent_id)
        if not rec:
            raise HTTPException(status_code=404, detail="No session for this agent")
    pyboy = rec["pyboy"]
    buf = io.BytesIO()
    try:
        pyboy.save_state(buf)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e!s}")
    buf.seek(0)
    return Response(content=buf.read(), media_type="application/octet-stream")


@app.get("/sessions")
def list_sessions():
    with _sessions_lock:
        return {"agent_ids": list(sessions.keys())}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
