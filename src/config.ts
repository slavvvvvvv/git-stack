import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import type {
  BranchDefinition,
  GlobalConfig,
  RepoDefaults,
  StackDefinition,
  StackConfig,
} from "./types.js";

const branchItemSchema = z.union([
  z.string().trim().min(1),
  z.object({
    name: z.string().trim().min(1),
    role: z.enum(["normal", "combined"]).default("normal"),
  }),
]);

const repoDefaultsSchema = z.object({
  remote: z.string().trim().min(1).default("origin"),
  sync: z
    .object({
      strategy: z.enum(["merge", "rebase"]).default("merge"),
    })
    .default({ strategy: "merge" }),
  github: z
    .object({
      host: z.string().trim().min(1).default("github.com"),
    })
    .default({ host: "github.com" }),
  prs: z
    .object({
      draft: z.boolean().default(false),
      printUrls: z.boolean().default(false),
      commentOnUpdate: z.string().nullable().default(null),
      combinedTitleTemplate: z.string().trim().min(1).default("{{stack.name}}"),
    })
    .default({
      draft: false,
      printUrls: false,
      commentOnUpdate: null,
      combinedTitleTemplate: "{{stack.name}}",
    }),
  lifecycle: z
    .object({
      keepMergedInToc: z.boolean().default(true),
      closeMergedPrs: z.boolean().default(false),
    })
    .default({
      keepMergedInToc: true,
      closeMergedPrs: false,
    }),
});

const stackSchema = z.object({
  syncBase: z.string().trim().min(1),
  prTarget: z.string().trim().min(1),
  branches: z.array(branchItemSchema).min(1),
});

const stackConfigSchema = z.object({
  defaults: z.unknown().optional(),
  stacks: z.record(z.string().trim().min(1), stackSchema).optional(),
});

const globalConfigSchema = z.object({
  defaults: z.unknown().optional(),
  github: z
    .object({
      token: z.string().trim().min(1).optional(),
      host: z.string().trim().min(1).optional(),
    })
    .optional(),
});

function parseYamlFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content);
}

function branchDefinitionFromInput(input: string | { name: string; role?: "normal" | "combined" }): BranchDefinition {
  if (typeof input === "string") {
    return { name: input, role: "normal" };
  }

  return {
    name: input.name,
    role: input.role ?? "normal",
  };
}

function normalizeStack(name: string, raw: z.infer<typeof stackSchema>): StackDefinition {
  const branches = raw.branches.map(branchDefinitionFromInput);
  const combinedBranches = branches.filter((branch) => branch.role === "combined");
  if (combinedBranches.length > 1) {
    throw new Error(`Stack "${name}" has more than one combined branch.`);
  }

  const combinedBranch = combinedBranches[0];
  if (combinedBranch && branches[branches.length - 1]?.name !== combinedBranch.name) {
    throw new Error(`Stack "${name}" must place the combined branch last.`);
  }

  return {
    name,
    syncBase: raw.syncBase,
    prTarget: raw.prTarget,
    branches,
  };
}

function mergeDefaults(globalDefaults: Partial<RepoDefaults> | undefined, repoDefaultsInput: Partial<RepoDefaults> | undefined): RepoDefaults {
  const repoDefaults = repoDefaultsSchema.parse(repoDefaultsInput ?? {});
  return {
    remote: repoDefaults.remote || globalDefaults?.remote || "origin",
    sync: {
      strategy: repoDefaults.sync.strategy || globalDefaults?.sync?.strategy || "merge",
    },
    github: {
      host: repoDefaults.github.host || globalDefaults?.github?.host || "github.com",
    },
    prs: {
      draft: repoDefaults.prs.draft ?? globalDefaults?.prs?.draft ?? false,
      printUrls: repoDefaults.prs.printUrls ?? globalDefaults?.prs?.printUrls ?? false,
      commentOnUpdate: repoDefaults.prs.commentOnUpdate ?? globalDefaults?.prs?.commentOnUpdate ?? null,
      combinedTitleTemplate:
        repoDefaults.prs.combinedTitleTemplate ||
        globalDefaults?.prs?.combinedTitleTemplate ||
        "{{stack.name}}",
    },
    lifecycle: {
      keepMergedInToc: repoDefaults.lifecycle.keepMergedInToc ?? globalDefaults?.lifecycle?.keepMergedInToc ?? true,
      closeMergedPrs: repoDefaults.lifecycle.closeMergedPrs ?? globalDefaults?.lifecycle?.closeMergedPrs ?? false,
    },
  };
}

