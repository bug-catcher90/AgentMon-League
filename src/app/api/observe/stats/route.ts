import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/stats
 * Returns counts for homepage: total agents, live sessions, total battles played, total playtime (all time: stored + current sessions).
 * Stored playtime is only accumulated when agents call POST /api/game/emulator/stop, so it may be 0 until sessions are ended.
 */
export async function GET() {
  try {
    const [totalAgents, totalBattlesPlayed, storedPlaytimeResult, emulatorData] = await Promise.all([
      prisma.agent.count(),
      prisma.match.count(),
      prisma.agentProfile
        .aggregate({ _sum: { totalPlaytimeSeconds: true } })
        .catch(() => ({ _sum: { totalPlaytimeSeconds: null as number | null } })),
      fetch(`${EMULATOR_URL}/sessions`, { cache: "no-store" })
        .then((r) => r.json().catch(() => ({ agent_ids: [] })))
        .catch(() => ({ agent_ids: [] })),
    ]);

    const agentIds: string[] = emulatorData.agent_ids ?? [];
    const liveSessions = agentIds.length;
    let currentSessionPlaytime = 0;
    if (agentIds.length > 0) {
      try {
        const statePromises = agentIds.map((id) =>
          fetch(`${EMULATOR_URL}/session/${encodeURIComponent(id)}/state`, { cache: "no-store" }).then((r) =>
            r.ok ? r.json().catch(() => ({})) : {}
          )
        );
        const states = (await Promise.all(statePromises)) as { sessionTimeSeconds?: number }[];
        currentSessionPlaytime = states.reduce((sum, s) => sum + (s.sessionTimeSeconds ?? 0), 0);
      } catch {
        // emulator unreachable for session state
      }
    }
    const storedPlaytime = storedPlaytimeResult._sum?.totalPlaytimeSeconds ?? 0;
    const totalPlaytimeSeconds = storedPlaytime + currentSessionPlaytime;

    return NextResponse.json({
      totalAgents: totalAgents ?? 0,
      liveSessions,
      totalBattlesPlayed: totalBattlesPlayed ?? 0,
      totalPlaytimeSeconds,
    });
  } catch (e) {
    console.error("[observe/stats]", e);
    return NextResponse.json(
      { totalAgents: 0, liveSessions: 0, totalBattlesPlayed: 0, totalPlaytimeSeconds: 0 },
      { status: 200 }
    );
  }
}
