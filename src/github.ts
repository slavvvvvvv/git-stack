import { execFileSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
import type { SimpleGit } from "simple-git";
import { getHeadCommitMessage } from "./git.js";
import { upsertManagedToc } from "./toc.js";
import type {
  EnsurePrsOptions,
  PullRequestMetadata,
  RepoDefaults,
  TrainDefinition,
  TrainStatus,
} from "./types.js";

interface RepoCoordinates {
  owner: string;
  repo: string;
}

function parseGitHubRemote(remoteUrl: string, host: string): RepoCoordinates {
  const normalized = remoteUrl.trim().replace(/\.git$/, "");
  const sshPattern = new RegExp(`git@${host.replace(".", "\\.")}:(.+)/(.+)$`);
  const httpsPattern = new RegExp(`https://(?:.+@)?${host.replace(".", "\\.")}/(.+)/(.+)$`);
  const sshMatch = normalized.match(sshPattern);
  if (sshMatch) {
    return {
      owner: sshMatch[1] ?? "",
      repo: sshMatch[2] ?? "",
    };
  }

  const httpsMatch = normalized.match(httpsPattern);
  if (httpsMatch) {
    return {
      owner: httpsMatch[1] ?? "",
      repo: httpsMatch[2] ?? "",
    };
  }

  throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`);
}

export function resolveGitHubToken(defaults: RepoDefaults, globalToken?: string): string {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  try {
    const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
    if (token) {
      return token;
    }
  } catch {
    // ignore missing gh auth and fall back below
  }

  if (globalToken) {
    return globalToken;
  }

  throw new Error(`GitHub token not found. Set GITHUB_TOKEN, authenticate with gh, or configure a global token.`);
}

export async function createOctokit(git: SimpleGit, defaults: RepoDefaults, globalToken?: string): Promise<{
  octokit: Octokit;
  coords: RepoCoordinates;
}> {
  const remoteUrl = (await git.raw(["config", "--get", `remote.${defaults.remote}.url`])).trim();
  if (!remoteUrl) {
    throw new Error(`Remote "${defaults.remote}" is not configured.`);
  }

  const auth = resolveGitHubToken(defaults, globalToken);
  const coords = parseGitHubRemote(remoteUrl, defaults.github.host);
  const octokit = new Octokit({ auth });
  return { octokit, coords };
}

function mapPr(pr: {
  number: number;
  html_url: string;
  state: string;
  draft?: boolean | null;
  title: string;
  body?: string | null;
  base: { ref: string };
  head: { ref: string };
  merged_at?: string | null;
}): PullRequestMetadata {
  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.state === "closed" ? "closed" : "open",
    isDraft: Boolean(pr.draft),
    title: pr.title,
    body: pr.body ?? "",
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    mergedAt: pr.merged_at ?? null,
  };
}

function renderCombinedTitle(template: string, stackName: string): string {
  return template.replaceAll("{{stack.name}}", stackName).replaceAll("{{train.name}}", stackName);
}

export async function findPullRequestByHead(
  octokit: Octokit,
  coords: RepoCoordinates,
  owner: string,
  branchName: string,
): Promise<PullRequestMetadata | undefined> {
  const response = await octokit.pulls.list({
    owner: coords.owner,
    repo: coords.repo,
    head: `${owner}:${branchName}`,
    state: "all",
    per_page: 1,
  });

  const pr = response.data[0];
  if (!pr) {
    return undefined;
  }

  return mapPr(pr);
}

export async function ensurePullRequests(
  git: SimpleGit,
  octokit: Octokit,
  coords: RepoCoordinates,
  owner: string,
  train: TrainDefinition,
  status: TrainStatus,
  defaults: RepoDefaults,
  options: EnsurePrsOptions,
): Promise<{ operations: string[]; status: TrainStatus }> {
  const operations: string[] = [];
  const branchStatuses = [...status.branches];
  const draft = options.draft ?? defaults.prs.draft;
  const printUrls = options.printUrls ?? defaults.prs.printUrls;
  const combinedBranch = train.branches.find((branch) => branch.role === "combined")?.name ?? null;
  const activeBranches = train.branches.filter((branch) => !status.branches.find((candidate) => candidate.name === branch.name)?.isMerged);

  for (const [index, branch] of activeBranches.entries()) {
    const branchStatus = branchStatuses.find((item) => item.name === branch.name);
    if (!branchStatus) {
      continue;
    }

    const existing = await findPullRequestByHead(octokit, coords, owner, branch.name);
    const commitMessage =
      branch.name === combinedBranch
        ? {
            title: renderCombinedTitle(defaults.prs.combinedTitleTemplate, train.name),
            body: "",
          }
        : await getHeadCommitMessage(git, branch.name);
    const baseBranch = index === 0 || branch.name === combinedBranch ? train.prTarget : activeBranches[index - 1]?.name ?? train.prTarget;
    let pr = existing;

    if (!pr) {
      operations.push(`create-pr:${branch.name}->${baseBranch}`);
      if (!options.dryRun) {
        const response = await octokit.pulls.create({
          owner: coords.owner,
          repo: coords.repo,
          head: branch.name,
          base: baseBranch,
          title: commitMessage.title,
          body: commitMessage.body,
          draft,
        });
        pr = mapPr(response.data);
      }
    }

    if (!pr) {
      continue;
    }

    branchStatus.pr = pr;
    const updatedStatus: TrainStatus = { ...status, branches: branchStatuses };
    const nextBody = upsertManagedToc(pr.body, updatedStatus, branch.name);
    operations.push(`update-pr:${branch.name}#${pr.number}`);
    if (!options.dryRun) {
      const response = await octokit.pulls.update({
        owner: coords.owner,
        repo: coords.repo,
        pull_number: pr.number,
        title: branch.name === combinedBranch ? commitMessage.title : pr.title,
        body: nextBody,
        base: baseBranch,
      });
      branchStatus.pr = mapPr(response.data);

      if (defaults.prs.commentOnUpdate) {
        await octokit.issues.createComment({
          owner: coords.owner,
          repo: coords.repo,
          issue_number: pr.number,
          body: defaults.prs.commentOnUpdate,
        });
        operations.push(`comment-pr:${branch.name}#${pr.number}`);
      }
    }

    if (printUrls && branchStatus.pr) {
      operations.push(`print-url:${branchStatus.pr.url}`);
    }
  }

  return {
    operations,
    status: {
      ...status,
      branches: branchStatuses,
    },
  };
}

export async function closePullRequest(
  octokit: Octokit,
  coords: RepoCoordinates,
  prNumber: number,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    return;
  }

  await octokit.pulls.update({
    owner: coords.owner,
    repo: coords.repo,
    pull_number: prNumber,
    state: "closed",
  });
}

export async function commentOnPullRequest(
  octokit: Octokit,
  coords: RepoCoordinates,
  prNumber: number,
  body: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    return;
  }

  await octokit.issues.createComment({
    owner: coords.owner,
    repo: coords.repo,
    issue_number: prNumber,
    body,
  });
}
