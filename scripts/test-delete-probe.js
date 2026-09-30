#!/usr/bin/env node
"use strict";

/**
 * Regression tests for delete verification.
 * Based on real SSR HTML signals from live item #9226526096 (2026-07-16):
 * - page embeds "n'est plus disponible" 6× in i18n bundles while STILL ONLINE
 * - reliable alive markers: item-price, item-buy-button, og:url with item id
 */

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyItemHtmlPresence(html, itemId, expectedTitle = "") {
  const id = String(itemId || "").trim();
  const text = String(html || "");
  const titleTag = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const ogTitle = (text.match(/property="og:title"\s+content="([^"]*)"/i)?.[1] || "").trim();
  const ogUrl = (text.match(/property="og:url"\s+content="([^"]*)"/i)?.[1] || "").trim();
  const hasPrice = text.includes('data-testid="item-price"') || text.includes("data-testid='item-price'");
  const hasBuy =
    text.includes('data-testid="item-buy-button"') ||
    text.includes("data-testid='item-buy-button'") ||
    /data-testid=["'][^"']*item-buy[^"']*["']/i.test(text);
  const hasItemTitleTestId =
    text.includes('data-testid="item-title"') || text.includes("data-testid='item-title'");
  const ogMentionsId = id && ogUrl.includes(`/items/${id}`);
  const wanted = normalizeComparableText(expectedTitle).slice(0, 24);
  const titleLooksLikeListing =
    Boolean(wanted) &&
    (normalizeComparableText(ogTitle).includes(wanted) ||
      normalizeComparableText(titleTag).includes(wanted));

  if (hasPrice || hasBuy || hasItemTitleTestId) {
    return {
      exists: true,
      reason: hasBuy
        ? "item-buy-button présent"
        : hasPrice
          ? "item-price présent"
          : "item-title présent",
    };
  }
  if (ogMentionsId && (ogTitle || titleTag) && !/page introuvable|not found|error/i.test(ogTitle || titleTag)) {
    return { exists: true, reason: "og:url pointe encore vers l’item" };
  }
  if (titleLooksLikeListing) {
    return { exists: true, reason: "titre og/title de l’annonce encore présent" };
  }

  const mainUnavailable =
    /data-testid=["'][^"']*(empty-state|not-found|item-not-found|error-state)[^"']*["']/i.test(text) ||
    /<(h1|h2)[^>]*>\s*[^<]*(introuvable|n['’]est plus disponible|item not found|no longer available)/i.test(
      text
    ) ||
    /<(title)[^>]*>\s*[^<]*(page introuvable|not found|n['’]est plus disponible)/i.test(text);

  if (mainUnavailable && !hasPrice && !hasBuy && !ogMentionsId) {
    return { exists: false, reason: "empty/not-found structuré sans marqueurs listing" };
  }

  return {
    exists: null,
    reason: "HTML ambigu (pas de marqueur listing ni empty-state clair)",
  };
}

function softLegacyWouldSayDeleted(html) {
  const norm = normalizeComparableText(html);
  return (
    norm.includes("n'est plus disponible") ||
    norm.includes("n’est plus disponible") ||
    norm.includes("article introuvable") ||
    norm.includes("this item is unavailable") ||
    norm.includes("item not found")
  );
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const liveLikeHtml = `
<html><head>
<title>T-Shirt ATM Slub Jersey à manches courtes T.S | Vinted</title>
<meta property="og:title" content="T-Shirt ATM Slub Jersey à manches courtes T.S | Vinted"/>
<meta property="og:url" content="https://www.vinted.fr/items/9226526096-t-shirt-atm-slub-jersey-a-manches-courtes-ts"/>
</head><body>
<script>window.I18N={"conversation.moderated_items.expired":"L'annonce n'est plus disponible","msg":"Cet article n'est plus disponible"}</script>
<div data-testid="item-price"><p>25,00 €</p></div>
<button data-testid="item-buy-button">Acheter</button>
</body></html>
`;

const deletedLikeHtml = `
<html><head>
<title>Page introuvable | Vinted</title>
<meta property="og:title" content="Page introuvable | Vinted"/>
<meta property="og:url" content="https://www.vinted.fr/"/>
</head><body>
<h1>Cette page n'est plus disponible</h1>
<div data-testid="empty-state">Introuvable</div>
</body></html>
`;

const i18nOnlyHtml = `
<html><head><title>Vinted</title></head><body>
<script>"L'annonce n'est plus disponible"</script>
<p>Accueil</p>
</body></html>
`;

// Legacy soft matcher FALSE POSITIVE on live page
assert(softLegacyWouldSayDeleted(liveLikeHtml), "fixture must contain soft phrase");
const live = classifyItemHtmlPresence(
  liveLikeHtml,
  "9226526096",
  "T-Shirt ATM Slub Jersey à manches courtes T.S"
);
assert(live.exists === true, `live must be alive, got ${JSON.stringify(live)}`);

// Deleted structured page
const dead = classifyItemHtmlPresence(deletedLikeHtml, "9226526096", "T-Shirt ATM");
assert(dead.exists === false, `deleted page must be dead, got ${JSON.stringify(dead)}`);

// i18n alone must NOT prove deletion
const i18nOnly = classifyItemHtmlPresence(i18nOnlyHtml, "9226526096", "T-Shirt ATM");
assert(i18nOnly.exists !== false, `i18n-only must not be deleted, got ${JSON.stringify(i18nOnly)}`);

console.log("test-delete-probe: OK");
