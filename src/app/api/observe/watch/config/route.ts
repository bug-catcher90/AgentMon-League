import { NextResponse } from "next/server";
import { getWorldMapConfig } from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/watch/config
 * Returns Kanto world map config (regions, image) for the watch page. No DB required.
 */
export async function GET() {
  const worldMap = getWorldMapConfig();
  return NextResponse.json({
    backgroundImage: worldMap.backgroundImage ?? null,
    backgroundWidth: worldMap.backgroundWidth ?? null,
    backgroundHeight: worldMap.backgroundHeight ?? null,
    romMapImage: worldMap.romMapImage ?? null,
    romMapWidth: worldMap.romMapWidth ?? null,
    romMapHeight: worldMap.romMapHeight ?? null,
    regions: worldMap.regions,
  });
}
