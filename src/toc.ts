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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function formatIconCell(iconUrl: string, alt: string): string {
  if (!iconUrl) {
    return "";
  }

  return `<img src="${iconUrl}" alt="${alt}" width="16" height="16">`;
}

function formatPrCell(branch: BranchStatus): string {
  if (!branch.pr) {
    return "No PR";
  }

  return `<a href="${escapeHtml(branch.pr.url)}">${escapeHtml(branch.pr.title)}</a>`;
}

function renderBranchTable(branches: BranchStatus[], focusedBranchName: string | undefined): string[] {
  const lines = [
    '<table>',
    "  <thead>",
    "    <tr>",
    "      <th></th>",
    '      <th width="500">Title/Link</th>',
    "      <th></th>",
    "    </tr>",
    "  </thead>",
    "  <tbody>",
  ];
  for (const branch of branches) {
    const viewingIcon = branch.name === focusedBranchName ? formatIconCell(VIEWING_ICON, "viewing") : "";
    const stateAlt =
      branch.pr?.mergedAt || branch.isMerged
        ? "merged"
        : branch.pr?.isDraft
          ? "draft"
          : branch.pr?.state === "closed"
            ? "closed"
            : branch.pr?.state === "open"
              ? "open"
              : "";
    lines.push("    <tr>");
    lines.push(`      <td>${formatIconCell(formatStateIcon(branch), stateAlt)}</td>`);
    lines.push(`      <td width="500">${formatPrCell(branch)}</td>`);
    lines.push(`      <td>${viewingIcon}</td>`);
    lines.push("    </tr>");
  }
  lines.push("  </tbody>", "</table>");
  return lines;
}

export function renderToc(status: TrainStatus, focusedBranchName = status.currentBranch): string {
  const active = status.branches.filter((branch) => branch.isActive);
  const merged = status.branches.filter((branch) => branch.isMerged && !branch.isActive);

  const lines = [TOC_START, "## Stack", ""];
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
    const bodyWithoutManagedSection = `${body.slice(0, startIndex)}${body.slice(endIndex)}`.trim();
    return [nextToc, bodyWithoutManagedSection].filter(Boolean).join("\n\n");
  }

  return [nextToc, body.trim()].filter(Boolean).join("\n\n");
}
