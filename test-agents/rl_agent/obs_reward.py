"""Observation building (v2-style) and reward from game state. Override compute_reward for your own reward."""

import io

import numpy as np

from rl_agent.config import (
    REWARD_BADGE,
    REWARD_EXPLORATION_MAP,
    REWARD_EXPLORATION_TILE,
    REWARD_MAP,
    REWARD_PARTY,
    REWARD_POKEDEX_OWNED,
    REWARD_POKEDEX_SEEN,
    REWARD_STEP_PENALTY,
)

# PokemonRedExperiments v2 layout
V2_ACTION_NAMES = ["down", "left", "right", "up", "a", "b", "start"]
OUTPUT_SHAPE = (72, 80, 3)
COORDS_PAD = 12
EVENT_FLAGS_START = 0xD747
EVENT_FLAGS_END = 0xD87E
ENC_FREQS = 8


def build_obs_from_frame_and_state(
    frame_bytes: bytes,
    state: dict,
    recent_screens: np.ndarray,
    recent_actions: np.ndarray,
) -> dict:
    """Build v2-style Dict observation from API frame + state (for PPO.predict)."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(frame_bytes))
        arr = np.array(img)
        if arr.ndim == 3:
            gray = (arr[:, :, :3].mean(axis=2)).astype(np.uint8)
        else:
            gray = arr.astype(np.uint8)
        small = Image.fromarray(gray).resize((80, 72), Image.Resampling.LANCZOS)
        cur_screen = np.array(small, dtype=np.uint8)
        if cur_screen.ndim == 2:
            cur_screen = cur_screen[:, :, np.newaxis]
    except Exception:
        cur_screen = np.zeros((72, 80, 1), dtype=np.uint8)

    recent_screens = np.roll(recent_screens, 1, axis=2)
    recent_screens[:, :, 0] = cur_screen[:, :, 0]
    screens = recent_screens.copy()

    health = np.array([1.0 if state.get("partySize", 1) > 0 else 0.0], dtype=np.float32)

    # Level: real party levels from API, or dummy encoding if missing
    levels = state.get("levels") or []
    if levels:
        # Use first party mon level; encode with sin-based frequencies (v2-style)
        try:
            lv = min(max(int(levels[0]), 1), 100)
        except (TypeError, ValueError):
            lv = 5
        level_enc = np.sin(0.02 * lv * 2 ** np.arange(ENC_FREQS)).astype(np.float32)
    else:
        level_enc = np.sin(0.02 * 5 * 5 * 2 ** np.arange(ENC_FREQS)).astype(np.float32)

    badges_val = state.get("badges", 0)
    try:
        badges_int = int(badges_val) if badges_val is not None else 0
    except (TypeError, ValueError):
        badges_int = 0
    badges_int = min(max(badges_int, 0), 255)
    badges = np.array([int(b) for b in f"{badges_int:08b}"], dtype=np.int8)

    # Event flags from API (bit list from emulator WRAM 0xD747--0xD87E)
    events_len = (EVENT_FLAGS_END - EVENT_FLAGS_START) * 8
    raw_events = state.get("eventFlags")
    if isinstance(raw_events, (list, tuple)) and len(raw_events) >= events_len:
        events = np.array(raw_events[:events_len], dtype=np.int8)
    else:
        events = np.zeros(events_len, dtype=np.int8)

    # Exploration map from API (48x48, 0/1 per cell)
    map_size = COORDS_PAD * 4
    map_arr = np.zeros((map_size, map_size, 1), dtype=np.uint8)
    raw_map = state.get("explorationMap")
    if isinstance(raw_map, (list, tuple)) and len(raw_map) >= map_size:
        for r in range(min(map_size, len(raw_map))):
            row = raw_map[r]
            if isinstance(row, (list, tuple)) and len(row) >= map_size:
                for c in range(min(map_size, len(row))):
                    map_arr[r, c, 0] = 1 if row[c] else 0

    return {
        "screens": screens,
        "health": health,
        "level": level_enc,
        "badges": badges,
        "events": events,
        "map": map_arr,
        "recent_actions": recent_actions.copy(),
    }


def _explored_tile_count(state: dict) -> int:
    """Sum of explored cells from state's explorationMap (48x48). Returns 0 if missing."""
    grid = state.get("explorationMap")
    if not isinstance(grid, (list, tuple)) or len(grid) == 0:
        return 0
    total = 0
    for row in grid:
        if isinstance(row, (list, tuple)):
            total += sum(1 for c in row if c)
    return total


def state_progress(state: dict) -> float:
    """Scalar progress from state (higher = better). Used for reward deltas."""
    return (
        state.get("badges", 0) * REWARD_BADGE
        + state.get("partySize", 0) * REWARD_PARTY
        + state.get("pokedexOwned", 0) * REWARD_POKEDEX_OWNED
        + state.get("pokedexSeen", 0) * REWARD_POKEDEX_SEEN
        + state.get("mapId", 0) * REWARD_MAP
    )


def compute_reward(state_before: dict, state_after: dict, step_penalty: bool = True) -> float:
    """
    Reward for a transition. Override this (or env REWARD_* env vars) for your own reward.
    Default: delta progress (badges, party, pokedex, map) + exploration (new tiles / new map) + step penalty.
    """
    progress_after = state_progress(state_after)
    progress_before = state_progress(state_before)
    r = progress_after - progress_before

    # Exploration: reward for new explored tiles (and optionally new map id)
    if REWARD_EXPLORATION_TILE != 0:
        tiles_before = _explored_tile_count(state_before)
        tiles_after = _explored_tile_count(state_after)
        r += (tiles_after - tiles_before) * REWARD_EXPLORATION_TILE
    if REWARD_EXPLORATION_MAP != 0:
        map_before = state_before.get("mapId")
        map_after = state_after.get("mapId")
        if map_after != map_before and map_after is not None:
            r += REWARD_EXPLORATION_MAP

    if step_penalty and REWARD_STEP_PENALTY != 0:
        r += REWARD_STEP_PENALTY
    return float(r)
