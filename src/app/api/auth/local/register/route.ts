import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashApiKey, generateApiKey } from "@/lib/auth";

/**
 * POST /api/auth/local/register
 * Register a new local agent. Returns API key ONCE (store it securely).
 * Body (optional): { displayName?: string } — e.g. "Bug-Catcher"; agent will show under this name on Watch and Agents.
 */
export async function POST(req: Request) {
  const apiKey = generateApiKey();
  const { hash, prefix } = await hashApiKey(apiKey);

  let displayName = `Agent-${prefix}`;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.displayName === "string" && body.displayName.trim()) {
      displayName = body.displayName.trim().slice(0, 100);
    }
  } catch {
    // no body
  }

  const agent = await prisma.agent.create({
    data: {
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      displayName,
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
