import type { BranchStatus, TrainStatus } from "./types.js";

export const TOC_START = "<!-- git-stack:toc:start -->";
export const TOC_END = "<!-- git-stack:toc:end -->";

function formatStatusText(branch: BranchStatus, focusedBranchName: string | undefined): string {
  if (branch.isMerged) {
    return "merged";
  }

  if (focusedBranchName && branch.name === focusedBranchName) {
    return "active";
  }

  return "pending";
}

function formatPrCell(branch: BranchStatus, focusedBranchName: string | undefined): string {
  if (!branch.pr) {
    return "No PR";
  }

  const label = branch.name === focusedBranchName ? `**${branch.pr.title}**` : branch.pr.title;
  return `[${label}](${branch.pr.url})`;
}

function renderBranchTable(branches: BranchStatus[], focusedBranchName: string | undefined): string[] {
  const lines = ["| PR | Status |", "| --- | --- |"];
  for (const branch of branches) {
    lines.push(`| ${formatPrCell(branch, focusedBranchName)} | ${formatStatusText(branch, focusedBranchName)} |`);
  }
  return lines;
}

export function renderToc(status: TrainStatus, focusedBranchName = status.currentBranch): string {
  const active = status.branches.filter((branch) => branch.isActive);
  const merged = status.branches.filter((branch) => branch.isMerged && !branch.isActive);

  const lines = [TOC_START, "## Stack", ""];
  lines.push("### Active");
  if (active.length === 0) {
    lines.push("No active branches.");
  } else {
    lines.push(...renderBranchTable(active, focusedBranchName));
  }

  if (merged.length > 0) {
    lines.push("", "### Merged");
    lines.push(...renderBranchTable(merged, focusedBranchName));
  }

  lines.push(TOC_END);
  return lines.join("\n");
}

export function upsertManagedToc(body: string, status: TrainStatus, focusedBranchName = status.currentBranch): string {
  const nextToc = renderToc(status, focusedBranchName);
  if (body.includes(TOC_START) && body.includes(TOC_END)) {
    const startIndex = body.indexOf(TOC_START);
    const endIndex = body.indexOf(TOC_END) + TOC_END.length;
    return `${body.slice(0, startIndex)}${nextToc}${body.slice(endIndex)}`.trim();
  }

  return [body.trim(), nextToc].filter(Boolean).join("\n\n");
}
