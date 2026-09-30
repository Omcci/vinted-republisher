#!/usr/bin/env node
"use strict";

const assert = require("assert");

function normalizeComparableText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isCommittedMatch(actual, expected) {
  const a = normalizeComparableText(actual);
  const e = normalizeComparableText(expected);
  if (!a || !e) return false;
  if (a === e) return true;
  if (a.startsWith(`${e} `) && a.length <= e.length + 24) return true;
  return false;
}

function valueLooksMatching(expected, actual) {
  if (!expected) return true;
  if (!actual) return false;
  if (isCommittedMatch(actual, expected)) return true;
  const e = normalizeComparableText(expected);
  const a = normalizeComparableText(actual);
  if (!e || !a) return false;
  if (a === e) return true;
  if (a.includes(e) || e.includes(a)) return true;
  return false;
}

assert.strictEqual(valueLooksMatching("ATM", "atm"), true);
assert.strictEqual(valueLooksMatching("S / 36 / 8", "s / 36 / 8"), true);
assert.strictEqual(valueLooksMatching("25.00", "25"), true);
assert.strictEqual(valueLooksMatching("ATM", ""), false);
assert.strictEqual(valueLooksMatching("", "anything"), true);
assert.strictEqual(valueLooksMatching("Très bon état", "tres bon etat"), true);

function normalizeCategoryForForm(category, brand) {
  let out = String(category || "").trim();
  if (!out) return "";
  const b = String(brand || "").trim();
  if (b && out.toLowerCase().startsWith(`${b.toLowerCase()} `)) {
    out = out.slice(b.length).trim();
  }
  out = out.replace(/^[A-Z]{2,5}\s+/, "");
  return out;
}

assert.strictEqual(normalizeCategoryForForm("ATM T-shirts", "ATM"), "T-shirts");
assert.strictEqual(normalizeCategoryForForm("T-shirts", "ATM"), "T-shirts");
assert.strictEqual(valueLooksMatching("T-shirts", "t-shirts"), true);

console.log("verify-match helpers passed");
