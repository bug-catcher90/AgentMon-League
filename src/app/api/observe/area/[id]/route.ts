import { NextResponse } from "next/server";
import { getAreaMap } from "@/lib/content";

export const dynamic = "force-dynamic";

/** Generate default tiles for an area when tiles array is empty (e.g. Route 1: path down the middle). */
function fillAreaTiles(area: { id: string; widthBlocks: number; heightBlocks: number; tiles: string[] }): string[] {
  if (area.tiles && area.tiles.length === area.widthBlocks * area.heightBlocks) {
    return area.tiles;
  }
  const len = area.widthBlocks * area.heightBlocks;
  const tiles: string[] = [];
  for (let i = 0; i < len; i++) {
    const x = i % area.widthBlocks;
    if (area.id === "route_1") {
      tiles.push(x >= 4 && x <= 5 ? "path" : "grass");
    } else {
      tiles.push("grass");
    }
  }
  return tiles;
}

/**
 * GET /api/observe/area/[id]
 * Returns layer 2 area map (tiles, warps, dimensions) for the given region id.
 * Fills empty tile arrays with default terrain (e.g. Route 1 path).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const area = getAreaMap(id);
  if (!area) {
    return NextResponse.json({ error: "Area not found" }, { status: 404 });
  }
  const tiles = fillAreaTiles(area);
  return NextResponse.json({ ...area, tiles });
}
