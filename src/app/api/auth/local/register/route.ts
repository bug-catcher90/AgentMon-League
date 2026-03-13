import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashApiKey, generateApiKey } from "@/lib/auth";

/**
 * POST /api/auth/local/register
 * Register a new local agent. Returns API key ONCE (store it securely).
 * Body (optional): { displayName?: string, handle?: string }.
 * - displayName: e.g. "Bug-Catcher"; shown on Watch and Agents.
 * - handle: stable external id/slug (must be unique). If a handle already exists, returns 409 and does NOT create a new agent.
 */
export async function POST(req: Request) {
  const apiKey = generateApiKey();
  const { hash, prefix } = await hashApiKey(apiKey);

  let displayName = `Agent-${prefix}`;
  let handle: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.displayName === "string" && body.displayName.trim()) {
      displayName = body.displayName.trim().slice(0, 100);
    }
    if (typeof body.handle === "string" && body.handle.trim()) {
      handle = body.handle.trim().slice(0, 100);
    }
  } catch {
    // no body
  }

  // If a stable handle/externalId is provided and already in use, do not create a duplicate agent.
  if (handle) {
    const existing = await prisma.agent.findFirst({
      where: { handle },
      select: { id: true, displayName: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Agent with this handle already exists. Reuse the existing credentials instead of registering again.",
          agentId: existing.id,
          displayName: existing.displayName,
        },
        { status: 409 },
      );
    }
  }

  const agent = await prisma.agent.create({
    data: {
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      displayName,
      handle: handle ?? null,
    },
  });

  await prisma.agentProfile.create({
    data: {
      agentId: agent.id,
      name: displayName,
    },
  });

  return NextResponse.json({
    success: true,
    agentId: agent.id,
    apiKey,
    message: "Store the apiKey securely. It will not be shown again. Use header: X-Agent-Key: <api_key>",
  });
}
