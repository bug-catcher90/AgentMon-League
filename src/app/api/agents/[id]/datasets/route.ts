import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/:id/datasets
 * List published datasets for an agent. Use id=me when authenticated to list your own.
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

  const datasets = await prisma.publishedDataset.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      agentId: true,
      label: true,
      version: true,
      description: true,
      format: true,
      byteSize: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ datasets });
}
