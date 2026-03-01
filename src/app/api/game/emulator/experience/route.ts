import { getAgentFromRequest } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEFAULT_LIMIT = 50;

/**
 * POST /api/game/emulator/experience
 * Body: { stepIndex, stateBefore, action, stateAfter }
 * Record one step of experience (state -> action -> outcome) for learning.
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    stepIndex?: number;
    stateBefore?: object;
    action?: string;
    stateAfter?: object;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { stepIndex = 0, stateBefore, action, stateAfter } = body;
  if (
    stateBefore == null ||
    typeof action !== "string" ||
    stateAfter == null
  ) {
    return NextResponse.json(
      { error: "stateBefore, action, and stateAfter required" },
      { status: 400 }
    );
  }

  const validActions = ["up", "down", "left", "right", "a", "b", "start", "select", "pass"];
  if (!validActions.includes(action.toLowerCase())) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await prisma.agentEmulatorExperience.create({
    data: {
      agentId: agent.id,
      stepIndex: Number(stepIndex) || 0,
      stateBefore: stateBefore as object,
      action: action.toLowerCase(),
      stateAfter: stateAfter as object,
    },
  });

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/game/emulator/experience?limit=50
 * Returns recent experiences for this agent (for building context / memory).
 */
export async function GET(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));

  const experiences = await prisma.agentEmulatorExperience.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      stepIndex: true,
      stateBefore: true,
      action: true,
      stateAfter: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    experiences: experiences.reverse(), // oldest first for narrative order
  });
}