export function createDefaultRepoDefaults(): RepoDefaults {
  return repoDefaultsSchema.parse({});
}

export function getRepoConfigPath(repoPath: string): string {
  return path.join(repoPath, ".stack.yml");
}

function getConfigHomeDir(): string {
  return process.env.GIT_STACK_HOME?.trim() || os.homedir();
}

export function getGlobalConfigPath(): string {
  return path.join(getConfigHomeDir(), ".config", "git-stack", "config.yml");
}

export function getGlobalStacksPath(): string {
  return path.join(getConfigHomeDir(), ".config", "git-stack", "stacks.yml");
}

export function getGlobalCachePath(): string {
  return path.join(getConfigHomeDir(), ".config", "git-stack", "cache.json");
}

export function getTemplatePath(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "templates", "stack.yml");
}

export function loadGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const parsed = globalConfigSchema.parse(parseYamlFile(configPath));
  return {
    defaults: parsed.defaults as Partial<RepoDefaults> | undefined,
    github: parsed.github,
  };
}

export function loadStackConfig(repoPath: string): StackConfig {
  const globalStacksPath = getGlobalStacksPath();
  const repoConfigPath = getRepoConfigPath(repoPath);
  const configPath = fs.existsSync(globalStacksPath) ? globalStacksPath : repoConfigPath;
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at ${globalStacksPath} or ${repoConfigPath}`);
  }

  const globalConfig = loadGlobalConfig();
  const parsed = stackConfigSchema.parse(parseYamlFile(configPath));
  const defaults = mergeDefaults(globalConfig.defaults, parsed.defaults as Partial<RepoDefaults> | undefined);
  const rawStacks = parsed.stacks;
  if (!rawStacks || Object.keys(rawStacks).length === 0) {
    throw new Error(`Config file at ${configPath} does not define any stacks.`);
  }
  const stacks = Object.entries(rawStacks).map(([name, stack]) => normalizeStack(name, stack));

  return {
    defaults,
    stacks,
  };
}

export function writeStackConfig(repoPath: string, config: StackConfig): void {
  const repoConfigPath = getGlobalStacksPath();
  fs.mkdirSync(path.dirname(repoConfigPath), { recursive: true });
  const serialized = {
    defaults: config.defaults,
    stacks: Object.fromEntries(
      config.stacks.map((stack) => [
        stack.name,
        {
          syncBase: stack.syncBase,
          prTarget: stack.prTarget,
          branches: stack.branches.map((branch) => {
            if (branch.role === "combined") {
              return {
                name: branch.name,
                role: branch.role,
              };
            }

            return branch.name;
          }),
        },
      ]),
    ),
  };

  fs.writeFileSync(repoConfigPath, yaml.dump(serialized, { lineWidth: 100 }), "utf8");
}

export function writeTemplateConfig(targetPath: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const sourcePath = getTemplatePath();
  fs.copyFileSync(sourcePath, targetPath);
}

export function findStackByName(config: StackConfig, name: string): StackDefinition | undefined {
  return config.stacks.find((stack) => stack.name === name);
}

export function resolveCombinedBranch(stack: StackDefinition): string | null {
  const combined = stack.branches.find((branch) => branch.role === "combined");
  if (!combined) {
    return null;
  }

  return combined.name;
}
