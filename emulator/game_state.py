"""
Pokémon Red RAM addresses for game state (from datacrystal.romhacking & PokemonRedExperiments).
PyBoy 2.x: read via pyboy.memory[addr].
"""

# Player position (overworld tile).
# Empirically: in PyBoy/this ROM, D362 changes on north/south movement, D361 on east/west.
# We report (x, y) so that "up" decreases y and "left" decreases x; so x=D361, y=D362.
# (Data Crystal documents D361=Y, D362=X; observed movement matches the opposite.)
X_POS_ADDRESS = 0xD361
Y_POS_ADDRESS = 0xD362
MAP_N_ADDRESS = 0xD35E

# Badges (1 byte, bits 0-7 = 8 badges)
BADGE_COUNT_ADDRESS = 0xD356

# Battle: 0 = no battle, 1 = wild, 2 = trainer (datacrystal: D057 Type of battle)
IS_IN_BATTLE_ADDRESS = 0xD057

# Pokedex: 19 bytes each (151 Pokémon), count set bits
POKEDEX_OWNED_START = 0xD2F7
POKEDEX_SEEN_START = 0xD30A
POKEDEX_BYTES = 19

# Names (English WRAM: datacrystal / pret pokered)
# Player name: 11 bytes; rival: 11 bytes (NAME_LENGTH in Gen 1)
PLAYER_NAME_START = 0xD158
RIVAL_NAME_START = 0xD34A
NAME_LENGTH = 11
NAME_END = 0x50  # Gen 1 string terminator

# Party: D163 = count. Species can be in short list (D164–D169) or at start of each 44-byte struct (D16B, D197, …).
PARTY_SIZE_ADDRESS = 0xD163
PARTY_SPECIES_LIST_BASE = 0xD164  # D164–D169 = one byte per slot (some ROMs use different values here)
PARTY_MON1_STRUCT = 0xD16B  # First byte of first Pokémon's 44-byte struct = species (standard in Gen 1)
PARTY_STRUCT_STRIDE = 44
# Starter species: ROM party-struct species byte values for this Pokémon Red ROM.
# These must match GEN1_ROM_SPECIES_TO_ID and the frontend getGen1RomOffsetToSpeciesIdMap:
#   153 = bulbasaur, 176 = charmander, 177 = squirtle.
STARTER_SPECIES = {"bulbasaur": 153, "charmander": 176, "squirtle": 177}

# ROM species byte → canonical species id (corrected mapping for Pokémon Red ROM)
# Format: ROM byte value (from party/memory) → lowercase species id.
GEN1_ROM_SPECIES_OFFSET = 173  # kept for reference; actual mapping is direct below

# Tile map: on-screen buffer (20 cols x 18 rows), Data Crystal
TILE_MAP_BUFFER = 0xC3A0
SCREEN_TILE_WIDTH = 20
SCREEN_TILE_HEIGHT = 18
# Player is typically at center of screen (view scrolls with player)
PLAYER_SCREEN_TILE_X = 10
PLAYER_SCREEN_TILE_Y = 9

# Sprite state: 16 sprites x 16 bytes each. C100-C1FF = State1, C200-C2FF = State2. Player = sprite 0.
SPRITE_STATE1_BASE = 0xC100
SPRITE_STATE2_BASE = 0xC200
SPRITE_STRUCT_SIZE = 0x10
# State1: +0 picture ID, +9 facing (0=down,4=up,8=left,0xC=right)
# State2: +4 Y grid (2x2 steps), +5 X grid
SPRITE_OFFSET_PICTURE_ID = 0
SPRITE_OFFSET_FACING = 9
SPRITE_OFFSET_GRID_Y = 4
SPRITE_OFFSET_GRID_X = 5
SPRITE_OFFSET_MOVEMENT = 6  # 0xff = not moving, 0xfe = random

# Tileset: grass tile ID for current map (for classifying tiles)
GRASS_TILE_ADDRESS = 0xD535

