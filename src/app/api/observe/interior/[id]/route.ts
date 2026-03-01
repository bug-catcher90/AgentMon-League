import { NextResponse } from "next/server";
import { getInteriorMap } from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/interior/[id]
 * Returns layer 3 interior map (tiles, warps, dimensions) for the given building id.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interior = getInteriorMap(id);
  if (!interior) {
    return NextResponse.json({ error: "Interior not found" }, { status: 404 });
  }
  return NextResponse.json(interior);
}
