import { getAgentFromRequest } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logLiveActivityFromStep } from "@/lib/live-activity";
import { getEmulatorStartIntent } from "@/lib/emulator-session-intent";

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

  let body: { actions?: unknown; speed?: number; compact?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rawActions = Array.isArray(body.actions) ? body.actions : [];
  if (rawActions.length === 0) {
    return NextResponse.json({ error: "actions must be a non-empty array" }, { status: 400 });
  }
  const invalidActions: Array<{ index: number; value: unknown }> = [];
  const actions = rawActions.map((a, index) => {
    const normalized = typeof a === "string" ? a.toLowerCase().trim() : "";
    if (!normalized || !VALID_ACTIONS.includes(normalized)) {
      invalidActions.push({ index, value: a });
    }
    return normalized;
  });
  if (invalidActions.length > 0) {
    return NextResponse.json(
      { error: "Invalid actions provided", allowedActions: VALID_ACTIONS, invalidActions },
      { status: 400 }
    );
  }
  const speed = typeof body.speed === "number" && body.speed >= 0 ? body.speed : undefined;
  const compact = body.compact === true;

  try {
    let res = await fetch(`${EMULATOR_URL}/session/${agent.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions,
        ...(speed !== undefined && { speed }),
        ...(compact && { compact: true }),
      }),
    });
    let data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    // Self-heal: if emulator lost the session (404), restart and retry once.
    if (!res.ok && res.status === 404) {
      const agentKeyHeader = req.headers.get("X-Agent-Key") ?? "";
      const moltbookHeader = req.headers.get("X-Moltbook-Identity") ?? "";
      const intent = getEmulatorStartIntent(agent.id);
      const restartHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (agentKeyHeader) restartHeaders["X-Agent-Key"] = agentKeyHeader;
      if (moltbookHeader) restartHeaders["X-Moltbook-Identity"] = moltbookHeader;
      const origin = new URL(req.url).origin;
      const restartRes = await fetch(`${origin}/api/game/emulator/start`, {
        method: "POST",
        headers: restartHeaders,
        body: JSON.stringify({
          mode: "restart",
          ...(intent?.starter && { starter: intent.starter }),
          ...(intent?.speed !== undefined && { speed: intent.speed }),
          ...(intent?.loadSessionId && { loadSessionId: intent.loadSessionId }),
        }),
      });

      if (restartRes.ok) {
        res = await fetch(`${EMULATOR_URL}/session/${agent.id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions,
            ...(speed !== undefined && { speed }),
            ...(compact && { compact: true }),
          }),
        });
        data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      } else {
        const restartData = (await restartRes.json().catch(() => ({}))) as Record<string, unknown>;
        return NextResponse.json(
          { error: (restartData.error as string) ?? (restartData.message as string) ?? "Failed to restart session" },
          { status: restartRes.status }
        );
      }
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: (data.detail as string) ?? "Emulator service error" },
        { status: res.status }
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
      logLiveActivityFromStep(
        agent.id,
        {
          state: (data.state ?? undefined) as { mapName?: string } | undefined,
          feedback: (data.feedback ?? undefined) as { effects?: string[]; message?: string } | undefined,
        },
        { agentDisplayName: agent.displayName ?? undefined }
      ),
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
