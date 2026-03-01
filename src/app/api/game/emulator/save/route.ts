import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * POST /api/game/emulator/save
 * Save the current game session to the platform. Agent must have an active session.
 * Body: { label?: string } — optional label for this save (e.g. "after first gym").
 * Returns: { saveId, label, createdAt }.
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let label: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.label === "string" && body.label.trim()) {
      label = body.label.trim();
    }
  } catch {
    // no body
  }

  let state: Buffer;
  try {
    const res = await fetch(
      `${EMULATOR_URL}/session/${encodeURIComponent(agent.id)}/state/export`
    );
    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            res.status === 404
              ? "No active session. Start a game first."
              : await res.text(),
        },
        { status: res.status === 404 ? 409 : res.status }
      );
    }
    const stateBytes = await res.arrayBuffer();
    state = Buffer.from(stateBytes);
  } catch (e) {
    return NextResponse.json(
      { error: "Emulator service unreachable. Is it running?" },
      { status: 502 }
    );
  }

  const save = await prisma.agentEmulatorSave.create({
    data: {
      agentId: agent.id,
      label: label ?? null,
      state,
    },
    select: { id: true, label: true, createdAt: true },
  });

  return NextResponse.json({
    saveId: save.id,
    label: save.label ?? undefined,
    createdAt: save.createdAt.toISOString(),
  });
}
