# git-stack

`git-stack` is a stacked pull request workflow tool with two entrypoints:

- a CLI for operating on stacked branches from a git repo
- an MCP server that exposes stack metadata and operations to tools like Codex

It is a greenfield replacement for `pr-train`, with a subcommand-based CLI, managed PR body sections, cached stack state, and a tool-oriented MCP surface.

## What It Does

`git-stack` models a train of branches that should be merged or rebased in order. It can:

- resolve the current train from your checked-out branch
- sync branch contents down the stack
- ensure GitHub PRs exist and keep their bases/body navigation updated
- advance a stack after earlier branches merge
- expose stack metadata and operations over MCP

## Installation

### Requirements

- Node.js `>=20`
- `pnpm`
- `git`
- GitHub auth via one of:
  - `GITHUB_TOKEN`
  - `gh auth token`
  - global git-stack config

### Local development

```bash
pnpm install
pnpm build
pnpm test
```

### Binaries

The package installs two binaries:

- `git-stack`
- `stack`

The primary UX is intended to be:

```bash
git stack <command>
```

## Quick Start

1. Initialize config:

```bash
git stack init
```

2. Edit `.stack.yml` for your repo.

3. Inspect the current train:

```bash
git stack status
```

4. Sync branch content:

```bash
git stack sync --strategy rebase
```

5. Ensure PRs exist:

```bash
git stack prs ensure
```

6. Run the MCP server when you want tool access:

```bash
git stack mcp
```

## Repository Layout

### CLI

The CLI entrypoint is [src/cli.ts](/Users/slavko/git-stack/src/cli.ts:1).

Responsibilities:

- define subcommands and shared flags
- map command-line arguments onto operation modules
- print human-readable or JSON output

Related implementation modules:

- [src/operations.ts](/Users/slavko/git-stack/src/operations.ts:1): command orchestration
- [src/train.ts](/Users/slavko/git-stack/src/train.ts:1): train resolution and status assembly
- [src/git.ts](/Users/slavko/git-stack/src/git.ts:1): git helpers
- [src/github.ts](/Users/slavko/git-stack/src/github.ts:1): GitHub PR integration

### MCP Server

The MCP server entrypoint is [src/mcp.ts](/Users/slavko/git-stack/src/mcp.ts:1).

Responsibilities:

- expose stack state as MCP resources
- expose stack workflows as MCP tools
- return structured JSON payloads suitable for agents

It runs over stdio and is designed so local tooling can inspect or operate on the current repo’s stack without shelling out through the CLI.

### Configuration and State

- [src/config.ts](/Users/slavko/git-stack/src/config.ts:1): YAML config loading and normalization
- [src/state.ts](/Users/slavko/git-stack/src/state.ts:1): cached derived state in `.git/stack/state.json`
- [src/toc.ts](/Users/slavko/git-stack/src/toc.ts:1): PR body navigation section rendering/upserting

## CLI Reference

## Global CLI Flags

### `--json`

Available on the top-level command. Prints machine-readable JSON instead of the human summary for commands that return an `OperationResult`.

Example:

```bash
git stack --json status
```

## Commands

### `git stack init`

Creates a `.stack.yml` file in the repository root using the bundled template.

Behavior:

- fails if `.stack.yml` already exists
- requires the current directory to be inside a git repo

Parameters:

- none

### `git stack status`

Shows resolved stack status for the current train.

Default behavior:

- if `--train` is omitted, `git-stack` resolves the train from the current branch
- includes branch ordering, active/merged flags, combined branch marker, PR metadata when available, and warnings

Parameters:

- `--train <name>`
  - resolve a specific train instead of inferring it from the current branch

### `git stack validate`

Checks whether the configured train is structurally valid in the current repo context.

Validation includes:

- train resolution
- branch existence checks
- warning propagation from GitHub lookup failures

Parameters:

- `--train <name>`

### `git stack sync`

Propagates changes through the train using merge or rebase.

Behavior:

- ensures the configured combined branch exists if one is defined
- walks train edges in order
- skips edges where the parent branch is already an ancestor of the child branch
- optionally pushes the resulting branches

Parameters:

- `--train <name>`
- `--strategy <merge|rebase>`
  - overrides the config default sync strategy for this invocation
- `--push`
  - pushes branches after sync
- `--force`
  - uses `--force-with-lease` when pushing
- `--include-merged`
  - includes branches already merged into the sync base when syncing

Examples:

```bash
git stack sync
git stack sync --strategy rebase --push
git stack sync --include-merged
```

### `git stack prs ensure`

Creates or updates GitHub pull requests for the train.

Behavior:

- creates PRs for active branches that do not yet have them
- derives non-combined PR title/body from the branch head commit
- uses `combinedTitleTemplate` for the combined branch PR title
- retargets PR bases according to the stack ordering
- rewrites only the managed stack TOC section in each PR body
- optionally comments on updated PRs when configured

Parameters:

- `--train <name>`
- `--draft`
  - create PRs as drafts
- `--ready`
  - force non-draft behavior for this run
- `--print-urls`
  - include PR URLs in emitted operations

Examples:

```bash
git stack prs ensure
git stack prs ensure --draft
git stack prs ensure --ready --print-urls
```

### `git stack advance`

Advances the stack after one or more leading branches have merged.

Behavior:

- identifies merged branches from train status and GitHub PR metadata
- rebases the next active head onto `syncBase`
- rebases downstream active branches onto their new parents
- rebases the combined branch onto the new tail when present
- optionally pushes changes
- retargets remaining active PRs to the correct bases
- optionally comments on updated PRs
- optionally closes merged PRs

Parameters:

- `--train <name>`
- `--push`
- `--force`
- `--close-merged-prs`
  - close merged PRs after the stack is retargeted
- `--comment-updated-prs <body>`
  - add the provided comment to updated PRs during advance

Examples:

```bash
git stack advance
git stack advance --push --force
git stack advance --close-merged-prs --comment-updated-prs "/retest"
```

### `git stack checkout <selector>`

Checks out a branch from the current train.

Selector forms:

- numeric index, such as `0`
- explicit branch name, such as `feature-a`
- literal `combined`

Parameters:

- `<selector>`
- `--train <name>`

Examples:

```bash
git stack checkout 0
git stack checkout combined
git stack checkout feature-b
```

### `git stack mcp`

Starts the MCP server over stdio.

Parameters:

- none

Expected usage:

- launched by an MCP client
- typically not used interactively by humans

## MCP Reference

## Transport

- stdio

## Resources

### `stack://repo/current/state`

Returns the cached state stored in `.git/stack/state.json` when present.

Payload shape:

- `version`
- `updatedAt`
- `trainName`
- `currentBranch`
- `remote`
- `strategy`
- `combinedBranch`
- `branches[]`

### `stack://repo/current/trains`

Returns a JSON payload containing the configured train names for the current repo.

Current shape:

- `operations`
  - list entries shaped like `train:<name>`

## Tools

### `stack_list_trains`

Lists configured trains for the repo.

Arguments:

- `cwd?: string`
  - override the working directory used for repo resolution

### `stack_get_train`

Returns full computed train status.

Arguments:

- `trainName?: string`
- `cwd?: string`

### `stack_validate`

Runs validation logic equivalent to the CLI `validate` command.

Arguments:

- `trainName?: string`
- `cwd?: string`

### `stack_sync_train`

Runs the stack sync flow.

Arguments:

- `trainName?: string`
- `cwd?: string`
- `strategy?: "merge" | "rebase"`
- `push?: boolean`
- `force?: boolean`
- `includeMerged?: boolean`
- `dryRun?: boolean`

### `stack_ensure_prs`

Creates or updates GitHub PRs.

Arguments:

- `trainName?: string`
- `cwd?: string`
- `draft?: boolean`
- `printUrls?: boolean`
- `dryRun?: boolean`

### `stack_advance_train`

Advances the stack lifecycle.

Arguments:

- `trainName?: string`
- `cwd?: string`
- `push?: boolean`
- `force?: boolean`
- `closeMergedPrs?: boolean`
- `commentUpdatedPrs?: string | null`
- `dryRun?: boolean`

### `stack_checkout_branch`

Checks out a branch from the train.