# Inventory: D31D = number of items, D31E+ = pairs (item_id, quantity), 20 slots max
NUM_ITEMS_ADDRESS = 0xD31D
ITEM_PAIRS_START = 0xD31E
ITEM_SLOT_SIZE = 2
MAX_ITEMS = 20

# Event flags (PokemonRedExperiments v2 range)
EVENT_FLAGS_START = 0xD747
EVENT_FLAGS_END = 0xD87E  # exclusive in Python slice; 0xD87D is last byte

# Party levels (Data Crystal: D18C, D1B8, D1E4, D210, D23C, D268)
PARTY_LEVEL_ADDRESSES = [0xD18C, 0xD1B8, 0xD1E4, 0xD210, 0xD23C, 0xD268]
MAX_PARTY_SIZE = 6

# Gen 1 internal index (1-151) to lowercase species id for profile/API (national dex order)
_GEN1_SPECIES_NAMES = (
    ["", "bulbasaur", "ivysaur", "venusaur", "charmander", "charmeleon", "charizard", "squirtle", "wartortle", "blastoise",
     "caterpie", "metapod", "butterfree", "weedle", "kakuna", "beedrill", "pidgey", "pidgeotto", "pidgeot", "rattata",
     "raticate", "spearow", "fearow", "ekans", "arbok", "pikachu", "raichu", "sandshrew", "sandslash", "nidoran-f",
     "nidorina", "nidoqueen", "nidoran-m", "nidorino", "nidoking", "clefairy", "clefable", "vulpix", "ninetales", "jigglypuff",
     "wigglytuff", "zubat", "golbat", "oddish", "gloom", "vileplume", "paras", "parasect", "venonat", "venomoth",
     "diglett", "dugtrio", "meowth", "persian", "psyduck", "golduck", "mankey", "primeape", "growlithe", "arcanine",
     "poliwag", "poliwhirl", "poliwrath", "abra", "kadabra", "alakazam", "machop", "machoke", "machamp", "bellsprout",
     "weepinbell", "victreebel", "tentacool", "tentacruel", "geodude", "graveler", "golem", "ponyta", "rapidash", "slowpoke",
     "slowbro", "magnemite", "magneton", "farfetchd", "doduo", "dodrio", "seel", "dewgong", "grimer", "muk",
     "shellder", "cloyster", "gastly", "haunter", "gengar", "onix", "drowzee", "hypno", "krabby", "kingler",
     "voltorb", "electrode", "exeggcute", "exeggutor", "cubone", "marowak", "hitmonlee", "hitmonchan", "lickitung", "koffing",
     "weezing", "rhyhorn", "rhydon", "chansey", "tangela", "kangaskhan", "horsea", "seadra", "goldeen", "seaking",
     "staryu", "starmie", "mr-mime", "scyther", "jynx", "electabuzz", "magmar", "pinsir", "tauros", "magikarp",
     "gyarados", "lapras", "ditto", "eevee", "vaporeon", "jolteon", "flareon", "porygon", "omanyte", "omastar",
     "kabuto", "kabutops", "aerodactyl", "snorlax", "articuno", "zapdos", "moltres", "dratini", "dragonair", "dragonite",
     "mewtwo", "mew"]
)
GEN1_SPECIES_INDEX_TO_ID = {i: _GEN1_SPECIES_NAMES[i] for i in range(1, min(152, len(_GEN1_SPECIES_NAMES))) if _GEN1_SPECIES_NAMES[i]}

