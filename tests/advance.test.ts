import { describe, expect, it } from "vitest";
import { activeBranches, getMergedStatusBaseRef, normalActiveBranches, reconcileBranchStatusWithPr } from "../src/train.js";
import { resolveCheckoutSelector } from "../src/operations.js";
import type { BranchStatus, TrainDefinition, TrainStatus } from "../src/types.js";

const trainDefinition: TrainDefinition = {
  name: "demo",
  syncBase: "feature-b",
  prTarget: "main",
  branches: [
    { name: "feature-a", role: "normal" },
    { name: "feature-b", role: "normal" },
    { name: "combined", role: "combined" },
  ],
};

const status: TrainStatus = {
  repoPath: "/tmp/repo",
  currentBranch: "feature-b",
  remote: "origin",
  strategy: "merge",
  combinedBranch: "combined",
  warnings: [],
  train: trainDefinition,
  branches: [
    {
      name: "feature-a",
      role: "normal",
      index: 0,
      isCurrent: false,
      isMerged: true,
      isActive: false,
      existsLocally: true,
    },
    {
      name: "feature-b",
      role: "normal",
      index: 1,
      isCurrent: true,
      isMerged: false,
      isActive: true,
      existsLocally: true,
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

describe("active branch helpers", () => {
  it("uses prTarget rather than syncBase for merged-status ancestry", () => {
    expect(getMergedStatusBaseRef(trainDefinition)).toBe("main");
  });

  it("treats an open PR as not merged even if ancestry said merged", () => {
    const branch: BranchStatus = {
      name: "feature-a",
      role: "normal",
      index: 0,
      isCurrent: false,
      isMerged: true,
      isActive: false,
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
    };

    const reconciled = reconcileBranchStatusWithPr(branch);
    expect(reconciled.isMerged).toBe(false);
    expect(reconciled.isActive).toBe(true);
  });

  it("keeps combined branch in active list", () => {
    expect(activeBranches(status).map((branch) => branch.name)).toEqual(["feature-b", "combined"]);
  });

  it("filters combined branch out of normal active branches", () => {
    expect(normalActiveBranches(status).map((branch) => branch.name)).toEqual(["feature-b"]);
  });

  it("resolves checkout aliases relative to the current stack position", () => {
    expect(resolveCheckoutSelector(status, "first")).toBe("feature-a");
    expect(resolveCheckoutSelector(status, "last")).toBe("combined");
    expect(resolveCheckoutSelector(status, "next")).toBe("combined");
    expect(resolveCheckoutSelector(status, "previous")).toBe("feature-a");
    expect(resolveCheckoutSelector(status, "1")).toBe("feature-b");
  });
});
