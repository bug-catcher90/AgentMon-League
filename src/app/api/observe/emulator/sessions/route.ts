import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * GET /api/observe/emulator/sessions
 * Returns list of agent IDs that have an active emulator session, with display names.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${EMULATOR_URL}/sessions`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ agent_ids: [] }));
    const agentIds: string[] = data.agent_ids ?? [];
    if (agentIds.length === 0) {
      return NextResponse.json({ sessions: [] });
    }

    const agents = await prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: {
        id: true,
        displayName: true,
        handle: true,
        avatarUrl: true,
        profile: { select: { name: true } },
      },
    });
    const byId = Object.fromEntries(agents.map((a) => [a.id, a]));
    const statePromises = agentIds.map((id) =>
      fetch(`${EMULATOR_URL}/session/${encodeURIComponent(id)}/state`, { cache: "no-store" }).then((r) =>
        r.ok ? r.json().catch(() => ({})) : {}
      )
    );
    const states = await Promise.all(statePromises);
    const sessions = agentIds.map((id, i) => {
      const a = byId[id];
      const state = states[i] ?? {};
      return {
        agentId: id,
        displayName: a?.displayName ?? a?.profile?.name ?? a?.handle ?? id.slice(0, 8),
        avatarUrl: a?.avatarUrl ?? null,
        mapName: state.mapName ?? "Unknown",
        badges: state.badges ?? 0,
        pokedexOwned: state.pokedexOwned ?? 0,
        pokedexSeen: state.pokedexSeen ?? 0,
        sessionTimeSeconds: state.sessionTimeSeconds ?? 0,
      };
    });
    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json(
      { sessions: [], error: "Emulator service unreachable" },
      { status: 200 }
    );
  }
}
