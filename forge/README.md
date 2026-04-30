# spark-forge

Spark-Forge is a personal spec-driven development workflow for building KeyRa — a visual mapping engine for healthcare data integration.

It provides a structured approach to turning ideas into durable planning artifacts, executable task sets, verified implementation, and preserved work history. Every piece of work begins with a specification. Nothing is implemented without a plan.

---

## What's In This Repo

```
.opencode/
  agents/         AI agent definitions (spec, task, ui-task)
  commands/       Slash commands (/new-spec, /complete-task, /archive-spec, /status)

forge/
  architecture/   Architecture reference documents — living source of truth
  config/
    workflow/     AGENTS.md, WORKFLOW.md
    templates/    SPEC_TEMPLATE.md, TASK_TEMPLATE.md
  active/         In-progress specs and tasks
  completed/      Archived specs and tasks

src/              Backend and shared source code (engine, Lambda handlers)
ui/               Frontend source code (React / TypeScript / Vite)
tests/            Test files
```

---

## Setup

### Prerequisites

- Node.js (required for MCP servers)
- OpenCode CLI
- A Tavily API key — sign up at [tavily.com](https://tavily.com)

### Set Environment Variables

Tavily is configured via environment variable. Set `TAVILY_API_KEY` once — it persists across terminal sessions.

**macOS / Linux**

```bash
# Add to ~/.zshrc or ~/.bashrc
export TAVILY_API_KEY=your_api_key_here

# Apply immediately
source ~/.zshrc
```

**Windows (PowerShell)**

```powershell
# Set permanently at user level — restart terminal after running
[System.Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "your_api_key_here", "User")
```

### Verify Setup

Start a new opencode session and run:

```
/mcp
```

All four MCP servers should show as `connected`. If Tavily shows `failed`, the env var is not set correctly.

---

## How It Works

1. **Start a new work item** — run `/new-spec` and send your requirements to the spec agent
2. **Review the draft** — the spec agent produces a spec and task set immediately; refine as needed
3. **Execute tasks** — read the `Agent` field on each task, invoke the corresponding agent
4. **Verify and complete** — run `/complete-task` when a task is done
5. **Archive when finished** — run `/archive-spec` when all tasks are done

For the full workflow, see [`forge/config/workflow/WORKFLOW.md`](forge/config/workflow/WORKFLOW.md).

---

## Agents

| Agent | Model | Purpose |
|---|---|---|
| `spec` | claude-opus-4-5 | Converts requirements into specs and task sets |
| `task` | gpt-5.3-codex | Implements backend, engine, config, and architecture tasks |
| `ui-task` | claude-opus-4-5 | Implements React and UI tasks |

---

## Commands

| Command | Purpose |
|---|---|
| `/new-spec` | Start a new work item |
| `/complete-task` | Verify and mark a task done |
| `/archive-spec` | Archive a finished spec |
| `/status` | View all active work |

Run `/status` at the start of every session to orient yourself before beginning work.

---

## Architecture

Architecture reference documents live in [`forge/architecture/`](forge/architecture/). Start with [`INDEX.md`](forge/architecture/INDEX.md).

Project structure — where source files, UI code, and tests belong — is documented in [`project-structure.md`](forge/architecture/project-structure.md).

---

## About KeyRa

KeyRa is a visual mapping engine for healthcare data transformation. It enables analysts and engineers to build, preview, and deploy mappings between healthcare data schemas — including HL7 FHIR, CDM, and custom formats — through a browser-based interface backed by a pure TypeScript engine and AWS Lambda.