import { NextResponse } from "next/server";
import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canMoveTo, getTile } from "@/lib/world";
import { getEncounters, getMapConfig, getWorldMapConfig, getAreaMap, getInteriorMap, getAreaTile, getInteriorTile, isAreaTilePassable, isEncounterTile } from "@/lib/content";
import { rollEncounter, wildEncounterLevel } from "@/lib/world";
import type { MapData } from "@/lib/world";
import { createWildBattleState, createCreatureInstance } from "@/lib/battle";
import type { BattleSide } from "@/lib/battle";

const DX: Record<string, number> = { left: -1, right: 1, up: 0, down: 0 };
const DY: Record<string, number> = { left: 0, right: 0, up: -1, down: 1 };

async function handleLayeredMove(
  state: { regionId: string | null; areaX: number | null; areaY: number | null; interiorId: string | null; interiorX: number | null; interiorY: number | null; agentId: string; party: unknown },
  agentId: string,
  direction: string
): Promise<NextResponse | null> {
  const regionId = state.regionId!;
  const areaX = state.areaX!;
  const areaY = state.areaY!;

  if (state.interiorId != null && state.interiorX != null && state.interiorY != null) {
    const interior = getInteriorMap(state.interiorId);
    if (!interior) return NextResponse.json({ error: "Invalid interior" }, { status: 500 });
    const nx = state.interiorX + (DX[direction] ?? 0);
    const ny = state.interiorY + (DY[direction] ?? 0);
    if (nx < 0 || nx >= interior.widthBlocks || ny < 0 || ny >= interior.heightBlocks) {
      return NextResponse.json({ success: false, feedback: "Unpassable tile." });
    }
    const tile = getInteriorTile(interior, nx, ny);
    if (!isAreaTilePassable(tile)) {
      return NextResponse.json({ success: false, feedback: "Unpassable tile." });
    }
    const warp = interior.warps.find((w) => w.blockX === nx && w.blockY === ny);
    if (warp && warp.type === "region" && warp.targetId) {
      await prisma.agentState.update({
        where: { agentId },
        data: {
          interiorId: null,
          interiorX: null,
          interiorY: null,
          regionId: warp.targetId,
          areaX: warp.targetBlockX,
          areaY: warp.targetBlockY,
          x: warp.targetBlockX,
          y: warp.targetBlockY,
          direction,
        },
      });
      await prisma.eventLog.create({ data: { agentId, line: `Left ${interior.name}.` } });
      return NextResponse.json({
        success: true,
        newPosition: { regionId: warp.targetId, areaX: warp.targetBlockX, areaY: warp.targetBlockY, interiorId: null },
        feedback: `Left ${interior.name}.`,
      });
    }
    await prisma.agentState.update({
      where: { agentId },
      data: { interiorX: nx, interiorY: ny, direction },
    });
    await prisma.eventLog.create({ data: { agentId, line: "Moving around." } });
    return NextResponse.json({
      success: true,
      newPosition: { regionId, areaX, areaY, interiorId: state.interiorId, interiorX: nx, interiorY: ny },
      feedback: "Moving around.",
    });
  }

  const area = getAreaMap(regionId);
  if (!area) return NextResponse.json({ error: "Invalid region" }, { status: 500 });
  const nx = areaX + (DX[direction] ?? 0);
  const ny = areaY + (DY[direction] ?? 0);
  if (nx < 0 || nx >= area.widthBlocks || ny < 0 || ny >= area.heightBlocks) {
    return NextResponse.json({ success: false, feedback: "Unpassable tile." });
  }
  const tile = getAreaTile(area, nx, ny);
  if (!isAreaTilePassable(tile)) {
    return NextResponse.json({ success: false, feedback: "Unpassable tile." });
  }

  const warp = area.warps.find((w) => w.blockX === nx && w.blockY === ny);
  if (warp) {
    if (warp.type === "interior") {
      const interiorName = getInteriorMap(warp.targetId)?.name ?? warp.name ?? warp.targetId;
      await prisma.agentState.update({
        where: { agentId },
        data: {
          interiorId: warp.targetId,
          interiorX: warp.targetBlockX,
          interiorY: warp.targetBlockY,
          direction,
        },
      });
      await prisma.eventLog.create({ data: { agentId, line: `Entered ${interiorName}.` } });
      return NextResponse.json({
        success: true,
        newPosition: { regionId, areaX, areaY, interiorId: warp.targetId, interiorX: warp.targetBlockX, interiorY: warp.targetBlockY },
        feedback: `Entered ${interiorName}.`,
      });
    }
    if (warp.type === "region") {
      const worldMap = getWorldMapConfig();
      const regionName = worldMap.regions.find((r) => r.id === warp.targetId)?.name ?? warp.targetId;
      await prisma.agentState.update({
        where: { agentId },
        data: {
          regionId: warp.targetId,
          areaX: warp.targetBlockX,
          areaY: warp.targetBlockY,
          interiorId: null,
          interiorX: null,
          interiorY: null,
          x: warp.targetBlockX,
          y: warp.targetBlockY,
          direction,
        },
      });
      await prisma.eventLog.create({ data: { agentId, line: `Moved to ${regionName}.` } });
      return NextResponse.json({
        success: true,
        newPosition: { regionId: warp.targetId, areaX: warp.targetBlockX, areaY: warp.targetBlockY, interiorId: null },
        feedback: `Moved to ${regionName}.`,
      });
    }
  }

  await prisma.agentState.update({
    where: { agentId },
    data: { areaX: nx, areaY: ny, x: nx, y: ny, direction },
  });

  let encounterTriggered = false;
  let encounterType: string | null = null;
  let matchId: string | null = null;
  const steppedTile = getAreaTile(area, nx, ny);
  if (area.encounterTableId && isEncounterTile(steppedTile)) {
    const encounters = getEncounters();
    const table = encounters[area.encounterTableId];
    if (table) {
      const roll = Math.random();
      if (roll < 0.25) {
        const speciesId = rollEncounter(table);
        if (speciesId) {
          encounterTriggered = true;
          encounterType = "wild";
          await prisma.eventLog.create({ data: { agentId, line: "Moving around." } });
          await prisma.eventLog.create({ data: { agentId, line: "Encountered wild Pokémon!" } });
          const wildLevel = wildEncounterLevel(regionId);
          const firstCreature = (state.party as unknown[])?.[0];
          let agentSide: BattleSide;
          if (firstCreature && typeof firstCreature === "object" && "currentHp" in firstCreature && (firstCreature as { currentHp: number }).currentHp > 0) {
            agentSide = { creatures: (state.party as unknown[]) as BattleSide["creatures"], activeIndex: 0, agentId };
          } else {
            agentSide = { creatures: [createCreatureInstance("pikachu", 5)], activeIndex: 0, agentId };
          }
          const match = await prisma.match.create({
            data: { type: "WILD", agentAId: agentId, state: {}, transcript: [] },
          });
          const battleState = createWildBattleState(match.id, agentSide, speciesId, wildLevel);
          await prisma.match.update({ where: { id: match.id }, data: { state: battleState as unknown as object, transcript: battleState.transcript } });
          await prisma.agentState.update({ where: { agentId }, data: { currentMatchId: match.id } });
          matchId = match.id;
          await prisma.eventLog.create({ data: { agentId, matchId: match.id, line: `Wild ${speciesId} appeared!` } });
        }
      }
    }
  }
  if (!encounterTriggered) {
    await prisma.eventLog.create({ data: { agentId, line: "Moving around." } });
  }

  return NextResponse.json({
    success: true,
    newPosition: { regionId, areaX: nx, areaY: ny, interiorId: null },
    encounterTriggered,
    encounterType: encounterType ?? undefined,
    matchId: matchId ?? undefined,
    feedback: encounterTriggered ? "Encountered wild Pokémon!" : "Moving around.",
  });
}

