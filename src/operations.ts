import { spawnSync } from "node:child_process";
import { createDefaultRepoDefaults, loadGlobalConfig, loadStackConfig } from "./config.js";
import { getGlobalStacksPath, getRepoConfigPath, writeStackConfig, writeTemplateConfig } from "./config.js";
import { closePullRequest, commentOnPullRequest, createOctokit, ensurePullRequests } from "./github.js";
import { renderHelp, type HelpSurface } from "./help.js";
import {
  branchExists,
  checkoutBranch,
  combineEdge,
  createBranchFrom,
  createRepoContext,
  ensureCombinedBranch,
  getCurrentBranch,
  getUnmergedBranches,
  isAncestor,
  normalBranches,
  pushBranches,
} from "./git.js";
import { writeCachedState } from "./state.js";
import { getTrainStatus, normalActiveBranches, resolveTrain } from "./train.js";
import type {
  AdvanceOptions,
  EnsurePrsOptions,
  OperationResult,
  SyncOptions,
  TrainStatus,
} from "./types.js";

export async function validateRepo(cwd: string, trainName?: string): Promise<OperationResult> {
  const status = await getTrainStatus(cwd, trainName);
  const missingBranches = status.branches.filter((branch) => !branch.existsLocally).map((branch) => branch.name);
  const warnings = [...status.warnings];
  if (missingBranches.length > 0) {
    warnings.push(`Missing local branches: ${missingBranches.join(", ")}`);
  }

  return {
    ok: missingBranches.length === 0,
    message: missingBranches.length === 0 ? "Validation passed." : "Validation found missing branches.",
    warnings,
    status,
  };
}

export async function syncTrain(cwd: string, trainName: string | undefined, options: SyncOptions): Promise<OperationResult> {
  const { git, repoPath } = await createRepoContext(cwd);
  const { train, config } = await resolveTrain(git, trainName, repoPath);
  const currentBranch = await getCurrentBranch(git);
  const strategy = options.strategy ?? config.defaults.sync.strategy;
  const combinedBranch = await ensureCombinedBranch(git, train);
  const operations: string[] = [];
  const branches = train.branches.map((branch) => branch.name);
  const branchesToSync = options.includeMerged ? branches : await getUnmergedBranches(git, branches, train.syncBase);

  for (let index = 0; index < branchesToSync.length - 1; index += 1) {
    const fromBranch = branchesToSync[index];
    const toBranch = branchesToSync[index + 1];
    if (!fromBranch || !toBranch) {
      continue;
    }
    const alreadyAncestor = await isAncestor(git, fromBranch, toBranch);
    if (alreadyAncestor) {
      operations.push(`skip:${fromBranch}->${toBranch}`);
      continue;
    }

    operations.push(`${strategy}:${fromBranch}->${toBranch}`);
    if (!options.dryRun) {
      await combineEdge(git, fromBranch, toBranch, strategy);
    }
  }

  if (options.push) {
    operations.push(`push:${branchesToSync.join(",")}`);
    if (!options.dryRun) {
      await pushBranches(git, branchesToSync, config.defaults.remote, options.force ?? false);
    }
  }

  if (!options.dryRun) {
    await checkoutBranch(git, currentBranch);
  }

  const status = await getTrainStatus(cwd, train.name);
  await writeCachedState(git, status);

  return {
    ok: true,
    message: "Stack synced.",
    warnings: status.warnings,
    operations,
    status: {
      ...status,
      combinedBranch,
    },
  };
}

export async function ensureTrainPrs(
  cwd: string,
  trainName: string | undefined,
  options: EnsurePrsOptions,
): Promise<OperationResult> {
  const { git, repoPath } = await createRepoContext(cwd);
  const { train, config } = await resolveTrain(git, trainName, repoPath);
  const globalConfig = loadGlobalConfig();
  const { octokit, coords } = await createOctokit(git, config.defaults, globalConfig.github?.token);
  const ownerResponse = await octokit.repos.get({ owner: coords.owner, repo: coords.repo });
  const owner = ownerResponse.data.owner.login;
  const status = await getTrainStatus(cwd, train.name);
  const result = await ensurePullRequests(git, octokit, coords, owner, train, status, config.defaults, options);
  await writeCachedState(git, result.status);

  return {
    ok: true,
    message: "PRs ensured.",
    warnings: result.status.warnings,
    operations: result.operations,
    status: result.status,
  };
}

