#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpPath = path.join(os.tmpdir(), `vinted-schema-export-${Date.now()}.json`);

function extractJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    JSON.parse(text);
    return text;
  } catch (_) {
    // Continue with extraction below.
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  const candidate = text.slice(start, end + 1);
  JSON.parse(candidate);
  return candidate;
}

try {
  const clipboard = execFileSync("pbpaste", { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (!clipboard.trim()) {
    console.error("Le presse-papiers est vide.");
    process.exit(1);
  }
  const json = extractJsonObject(clipboard);
  if (!json) {
    console.error("Aucun objet JSON valide trouvé dans le presse-papiers.");
    process.exit(1);
  }
  fs.writeFileSync(tmpPath, json);
  process.argv[2] = tmpPath;
  require("./merge-schema-export");
} catch (error) {
  console.error(`Import depuis le presse-papiers impossible: ${error.message}`);
  process.exit(1);
}