Arguments:

- `selector: string`
- `trainName?: string`
- `cwd?: string`

### `stack_refresh_metadata`

Refreshes computed train metadata and returns the latest status.

Arguments:

- `trainName?: string`
- `cwd?: string`

## Shared MCP Result Shape

Most tools return a serialized `OperationResult` containing:

- `ok: boolean`
- `message: string`
- `warnings: string[]`
- `operations?: string[]`
- `status?: TrainStatus`

## Configuration Reference

Primary repo config file:

- `.stack.yml`

Optional global config file:

- `~/.config/git-stack/config.yml`

Template source:

- [templates/stack.yml](/Users/slavko/git-stack/templates/stack.yml:1)

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

Default git remote used for GitHub and push operations.

Type:

- `string`

Default:

- `origin`

### `defaults.sync.strategy`

Default sync mode used by `git stack sync`.

Allowed values:

- `merge`
- `rebase`

### `defaults.github.host`

GitHub hostname for parsing remote URLs.

Type:

- `string`

Default:

- `github.com`

### `defaults.prs.draft`

Default PR draft mode for `prs ensure`.

Type:

- `boolean`

### `defaults.prs.printUrls`

Whether PR URLs should be included in emitted operation summaries by default.

Type:

- `boolean`

### `defaults.prs.commentOnUpdate`

Optional comment body posted when PRs are updated by PR-management flows.

Type:

- `string | null`

### `defaults.prs.combinedTitleTemplate`

Template for combined branch PR titles.

Supported token:

- `{{train.name}}`

### `defaults.lifecycle.keepMergedInToc`

Controls the intent to keep merged history visible in stack rendering. The current implementation already renders merged sections from computed status.

Type:

- `boolean`

### `defaults.lifecycle.closeMergedPrs`

Whether merged PRs should be closed by default during `advance`.

Type:

- `boolean`

### `trains.<name>.syncBase`

The branch used as the synchronization and advancement base.

Used for:

- merge ancestry checks
- determining merged status
- rebasing the next active head during `advance`

### `trains.<name>.prTarget`

The branch used as the initial PR base for the first active branch and for the combined branch.

### `trains.<name>.branches`

Ordered branch list for the stack.

Supported branch item forms:

- shorthand string
- explicit object

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

- branch order defines stack flow
- at most one combined branch is allowed
- combined branch must be last

## Global Config

The global config is optional and is used for shared defaults and auth fallback.

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

## Derived State

Cached derived state is written to:

- `.git/stack/state.json`

Current fields:

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
- persisted snapshot of the last resolved train state

The cache is best-effort. Commands recompute live state before mutating.

## PR Body Management

`git-stack` manages only the bounded TOC section of a PR body using these markers:

```html
<!-- git-stack:toc:start -->
<!-- git-stack:toc:end -->
```

Behavior:

- if the markers exist, only that section is replaced
- if the markers do not exist, the section is appended
- active and merged branches render in separate sections when applicable

## JSON and Programmatic Output

CLI commands that return an `OperationResult` can be emitted as JSON via `--json`.

This is useful for:

- shell scripting
- CI checks
- wrappers that want the same shape as MCP responses

## Development

Scripts:

- `pnpm build`
- `pnpm clean`
- `pnpm dev`
- `pnpm mcp`
- `pnpm test`
- `pnpm test:watch`

## Tests

Current tests cover:

- config parsing and validation rules
- TOC rendering/upsert behavior
- active-branch lifecycle helpers
- MCP module surface loading

Test files:

- [tests/config.test.ts](/Users/slavko/git-stack/tests/config.test.ts:1)
- [tests/toc.test.ts](/Users/slavko/git-stack/tests/toc.test.ts:1)
- [tests/advance.test.ts](/Users/slavko/git-stack/tests/advance.test.ts:1)
- [tests/mcp.test.ts](/Users/slavko/git-stack/tests/mcp.test.ts:1)

## Current Limitations

- GitHub is the only forge supported
- multi-repo stacks are not implemented
- live GitHub integration is not covered by end-to-end tests yet
- some config fields currently act as documented defaults for behavior that is only partially surfaced in tests
