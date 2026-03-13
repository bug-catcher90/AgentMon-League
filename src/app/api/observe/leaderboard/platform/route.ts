import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * GET /api/observe/leaderboard/platform?limit=20
 * Platform-wide leaderboard: agents who have played (persisted profile or currently live session).
 * Steps come from AgentProfile.totalSteps (incremented on /step and /actions) when present.
 * Efficiency = (badges*30 + pokedexOwned) / max(steps, 1). When fewer than 5 have played, returns all; when 5+, returns top 5 by efficiency.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  // 1) Profiles from DB (persistent stats)
  const profilesPromise = prisma.agentProfile.findMany({
    orderBy: [{ totalPlaytimeSeconds: "desc" }],
    take: Math.max(limit, 100),
    include: {
      agent: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

  // 2) Live sessions from emulator (so agents appear even before first stop)
  const liveSessionsPromise = fetch(`${EMULATOR_URL}/sessions`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json().catch(() => ({ agent_ids: [] as string[] })) : { agent_ids: [] as string[] }))
    .catch(() => ({ agent_ids: [] as string[] }));

  const [profiles, liveData] = await Promise.all([profilesPromise, liveSessionsPromise]);
  const liveIds: string[] = liveData.agent_ids ?? [];

  // Load Agent rows for any live agents not already covered by profiles
  const profileAgentIds = new Set(profiles.map((p) => p.agentId));
  const liveOnlyIds = liveIds.filter((id) => !profileAgentIds.has(id));

  const liveOnlyAgents =
    liveOnlyIds.length > 0
      ? await prisma.agent.findMany({
          where: { id: { in: liveOnlyIds } },
          select: { id: true, displayName: true, avatarUrl: true },
        })
      : [];

  const BADGE_WEIGHT = 30;

  // Entries from profiles (persistent stats)
  const profileEntries = profiles.map((p) => {
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
  });

  // Entries for live-only agents (no profile yet) – minimal stats so they still appear
  const liveEntries = liveOnlyAgents.map((a) => ({
    agentId: a.id,
    displayName: a.displayName ?? null,
    avatarUrl: a.avatarUrl ?? null,
    name: a.displayName ?? "Agent",
    totalPlaytimeSeconds: 0,
    totalSteps: 0,
    pokedexOwnedCount: 0,
    pokedexSeenCount: 0,
    badgesCount: 0,
    efficiency: 0,
  }));

  const allEntries = [...profileEntries, ...liveEntries].sort((a, b) => b.efficiency - a.efficiency);

  // If at least one agent has played (profile or live), always show them:
  // - When fewer than 5, show all
  // - When 5+, show top 5
  const capped = allEntries.length > 5 ? allEntries.slice(0, 5) : allEntries;
  const result = capped.map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({ leaderboard: result });
}