function computeAdvanceComment(explicitComment: string | null | undefined, configuredComment: string | null): string | null {
  if (explicitComment != null) {
    return explicitComment;
  }

  return configuredComment;
}

export async function advanceTrain(
  cwd: string,
  trainName: string | undefined,
  options: AdvanceOptions,
): Promise<OperationResult> {
  const { git, repoPath } = await createRepoContext(cwd);
  const { train, config } = await resolveTrain(git, trainName, repoPath);
  const globalConfig = loadGlobalConfig();
  const status = await getTrainStatus(cwd, train.name);
  const operations: string[] = [];
  const activeNormal = normalActiveBranches(status);
  const mergedBranches = status.branches.filter((branch) => branch.isMerged && branch.role !== "combined");
  const nextHead = activeNormal[0];

  if (!nextHead) {
    return {
      ok: true,
      message: "No active branches remain to advance.",
      warnings: status.warnings,
      operations,
      status,
    };
  }

  operations.push(`advance-head:${nextHead.name}->${train.syncBase}`);
  if (!options.dryRun) {
    await checkoutBranch(git, nextHead.name);
    await git.rebase([train.syncBase]);
  }

  const descendants = activeNormal.slice(1).map((branch) => branch.name);
  let previous = nextHead.name;
  for (const branchName of descendants) {
    operations.push(`rebase-descendant:${branchName}->${previous}`);
    if (!options.dryRun) {
      await checkoutBranch(git, branchName);
      await git.rebase([previous]);
    }
    previous = branchName;
  }

  const combinedBranch = await ensureCombinedBranch(git, train);
  if (combinedBranch && previous !== combinedBranch) {
    operations.push(`rebase-combined:${combinedBranch}->${previous}`);
    if (!options.dryRun) {
      await checkoutBranch(git, combinedBranch);
      await git.rebase([previous]);
    }
  }

  if (options.push) {
    const branchNames = [nextHead.name, ...descendants, ...(combinedBranch ? [combinedBranch] : [])];
    operations.push(`push:${branchNames.join(",")}`);
    if (!options.dryRun) {
      await pushBranches(git, branchNames, config.defaults.remote, options.force ?? false);
    }
  }

  const updatedStatus = await getTrainStatus(cwd, train.name);
  const remainingActive = updatedStatus.branches.filter((branch) => branch.isActive);
  const { octokit, coords } = await createOctokit(git, config.defaults, globalConfig.github?.token);
  const commentBody = computeAdvanceComment(options.commentUpdatedPrs, config.defaults.prs.commentOnUpdate);

  for (const [index, branch] of remainingActive.entries()) {
    if (!branch.pr) {
      continue;
    }

    const newBase = index === 0 || branch.role === "combined" ? train.prTarget : remainingActive[index - 1]?.name ?? train.prTarget;
    if (branch.pr.baseBranch !== newBase) {
      operations.push(`retarget-pr:${branch.name}->${newBase}`);
      if (!options.dryRun) {
        await octokit.pulls.update({
          owner: coords.owner,
          repo: coords.repo,
          pull_number: branch.pr.number,
          base: newBase,
        });
      }
    }

    if (commentBody) {
      operations.push(`comment-pr:${branch.name}`);
      await commentOnPullRequest(octokit, coords, branch.pr.number, commentBody, options.dryRun ?? false);
    }
  }

  if (options.closeMergedPrs ?? config.defaults.lifecycle.closeMergedPrs) {
    for (const branch of mergedBranches) {
      if (!branch.pr || branch.pr.state === "closed") {
        continue;
      }
      operations.push(`close-pr:${branch.name}`);
      await closePullRequest(octokit, coords, branch.pr.number, options.dryRun ?? false);
    }
  }

  return {
    ok: true,
    message: "Stack advanced.",
    warnings: updatedStatus.warnings,
    operations,
    status: updatedStatus,
  };
}

