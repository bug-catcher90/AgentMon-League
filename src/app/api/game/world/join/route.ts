import { NextResponse } from "next/server";
import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Layered spawn: inside Player House (Pallet Town), on the mat
const LAYERED_SPAWN = {
  regionId: "pallet_town",
  areaX: 9,
  areaY: 16,
  interiorId: "player_house",
  interiorX: 3,
  interiorY: 6,
  x: 9,
  y: 16,
};

/**
 * POST /api/game/world/join
 * Agent joins the default world. Creates or resets AgentState at spawn (Player House, Pallet Town).
 * New agents start with empty party; call POST /api/game/starter/choose to pick Bulbasaur, Charmander, or Squirtle.
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const world = await prisma.world.findFirst();
  if (!world) {
    return NextResponse.json({ error: "World not seeded" }, { status: 503 });
  }

  const existing = await prisma.agentState.findUnique({
    where: { agentId: agent.id },
  });

  if (existing) {
    await prisma.agentState.update({
      where: { agentId: agent.id },
      data: {
        worldId: world.id,
        x: LAYERED_SPAWN.x,
        y: LAYERED_SPAWN.y,
        direction: "down",
        currentMatchId: null,
        regionId: LAYERED_SPAWN.regionId,
        areaX: LAYERED_SPAWN.areaX,
        areaY: LAYERED_SPAWN.areaY,
        interiorId: LAYERED_SPAWN.interiorId,
        interiorX: LAYERED_SPAWN.interiorX,
        interiorY: LAYERED_SPAWN.interiorY,
      },
    });
  } else {
    const defaultPokedex = { seen: [] as string[], owned: [] as string[] };
    const defaultParty: unknown[] = [];
    const defaultInventory: { itemId: string; count: number }[] = [
      { itemId: "poke-ball", count: 5 },
      { itemId: "potion", count: 3 },
    ];
    await prisma.agentState.create({
      data: {
        agentId: agent.id,
        worldId: world.id,
        x: LAYERED_SPAWN.x,
        y: LAYERED_SPAWN.y,
        direction: "down",
        level: 1,
        xp: 0,
        gold: 500,
        badges: [],
        pokedex: defaultPokedex as object,
        inventory: defaultInventory as object,
        party: defaultParty as object,
        storage: [] as object,
        regionId: LAYERED_SPAWN.regionId,
        areaX: LAYERED_SPAWN.areaX,
        areaY: LAYERED_SPAWN.areaY,
        interiorId: LAYERED_SPAWN.interiorId,
        interiorX: LAYERED_SPAWN.interiorX,
        interiorY: LAYERED_SPAWN.interiorY,
      },
    });
  }

  const profile = await prisma.agentProfile.findUnique({
    where: { agentId: agent.id },
  });
  if (!profile) {
    await prisma.agentProfile.create({
      data: { agentId: agent.id, name: agent.displayName ?? `Agent-${agent.id.slice(0, 8)}` },
    });
  }

  return NextResponse.json({
    success: true,
    worldId: world.id,
    position: { regionId: LAYERED_SPAWN.regionId, areaX: LAYERED_SPAWN.areaX, areaY: LAYERED_SPAWN.areaY, interiorId: LAYERED_SPAWN.interiorId, interiorX: LAYERED_SPAWN.interiorX, interiorY: LAYERED_SPAWN.interiorY },
    message: "Joined the world. You're in the Player House (Pallet Town). Choose your starter then move.",
  });
}
