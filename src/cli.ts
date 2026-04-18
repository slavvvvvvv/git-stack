#!/usr/bin/env node

import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { printResult, printStepResult, runStepWithOutput, runWithOutput } from "./cli-ui.js";
import { installMcpIntoTarget, type McpInstallTarget } from "./install.js";
import {
  addBranchToStack,
  advanceStack,
  checkoutStackBranch,
  createStack,
  ensureStackPrs,
  helpOperation,
  initConfig,
  openConfigInEditor,
  pushStack,
  restackStack,
  statusOperation,
  syncStack,
  validateRepo,
} from "./operations.js";
import { startMcpServer } from "./mcp.js";

const program = new Command();
program.name("git stack").version(pkg.version);
program.addHelpCommand(false);
program.option("--json", "print JSON output");

program
  .command("init")
  .description("Create the global stacks config from the bundled template")
  .action(async () => {
    await runWithOutput(initConfig(process.cwd()), program.opts().json ?? false, "Creating stack config");
  });

program
  .command("config")
  .description("Open the global stacks config in the configured editor")
  .action(async () => {
    await runWithOutput(openConfigInEditor(process.cwd()), program.opts().json ?? false, "Opening stack config");
  });

program
  .command("create <branches...>")
  .description("Create a new stack from the current branch and add it to the global stacks file")
  .action(async (branches: string[]) => {
    await runWithOutput(createStack(process.cwd(), branches), program.opts().json ?? false, "Creating stack");
  });

program
  .command("add <stack>")
  .description("Add the current branch onto an existing stack by name")
  .action(async (stack: string) => {
    await runWithOutput(addBranchToStack(process.cwd(), stack), program.opts().json ?? false, "Updating stack");
  });

program
  .command("push")
  .description("Push the current stack and create stacked PRs with stack-table descriptions")
  .option("--stack <name>", "stack name")
  .option("--strategy <strategy>", "merge or rebase")
  .option("--force", "force push with lease")
  .option("--include-merged", "include merged branches in sync")
  .option("--draft", "create drafts")
  .option("--ready", "mark as ready (overrides draft)")
  .option("--print-urls", "print PR URLs in operations")
  .action(
    async (options: {
      stack?: string;
      strategy?: "merge" | "rebase";
      force?: boolean;
      includeMerged?: boolean;
      draft?: boolean;
      ready?: boolean;
      printUrls?: boolean;
    }) => {
      const asJson = program.opts().json ?? false;

      const syncResult = await runStepWithOutput(
        syncStack(process.cwd(), options.stack, {
          strategy: options.strategy,
          push: true,
          force: options.force,
          includeMerged: options.includeMerged,
        }),
        asJson,
        "Syncing and pushing stack branches",
        "Synced and pushed stack branches",
      );

      if (asJson) {
        if (!syncResult.ok) {
          printResult(syncResult, true);
          if (!syncResult.ok) {
            process.exitCode = 1;
          }
          return;
        }

        const ensureResult = await ensureStackPrs(process.cwd(), options.stack, {
          draft: options.ready ? false : options.draft,
          printUrls: options.printUrls,
        });
        const result: typeof ensureResult = {
          ...ensureResult,
          message: "Stack pushed and PRs ensured with stack tables in the PR descriptions.",
          warnings: [...syncResult.warnings, ...ensureResult.warnings],
          operations: [...(syncResult.operations ?? []), ...(ensureResult.operations ?? [])],
          status: ensureResult.status ?? syncResult.status,
        };
        printResult(result, true);
        if (!result.ok) {
          process.exitCode = 1;
        }
        return;
      }

      printStepResult("Sync actions", syncResult);
      if (!syncResult.ok) {
        process.exitCode = 1;
        return;
      }

      const ensureResult = await runStepWithOutput(
        ensureStackPrs(process.cwd(), options.stack, {
          draft: options.ready ? false : options.draft,
          printUrls: options.printUrls,
        }),
        false,
        "Creating and updating stacked PRs",
        "Created and updated stacked PRs",
      );

      printStepResult("PR actions", ensureResult);

      const finalResult = {
        ...ensureResult,
        message: "Stack pushed and PRs ensured with stack tables in the PR descriptions.",
        warnings: [...syncResult.warnings, ...ensureResult.warnings],
        operations: [...(syncResult.operations ?? []), ...(ensureResult.operations ?? [])],
        status: ensureResult.status ?? syncResult.status,
      };

      printResult(finalResult, false);
      if (!finalResult.ok) {
        process.exitCode = 1;
      }
    },
  );

