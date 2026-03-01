import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * GET /api/game/emulator/saves
 * List this agent's saved game sessions (id, label, createdAt). Does not return the state blob.
 */
export async function GET(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const saves = await prisma.agentEmulatorSave.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true },
  });

  return NextResponse.json({
    saves: saves.map((s) => ({
      id: s.id,
      label: s.label ?? undefined,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}
