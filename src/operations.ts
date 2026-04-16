import { spawnSync } from "node:child_process";
import { loadGlobalConfig, loadStackConfig } from "./config.js";
import { getRepoConfigPath, writeTemplateConfig } from "./config.js";
import { closePullRequest, commentOnPullRequest, createOctokit, ensurePullRequests } from "./github.js";
import {
  checkoutBranch,
  combineEdge,
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
    message: "Train synced.",
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
    message: "Train advanced.",
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
  let targetBranch: string | undefined;

  if (selector === "combined") {
    targetBranch = status.combinedBranch ?? undefined;
  } else {
    const maybeIndex = Number(selector);
    if (Number.isInteger(maybeIndex) && `${maybeIndex}` === selector) {
      targetBranch = status.branches[maybeIndex]?.name;
    } else {
      targetBranch = status.branches.find((branch) => branch.name === selector)?.name;
    }
  }

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
    message: "Trains listed.",
    warnings: [],
    operations: config.trains.map((train) => `train:${train.name}`),
  };
}

export async function initConfig(cwd: string): Promise<OperationResult> {
  const { repoPath } = await createRepoContext(cwd);
  const configPath = getRepoConfigPath(repoPath);
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
  const { repoPath } = await createRepoContext(cwd);
  const configPath = getRepoConfigPath(repoPath);
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
