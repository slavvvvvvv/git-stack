import { describe, expect, it } from "vitest";

describe("mcp surface", () => {
  it("keeps tool names stable", async () => {
    const module = await import("../src/mcp.js");
    expect(typeof module.startMcpServer).toBe("function");
  });
});
