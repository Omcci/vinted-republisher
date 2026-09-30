#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const steps = [
  ["node", ["--check", "content.js"]],
  ["node", ["--check", "vinted-field-matrix.js"]],
  ["node", ["--check", "vinted-form-engine.js"]],
  ["node", ["--check", "vinted-schema-store.js"]],
  ["node", ["--check", "vinted-schema-discovery.js"]],
  ["node", ["--check", "vinted-schema-crawler.js"]],
  ["node", ["--check", "scripts/merge-schema-export.js"]],
  ["node", ["--check", "scripts/merge-schema-export-from-clipboard.js"]],
  ["node", ["--check", "test-selectors.js"]],
  ["node", ["test-selectors.js"]],
  ["node", ["scripts/test-id-extraction.js"]],
  ["node", ["scripts/test-verify-match.js"]],
  ["node", ["scripts/test-finish-guards.js"]],
  ["node", ["scripts/test-backup-safety.js"]],
];

for (const [cmd, args] of steps) {
  const label = [cmd, ...args].join(" ");
  console.log(`\n> ${label}`);
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`\nSelf-test failed at: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\nSelf-test passed.");
