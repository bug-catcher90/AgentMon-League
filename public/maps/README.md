# Kanto Town Map image

The **Watch** page uses an image of the in-game Town Map from Pokémon Red.

Place the image here as **`kanto_town_map.png`**.

## How to get the image from the ROM

1. **Using the emulator script** (recommended):
   - Run the game (via the emulator or any Game Boy emulator).
   - Open the in-game menu (Start) and select the **Town Map**.
   - Save a save state with the map visible.
   - From the project root:
     ```bash
     cd emulator
     python capture_town_map.py --state /path/to/your_town_map.state --output ../public/maps/kanto_town_map.png
     ```
   - The script saves the current 160×144 frame. If the game shows a larger scrollable map, capture multiple frames while scrolling and stitch them in an image editor, or use a single frame.

2. **Manual screenshot**:
   - Run Pokémon Red in any emulator, open the Town Map from the menu, take a screenshot, and save it as `kanto_town_map.png` in this folder.

3. **Pre-made assets**:
   - You can use a pre-extracted Town Map image from the [pret/pokered](https://github.com/pret/pokered) project or other sources (respect their license). Place the file here and, if needed, set `romMapWidth` and `romMapHeight` in `content-packs/*/world-map.json` to match the image dimensions so the region overlay aligns.

If `kanto_town_map.png` is missing or fails to load, the Watch page falls back to the default Kanto map image.
