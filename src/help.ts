export type HelpSurface = "cli" | "mcp" | "all";

export interface HelpTopicEntry {
  topic: string;
  surfaces: HelpSurface[];
  summary: string;
  details: string[];
}

const helpTopics: HelpTopicEntry[] = [
  {
    topic: "overview",
    surfaces: ["cli", "mcp", "all"],
    summary: "Understand the main workflows supported by git-stack.",
    details: [
      "`git-stack` manages ordered pull request stacks.",
      "A stack is defined in `.stack.yml` as an ordered branch list plus `syncBase` and `prTarget`.",
      "CLI workflows are for local git operations, branch creation, PR management, and launching the MCP server.",
      "MCP workflows expose the same stack data and mutating actions as structured tools and resources for agents.",
    ],
  },
  {
    topic: "cli",
    surfaces: ["cli", "all"],
    summary: "Understand the local command-line workflow.",
    details: [
      "Use `git stack create ...` to bootstrap a new stack from the current branch.",
      "Use `git stack add <stack>` to append the current branch to an existing stack definition.",
      "Use `git stack push` to push branches and create chained pull requests for the current stack.",
      "Use `git stack config` to open `.stack.yml` in `EDITOR` or `VISUAL`.",
      "Use `git stack status`, `sync`, `prs ensure`, and `advance` to inspect and operate on the stack lifecycle.",
      "Use `git stack mcp` when you want an MCP client to access the repo through structured tools.",
    ],
  },
  {
    topic: "mcp",
    surfaces: ["mcp", "all"],
    summary: "Understand the MCP server surface.",
    details: [
      "Start the server with `git stack mcp`.",
      "Resources expose cached state and stack inventory.",
      "Tools expose validation, status, sync, PR creation, stack advancement, checkout, and help.",
      "Use the MCP help tool when an agent needs guided explanations without shelling out to README text.",
    ],
  },
  {
    topic: "create",
    surfaces: ["cli", "all"],
    summary: "Understand how `git stack create` bootstraps a new stack.",
    details: [
      "The current checked-out branch becomes both `syncBase` and `prTarget` for the new stack.",
      "Each provided branch is created in order, with each branch based on the previous one.",
      "The stack name is the first branch argument.",
      "The command writes the stack into `.stack.yml` and checks out the first created branch.",
    ],
  },
  {
    topic: "sync",
    surfaces: ["cli", "mcp", "all"],
    summary: "Understand how stack synchronization works.",
    details: [
      "Sync walks the stack in order and applies each branch onto the next branch.",
      "Merge and rebase are both supported.",
      "Already-satisfied ancestry edges are skipped.",
      "A configured combined branch is created if missing and then kept at the tail of the stack.",
    ],
  },
  {
    topic: "push",
    surfaces: ["cli", "all"],
    summary: "Understand how `git stack push` publishes a stacked stack.",
    details: [
      "`git stack push` first syncs and pushes the stack branches to the remote.",
      "It then creates or updates the stacked pull requests in sequence, so each PR targets the previous branch.",
      "The managed stack TOC with all PR links is written into each PR body.",
      "Use `--draft` or `--ready` to control draft status while publishing.",
    ],
  },
  {
    topic: "prs",
    surfaces: ["cli", "mcp", "all"],
    summary: "Understand how PR management works.",
    details: [
      "`prs ensure` creates missing PRs for active branches and updates existing ones.",
      "Normal PR title and body are derived from the branch head commit.",
      "The combined branch uses `combinedTitleTemplate`.",
      "git-stack only manages the bounded TOC section inside each PR body.",
    ],
  },
  {
    topic: "advance",
    surfaces: ["cli", "mcp", "all"],
    summary: "Understand how advancing a stack works after merges.",
    details: [
      "Merged leading branches are treated as complete.",
      "The next active head is rebased onto `syncBase`.",
      "Remaining active branches are rebased in order onto their new parent branches.",
      "Open PRs can be retargeted, commented on, and optionally closed when merged.",
    ],
  },
  {
    topic: "config",
    surfaces: ["cli", "mcp", "all"],
    summary: "Understand the config model used by git-stack.",
    details: [
      "Repo-local config lives in `.stack.yml`.",
      "Optional global defaults and GitHub token fallback live in `~/.config/git-stack/config.yml`.",
      "Each stack declares `syncBase`, `prTarget`, and an ordered branch list.",
      "A combined branch is optional, but if present it must be the final branch.",
    ],
  },
];

function topicMatchesSurface(topic: HelpTopicEntry, surface: HelpSurface): boolean {
  if (surface === "all") {
    return true;
  }

  return topic.surfaces.includes(surface) || topic.surfaces.includes("all");
}

export function listHelpTopics(surface: HelpSurface = "all"): string[] {
  return helpTopics.filter((topic) => topicMatchesSurface(topic, surface)).map((topic) => topic.topic);
}

export function getHelpEntry(topic: string, surface: HelpSurface = "all"): HelpTopicEntry | undefined {
  const normalized = topic.trim().toLowerCase();
  return helpTopics.find((entry) => entry.topic === normalized && topicMatchesSurface(entry, surface));
}

export function renderHelp(topic: string | undefined, surface: HelpSurface = "all"): { message: string; lines: string[] } {
  if (!topic) {
    const topics = listHelpTopics(surface);
    return {
      message: "git-stack help",
      lines: [
        "Use `git stack help <topic>` or the MCP `stack_help` tool for focused guidance.",
        `Available topics: ${topics.join(", ")}`,
      ],
    };
  }

  const entry = getHelpEntry(topic, surface);
  if (!entry) {
    const topics = listHelpTopics(surface);
    return {
      message: `Unknown help topic: ${topic}`,
      lines: [`Available topics: ${topics.join(", ")}`],
    };
  }

  return {
    message: `Help: ${entry.topic}`,
    lines: [entry.summary, ...entry.details],
  };
}
