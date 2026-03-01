/**
 * Sync game data from PokeAPI v2 into content-packs/original-pack.
 * Run: npx tsx scripts/sync-pokeapi.ts
 * Output: species.json, moves.json, encounters.json, items.json (and sprites in species).
 */

import fs from "fs";
import path from "path";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const OUT_DIR = path.join(process.cwd(), "content-packs", "original-pack");
const GEN1_LIMIT = 151;
const VERSION_GROUP_RED_BLUE = "red-blue";

type PokeAPIResource = { name: string; url: string };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Species ---
interface PokeAPIStat { base_stat: number; stat: { name: string } }
interface PokeAPIType { type: { name: string } }
interface PokeAPIMove { move: { name: string }; version_group_details: { level_learned_at: number; version_group: { name: string } }[] }
interface PokeAPIPokemon {
  id: number;
  name: string;
  stats: PokeAPIStat[];
  types: PokeAPIType[];
  past_types?: { generation: { name: string }; types: PokeAPIType[] }[];
  moves: PokeAPIMove[];
  sprites: {
    front_default?: string | null;
    back_default?: string | null;
    other?: { "official-artwork"?: { front_default?: string } };
    versions?: {
      "generation-i"?: {
        "red-blue"?: { front_default?: string; back_default?: string };
      };
    };
  };
}

function mapSpecies(api: PokeAPIPokemon): { id: string; name: string; types: string[]; base: Record<string, number>; moves: string[]; spriteFront?: string; spriteBack?: string } {
  const stats: Record<string, number> = {};
  for (const s of api.stats) {
    const name = s.stat.name.replace("-", "_");
    stats[name] = s.base_stat;
  }
  // Gen1 special = single special stat; use special_attack or average
  const special = stats.special_attack ?? Math.floor(((stats.special_attack ?? 0) + (stats.special_defense ?? 0)) / 2) ?? 50;
  const base = {
    hp: stats.hp ?? 50,
    attack: stats.attack ?? 50,
    defense: stats.defense ?? 50,
    speed: stats.speed ?? 50,
    special,
  };

  // Prefer Gen1 types from past_types for generation-i
  let types = api.types.map((t) => t.type.name);
  const pastGen1 = api.past_types?.find((p) => p.generation.name === "generation-i");
  if (pastGen1?.types?.length) types = pastGen1.types.map((t) => t.type.name);

  const redBlueMoves = api.moves
    .flatMap((m) => m.version_group_details.filter((vd) => vd.version_group.name === VERSION_GROUP_RED_BLUE).map((vd) => ({ name: m.move.name, level: vd.level_learned_at })))
    .sort((a, b) => b.level - a.level); // desc: highest level first
  const seen = new Set<string>();
  const moveIds: string[] = [];
  for (const m of redBlueMoves) {
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    moveIds.push(m.name);
    if (moveIds.length >= 8) break;
  }
  moveIds.reverse(); // so slice(0,4) in battle gives earlier moves

  const spriteFront = api.sprites.versions?.["generation-i"]?.["red-blue"]?.front_default
    ?? api.sprites.other?.["official-artwork"]?.front_default
    ?? api.sprites.front_default
    ?? undefined;
  const spriteBack = api.sprites.versions?.["generation-i"]?.["red-blue"]?.back_default
    ?? api.sprites.back_default
    ?? undefined;

  const name = api.name.charAt(0).toUpperCase() + api.name.slice(1).replace(/-/g, " ");
  return {
    id: api.name,
    name,
    types,
    base,
    moves: moveIds,
    spriteFront: spriteFront ?? undefined,
    spriteBack: spriteBack ?? undefined,
  };
}

// --- Moves ---
interface PokeAPIMoveDetail {
  id: number;
  name: string;
  type: { name: string };
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  damage_class: { name: string };
}

function mapMove(api: PokeAPIMoveDetail): { id: string; name: string; type: string; power: number; accuracy: number; pp: number; category: "physical" | "special" | "status" } {
  const category = api.damage_class.name === "status" ? "status" : api.damage_class.name === "special" ? "special" : "physical";
  const name = api.name.replace(/-/g, " ").toUpperCase();
  return {
    id: api.name,
    name,
    type: api.type.name,
    power: api.power ?? 0,
    accuracy: api.accuracy ?? 100,
    pp: api.pp ?? 35,
    category,
  };
}

