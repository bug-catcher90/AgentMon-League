import { NextResponse } from "next/server";
import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/game/world/view
 * Returns agent's current state and nearby tile info.
 */
export async function GET(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await prisma.agentState.findUnique({
    where: { agentId: agent.id },
  });

  if (!state) {
    return NextResponse.json({ error: "Not in world. Call POST /api/game/world/join first." }, { status: 400 });
  }

  const world = await prisma.world.findUnique({ where: { id: state.worldId } });
  const mapData = world?.mapData as { tiles: Record<string, unknown> } | undefined;
  const tile = mapData?.tiles?.[`${state.x},${state.y}`];

  return NextResponse.json({
    worldId: state.worldId,
    position: { x: state.x, y: state.y },
    regionId: state.regionId ?? null,
    areaX: state.areaX ?? null,
    areaY: state.areaY ?? null,
    interiorId: state.interiorId ?? null,
    interiorX: state.interiorX ?? null,
    interiorY: state.interiorY ?? null,
    direction: state.direction,
    level: state.level,
    gold: state.gold,
    badges: state.badges,
    party: state.party,
    inventory: state.inventory,
    currentTile: tile ?? null,
    currentMatchId: state.currentMatchId,
  });
}
