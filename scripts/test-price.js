#!/usr/bin/env node
"use strict";

function normalizePrice(text) {
  if (text && typeof text === "object") {
    const amount = text.amount ?? text.value ?? text.price ?? text.numeric ?? "";
    return normalizePrice(String(amount));
  }
  const match = String(text || "").match(/(\d+(?:[.,]\d{1,2})?)/);
  return match ? match[1].replace(",", ".") : "";
}

function pricesEqual(a, b) {
  const na = Number.parseFloat(normalizePrice(a));
  const nb = Number.parseFloat(normalizePrice(b));
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 0.001;
}

function formatPriceForVintedInput(price) {
  const normalized = normalizePrice(price);
  if (!normalized) return "";
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num) || num <= 0) return "";
  if (Math.abs(num - Math.round(num)) < 0.001) return String(Math.round(num));
  return num.toFixed(2).replace(".", ",");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg + " got=" + cond);
}

assert(normalizePrice("25,00 €") === "25.00", "seller price normalize");
assert(pricesEqual("25,00 €", "25"), "25 equals 25,00");
assert(pricesEqual("25", "25.00"), "25 equals 25.00");
assert(!pricesEqual("25", ""), "empty not equal");
assert(normalizePrice({ amount: "25.00", currency_code: "EUR" }) === "25.00", "api object");
assert(formatPriceForVintedInput("25") === "25", "int format");
assert(formatPriceForVintedInput("25.5") === "25,50", "fr comma");
assert(formatPriceForVintedInput("25.00") === "25", "strip trailing zeros");

console.log("test-price: OK");
