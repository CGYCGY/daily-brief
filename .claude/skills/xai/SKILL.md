---
name: xai
description: Calls xAI's Live Search API to retrieve X (Twitter) posts within a date window via Grok's agentic x_search tool. Use when an agent or user asks to "search X", "find X posts", "scan X for", "what's trending on X about", or needs raw X data for a daily/weekly brief.
argument-hint: <query> [--from <ISO>] [--to <ISO>] [--handles a,b] [--exclude a,b] [--model <id>] [--max-turns N] [--reasoning-effort low|medium|high] [--stdout]
allowed-tools: Bash, Read
user-invocable: true
---

# xAI Live Search

## Purpose

Wraps `POST https://api.x.ai/v1/responses` with the `x_search` tool. Writes the full JSON response to a file by default and prints just the path, so callers (e.g. the `brief` agent) can read slices on demand without loading the whole response into context.

## Variables

### Auth
- `config.json` at the skill root — `{ "xai_api_key": "..." }`

## Instructions

- Default mode writes raw JSON to `responses/<timestamp>.json` and prints the path. Pass that path to downstream consumers; let them `jq`/`Read` only the slices they need.
- Use `--stdout` only for ad-hoc inspection or when the caller intentionally wants the full JSON in its current context.
- When the caller does not specify a date window, omit `--from` / `--to`; the wrapper defaults to the trailing 24h.
- `allowed_x_handles` and `excluded_x_handles` are capped at 10 entries by xAI; the wrapper silently truncates extras.
- On non-zero exit from the wrapper, surface stderr verbatim and do not retry. Auth failures and rate limits are caller-actionable.

## Tools

### x-search
- **Run:** `bun run ${CLAUDE_SKILL_DIR}/tools/x-search.ts "$QUERY" [--from "$FROM"] [--to "$TO"] [--handles "$HANDLES"] [--exclude "$EXCLUDE"] [--model "$MODEL"] [--max-turns $N] [--reasoning-effort $LEVEL] [--stdout]`
- **Args:** `query (str, required)`, `--from (ISO8601 date, optional, default 24h ago)`, `--to (ISO8601 date, optional, default today)`, `--handles (csv of X handles, optional, max 10)`, `--exclude (csv of X handles, optional, max 10)`, `--model (str, optional, default grok-4-1-fast-reasoning)`, `--max-turns (int, optional, default 10)`, `--reasoning-effort (str, optional, low|medium|high, default high)`, `--stdout (flag, optional)`
- **Does:** POSTs to `https://api.x.ai/v1/responses` with the `x_search` tool. Default: writes JSON to `responses/<timestamp>.json` and prints the path. With `--stdout`: prints JSON directly, no file written.
- **Triggers:** "search X", "find X posts", "scan X for", "what's trending on X about", "get X data for the last 24h"

### usage
- **Run:** `bun run ${CLAUDE_SKILL_DIR}/tools/usage.ts [<file>] [--append <target>]`
- **Args:** `file (path, optional)` — path to a response JSON. Omit to sum all files in `responses/`. `--append <target>` — append the usage footer to `<target>` instead of printing TSV (requires `<file>`).
- **Does:** Reads xAI cost (USD, 4 decimals, no `$`) and tool-call count from `usage.num_server_side_tools_used`. Modes: (a) single-file → prints TSV `<cost>\t<tool_calls>`; (b) single-file `--append <target>` → same TSV on stdout AND appends `\n\n---\n\n*xAI API usage: $<cost> · tool calls: <n>*\n` to `<target>`; (c) no-args → per-file table `<filename>\t<cost>\t<tool_calls>` plus TOTAL row with sums.
- **Triggers:** "how much did that cost", "how many tool calls", "x_search count", "total xai spend", "cost of this run", "lifetime xai cost"

## Report

- On success (default mode): print the file path of the written JSON
- On success (`--stdout`): pass the JSON through
- On failure: print exit code and stderr; do not retry
