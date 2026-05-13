#!/usr/bin/env bun

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SKILL_DIR = join(import.meta.dir, "..");
const CONFIG_PATH = join(SKILL_DIR, "config.json");
const RESPONSES_DIR = join(SKILL_DIR, "responses");

const HELP = `Usage: bun run x-search.ts <query> [options]

Required:
  <query>           Natural-language search prompt for Grok.

Options:
  --from <ISO>      Start date (ISO8601, e.g. 2026-05-13). Default: 24h ago.
  --to <ISO>        End date (ISO8601). Default: today.
  --handles <csv>   Comma-separated allowed X handles (max 10).
  --exclude <csv>   Comma-separated excluded X handles (max 10).
  --model <id>      Grok model. Default: grok-4-1-fast-reasoning.
  --max-turns N     Cap on agentic tool-calling turns. Default: 10.
  --reasoning-effort <level>  Reasoning effort: low|medium|high. Default: high.
  --stdout          Print JSON to stdout instead of writing a file.

Auth:
  config.json       { "xai_api_key": "..." } — sibling of SKILL.md.

Output:
  Default: writes JSON to responses/YYYYMMDD-HHMMSS.json; prints the file path.
  With --stdout: prints the JSON directly; no file written.
`;

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
  console.error(HELP);
  process.exit(argv.length === 0 ? 1 : 0);
}

const query = argv[0];
if (!query || query.startsWith("--")) {
  console.error("error: <query> is required as the first positional argument");
  process.exit(1);
}

if (!existsSync(CONFIG_PATH)) {
  console.error(
    `error: ${CONFIG_PATH} not found. Copy config.json.example to config.json and set "xai_api_key".`,
  );
  process.exit(2);
}
let apiKey: string | undefined;
try {
  const cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  apiKey = cfg.xai_api_key;
} catch (e) {
  console.error(`error: failed to parse ${CONFIG_PATH}: ${e}`);
  process.exit(2);
}
if (!apiKey) {
  console.error(`error: "xai_api_key" missing or empty in ${CONFIG_PATH}`);
  process.exit(2);
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const now = new Date();
const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

const from = getFlag("--from") ?? isoDate(dayAgo);
const to = getFlag("--to") ?? isoDate(now);
const model = getFlag("--model") ?? "grok-4-1-fast-reasoning";
const maxTurnsRaw = getFlag("--max-turns");
const maxTurns = maxTurnsRaw ? Number.parseInt(maxTurnsRaw, 10) : 10;
if (maxTurnsRaw && Number.isNaN(maxTurns)) {
  console.error(`error: --max-turns must be a positive integer, got: ${maxTurnsRaw}`);
  process.exit(1);
}
const reasoningEffort = getFlag("--reasoning-effort") ?? "high";
if (!["low", "medium", "high"].includes(reasoningEffort)) {
  console.error(`error: --reasoning-effort must be low|medium|high, got: ${reasoningEffort}`);
  process.exit(1);
}
const useStdout = hasFlag("--stdout");

const parseCsv = (v: string | undefined) =>
  v?.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);

const allowed = parseCsv(getFlag("--handles"));
const excluded = parseCsv(getFlag("--exclude"));

const xSearch: Record<string, unknown> = {
  type: "x_search",
  from_date: from,
  to_date: to,
};
if (allowed?.length) xSearch.allowed_x_handles = allowed;
if (excluded?.length) xSearch.excluded_x_handles = excluded;

const body: Record<string, unknown> = {
  model,
  input: [{ role: "user", content: query }],
  tools: [xSearch],
};
body.max_turns = maxTurns;
body.reasoning = { effort: reasoningEffort };

const res = await fetch("https://api.x.ai/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`error: ${res.status} ${res.statusText}\n${text}`);
  process.exit(3);
}

const json = await res.json();
const out = JSON.stringify(json, null, 2);

if (useStdout) {
  console.log(out);
} else {
  await mkdir(RESPONSES_DIR, { recursive: true });
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
    .replace("T", "-");
  const filepath = join(RESPONSES_DIR, `${ts}.json`);
  await writeFile(filepath, out);
  console.log(filepath);
}