# Direct ROM species byte → canonical id (corrected mapping; e.g. 177 = squirtle, 176 = charmander).
GEN1_ROM_SPECIES_TO_ID = {
    1: "rhydon", 2: "kangaskhan", 3: "nidoran-m", 4: "clefairy", 5: "spearow", 6: "voltorb", 7: "nidoking", 8: "slowbro",
    9: "ivysaur", 10: "exeggutor", 11: "lickitung", 12: "exeggcute", 13: "grimer", 14: "gengar", 15: "nidoran-f", 16: "nidoqueen",
    17: "cubone", 18: "rhyhorn", 19: "lapras", 20: "arcanine", 21: "mew", 22: "gyarados", 23: "shellder", 24: "tentacool",
    25: "gastly", 26: "scyther", 27: "staryu", 28: "blastoise", 29: "pinsir", 30: "tangela", 34: "onix", 35: "fearow",
    36: "pidgey", 37: "slowpoke", 38: "kadabra", 39: "graveler", 40: "chansey", 41: "machoke", 42: "mr-mime", 43: "hitmonlee",
    44: "hitmonchan", 45: "arbok", 46: "parasect", 47: "psyduck", 48: "drowzee", 49: "golem", 51: "magmar", 53: "electabuzz",
    54: "magneton", 55: "koffing", 57: "mankey", 58: "seel", 59: "diglett", 60: "tauros", 64: "farfetchd", 65: "venonat",
    66: "dragonite", 70: "doduo", 71: "poliwag", 72: "jynx", 73: "moltres", 74: "articuno", 75: "zapdos", 76: "ditto",
    77: "meowth", 78: "krabby", 82: "vulpix", 83: "ninetales", 84: "pikachu", 85: "raichu", 88: "dratini", 89: "dragonair",
    90: "kabuto", 91: "kabutops", 92: "horsea", 93: "seadra", 96: "sandshrew", 97: "sandslash", 98: "omanyte", 99: "omastar",
    100: "jigglypuff", 101: "wigglytuff", 102: "eevee", 103: "flareon", 104: "jolteon", 105: "vaporeon", 106: "machop",
    107: "zubat", 108: "ekans", 109: "paras", 110: "poliwhirl", 111: "poliwrath",     112: "weedle", 113: "kakuna", 114: "beedrill",
    116: "dodrio", 117: "primeape", 118: "dugtrio", 119: "venomoth", 120: "dewgong", 123: "caterpie", 124: "metapod",
    125: "butterfree", 126: "machamp", 128: "golduck", 129: "hypno", 130: "golbat", 131: "mewtwo", 132: "snorlax", 133: "magikarp",
    136: "muk", 138: "kingler", 139: "cloyster", 141: "electrode", 142: "clefable", 144: "persian", 145: "marowak",
    147: "haunter", 148: "abra", 149: "alakazam", 150: "pidgeotto", 151: "pidgeot", 152: "starmie", 153: "bulbasaur",
    154: "venusaur",
    155: "tentacruel", 157: "goldeen", 158: "seaking", 163: "ponyta", 164: "rapidash", 165: "rattata", 166: "raticate",
    167: "nidorino", 168: "nidorina", 169: "geodude", 170: "porygon", 171: "aerodactyl", 173: "magnemite", 176: "charmander",
    177: "squirtle", 178: "charmeleon", 179: "wartortle", 180: "charizard", 185: "oddish", 186: "gloom", 187: "vileplume",
    188: "bellsprout", 189: "weepinbell", 190: "victreebel",
}

# Exploration grid size (match obs_reward COORDS_PAD*4)
EXPLORE_GRID_SIZE = 48

# Gen 1 English character encoding (Bulbapedia): 0x80='A'..0x99='Z', 0xA0='a'..0xB9='z', 0x7F=space
_GEN1_CHAR = {}
for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ"):
    _GEN1_CHAR[c] = 0x80 + i
for i, c in enumerate("abcdefghijklmnopqrstuvwxyz"):
    _GEN1_CHAR[c] = 0xA0 + i
_GEN1_CHAR[" "] = 0x7F
# Digits and common
for i, c in enumerate("0123456789"):
    _GEN1_CHAR[c] = 0xF6 + i  # 0-9 at 0xF6-0xFF in table
_GEN1_CHAR["-"] = 0xE2
_GEN1_CHAR["?"] = 0xE6
_GEN1_CHAR["!"] = 0xE7
_GEN1_CHAR["."] = 0xF2
_GEN1_CHAR[","] = 0xF3
_GEN1_CHAR["'"] = 0xE0
_GEN1_CHAR["("] = 0x9A
_GEN1_CHAR[")"] = 0x9B

