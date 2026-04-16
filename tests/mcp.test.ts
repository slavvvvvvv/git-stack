import { describe, expect, it } from "vitest";
import { renderHelp } from "../src/help.js";

describe("mcp surface", () => {
  it("keeps tool names stable", async () => {
    const module = await import("../src/mcp.js");
    expect(typeof module.startMcpServer).toBe("function");
  });

  it("renders mcp-specific help topics", () => {
    const help = renderHelp("mcp", "mcp");
    expect(help.message).toBe("Help: mcp");
    expect(help.lines.join(" ")).toContain("MCP server");
  });
});
