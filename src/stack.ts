import type { SimpleGit } from "simple-git";
import { findStackByName, loadGlobalConfig, loadStackConfig, resolveCombinedBranch } from "./config.js";
import { createOctokit, findPullRequestByHead } from "./github.js";
import {
  branchExists,
  createRepoContext,
  ensureCombinedBranch,
  getCurrentBranch,
  isAncestor,
  normalBranches,
} from "./git.js";
import { readGlobalCachedState, writeCachedState, writeGlobalCachedState } from "./state.js";
import type { BranchStatus, CachedStackState, StackDefinition, StackStatus } from "./types.js";

export async function resolveStack(git: SimpleGit, stackName: string | undefined, repoPath: string): Promise<{
  stack: StackDefinition;
  config: ReturnType<typeof loadStackConfig>;
  currentBranch: string;
}> {
  const config = loadStackConfig(repoPath);
  const currentBranch = await getCurrentBranch(git);

  if (stackName) {
    const stack = findStackByName(config, stackName);
    if (!stack) {
      throw new Error(`Stack "${stackName}" not found.`);
    }

    return { stack, config, currentBranch };
  }

  const resolved = config.stacks.find((stack) => stack.branches.some((branch) => branch.name === currentBranch));
  if (!resolved) {
    throw new Error(`Current branch "${currentBranch}" is not part of any configured stack.`);
  }

  return {
    stack: resolved,
    config,
    currentBranch,
  };
}

export function getMergedStatusBaseRef(stack: StackDefinition): string {
  return stack.prTarget;
}

export function reconcileBranchStatusWithPr(branch: BranchStatus): BranchStatus {
  if (!branch.pr) {
    return branch;
  }

  if (branch.pr.mergedAt) {
    return {
      ...branch,
      isMerged: true,
      isActive: false,
    };
  }

  return {
    ...branch,
    isMerged: false,
    isActive: true,
  };
}

export function applyCachedPrMetadata(branches: BranchStatus[], cachedState: CachedStackState | null): BranchStatus[] {
  if (!cachedState) {
    return branches;
  }

  const branchToCachedEntry = new Map(cachedState.branches.map((branch) => [branch.name, branch]));
  return branches.map((branch) => {
    const cachedBranch = branchToCachedEntry.get(branch.name);
    if (!cachedBranch?.pr) {
      return branch;
    }

    return reconcileBranchStatusWithPr({
      ...branch,
      pr: cachedBranch.pr,
    });
  });
}

async function buildBranchStatus(
  git: SimpleGit,
  repoPath: string,
  stack: StackDefinition,
  currentBranch: string,
): Promise<BranchStatus[]> {
  const mergedStatusBaseRef = getMergedStatusBaseRef(stack);
  const statuses: BranchStatus[] = [];

  for (const [index, branch] of stack.branches.entries()) {
    const existsLocally = await branchExists(git, branch.name);
    const isMerged = existsLocally ? await isAncestor(git, branch.name, mergedStatusBaseRef).catch(() => false) : false;
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

export async function getStackStatus(
  cwd: string,
  stackName?: string,
  options?: {
    includePrMetadata?: boolean;
  },
): Promise<StackStatus> {
  const { git, repoPath } = await createRepoContext(cwd);
  const { stack, config, currentBranch } = await resolveStack(git, stackName, repoPath);
  const combinedBranch = await ensureCombinedBranch(git, stack);
  const branches = await buildBranchStatus(git, repoPath, stack, currentBranch);
  const globalConfig = loadGlobalConfig();
  const warnings: string[] = [];
  const includePrMetadata = options?.includePrMetadata ?? true;

  if (includePrMetadata) {
    try {
      const { octokit, coords } = await createOctokit(git, config.defaults, globalConfig.github?.token);
      const ownerResponse = await octokit.repos.get({ owner: coords.owner, repo: coords.repo });
      const owner = ownerResponse.data.owner.login;
      for (let index = 0; index < branches.length; index += 1) {
        const branch = branches[index];
        if (!branch) {
          continue;
        }
        branch.pr = await findPullRequestByHead(octokit, coords, owner, branch.name);
        branches[index] = reconcileBranchStatusWithPr(branch);
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    const cachedState = readGlobalCachedState(repoPath, stack.name);
    const hydratedBranches = applyCachedPrMetadata(branches, cachedState);
    branches.splice(0, branches.length, ...hydratedBranches);
  }

  const status: StackStatus = {
    repoPath,
    stack,
    currentBranch,
    remote: config.defaults.remote,
    strategy: config.defaults.sync.strategy,
    combinedBranch: combinedBranch ?? resolveCombinedBranch(stack),
    branches,
    warnings,
  };

  await writeCachedState(git, status);
  writeGlobalCachedState(status);
  return status;
}

export function activeBranches(status: StackStatus): BranchStatus[] {
  return status.branches.filter((branch) => branch.isActive);
}

export function normalActiveBranches(status: StackStatus): BranchStatus[] {
  const normalNames = new Set(normalBranches(status.stack).map((branch) => branch.name));
  return activeBranches(status).filter((branch) => normalNames.has(branch.name));
}
