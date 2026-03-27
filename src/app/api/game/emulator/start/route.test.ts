import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mockGetAgentFromRequest = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockProfileFindUnique = vi.fn();
const mockEventLogCreate = vi.fn();
const mockSaveIntent = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAgentFromRequest: (...args: unknown[]) => mockGetAgentFromRequest(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/emulator-session-intent", () => ({
  setEmulatorStartIntent: (...args: unknown[]) => mockSaveIntent(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    agentProfile: {
      findUnique: (...args: unknown[]) => mockProfileFindUnique(...args),
    },
    eventLog: {
      create: (...args: unknown[]) => mockEventLogCreate(...args),
    },
    agentEmulatorSave: {
      findFirst: vi.fn(),
    },
  },
}));

describe("POST /api/game/emulator/start", () => {
  beforeEach(() => {
    mockGetAgentFromRequest.mockResolvedValue({ id: "agent-1", displayName: "Agent One" });
    mockCheckRateLimit.mockReturnValue(true);
    mockProfileFindUnique.mockResolvedValue({ name: "Agent One" });
    mockEventLogCreate.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  it("accepts numeric speed provided as string and forwards normalized value", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ agent_ids: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, agent_id: "agent-1", session_id: "s-1" }), { status: 200 }));

    const req = new Request("http://localhost:3000/api/game/emulator/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agent-Key": "k" },
      body: JSON.stringify({ mode: "new", starter: "charmander", speed: "2" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const startCall = fetchMock.mock.calls[1];
    const startBody = JSON.parse(String((startCall[1] as RequestInit).body));
    expect(startBody.speed).toBe(2);
  });
});