# Map id -> human-readable name. Map IDs are the byte at WRAM MAP_N_ADDRESS (0xD35E)
# when the player is in that location. Values must match the ROM (e.g. emulator/rom/PokemonRed.gb).
# Source: datacrystal.romhacking.net, PokemonRedExperiments; verify with get_game_state() in each location.
MAP_NAMES = {
    0: "Pallet Town",
    1: "Viridian City",
    2: "Pewter City",
    3: "Cerulean City",
    12: "Route 1",
    13: "Route 2",
    14: "Route 3",
    15: "Route 4",
    33: "Route 22",
    37: "Red house",
    38: "Red house 2nd",
    39: "Blues house",
    40: "Oaks Lab",
    41: "Pokémon Center (Viridian)",
    42: "Poké Mart (Viridian)",
    51: "Viridian Forest",
    54: "Pewter Gym",
    55: "Pokémon Center (Pewter)",
    59: "Mt. Moon entrance",
    60: "Mt. Moon",
    68: "Pokémon Center (Route 4)",
}

# Gen 1 item index: WRAM inventory at D31E+ stores (item_id, quantity). Poké Ball = 4 (Bulbapedia / pret).
ITEM_ID_POKEBALL = 4

# Stage-1 (Pallet → Brock) RL reward: map_id -> default bonus. Only IDs present in MAP_NAMES.
# Keys are ROM map IDs (0xD35E). RL agent imports this and overrides 41/55 with REWARD_VISIT_POKECENTER, 42 with REWARD_VISIT_MART.
PHASE1_MAP_BONUSES = {
    0: 0.0,
    12: 1.0,   # Route 1
    1: 2.0,    # Viridian City
    41: 4.0,   # Pokémon Center (Viridian) — RL uses REWARD_VISIT_POKECENTER
    42: 2.0,   # Poké Mart (Viridian) — RL uses REWARD_VISIT_MART
    13: 1.5,   # Route 2
    51: 2.0,   # Viridian Forest
    2: 3.0,    # Pewter City
    55: 4.0,   # Pokémon Center (Pewter) — RL uses REWARD_VISIT_POKECENTER
    54: 5.0,   # Pewter Gym
}


def _bit_count(byte_val: int) -> int:
    return bin(byte_val).count("1")


def _tile_label(tile_id: int, grass_tile_id: int) -> str:
    """Classify tile for agent: grass, water, or unknown (passable/blocked not distinguished without collision table)."""
    if tile_id == grass_tile_id:
        return "grass"
    # Common overworld tile IDs (heuristic; may vary by tileset): water often in a range
    if 0x14 <= tile_id <= 0x17 or tile_id in (0x48, 0x49):
        return "water"
    return "unknown"


def _get_tile_at_screen(mem, row: int, col: int) -> int:
    """Tile ID at screen position (row 0..17, col 0..19). Returns 0 if out of bounds."""
    if not (0 <= row < SCREEN_TILE_HEIGHT and 0 <= col < SCREEN_TILE_WIDTH):
        return 0
    return mem[TILE_MAP_BUFFER + row * SCREEN_TILE_WIDTH + col] & 0xFF


