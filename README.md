# git-stack

`git-stack` is a stacked pull request workflow tool with two primary surfaces:

- a CLI for operating on stacked branches inside a git repository
- an MCP server for exposing stack metadata and stack operations to agents and other tooling

It is designed as a more ergonomic successor to `pr-train`, with explicit subcommands, managed PR navigation sections, cached repo-local stack state, and an MCP interface that mirrors the core workflows.

## Table Of Contents

- [Summary](#summary)
- [Quick Start Guide](#quick-start-guide)
- [CLI Docs](#cli-docs)
- [MCP Docs](#mcp-docs)
- [Additional Info](#additional-info)
- [Contribution](#contribution)

## Summary

## What It Does

`git-stack` models an ordered train of branches that should be merged or rebased in sequence. It can:

- resolve the current train from the checked-out branch
- sync branch content down the stack
- create or update GitHub pull requests and keep bases aligned
- maintain a managed stack table of contents inside PR bodies
- advance a stack after leading branches merge
- expose stack metadata and mutating operations over MCP

## Main Surfaces

### CLI

The CLI entrypoint is [src/cli.ts](/Users/slavko/git-stack/src/cli.ts:1).

It is responsible for:

- defining subcommands and user-facing flags
- turning CLI args into structured operation calls
- printing human-readable summaries or JSON

The CLI delegates to:

- [src/operations.ts](/Users/slavko/git-stack/src/operations.ts:1) for command orchestration
- [src/train.ts](/Users/slavko/git-stack/src/train.ts:1) for train resolution and status assembly
- [src/git.ts](/Users/slavko/git-stack/src/git.ts:1) for git helpers
- [src/github.ts](/Users/slavko/git-stack/src/github.ts:1) for GitHub integration

### MCP

The MCP server entrypoint is [src/mcp.ts](/Users/slavko/git-stack/src/mcp.ts:1).

It is responsible for:

- exposing repo stack state as resources
- exposing stack workflows as tools
- returning structured JSON payloads suitable for agents

### Config And State

Supporting modules:

- [src/config.ts](/Users/slavko/git-stack/src/config.ts:1): YAML config loading and normalization
- [src/state.ts](/Users/slavko/git-stack/src/state.ts:1): cached derived state in `.git/stack/state.json`
- [src/toc.ts](/Users/slavko/git-stack/src/toc.ts:1): managed PR TOC rendering and replacement
- [templates/stack.yml](/Users/slavko/git-stack/templates/stack.yml:1): starter repo config

## Requirements

- Node.js `>=20`
- `pnpm`
- `git`
- GitHub authentication via one of:
  - `GITHUB_TOKEN`
  - `gh auth token`
  - `~/.config/git-stack/config.yml`

## Quick Start Guide

## Install

```bash
pnpm install
pnpm build
pnpm test
```

Installed binaries:

- `git-stack`
- `stack`

Primary usage:

```bash
git stack <command>
```

## Basic Setup

1. Create the repo-local config:

```bash
git stack init
```

2. Edit `.stack.yml` for your repo. Minimal example:

```yaml
defaults:
  remote: origin
  sync:
    strategy: merge

trains:
  example-stack:
    syncBase: main
    prTarget: main
    branches:
      - feature-a
      - feature-b
      - name: integration
        role: combined
```

3. Check the resolved train:

```bash
git stack status
```

## Common Workflows

### Sync The Stack

```bash
git stack sync
git stack sync --strategy rebase
git stack sync --push
```

### Create Or Update PRs

```bash
git stack prs ensure
git stack prs ensure --draft
git stack prs ensure --ready --print-urls
```

### Advance After Merge

```bash
git stack advance
git stack advance --push --force
git stack advance --close-merged-prs --comment-updated-prs "/retest"
```

### Run The MCP Server

```bash
git stack mcp
```

## CLI Docs

## Global CLI Flags

### `--json`

Top-level flag that prints machine-readable JSON instead of the normal text summary for commands returning an `OperationResult`.

Example:

```bash
git stack --json status
```

## CLI Commands

### `git stack init`

Creates `.stack.yml` in the repo root using the bundled template.

Behavior:

- fails if `.stack.yml` already exists
- requires the current directory to be inside a git repository

Arguments:

- none

### `git stack status`

Shows the resolved train status.

Behavior:

- resolves from the current branch if `--train` is omitted
- includes branch order, active/merged flags, combined branch marker, PR metadata when available, and warnings

Arguments:

- `--train <name>`
  - resolve a specific train explicitly

### `git stack validate`

Validates repo/train state.

Validation includes:

- train resolution
- branch existence checks
- GitHub lookup warnings when PR metadata cannot be loaded

Arguments:

- `--train <name>`

### `git stack sync`

Synchronizes the train by applying each branch onto the next branch.

Behavior:

- creates the combined branch if configured and missing
- uses merge or rebase per command/config
- skips already-satisfied ancestry edges
- can optionally push updated branches

Arguments:

- `--train <name>`
- `--strategy <merge|rebase>`
- `--push`
- `--force`
  - push with `--force-with-lease`
- `--include-merged`
  - include branches already merged into the sync base

### `git stack prs ensure`

Creates or updates GitHub PRs for active branches.

Behavior:

- derives normal PR title/body from the branch head commit
- uses `combinedTitleTemplate` for the combined branch title
- retargets bases according to stack order
- updates only the managed PR body TOC section
- can post the configured update comment when PRs change

Arguments:

- `--train <name>`
- `--draft`
- `--ready`
  - force non-draft mode for this run
- `--print-urls`

### `git stack advance`

Advances the stack after one or more leading branches have merged.

Behavior:

- rebases the next active head onto `syncBase`
- rebases downstream active branches onto their new parent branches
- rebases the combined branch onto the new active tail when present
- can retarget remaining PR bases
- can comment on updated PRs
- can close merged PRs

Arguments:

- `--train <name>`
- `--push`
- `--force`
- `--close-merged-prs`
- `--comment-updated-prs <body>`

### `git stack checkout <selector>`

Checks out a train branch.

Supported selector forms:

- numeric index such as `0`
- explicit branch name such as `feature-a`
- literal `combined`

Arguments:

- `<selector>`
- `--train <name>`

### `git stack mcp`

Starts the MCP server over stdio.

Arguments:

- none

## MCP Docs

## Transport

- stdio

## Resources

### `stack://repo/current/state`

Returns the cached stack state stored in `.git/stack/state.json` when present.

Payload fields:

- `version`
- `updatedAt`
- `trainName`
- `currentBranch`
- `remote`
- `strategy`
- `combinedBranch`
- `branches[]`

### `stack://repo/current/trains`

Returns configured train identifiers for the current repo.

Current payload shape:

- `operations`
  - values like `train:<name>`

## Tools

### `stack_list_trains`

Lists configured trains.

Arguments:

- `cwd?: string`

### `stack_get_train`

Returns computed train status.

Arguments:

- `trainName?: string`
- `cwd?: string`

### `stack_validate`

Runs validation logic equivalent to the CLI `validate` command.

Arguments:

- `trainName?: string`
- `cwd?: string`

### `stack_sync_train`

Runs stack synchronization.

Arguments:

- `trainName?: string`
- `cwd?: string`
- `strategy?: "merge" | "rebase"`
- `push?: boolean`
- `force?: boolean`
- `includeMerged?: boolean`
- `dryRun?: boolean`

### `stack_ensure_prs`

Creates or updates PRs.

Arguments:

- `trainName?: string`
- `cwd?: string`
- `draft?: boolean`
- `printUrls?: boolean`
- `dryRun?: boolean`

### `stack_advance_train`

Advances the lifecycle of a stack.

Arguments:

- `trainName?: string`
- `cwd?: string`
- `push?: boolean`
- `force?: boolean`
- `closeMergedPrs?: boolean`
- `commentUpdatedPrs?: string | null`
- `dryRun?: boolean`

### `stack_checkout_branch`

Checks out a branch from the resolved train.

Arguments:

- `selector: string`
- `trainName?: string`
- `cwd?: string`

### `stack_refresh_metadata`

Refreshes derived metadata and returns current status.

Arguments:

- `trainName?: string`
- `cwd?: string`

## Shared Result Shape

Most CLI JSON output and MCP tool responses serialize the same operation model:

- `ok: boolean`
- `message: string`
- `warnings: string[]`
- `operations?: string[]`
- `status?: TrainStatus`

## Config API

Primary repo config:

- `.stack.yml`

Optional global config:

- `~/.config/git-stack/config.yml`

## Repo Config Schema

```yaml
defaults:
  remote: origin
  sync:
    strategy: merge
  github:
    host: github.com
  prs:
    draft: false
    printUrls: false
    commentOnUpdate:
    combinedTitleTemplate: "{{train.name}}"
  lifecycle:
    keepMergedInToc: true
    closeMergedPrs: false

trains:
  my-stack:
    syncBase: main
    prTarget: main
    branches:
      - feature-a
      - feature-b
      - name: integration
        role: combined
```

## Config Fields

### `defaults.remote`

Default git remote used for push and GitHub operations.

Type:

- `string`

Default:

- `origin`

### `defaults.sync.strategy`

Default stack sync strategy.

Allowed values:

- `merge`
- `rebase`

### `defaults.github.host`

GitHub hostname used when parsing remotes.

Type:

- `string`

Default:

- `github.com`

### `defaults.prs.draft`

Default draft setting for `prs ensure`.

Type:

- `boolean`

### `defaults.prs.printUrls`

Whether PR URLs should be included in emitted operations by default.

Type:

- `boolean`

### `defaults.prs.commentOnUpdate`

Optional PR comment body posted when PRs are updated by stack flows.

Type:

- `string | null`

### `defaults.prs.combinedTitleTemplate`

Template for combined branch PR titles.

Supported token:

- `{{train.name}}`

### `defaults.lifecycle.keepMergedInToc`

Documents the intent to preserve merged history in rendered stack output.

Type:

- `boolean`

### `defaults.lifecycle.closeMergedPrs`

Whether merged PRs should be closed by default during `advance`.

Type:

- `boolean`

### `trains.<name>.syncBase`

The branch used as the sync and advancement base.

Used for:

- ancestry checks
- merged detection
- rebasing the next active head during `advance`

### `trains.<name>.prTarget`

The base branch for the first active PR and the combined PR.

### `trains.<name>.branches`

Ordered branch list defining stack flow.

Supported item forms:

String form:

```yaml
- feature-a
```

Object form:

```yaml
- name: integration
  role: combined
```

Rules:

- order matters
- at most one combined branch is allowed
- the combined branch must be last

## Global Config

Global config can provide shared defaults and token fallback.

Example:

```yaml
defaults:
  remote: upstream
github:
  token: ghp_example
  host: github.com
```

Auth precedence:

1. `GITHUB_TOKEN`
2. `gh auth token`
3. `~/.config/git-stack/config.yml`

## Additional Info

## Derived State

Cached derived state is written to:

- `.git/stack/state.json`

Fields:

- `version`
- `updatedAt`
- `trainName`
- `currentBranch`
- `remote`
- `strategy`
- `combinedBranch`
- `branches[]`

Purpose:

- fast metadata access for MCP
- a persisted snapshot of the most recently resolved status

## PR Body Management

Managed PR body markers:

```html
<!-- git-stack:toc:start -->
<!-- git-stack:toc:end -->
```

Behavior:

- replaces only the bounded managed section when markers already exist
- appends the section when the markers are absent
- renders active and merged branches separately when applicable

## Development

Useful scripts:

- `pnpm build`
- `pnpm clean`
- `pnpm dev`
- `pnpm mcp`
- `pnpm test`
- `pnpm test:watch`

## Tests

Current tests cover:

- config parsing and validation rules
- TOC rendering and replacement
- active branch lifecycle helpers
- MCP module surface loading

Test files:

- [tests/config.test.ts](/Users/slavko/git-stack/tests/config.test.ts:1)
- [tests/toc.test.ts](/Users/slavko/git-stack/tests/toc.test.ts:1)
- [tests/advance.test.ts](/Users/slavko/git-stack/tests/advance.test.ts:1)
- [tests/mcp.test.ts](/Users/slavko/git-stack/tests/mcp.test.ts:1)

## Limitations

- GitHub is the only supported forge
- multi-repo stacks are not implemented
- live GitHub integration is not covered by end-to-end tests yet
- some documented defaults are broader than the current test surface

## Contribution

## Development Setup

Install dependencies and verify the current tree:

```bash
pnpm install
pnpm build
pnpm test
```

Useful scripts:

- `pnpm build`
- `pnpm clean`
- `pnpm dev`
- `pnpm mcp`
- `pnpm test`
- `pnpm test:watch`

## Local CLI Install

To install the CLI from this checkout so `git stack` resolves to your local build:

```bash
pnpm build
npm link
```

That registers the package’s binaries globally for your user:

- `git-stack`
- `stack`

After linking, verify the local checkout is being used:

```bash
git-stack --help
stack --help
```

If your git installation is configured to discover `git-*` executables on your `PATH`, `git stack` should also work:

```bash
git stack --help
```

When you change the source, rebuild before rerunning:

```bash
pnpm build
```

To remove the local linked install later:

```bash
npm unlink -g git-stack
```

## Running Without Linking

For local iteration without installing globally:

```bash
pnpm dev -- --help
pnpm dev -- status
pnpm mcp
```

This is useful when you want to exercise the CLI and MCP server directly from the repo without modifying your global environment.

## Contributor Notes

- Keep the CLI and MCP docs aligned with the real command surface in [src/cli.ts](/Users/slavko/git-stack/src/cli.ts:1) and [src/mcp.ts](/Users/slavko/git-stack/src/mcp.ts:1).
- Prefer documenting config and argument behavior from implementation, not from intended future behavior.
- Run `pnpm test` before committing docs that describe command or config semantics.
