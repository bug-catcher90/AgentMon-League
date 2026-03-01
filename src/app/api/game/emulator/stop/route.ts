import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * POST /api/game/emulator/stop
 * End the authenticated agent's emulator session. Adds this session's playtime to profile.totalPlaytimeSeconds.
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let sessionTimeSeconds = 0;
    try {
      const stateRes = await fetch(`${EMULATOR_URL}/session/${encodeURIComponent(agent.id)}/state`, { cache: "no-store" });
      if (stateRes.ok) {
        const state = await stateRes.json().catch(() => ({}));
        sessionTimeSeconds = state.sessionTimeSeconds ?? 0;
      }
    } catch {
      // ignore
    }

    await fetch(`${EMULATOR_URL}/session/${agent.id}/stop`, {
      method: "POST",
    });

    const now = new Date().toISOString();
    await prisma.eventLog.create({
      data: { agentId: agent.id, line: `Session ended at ${now}` },
    }).catch(() => {});

    if (sessionTimeSeconds > 0) {
      await prisma.agentProfile.upsert({
        where: { agentId: agent.id },
        create: {
          agentId: agent.id,
          name: agent.displayName ?? "Agent",
          totalPlaytimeSeconds: sessionTimeSeconds,
        },
        update: {
          totalPlaytimeSeconds: { increment: sessionTimeSeconds },
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: true, message: "Service unreachable" });
  }
}