def get_local_map(pyboy) -> dict:
    """
    WRAM-derived local view: tile under player, tile in front, 3x3 surrounding grid, NPCs.
    Only valid in overworld (not in battle/menu). Returns empty dict on error or in battle.
    """
    out = {
        "tileUnderPlayer": {"tileId": 0, "label": "unknown"},
        "tileInFrontOfPlayer": {"tileId": 0, "label": "unknown"},
        "surroundingTiles": [],  # 3x3 grid [row][col], each { "tileId", "label" }
        "npcs": [],  # list of { "gridX", "gridY", "pictureId" }
    }
    try:
        mem = pyboy.memory
        if not hasattr(mem, "__getitem__"):
            return out
        in_battle = mem[IS_IN_BATTLE_ADDRESS] & 0xFF
        if in_battle in (1, 2):
            return out
        grass_tile_id = mem[GRASS_TILE_ADDRESS] & 0xFF
        cy, cx = PLAYER_SCREEN_TILE_Y, PLAYER_SCREEN_TILE_X
        under = _get_tile_at_screen(mem, cy, cx)
        out["tileUnderPlayer"] = {"tileId": under, "label": _tile_label(under, grass_tile_id)}
        facing = mem[SPRITE_STATE1_BASE + SPRITE_OFFSET_FACING] & 0xFF
        dy, dx = 0, 0
        if facing == 0:
            dy = 1
        elif facing == 4:
            dy = -1
        elif facing == 8:
            dx = -1
        else:
            dx = 1
        front = _get_tile_at_screen(mem, cy + dy, cx + dx)
        out["tileInFrontOfPlayer"] = {"tileId": front, "label": _tile_label(front, grass_tile_id)}
        grid = []
        for r in range(-1, 2):
            row = []
            for c in range(-1, 2):
                tid = _get_tile_at_screen(mem, cy + r, cx + c)
                row.append({"tileId": tid, "label": _tile_label(tid, grass_tile_id)})
            grid.append(row)
        out["surroundingTiles"] = grid
        npcs = []
        for i in range(1, 16):
            base1 = SPRITE_STATE1_BASE + i * SPRITE_STRUCT_SIZE
            base2 = SPRITE_STATE2_BASE + i * SPRITE_STRUCT_SIZE
            pic = mem[base1 + SPRITE_OFFSET_PICTURE_ID] & 0xFF
            if pic == 0:
                continue
            gx = mem[base2 + SPRITE_OFFSET_GRID_X] & 0xFF
            gy = mem[base2 + SPRITE_OFFSET_GRID_Y] & 0xFF
            npcs.append({"gridX": int(gx), "gridY": int(gy), "pictureId": int(pic)})
        out["npcs"] = npcs
    except Exception:
        pass
    return out


def get_event_flags(pyboy) -> list:
    """Read event flags WRAM 0xD747--0xD87E (bytes). Returns list of 0/1 per bit, LSB first."""
    length_bytes = EVENT_FLAGS_END - EVENT_FLAGS_START
    out = []
    try:
        mem = pyboy.memory
        if not hasattr(mem, "__getitem__"):
            return [0] * (length_bytes * 8)
        for addr in range(EVENT_FLAGS_START, EVENT_FLAGS_END):
            b = mem[addr] & 0xFF
            for bit in range(8):
                out.append(1 if (b & (1 << bit)) else 0)
    except Exception:
        out = [0] * (length_bytes * 8)
    return out


def get_party_levels(pyboy) -> list:
    """Read party Pokémon levels from WRAM. Returns list of int levels (up to 6)."""
    out = []
    try:
        mem = pyboy.memory
        if not hasattr(mem, "__getitem__"):
            return []
        party_size = min(mem[PARTY_SIZE_ADDRESS] & 0xFF, MAX_PARTY_SIZE)
        for i in range(party_size):
            lv = mem[PARTY_LEVEL_ADDRESSES[i]] & 0xFF
            if lv == 0 or lv > 100:
                lv = 1
            out.append(int(lv))
    except Exception:
        pass
    return out


def get_party(pyboy) -> list:
    """Read party Pokémon from WRAM. Returns list of { speciesId, level } (up to 6) for profile/API.
    Reads species from the 44-byte struct (first byte per slot); falls back to D164–D169 list.
    Always sends speciesId as 'species-<byte>' so the API can resolve using the canonical ROM→id mapping."""
    out = []
    try:
        mem = pyboy.memory
        if not hasattr(mem, "__getitem__"):
            return []
        party_size = min(mem[PARTY_SIZE_ADDRESS] & 0xFF, MAX_PARTY_SIZE)
        if party_size <= 0:
            return []
        levels = get_party_levels(pyboy)
        for i in range(party_size):
            # Prefer species byte at start of each 44-byte party struct (standard Gen 1 layout)
            addr_struct = PARTY_MON1_STRUCT + i * PARTY_STRUCT_STRIDE
            addr_list = PARTY_SPECIES_LIST_BASE + i
            idx = mem[addr_struct] & 0xFF
            if not idx:
                idx = mem[addr_list] & 0xFF
            species_id = f"species-{idx}" if idx else "unknown"
            lv = levels[i] if i < len(levels) else 1
            out.append({"speciesId": species_id, "level": int(lv)})
    except Exception:
        pass
    return out