program
  .command("restack")
  .description("Rebase downstream stack branches onto the current branch in sequence")
  .option("--stack <name>", "stack name")
  .option("--from <selector>", "starting branch selector", "current")
  .option("--to <selector>", "ending branch selector")
  .option("--include-combined", "include combined branch in the restack range")
  .option("--checkout <target>", "where to end after restacking: original or last", "original")
  .action(
    async (options: {
      stack?: string;
      from?: string;
      to?: string;
      includeCombined?: boolean;
      checkout?: "original" | "last";
    }) => {
      await runWithOutput(
        restackStack(process.cwd(), options.stack, {
          from: options.from,
          to: options.to,
          includeCombined: options.includeCombined,
          checkout: options.checkout,
        }),
        program.opts().json ?? false,
        "Restacking downstream branches",
      );
    },
  );

program
  .command("help [topic]")
  .description("Explain how git-stack works for a given topic")
  .action(async (topic?: string) => {
    await runWithOutput(helpOperation(topic, "cli"), program.opts().json ?? false);
  });

program
  .command("status")
  .description("Show the resolved stack status")
  .option("--stack <name>", "stack name")
  .action(async (options: { stack?: string }) => {
    await runWithOutput(statusOperation(process.cwd(), options.stack), program.opts().json ?? false, "Resolving stack status");
  });

program
  .command("validate")
  .description("Validate stack config and branch existence")
  .option("--stack <name>", "stack name")
  .action(async (options: { stack?: string }) => {
    await runWithOutput(validateRepo(process.cwd(), options.stack), program.opts().json ?? false, "Validating stack");
  });

program
  .command("sync")
  .description("Sync the current stack by merging or rebasing through its branch chain")
  .option("--stack <name>", "stack name")
  .option("--strategy <strategy>", "merge or rebase")
  .option("--push", "push changed branches")
  .option("--force", "force push with lease")
  .option("--include-merged", "include merged branches in sync")
  .action(async (options: { stack?: string; strategy?: "merge" | "rebase"; push?: boolean; force?: boolean; includeMerged?: boolean }) => {
    await runWithOutput(
      syncStack(process.cwd(), options.stack, {
        strategy: options.strategy,
        push: options.push,
        force: options.force,
        includeMerged: options.includeMerged,
      }),
      program.opts().json ?? false,
      "Syncing stack",
    );
  });

const prs = program.command("prs").description("Manage pull requests for the current stack");
prs
  .command("ensure")
  .option("--stack <name>", "stack name")
  .option("--draft", "create drafts")
  .option("--ready", "mark as ready (overrides draft)")
  .option("--print-urls", "print PR URLs in operations")
  .action(async (options: { stack?: string; draft?: boolean; ready?: boolean; printUrls?: boolean }) => {
    await runWithOutput(
      ensureStackPrs(process.cwd(), options.stack, {
        draft: options.ready ? false : options.draft,
        printUrls: options.printUrls,
      }),
      program.opts().json ?? false,
      "Ensuring stack PRs",
    );
  });

program
  .command("advance")
  .description("Advance a stack after one or more leading branches have merged")
  .option("--stack <name>", "stack name")
  .option("--push", "push changed branches")
  .option("--force", "force push with lease")
  .option("--close-merged-prs", "close merged PRs after retargeting")
  .option("--comment-updated-prs <body>", "comment body for updated PRs")
  .action(async (options: {
    stack?: string;
    push?: boolean;
    force?: boolean;
    closeMergedPrs?: boolean;
    commentUpdatedPrs?: string;
  }) => {
    await runWithOutput(
      advanceStack(process.cwd(), options.stack, {
        push: options.push,
        force: options.force,
        closeMergedPrs: options.closeMergedPrs,
        commentUpdatedPrs: options.commentUpdatedPrs ?? null,
      }),
      program.opts().json ?? false,
      "Advancing stack",
    );
  });

function registerCheckoutCommand(commandName: string): void {
  program
    .command(`${commandName} <selector>`)
    .description("Checkout a branch by first, last, next, previous, index, name, or 'combined'")
    .option("--stack <name>", "stack name")
    .action(async (selector: string, options: { stack?: string }) => {
      await runWithOutput(checkoutStackBranch(process.cwd(), options.stack, selector), program.opts().json ?? false, "Checking out branch");
  });
}

registerCheckoutCommand("checkout");
registerCheckoutCommand("c");

const mcp = program.command("mcp").description("Run the git-stack MCP server or manage client installs");

mcp
  .command("install")
  .description("Install git-stack as an MCP server into a supported client")
  .argument("<target>", "client to install into", (value: string) => {
    if (["codex", "claude", "pi", "opencode"].includes(value)) {
      return value as McpInstallTarget;
    }
    throw new Error(`Unsupported install target: ${value}`);
  })
  .action(async (target: McpInstallTarget) => {
    await runWithOutput(installMcpIntoTarget(target), program.opts().json ?? false, `Installing MCP into ${target}`);
  });

mcp.action(async () => {
  await startMcpServer(process.cwd());
});

program.action(async () => {
  await runWithOutput(statusOperation(process.cwd()), program.opts().json ?? false, "Resolving stack status");
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
