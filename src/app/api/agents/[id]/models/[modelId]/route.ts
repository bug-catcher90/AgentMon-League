import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/:id/models/:modelId
 * Get one published model metadata. Use id=me when authenticated.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  const { id, modelId } = await params;
  let agentId = id;
  if (id === "me") {
    const agent = await getAgentFromRequest(req.headers);
    if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    agentId = agent.id;
  }

  const model = await prisma.publishedModel.findFirst({
    where: { id: modelId, agentId },
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

  if (!model) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  return NextResponse.json(model);
}
