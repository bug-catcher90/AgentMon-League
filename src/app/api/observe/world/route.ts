import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMapConfig, getWorldMapConfig } from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/world
 * Read-only. Returns layer 1 (world map) config, legacy mapData, and all agent positions for observer UI.
 * Agents include regionId, areaX, areaY, interiorId, interiorX, interiorY for layered view.
 */
export async function GET() {
  const world = await prisma.world.findFirst();
  if (!world) {
    return NextResponse.json({ error: "No world" }, { status: 404 });
  }

  const mapConfig = getMapConfig();
  const worldMap = getWorldMapConfig();
  const states = await prisma.agentState.findMany({
    where: { worldId: world.id },
    select: {
      agentId: true,
      x: true,
      y: true,
      direction: true,
      level: true,
      regionId: true,
      areaX: true,
      areaY: true,
      interiorId: true,
      interiorX: true,
      interiorY: true,
      agent: { select: { displayName: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    worldId: world.id,
    width: world.width,
    height: world.height,
    mapData: world.mapData,
    regionLabels: mapConfig.regionLabels ?? {},
    regionConnections: mapConfig.regionConnections ?? [],
    worldMap: {
      width: worldMap.width,
      height: worldMap.height,
      backgroundImage: worldMap.backgroundImage ?? null,
      backgroundWidth: worldMap.backgroundWidth ?? null,
      backgroundHeight: worldMap.backgroundHeight ?? null,
      regions: worldMap.regions,
    },
    agents: states.map((s) => ({
      agentId: s.agentId,
      x: s.x,
      y: s.y,
      direction: s.direction,
      displayName: s.agent.displayName ?? s.agentId.slice(0, 8),
      avatarUrl: s.agent.avatarUrl ?? null,
      level: s.level,
      regionId: s.regionId ?? null,
      areaX: s.areaX ?? null,
      areaY: s.areaY ?? null,
      interiorId: s.interiorId ?? null,
      interiorX: s.interiorX ?? null,
      interiorY: s.interiorY ?? null,
    })),
  });
}
