import fs from "node:fs";
import path from "node:path";
import type { SimpleGit } from "simple-git";
import type { CachedStackState, GlobalCachedStackStateFile, StackStatus } from "./types.js";
import { getGlobalCachePath } from "./config.js";
import { ensureGitStateDir } from "./git.js";

export async function getStatePath(git: SimpleGit): Promise<string> {
  const stackDir = await ensureGitStateDir(git);
  return path.join(stackDir, "state.json");
}

export async function readCachedState(git: SimpleGit): Promise<CachedStackState | null> {
  const statePath = await getStatePath(git);
  if (!fs.existsSync(statePath)) {
    return null;
  }

  const content = fs.readFileSync(statePath, "utf8");
  return JSON.parse(content) as CachedStackState;
}

export async function writeCachedState(git: SimpleGit, status: StackStatus): Promise<void> {
  const statePath = await getStatePath(git);
  const payload: CachedStackState = {
    version: 1,
    repoPath: status.repoPath,
    updatedAt: new Date().toISOString(),
    stackName: status.stack.name,
    currentBranch: status.currentBranch,
    remote: status.remote,
    strategy: status.strategy,
    combinedBranch: status.combinedBranch,
    branches: status.branches.map((branch) => ({
      name: branch.name,
      role: branch.role,
      isMerged: branch.isMerged,
      pr: branch.pr,
    })),
  };

  fs.writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function getGlobalCacheKey(repoPath: string, stackName: string): string {
  return `${repoPath}::${stackName}`;
}

function readGlobalCacheFile(): GlobalCachedStackStateFile {
  const cachePath = getGlobalCachePath();
  if (!fs.existsSync(cachePath)) {
    return {
      version: 1,
      entries: {},
    };
  }

  return JSON.parse(fs.readFileSync(cachePath, "utf8")) as GlobalCachedStackStateFile;
}

export function readGlobalCachedState(repoPath: string, stackName: string): CachedStackState | null {
  const cache = readGlobalCacheFile();
  return cache.entries[getGlobalCacheKey(repoPath, stackName)] ?? null;
}

export function writeGlobalCachedState(status: StackStatus): void {
  const cachePath = getGlobalCachePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const cache = readGlobalCacheFile();
  cache.entries[getGlobalCacheKey(status.repoPath, status.stack.name)] = {
    version: 1,
    repoPath: status.repoPath,
    updatedAt: new Date().toISOString(),
    stackName: status.stack.name,
    currentBranch: status.currentBranch,
    remote: status.remote,
    strategy: status.strategy,
    combinedBranch: status.combinedBranch,
    branches: status.branches.map((branch) => ({
      name: branch.name,
      role: branch.role,
      isMerged: branch.isMerged,
      pr: branch.pr,
    })),
  };
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}
