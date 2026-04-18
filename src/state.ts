import fs from "node:fs";
import path from "node:path";
import type { SimpleGit } from "simple-git";
import type { CachedTrainState, GlobalCachedTrainStateFile, TrainStatus } from "./types.js";
import { getGlobalCachePath } from "./config.js";
import { ensureGitStateDir } from "./git.js";

export async function getStatePath(git: SimpleGit): Promise<string> {
  const stackDir = await ensureGitStateDir(git);
  return path.join(stackDir, "state.json");
}

export async function readCachedState(git: SimpleGit): Promise<CachedTrainState | null> {
  const statePath = await getStatePath(git);
  if (!fs.existsSync(statePath)) {
    return null;
  }

  const content = fs.readFileSync(statePath, "utf8");
  return JSON.parse(content) as CachedTrainState;
}

export async function writeCachedState(git: SimpleGit, status: TrainStatus): Promise<void> {
  const statePath = await getStatePath(git);
  const payload: CachedTrainState = {
    version: 1,
    repoPath: status.repoPath,
    updatedAt: new Date().toISOString(),
    trainName: status.train.name,
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

function getGlobalCacheKey(repoPath: string, trainName: string): string {
  return `${repoPath}::${trainName}`;
}

function readGlobalCacheFile(): GlobalCachedTrainStateFile {
  const cachePath = getGlobalCachePath();
  if (!fs.existsSync(cachePath)) {
    return {
      version: 1,
      entries: {},
    };
  }

  return JSON.parse(fs.readFileSync(cachePath, "utf8")) as GlobalCachedTrainStateFile;
}

export function readGlobalCachedState(repoPath: string, trainName: string): CachedTrainState | null {
  const cache = readGlobalCacheFile();
  return cache.entries[getGlobalCacheKey(repoPath, trainName)] ?? null;
}

export function writeGlobalCachedState(status: TrainStatus): void {
  const cachePath = getGlobalCachePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const cache = readGlobalCacheFile();
  cache.entries[getGlobalCacheKey(status.repoPath, status.train.name)] = {
    version: 1,
    repoPath: status.repoPath,
    updatedAt: new Date().toISOString(),
    trainName: status.train.name,
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
