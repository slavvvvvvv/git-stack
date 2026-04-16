import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  advanceTrain,
  checkoutTrainBranch,
  ensureTrainPrs,
  helpOperation,
  listTrainsOperation,
  statusOperation,
  syncTrain,
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
  "stack://repo/current/trains",
  "stack://repo/current/help",
];

const MCP_TOOLS = [
  "stack_help",
  "stack_list_trains",
  "stack_get_train",
  "stack_validate",
  "stack_sync_train",
  "stack_ensure_prs",
  "stack_advance_train",
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

  server.resource("stack-trains", "stack://repo/current/trains", async () => {
    const result = await listTrainsOperation(cwd);
    return {
      contents: [
        {
          uri: "stack://repo/current/trains",
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
    "stack_list_trains",
    {
      cwd: z.string().optional(),
    },
    async ({ cwd: toolCwd }) => normalizeResult(await listTrainsOperation(toolCwd ?? cwd)),
  );

  server.tool(
    "stack_get_train",
    {
      trainName: z.string().optional(),
      cwd: z.string().optional(),
    },
    async ({ trainName, cwd: toolCwd }) => normalizeResult(await statusOperation(toolCwd ?? cwd, trainName)),
  );

  server.tool(
    "stack_validate",
    {
      trainName: z.string().optional(),
      cwd: z.string().optional(),
    },
    async ({ trainName, cwd: toolCwd }) => normalizeResult(await validateRepo(toolCwd ?? cwd, trainName)),
  );

  server.tool(
    "stack_sync_train",
    {
      trainName: z.string().optional(),
      cwd: z.string().optional(),
      strategy: z.enum(["merge", "rebase"]).optional(),
      push: z.boolean().optional(),
      force: z.boolean().optional(),
      includeMerged: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    },
    async ({ trainName, cwd: toolCwd, ...options }) => normalizeResult(await syncTrain(toolCwd ?? cwd, trainName, options)),
  );

  server.tool(
    "stack_ensure_prs",
    {
      trainName: z.string().optional(),
      cwd: z.string().optional(),
      draft: z.boolean().optional(),
      printUrls: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    },
    async ({ trainName, cwd: toolCwd, ...options }) => normalizeResult(await ensureTrainPrs(toolCwd ?? cwd, trainName, options)),
  );

  server.tool(
    "stack_advance_train",
    {
      trainName: z.string().optional(),
      cwd: z.string().optional(),
      push: z.boolean().optional(),
      force: z.boolean().optional(),
      closeMergedPrs: z.boolean().optional(),
      commentUpdatedPrs: z.string().nullable().optional(),
      dryRun: z.boolean().optional(),
    },
    async ({ trainName, cwd: toolCwd, ...options }) => normalizeResult(await advanceTrain(toolCwd ?? cwd, trainName, options)),
  );

  server.tool(
    "stack_checkout_branch",
    {
      selector: z.string(),
      trainName: z.string().optional(),
      cwd: z.string().optional(),
    },
    async ({ selector, trainName, cwd: toolCwd }) =>
      normalizeResult(await checkoutTrainBranch(toolCwd ?? cwd, trainName, selector)),
  );

  server.tool(
    "stack_refresh_metadata",
    {
      trainName: z.string().optional(),
      cwd: z.string().optional(),
    },
    async ({ trainName, cwd: toolCwd }) => normalizeResult(await statusOperation(toolCwd ?? cwd, trainName)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