/**
 * POST /api/game/action/move
 * Body: { direction: "up" | "down" | "left" | "right" }
 * Uses layered map (area/interior) when regionId is set; otherwise legacy world grid.
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { direction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const direction = body.direction?.toLowerCase();
  if (!direction || !["up", "down", "left", "right"].includes(direction)) {
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  }

  const state = await prisma.agentState.findUnique({
    where: { agentId: agent.id },
  });
  if (!state) {
    return NextResponse.json({ error: "Not in world" }, { status: 400 });
  }
  if (state.currentMatchId) {
    return NextResponse.json({ error: "Finish current battle first" }, { status: 400 });
  }

  const party = (state.party as unknown[]) ?? [];
  if (party.length === 0) {
    return NextResponse.json(
      {
        error: "Choose your starter first.",
        hint: "POST /api/game/starter/choose with body { \"starter\": \"bulbasaur\" | \"charmander\" | \"squirtle\" }",
      },
      { status: 400 }
    );
  }

  const world = await prisma.world.findUnique({ where: { id: state.worldId } });
  if (!world) {
    return NextResponse.json({ error: "World not found" }, { status: 500 });
  }

  // --- Layered map: move in interior or area ---
  if (state.regionId != null && state.areaX != null && state.areaY != null) {
    const layered = await handleLayeredMove(state, agent.id, direction);
    if (layered) return layered;
  }

  // --- Legacy: single world grid (map.json) ---
  const mapData = world.mapData as unknown as MapData;
  const nx = state.x + (DX[direction] ?? 0);
  const ny = state.y + (DY[direction] ?? 0);

  if (!canMoveTo(mapData, world.width, world.height, nx, ny)) {
    return NextResponse.json({
      success: false,
      newPosition: { x: state.x, y: state.y },
      feedback: "Unpassable tile.",
    });
  }

  const mapConfig = getMapConfig();
  const connections = mapConfig.regionConnections ?? [];
  const currentTile = getTile(mapData, state.x, state.y);
  const targetTile = getTile(mapData, nx, ny);
  const currentRegion = currentTile?.region ?? "default";
  const targetRegion = targetTile?.region ?? "default";
  if (currentRegion !== targetRegion) {
    const isConnected =
      connections.some(([a, b]) => a === currentRegion && b === targetRegion) ||
      connections.some(([a, b]) => a === targetRegion && b === currentRegion);
    if (!isConnected) {
      return NextResponse.json({
        success: false,
        newPosition: { x: state.x, y: state.y },
        feedback: "Unpassable tile.",
      });
    }
  }

  await prisma.agentState.update({
    where: { agentId: agent.id },
    data: {
      x: nx,
      y: ny,
      direction,
    },
  });

  const tile = getTile(mapData, nx, ny);
  await prisma.eventLog.create({
    data: { agentId: agent.id, line: "Moving around." },
  });

  let encounterTriggered = false;
  let encounterType: string | null = null;
  let matchId: string | null = null;

  if (tile?.encounterTableId) {
    const encounters = getEncounters();
    const table = encounters[tile.encounterTableId];
    if (table) {
      const roll = Math.random();
      if (roll < 0.25) {
        const speciesId = rollEncounter(table);
        if (speciesId) {
          encounterTriggered = true;
          encounterType = "wild";
          const wildLevel = wildEncounterLevel(tile.region);
          const party = state.party as unknown[];
          const firstCreature = party[0];
          let agentSide: BattleSide;
          if (firstCreature && typeof firstCreature === "object" && "speciesId" in firstCreature && "currentHp" in firstCreature && (firstCreature as { currentHp: number }).currentHp > 0) {
            agentSide = {
              creatures: party as BattleSide["creatures"],
              activeIndex: 0,
              agentId: agent.id,
            };
          } else {
            const fallback = createCreatureInstance("pikachu", 5);
            agentSide = {
              creatures: [fallback],
              activeIndex: 0,
              agentId: agent.id,
            };
          }
          const match = await prisma.match.create({
            data: {
              type: "WILD",
              agentAId: agent.id,
              state: {},
              transcript: [],
            },
          });
          const battleState = createWildBattleState(match.id, agentSide, speciesId, wildLevel);
          await prisma.match.update({
            where: { id: match.id },
            data: {
              state: battleState as unknown as object,
              transcript: battleState.transcript,
            },
          });
          await prisma.agentState.update({
            where: { agentId: agent.id },
            data: { currentMatchId: match.id },
          });
          matchId = match.id;
          await prisma.eventLog.create({
            data: { agentId: agent.id, line: "Encountered wild Pokémon!" },
          });
          await prisma.eventLog.create({
            data: { agentId: agent.id, matchId: match.id, line: `Wild ${speciesId} appeared!` },
          });
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    newPosition: { x: nx, y: ny },
    encounterTriggered,
    encounterType,
    matchId: matchId ?? undefined,
    feedback: encounterTriggered ? "Encountered wild Pokémon!" : "Moving around.",
  });
}
