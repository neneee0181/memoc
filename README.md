# memoc

> AI agents forget everything when a session ends. memoc gives them a structured memory system so they can pick up exactly where they left off — without you repeating yourself.

Scaffolds a Markdown-based project memory into any codebase. Works with Claude Code, Codex, Cursor, Windsurf, GitHub Copilot, and Gemini CLI.

## Quick Start

```bash
npx @kevin0181/memoc init

# Upgrade memoc in this project without deleting existing memory
npx @kevin0181/memoc@latest upgrade
```

Run inside your project directory. Detects your stack automatically and generates everything agents need.

`init` also creates project-local PATH helpers so agents can keep using memoc even when the global/npm bin is not on PATH.

```bash
# PowerShell
. .\.memoc\env.ps1

# sh/bash
. ./.memoc/env.sh
```

Agents are instructed to use the project-local wrapper if PATH fails:

```bash
# Windows
.\.memoc\bin\memoc.cmd summary

# macOS / Linux
.memoc/bin/memoc summary
```

---

## Ask An Agent To Install

If you are giving this repo or npm package to an AI coding agent, use a prompt like:

```text
Install memoc in this project and run init.
Use the npm package only. Run `npx @kevin0181/memoc@latest init`
from this project's root. Do not clone the GitHub repository into this project.
If npm/npx is missing, stop and ask the user to install Node.js LTS with npm first.
After init, verify with the project-local wrapper:
Windows: .\.memoc\bin\memoc.cmd summary
macOS/Linux: .memoc/bin/memoc summary
```

Agent install checklist:

1. Run `node --version` and `npm --version`. If either fails, ask the user to install Node.js LTS with npm first.
2. Run `npx @kevin0181/memoc@latest init` from the target project root.
3. Do not clone this GitHub repository into the target project. Do not download the repo ZIP as an installer.
4. `.claude/settings.json` is intentionally generated for the Claude Code Stop hook; keep or commit it only if the project wants that hook.
5. After init, do not depend on global PATH. Use the project-local wrapper when needed (project-local `.memoc/runtime` is preferred when present, useful for sandboxed agents):
   - Windows: `.\.memoc\bin\memoc.cmd <command>`
   - macOS/Linux: `.memoc/bin/memoc <command>`

If `node --version` or `npm --version` fails, memoc cannot be installed yet. Install Node.js LTS with npm first, then repeat the steps above.

---

## The Problem

Every new AI session starts cold. You re-explain the project, the decisions already made, what's done and what isn't. The agent rediscovers what the last one figured out.

memoc installs a memory structure that agents read at session start, update as they work, and hand off to the next session — automatically.

---

## Commands

```bash
# First-time setup — scaffold memory, detect stack, install Claude Code hook
npx @kevin0181/memoc init

# Re-scan project and refresh managed sections
npx @kevin0181/memoc update

# Shared repo activity tracking
npx @kevin0181/memoc actor
npx @kevin0181/memoc actor set neneee
npx @kevin0181/memoc work "Auth refresh fix" --from-git
npx @kevin0181/memoc activity
npx @kevin0181/memoc activity --write
npx @kevin0181/memoc doctor

# Print current status in ~10 lines
npx @kevin0181/memoc summary

# Search memory/agent docs first (token-efficient)
npx @kevin0181/memoc search "auth"
npx @kevin0181/memoc search "auth" --snippets --limit 5

# Search project source/text files only when memory is not enough
npx @kevin0181/memoc grep "GetParticles"
npx @kevin0181/memoc grep "GetParticles" --snippets --limit 5

# Create raw/source records and durable wiki topic notes
npx @kevin0181/memoc ingest path/to/source.md
npx @kevin0181/memoc ingest https://example.com/spec
npx @kevin0181/memoc note "Auth flow comparison"
npx @kevin0181/memoc lint-wiki

# Estimate token cost of current memory files
npx @kevin0181/memoc tokens

# Archive and compact an oversized startup summary
npx @kevin0181/memoc trim-summary

# Compact oversized memoc files and refresh generated indexes
npx @kevin0181/memoc compress

# Add the same protocol to another agent's entry file
npx @kevin0181/memoc add cursor
npx @kevin0181/memoc add windsurf
npx @kevin0181/memoc add copilot
npx @kevin0181/memoc add gemini
```

---

## Upgrade Existing Projects

memoc never auto-updates itself. Upgrade only when you choose to run:

```bash
npx @kevin0181/memoc@latest upgrade
```

Run it from the project root. It preserves existing project memory, including:

