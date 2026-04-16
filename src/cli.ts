#!/usr/bin/env node

import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import {
  advanceTrain,
  checkoutTrainBranch,
  createStack,
  ensureTrainPrs,
  initConfig,
  openConfigInEditor,
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
    console.log(`Train: ${result.status.train.name}`);
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
  .command("status")
  .description("Show the resolved train status")
  .option("--train <name>", "train name")
  .action(async (options: { train?: string }) => {
    await runWithOutput(statusOperation(process.cwd(), options.train), program.opts().json ?? false);
  });

program
  .command("validate")
  .description("Validate stack config and branch existence")
  .option("--train <name>", "train name")
  .action(async (options: { train?: string }) => {
    await runWithOutput(validateRepo(process.cwd(), options.train), program.opts().json ?? false);
  });

program
  .command("sync")
  .description("Sync the current train by merging or rebasing through its branch chain")
  .option("--train <name>", "train name")
  .option("--strategy <strategy>", "merge or rebase")
  .option("--push", "push changed branches")
  .option("--force", "force push with lease")
  .option("--include-merged", "include merged branches in sync")
  .action(async (options: { train?: string; strategy?: "merge" | "rebase"; push?: boolean; force?: boolean; includeMerged?: boolean }) => {
    await runWithOutput(
      syncTrain(process.cwd(), options.train, {
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
  .option("--train <name>", "train name")
  .option("--draft", "create drafts")
  .option("--ready", "mark as ready (overrides draft)")
  .option("--print-urls", "print PR URLs in operations")
  .action(async (options: { train?: string; draft?: boolean; ready?: boolean; printUrls?: boolean }) => {
    await runWithOutput(
      ensureTrainPrs(process.cwd(), options.train, {
        draft: options.ready ? false : options.draft,
        printUrls: options.printUrls,
      }),
      program.opts().json ?? false,
    );
  });

program
  .command("advance")
  .description("Advance a stack after one or more leading branches have merged")
  .option("--train <name>", "train name")
  .option("--push", "push changed branches")
  .option("--force", "force push with lease")
  .option("--close-merged-prs", "close merged PRs after retargeting")
  .option("--comment-updated-prs <body>", "comment body for updated PRs")
  .action(async (options: {
    train?: string;
    push?: boolean;
    force?: boolean;
    closeMergedPrs?: boolean;
    commentUpdatedPrs?: string;
  }) => {
    await runWithOutput(
      advanceTrain(process.cwd(), options.train, {
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
  .option("--train <name>", "train name")
  .action(async (selector: string, options: { train?: string }) => {
    await runWithOutput(checkoutTrainBranch(process.cwd(), options.train, selector), program.opts().json ?? false);
  });

program
  .command("mcp")
  .description("Run the git-stack MCP server over stdio")
  .action(async () => {
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
