#!/usr/bin/env bun

import { readdir, readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SKILL_DIR = join(import.meta.dir, "..");
const RESPONSES_DIR = join(SKILL_DIR, "responses");

const HELP = `Usage: bun run usage.ts [<file>] [--append <target>]

Args:
  <file>            Path to a response JSON. Omit to sum all files in responses/.
  --append <target> Append a usage footer to <target> instead of printing TSV.
                    Footer format:
                      \\n\\n---\\n\\n*xAI API usage: $<cost> · tool calls: <n>*\\n
                    Requires <file>.

Output:
  Single-file mode:  prints TSV "<cost>\\t<tool_calls>" (cost is 4 decimals, no $).
                     With --append, also appends the footer to <target>.
  No-args mode:      prints one line per file "<filename>\\t<cost>\\t<tool_calls>",
                     then TOTAL row "TOTAL\\t<cost>\\t<tool_calls>\\t(<n> files)".
`;

type Usage = { cost: number; toolCalls: number };

const tickToUsd = (ticks: number) => ticks / 1e10;
const fmt = (usd: number) => usd.toFixed(4);
const footerOf = ({ cost, toolCalls }: Usage) =>
  `\n\n---\n\n*xAI API usage: $${fmt(cost)} · tool calls: ${toolCalls}*\n`;

async function usageOf(filepath: string): Promise<Usage> {
  const data = JSON.parse(await readFile(filepath, "utf8"));
  const ticks = data?.usage?.cost_in_usd_ticks;
  if (typeof ticks !== "number") {
    throw new Error(`no usage.cost_in_usd_ticks in ${filepath}`);
  }
  const toolCalls = data?.usage?.num_server_side_tools_used ?? 0;
  return { cost: tickToUsd(ticks), toolCalls };
}

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) {
  console.error(HELP);
  process.exit(0);
}

let appendTarget: string | null = null;
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--append") {
    if (!argv[i + 1]) {
      console.error("error: --append requires a target file path");
      process.exit(1);
    }
    appendTarget = argv[i + 1];
    i++;
  } else {
    positional.push(argv[i]);
  }
}

if (positional.length === 1) {
  const filepath = positional[0];
  if (!existsSync(filepath)) {
    console.error(`error: file not found: ${filepath}`);
    process.exit(1);
  }
  const u = await usageOf(filepath);
  if (appendTarget) {
    if (!existsSync(appendTarget)) {
      console.error(`error: append target not found: ${appendTarget}`);
      process.exit(1);
    }
    await appendFile(appendTarget, footerOf(u));
  }
  console.log(`${fmt(u.cost)}\t${u.toolCalls}`);
} else if (positional.length === 0) {
  if (appendTarget) {
    console.error("error: --append requires a single response file");
    process.exit(1);
  }
  if (!existsSync(RESPONSES_DIR)) {
    console.error(`error: ${RESPONSES_DIR} does not exist`);
    process.exit(1);
  }
  const files = (await readdir(RESPONSES_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    console.error("no response files yet");
    process.exit(0);
  }
  let totalCost = 0;
  let totalCalls = 0;
  for (const f of files) {
    const u = await usageOf(join(RESPONSES_DIR, f));
    totalCost += u.cost;
    totalCalls += u.toolCalls;
    console.log(`${f}\t${fmt(u.cost)}\t${u.toolCalls}`);
  }
  console.log(`TOTAL\t${fmt(totalCost)}\t${totalCalls}\t(${files.length} files)`);
} else {
  console.error(HELP);
  process.exit(1);
}
