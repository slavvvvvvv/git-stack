import { describe, expect, it } from "vitest";
import { renderToc, upsertManagedToc } from "../src/toc.js";
import type { TrainStatus } from "../src/types.js";

function makeStatus(): TrainStatus {
  return {
    repoPath: "/tmp/repo",
    currentBranch: "feature-a",
    remote: "origin",
    strategy: "merge",
    combinedBranch: "combined",
    warnings: [],
    train: {
      name: "demo",
      syncBase: "main",
      prTarget: "main",
      branches: [
        { name: "feature-a", role: "normal" },
        { name: "feature-b", role: "normal" },
        { name: "combined", role: "combined" },
      ],
    },
    branches: [
      {
        name: "feature-a",
        role: "normal",
        index: 0,
        isCurrent: true,
        isMerged: false,
        isActive: true,
        existsLocally: true,
        pr: {
          number: 10,
          url: "https://example.test/10",
          state: "open",
          isDraft: false,
          title: "A",
          body: "",
          baseBranch: "main",
          headBranch: "feature-a",
          mergedAt: null,
        },
      },
      {
        name: "feature-b",
        role: "normal",
        index: 1,
        isCurrent: false,
        isMerged: true,
        isActive: false,
        existsLocally: true,
        pr: {
          number: 11,
          url: "https://example.test/11",
          state: "closed",
          isDraft: false,
          title: "B",
          body: "",
          baseBranch: "feature-a",
          headBranch: "feature-b",
          mergedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      {
        name: "combined",
        role: "combined",
        index: 2,
        isCurrent: false,
        isMerged: false,
        isActive: true,
        existsLocally: true,
      },
    ],
  };
}

describe("TOC rendering", () => {
  it("renders active and merged sections", () => {
    const toc = renderToc(makeStatus());
    expect(toc).toContain("### Active");
    expect(toc).toContain("### Merged");
    expect(toc).toContain("<table>");
    expect(toc).toContain('<th width="500">Title/Link</th>');
    expect(toc).toContain("raw.githubusercontent.com/slavvvvvvv/git-stack/main/assets/icons/git-open-icon.svg");
    expect(toc).toContain("raw.githubusercontent.com/slavvvvvvv/git-stack/main/assets/icons/git-merged-icon.svg");
    expect(toc).toContain('alt="open"');
    expect(toc).toContain('alt="merged"');
    expect(toc).toContain('<a href="https://example.test/10">A</a>');
    expect(toc).toContain('role="presentation" width="100%"');
    expect(toc).toContain('<td width="500">');
    expect(toc).toContain('No PR');
  });

  it("replaces an existing managed section", () => {
    const status = makeStatus();
    const body = `hello\n\n<!-- git-stack:toc:start -->old<!-- git-stack:toc:end -->`;
    const next = upsertManagedToc(body, status);
    expect(next.startsWith("<!-- git-stack:toc:start -->")).toBe(true);
    expect(next).toContain('<a href="https://example.test/10">A</a>');
    expect(next).not.toContain("old");
    expect(next).toContain("hello");
  });

  it("prepends the managed stack table to a plain body", () => {
    const next = upsertManagedToc("existing body", makeStatus());
    expect(next.startsWith("<!-- git-stack:toc:start -->")).toBe(true);
    expect(next).toContain("existing body");
    expect(next).toContain("https://example.test/10");
  });

  it("marks only the focused branch as active", () => {
    const toc = renderToc(makeStatus(), "combined");
    expect(toc).toContain('<td align="right"><img src="https://raw.githubusercontent.com/slavvvvvvv/git-stack/main/assets/icons/viewing-icon.svg"');
    expect(toc).not.toContain('<a href="https://example.test/10">A</a></td>      <td align="right"><img src="https://raw.githubusercontent.com/slavvvvvvv/git-stack/main/assets/icons/viewing-icon.svg"');
  });
});
