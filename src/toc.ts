import type { BranchStatus, TrainStatus } from "./types.js";
import {
  GIT_CLOSED_ICON,
  GIT_DRAFT_ICON,
  GIT_MERGED_ICON,
  GIT_OPEN_ICON,
  VIEWING_ICON,
} from "./pr-icons.js";

export const TOC_START = "<!-- git-stack:toc:start -->";
export const TOC_END = "<!-- git-stack:toc:end -->";

function formatStateIcon(branch: BranchStatus): string {
  if (branch.pr?.mergedAt || branch.isMerged) {
    return GIT_MERGED_ICON;
  }

  if (branch.pr?.isDraft) {
    return GIT_DRAFT_ICON;
  }

  if (branch.pr?.state === "closed") {
    return GIT_CLOSED_ICON;
  }

  if (branch.pr?.state === "open") {
    return GIT_OPEN_ICON;
  }

  return "";
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatIconCell(svg: string, alt: string): string {
  if (!svg) {
    return "";
  }

  return `<img src="${svgToDataUrl(svg)}" alt="${alt}" width="16" height="16">`;
}

function formatPrCell(branch: BranchStatus): string {
  if (!branch.pr) {
    return "No PR";
  }

  return `[${branch.pr.title}](${branch.pr.url})`;
}

function renderBranchTable(branches: BranchStatus[], focusedBranchName: string | undefined): string[] {
  const lines = ["|  | Title/Link | Viewing? |", "| --- | --- | --- |"];
  for (const branch of branches) {
    const viewingIcon = branch.name === focusedBranchName ? formatIconCell(VIEWING_ICON, "viewing") : "";
    const stateAlt = branch.pr?.mergedAt || branch.isMerged ? "merged" : branch.pr?.isDraft ? "draft" : branch.pr?.state === "closed" ? "closed" : branch.pr?.state === "open" ? "open" : "";
    lines.push(`| ${formatIconCell(formatStateIcon(branch), stateAlt)} | ${formatPrCell(branch)} | ${viewingIcon} |`);
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