// --- Encounters: our encounterTableId -> PokeAPI location-area names (substring match or explicit) ---
const ENCOUNTER_MAPPING: Record<string, string[]> = {
  route_1_grass: ["kanto-route-1"],
  route_2_grass: ["kanto-route-2", "route-2"],
  viridian_forest: ["viridian-forest"],
  route_3_grass: ["kanto-route-3", "route-3"],
  route_4_grass: ["kanto-route-4", "route-4"],
  route_22_grass: ["kanto-route-22", "route-22"],
  tall_grass_common: ["kanto-route-1", "kanto-route-2"],
  cave: ["mt-moon", "rock-tunnel", "digletts-cave", "victory-road"],
  water: ["kanto-route-19", "kanto-route-20", "kanto-route-21", "seafoam-islands", "cerulean-cave"],
  default_grass: ["kanto-route-1", "kanto-route-2", "kanto-route-3"],
};

interface PokeAPILocationArea {
  id: number;
  name: string;
  location: { name: string };
  pokemon_encounters: {
    pokemon: { name: string };
    version_details: { version: { name: string }; max_chance: number; encounter_details: { chance: number; min_level: number; max_level: number }[] }[];
  }[];
}

function buildEncounterTable(encounters: { speciesId: string; weight: number }[]): { speciesId: string; weight: number }[] {
  const sum = encounters.reduce((a, e) => a + e.weight, 0);
  if (sum === 0) return encounters;
  return encounters.map((e) => ({ speciesId: e.speciesId, weight: e.weight }));
}

// --- Items: effect mapping for common items ---
const ITEM_EFFECT_MAP: Record<string, { effect: string; value?: number; status?: string; captureRate?: number }> = {
  potion: { effect: "heal", value: 20 },
  "super-potion": { effect: "heal", value: 50 },
  "hyper-potion": { effect: "heal", value: 200 },
  "max-potion": { effect: "heal", value: 999 },
  antidote: { effect: "cure", status: "poison" },
  "paralyze-heal": { effect: "cure", status: "paralysis" },
  "burn-heal": { effect: "cure", status: "burn" },
  "ice-heal": { effect: "cure", status: "freeze" },
  awakening: { effect: "cure", status: "sleep" },
  "full-heal": { effect: "cure", status: "all" },
  "poke-ball": { effect: "capture", captureRate: 1 },
  "great-ball": { effect: "capture", captureRate: 1.5 },
  "ultra-ball": { effect: "capture", captureRate: 2 },
  "master-ball": { effect: "capture", captureRate: 255 },
};

interface PokeAPIItem {
  id: number;
  name: string;
  effect_entries: { short_effect: string; language: { name: string } }[];
}

