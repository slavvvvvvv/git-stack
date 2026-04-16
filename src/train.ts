import type { SimpleGit } from "simple-git";
import { findTrainByName, loadGlobalConfig, loadStackConfig, resolveCombinedBranch } from "./config.js";
import { createOctokit, findPullRequestByHead } from "./github.js";
import {
  branchExists,
  createRepoContext,
  ensureCombinedBranch,
  getCurrentBranch,
  isAncestor,
  normalBranches,
} from "./git.js";
import { writeCachedState } from "./state.js";
import type { BranchStatus, TrainDefinition, TrainStatus } from "./types.js";

export async function resolveTrain(git: SimpleGit, trainName: string | undefined, repoPath: string): Promise<{
  train: TrainDefinition;
  config: ReturnType<typeof loadStackConfig>;
  currentBranch: string;
}> {
  const config = loadStackConfig(repoPath);
  const currentBranch = await getCurrentBranch(git);

  if (trainName) {
    const train = findTrainByName(config, trainName);
    if (!train) {
      throw new Error(`Stack "${trainName}" not found.`);
    }

    return { train, config, currentBranch };
  }

  const resolved = config.trains.find((train) => train.branches.some((branch) => branch.name === currentBranch));
  if (!resolved) {
    throw new Error(`Current branch "${currentBranch}" is not part of any configured stack.`);
  }

  return {
    train: resolved,
    config,
    currentBranch,
  };
}

export function getMergedStatusBaseRef(train: TrainDefinition): string {
  return train.prTarget;
}

async function buildBranchStatus(
  git: SimpleGit,
  repoPath: string,
  train: TrainDefinition,
  currentBranch: string,
): Promise<BranchStatus[]> {
  const mergedStatusBaseRef = getMergedStatusBaseRef(train);
  const activeNames = new Set<string>();
  const statuses: BranchStatus[] = [];

  for (const [index, branch] of train.branches.entries()) {
    const existsLocally = await branchExists(git, branch.name);
    const isMerged = existsLocally ? await isAncestor(git, branch.name, mergedStatusBaseRef).catch(() => false) : false;
    if (!isMerged) {
      activeNames.add(branch.name);
    }
    statuses.push({
      name: branch.name,
      role: branch.role,
      index,
      isCurrent: currentBranch === branch.name,
      isMerged,
      isActive: !isMerged,
      existsLocally,
    });
  }

  void repoPath;
  return statuses;
}

export async function getTrainStatus(cwd: string, trainName?: string): Promise<TrainStatus> {
  const { git, repoPath } = await createRepoContext(cwd);
  const { train, config, currentBranch } = await resolveTrain(git, trainName, repoPath);
  const combinedBranch = await ensureCombinedBranch(git, train);
  const branches = await buildBranchStatus(git, repoPath, train, currentBranch);
  const globalConfig = loadGlobalConfig();
  const warnings: string[] = [];

  try {
    const { octokit, coords } = await createOctokit(git, config.defaults, globalConfig.github?.token);
    const ownerResponse = await octokit.repos.get({ owner: coords.owner, repo: coords.repo });
    const owner = ownerResponse.data.owner.login;
    for (const branch of branches) {
      branch.pr = await findPullRequestByHead(octokit, coords, owner, branch.name);
      if (branch.pr?.mergedAt) {
        branch.isMerged = true;
        branch.isActive = false;
      }
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }

  const status: TrainStatus = {
    repoPath,
    train,
    currentBranch,
    remote: config.defaults.remote,
    strategy: config.defaults.sync.strategy,
    combinedBranch: combinedBranch ?? resolveCombinedBranch(train),
    branches,
    warnings,
  };

  await writeCachedState(git, status);
  return status;
}

export function activeBranches(status: TrainStatus): BranchStatus[] {
  return status.branches.filter((branch) => branch.isActive);
}

export function normalActiveBranches(status: TrainStatus): BranchStatus[] {
  const normalNames = new Set(normalBranches(status.train).map((branch) => branch.name));
  return activeBranches(status).filter((branch) => normalNames.has(branch.name));
}
