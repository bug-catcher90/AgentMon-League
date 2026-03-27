/**
 * Agent authentication: Moltbook identity + local API key.
 */

import bcrypt from "bcryptjs";
import { prisma } from "./db";

const MOLTBOOK_VERIFY_URL = "https://www.moltbook.com/api/v1/agents/verify-identity";
const MOLTBOOK_VERIFY_TIMEOUT_MS = Math.max(1000, parseInt(process.env.MOLTBOOK_VERIFY_TIMEOUT_MS ?? "5000", 10) || 5000);

export interface MoltbookAgent {
  id: string;
  name: string;
  description?: string;
  karma?: number;
  avatar_url?: string;
  is_claimed?: boolean;
  created_at?: string;
  follower_count?: number;
  stats?: { posts?: number; comments?: number };
  owner?: { x_handle?: string; x_name?: string; x_verified?: boolean; x_follower_count?: number };
}

export interface VerifiedAgent {
  id: string;
  moltbookAgentId?: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}

export async function verifyMoltbookToken(token: string): Promise<MoltbookAgent | null> {
  const appKey = process.env.MOLTBOOK_APP_KEY;
  if (!appKey) return null;

  let res: Response;
  try {
    res = await fetch(MOLTBOOK_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Moltbook-App-Key": appKey,
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(MOLTBOOK_VERIFY_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data.valid || !data.agent) return null;
  return data.agent as MoltbookAgent;
}

export async function getOrCreateAgentFromMoltbook(moltbook: MoltbookAgent): Promise<VerifiedAgent> {
  const existing = await prisma.agent.findUnique({
    where: { moltbookAgentId: moltbook.id },
  });
  if (existing) {
    await prisma.agent.update({
      where: { id: existing.id },
      data: {
        handle: moltbook.owner?.x_handle ?? existing.handle,
        displayName: moltbook.name ?? existing.displayName,
        avatarUrl: moltbook.avatar_url ?? existing.avatarUrl,
      },
    });
    return {
      id: existing.id,
      moltbookAgentId: existing.moltbookAgentId ?? undefined,
      handle: existing.handle ?? undefined,
      displayName: existing.displayName ?? undefined,
      avatarUrl: existing.avatarUrl ?? undefined,
    };
  }

  const agent = await prisma.agent.create({
    data: {
      moltbookAgentId: moltbook.id,
      handle: moltbook.owner?.x_handle ?? null,
      displayName: moltbook.name ?? null,
      avatarUrl: moltbook.avatar_url ?? null,
    },
  });
  return {
    id: agent.id,
    moltbookAgentId: agent.moltbookAgentId ?? undefined,
    handle: agent.handle ?? undefined,
    displayName: agent.displayName ?? undefined,
    avatarUrl: agent.avatarUrl ?? undefined,
  };
}

const API_KEY_PREFIX_LEN = 8;
const SALT_ROUNDS = 10;

export async function hashApiKey(apiKey: string): Promise<{ hash: string; prefix: string }> {
  const hash = await bcrypt.hash(apiKey, SALT_ROUNDS);
  const prefix = apiKey.slice(0, API_KEY_PREFIX_LEN);
  return { hash, prefix };
}

export async function verifyApiKey(plainKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainKey, hash);
}

export async function getAgentByApiKey(apiKey: string): Promise<VerifiedAgent | null> {
  const prefix = apiKey.slice(0, API_KEY_PREFIX_LEN);
  const candidates = await prisma.agent.findMany({
    where: { apiKeyPrefix: prefix },
  });
  for (const agent of candidates) {
    if (!agent.apiKeyHash) continue;
    const ok = await verifyApiKey(apiKey, agent.apiKeyHash);
    if (!ok) continue;
    return {
      id: agent.id,
      displayName: agent.displayName ?? undefined,
    };
  }
  return null;
}

export function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "alm_";
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

export async function getAgentFromRequest(headers: Headers): Promise<VerifiedAgent | null> {
  const moltbookToken = headers.get("x-moltbook-identity");
  if (moltbookToken) {
    const moltbook = await verifyMoltbookToken(moltbookToken);
    if (moltbook) return getOrCreateAgentFromMoltbook(moltbook);
  }

  const apiKey = headers.get("x-agent-key");
  if (apiKey) return getAgentByApiKey(apiKey);

  return null;
}
