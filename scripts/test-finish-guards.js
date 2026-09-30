#!/usr/bin/env node
"use strict";

/**
 * Lightweight guards for the destructive republish finish flow.
 * Mirrors the decision rules in content.js (no DOM / chrome).
 */

function canProceedToSave({ failedCount, validationOk }) {
  return failedCount === 0 && validationOk === true;
}

function canShowDestructiveConfirm({ allowDestructive, savedOk, validationOk, failedCount }) {
  return (
    allowDestructive === true &&
    savedOk === true &&
    canProceedToSave({ failedCount, validationOk })
  );
}

function canDeleteOriginal({ allowDestructive, userConfirmed, savedOk, validationOk, failedCount }) {
  return (
    allowDestructive === true &&
    userConfirmed === true &&
    savedOk === true &&
    canProceedToSave({ failedCount, validationOk })
  );
}

function canPublishAfterDelete({ deleteOk, allowDestructive, userConfirmed }) {
  return deleteOk === true && allowDestructive === true && userConfirmed === true;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// Safe by default
assert(
  !canShowDestructiveConfirm({
    allowDestructive: false,
    savedOk: true,
    validationOk: true,
    failedCount: 0,
  }),
  "toggle OFF must hide confirm"
);

// Failed fill blocks everything
assert(
  !canProceedToSave({ failedCount: 1, validationOk: true }),
  "failed fields block save"
);
assert(
  !canDeleteOriginal({
    allowDestructive: true,
    userConfirmed: true,
    savedOk: true,
    validationOk: true,
    failedCount: 1,
  }),
  "failed fields block delete"
);

// Validation mismatch blocks
assert(
  !canProceedToSave({ failedCount: 0, validationOk: false }),
  "validation fail blocks save"
);

// Happy path
assert(
  canShowDestructiveConfirm({
    allowDestructive: true,
    savedOk: true,
    validationOk: true,
    failedCount: 0,
  }),
  "toggle ON + valid + saved shows confirm"
);
assert(
  canDeleteOriginal({
    allowDestructive: true,
    userConfirmed: true,
    savedOk: true,
    validationOk: true,
    failedCount: 0,
  }),
  "user confirm unlocks delete"
);
assert(
  !canDeleteOriginal({
    allowDestructive: true,
    userConfirmed: false,
    savedOk: true,
    validationOk: true,
    failedCount: 0,
  }),
  "no delete without user click"
);

// Publish only after delete OK
assert(
  !canPublishAfterDelete({ deleteOk: false, allowDestructive: true, userConfirmed: true }),
  "no publish if delete failed"
);
assert(
  canPublishAfterDelete({ deleteOk: true, allowDestructive: true, userConfirmed: true }),
  "publish after delete OK"
);

console.log("finish-guard tests passed");
