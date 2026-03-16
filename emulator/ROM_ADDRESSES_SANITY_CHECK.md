# ROM → Emulator → Agent: Address & Value Sanity Check

Single source of truth for WRAM addresses and derived values. Agent uses state from `GET /api/game/emulator/state` (proxied from emulator `GET /session/{agent_id}/state`), which returns `get_game_state(pyboy)` + `explorationMap`.

---

## 1. WRAM addresses (emulator `game_state.py`)

| WRAM address | Name in code | Meaning | Emulator state key | Agent usage |
|-------------|--------------|---------|--------------------|-------------|
| **0xD35E** | `MAP_N_ADDRESS` | Current map ID | `mapId` | Obs: `mapId` (normalized 0–1). Reward: `PHASE1_MAP_BONUSES`, one-time visit 41/42/55. |
| **0xD361** | `X_POS_ADDRESS` | Player X (tile) | `x` | — |
| **0xD362** | `Y_POS_ADDRESS` | Player Y (tile) | `y` | explorationMap (map_id, x, y) → grid. |
| **0xD356** | `BADGE_COUNT_ADDRESS` | Badge byte (bits 0–7) | `badges` (popcount) | Obs: 8-bit binary. Reward: badge delta, progress. |
| **0xD057** | `IS_IN_BATTLE_ADDRESS` | 0=no, 1=wild, 2=trainer | `inBattle`, `battleKind` | Reward: battle end, beat Pokémon. |
| **0xD2F7** | `POKEDEX_OWNED_START` | 19 bytes, bit set = owned | `pokedexOwned` (popcount) | Reward: owned delta, first 3 catches. |
| **0xD30A** | `POKEDEX_SEEN_START` | 19 bytes, bit set = seen | `pokedexSeen` | Reward: progress. |
| **0xD163** | `PARTY_SIZE_ADDRESS` | Party count (0–6) | `partySize` | Obs: health proxy. Reward: party growth, battle. |
| **0xD16B + i*44** | `PARTY_MON1_STRUCT` + stride | Species byte (slot i) | `party[i].speciesId` = `"species-<byte>"` | Profile/frontend: ROM→id via `getGen1RomOffsetToSpeciesIdMap()`. |
| **0xD164 + i** | `PARTY_SPECIES_LIST_BASE` | Fallback species list | (fallback if struct byte 0) | Same as above. |
| **0xD18C, 0xD1B8, …** | `PARTY_LEVEL_ADDRESSES` | Level per slot | `levels[]` | Obs: level encoding. Reward: level-up. |
| **0xD31D** | `NUM_ITEMS_ADDRESS` | Item count | `inventory.count` | — |
| **0xD31E + i*2** | `ITEM_PAIRS_START` | (item_id, quantity) | `inventory.items[]` | Reward: Poké Balls via `item.id == ITEM_ID_POKEBALL`. |
| **0xD747–0xD87D** | `EVENT_FLAGS_START`–`EVENT_FLAGS_END` (311 bytes) | Event flags (bytes) | `eventFlags` (bit list, 2488 bits) | Obs: `events` (same length). |

---

## 2. Constants (single source: `game_state.py`)

| Constant | Value | Used by |
|----------|--------|---------|
| **MAP_NAMES** | map_id → name (0=Pallet, 1=Viridian, 41=Center Viridian, 42=Mart Viridian, 55=Center Pewter, 54=Pewter Gym, …) | Emulator state `mapName`; agent reward map IDs must match. |
| **PHASE1_MAP_BONUSES** | map_id → default bonus (0, 12, 1, 41, 42, 13, 51, 2, 55, 54) | Agent `obs_reward`: imported as `_PHASE1_MAP_BONUSES`; visit 41/55 → REWARD_VISIT_POKECENTER, 42 → REWARD_VISIT_MART. |
| **ITEM_ID_POKEBALL** | **4** (Gen 1) | Emulator inventory; agent `_count_pokeballs()`: `item.get("id") == ITEM_ID_POKEBALL`. |
| **STARTER_SPECIES** | bulbasaur=**153**, charmander=**176**, squirtle=**177** (ROM species bytes) | `inject_starter()` writes to `PARTY_MON1_STRUCT`; must match ROM and frontend. |
| **GEN1_ROM_SPECIES_TO_ID** | ROM byte → species id (153=bulbasaur, 176=charmander, 177=squirtle, …) | Emulator/frontend consistency; frontend `getGen1RomOffsetToSpeciesIdMap()` matches. |
| **EVENT_FLAGS_START / END** | **0xD747**, **0xD87E** (exclusive) | Emulator `get_event_flags()`; agent `obs_reward.EVENT_FLAGS_*` and space size `(END-START)*8`. |

---

## 3. Agent data flow

1. **State source:** `get_state(agent_key)` → `GET /api/game/emulator/state` → emulator `get_game_state(pyboy)` + `explorationMap`.
2. **Observation:** `build_obs_from_frame_and_state(frame, state, …)` uses `state["mapId"]`, `state["badges"]`, `state["levels"]`, `state["eventFlags"]`, `state["explorationMap"]`, `state["partySize"]`; all come from WRAM above.
3. **Reward:** `compute_reward(state_before, state_after, …, visited_map_ids)` uses:
   - `mapId` → map bonuses from `_PHASE1_MAP_BONUSES` (from emulator); 41/42/55 one-time when `visited_map_ids` provided.
   - `inventory` → `_count_pokeballs()` with `ITEM_ID_POKEBALL` (from emulator).
   - `badges`, `partySize`, `pokedexOwned`, `pokedexSeen`, `levels`, `inBattle` → all from WRAM via state.

---

## 4. Consistency checks

- **Map IDs:** Every key in `PHASE1_MAP_BONUSES` is in `MAP_NAMES`. Agent uses same numeric map IDs (0xD35E).
- **Event flags length:** `(EVENT_FLAGS_END - EVENT_FLAGS_START) * 8` = 2488 bits (311 bytes). Same in `game_state.get_event_flags()` and `obs_reward.build_obs_from_frame_and_state()` / env observation space.
- **Species:** Starter bytes 153/176/177 in `STARTER_SPECIES`; `GEN1_ROM_SPECIES_TO_ID` includes 153 (bulbasaur); frontend `getGen1RomOffsetToSpeciesIdMap()` has same mapping; party sent as `species-<byte>`, resolved on profile by frontend.
- **Item ID 4:** Bulbapedia/pret Gen 1 Poké Ball; emulator and agent both use 4.

Run `python verify_rom_ids.py` from `emulator/` to confirm MAP_NAMES and item IDs against a loaded ROM state.
