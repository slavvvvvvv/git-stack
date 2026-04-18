import fs from "node:fs";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import type { BranchDefinition, StackDefinition, SyncStrategy } from "./types.js";

export interface RepoContext {
  git: SimpleGit;
  repoPath: string;
}

export async function createRepoContext(cwd: string): Promise<RepoContext> {
  const git = simpleGit({ baseDir: cwd });
  const repoPath = (await git.revparse(["--show-toplevel"])).trim();
  return {
    git: simpleGit({ baseDir: repoPath }),
    repoPath,
  };
}

export async function getCurrentBranch(git: SimpleGit): Promise<string> {
  const summary = await git.branchLocal();
  return summary.current;
}

export async function listLocalBranches(git: SimpleGit): Promise<string[]> {
  const summary = await git.branchLocal();
  return summary.all;
}

export async function branchExists(git: SimpleGit, branchName: string): Promise<boolean> {
  const branches = await listLocalBranches(git);
  return branches.includes(branchName);
}

export async function ensureCombinedBranch(git: SimpleGit, stack: StackDefinition): Promise<string | null> {
  const combinedBranch = stack.branches.find((branch) => branch.role === "combined");
  if (!combinedBranch) {
    return null;
  }

  const exists = await branchExists(git, combinedBranch.name);
  if (exists) {
    return combinedBranch.name;
  }

  const branchBeforeCombined = stack.branches.at(-2);
  if (!branchBeforeCombined) {
    throw new Error(`Stack "${stack.name}" does not have a source branch for combined branch "${combinedBranch.name}".`);
  }

  await git.branch([combinedBranch.name, branchBeforeCombined.name]);
  return combinedBranch.name;
}

export async function isAncestor(git: SimpleGit, ancestorRef: string, descendantRef: string): Promise<boolean> {
  try {
    await git.raw(["merge-base", "--is-ancestor", ancestorRef, descendantRef]);
    return true;
  } catch {
    return false;
  }
}

export async function getUnmergedBranches(git: SimpleGit, branches: string[], baseBranch: string): Promise<string[]> {
  const mergedOutput = await git.raw(["branch", "--merged", baseBranch]);
  const mergedBranches = new Set(
    mergedOutput
      .split("\n")
      .map((line) => line.replace("*", "").trim())
      .filter(Boolean),
  );

  return branches.filter((branch) => !mergedBranches.has(branch));
}

export async function combineEdge(
  git: SimpleGit,
  fromBranch: string,
  toBranch: string,
  strategy: SyncStrategy,
): Promise<void> {
  await git.checkout(toBranch);
  if (strategy === "rebase") {
    await git.rebase([fromBranch]);
    return;
  }

  await git.merge([fromBranch]);
}

export async function pushBranches(
  git: SimpleGit,
  branches: string[],
  remote: string,
  force: boolean,
): Promise<void> {
  const args = ["push"];
  if (force) {
    args.push("--force-with-lease");
  }
  args.push(remote, ...branches);
  await git.raw(args);
}

export async function checkoutBranch(git: SimpleGit, branchName: string): Promise<void> {
  await git.checkout(branchName);
}

export async function createBranchFrom(git: SimpleGit, branchName: string, fromRef: string): Promise<void> {
  await git.checkout(["-b", branchName, fromRef]);
}

export async function getHeadCommitMessage(git: SimpleGit, ref: string): Promise<{ title: string; body: string }> {
  const title = (await git.raw(["log", "--format=%s", "-n", "1", ref])).trim();
  const body = (await git.raw(["log", "--format=%b", "-n", "1", ref])).trim();
  return { title, body };
}

export async function getGitDir(git: SimpleGit): Promise<string> {
  return (await git.revparse(["--git-dir"])).trim();
}

export async function ensureGitStateDir(git: SimpleGit): Promise<string> {
  const gitDir = await getGitDir(git);
  const stackDir = path.join(gitDir, "stack");
  fs.mkdirSync(stackDir, { recursive: true });
  return stackDir;
}

export function normalBranches(stack: StackDefinition): BranchDefinition[] {
  return stack.branches.filter((branch) => branch.role !== "combined");
}
