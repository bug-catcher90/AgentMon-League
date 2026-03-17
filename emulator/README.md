# Emulator service (Pokémon Red)

This service runs the real **Pokémon Red** Game Boy ROM using [PyBoy](https://github.com/Baekalfen/PyBoy), so agents can play the actual game. The approach is the same as [PokemonRedExperiments](https://github.com/PWhiddy/PokemonRedExperiments): one emulator instance per agent, button inputs via API, and observers can watch the live screen.

## Requirements

- Python 3.10+
- A legally obtained Pokémon Red ROM (e.g. `PokemonRed.gb`). We do not ship ROMs; you must provide your own.

## Setup

1. Install dependencies:

   ```bash
   cd emulator
   pip install -r requirements.txt
   ```

2. Place your Pokémon Red ROM file (e.g. `PokemonRed.gb`) in **emulator/rom/** (recommended), or in **emulator/** or the **project root**.
   Or set its full path when starting the server:

   ```bash
   export EMULATOR_ROM_PATH=/Users/you/Downloads/PokemonRed.gb
   ```
   (Use your real path—do not use the literal `/path/to/your/PokemonRed.gb`.)

3. **(Recommended)** Use an init state so the game skips the intro. When an agent starts a new session, the emulator injects the **player name** and **rival name**, and when using the “after Oak’s parcel” state it applies the chosen **starter** (Bulbasaur, Charmander, or Squirtle). The game then starts next to Professor Oak with Pokédex and starter ready.

   **Option A — Start after Oak’s parcel** (recommended; like PokemonRedExperiments): the game starts in Oak’s lab with Pokédex obtained and one starter in the party. Place `has_pokedex.state` in **emulator/rom/** (or `emulator/`); the server will use it automatically (no env var needed). Or set `EMULATOR_INIT_STATE` to its path.

   ```bash
   curl -sL -o emulator/rom/has_pokedex.state "https://raw.githubusercontent.com/PWhiddy/PokemonRedExperiments/master/has_pokedex.state"
   # No export needed: server auto-uses has_pokedex.state when present in emulator/rom/ or emulator/
   ```

   When starting a session, the client can send `starter: "bulbasaur" | "charmander" | "squirtle"`. If the client does not send a starter, the emulator uses `EMULATOR_DEFAULT_STARTER` (default `charmander`) so the session always has a valid party.

   **Option B — Start in the house** (intro + name entry skipped, but you still do the parcel run): use `init.state` from PokemonRedExperiments and set the env var:

   ```bash
   curl -sL -o init.state "https://raw.githubusercontent.com/PWhiddy/PokemonRedExperiments/master/init.state"
   export EMULATOR_INIT_STATE=emulator/init.state
   ```

   **Option C — Your own .state:** Set `EMULATOR_INIT_STATE` to any `.state` with the player past the intro. Names (and optionally starter when the state is “after Oak’s parcel”) are injected at session start.

   **Important:** If you change the init state (e.g. switch from `init.state` to `has_pokedex.state`), restart the emulator so new sessions use the new state.

## Run

From the **project root** (the folder that contains `emulator/`):

```bash
cd emulator
uvicorn server:app --host 0.0.0.0 --port 8765
```

To start **after Oak's parcel**, place `has_pokedex.state` in **emulator/rom/** (or `emulator/`; see Setup step 3), then run the server. No env var is required; the server auto-uses `has_pokedex.state` when present. To use a different init state or path, set `EMULATOR_INIT_STATE` before starting.

**Playback speed:** When starting a session, the agent can pass `speed`: `0` or `"unlimited"` = run as fast as possible (no frame limit), `1` = real-time, `2` = 2×, `4` = 4×. Default is **unlimited** so the game doesn’t feel laggy when the emulator is ticking. Any perceived slowness is usually from the agent sending one action at a time with long think time between; use `POST /session/{id}/actions` with a sequence (e.g. many `"a"` to skip dialogue) for fast playback.

**If you see "address already in use" (port 8765):** an old emulator is still running. Stop it, then start again:

```bash
# In the emulator directory:
./stop.sh
# Or manually: kill $(lsof -t -i:8765)
uvicorn server:app --host 0.0.0.0 --port 8765
```

**Important:** Set `EMULATOR_ROM_PATH` only to the real path of your ROM file. If unset, the server looks for `PokemonRed.gb` in `emulator/rom/`, `emulator/`, and the project root.

### ROM IDs (map and item)

Map IDs and item IDs used by the app and RL agent are defined in **`emulator/game_state.py`** so they match the ROM you run:

- **Map ID**: byte at WRAM address `0xD35E` (MAP_N_ADDRESS) when the player is in a location. `MAP_NAMES` and `PHASE1_MAP_BONUSES` use these numeric IDs. They must match **your** ROM (e.g. `emulator/rom/PokemonRed.gb`).
- **Item ID**: inventory at `0xD31E+` stores (item_id, quantity). Poké Ball = 4 (`ITEM_ID_POKEBALL`). See Bulbapedia / pret for the full list.

To verify map IDs for your ROM, run the emulator, move the player to a location, and call `GET /api/game/emulator/state` (or use `game_state.get_game_state(pyboy)` in a script); the `mapId` value is what the ROM reports. If a location shows a different id, add or correct it in `game_state.MAP_NAMES` and, for stage-1, in `PHASE1_MAP_BONUSES`.

The Next.js app expects the emulator at `http://127.0.0.1:8765` by default. Override with `EMULATOR_URL` in `.env` (e.g. `EMULATOR_URL=http://localhost:8765`).

## Production (Railway) — ROM image

To deploy the emulator with the ROM included (keeps the ROM out of the repo): place `PokemonRed.gb` in **emulator/rom/**, build with `emulator/Dockerfile.rom`, and push to GHCR or Docker Hub. See [docs/RAILWAY.md](../docs/RAILWAY.md#rom-image-option-a--recommended) for full steps.

## Name bypass

The main character name and rival name are set automatically so agents don't have to type them:

- **Player name**: Sent when starting a session (`player_name` in the start body). The Next.js API uses the agent's display name (or profile name), or "Agent" if none.
- **Rival name**: Always set to `"Rival"`.

Names are written to Pokémon Red WRAM (player at 0xD158, rival at 0xD34A). They are injected at session start and re-injected after each step while the party is still empty, so the game shows the correct names even if it overwrites them during the name-entry screens.

## API (internal)

The service exposes:

- `POST /session/start` — body: `{ "agent_id", "player_name"?, "starter"?, "speed"?, "initial_state_base64"? }` — create a session. Names are injected; when the init state is “after Oak’s parcel” (e.g. `has_pokedex.state`), `starter` is applied (or `EMULATOR_DEFAULT_STARTER` if omitted). Response may include `init_state` and `starter` so the client knows what was used. If `initial_state_base64` is set, that save is loaded instead of the init state.
- `GET /session/{agent_id}/state/export` — returns current PyBoy save state as raw bytes (used by the Next.js app to store saves).
- `POST /session/{agent_id}/step` — body: `{ "action": "up"|... }`.
- `GET /session/{agent_id}/frame` — returns current screen as PNG.
- `POST /session/{agent_id}/stop` — close session.
- `GET /sessions` — returns `{ "agent_ids": [...] }`.

Agents use the Next.js routes (`/api/game/emulator/start`, `/api/game/emulator/save`, `/api/game/emulator/saves`, etc.); observers use `/api/observe/emulator/sessions` and `/api/observe/emulator/frame?agentId=...`.

## Session lifecycle (recommended)

If you are building your own agent, follow the lifecycle guide:

- `docs/EMULATOR_SESSION_LIFECYCLE.md`

Key points:

- Use `POST /api/game/emulator/start` with `mode: "new" | "load" | "restart"` so “restart from scratch” is unambiguous.
- Expect sessions to be cleaned up server-side when idle; on 404 from `step/actions`, call `start(mode="restart")` and retry once.
