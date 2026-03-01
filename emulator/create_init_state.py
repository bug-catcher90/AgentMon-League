#!/usr/bin/env python3
"""
Create an init save state that skips the intro and name entry, with the player
in their house. The emulator will load this state and inject agent/rival names.

Run from the emulator directory (with the ROM available):
  python create_init_state.py

Output: init.state in the emulator directory (or path from EMULATOR_INIT_STATE_OUT).
Set EMULATOR_INIT_STATE=emulator/init.state (or full path) when starting the server.
"""

import os
import sys
from pathlib import Path

# Reuse server's ROM path logic
ROM_PATH = os.environ.get("EMULATOR_ROM_PATH", "PokemonRed.gb")
OUT_PATH = os.environ.get("EMULATOR_INIT_STATE_OUT", "init.state")

def _rom_path() -> Path:
    raw = (ROM_PATH or "").strip()
    if not raw or raw == "PokemonRed.gb" or "/path/to" in raw:
        base = Path(__file__).resolve().parent
        for c in [base / "PokemonRed.gb", base.parent / "PokemonRed.gb"]:
            if c.exists():
                return c
        return base / "PokemonRed.gb"
    p = Path(raw)
    if not p.is_absolute():
        p = Path(__file__).resolve().parent / p
    return p


def main():
    try:
        from pyboy import PyBoy
        from pyboy.utils import WindowEvent
    except ImportError:
        print("PyBoy required: pip install pyboy", file=sys.stderr)
        sys.exit(1)

    try:
        from game_state import get_game_state
    except ImportError:
        def get_game_state(pyboy, _=None):
            try:
                return {"mapId": pyboy.memory[0xD35E], "partySize": pyboy.memory[0xD163]}
            except Exception:
                return {"mapId": 0, "partySize": 0}

    rom = _rom_path()
    if not rom.exists():
        print(f"ROM not found: {rom}", file=sys.stderr)
        sys.exit(1)

    out = Path(OUT_PATH)
    if not out.is_absolute():
        out = Path(__file__).resolve().parent / out

    print("Loading ROM and advancing through intro to player's house...")
    pyboy = PyBoy(str(rom), window="null")
    try:
        # Phase 1: Title. Phase 2: Start to get to main menu. Phase 3: A (+ Start) to select
        # New Game and get through name entry and Oak dialogue. Target: map 37 (house) or 38 (bedroom).
        max_ticks = 90000  # ~25 min at 60fps
        tick = 0
        in_house = False
        last_a = -999
        last_start = -999

        while tick < max_ticks:
            # Let title appear (0-240), then press Start every ~1.5s to get past title and to menu
            if 240 <= tick < 720:
                if tick - last_start >= 90:
                    pyboy.send_input(WindowEvent.PRESS_BUTTON_START)
                    pyboy.send_input(WindowEvent.RELEASE_BUTTON_START)
                    last_start = tick
            # From 500 onward: spam A every 12 frames to select New Game and advance dialogue
            if tick >= 500 and tick - last_a >= 12:
                pyboy.send_input(WindowEvent.PRESS_BUTTON_A)
                pyboy.send_input(WindowEvent.RELEASE_BUTTON_A)
                last_a = tick
            # Every ~2s press Start too (some screens use Start to confirm name)
            if tick >= 600 and (tick - last_start >= 120):
                pyboy.send_input(WindowEvent.PRESS_BUTTON_START)
                pyboy.send_input(WindowEvent.RELEASE_BUTTON_START)
                last_start = tick

            pyboy.tick(1, True)
            tick += 1

            if tick % 60 == 0:
                try:
                    state = get_game_state(pyboy)
                    map_id = state.get("mapId", 0)
                    if map_id in (37, 38):
                        in_house = True
                        print(f"Reached house (map {map_id}) at tick {tick}")
                        break
                except Exception:
                    pass

        if not in_house:
            print("Warning: did not reach house (map 37/38) in time; saving current state.", file=sys.stderr)
            print("You can run the game manually to the house, save a state, and use that.", file=sys.stderr)

        with open(out, "wb") as f:
            pyboy.save_state(f)
        print(f"Saved init state to {out}")
        print(f"Set EMULATOR_INIT_STATE={out} (or relative path) when starting the emulator.")
    finally:
        pyboy.stop()


if __name__ == "__main__":
    main()