export async function checkoutTrainBranch(
  cwd: string,
  trainName: string | undefined,
  selector: string,
): Promise<OperationResult> {
  const { git } = await createRepoContext(cwd);
  const status = await getTrainStatus(cwd, trainName);
  const targetBranch = resolveCheckoutSelector(status, selector);

  if (!targetBranch) {
    throw new Error(`Could not resolve branch selector "${selector}".`);
  }

  await checkoutBranch(git, targetBranch);
  const nextStatus = await getTrainStatus(cwd, status.train.name);

  return {
    ok: true,
    message: `Checked out ${targetBranch}.`,
    warnings: nextStatus.warnings,
    status: nextStatus,
  };
}

export function resolveCheckoutSelector(status: TrainStatus, selector: string): string | undefined {
  if (selector === "combined") {
    return status.combinedBranch ?? undefined;
  }

  if (selector === "first") {
    return status.branches[0]?.name;
  }

  if (selector === "last") {
    return status.branches.at(-1)?.name;
  }

  if (selector === "next" || selector === "previous") {
    const currentIndex = status.branches.findIndex((branch) => branch.name === status.currentBranch);
    if (currentIndex < 0) {
      return undefined;
    }
    const offset = selector === "next" ? 1 : -1;
    return status.branches[currentIndex + offset]?.name;
  }

  const maybeIndex = Number(selector);
  if (Number.isInteger(maybeIndex) && `${maybeIndex}` === selector) {
    return status.branches[maybeIndex]?.name;
  }

  return status.branches.find((branch) => branch.name === selector)?.name;
}

export async function statusOperation(cwd: string, trainName?: string): Promise<OperationResult> {
  const status = await getTrainStatus(cwd, trainName);
  return {
    ok: true,
    message: "Status resolved.",
    warnings: status.warnings,
    status,
  };
}

export async function listTrainsOperation(cwd: string): Promise<OperationResult> {
  const { repoPath } = await createRepoContext(cwd);
  const config = loadStackConfig(repoPath);
  return {
    ok: true,
    message: "Stacks listed.",
    warnings: [],
    operations: config.trains.map((train) => `stack:${train.name}`),
  };
}

export async function initConfig(cwd: string): Promise<OperationResult> {
  await createRepoContext(cwd);
  const configPath = getGlobalStacksPath();
  if (await import("node:fs").then((mod) => mod.existsSync(configPath))) {
    throw new Error(`Config already exists at ${configPath}`);
  }

  writeTemplateConfig(configPath);

  return {
    ok: true,
    message: `Created ${configPath}.`,
    warnings: [],
  };
}

export function getConfiguredEditor(env: NodeJS.ProcessEnv): string | null {
  if (env.EDITOR && env.EDITOR.trim().length > 0) {
    return env.EDITOR;
  }

  if (env.VISUAL && env.VISUAL.trim().length > 0) {
    return env.VISUAL;
  }

  return null;
}