- `.memoc/session-summary.md`
- `.memoc/02-current-project-state.md` human-written sections
- `.memoc/03-decisions.md`
- `.memoc/04-handoff.md`
- `.memoc/06-project-rules.md`
- Legacy `.memoc/log.md` if present
- Legacy `.memoc/systems/` if present (moved to `.memoc/raw/legacy-systems/` on upgrade)
- `.memoc/wiki/`

It refreshes the managed blocks, project-local wrappers, runtime copy, PATH helpers, and memoc-owned protocol templates. User-owned memory files such as `session-summary.md`, `03-decisions.md`, `04-handoff.md`, `06-project-rules.md`, and wiki topic/source pages are preserved. Upgrade also runs the `trim-summary` compaction pass so startup memory stays small. If `memoc` is not on PATH after upgrading, keep using:

```bash
# Windows
.\.memoc\bin\memoc.cmd summary

# macOS / Linux
.memoc/bin/memoc summary
```

---

## What Gets Created

```
CLAUDE.md                                    ← Claude Code entry point (auto-loaded)
AGENTS.md                                    ← Codex entry point (auto-loaded)
llms.txt                                     ← LLM-facing project map
.claude/settings.json                        ← Claude Code Stop hook

.memoc/
  bin/memoc                                  ← project-local wrapper for PATH fallback
  env.ps1 · env.sh                           ← shell helpers that prepend .memoc/bin to PATH
  session-summary.md                         ← Only required startup read (~150 tokens)
  02-current-project-state.md               ← Status, open tasks, commands
  03-decisions.md                            ← Durable decision log
  04-handoff.md                              ← Resume context, verified/unverified
  06-project-rules.md                        ← User preferences
  activity.md                                ← Short shared activity index
  actors/                                    ← Actor profiles for shared repos
  worklog/                                   ← Per-actor work records to reduce conflicts
  raw/                                       ← Immutable source material, not a startup read
  wiki/project/                              ← Project implementation wiki
  wiki/knowledge/                            ← Source-backed knowledge wiki

skills/project-memory-maintainer/SKILL.md   ← Wiki operations guide
```

---

## How Agents Use It

Every entry file (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, etc.) gets the same protocol injected as a managed block:

```
## Session Start
- [ ] Read `.memoc/session-summary.md`
- [ ] `.pending` exists? → review changed files → update memory if needed → delete it
- [ ] If `memoc` is not found, use the project-local wrapper (project-local `.memoc/runtime` is preferred when present).

## Before Opening More Files
- [ ] Run `memoc search "<query>"` first
- [ ] Open on demand: `02` status · `04` resume · `06` rules · `llms.txt` map
- [ ] Use `memoc grep "<query>"` only when memory is not enough.
- [ ] For durable source/wiki work, use `memoc ingest`, `memoc note`, and `memoc lint-wiki`.
- [ ] In shared repos, record meaningful work with `memoc work "<title>"`.
- [ ] Keep output small: `summary`, `search --limit`, `search --snippets`

## Before Finishing _(update only applicable files; skip Q&A / throwaway exploration)_
- [ ] Code/config/deps changed → `02` (version, commands list, Last synced) + `session-summary.md` (status, changed, open tasks)
- [ ] Decision made → `03-decisions.md` (what & why) + `02`
- [ ] Work incomplete or risky → `04-handoff.md` (verified commands, unverified items, next steps)
- [ ] Rule/preference set → `06-project-rules.md`
- [ ] Wiki/project-memory work → read `skills/project-memory-maintainer/SKILL.md`
- [ ] Shared repo work → prefer `memoc work "<title>" --from-git`; run `memoc activity --write` only when regenerating indexes.
- [ ] Keep `session-summary.md` replace-only; completed work belongs in actor worklogs.
```

The checklist tells agents exactly when to update, which file to update, and what to record — so nothing gets missed.

---

## Token Efficiency

Startup cost is kept minimal by design.

| What loads | Tokens |
|---|---|
| `CLAUDE.md` (managed block only) | ~280 |
| `session-summary.md` (only required read) | ~150 |
| **Total startup** | **~430** |

Everything else is on-demand. Use `memoc tokens` to see the live breakdown for your project.

`session-summary.md` is a replace-only startup snapshot, not a timeline. If it grows beyond the warning threshold, run `memoc compress` or `memoc trim-summary`; completed history belongs in `.memoc/worklog/<actor>/YYYY-MM/`, and unfinished/risky resume detail belongs in `.memoc/04-handoff.md`.

---

## Claude Code Auto-Detection

`init` installs a lightweight `Stop` hook in `.claude/settings.json`. After each Claude Code response it checks:

