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
import os
import time
from collections import deque
from pathlib import Path

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

sessions: dict[str, dict] = {}  # agent_id -> { "pyboy", "screen" }


def _rom_path() -> Path:
    """Resolve ROM path. Tries default locations if unset or placeholder."""
    raw = (ROM_PATH or "").strip()
    # Placeholder or default: try emulator dir and project root
    if not raw or raw == "PokemonRed.gb" or "/path/to/your" in raw or "path/to" in raw:
        base = Path(__file__).resolve().parent
        for candidate in [base / "PokemonRed.gb", base.parent / "PokemonRed.gb"]:
            if candidate.exists():
                return candidate
        return base / "PokemonRed.gb"  # so error message shows where we looked
    p = Path(raw)
    if not p.is_absolute():
        p = Path(__file__).resolve().parent / p
    return p


def _init_state_path() -> Path | None:
    """
    Resolve path to the init state file (load when starting a new session).
    - If EMULATOR_INIT_STATE is set and the file exists, use it.
    - Else if has_pokedex.state exists in the emulator directory, use it (start after Oak's parcel).
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
    default = base / DEFAULT_INIT_STATE_FILENAME
    if default.exists():
        return default
    return None


@app.get("/health")
def health():
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
    if agent_id in sessions:
        return {"ok": True, "agent_id": agent_id, "message": "Session already exists"}

    rom = _rom_path()
    if not rom.exists():
        raise HTTPException(
            status_code=400,
            detail=(
                f"ROM not found at {rom}. "
                "Put your Pokemon Red ROM (e.g. PokemonRed.gb) in the project root or emulator/ folder, "
                "or set EMULATOR_ROM_PATH to its full path before starting the server."
            ),
        )

    # Headless: no display (PyBoy 2.x uses window='null')
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
    sessions[agent_id] = {
        "pyboy": pyboy,
        "player_name": player_name,
        "started_at": time.time(),
        "speed": speed,
        "explored": set(),  # (map_id, x, y) for exploration map
        "step_count": 0,
        "recent_actions": deque(maxlen=30),  # { "step", "mapName", "action", "ts" }
    }
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
    if agent_id not in sessions:
        raise HTTPException(status_code=404, detail="No session for this agent")
    idx = ACTION_INDEX.get(body.action.strip().lower())
    if idx is None:
        raise HTTPException(status_code=400, detail=f"Invalid action. Use: {list(ACTION_INDEX.keys())}")

    name, press_ev, release_ev = VALID_ACTIONS[idx]
    pyboy = sessions[agent_id]["pyboy"]
    started_at = sessions[agent_id].get("started_at")
    speed = sessions[agent_id].get("speed", 1)

    state_before = get_game_state(pyboy, started_at)
    _run_one_action(pyboy, body.action.strip().lower(), speed)
    state_after = get_game_state(pyboy, started_at)
    if state_after.get("partySize", 0) == 0:
        player_name = sessions[agent_id].get("player_name", "Agent")
        inject_names(pyboy, player_name, "Rival")

    explored = sessions[agent_id].setdefault("explored", set())
    explored.add((state_after.get("mapId", 0), state_after.get("x", 0), state_after.get("y", 0)))
    state_after["explorationMap"] = build_exploration_grid(explored)

    step_count = sessions[agent_id].setdefault("step_count", 0) + 1
    sessions[agent_id]["step_count"] = step_count
    sessions[agent_id].setdefault("recent_actions", deque(maxlen=30)).append({
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
    if agent_id not in sessions:
        raise HTTPException(status_code=404, detail="No session for this agent")
    pyboy = sessions[agent_id]["pyboy"]
    started_at = sessions[agent_id].get("started_at")
    run_speed = body.speed if body.speed is not None else sessions[agent_id].get("speed", 1)
    if run_speed == 0:
        run_speed = 1  # still tick at least once per sub-step
    valid = set(ACTION_INDEX.keys())
    step_count = sessions[agent_id].setdefault("step_count", 0)
    recent = sessions[agent_id].setdefault("recent_actions", deque(maxlen=30))
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
    sessions[agent_id]["step_count"] = step_count
    state = get_game_state(pyboy, started_at)
    map_name = state.get("mapName", "?")
    n = min(len([a for a in body.actions if (a or "").strip().lower() in valid]), len(recent))
    for i in range(1, n + 1):
        recent[-i]["mapName"] = map_name
    if state.get("partySize", 0) == 0:
        player_name = sessions[agent_id].get("player_name", "Agent")
        inject_names(pyboy, player_name, "Rival")
    explored = sessions[agent_id].setdefault("explored", set())
    explored.add((state.get("mapId", 0), state.get("x", 0), state.get("y", 0)))
    state["explorationMap"] = build_exploration_grid(explored)
    return {"ok": True, "actionsExecuted": len(body.actions), "state": state}


@app.get("/session/{agent_id}/frame")
def session_frame(agent_id: str):
    if agent_id not in sessions:
        raise HTTPException(status_code=404, detail="No session for this agent")
    try:
        pyboy = sessions[agent_id]["pyboy"]
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
    if agent_id not in sessions:
        return {"ok": True, "message": "No session"}
    sessions[agent_id]["pyboy"].stop()  # PyBoy 2.x
    del sessions[agent_id]
    return {"ok": True}


@app.get("/session/{agent_id}/recent_actions")
def session_recent_actions(agent_id: str):
    """Last 30 inputs (step, mapName, action, ts) for activity log."""
    if agent_id not in sessions:
        return {"recent_actions": []}
    recent = sessions[agent_id].get("recent_actions") or []
    return {"recent_actions": list(recent)}


@app.get("/session/{agent_id}/state")
def session_state(agent_id: str):
    """Current game state (position, map, party, badges, pokedex, eventFlags, levels, explorationMap) for agent/observer."""
    if agent_id not in sessions:
        raise HTTPException(status_code=404, detail="No session for this agent")
    import time
    rec = sessions[agent_id]
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
    if agent_id not in sessions:
        raise HTTPException(status_code=404, detail="No session for this agent")
    pyboy = sessions[agent_id]["pyboy"]
    buf = io.BytesIO()
    try:
        pyboy.save_state(buf)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e!s}")
    buf.seek(0)
    return Response(content=buf.read(), media_type="application/octet-stream")


@app.get("/sessions")
def list_sessions():
    return {"agent_ids": list(sessions.keys())}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
