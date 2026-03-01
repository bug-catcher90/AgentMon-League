/**
 * Content pack loader. Reads from content-packs/<CONTENT_PACK_ID>/
 */

import path from "path";
import fs from "fs";

const CONTENT_PACK_ID = process.env.CONTENT_PACK_ID || "original-pack";
const PACK_DIR = path.join(process.cwd(), "content-packs", CONTENT_PACK_ID);

export interface Species {
  id: string;
  name: string;
  types: string[];
  base: { hp: number; attack: number; defense: number; speed: number; special: number };
  moves: string[];
  /** PokeAPI/synced sprite URLs for frontend */
  spriteFront?: string;
  spriteBack?: string;
}

export interface Move {
  id: string;
  name: string;
  type: string;
  power: number;
  accuracy: number;
  pp: number;
  category: "physical" | "special" | "status";
}

export interface Item {
  id: string;
  name: string;
  effect: string;
  value?: number;
  status?: string;
  captureRate?: number;
  description?: string;
}

export interface EncounterEntry {
  speciesId: string;
  weight: number;
}

export type EncountersTable = Record<string, EncounterEntry[]>;

export interface MapRegion {
  terrain: string;
  encounterTableId: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MapConfig {
  width: number;
  height: number;
  regions: Record<string, MapRegion>;
  spawn: { x: number; y: number };
  gyms: { badgeId: string; cityName: string; name: string; x: number; y: number }[];
  regionLabels?: Record<string, string>;
  regionConnections?: [string, string][];
}

// --- Layer 1: World map (menu style - cities and routes only) ---
export interface WorldMapRegion {
  id: string;
  name: string;
  type: "city" | "route" | "cave" | "sea";
  x: number;
  y: number;
  /** Optional: position in image pixels (for romMapImage). When set, overrides x/y for overlay placement. */
  pixelX?: number;
  pixelY?: number;
}
export interface WorldMapConfig {
  description?: string;
  backgroundImage?: string | null;
  backgroundWidth?: number;
  backgroundHeight?: number;
  /** In-game Town Map from ROM (e.g. /maps/kanto_town_map.png). Preferred when set. */
  romMapImage?: string | null;
  romMapWidth?: number;
  romMapHeight?: number;
  width: number;
  height: number;
  regions: WorldMapRegion[];
}

// --- Layer 2: Area maps (pixel/block map per city, route, cave) ---
export interface AreaWarp {
  blockX: number;
  blockY: number;
  type: "region" | "interior";
  targetId: string;
  targetBlockX: number;
  targetBlockY: number;
  name?: string;
}
export interface AreaMap {
  id: string;
  name: string;
  type: string;
  widthBlocks: number;
  heightBlocks: number;
  encounterTableId: string | null;
  tiles: string[];
  warps: AreaWarp[];
}

// --- Layer 3: Interior maps (buildings: Agent Center, Mart, houses) ---
export interface InteriorWarp {
  blockX: number;
  blockY: number;
  type: "region";
  targetId: string | null;
  targetBlockX: number;
  targetBlockY: number;
  name?: string;
}
export interface InteriorMap {
  id: string;
  name: string;
  type: string;
  widthBlocks: number;
  heightBlocks: number;
  tiles: string[];
  warps: InteriorWarp[];
}

function loadJson<T>(filename: string): T {
  const filePath = path.join(PACK_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

let _species: Species[] | null = null;
let _moves: Record<string, Move> | null = null;
let _items: Record<string, Item> | null = null;
let _encounters: EncountersTable | null = null;
let _mapConfig: MapConfig | null = null;
let _areaMaps: Record<string, AreaMap> | null = null;
let _interiorMaps: Record<string, InteriorMap> | null = null;

export function getSpecies(): Species[] {
  if (!_species) _species = loadJson<Species[]>("species.json");
  return _species;
}

export function getSpeciesById(id: string): Species | undefined {
  return getSpecies().find((s) => s.id === id);
}

/** Gen 1 internal index (1–151) → species id. Content pack is in national dex order so index i+1 = dex #. */
export function getGen1IndexToSpeciesIdMap(): Record<number, string> {
  const species = getSpecies();
  const map: Record<number, string> = {};
  for (let i = 0; i < Math.min(151, species.length); i++) {
    map[i + 1] = species[i].id;
  }
  return map;
}

/**
 * ROM species byte → canonical species id (corrected mapping for Pokémon Red ROM).
 * E.g. 177 = squirtle, 176 = charmander. Used when emulator sends species-N (ROM byte value).
 */
export function getGen1RomOffsetToSpeciesIdMap(): Record<number, string> {
  return {
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
    107: "zubat", 108: "ekans", 109: "paras", 110: "poliwhirl", 111: "poliwrath", 112: "weedle", 113: "kakuna", 114: "beedrill",
    116: "dodrio", 117: "primeape", 118: "dugtrio", 119: "venomoth", 120: "dewgong", 123: "caterpie", 124: "metapod",
    125: "butterfree", 126: "machamp", 128: "golduck", 129: "hypno", 130: "golbat", 131: "mewtwo", 132: "snorlax", 133: "magikarp",
    136: "muk", 138: "kingler", 139: "cloyster", 141: "electrode", 142: "clefable", 144: "persian", 145: "marowak",
    147: "haunter", 148: "abra", 149: "alakazam", 150: "pidgeotto", 151: "pidgeot", 152: "starmie", 153: "bulbasaur",
    154: "venusaur", 155: "tentacruel", 157: "goldeen", 158: "seaking", 163: "ponyta", 164: "rapidash", 165: "rattata", 166: "raticate",
    167: "nidorino", 168: "nidorina", 169: "geodude", 170: "porygon", 171: "aerodactyl", 173: "magnemite", 176: "charmander",
    177: "squirtle", 178: "charmeleon", 179: "wartortle", 180: "charizard", 185: "oddish", 186: "gloom", 187: "vileplume",
    188: "bellsprout", 189: "weepinbell", 190: "victreebel",
  };
}

export function getMoves(): Record<string, Move> {
  if (!_moves) {
    const arr = loadJson<Move[]>("moves.json");
    _moves = Object.fromEntries(arr.map((m) => [m.id, m]));
  }
  return _moves;
}

export function getMove(id: string): Move | undefined {
  return getMoves()[id];
}

export function getItems(): Record<string, Item> {
  if (!_items) {
    const arr = loadJson<Item[]>("items.json");
    _items = Object.fromEntries(arr.map((i) => [i.id, i]));
  }
  return _items;
}

export function getItem(id: string): Item | undefined {
  return getItems()[id];
}

export function getEncounters(): EncountersTable {
  if (!_encounters) _encounters = loadJson<EncountersTable>("encounters.json");
  return _encounters;
}

export function getMapConfig(): MapConfig {
  if (!_mapConfig) _mapConfig = loadJson<MapConfig>("map.json");
  return _mapConfig;
}

export function getWorldMapConfig(): WorldMapConfig {
  // Don't cache so edits to world-map.json show up without restarting the server
  return loadJson<WorldMapConfig>("world-map.json");
}

function loadAreaMaps(): Record<string, AreaMap> {
  if (_areaMaps) return _areaMaps;
  const dir = path.join(PACK_DIR, "areas");
  if (!fs.existsSync(dir)) {
    _areaMaps = {};
    return _areaMaps;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out: Record<string, AreaMap> = {};
  for (const f of files) {
    const map = loadJson<AreaMap>(path.join("areas", f));
    out[map.id] = map;
  }
  _areaMaps = out;
  return _areaMaps;
}

export function getAreaMap(id: string): AreaMap | undefined {
  return loadAreaMaps()[id];
}

export function listAreaIds(): string[] {
  return Object.keys(loadAreaMaps());
}

function loadInteriorMaps(): Record<string, InteriorMap> {
  if (_interiorMaps) return _interiorMaps;
  const dir = path.join(PACK_DIR, "interiors");
  if (!fs.existsSync(dir)) {
    _interiorMaps = {};
    return _interiorMaps;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out: Record<string, InteriorMap> = {};
  for (const f of files) {
    const map = loadJson<InteriorMap>(path.join("interiors", f));
    out[map.id] = map;
  }
  _interiorMaps = out;
  return _interiorMaps;
}

export function getInteriorMap(id: string): InteriorMap | undefined {
  return loadInteriorMaps()[id];
}

export function listInteriorIds(): string[] {
  return Object.keys(loadInteriorMaps());
}

/** Get tile at block (x,y) for an area; returns "grass" if tiles array is empty or out of bounds */
export function getAreaTile(area: AreaMap, blockX: number, blockY: number): string {
  if (blockX < 0 || blockX >= area.widthBlocks || blockY < 0 || blockY >= area.heightBlocks) return "grass";
  const idx = blockY * area.widthBlocks + blockX;
  if (!area.tiles || area.tiles.length === 0) return "grass";
  return area.tiles[idx] ?? "grass";
}

/** Get tile at block (x,y) for an interior */
export function getInteriorTile(interior: InteriorMap, blockX: number, blockY: number): string {
  if (blockX < 0 || blockX >= interior.widthBlocks || blockY < 0 || blockY >= interior.heightBlocks) return "wall";
  const idx = blockY * interior.widthBlocks + blockX;
  return interior.tiles[idx] ?? "wall";
}

/**
 * Tile types compatible with MapGenie / Pokémon Red map representation.
 * Used for: passability, wild encounters, and display.
 */
export const TILE_TYPES = {
  /** Walkable: path, floor, doors (agent can move) */
  walkable: ["path", "floor", "mat", "door", "building_door", "counter"] as const,
  /** Grass: wild Pokémon can spawn when moving onto this tile */
  grass: ["grass", "tall_grass"] as const,
  /** Water: not passable without Surf */
  water: ["water"] as const,
  /** Wall / unpassable */
  wall: ["wall"] as const,
} as const;

export type TileTypeKind = keyof typeof TILE_TYPES;

/** Check if tile type is passable (area or interior). Walkable + grass are passable; water and wall are not. */
export function isAreaTilePassable(tileType: string): boolean {
  return [...TILE_TYPES.walkable, ...TILE_TYPES.grass].includes(tileType as never);
}

/** Check if moving onto this tile can trigger a wild encounter (grass only). */
export function isEncounterTile(tileType: string): boolean {
  return TILE_TYPES.grass.includes(tileType as never);
}

/** Build full tile grid from map config (for seeding world) */
export function buildMapTiles(): Record<string, { terrain: string; region: string; encounterTableId: string | null; interactableId: string | null }> {
  const config = getMapConfig();
  const tiles: Record<string, { terrain: string; region: string; encounterTableId: string | null; interactableId: string | null }> = {};
  const gymSet = new Set(config.gyms.map((g) => `${g.x},${g.y}`));

  for (let y = 0; y < config.height; y++) {
    for (let x = 0; x < config.width; x++) {
      const key = `${x},${y}`;
      let terrain = "grass";
      let region = "default";
      let encounterTableId: string | null = "default_grass";

      for (const [regName, reg] of Object.entries(config.regions)) {
        if (reg.x1 <= x && x <= reg.x2 && reg.y1 <= y && y <= reg.y2) {
          terrain = reg.terrain;
          region = regName;
          encounterTableId = reg.encounterTableId;
          break;
        }
      }

      let interactableId: string | null = null;
      if (gymSet.has(key)) interactableId = "gym_entrance";

      tiles[key] = { terrain, region, encounterTableId, interactableId };
    }
  }
  return tiles;
}