```bash
git status --porcelain
```

If uncommitted changes exist, it writes `.memoc/.pending` with a timestamp and the changed filenames. At the next session start, Claude reads `.pending` and decides whether to update memory — then deletes the file.

No extra setup. Add `.memoc/.pending` to `.gitignore` to keep it untracked.

---

## Multi-Agent Support

`init` creates `CLAUDE.md` (Claude Code) and `AGENTS.md` (Codex) by default. All agents follow the same 3-phase checklist protocol.

Add more agents on demand:

| Command | Creates |
|---|---|
| `add cursor` | `.cursorrules` |
| `add windsurf` | `.windsurfrules` |
| `add copilot` | `.github/copilot-instructions.md` |
| `add gemini` | `GEMINI.md` |

Running `update` refreshes managed blocks in all existing agent files.

## Shared Repos

Use `memoc work "<title>" --from-git` for meaningful work in shared repositories. It creates a new actor-scoped file under `.memoc/worklog/<actor>/YYYY-MM/`, prefills branch and changed files from git, and avoids append conflicts in shared files.

Actor detection order:

1. `MEMOC_ACTOR`
2. `.memoc/local/actor` from `memoc actor set <name>`
3. `git config user.name`
4. `git config user.email`
5. OS username

`.memoc/local/` is ignored by git so each machine can keep its own actor setting.

`activity.md`, `actors/README.md`, and `worklog/README.md` are regenerated indexes. Run `memoc activity --write` when you want to refresh them from worklog files.

`log.md` is legacy. New installs do not create it, and shared activity should live in worklog files. On upgrade, an existing `.memoc/log.md` is moved to `.memoc/raw/legacy-log.md` so old history is preserved but no longer part of the normal memory flow.

---

## Supported Stacks

Auto-detected from your project files:

Node.js · Next.js · React · Vue · Svelte · Angular · Nuxt · Astro · Express · Fastify · Hono · Electron · Tauri · TypeScript · Prisma · Drizzle · Supabase · Python · FastAPI · Django · Flask · PyTorch · Rust · Go · C++ / CMake · .NET · Java · Flutter · Unreal Engine

---

## How It Works

- **New project** — scaffolds all memory files with sensible defaults.
- **Existing project** — detects your stack and fills in real project info (name, scripts, config files).
- **Already initialized** — `init` injects the managed block without touching your existing content. `update` re-scans and refreshes project-specific sections.
- **Long-running projects** — use actor worklogs for history; run `compress` to trim startup memory, archive legacy logs, and refresh generated activity indexes.

---

## Skills Plugin (Claude Code, Codex Desktop, and Skills-Compatible Agents)

Install the memoc plugin once to get `/memoc-*` slash commands in Claude Code, Codex Desktop, and agents that read the common Skills location:

```bash
# Install memoc globally (if not already)
npm install -g @kevin0181/memoc

# Register the plugin and global skills (run once)
memoc install-plugin

# Then restart open agent apps
```

Or via npx (no global install needed):

```bash
npx @kevin0181/memoc install-plugin
```

To remove:

```bash
memoc uninstall-plugin
```

`install-plugin` writes the Claude Code plugin to `~/.claude/plugins/cache/memoc/`, enables `"memoc@memoc"` in `~/.claude/settings.json`, and installs global Skills entries under `~/.agents/skills/` for Codex Desktop and other skills-compatible agents. It is idempotent — safe to re-run after upgrading memoc.

### Available skills

| Skill | What it does |
|-------|-------------|
| `/memoc` | Follow the full memoc memory operating protocol |
| `/memoc-init` | Initialize memoc in the current project |
| `/memoc-upgrade` | Upgrade memoc, preserve memory |
| `/memoc-search` | Search memory/agent docs |
| `/memoc-work` | Create actor worklog entry |
| `/memoc-note` | Save durable topic/query-result scaffold |
| `/memoc-doctor` | Check common memoc health issues |
| `/memoc-compress` | Compact memory files, refresh indexes |
| `/memoc-code` | Apply Karpathy-inspired coding guardrails |
| `/memoc-think` | Surface assumptions, ambiguity, and tradeoffs before coding |
| `/memoc-simple` | Keep the implementation minimal and avoid overengineering |
| `/memoc-scope` | Make surgical diffs without unrelated refactors |
| `/memoc-goal` | Define success criteria and verify with tests/repros |

The `/memoc-code` family is adapted from [`multica-ai/andrej-karpathy-skills`](https://github.com/multica-ai/andrej-karpathy-skills), MIT licensed, with short memoc names for coding workflows.

---

## License

MIT
