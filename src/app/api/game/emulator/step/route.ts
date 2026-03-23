import { getAgentFromRequest } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractScreenTextFromImage } from "@/lib/screen-text";
import { logLiveActivityFromStep } from "@/lib/live-activity";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";
const RATE_LIMIT_STEP_PER_MINUTE = Math.max(0, parseInt(process.env.RATE_LIMIT_STEP_PER_MINUTE ?? "120", 10) || 120);

/**
 * POST /api/game/emulator/step
 * Body: { action: "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select" | "pass" }
 * Sends one button press, then returns state, feedback, and screenText (vision-extracted on-screen text).
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(`step:${agent.id}`, RATE_LIMIT_STEP_PER_MINUTE)) {
    return NextResponse.json(
      { error: "Too many step requests. Slow down and try again in a minute." },
      { status: 429 }
    );
  }

  let body: { action?: string; compact?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action?.toLowerCase() ?? "";
  const compact = body.compact === true;
  const valid = ["up", "down", "left", "right", "a", "b", "start", "select", "pass"];
  if (!valid.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Use one of: ${valid.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    let stepRes = await fetch(`${EMULATOR_URL}/session/${agent.id}/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, compact }),
    });
    let data = (await stepRes.json().catch(() => ({}))) as Record<string, unknown>;

    // Self-heal: if emulator lost the session (404), restart and retry once.
    if (!stepRes.ok && stepRes.status === 404) {
      const agentKeyHeader = req.headers.get("X-Agent-Key") ?? "";
      const origin = new URL(req.url).origin;
      const restartRes = await fetch(`${origin}/api/game/emulator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Agent-Key": agentKeyHeader },
        body: JSON.stringify({ mode: "restart" }),
      });

      if (restartRes.ok) {
        stepRes = await fetch(`${EMULATOR_URL}/session/${agent.id}/step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, compact }),
        });
        data = (await stepRes.json().catch(() => ({}))) as Record<string, unknown>;
      } else {
        const restartData = (await restartRes.json().catch(() => ({}))) as Record<string, unknown>;
        return NextResponse.json(
          { error: (restartData.error as string) ?? (restartData.message as string) ?? "Failed to restart session" },
          { status: restartRes.status }
        );
      }
    }

    if (!stepRes.ok) {
      return NextResponse.json(
        { error: (data.detail as string) ?? "Emulator service error" },
        { status: stepRes.status }
      );
    }

    let screenText = "";
    try {
      const frameRes = await fetch(`${EMULATOR_URL}/session/${agent.id}/frame`, {
        cache: "no-store",
        headers: { Accept: "image/png" },
      });
      if (frameRes.ok) {
        const imageBuffer = Buffer.from(await frameRes.arrayBuffer());
        screenText = await extractScreenTextFromImage(imageBuffer);
      }
    } catch {
      // Frame or vision failed; step still succeeds, screenText stays ""
    }

    // Best-effort logging of global live activity events for virality + step counter update.
    // Do not await these before returning to keep step latency low.
    void (async () => {
      await Promise.allSettled([
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
          data: { totalSteps: { increment: 1 } },
        }),
      ]);
    })();

    return NextResponse.json({ ...data, screenText });
  } catch {
    return NextResponse.json(
      { error: "Emulator service unreachable" },
      { status: 502 }
    );
  }
}
