#!/usr/bin/env python3
"""
Capture the in-game Town Map from Pokémon Red as a PNG.

The Game Boy screen is 160x144. The Town Map in the game may be larger (scrollable);
this script saves the current frame. For a full map image you can:
  - Run the game, open the menu (Start), select Town Map, then run this script
    with a save state that has the map open.
  - Or take multiple screenshots while scrolling and stitch them in an image editor.

Usage:
  From project root, with a save state that has the Town Map open:
    cd emulator
    python capture_town_map.py --state path/to/town_map.state --output ../public/maps/kanto_town_map.png

  Or with ROM only (you must have opened the map before the script runs):
    python capture_town_map.py --rom path/to/PokemonRed.gb --output ../public/maps/kanto_town_map.png

Requires: PyBoy, PIL
"""

import argparse
import logging
import os
import sys

# Silence PyBoy sound buffer overrun logs
logging.getLogger("pyboy.core.sound").setLevel(logging.CRITICAL + 1)
logging.getLogger("pyboy.core").setLevel(logging.CRITICAL + 1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Capture current PyBoy screen (e.g. Town Map) to PNG")
    parser.add_argument("--output", "-o", required=True, help="Output PNG path (e.g. ../public/maps/kanto_town_map.png)")
    parser.add_argument("--state", "-s", help="Path to .state file (map already open)")
    parser.add_argument("--rom", "-r", help="Path to Pokemon Red ROM (optional if using --state)")
    args = parser.parse_args()

    try:
        from pyboy import PyBoy
    except ImportError:
        print("PyBoy is required: pip install pyboy", file=sys.stderr)
        sys.exit(1)

    rom_path = args.rom or os.environ.get("EMULATOR_ROM_PATH")
    if args.state:
        if not rom_path:
            print("Provide --rom or set EMULATOR_ROM_PATH when using --state", file=sys.stderr)
            sys.exit(1)
        pyboy = PyBoy(rom_path)
        with open(args.state, "rb") as f:
            pyboy.load_state(f)
    elif rom_path:
        pyboy = PyBoy(rom_path)
        print("ROM loaded. Open the Town Map in the game, then press Enter here to capture...")
        input()
    else:
        print("Provide --state or --rom (or set EMULATOR_ROM_PATH)", file=sys.stderr)
        sys.exit(1)

    img = pyboy.screen.image.copy()
    out_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path)
    pyboy.stop()
    print(f"Saved {img.size[0]}x{img.size[1]} to {out_path}")


if __name__ == "__main__":
    main()
