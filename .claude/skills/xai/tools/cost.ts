#!/usr/bin/env bun

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SKILL_DIR = join(import.meta.dir, "..");
const RESPONSES_DIR = join(SKILL_DIR, "responses");

const HELP = `Usage: bun run cost.ts [<file>]

Args:
  <file>      Path to a response JSON. Omit to sum all files in responses/.

Output:
  Single file mode:  prints USD cost on stdout (4 decimals, no $).
  No-args mode:      prints one line per file (filename\\tcost), then TOTAL\\t<cost>\\t(<n> files).
`;

const tickToUsd = (ticks: number) => ticks / 1e10;
const fmt = (usd: number) => usd.toFixed(4);

async function costOf(filepath: string): Promise<number> {
  const data = JSON.parse(await readFile(filepath, "utf8"));
  const ticks = data?.usage?.cost_in_usd_ticks;
  if (typeof ticks !== "number") {
    throw new Error(`no usage.cost_in_usd_ticks in ${filepath}`);
  }
  return tickToUsd(ticks);
}

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) {
  console.error(HELP);
  process.exit(0);
}

if (argv.length === 1) {
  const filepath = argv[0];
  if (!existsSync(filepath)) {
    console.error(`error: file not found: ${filepath}`);
    process.exit(1);
  }
  const cost = await costOf(filepath);
  console.log(fmt(cost));
} else {
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
  let total = 0;
  for (const f of files) {
    const c = await costOf(join(RESPONSES_DIR, f));
    total += c;
    console.log(`${f}\t${fmt(c)}`);
  }
  console.log(`TOTAL\t${fmt(total)}\t(${files.length} files)`);
}
