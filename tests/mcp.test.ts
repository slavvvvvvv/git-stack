import { describe, expect, it } from "vitest";
import { installMcpIntoTarget } from "../src/install.js";
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

  it("reports pi as unsupported for mcp installation", async () => {
    const result = await installMcpIntoTarget("pi");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("does not support MCP");
  });
});
