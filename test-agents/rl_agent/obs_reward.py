"""Observation building (v2-style) and reward from game state. Override compute_reward for your own reward."""

import io

import numpy as np

from rl_agent.config import (
    REWARD_BADGE,
    REWARD_BEAT_POKEMON,
    REWARD_BUY_POKEBALLS,
    REWARD_EXPLORATION_MAP,
    REWARD_EXPLORATION_TILE,
    REWARD_FIRST_THREE_CATCHES,
    REWARD_LEVEL_UP,
    REWARD_MAP,
    REWARD_PARTY,
    REWARD_POKEDEX_OWNED,
    REWARD_POKEDEX_SEEN,
    REWARD_STEP_PENALTY,
    REWARD_VISIT_MART,
    REWARD_VISIT_POKECENTER,
)

# ROM IDs: single source of truth is emulator/game_state.py (MAP_NAMES, ITEM_ID_POKEBALL, PHASE1_MAP_BONUSES).
# When emulator is on path we use it; otherwise fallback so test-agents can run without repo root.
try:
    from emulator.game_state import (
        ITEM_ID_POKEBALL,
        PHASE1_MAP_BONUSES as _PHASE1_MAP_BONUSES,
    )
except ImportError:
    ITEM_ID_POKEBALL = 4
    _PHASE1_MAP_BONUSES = {
        0: 0.0, 12: 1.0, 1: 2.0, 41: 4.0, 42: 2.0, 13: 1.5, 51: 2.0, 2: 3.0, 55: 4.0, 54: 5.0,
    }

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


def _levels_gained(state_before: dict, state_after: dict) -> int:
    """Total party level gain (sum over all slots). Levels from emulator WRAM party level addresses."""
    before = state_before.get("levels") or []
    after = state_after.get("levels") or []
    total = 0
    for i in range(min(len(before), len(after))):
        try:
            b, a = int(before[i]), int(after[i])
            if a > b:
                total += a - b
        except (TypeError, ValueError):
            pass
    return total


def _count_pokeballs(state: dict) -> int:
    """Total Poké Ball count from state inventory. Item id must match emulator ITEM_ID_POKEBALL (Gen 1 = 4)."""
    inv = state.get("inventory") or {}
    items = inv.get("items") or []
    return sum(
        item.get("quantity", 0)
        for item in items
        if isinstance(item, dict) and item.get("id") == ITEM_ID_POKEBALL
    )


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
    """
    Scalar progress from state (higher = better). Used for reward deltas.

    This is tuned for “beat the game” style progress:
    - badges and caught species are the strongest signals
    - party size and seen species are secondary
    - map id is not treated as inherently good or bad (REWARD_MAP defaults to 0)
    """
    return (
        state.get("badges", 0) * REWARD_BADGE
        + state.get("partySize", 0) * REWARD_PARTY
        + state.get("pokedexOwned", 0) * REWARD_POKEDEX_OWNED
        + state.get("pokedexSeen", 0) * REWARD_POKEDEX_SEEN
        + state.get("mapId", 0) * REWARD_MAP
    )


def compute_reward(state_before: dict, state_after: dict, step_penalty: bool = True) -> float:
    """
    Reward for a transition. Stage-1 (Pallet to Brock) objective-oriented:
    progress delta, beat Pokémon + level-up, visit Center/Mart, buy Poké Balls,
    first 3 catches, map objectives (Route 1, Viridian, Center, Mart, Forest, Pewter, Gym), exploration.
    Map and item IDs match emulator/game_state.py (ROM data).
    """
    progress_after = state_progress(state_after)
    progress_before = state_progress(state_before)
    r = progress_after - progress_before

    # Extra bonuses around key Pokémon Red gameplay events.
    # These sit on top of the generic progress delta so that rare milestones
    # (gym wins, catches, evolutions) stand out clearly in the return signal.
    badges_before = state_before.get("badges", 0)
    badges_after = state_after.get("badges", 0)
    pokedex_owned_before = state_before.get("pokedexOwned", 0)
    pokedex_owned_after = state_after.get("pokedexOwned", 0)
    party_before = state_before.get("partySize", 0)
    party_after = state_after.get("partySize", 0)
    in_battle_before = state_before.get("inBattle", 0)
    in_battle_after = state_after.get("inBattle", 0)
    map_before = state_before.get("mapId")
    map_after = state_after.get("mapId")
    levels_gained = _levels_gained(state_before, state_after)
    pokeballs_before = _count_pokeballs(state_before)
    pokeballs_after = _count_pokeballs(state_after)

    # Badge (e.g. beat Brock)
    if badges_after > badges_before:
        r += REWARD_BADGE

    # Level up: reward per level gained
    if levels_gained > 0 and REWARD_LEVEL_UP != 0:
        r += levels_gained * REWARD_LEVEL_UP

    # New species / party growth
    if pokedex_owned_after > pokedex_owned_before:
        # Reward per new owned species, layered on top of progress delta.
        r += (pokedex_owned_after - pokedex_owned_before) * REWARD_POKEDEX_OWNED

    # First-team building and team growth outside pure grinding.
    if party_after > party_before:
        r += (party_after - party_before) * REWARD_PARTY

    # Battle outcome shaping: reward leaving battle with progress and
    # slightly penalize “wasted” battles that did not change party/dex/badges.
    if in_battle_before and not in_battle_after:
        if party_after >= 1 and REWARD_BEAT_POKEMON != 0:
            r += REWARD_BEAT_POKEMON
        if (
            badges_after == badges_before
            and pokedex_owned_after == pokedex_owned_before
            and party_after == party_before
            and levels_gained == 0
        ):
            r -= abs(REWARD_STEP_PENALTY) * 5.0

    # Stage-1 objectives: map IDs and default bonuses from emulator/game_state.PHASE1_MAP_BONUSES (ROM 0xD35E)
    if map_after != map_before and map_after is not None:
        bonus = _PHASE1_MAP_BONUSES.get(map_after, 0.0)
        if map_after in (41, 55):
            bonus = REWARD_VISIT_POKECENTER
        elif map_after == 42:
            bonus = REWARD_VISIT_MART
        if bonus != 0:
            r += bonus

    if pokeballs_after > pokeballs_before and REWARD_BUY_POKEBALLS != 0:
        r += (pokeballs_after - pokeballs_before) * REWARD_BUY_POKEBALLS

    if REWARD_FIRST_THREE_CATCHES != 0:
        reached_3_before = (pokedex_owned_before >= 3 or party_before >= 3)
        reached_3_after = (pokedex_owned_after >= 3 or party_after >= 3)
        if reached_3_after and not reached_3_before:
            r += REWARD_FIRST_THREE_CATCHES

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
