export type SyncStrategy = "merge" | "rebase";

export type BranchRole = "normal" | "combined";

export interface BranchDefinition {
  name: string;
  role: BranchRole;
}

export interface RepoDefaults {
  remote: string;
  sync: {
    strategy: SyncStrategy;
  };
  github: {
    host: string;
  };
  prs: {
    draft: boolean;
    printUrls: boolean;
    commentOnUpdate: string | null;
    combinedTitleTemplate: string;
  };
  lifecycle: {
    keepMergedInToc: boolean;
    closeMergedPrs: boolean;
  };
}

export interface TrainDefinition {
  name: string;
  syncBase: string;
  prTarget: string;
  branches: BranchDefinition[];
}

export interface StackConfig {
  defaults: RepoDefaults;
  trains: TrainDefinition[];
}

export interface GlobalConfig {
  defaults?: Partial<RepoDefaults>;
  github?: {
    token?: string;
    host?: string;
  };
}

export interface PullRequestMetadata {
  number: number;
  url: string;
  state: "open" | "closed";
  isDraft: boolean;
  title: string;
  body: string;
  baseBranch: string;
  headBranch: string;
  mergedAt: string | null;
}

export interface BranchStatus {
  name: string;
  role: BranchRole;
  index: number;
  isCurrent: boolean;
  isMerged: boolean;
  isActive: boolean;
  existsLocally: boolean;
  pr?: PullRequestMetadata;
}

export interface TrainStatus {
  repoPath: string;
  train: TrainDefinition;
  currentBranch: string;
  remote: string;
  strategy: SyncStrategy;
  combinedBranch: string | null;
  branches: BranchStatus[];
  warnings: string[];
}

export interface CachedTrainState {
  version: 1;
  updatedAt: string;
  trainName: string;
  currentBranch: string;
  remote: string;
  strategy: SyncStrategy;
  combinedBranch: string | null;
  branches: Array<{
    name: string;
    role: BranchRole;
    isMerged: boolean;
    pr?: PullRequestMetadata;
  }>;
}

export interface OperationResult {
  ok: boolean;
  message: string;
  warnings: string[];
  status?: TrainStatus;
  operations?: string[];
}

export interface EnsurePrsOptions {
  draft?: boolean;
  printUrls?: boolean;
  dryRun?: boolean;
}

export interface SyncOptions {
  strategy?: SyncStrategy;
  push?: boolean;
  force?: boolean;
  includeMerged?: boolean;
  dryRun?: boolean;
}

export interface AdvanceOptions {
  push?: boolean;
  force?: boolean;
  closeMergedPrs?: boolean;
  commentUpdatedPrs?: string | null;
  dryRun?: boolean;
}
