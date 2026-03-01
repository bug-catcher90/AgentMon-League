# PokeAPI v2 – Fit for AgentMon League Backend & Frontend

Assessment of whether [PokeAPI v2](https://pokeapi.co/docs/v2) provides the data and endpoints needed to run our backend game and replicate it visually on the frontend.

---

## What our game needs (from current codebase)

| Data | Used for | Our format (content pack) |
|------|----------|---------------------------|
| **Species** | Battle, party, pokedex, starter choice | `id`, `name`, `types[]`, `base.{ hp, attack, defense, speed, special }`, `moves[]` (move ids) |
| **Moves** | Battle damage, PP, type effectiveness | `id`, `name`, `type`, `power`, `accuracy`, `pp`, `category` (physical/special/status) |
| **Type chart** | Battle damage multiplier | Gen1 chart in code (`GEN1_TYPE_CHART`) |
| **Encounters** | Wild spawns per area | `encounters.json`: `{ "route_1_grass": [ { speciesId, weight }, ... ] }` keyed by `encounterTableId` |
| **Items** | Healing, status cure, capture | `id`, `name`, `effect` (heal/cure/capture), `value`, `status`, `captureRate`, `description` |
| **Sprites** | Frontend display | Not in pack today; could drive UI |

---

## PokeAPI v2 – What’s available

### 1. Pokémon (species + stats + types + moves + sprites)

**Endpoint:** `GET https://pokeapi.co/api/v2/pokemon/{id or name}/`

- **id, name** – ✅ Direct.
- **types** – ✅ `types[].type.name` (e.g. `"normal"`, `"fairy"`). For Gen1 we can use `past_types` filtered by `generation.name === "generation-i"` where needed (e.g. Clefairy was Normal in Gen1).
- **Base stats** – ✅ `stats[]`: each has `stat.name` (hp, attack, defense, speed, special-attack, special-defense) and `base_stat`. We use Gen1 “special” as one stat; we can take `special-attack` (or average with `special-defense`) for `special`.
- **Moves** – ✅ `moves[]` with `version_group_details[]`. Filter by `version_group.name === "red-blue"` (or `yellow`) and use `level_learned_at` to build a learnset; then choose up to 4 moves per species (e.g. by level or our own rule).
- **Sprites** – ✅ Rich set: `sprites.front_default`, `back_default`, and `sprites.versions.generation-i.red-blue` (and yellow) for pixel art. Also `other["official-artwork"]` for modern UI. Ideal for frontend.

**Verdict:** Sufficient for species, stats, types, learnset, and all frontend sprites. We need a small mapping layer (Gen1 types from `past_types` when relevant, “special” from special-attack/special-defense).

---

### 2. Moves (power, accuracy, PP, type, category)

**Endpoint:** `GET https://pokeapi.co/api/v2/move/{id or name}/`

- **id, name** – ✅ Direct (names are kebab-case, e.g. `vine-whip`).
- **power, accuracy, pp** – ✅ Top-level fields.
- **type** – ✅ `type.name` (e.g. `"grass"`).
- **Category (physical/special/status)** – ✅ `damage_class.name`: `"physical"`, `"special"`, or `"status"`. Maps to our `category`.

**Verdict:** Covers everything we need for moves. Optional: use `past_values` or generation filter if we want strict Gen1 PP/accuracy for a given version.

---

### 3. Type effectiveness (battle damage)

**Endpoint:** `GET https://pokeapi.co/api/v2/type/{id or name}/`

- **Damage relations** – ✅ `damage_relations`: `double_damage_to`, `half_damage_to`, `no_damage_to`, and `_from` variants. Each is a list of types.
- **Gen1 vs later** – Default `damage_relations` are the current (multi-gen) chart. For Gen1 we have two options:
  - Use `past_damage_relations` and pick the entry for `generation.name === "generation-i"` if present, or
  - Keep our hardcoded `GEN1_TYPE_CHART` and use PokeAPI only for types list / names / future gens.

**Verdict:** We can either build a Gen1 type chart from PokeAPI (with generation filtering) or keep our chart and use PokeAPI for everything else. Both are viable.

---

### 4. Encounters (wild spawns by area)

**Endpoints:**

- **By location area:** `GET https://pokeapi.co/api/v2/location-area/{id or name}/`  
  Returns `pokemon_encounters[]`: each has `pokemon.name` and `version_details[]` with `version.name`, `max_chance`, and `encounter_details[]` (e.g. `min_level`, `max_level`, `chance`, `method.name` like `"walk"` or `"surf"`).
- **By Pokémon:** `GET https://pokeapi.co/api/v2/pokemon/{id}/encounters`  
  Returns list of location areas where that Pokémon appears, with version and chance info.

Our game uses **encounter table IDs** (e.g. `route_1_grass`, `viridian_forest`, `cave`, `water`) and area configs reference them via `encounterTableId`. PokeAPI uses **location-area names** (e.g. `kanto-route-2-south-towards-viridian-city`) and **version** (red, blue, yellow, etc.).

**Verdict:** Data is there but **mapping is required**: we need a mapping from our `encounterTableId` (and optionally region/area) to PokeAPI location-area ids/names, and we must filter by version (e.g. red or blue). Then we can build our weight-based tables from `chance` and `encounter_details`. One-time or periodic sync script is the right approach.

---

### 5. Items (healing, cure, capture)

**Endpoint:** `GET https://pokeapi.co/api/v2/item/{id or name}/`

- **id, name** – ✅ Direct.
- **Effect** – ✅ Described in `effect_entries[]` (e.g. “Catches a wild Pokémon every time”) and optionally in `category.name` (e.g. `standard-balls`, healing items). No direct “effect: heal | cure | capture”;
- **Value / capture rate** – ❌ No direct `value` or `captureRate`. We’d infer from effect text or maintain a small mapping (e.g. `potion` → heal 20, `master-ball` → capture 255).

**Verdict:** Names, categories, and descriptions are useful; **effect and numeric values** (heal amount, capture rate) need a thin mapping layer or rules (e.g. by category + name).

---

### 6. Other useful endpoints

- **List resources:** `GET /api/v2/pokemon/`, `/api/v2/move/`, `/api/v2/type/`, `/api/v2/item/` (paginated, optional `?limit=&offset=`) – for syncing or discovery.
- **Evolution:** `GET /api/v2/evolution-chain/{id}/` – if we add evolution later.
- **Pokedex:** `GET /api/v2/pokedex/2/` (Kanto) – list of species in order; useful for “first 151” or ordering.

---

## Summary table

| Need | PokeAPI | Gap / action |
|------|---------|---------------|
| Species (id, name, types, base stats, moves) | ✅ `/pokemon/{id}` | Map Gen1 types (`past_types`), define “special” from stats, build learnset from red-blue moves. |
| Moves (id, name, type, power, accuracy, pp, category) | ✅ `/move/{id}` | Use `damage_class` as category. Optional: Gen1 PP via `past_values` if needed. |
| Type effectiveness | ✅ `/type/{id}` | Use `damage_relations`; for Gen1 use `past_damage_relations` or keep our chart. |
| Encounters by area | ✅ `/location-area/{id}`, `/pokemon/{id}/encounters` | Map our `encounterTableId` → location-area + version; derive weights from chances. |
| Items (effect, value, captureRate) | ⚠️ `/item/{id}` | Names/categories/descriptions ✅; effect/value/captureRate need a small mapping. |
| Sprites (frontend) | ✅ In `/pokemon/{id}` | Use `sprites.versions.generation-i.red-blue` (or official-artwork) for UI. |

---

## Recommended approach

1. **Cache everything** – PokeAPI asks to cache. Do not call it on every request.
2. **Sync job / script** – Periodically (or one-time) fetch from PokeAPI and write to our content pack (or DB):
   - **Species:** Fetch `/pokemon/1`…`151` (and any extras), map to our `Species` shape (types from `past_types` for Gen1, base stats, moves from red-blue learnset).
   - **Moves:** Fetch moves we need (from species learnsets), map to our `Move` shape.
   - **Types:** Fetch `/type/{name}` for each type, build Gen1 chart from `past_damage_relations` or keep current chart.
   - **Encounters:** Define mapping `encounterTableId` → list of PokeAPI location-area ids; for each area fetch location-area and filter by version red/blue; build `encounters.json`.
   - **Items:** Fetch items we care about; keep a small table (id → effect, value, captureRate) for game logic; use PokeAPI for name, description, sprites.
3. **Frontend** – Use PokeAPI sprite URLs from cached species data (or store URLs in our pack) so the UI can show Pokémon art, items, etc. without calling PokeAPI at runtime.

**Conclusion:** PokeAPI v2 has all the data and endpoints needed to build and drive our backend game and to replicate it visually on the frontend, provided we add a **mapping and sync layer** (especially for encounters and item effects) and **cache** all data instead of calling the API at request time.

---

## Implementation (done)

- **Sync script:** `pnpm run sync-pokeapi` (or `npx tsx scripts/sync-pokeapi.ts`) fetches from PokeAPI and writes `content-packs/original-pack/species.json`, `moves.json`, `encounters.json`, `items.json`. Species include `spriteFront` / `spriteBack` (Gen1 Red/Blue sprites). Run periodically to refresh data; respect PokeAPI fair use (cache locally).
- **Content types:** `Species` in `src/lib/content.ts` has optional `spriteFront`, `spriteBack`.
- **API:** `GET /api/content/species` returns all species with id, name, types, sprite URLs for the frontend.
- **Frontend:** Battle view (`/observe/match/[id]`) and agent party (`/observe/agents/[id]`) use species sprites for a Red/Blue-style look. World map uses our Kanto map + reference sprite (see observe world page).
