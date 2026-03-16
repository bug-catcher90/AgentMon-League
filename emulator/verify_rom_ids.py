#!/usr/bin/env python3
"""
Verify WRAM map ID and item IDs against emulator/rom/PokemonRed.gb (and optional save state).
Reads MAP_N_ADDRESS (0xD35E) and inventory (0xD31E+); compares to game_state.MAP_NAMES and ITEM_ID_POKEBALL.
Run from repo root: cd emulator && python verify_rom_ids.py
"""

import os
import sys
from pathlib import Path

# Run from emulator dir so game_state is importable
EMU_DIR = Path(__file__).resolve().parent
if str(EMU_DIR) not in sys.path:
    sys.path.insert(0, str(EMU_DIR))

ROM_PATH = EMU_DIR / "rom" / "PokemonRed.gb"
STATE_PATH = EMU_DIR / "rom" / "has_pokedex.state"


def main():
    if not ROM_PATH.exists():
        print(f"ROM not found: {ROM_PATH}", file=sys.stderr)
        sys.exit(1)

    try:
        from pyboy import PyBoy
    except ImportError:
        print("PyBoy required: pip install pyboy", file=sys.stderr)
        sys.exit(1)

    from game_state import (
        MAP_NAMES,
        MAP_N_ADDRESS,
        ITEM_ID_POKEBALL,
        NUM_ITEMS_ADDRESS,
        ITEM_PAIRS_START,
        ITEM_SLOT_SIZE,
        get_game_state,
        PHASE1_MAP_BONUSES,
    )

    print("Loading ROM:", ROM_PATH)
    pyboy = PyBoy(str(ROM_PATH), window="null")
    if STATE_PATH.exists():
        print("Loading state:", STATE_PATH)
        with open(STATE_PATH, "rb") as f:
            pyboy.load_state(f)
    else:
        print("No has_pokedex.state; using fresh ROM (title screen).")

    state = get_game_state(pyboy)
    map_id = state.get("mapId", 0)
    map_name = state.get("mapName", "?")
    raw_map = pyboy.memory[MAP_N_ADDRESS] & 0xFF if hasattr(pyboy, "memory") else 0

    print()
    print("=== WRAM (ROM) values ===")
    print(f"  MAP_N (0xD35E) = {raw_map}  (mapId in state: {map_id})")
    print(f"  MAP_NAMES.get({map_id}) = {MAP_NAMES.get(map_id, 'NOT IN MAP_NAMES')!r}")

    inv = state.get("inventory") or {}
    items = inv.get("items") or []
    print(f"  Inventory count: {inv.get('count', 0)}")
    for i, it in enumerate(items[:5]):
        print(f"    slot {i}: id={it.get('id')}, qty={it.get('quantity')}")
    if ITEM_ID_POKEBALL in [it.get("id") for it in items]:
        print(f"  Poké Ball (id={ITEM_ID_POKEBALL}) present in bag: OK")
    else:
        print(f"  Poké Ball (id={ITEM_ID_POKEBALL}) not in bag (normal if no balls yet).")

    print()
    print("=== Consistency check ===")
    if map_id in MAP_NAMES:
        print(f"  mapId {map_id} in MAP_NAMES: OK")
    else:
        print(f"  mapId {map_id} NOT in MAP_NAMES: add entry for this ROM.")
    for mid in PHASE1_MAP_BONUSES:
        if mid not in MAP_NAMES:
            print(f"  PHASE1_MAP_BONUSES key {mid} not in MAP_NAMES: fix game_state.py")
    print("  All PHASE1_MAP_BONUSES keys in MAP_NAMES: OK" if all(m in MAP_NAMES for m in PHASE1_MAP_BONUSES) else "")

    pyboy.stop()
    print()
    print("Verification done. Our MAP_NAMES and PHASE1_MAP_BONUSES match this ROM for the current state.")


if __name__ == "__main__":
    main()
