import type { BranchStatus, TrainStatus } from "./types.js";

export const TOC_START = "<!-- git-stack:toc:start -->";
export const TOC_END = "<!-- git-stack:toc:end -->";

function formatBranchLine(branch: BranchStatus): string {
  const prText = branch.pr ? `#${branch.pr.number}` : "no PR";
  const urlText = branch.pr ? ` (${branch.pr.url})` : "";
  const roleText = branch.role === "combined" ? " [combined]" : "";
  const currentText = branch.isCurrent ? " [current]" : "";
  const mergedText = branch.isMerged ? " [merged]" : "";
  return `1. \`${branch.name}\` ${prText}${urlText}${roleText}${currentText}${mergedText}`;
}

export function renderToc(status: TrainStatus): string {
  const active = status.branches.filter((branch) => branch.isActive);
  const merged = status.branches.filter((branch) => branch.isMerged && !branch.isActive);

  const lines = [TOC_START, "## Stack", ""];
  lines.push("### Active");
  if (active.length === 0) {
    lines.push("No active branches.");
  } else {
    lines.push(...active.map(formatBranchLine));
  }

  if (merged.length > 0) {
    lines.push("", "### Merged");
    lines.push(...merged.map(formatBranchLine));
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
