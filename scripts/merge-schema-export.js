#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const targetPath = path.join(repoRoot, "vinted-form-schemas.generated.json");
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;

if (!inputPath) {
  console.error("Usage: node scripts/merge-schema-export.js <crawler-export.json>");
  process.exit(1);
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

const current = readJson(targetPath, {
  version: 1,
  generatedAt: null,
  source: "vinted-schema-discovery",
  schemas: {},
});

const input = readJson(inputPath);
const incomingSchemas =
  input?.exportedSchemas?.schemas ||
  input?.schemas ||
  input?.vinted_form_schema_cache_v1?.schemas ||
  {};

if (!incomingSchemas || typeof incomingSchemas !== "object" || Object.keys(incomingSchemas).length === 0) {
  console.error("Aucun schéma trouvé dans l'export fourni.");
  process.exit(1);
}

const numericSchemas = Object.fromEntries(
  Object.entries(incomingSchemas).filter(([catalogId, schema]) => {
    const schemaCatalogId = String(schema?.catalogId || catalogId || "").trim();
    return /^\d+$/.test(schemaCatalogId);
  })
);

if (Object.keys(numericSchemas).length === 0) {
  console.error("Aucun schéma avec catalogId numérique trouvé dans l'export fourni.");
  process.exit(1);
}

const merged = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: "vinted-schema-crawler",
  schemas: {
    ...(current.schemas || {}),
    ...numericSchemas,
  },
};

fs.writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`);

console.log(
  `Merged ${Object.keys(numericSchemas).length} schema(s). Skipped ${Object.keys(incomingSchemas).length - Object.keys(numericSchemas).length} non-numeric schema(s). Total: ${Object.keys(merged.schemas).length}.`
);