export async function openConfigInEditor(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<OperationResult> {
  await createRepoContext(cwd);
  const configPath = getGlobalStacksPath();
  const editor = getConfiguredEditor(env);

  if (!editor) {
    throw new Error("No editor configured. Set EDITOR or VISUAL.");
  }

  if (!(await import("node:fs").then((mod) => mod.existsSync(configPath)))) {
    writeTemplateConfig(configPath);
  }

  const result = spawnSync(editor, [configPath], {
    stdio: "inherit",
    shell: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`Editor exited with status ${result.status}.`);
  }

  return {
    ok: true,
    message: `Opened ${configPath} in ${editor}.`,
    warnings: [],
    operations: [`open-config:${configPath}`],
  };
}

export async function createStack(cwd: string, branchNames: string[]): Promise<OperationResult> {
  if (branchNames.length === 0) {
    throw new Error("At least one branch name is required.");
  }

  const uniqueNames = new Set(branchNames);
  if (uniqueNames.size !== branchNames.length) {
    throw new Error("Branch names must be unique.");
  }

  const { git, repoPath } = await createRepoContext(cwd);
  const currentBranch = await getCurrentBranch(git);
  const trainName = branchNames[0] ?? "";

  for (const branchName of branchNames) {
    if (await branchExists(git, branchName)) {
      throw new Error(`Branch "${branchName}" already exists.`);
    }
  }

  const configPath = getGlobalStacksPath();
  let defaults = createDefaultRepoDefaults();
  let trains = [] as ReturnType<typeof loadStackConfig>["trains"];

  if (await import("node:fs").then((mod) => mod.existsSync(configPath))) {
    const loadedConfig = loadStackConfig(repoPath);
    if (loadedConfig.trains.some((train) => train.name === trainName)) {
      throw new Error(`Stack "${trainName}" already exists in ${configPath}.`);
    }
    defaults = loadedConfig.defaults;
    trains = loadedConfig.trains;
  }

  const operations: string[] = [];
  let parentRef = currentBranch;
  for (const branchName of branchNames) {
    await createBranchFrom(git, branchName, parentRef);
    operations.push(`create-branch:${branchName}<-${parentRef}`);
    parentRef = branchName;
  }

  await checkoutBranch(git, trainName);

  writeStackConfig(repoPath, {
    defaults,
    trains: [
      ...trains,
      {
        name: trainName,
        syncBase: currentBranch,
        prTarget: currentBranch,
        branches: branchNames.map((name) => ({ name, role: "normal" })),
      },
    ],
  });

  operations.push(`write-stack:${trainName}`);

  return {
    ok: true,
    message: `Created stack "${trainName}" from ${currentBranch}.`,
    warnings: [],
    operations,
  };
}

export async function pushBranchOntoTrain(cwd: string, trainName: string): Promise<OperationResult> {
  const { git, repoPath } = await createRepoContext(cwd);
  const config = loadStackConfig(repoPath);
  const currentBranch = await getCurrentBranch(git);
  const targetTrain = config.trains.find((train) => train.name === trainName);

  if (!targetTrain) {
    throw new Error(`Stack "${trainName}" was not found.`);
  }

  const existingTrainWithBranch = config.trains.find((train) =>
    train.branches.some((branch) => branch.name === currentBranch),
  );
  if (existingTrainWithBranch) {
    if (existingTrainWithBranch.name === trainName) {
      throw new Error(`Branch "${currentBranch}" is already part of stack "${trainName}".`);
    }
    throw new Error(
      `Branch "${currentBranch}" is already part of stack "${existingTrainWithBranch.name}" and cannot be added to "${trainName}".`,
    );
  }

  const combinedIndex = targetTrain.branches.findIndex((branch) => branch.role === "combined");
  const nextBranches = [...targetTrain.branches];
  if (combinedIndex >= 0) {
    nextBranches.splice(combinedIndex, 0, { name: currentBranch, role: "normal" });
  } else {
    nextBranches.push({ name: currentBranch, role: "normal" });
  }

  writeStackConfig(repoPath, {
    defaults: config.defaults,
    trains: config.trains.map((train) => {
      if (train.name !== trainName) {
        return train;
      }

      return {
        ...train,
        branches: nextBranches,
      };
    }),
  });

  return {
    ok: true,
    message: `Added branch "${currentBranch}" to stack "${trainName}".`,
    warnings: [],
    operations: [`add-branch:${currentBranch}->${trainName}`],
  };
}

export async function pushTrain(
  cwd: string,
  trainName: string | undefined,
  options: SyncOptions & EnsurePrsOptions,
): Promise<OperationResult> {
  const syncResult = await syncTrain(cwd, trainName, {
    strategy: options.strategy,
    push: true,
    force: options.force,
    includeMerged: options.includeMerged,
    dryRun: options.dryRun,
  });

  if (!syncResult.ok) {
    return syncResult;
  }

  const ensureResult = await ensureTrainPrs(cwd, trainName, {
    draft: options.draft,
    printUrls: options.printUrls,
    dryRun: options.dryRun,
  });

  return {
    ok: ensureResult.ok,
    message: "Stack pushed and PRs ensured with stack tables in the PR descriptions.",
    warnings: [...syncResult.warnings, ...ensureResult.warnings],
    operations: [...(syncResult.operations ?? []), ...(ensureResult.operations ?? [])],
    status: ensureResult.status ?? syncResult.status,
  };
}

export async function helpOperation(topic?: string, surface: HelpSurface = "all"): Promise<OperationResult> {
  const help = renderHelp(topic, surface);
  return {
    ok: !help.message.startsWith("Unknown help topic"),
    message: help.message,
    warnings: [],
    operations: help.lines,
  };
}
