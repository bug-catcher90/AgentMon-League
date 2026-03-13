import { getAgentFromRequest } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logLiveActivityFromStep } from "@/lib/live-activity";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

const VALID_ACTIONS = ["up", "down", "left", "right", "a", "b", "start", "select", "pass"];

/**
 * POST /api/game/emulator/actions
 * Run a sequence of actions at session speed (or override with body.speed).
 * Returns final state after all actions. Use for query-driven agents: query state, plan sequence, run sequence, repeat.
 * Body: { actions: string[], speed?: number }
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { actions?: unknown; speed?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rawActions = Array.isArray(body.actions) ? body.actions : [];
  const actions = rawActions
    .map((a) => (typeof a === "string" ? a.toLowerCase().trim() : ""))
    .filter((a) => a && VALID_ACTIONS.includes(a));
  const speed = typeof body.speed === "number" && body.speed >= 0 ? body.speed : undefined;

  try {
    const res = await fetch(`${EMULATOR_URL}/session/${agent.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions,
        ...(speed !== undefined && { speed }),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json(
        { error: (data.detail as string) ?? "Emulator service error" },
        { status: res.status === 404 ? 404 : res.status }
      );
    }
    // Include frame in response so RL agent can skip a separate get_frame round-trip (faster steps in prod).
    let frameBase64: string | undefined;
    try {
      const frameRes = await fetch(`${EMULATOR_URL}/session/${agent.id}/frame`, {
        cache: "no-store",
        headers: { Accept: "image/png" },
      });
      if (frameRes.ok) {
        const buf = Buffer.from(await frameRes.arrayBuffer());
        frameBase64 = buf.toString("base64");
      }
    } catch {
      // Frame fetch failed; client can fall back to GET /api/observe/emulator/frame
    }

    // Best-effort: log live activity + increment step counter.
    void Promise.allSettled([
      logLiveActivityFromStep(agent.id, {
        state: (data.state ?? undefined) as { mapName?: string } | undefined,
        feedback: (data.feedback ?? undefined) as { effects?: string[]; message?: string } | undefined,
      }),
      prisma.agentProfile.updateMany({
        where: { agentId: agent.id },
        data: { totalSteps: { increment: actions.length } },
      }),
    ]);

    return NextResponse.json({ ...data, ...(frameBase64 && { frameBase64 }) });
  } catch {
    return NextResponse.json(
      { error: "Emulator service unreachable" },
      { status: 502 }
    );
  }
}