def build_exploration_grid(explored: set) -> list:
    """
    Build a COORDS_PAD*4 x COORDS_PAD*4 (48x48) grid from set of (map_id, x, y).
    Explored set contains tuples (map_id, x, y). Each cell is 0 or 1.
    """
    grid = [[0] * EXPLORE_GRID_SIZE for _ in range(EXPLORE_GRID_SIZE)]
    for (map_id, x, y) in explored:
        # Map (map_id, x, y) to a cell to spread visits across the grid
        row = (map_id * 31 + x) % EXPLORE_GRID_SIZE
        col = (map_id * 17 + y) % EXPLORE_GRID_SIZE
        grid[row][col] = 1
    return grid


def get_inventory(pyboy) -> dict:
    """Read inventory from WRAM. Returns { count, items: [ { id, quantity }, ... ] }."""
    out = {"count": 0, "items": []}
    try:
        mem = pyboy.memory
        if not hasattr(mem, "__getitem__"):
            return out
        n = min(mem[NUM_ITEMS_ADDRESS] & 0xFF, MAX_ITEMS)
        out["count"] = int(n)
        for i in range(n):
            addr = ITEM_PAIRS_START + i * ITEM_SLOT_SIZE
            item_id = mem[addr] & 0xFF
            qty = mem[addr + 1] & 0xFF
            if item_id != 0:
                out["items"].append({"id": int(item_id), "quantity": int(qty)})
    except Exception:
        pass
    return out


def get_game_state(pyboy, session_started_at: float | None = None) -> dict:
    """Read current game state from RAM. Returns a dict safe for JSON."""
    try:
        mem = pyboy.memory
        if not hasattr(mem, "__getitem__"):
            return _default_state(session_started_at)
        x = mem[X_POS_ADDRESS]
        y = mem[Y_POS_ADDRESS]
        map_id = mem[MAP_N_ADDRESS]
        party_size = mem[PARTY_SIZE_ADDRESS]
        badge_byte = mem[BADGE_COUNT_ADDRESS]
        badges = _bit_count(badge_byte)
        pokedex_owned = sum(
            _bit_count(mem[POKEDEX_OWNED_START + i]) for i in range(POKEDEX_BYTES)
        )
        pokedex_seen = sum(
            _bit_count(mem[POKEDEX_SEEN_START + i]) for i in range(POKEDEX_BYTES)
        )
        in_battle_raw = mem[IS_IN_BATTLE_ADDRESS]
        if in_battle_raw in (255, 0xFF):
            in_battle = 0
            battle_kind = "none"
        elif in_battle_raw == 1:
            in_battle = 1
            battle_kind = "wild"
        elif in_battle_raw == 2:
            in_battle = 2
            battle_kind = "trainer"
        else:
            in_battle = 0
            battle_kind = "none"
    except Exception:
        return _default_state(session_started_at)

    map_name = MAP_NAMES.get(map_id, f"Map {map_id}")
    out = {
        "mapId": int(map_id),
        "mapName": map_name,
        "x": int(x),
        "y": int(y),
        "partySize": int(party_size),
        "badges": int(badges),
        "pokedexOwned": int(pokedex_owned),
        "pokedexSeen": int(pokedex_seen),
        "inBattle": int(in_battle),
        "battleKind": battle_kind,
        "eventFlags": get_event_flags(pyboy),
        "levels": get_party_levels(pyboy),
        "party": get_party(pyboy),
    }
    if session_started_at is not None:
        import time
        out["sessionTimeSeconds"] = int(time.time() - session_started_at)
    if in_battle == 0:
        out["localMap"] = get_local_map(pyboy)
        out["inventory"] = get_inventory(pyboy)
    else:
        out["localMap"] = {"tileUnderPlayer": {}, "tileInFrontOfPlayer": {}, "surroundingTiles": [], "npcs": []}
        out["inventory"] = get_inventory(pyboy)
    return out


