import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/:id/models
 * List published models for an agent. Use id=me when authenticated to list your own.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let agentId = id;
  if (id === "me") {
    const agent = await getAgentFromRequest(req.headers);
    if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    agentId = agent.id;
  }

  const models = await prisma.publishedModel.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      agentId: true,
      label: true,
      version: true,
      description: true,
      byteSize: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ models });
}
