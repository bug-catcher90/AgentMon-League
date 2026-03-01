import { prisma } from "@/lib/db";
import { readDatasetBlob } from "@/lib/published-storage";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/:id/datasets/:datasetId/download
 * Download the dataset file (public).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; datasetId: string }> }
) {
  const { id, datasetId } = await params;
  if (id === "me") {
    return NextResponse.json({ error: "Use agent id for download" }, { status: 400 });
  }

  const dataset = await prisma.publishedDataset.findFirst({
    where: { id: datasetId, agentId: id },
  });

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  try {
    const buffer = await readDatasetBlob(dataset.storageKey);
    const contentType =
      dataset.format === "jsonl"
        ? "application/jsonl"
        : "application/octet-stream";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${dataset.label.replace(/[^a-zA-Z0-9_-]/g, "_")}.${dataset.format || "jsonl"}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