def _default_state(session_started_at: float | None = None) -> dict:
    event_flags_len = (EVENT_FLAGS_END - EVENT_FLAGS_START) * 8
    s = {
        "mapId": 0, "mapName": "Unknown", "x": 0, "y": 0, "partySize": 0, "badges": 0,
        "pokedexOwned": 0, "pokedexSeen": 0, "inBattle": 0, "battleKind": "none",
        "eventFlags": [0] * event_flags_len,
        "levels": [],
        "party": [],
        "localMap": {"tileUnderPlayer": {}, "tileInFrontOfPlayer": {}, "surroundingTiles": [], "npcs": []},
        "inventory": {"count": 0, "items": []},
    }
    if session_started_at is not None:
        import time
        s["sessionTimeSeconds"] = int(time.time() - session_started_at)
    return s


def compute_step_feedback(
    action: str,
    state_before: dict,
    state_after: dict,
) -> dict:
    """
    Compute what happened as a result of the last action — the same kind of
    feedback a human would get: movement, walls, battles, map changes, menus,
    dialogue, catches, badges, etc. So the agent can build memory and learn.
    Returns { "effects": list[str], "message": str }.
    """
    effects = []
    parts = []

    move_actions = ("up", "down", "left", "right")
    button_actions = ("a", "b", "start", "select")
    x_b, y_b = state_before.get("x", 0), state_before.get("y", 0)
    x_a, y_a = state_after.get("x", 0), state_after.get("y", 0)
    map_b = state_before.get("mapId")
    map_a = state_after.get("mapId")
    in_battle_b = state_before.get("inBattle", 0)
    in_battle_a = state_after.get("inBattle", 0)
    battle_kind = state_after.get("battleKind", "none")
    party_b = state_before.get("partySize", 0)
    party_a = state_after.get("partySize", 0)
    badges_b = state_before.get("badges", 0)
    badges_a = state_after.get("badges", 0)
    pokedex_owned_b = state_before.get("pokedexOwned", 0)
    pokedex_owned_a = state_after.get("pokedexOwned", 0)

    # —— Movement ——
    if action in move_actions:
        if (x_a, y_a) != (x_b, y_b):
            effects.append("moved")
            parts.append("You moved.")
        else:
            effects.append("blocked")
            effects.append("hit_wall_or_obstacle")
            parts.append("You hit a wall or could not move that way.")

    # —— Battle started ——
    if in_battle_a and not in_battle_b:
        effects.append("battle_started")
        if battle_kind == "wild":
            effects.append("wild_encounter")
            effects.append("wild_pokemon_appeared")
            parts.append("A wild Pokémon appeared!")
        else:
            effects.append("trainer_battle")
            effects.append("trainer_challenged_you")
            parts.append("A trainer wants to battle!")

    # —— Battle ended ——
    if in_battle_b and not in_battle_a:
        effects.append("battle_ended")
        battle_kind_before = state_before.get("battleKind", "none")
        if party_a > party_b:
            effects.append("caught_pokemon")
            parts.append("The battle ended. You caught a Pokémon!")
            if pokedex_owned_a > pokedex_owned_b:
                effects.append("new_pokedex_entry")
        elif badges_a > badges_b:
            effects.append("won_trainer_battle")
            effects.append("earned_badge")
            parts.append("You won the battle and earned a badge!")
        else:
            effects.append("battle_over")
            if battle_kind_before == "trainer":
                effects.append("trainer_battle_lost")
                parts.append("You lost the trainer battle.")
            else:
                effects.append("fled_from_battle")
                parts.append("You fled or the battle ended.")

    # —— Map / location change ——
    if map_a != map_b:
        effects.append("map_changed")
        new_name = state_after.get("mapName", "Unknown")
        effects.append(f"entered_{new_name.replace(' ', '_')}")
        parts.append(f"You entered {new_name}.")

    # —— Party grew outside battle (e.g. received starter, trade) ——
    if party_a > party_b and not (in_battle_b and not in_battle_a):
        effects.append("party_grew")
        effects.append("received_pokemon")
        parts.append("You received a Pokémon (e.g. from Oak or trade).")

    # —— Pokémon evolved (same party size, but a species changed in a slot) ——
    if party_a == party_b and party_a > 0 and not in_battle_a:
        party_before = state_before.get("party") or []
        party_after = state_after.get("party") or []
        if len(party_before) == len(party_after):
            for i in range(len(party_after)):
                s_b = (party_before[i] if i < len(party_before) else {}).get("speciesId")
                s_a = (party_after[i] if i < len(party_after) else {}).get("speciesId")
                if s_b and s_a and s_b != s_a:
                    effects.append("pokemon_evolved")
                    parts.append("A Pokémon evolved!")
                    break

    # —— Badge earned (not already from battle_ended) ——
    if badges_a > badges_b and "earned_badge" not in effects:
        effects.append("earned_badge")
        parts.append("You earned a new badge!")

    # —— Button actions when no other clear effect (menu / dialogue) ——
    if action in button_actions and not effects:
        if action == "start":
            effects.append("menu_opened")
            effects.append("start_menu")
            parts.append("The start menu opened (items, Pokémon, save, etc.).")
        elif action == "b":
            effects.append("cancelled")
            effects.append("closed_menu_or_back")
            parts.append("You cancelled or went back.")
        elif action == "a":
            effects.append("confirmed")
            effects.append("advanced_dialogue_or_selection")
            parts.append("You confirmed or advanced dialogue / selection.")
        elif action == "select":
            effects.append("select_pressed")
            parts.append("Select was pressed (map or context action).")

    # —— Pass ——
    if action == "pass":
        if not effects:
            effects.append("waited")
            effects.append("no_change")
            parts.append("You waited; no change (e.g. animation or transition).")

    if not effects:
        effects.append("unknown_effect")
        parts.append("Something happened that was not classified (e.g. submenu, animation).")

    return {
        "effects": effects,
        "message": " ".join(parts) if parts else "No effect detected.",
    }