function mapItem(api: PokeAPIItem): { id: string; name: string; effect: string; value?: number; status?: string; captureRate?: number; description?: string } {
  const effectMap = ITEM_EFFECT_MAP[api.name] ?? { effect: "other" };
  const desc = api.effect_entries?.find((e) => e.language.name === "en")?.short_effect ?? "";
  const name = api.name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return {
    id: api.name,
    name,
    effect: effectMap.effect,
    value: effectMap.value,
    status: effectMap.status,
    captureRate: effectMap.captureRate,
    description: desc || undefined,
  };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("Fetching Pokémon list...");
  const list = await fetchJson<{ results: PokeAPIResource[] }>(`${POKEAPI_BASE}/pokemon?limit=${GEN1_LIMIT}`);
  await delay(200);

  const speciesOut: ReturnType<typeof mapSpecies>[] = [];
  const moveIds = new Set<string>();

  for (let i = 0; i < list.results.length; i++) {
    const p = list.results[i];
    process.stdout.write(`\rPokémon ${i + 1}/${list.results.length} (${p.name})...`);
    const mon = await fetchJson<PokeAPIPokemon>(p.url);
    const mapped = mapSpecies(mon);
    speciesOut.push(mapped);
    mapped.moves.forEach((id) => moveIds.add(id));
    await delay(120);
  }
  console.log("");

  console.log("Fetching moves...");
  const movesOut: ReturnType<typeof mapMove>[] = [];
  const moveArr = [...moveIds];
  for (let i = 0; i < moveArr.length; i++) {
    const id = moveArr[i];
    process.stdout.write(`\rMove ${i + 1}/${moveArr.length} (${id})...`);
    try {
      const move = await fetchJson<PokeAPIMoveDetail>(`${POKEAPI_BASE}/move/${id}`);
      movesOut.push(mapMove(move));
    } catch {
      // skip if move not found
    }
    await delay(100);
  }
  console.log("");

  // Encounters: fetch location-areas from region Kanto (id 1)
  console.log("Fetching Kanto locations and encounter data...");
  const region = await fetchJson<{ locations: PokeAPIResource[] }>(`${POKEAPI_BASE}/region/1`);
  await delay(200);
  const areaNames: string[] = [];
  const areaEncounters: Map<string, { speciesId: string; weight: number }[]> = new Map();

  for (const loc of region.locations) {
    const location = await fetchJson<{ areas: PokeAPIResource[] }>(loc.url);
    await delay(100);
    for (const area of location.areas || []) {
      areaNames.push(area.name);
      try {
        const areaData = await fetchJson<PokeAPILocationArea>(area.url);
        const redBlue = areaData.pokemon_encounters.flatMap((pe) =>
          pe.version_details
            .filter((vd) => vd.version.name === "red" || vd.version.name === "blue")
            .flatMap((vd) =>
              vd.encounter_details.map((ed) => ({
                speciesId: pe.pokemon.name,
                weight: (ed.chance ?? vd.max_chance) * (vd.max_chance / 100),
              }))
            )
        );
        if (redBlue.length) {
          const key = areaData.name;
          const existing = areaEncounters.get(key) ?? [];
          const bySpecies = new Map<string, number>();
          for (const e of [...existing, ...redBlue]) {
            bySpecies.set(e.speciesId, (bySpecies.get(e.speciesId) ?? 0) + e.weight);
          }
          areaEncounters.set(key, [...bySpecies.entries()].map(([speciesId, weight]) => ({ speciesId, weight: Math.round(weight) })));
        }
      } catch {
        // skip
      }
      await delay(100);
    }
  }

  const encountersOut: Record<string, { speciesId: string; weight: number }[]> = {};
  for (const [ourId, patterns] of Object.entries(ENCOUNTER_MAPPING)) {
    const combined: Map<string, number> = new Map();
    for (const [areaName, entries] of areaEncounters) {
      const an = areaName.toLowerCase();
      if (patterns.some((p) => an.includes(p.toLowerCase().replace(/\s/g, "-")))) {
        for (const e of entries) {
          combined.set(e.speciesId, (combined.get(e.speciesId) ?? 0) + e.weight);
        }
      }
    }
    if (combined.size) {
      encountersOut[ourId] = buildEncounterTable([...combined.entries()].map(([speciesId, weight]) => ({ speciesId, weight })));
    }
  }
  // Fallback: keep existing encounters for keys we didn't get from API
  const existingEncountersPath = path.join(OUT_DIR, "encounters.json");
  if (fs.existsSync(existingEncountersPath)) {
    const existing = JSON.parse(fs.readFileSync(existingEncountersPath, "utf-8")) as Record<string, { speciesId: string; weight: number }[]>;
    for (const key of Object.keys(existing)) {
      if (!encountersOut[key]) encountersOut[key] = existing[key];
    }
  }

  console.log("Fetching items...");
  const itemIds = Object.keys(ITEM_EFFECT_MAP);
  const itemsOut: ReturnType<typeof mapItem>[] = [];
  for (const id of itemIds) {
    try {
      const item = await fetchJson<PokeAPIItem>(`${POKEAPI_BASE}/item/${id}`);
      itemsOut.push(mapItem(item));
      await delay(100);
    } catch {
      // use placeholder
      itemsOut.push({
        id,
        name: id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        effect: ITEM_EFFECT_MAP[id].effect,
        ...ITEM_EFFECT_MAP[id],
      });
    }
  }
  // Merge with existing items that we don't have in map (e.g. from current pack)
  const existingItemsPath = path.join(OUT_DIR, "items.json");
  if (fs.existsSync(existingItemsPath)) {
    const existing = JSON.parse(fs.readFileSync(existingItemsPath, "utf-8")) as { id: string; name: string; effect: string }[];
    const have = new Set(itemsOut.map((i) => i.id));
    for (const i of existing) {
      if (!have.has(i.id)) itemsOut.push(i as ReturnType<typeof mapItem>);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, "species.json"), JSON.stringify(speciesOut, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "moves.json"), JSON.stringify(movesOut, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "encounters.json"), JSON.stringify(encountersOut, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "items.json"), JSON.stringify(itemsOut, null, 2));
  console.log("Wrote species.json, moves.json, encounters.json, items.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
