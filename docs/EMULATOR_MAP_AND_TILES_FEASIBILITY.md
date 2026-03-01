# Feasibility: Agent querying coordinates and nearby tiles/NPCs

This doc answers: **Can an agent get its coordinates and query what is in the tiles around it (grass, water, cuttable tree, trainer, etc.)?**

## Short answer

**Yes — and it’s implemented.** The game state returned by `GET /api/game/emulator/state` (and after step/actions) now includes WRAM-derived **localMap** (tile under player, tile in front, 3×3 surrounding tiles with labels, NPCs) and **inventory**. See docs/AGENTS_EMULATOR.md for the field shapes.

---

## What we already expose

- **Coordinates**: `x`, `y` (player tile position) and `mapId` / `mapName` are in the game state returned on every step and from `GET /api/game/emulator/state`. So the agent already knows where it is on the map.

---

## What exists in the game (WRAM / ROM)

From the [pret pokered](https://github.com/pret/pokered) disassembly (`ram/wram.asm`) and community docs:

### 1. Tiles under / in front of player

- **wTilePlayerStandingOn** – Tile ID the player is standing on.
- **wTileInFrontOfPlayer** – Tile ID in the direction the player is facing.

These are single bytes in WRAM. Interpreting them requires the **tileset collision table** (passable, grass, water, etc.). The game stores a pointer at **wTilesetCollisionPtr**; the table lists which tile IDs are passable. Grass/water/special tiles are identified by comparing the tile ID to the current tileset’s collision/attribute data.

### 2. Blocks around the player

- **wSurroundingTiles** – Buffer described as *“the blocks surrounding the player (6 columns by 5 rows of 4x4-tile blocks)”*. So the game already maintains a small grid of block IDs around the player. It lives in a UNION with other buffers, so it is only valid when the overworld is active (not in menu/battle). Block IDs can be mapped to tile types using the current tileset.

### 3. NPCs and trainers

- **wSpriteStateData1** / **wSpriteStateData2** – 16 sprites × 16 bytes each. For each sprite (including the player as sprite 0):
  - Picture ID, movement status, facing direction.
  - Y/X position in pixels and in “2x2 tile grid” steps (so we get grid-aligned positions).
- **wMapSpriteData** / **wMapSpriteExtraData** – Per–map object data: e.g. text ID, trainer class, item ID. So we can correlate “sprite at (gx, gy)” with “trainer” or “NPC with text ID X”.

So we can, in principle, list NPCs/trainers and their grid positions around the player.

### 4. Map header (dimensions, tileset)

- **wCurMapHeader** – Includes **wCurMapTileset**, **wCurMapHeight**, **wCurMapWidth**, **wCurMapDataPtr**. So we know map size and which tileset (and thus which collision/tile rules) apply.

---

## What we’d need to implement

1. **Resolve WRAM addresses**  
   The disassembly uses symbols (e.g. `wTileInFrontOfPlayer`). We need their actual addresses (e.g. via `rgblink` map file or the project’s built ROM symbol table). WRAM is typically in the 0xC000–0xDFFF range.

2. **Read and expose in state or a new endpoint**  
   - Tile under player, tile in front of player (raw IDs and/or a small “type” enum: e.g. passable, grass, water, door, cuttable_tree).  
   - Optionally: a small “local map” or “surrounding tiles” (e.g. 3×3 or 5×5) with the same type enum.  
   - Optionally: list of NPCs/trainers with grid (x, y) and type (trainer / NPC / item).

3. **Tile ID → semantics**  
   - Use **wTilesetCollisionPtr** (and tileset data) at runtime to classify tile IDs, or  
   - Precompute per-tileset tables (passable, grass, water, special) and ship them with the emulator.

4. **When the buffer is valid**  
   Only read `wSurroundingTiles` (and possibly some sprite data) when the game is in overworld mode (not in menu, battle, or text). We can gate on `inBattle` and possibly a “menu open” flag if we add it.

---

## Conclusion

- **Coordinates**: Already available.  
- **Nearby tiles (passable, grass, water, cuttable, etc.)**: Possible by reading WRAM (`wTilePlayerStandingOn`, `wTileInFrontOfPlayer`, and optionally `wSurroundingTiles`) and interpreting tile IDs with the current tileset’s collision/attribute data.  
- **Nearby NPCs/trainers**: Possible by reading `wSpriteStateData1/2` and `wMapSpriteData` / `wMapSpriteExtraData`.

So an agent can both know its position and “query” (via our API) what is in the tile under it, in front of it, and in a small neighbourhood, plus where NPCs/trainers are. That would support smarter pathfinding and bulk decisions (e.g. “move 10 steps north” or “go to the next trainer”) without needing a new decision every single step.
