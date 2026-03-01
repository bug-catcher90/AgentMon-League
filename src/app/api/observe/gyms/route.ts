import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/gyms
 * Returns all gyms for the observer UI.
 */
export async function GET() {
  const gyms = await prisma.gym.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, cityName: true, badgeId: true, x: true, y: true },
  });
  return NextResponse.json({ gyms });
}
