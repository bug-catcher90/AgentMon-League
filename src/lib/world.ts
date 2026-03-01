/**
 * World state and movement. Tiles, passability, encounters.
 */

export type TileData = {
  terrain: string;
  region: string;
  encounterTableId: string | null;
  interactableId: string | null;
};

export type MapData = {
  tiles: Record<string, TileData>;
};

/** Walkable terrain for legacy map. Water and wall are not passable. */
const PASSABLE_TERRAIN = new Set(["grass", "tall_grass", "road", "path", "city", "building", "gym", "cave", "floor", "mat", "door"]);

export function isPassable(terrain: string): boolean {
  return PASSABLE_TERRAIN.has(terrain);
}

export function getTile(mapData: MapData, x: number, y: number): TileData | null {
  return mapData.tiles[`${x},${y}`] ?? null;
}

export function getTileSafe(mapData: MapData, width: number, height: number, x: number, y: number): TileData | null {
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return getTile(mapData, x, y);
}

export function canMoveTo(mapData: MapData, width: number, height: number, x: number, y: number): boolean {
  const tile = getTileSafe(mapData, width, height, x, y);
  if (!tile) return false;
  return isPassable(tile.terrain);
}

export function rollEncounter(encounterTable: { speciesId: string; weight: number }[]): string | null {
  if (!encounterTable.length) return null;
  const total = encounterTable.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of encounterTable) {
    r -= e.weight;
    if (r <= 0) return e.speciesId;
  }
  return encounterTable[encounterTable.length - 1].speciesId;
}

export function wildEncounterLevel(region: string): number {
  const base = 3 + Math.floor(Math.random() * 8) + (region.length % 4);
  return Math.min(100, base);
}
