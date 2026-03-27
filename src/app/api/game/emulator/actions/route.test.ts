import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mockGetAgentFromRequest = vi.fn();
const mockLogLiveActivityFromStep = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAgentFromRequest: (...args: unknown[]) => mockGetAgentFromRequest(...args),
}));

vi.mock("@/lib/live-activity", () => ({
  logLiveActivityFromStep: (...args: unknown[]) => mockLogLiveActivityFromStep(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    agentProfile: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

vi.mock("@/lib/emulator-session-intent", () => ({
  getEmulatorStartIntent: () => ({
    starter: "bulbasaur",
    speed: 2,
    loadSessionId: "save-1",
    updatedAt: Date.now(),
  }),
}));

describe("POST /api/game/emulator/actions", () => {
  beforeEach(() => {
    mockGetAgentFromRequest.mockResolvedValue({ id: "agent-1", displayName: "Agent 1" });
    mockLogLiveActivityFromStep.mockResolvedValue(undefined);
    mockUpdateMany.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  it("returns 400 when action list contains invalid tokens", async () => {
    const req = new Request("http://localhost:3000/api/game/emulator/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agent-Key": "k" },
      body: JSON.stringify({ actions: ["up", "bad-action"] }),
    });

    const res = await POST(req);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid actions provided");
    expect(Array.isArray(body.invalidActions)).toBe(true);
  });

  it("forwards auth + restart intent on 404 self-heal", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "No session" }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, state: { mapName: "Pallet Town" }, feedback: { effects: [] } }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response("", { status: 404 }));

    const req = new Request("http://localhost:3000/api/game/emulator/actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Key": "api-key",
        "X-Moltbook-Identity": "mb-token",
      },
      body: JSON.stringify({ actions: ["up"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const restartCall = fetchMock.mock.calls[1];
    const restartInit = restartCall[1] as RequestInit;
    const restartBody = JSON.parse(String(restartInit.body));
    const restartHeaders = restartInit.headers as Record<string, string>;

    expect(String(restartCall[0])).toContain("/api/game/emulator/start");
    expect(restartHeaders["X-Agent-Key"]).toBe("api-key");
    expect(restartHeaders["X-Moltbook-Identity"]).toBe("mb-token");
    expect(restartBody.mode).toBe("restart");
    expect(restartBody.starter).toBe("bulbasaur");
    expect(restartBody.speed).toBe(2);
    expect(restartBody.loadSessionId).toBe("save-1");
  });
});
