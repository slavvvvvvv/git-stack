import type { BranchStatus, TrainStatus } from "./types.js";

export const TOC_START = "<!-- git-stack:toc:start -->";
export const TOC_END = "<!-- git-stack:toc:end -->";

function formatStatusText(branch: BranchStatus): string {
  const parts: string[] = [];
  if (branch.isCurrent) {
    parts.push("current");
  }
  if (branch.isMerged) {
    parts.push("merged");
  } else {
    parts.push("active");
  }
  return parts.join(", ");
}

function formatPrCell(branch: BranchStatus): string {
  if (!branch.pr) {
    return "No PR";
  }

  return `[#${branch.pr.number}](${branch.pr.url})`;
}

function renderBranchTable(branches: BranchStatus[]): string[] {
  const lines = ["| Branch | PR | Role | Status |", "| --- | --- | --- | --- |"];
  for (const branch of branches) {
    const roleText = branch.role === "combined" ? "combined" : "branch";
    lines.push(`| \`${branch.name}\` | ${formatPrCell(branch)} | ${roleText} | ${formatStatusText(branch)} |`);
  }
  return lines;
}

export function renderToc(status: TrainStatus): string {
  const active = status.branches.filter((branch) => branch.isActive);
  const merged = status.branches.filter((branch) => branch.isMerged && !branch.isActive);

  const lines = [TOC_START, "## Stack", ""];
  lines.push("### Active");
  if (active.length === 0) {
    lines.push("No active branches.");
  } else {
    lines.push(...renderBranchTable(active));
  }

  if (merged.length > 0) {
    lines.push("", "### Merged");
    lines.push(...renderBranchTable(merged));
  }

  lines.push(TOC_END);
  return lines.join("\n");
}

export function upsertManagedToc(body: string, status: TrainStatus): string {
  const nextToc = renderToc(status);
  if (body.includes(TOC_START) && body.includes(TOC_END)) {
    const startIndex = body.indexOf(TOC_START);
    const endIndex = body.indexOf(TOC_END) + TOC_END.length;
    return `${body.slice(0, startIndex)}${nextToc}${body.slice(endIndex)}`.trim();
  }

  return [body.trim(), nextToc].filter(Boolean).join("\n\n");
}
