import { describe, expect, it } from "vitest";
import { activeBranches, getMergedStatusBaseRef, normalActiveBranches } from "../src/train.js";
import type { TrainDefinition, TrainStatus } from "../src/types.js";

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

  it("keeps combined branch in active list", () => {
    expect(activeBranches(status).map((branch) => branch.name)).toEqual(["feature-b", "combined"]);
  });

  it("filters combined branch out of normal active branches", () => {
    expect(normalActiveBranches(status).map((branch) => branch.name)).toEqual(["feature-b"]);
  });
});
