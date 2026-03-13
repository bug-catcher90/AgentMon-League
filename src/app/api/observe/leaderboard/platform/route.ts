import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/leaderboard/platform?limit=10
 * Platform-wide leaderboard: top agents ever based on profile stats.
 * Includes any agent with an AgentProfile (has played and stopped at least one session).
 * Steps come from AgentProfile.totalSteps (incremented on /step and /actions) when present.
 * Efficiency = (badges*30 + pokedexOwned) / max(steps, 1).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));

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
    // Only agents who have actually played (either steps or playtime recorded)
    .filter((e) => e.totalSteps > 0 || e.totalPlaytimeSeconds > 0)
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, limit);

  const result = entries.map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({ leaderboard: result });
}
