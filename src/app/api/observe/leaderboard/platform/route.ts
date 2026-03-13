import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/leaderboard/platform?limit=20
 * Platform-wide leaderboard: agents who have played (at least one step or session with playtime).
 * Steps come from AgentProfile.totalSteps (incremented on /step and /actions).
 * Efficiency = (badges*30 + pokedexOwned) / max(steps, 1). When fewer than 5 have played, returns all; when 5+, returns top 5 by efficiency.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  const profiles = await prisma.agentProfile.findMany({
    orderBy: [{ totalPlaytimeSeconds: "desc" }],
    take: Math.max(limit, 100),
    include: {
      agent: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

  const BADGE_WEIGHT = 30;
  const entries = profiles
    .map((p) => {
      const badgesJson = p.badges as string[] | null;
      const badgesCount = Array.isArray(badgesJson) ? badgesJson.length : 0;
      const totalSteps = p.totalSteps ?? 0;
      const achievementScore = badgesCount * BADGE_WEIGHT + p.pokedexOwnedCount;
      const efficiency = totalSteps > 0 ? achievementScore / totalSteps : 0;

      return {
        agentId: p.agent.id,
        displayName: p.agent.displayName ?? null,
        avatarUrl: p.agent.avatarUrl ?? null,
        name: p.name,
        totalPlaytimeSeconds: p.totalPlaytimeSeconds,
        totalSteps,
        pokedexOwnedCount: p.pokedexOwnedCount,
        pokedexSeenCount: p.pokedexSeenCount,
        badgesCount,
        efficiency: Math.round(efficiency * 1000) / 1000,
      };
    })
    .filter((e) => e.totalSteps > 0 || e.totalPlaytimeSeconds > 0)
    .sort((a, b) => b.efficiency - a.efficiency);

  // Show all played agents when fewer than 5; once there are 5+, show only top 5
  const capped = entries.length > 5 ? entries.slice(0, 5) : entries;
  const result = capped.map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({ leaderboard: result });
}
