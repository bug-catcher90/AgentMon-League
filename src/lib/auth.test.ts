import { describe, expect, it, vi } from "vitest";
import * as authModule from "./auth";

const mockFindMany = vi.fn();
const mockCompare = vi.fn();

vi.mock("./db", () => ({
  prisma: {
    agent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mockCompare(...args),
  },
}));

describe("auth key lookup", () => {
  it("checks all prefix candidates before rejecting", async () => {
    mockFindMany.mockResolvedValue([
      { id: "a1", displayName: "Wrong", apiKeyHash: "hash-wrong" },
      { id: "a2", displayName: "Right", apiKeyHash: "hash-right" },
    ]);
    mockCompare.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const out = await authModule.getAgentByApiKey("alm_1234567890");

    expect(mockCompare).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ id: "a2", displayName: "Right" });
  });
});
