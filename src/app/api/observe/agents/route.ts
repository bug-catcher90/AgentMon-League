import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/agents
 * List all agents with basic profile info, plus status (active/offline), playtime, region from emulator when playing.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const sessionMap: Record<
    string,
    { sessionTimeSeconds: number; mapName: string; pokedexOwned?: number; pokedexSeen?: number }
  > = {};
  try {
    const sessRes = await fetch(`${EMULATOR_URL}/sessions`, { cache: "no-store" });
    const sessData = await sessRes.json().catch(() => ({ agent_ids: [] }));
    const agentIds: string[] = sessData.agent_ids ?? [];
    if (agentIds.length > 0) {
      const statePromises = agentIds.map((id) =>
        fetch(`${EMULATOR_URL}/session/${encodeURIComponent(id)}/state`, { cache: "no-store" }).then((r) =>
          r.ok ? r.json().catch(() => ({})) : {}
        )
      );
      const states = await Promise.all(statePromises);
      agentIds.forEach((id, i) => {
        const s = (states[i] ?? {}) as {
          sessionTimeSeconds?: number;
          mapName?: string;
          pokedexOwned?: number;
          pokedexSeen?: number;
        };
        sessionMap[id] = {
          sessionTimeSeconds: s.sessionTimeSeconds ?? 0,
          mapName: s.mapName ?? "Unknown",
          pokedexOwned: typeof s.pokedexOwned === "number" ? s.pokedexOwned : undefined,
          pokedexSeen: typeof s.pokedexSeen === "number" ? s.pokedexSeen : undefined,
        };
      });
    }
  } catch {
    // Emulator unreachable; sessionMap stays empty
  }

  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        profile: true,
        state: { select: { x: true, y: true, worldId: true, regionId: true } },
      },
    }),
    prisma.agent.count(),
  ]);

  return NextResponse.json({
    agents: agents.map((a) => {
      const session = sessionMap[a.id];
      const isActive = !!session;
      const pokedexOwned = isActive && session?.pokedexOwned !== undefined ? session.pokedexOwned : (a.profile?.pokedexOwnedCount ?? 0);
      const pokedexSeen = isActive && session?.pokedexSeen !== undefined ? session.pokedexSeen : (a.profile?.pokedexSeenCount ?? 0);
      return {
        id: a.id,
        displayName: a.displayName ?? a.id.slice(0, 8),
        avatarUrl: a.avatarUrl ?? null,
        handle: a.handle,
        profile: a.profile
          ? {
              name: a.profile.name,
              level: a.profile.level,
              pokedexOwnedCount: pokedexOwned,
              pokedexSeenCount: pokedexSeen,
              badges: a.profile.badges as string[],
              wins: a.profile.wins,
              losses: a.profile.losses,
              gymWins: a.profile.gymWins,
              totalPlaytimeSeconds: a.profile.totalPlaytimeSeconds ?? 0,
            }
          : null,
        inWorld: !!a.state,
        position: a.state ? { x: a.state.x, y: a.state.y } : null,
        status: isActive ? "active" : "offline",
        playtimeSeconds: session?.sessionTimeSeconds ?? 0,
        totalPlaytimeSeconds: a.profile?.totalPlaytimeSeconds ?? 0,
        region: session?.mapName ?? (a.state?.regionId ?? null) ?? null,
      };
    }),
    total,
    limit,
    offset,
  });
}
