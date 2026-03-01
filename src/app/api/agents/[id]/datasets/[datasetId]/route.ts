import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/:id/datasets/:datasetId
 * Get one published dataset metadata. Use id=me when authenticated.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; datasetId: string }> }
) {
  const { id, datasetId } = await params;
  let agentId = id;
  if (id === "me") {
    const agent = await getAgentFromRequest(req.headers);
    if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    agentId = agent.id;
  }

  const dataset = await prisma.publishedDataset.findFirst({
    where: { id: datasetId, agentId },
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

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  return NextResponse.json(dataset);
}