def _encode_name(s: str, max_chars: int = 10) -> list:
    """Encode a string to Gen 1 name bytes (max_chars + 0x50 terminator)."""
    out = []
    s = (s or "").strip()[:max_chars]
    for c in s:
        out.append(_GEN1_CHAR.get(c, _GEN1_CHAR.get(c.upper(), 0x7F)))
    while len(out) < NAME_LENGTH:
        out.append(NAME_END)
    return out[:NAME_LENGTH]


def inject_names(pyboy, player_name: str, rival_name: str = "Rival") -> None:
    """Write player and rival names to WRAM so the game shows them (bypasses name entry)."""
    try:
        mem = pyboy.memory
        if not hasattr(mem, "__setitem__"):
            return
        player_bytes = _encode_name(player_name or "Agent")
        rival_bytes = _encode_name(rival_name[:10] if rival_name else "Rival")
        for i, b in enumerate(player_bytes):
            mem[PLAYER_NAME_START + i] = b
        for i, b in enumerate(rival_bytes):
            mem[RIVAL_NAME_START + i] = b
    except Exception:
        pass


def inject_starter(pyboy, starter: str) -> None:
    """Set the first party Pokémon species to the chosen starter (bulbasaur, charmander, squirtle).
    Use when init state is 'after Oak's parcel' and we want to pick which starter the agent has.
    Writes to both the 44-byte struct (D16B) and the species list (D164) so the game and our
    reads stay in sync regardless of which address the game uses during play."""
    try:
        key = (starter or "").strip().lower()
        species_byte = STARTER_SPECIES.get(key)
        if species_byte is None:
            return
        mem = pyboy.memory
        if hasattr(mem, "__setitem__"):
            mem[PARTY_MON1_STRUCT] = species_byte
            mem[PARTY_SPECIES_LIST_BASE] = species_byte  # D164 = species list slot 0; game may read this during battle/menu
    except Exception:
        pass
