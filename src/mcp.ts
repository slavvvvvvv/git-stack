import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  advanceStack,
  checkoutStackBranch,
  ensureStackPrs,
  helpOperation,
  listStacksOperation,
  statusOperation,
  syncStack,
  validateRepo,
} from "./operations.js";
import { readCachedState } from "./state.js";
import { createRepoContext } from "./git.js";

function normalizeResult<T>(result: T): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

const MCP_RESOURCES = [
  "stack://repo/current/state",
  "stack://repo/current/stacks",
  "stack://repo/current/help",
];

const MCP_TOOLS = [
  "stack_help",
  "stack_list_stacks",
  "stack_get_stack",
  "stack_validate",
  "stack_sync_stack",
  "stack_ensure_prs",
  "stack_advance_stack",
  "stack_checkout_branch",
  "stack_refresh_metadata",
];

function logStartupBanner(cwd: string): void {
  const banner = [
    "   ____ _ _      _____ __             __",
    "  / __ (_) |_   / ___// /_____ ______/ /__",
    " / /_/ / / __/  \\__ \\/ __/ __ `/ ___/ //_/",
    "/ ____/ / /_   ___/ / /_/ /_/ / /__/ ,<",
    "/_/   /_/\\__/  /____/\\__/\\__,_/\\___/_/|_|",
  ].join("\n");

  const lines = [
    banner,
    "",
    "git-stack MCP server starting",
    `workspace: ${cwd}`,
    "transport: stdio",
    "status: listening",
    "",
    "resources:",
    ...MCP_RESOURCES.map((resource) => `  - ${resource}`),
    "",
    "tools:",
    ...MCP_TOOLS.map((tool) => `  - ${tool}`),
    "",
  ];

  console.error(lines.join("\n"));
}

export async function startMcpServer(cwd: string): Promise<void> {
  logStartupBanner(cwd);

  const server = new McpServer({
    name: "git-stack",
    version: "0.1.0",
  });

  server.resource("stack-current-state", "stack://repo/current/state", async () => {
    const { git } = await createRepoContext(cwd);
    const state = await readCachedState(git);
    return {
      contents: [
        {
          uri: "stack://repo/current/state",
          mimeType: "application/json",
          text: JSON.stringify(state, null, 2),
        },
      ],
    };
  });

  server.resource("stack-stacks", "stack://repo/current/stacks", async () => {
    const result = await listStacksOperation(cwd);
    return {
      contents: [
        {
          uri: "stack://repo/current/stacks",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              operations: result.operations ?? [],
            },
            null,
            2,
          ),
        },
      ],
    };
  });

  server.resource("stack-help", "stack://repo/current/help", async () => {
    const result = await helpOperation(undefined, "mcp");
    return {
      contents: [
        {
          uri: "stack://repo/current/help",
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  server.tool(
    "stack_help",
    {
      topic: z.string().optional(),
    },
    async ({ topic }) => normalizeResult(await helpOperation(topic, "mcp")),
  );

  server.tool(
    "stack_list_stacks",
    {
      cwd: z.string().optional(),
    },
    async ({ cwd: toolCwd }) => normalizeResult(await listStacksOperation(toolCwd ?? cwd)),
  );

  server.tool(
    "stack_get_stack",
    {
      stackName: z.string().optional(),
      cwd: z.string().optional(),
    },
    async ({ stackName, cwd: toolCwd }) => normalizeResult(await statusOperation(toolCwd ?? cwd, stackName)),
  );

  server.tool(
    "stack_validate",
    {
      stackName: z.string().optional(),
      cwd: z.string().optional(),
    },
    async ({ stackName, cwd: toolCwd }) => normalizeResult(await validateRepo(toolCwd ?? cwd, stackName)),
  );

  server.tool(
    "stack_sync_stack",
    {
      stackName: z.string().optional(),
      cwd: z.string().optional(),
      strategy: z.enum(["merge", "rebase"]).optional(),
      push: z.boolean().optional(),
      force: z.boolean().optional(),
      includeMerged: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    },
    async ({ stackName, cwd: toolCwd, ...options }) => normalizeResult(await syncStack(toolCwd ?? cwd, stackName, options)),
  );

  server.tool(
    "stack_ensure_prs",
    {
      stackName: z.string().optional(),
      cwd: z.string().optional(),
      draft: z.boolean().optional(),
      printUrls: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    },
    async ({ stackName, cwd: toolCwd, ...options }) => normalizeResult(await ensureStackPrs(toolCwd ?? cwd, stackName, options)),
  );

  server.tool(
    "stack_advance_stack",
    {
      stackName: z.string().optional(),
      cwd: z.string().optional(),
      push: z.boolean().optional(),
      force: z.boolean().optional(),
      closeMergedPrs: z.boolean().optional(),
      commentUpdatedPrs: z.string().nullable().optional(),
      dryRun: z.boolean().optional(),
    },
    async ({ stackName, cwd: toolCwd, ...options }) => normalizeResult(await advanceStack(toolCwd ?? cwd, stackName, options)),
  );

  server.tool(
    "stack_checkout_branch",
    {
      selector: z.string(),
      stackName: z.string().optional(),
      cwd: z.string().optional(),
    },
    async ({ selector, stackName, cwd: toolCwd }) =>
      normalizeResult(await checkoutStackBranch(toolCwd ?? cwd, stackName, selector)),
  );

  server.tool(
    "stack_refresh_metadata",
    {
      stackName: z.string().optional(),
      cwd: z.string().optional(),
    },
    async ({ stackName, cwd: toolCwd }) => normalizeResult(await statusOperation(toolCwd ?? cwd, stackName)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
