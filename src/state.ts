import fs from "node:fs";
import path from "node:path";
import type { SimpleGit } from "simple-git";
import type { CachedTrainState, TrainStatus } from "./types.js";
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
