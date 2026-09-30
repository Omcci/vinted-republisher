#!/usr/bin/env node
"use strict";

/**
 * Structural checks for full safe backup payloads (infos + photo binaries).
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function backupHasRecoverablePhotos(backup) {
  const prepared = backup?.photos?.prepared?.filter((p) => p?.dataUrl) || [];
  const originals = backup?.photos?.originals?.filter((p) => p?.dataUrl) || [];
  return prepared.length > 0 || originals.length > 0;
}

function canStartDestructive({ allowDestructive, userConfirmed, backup }) {
  return (
    allowDestructive === true &&
    userConfirmed === true &&
    backupHasRecoverablePhotos(backup)
  );
}

const tinyJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";

const goodBackup = {
  version: 2,
  backupId: "1_1",
  item: { itemId: "1", title: "ATM", price: "25.00" },
  photos: {
    originalCount: 1,
    preparedCount: 1,
    originals: [{ index: 0, dataUrl: tinyJpeg, name: "o.jpg", type: "image/jpeg" }],
    prepared: [{ index: 0, dataUrl: tinyJpeg, name: "p.jpg", type: "image/jpeg" }],
  },
  safety: { photosRecoverable: true },
};

const metaOnlyBackup = {
  version: 1,
  item: { itemId: "1" },
  preparedFiles: [{ name: "p.jpg", type: "image/jpeg", size: 12 }],
  photos: { originals: [], prepared: [] },
};

assert(backupHasRecoverablePhotos(goodBackup), "v2 backup with dataUrls is recoverable");
assert(!backupHasRecoverablePhotos(metaOnlyBackup), "metadata-only backup is NOT recoverable");
assert(
  canStartDestructive({ allowDestructive: true, userConfirmed: true, backup: goodBackup }),
  "destructive allowed when photos present"
);
assert(
  !canStartDestructive({ allowDestructive: true, userConfirmed: true, backup: metaOnlyBackup }),
  "destructive blocked without photo binaries"
);
assert(
  !canStartDestructive({ allowDestructive: true, userConfirmed: false, backup: goodBackup }),
  "destructive blocked without user confirm"
);

console.log("backup-safety tests passed");
