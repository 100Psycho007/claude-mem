# Kiro IDE Setup Guide

This guide covers installing and using claude-mem with [Kiro IDE](https://kiro.dev).

## Prerequisites

- [Kiro IDE](https://kiro.dev) installed
- [Node.js](https://nodejs.org) 18+
- [Bun](https://bun.sh) (auto-detected from `~/.bun/bin/bun`)

## Install

```bash
npx claude-mem install --ide kiro
```

This command:
1. Copies the plugin files to `~/.claude/plugins/marketplaces/thedotmack/`
2. Writes 3 hook files into `.kiro/hooks/` in your current workspace
3. Writes a global steering file to `~/.kiro/steering/claude-mem.md`
4. Starts the worker service

## Start the Worker

The worker must be running for memory capture to work:

```bash
npx claude-mem start
```

Check status anytime:

```bash
npx claude-mem status
```

View captured memories in the browser:

```
http://localhost:37777
```

## How It Works

Three hooks are installed into `.kiro/hooks/`:

| Hook file | Kiro event | What it does |
|---|---|---|
| `claude-mem-context.kiro.hook` | `promptSubmit` | Injects past session memory at the start of every conversation |
| `claude-mem-observation.kiro.hook` | `postToolUse` | Captures every tool call as an observation |
| `claude-mem-summarize.kiro.hook` | `agentStop` | Compresses the session into persistent memory when the agent finishes |

A global steering file at `~/.kiro/steering/claude-mem.md` (with `inclusion: auto`) tells Kiro about the memory system across all projects.

## Per-Project Setup

The hook files are workspace-level — run the install command once per project:

```bash
cd your-project
npx claude-mem install --ide kiro
```

The global steering file and worker are shared across all projects.

## Search Past Work

```bash
npx claude-mem search "authentication bug"
npx claude-mem search "what did we decide about the database schema"
```

## Privacy

Wrap sensitive content in `<private>` tags to exclude it from memory capture:

```
<private>
API key: sk-...
</private>
```

## Uninstall

```bash
npx claude-mem uninstall
```

This removes the hook files, steering file, and plugin registration. Your memory data at `~/.claude-mem/` is preserved — delete it manually if needed:

```bash
rm -rf ~/.claude-mem
```

## Troubleshooting

**Hooks not firing**
- Check worker is running: `npx claude-mem status`
- Start it if needed: `npx claude-mem start`
- Restart Kiro after install to load the hooks

**Memory not appearing in new sessions**
- The `promptSubmit` hook injects past context automatically — check the hook is enabled in Kiro's hook panel
- Run `npx claude-mem search "recent"` to verify observations are being captured

**Worker not starting**
- Ensure Bun is installed: `bun --version`
- Install Bun if missing: https://bun.sh
