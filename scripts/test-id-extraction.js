#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
const contentSrc = fs.readFileSync(path.join(repoRoot, "content.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Function ${name} not found`);
  let i = start;
  let depth = 0;
  let started = false;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) {
        i += 1;
        break;
      }
    }
  }
  return source.slice(start, i);
}

const needed = ["parseIdFromHref", "extractAttributesFromDetailsLinks"]
  .map((name) => extractFunction(contentSrc, name))
  .join("\n\n");

const links = [
  { href: "/catalog?brand_ids[]=4242&search_text=ATM", text: "ATM" },
  { href: "/catalog?size_ids[]=208&search_text=S", text: "S / 36 / 8" },
  { href: "/catalog?status_id=2", text: "Très bon état" },
  { href: "/catalog?material_ids[]=11", text: "Coton" },
  { href: "/catalog?color_ids[]=1", text: "Blanc" },
].map((l) => ({
  href: l.href,
  textContent: l.text,
  getAttribute: (name) => (name === "href" ? l.href : null),
}));

const root = {
  querySelector(sel) {
    if (sel.includes("details-list--details") || sel === ".details-list") return root;
    if (sel.includes("brand_id")) return links.find((l) => l.href.includes("brand_id")) || null;
    if (sel.includes("size_id")) return links.find((l) => l.href.includes("size_id")) || null;
    if (sel.includes("status_id")) return links.find((l) => l.href.includes("status_id")) || null;
    if (sel.includes("material_id")) return links.find((l) => l.href.includes("material_id")) || null;
    return null;
  },
  querySelectorAll(sel) {
    if (sel.includes("color_id")) return links.filter((l) => l.href.includes("color_id"));
    if (sel.includes("details-list__item") || sel.includes("Cell") || sel.includes("breadcrumb")) return [];
    return [];
  },
};

const doc = {
  querySelector(sel) {
    if (sel.includes("details-list")) return root;
    if (sel.includes("breadcrumb") || sel.includes("nav[")) return null;
    return root.querySelector(sel);
  },
  querySelectorAll(sel) {
    if (sel.includes("breadcrumb") || sel.includes("nav[")) return [];
    return root.querySelectorAll(sel);
  },
};

const sandbox = { URL, console, document: doc };
vm.createContext(sandbox);
vm.runInContext(needed, sandbox);

const attrs = sandbox.extractAttributesFromDetailsLinks(doc);
assert.strictEqual(attrs.brand, "ATM");
assert.strictEqual(attrs.brandId, 4242);
assert.strictEqual(attrs.size, "S / 36 / 8");
assert.strictEqual(attrs.sizeId, 208);
assert.strictEqual(attrs.statusId, 2);
assert.strictEqual(attrs.materialId, 11);
assert.strictEqual(attrs.colorIds.length, 1);
assert.strictEqual(Number(attrs.colorIds[0]), 1);
assert.ok(attrs.colors.includes("Blanc"));

console.log("ID extraction tests passed:", {
  brandId: attrs.brandId,
  sizeId: attrs.sizeId,
  statusId: attrs.statusId,
  materialId: attrs.materialId,
  colorIds: attrs.colorIds,
});
