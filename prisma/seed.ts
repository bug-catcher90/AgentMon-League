import { PrismaClient } from "@prisma/client";
import path from "path";
import { hashApiKey } from "../src/lib/auth";
import { writeModelBlob, writeDatasetBlob } from "../src/lib/published-storage";

// Load content pack from project root
process.env.CONTENT_PACK_ID = process.env.CONTENT_PACK_ID || "original-pack";
const PACK_DIR = path.join(process.cwd(), "content-packs", process.env.CONTENT_PACK_ID);

function loadJson<T>(filename: string): T {
  const fs = require("fs");
  const raw = fs.readFileSync(path.join(PACK_DIR, filename), "utf-8");
  return JSON.parse(raw) as T;
}

interface MapRegion {
  terrain: string;
  encounterTableId: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface MapConfig {
  width: number;
  height: number;
  regions: Record<string, MapRegion>;
  spawn: { x: number; y: number };
  gyms: { badgeId: string; cityName: string; name: string; x: number; y: number }[];
}

function buildMapTiles(config: MapConfig): Record<string, { terrain: string; region: string; encounterTableId: string | null; interactableId: string | null }> {
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

const prisma = new PrismaClient();

async function main() {
  const mapConfig = loadJson<MapConfig>("map.json");
  const mapData = { tiles: buildMapTiles(mapConfig) };

  let world = await prisma.world.findFirst();
  if (world) {
    world = await prisma.world.update({
      where: { id: world.id },
      data: { mapData, width: mapConfig.width, height: mapConfig.height },
    });
  } else {
    world = await prisma.world.create({
      data: {
        name: "Kanto",
        width: mapConfig.width,
        height: mapConfig.height,
        mapData,
      },
    });
  }

  console.log("World seeded:", world.id);

  for (const gym of mapConfig.gyms) {
    const existing = await prisma.gym.findFirst({ where: { worldId: world.id, badgeId: gym.badgeId } });
    if (existing) {
      await prisma.gym.update({
        where: { id: existing.id },
        data: { x: gym.x, y: gym.y, name: gym.name, cityName: gym.cityName },
      });
    } else {
      await prisma.gym.create({
        data: {
          worldId: world.id,
          name: gym.name,
          cityName: gym.cityName,
          badgeId: gym.badgeId,
          x: gym.x,
          y: gym.y,
          region: "kanto",
        },
      });
    }
  }
  console.log("8 Gyms seeded.");

  // Template agent: first on platform with published RL model + dataset for others to use
  const templateDisplayName = "AgentMon Genesis";
  let templateAgent = await prisma.agent.findFirst({
    where: { displayName: templateDisplayName },
    include: { publishedModels: true, publishedDatasets: true },
  });
  if (!templateAgent) {
    const templateKey =
      process.env.TEMPLATE_AGENT_KEY ?? "alm_template_key_do_not_use_in_production";
    const { hash, prefix } = await hashApiKey(templateKey);
    templateAgent = await prisma.agent.create({
      data: {
        displayName: templateDisplayName,
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
      },
      include: { publishedModels: true, publishedDatasets: true },
    });
    await prisma.agentProfile.create({
      data: {
        agentId: templateAgent.id,
        name: templateDisplayName,
      },
    });
    const key =
      process.env.TEMPLATE_AGENT_KEY ?? "alm_template_key_do_not_use_in_production";
    console.log("Template agent created:", templateAgent.id);
    console.log("  To play as AgentMon Genesis, set in test-agents/.env:");
    console.log("  AGENT_ID=" + templateAgent.id);
    console.log("  AGENT_KEY=" + key);
  } else {
    console.log("Template agent already exists:", templateAgent.id);
    const key =
      process.env.TEMPLATE_AGENT_KEY ?? "alm_template_key_do_not_use_in_production";
    console.log("  To play as AgentMon Genesis, set in test-agents/.env:");
    console.log("  AGENT_ID=" + templateAgent.id);
    console.log("  AGENT_KEY=" + key);
  }

  // Ensure template agent has at least one model and one dataset (so it always serves as reference)
  if (templateAgent.publishedModels.length === 0) {
    const minimalZip = Buffer.from([
      0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const modelRecord = await prisma.publishedModel.create({
      data: {
        agentId: templateAgent.id,
        label: "hard_learner",
        version: "1.0",
        description: "Placeholder RL checkpoint (minimal zip). Replace by training and uploading your own.",
        storageKey: "",
        byteSize: minimalZip.length,
      },
    });
    const modelKey = await writeModelBlob(templateAgent.id, modelRecord.id, minimalZip);
    await prisma.publishedModel.update({
      where: { id: modelRecord.id },
      data: { storageKey: modelKey },
    });
    console.log("Template model published:", modelRecord.id);
  }
  if (templateAgent.publishedDatasets.length === 0) {
    const emptyJsonl = Buffer.from("", "utf-8");
    const datasetRecord = await prisma.publishedDataset.create({
      data: {
        agentId: templateAgent.id,
        label: "starter_dataset",
        version: "1.0",
        description: "Placeholder training dataset. Replace with your own experience replay or trajectories.",
        format: "jsonl",
        storageKey: "",
        byteSize: 0,
      },
    });
    const datasetKey = await writeDatasetBlob(templateAgent.id, datasetRecord.id, emptyJsonl);
    await prisma.publishedDataset.update({
      where: { id: datasetRecord.id },
      data: { storageKey: datasetKey },
    });
    console.log("Template dataset published:", datasetRecord.id);
  }

  // 11 seasons: first catch (beyond starter), badges 1-8, Elite Four, complete dex
  // Season 1 = first_to_catch_n 2 so the starter alone doesn't end it (starter counts as 1 owned).
  const SEASONS: { number: number; name: string; description: string; goalKind: string; goalValue: number }[] = [
    { number: 1, name: "First Pokémon Catch", description: "First agent to catch a Pokémon beyond the starter", goalKind: "first_to_catch_n", goalValue: 2 },
    { number: 2, name: "1st Badge", description: "First agent to earn the Boulder Badge", goalKind: "first_to_badges_n", goalValue: 1 },
    { number: 3, name: "2nd Badge", description: "First agent to earn the Cascade Badge", goalKind: "first_to_badges_n", goalValue: 2 },
    { number: 4, name: "3rd Badge", description: "First agent to earn the Thunder Badge", goalKind: "first_to_badges_n", goalValue: 3 },
    { number: 5, name: "4th Badge", description: "First agent to earn the Rainbow Badge", goalKind: "first_to_badges_n", goalValue: 4 },
    { number: 6, name: "5th Badge", description: "First agent to earn the Soul Badge", goalKind: "first_to_badges_n", goalValue: 5 },
    { number: 7, name: "6th Badge", description: "First agent to earn the Marsh Badge", goalKind: "first_to_badges_n", goalValue: 6 },
    { number: 8, name: "7th Badge", description: "First agent to earn the Volcano Badge", goalKind: "first_to_badges_n", goalValue: 7 },
    { number: 9, name: "8th Badge", description: "First agent to earn the Earth Badge", goalKind: "first_to_badges_n", goalValue: 8 },
    { number: 10, name: "Elite Four", description: "First agent to reach the Elite Four (8 badges)", goalKind: "first_to_badges_n", goalValue: 8 },
    { number: 11, name: "Complete Dex", description: "First agent to catch all 151 Pokémon", goalKind: "first_to_catch_n", goalValue: 151 },
  ];

  for (const s of SEASONS) {
    const status = s.number === 1 ? "active" : "pending";
    await prisma.season.upsert({
      where: { number: s.number },
      create: { number: s.number, name: s.name, description: s.description, goalKind: s.goalKind, goalValue: s.goalValue, status },
      update: { name: s.name, description: s.description, goalKind: s.goalKind, goalValue: s.goalValue, status },
    });
  }
  console.log("11 seasons seeded.");

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
