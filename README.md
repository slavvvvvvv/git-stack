# git-stack

`git-stack` is a stacked pull request workflow tool with two primary surfaces:

- a CLI for operating on stacked branches inside a git repository
- an MCP server for exposing stack metadata and stack operations to agents and other tooling

It is designed as a more ergonomic successor to `pr-train`, with explicit subcommands, managed PR navigation sections, cached repo-local stack state, and an MCP interface that mirrors the core workflows.

## Why Use It

`git-stack` is for teams that split one feature into several reviewable pull requests but still want the whole chain to stay easy to manage.

Useful cases:

- You want to break a large feature into smaller PRs without manually rebasing and retargeting every branch yourself.
- You want each PR in a stack to point at the previous PR automatically, with a visible stack table in every description.
- You want a single command to sync branches, push them, and publish the full stack to GitHub.
- You want an MCP server so agents can inspect stacks, advance them, or help maintain them without scraping git output.

Typical workflow:

- Create a stack from your current branch with `git stack create ...`
- Keep it in sync with `git stack sync`
- Publish or refresh the whole PR chain with `git stack push`
- Advance the remaining work after merges with `git stack advance`

## Table Of Contents

- [Summary](#summary)
- [Quick Start Guide](#quick-start-guide)
- [CLI Docs](#cli-docs)
- [CLI Global Flags](#global-cli-flags)
- [CLI Commands](#cli-commands)
- [git stack init](#git-stack-init)
- [git stack config](#git-stack-config)
- [git stack create](#git-stack-create-branches)
- [git stack add](#git-stack-add-stack)
- [git stack push](#git-stack-push)
- [git stack help](#git-stack-help-topic)
- [git stack status](#git-stack-status)
- [git stack validate](#git-stack-validate)
- [git stack sync](#git-stack-sync)
- [git stack prs ensure](#git-stack-prs-ensure)
- [git stack advance](#git-stack-advance)
- [git stack checkout / c](#git-stack-checkout-selector)
- [git stack mcp](#git-stack-mcp)
- [git stack mcp install](#git-stack-mcp-install-target)
- [MCP Docs](#mcp-docs)
- [MCP Transport](#transport)
- [MCP Resources](#resources)
- [stack://repo/current/state](#stackrepocurrentstate)
- [stack://repo/current/trains](#stackrepocurrenttrains)
- [stack://repo/current/help](#stackrepocurrenthelp)
- [MCP Tools](#tools)
- [stack_help](#stack_help)
- [stack_list_trains](#stack_list_trains)
- [stack_get_train](#stack_get_train)
- [stack_validate](#stack_validate)
- [stack_sync_train](#stack_sync_train)
- [stack_ensure_prs](#stack_ensure_prs)
- [stack_advance_train](#stack_advance_train)
- [stack_checkout_branch](#stack_checkout_branch)
- [stack_refresh_metadata](#stack_refresh_metadata)
- [Additional Info](#additional-info)
- [Contribution](#contribution)

## Summary

## What It Does

`git-stack` models an ordered stack of branches that should be merged or rebased in sequence. It can:

- resolve the current stack from the checked-out branch
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
- printing richer terminal output, including spinners, colored summaries, and stack status tables, or JSON when `--json` is used

The CLI delegates to:

- [src/operations.ts](/Users/slavko/git-stack/src/operations.ts:1) for command orchestration
- [src/train.ts](/Users/slavko/git-stack/src/train.ts:1) for stack resolution and status assembly
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

1. Create the global stacks config:

```bash
git stack init
```

2. Edit `~/.config/git-stack/stacks.yml`. Minimal example:

```yaml
defaults:
  remote: origin
  sync:
    strategy: merge

stacks:
  example-stack:
    syncBase: main
    prTarget: main
    branches:
      - feature-a
      - feature-b
      - name: integration
        role: combined
```

3. Check the resolved stack:

```bash
git stack status
```

4. Open the config in your editor:

```bash
git stack config
```

5. Bootstrap a new stack from the current branch:

```bash
git stack create feature-a feature-b feature-c
```

6. Add the current branch onto an existing stack definition:

```bash
git stack add feature-a
```

7. Push the current stack and create stacked PRs:

```bash
git stack push
git stack push --draft
```

8. Get built-in guidance for a topic:

```bash
git stack help overview
git stack help create
git stack help mcp
```

9. Move around the stack quickly:

```bash
git stack checkout first
git stack checkout next
git stack c previous
git stack c 2
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

### Install Into Supported Clients

```bash
git stack mcp install codex
git stack mcp install claude
git stack mcp install opencode
git stack mcp install pi
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

Creates the global stacks file using the bundled template.

Behavior:

- fails if the global stacks file already exists
- requires the current directory to be inside a git repository

Arguments:

- none

### `git stack config`

Opens the global stacks file in the configured editor.

Behavior:

- uses `EDITOR` first
- falls back to `VISUAL`
- creates the global stacks file from the bundled template if it does not exist yet
- fails if neither `EDITOR` nor `VISUAL` is set

Arguments:

- none

### `git stack create <branches...>`

Creates a new stack from the current branch and writes it into the global stacks file.

Behavior:

- uses the current branch as both `syncBase` and `prTarget`
- creates the first named branch from the current branch
- creates each later branch from the previous newly created branch
- writes a new stack named after the first branch argument
- checks out the first created branch when finished
- errors if any requested branch already exists
- errors if a stack with the first branch name already exists

Arguments:

- `<branches...>`
  - ordered list of branch names to create as a stack

### `git stack add <stack>`

Adds the current checked-out branch onto an existing stack.

Behavior:

- resolves the current branch from git
- appends the current branch to the named stack
- inserts the branch before the combined branch if the stack has one
- errors if the current branch is already present in any stack
- errors if the named stack does not exist

Arguments:

- `<stack>`
  - existing stack name to update

### `git stack push`

Pushes the current stack branches to the remote and creates or updates stacked PRs.

Behavior:

- syncs the stack in sequence
- pushes stack branches to the configured remote
- creates or updates PRs in order so each PR points at the previous branch in the stack
- ensures the managed stack TOC with all stack PR links is present in the PR descriptions
- supports draft/ready publishing
- shows step-by-step CLI progress for sync/push and PR update phases

Arguments:

- `--stack <name>`
- `--strategy <merge|rebase>`
- `--force`
- `--include-merged`
- `--draft`
- `--ready`
- `--print-urls`

### `git stack help [topic]`

Shows built-in guidance about how git-stack works.

Behavior:

- without a topic, prints available help topics
- with a topic, prints focused guidance for that workflow or subsystem
- uses the same shared help registry exposed through the MCP server

Arguments:

- `[topic]`
  - optional topic such as `overview`, `cli`, `mcp`, `create`, `sync`, `prs`, `advance`, or `config`

### `git stack status`

Shows the resolved stack status.

Behavior:

- resolves from the current branch if `--stack` is omitted
- includes branch order, active/merged flags, combined branch marker, PR metadata when available, and warnings
- prints a richer terminal table view by default; use `--json` for machine-readable output

Arguments:

- `--stack <name>`
  - resolve a specific stack explicitly

### `git stack validate`

Validates repo/stack state.

Validation includes:

- stack resolution
- branch existence checks
- GitHub lookup warnings when PR metadata cannot be loaded

Arguments:

- `--stack <name>`

### `git stack sync`

Synchronizes the stack by applying each branch onto the next branch.

Behavior:

- creates the combined branch if configured and missing
- uses merge or rebase per command/config
- skips already-satisfied ancestry edges
- can optionally push updated branches

Arguments:

- `--stack <name>`
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

- `--stack <name>`
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

- `--stack <name>`
- `--push`
- `--force`
- `--close-merged-prs`
- `--comment-updated-prs <body>`

### `git stack checkout <selector>`

Checks out a stack branch.

Supported selector forms:

- `first`
- `last`
- `next`
- `previous`
- numeric index such as `0`
- explicit branch name such as `feature-a`
- literal `combined`

Arguments:

- `<selector>`
- `--stack <name>`

Alias:

- `git stack c <selector>`

### `git stack mcp`

Starts the MCP server over stdio.

Arguments:

- none

### `git stack mcp install <target>`

Installs the git-stack MCP server into a supported client.

Supported targets:

- `codex`
- `claude`
- `opencode`
- `pi`

Behavior:

- `codex`
  - runs the native `codex mcp add` command using the built `dist/cli.js`
- `claude`
  - runs the native `claude mcp add --scope user` command using the built `dist/cli.js`
- `opencode`
  - writes `~/.config/opencode/opencode.json` with a local MCP entry
- `pi`
  - returns an unsupported result because the installed Pi agent explicitly documents that it does not support MCP

Arguments:

- `<target>`
  - one of `codex`, `claude`, `opencode`, or `pi`

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

Returns configured stack identifiers for the current repo.

Current payload shape:

- `operations`
  - values like `stack:<name>`

### `stack://repo/current/help`

Returns built-in MCP help content.

Payload shape:

- `ok`
- `message`
- `warnings`
- `operations`

## Tools

### `stack_help`

Returns built-in help content for MCP consumers.

Arguments:

- `topic?: string`

### `stack_list_trains`

Lists configured stacks.

Arguments:

- `cwd?: string`

### `stack_get_train`

Returns computed stack status.

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

Checks out a branch from the resolved stack.

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

Optional global config:

- `~/.config/git-stack/config.yml`
- `~/.config/git-stack/stacks.yml`

Authoritative stack definitions live in `~/.config/git-stack/stacks.yml`.
Repo-local `.stack.yml` files are treated as a fallback input for backwards compatibility when the global stacks file does not exist yet.

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
    combinedTitleTemplate: "{{stack.name}}"
  lifecycle:
    keepMergedInToc: true
    closeMergedPrs: false

stacks:
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

- `{{stack.name}}`

### `defaults.lifecycle.keepMergedInToc`

Documents the intent to preserve merged history in rendered stack output.

Type:

- `boolean`

### `defaults.lifecycle.closeMergedPrs`

Whether merged PRs should be closed by default during `advance`.

Type:

- `boolean`

### `stacks.<name>.syncBase`

The branch used as the sync and advancement base.

Used for:

- ancestry checks
- merged detection
- rebasing the next active head during `advance`

### `stacks.<name>.prTarget`

The base branch for the first active PR and the combined PR.

### `stacks.<name>.branches`

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
- prepends the managed stack block to the top of the PR body
- renders active and merged branches separately when applicable
- uses a compact HTML table with hosted SVG icons for PR state and the current-view indicator

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

To open the local stack config through your editor integration:

```bash
export EDITOR=nvim
git stack config
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
