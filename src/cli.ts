#!/usr/bin/env node

import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { installMcpIntoTarget, type McpInstallTarget } from "./install.js";
import {
  advanceTrain,
  checkoutTrainBranch,
  createStack,
  ensureTrainPrs,
  helpOperation,
  initConfig,
  openConfigInEditor,
  pushTrain,
  pushBranchOntoTrain,
  statusOperation,
  syncTrain,
  validateRepo,
} from "./operations.js";
import { startMcpServer } from "./mcp.js";
import type { OperationResult } from "./types.js";

function printResult(result: OperationResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(result.message);
  if (result.operations && result.operations.length > 0) {
    console.log(result.operations.map((operation) => ` - ${operation}`).join("\n"));
  }
  if (result.status) {
    console.log(`Stack: ${result.status.train.name}`);
    console.log(`Current branch: ${result.status.currentBranch}`);
    for (const branch of result.status.branches) {
      const flags = [
        branch.isCurrent ? "current" : null,
        branch.isMerged ? "merged" : "active",
        branch.role === "combined" ? "combined" : null,
      ].filter(Boolean);
      const prText = branch.pr ? ` PR #${branch.pr.number}` : "";
      console.log(` - ${branch.name} [${flags.join(", ")}]${prText}`);
    }
  }
  if (result.warnings.length > 0) {
    console.error(result.warnings.map((warning) => `warning: ${warning}`).join("\n"));
  }
}

async function runWithOutput(action: Promise<OperationResult>, asJson: boolean): Promise<void> {
  const result = await action;
  printResult(result, asJson);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

const program = new Command();
program.name("git stack").version(pkg.version);
program.addHelpCommand(false);
program.option("--json", "print JSON output");

program
  .command("init")
  .description("Create a .stack.yml config from the bundled template")
  .action(async () => {
    await runWithOutput(initConfig(process.cwd()), program.opts().json ?? false);
  });

program
  .command("config")
  .description("Open the repo .stack.yml in the configured editor")
  .action(async () => {
    await runWithOutput(openConfigInEditor(process.cwd()), program.opts().json ?? false);
  });

program
  .command("create <branches...>")
  .description("Create a new stack from the current branch and add it to .stack.yml")
  .action(async (branches: string[]) => {
    await runWithOutput(createStack(process.cwd(), branches), program.opts().json ?? false);
  });

program
  .command("add <stack>")
  .description("Add the current branch onto an existing stack by name")
  .action(async (stack: string) => {
    await runWithOutput(pushBranchOntoTrain(process.cwd(), stack), program.opts().json ?? false);
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
      await runWithOutput(
        pushTrain(process.cwd(), options.stack, {
          strategy: options.strategy,
          force: options.force,
          includeMerged: options.includeMerged,
          draft: options.ready ? false : options.draft,
          printUrls: options.printUrls,
        }),
        program.opts().json ?? false,
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
    await runWithOutput(statusOperation(process.cwd(), options.stack), program.opts().json ?? false);
  });

program
  .command("validate")
  .description("Validate stack config and branch existence")
  .option("--stack <name>", "stack name")
  .action(async (options: { stack?: string }) => {
    await runWithOutput(validateRepo(process.cwd(), options.stack), program.opts().json ?? false);
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
      syncTrain(process.cwd(), options.stack, {
        strategy: options.strategy,
        push: options.push,
        force: options.force,
        includeMerged: options.includeMerged,
      }),
      program.opts().json ?? false,
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
      ensureTrainPrs(process.cwd(), options.stack, {
        draft: options.ready ? false : options.draft,
        printUrls: options.printUrls,
      }),
      program.opts().json ?? false,
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
      advanceTrain(process.cwd(), options.stack, {
        push: options.push,
        force: options.force,
        closeMergedPrs: options.closeMergedPrs,
        commentUpdatedPrs: options.commentUpdatedPrs ?? null,
      }),
      program.opts().json ?? false,
    );
  });

program
  .command("checkout <selector>")
  .description("Checkout a branch by index, name, or 'combined'")
  .option("--stack <name>", "stack name")
  .action(async (selector: string, options: { stack?: string }) => {
    await runWithOutput(checkoutTrainBranch(process.cwd(), options.stack, selector), program.opts().json ?? false);
  });

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
    await runWithOutput(installMcpIntoTarget(target), program.opts().json ?? false);
  });

mcp.action(async () => {
  await startMcpServer(process.cwd());
});

program.action(async () => {
  await runWithOutput(statusOperation(process.cwd()), program.opts().json ?? false);
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
