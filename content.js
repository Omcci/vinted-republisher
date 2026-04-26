// content.js - Combined Scraper & Automator + page-bridge for automation engine

const OVERLAY_ID = "vinted-republisher-live-overlay";
const OVERLAY_LOGS_ID = "vinted-republisher-live-logs";
const OVERLAY_STATUS_ID = "vinted-republisher-live-status";
const OVERLAY_COPY_LOGS_ID = "vinted-republisher-copy-logs";
const OVERLAY_COPY_BACKUP_ID = "vinted-republisher-copy-backup";

window.__VINTED_REPUBLISHER_LOGS__ = window.__VINTED_REPUBLISHER_LOGS__ || [];
window.__VINTED_REPUBLISHER_LAST_BACKUP__ = window.__VINTED_REPUBLISHER_LAST_BACKUP__ || null;

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
      <div style="font-weight:700;font-size:14px;">Vinted Republisher - Suivi en direct</div>
      <div style="display:flex;gap:6px;">
        <button id="${OVERLAY_COPY_LOGS_ID}" style="font-size:11px;border:1px solid rgba(148,163,184,.5);background:#1e293b;color:#fff;border-radius:6px;padding:4px 7px;cursor:pointer;">Copier logs</button>
        <button id="${OVERLAY_COPY_BACKUP_ID}" style="font-size:11px;border:1px solid rgba(148,163,184,.5);background:#1e293b;color:#fff;border-radius:6px;padding:4px 7px;cursor:pointer;">Copier backup</button>
      </div>
    </div>
    <div id="${OVERLAY_STATUS_ID}" style="font-size:12px;color:#a5f3fc;margin-bottom:8px;">Initialisation...</div>
    <div id="${OVERLAY_LOGS_ID}" style="max-height:220px;overflow:auto;font-size:12px;line-height:1.4;background:rgba(0,0,0,.18);padding:8px;border-radius:8px;"></div>
    <div style="margin-top:8px;font-size:11px;opacity:.75;">Le panneau se ferme automatiquement en fin de traitement.</div>
  `;

  Object.assign(overlay.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(520px, 92vw)",
    maxHeight: "70vh",
    zIndex: "2147483647",
    background: "rgba(15,23,42,.96)",
    color: "#fff",
    border: "1px solid rgba(148,163,184,.35)",
    boxShadow: "0 20px 60px rgba(0,0,0,.45)",
    borderRadius: "12px",
    padding: "12px",
    backdropFilter: "blur(4px)",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  });

  document.body.appendChild(overlay);
  document.getElementById(OVERLAY_COPY_LOGS_ID)?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(window.__VINTED_REPUBLISHER_LOGS__.join("\n"));
    appendOverlayLog("success", "Logs copiés dans le presse-papiers");
  });
  document.getElementById(OVERLAY_COPY_BACKUP_ID)?.addEventListener("click", async () => {
    const backup = window.__VINTED_REPUBLISHER_LAST_BACKUP__;
    if (!backup) {
      appendOverlayLog("warning", "Aucun backup disponible à copier");
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(backup, null, 2));
    appendOverlayLog("success", "Backup annonce copié dans le presse-papiers");
  });
  return overlay;
}

function setOverlayStatus(text) {
  ensureOverlay();
  const status = document.getElementById(OVERLAY_STATUS_ID);
  if (status) status.textContent = text;
}

function appendOverlayLog(level, message) {
  ensureOverlay();
  const logs = document.getElementById(OVERLAY_LOGS_ID);
  if (!logs) return;

  const logLine = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  window.__VINTED_REPUBLISHER_LOGS__.push(logLine);

  const line = document.createElement("div");
  const colorMap = {
    info: "#e2e8f0",
    success: "#86efac",
    warning: "#fcd34d",
    error: "#fca5a5",
  };
  line.style.color = colorMap[level] || colorMap.info;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logs.appendChild(line);
  logs.scrollTop = logs.scrollHeight;
}

function closeOverlayLater(delayMs = 8000) {
  setTimeout(() => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
  }, delayMs);
}

const PENDING_DOM_DRAFT_KEY = "vinted_pending_dom_draft";
const REPUBLISH_BACKUP_PREFIX = "vinted_republish_backup_";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForElement(selector, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const element = document.querySelector(selector);
    if (element) return element;
    await sleep(300);
  }
  return null;
}

function setNativeInputValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizePrice(text) {
  const match = String(text || "").match(/(\d+(?:[.,]\d{1,2})?)/);
  return match ? match[1].replace(",", ".") : "";
}

function extractDetailPairs(doc) {
  const details = {};
  const root = doc.querySelector(".details-list, [data-testid*='item-details'], [class*='details']");
  const items = root ? Array.from(root.querySelectorAll(".details-list__item, [class*='detail']")) : [];

  for (const item of items) {
    const raw = item.textContent?.trim().replace(/\s+/g, " ") || "";
    const labelEl = item.querySelector(".details-list__item-title, .web_ui__Text__subtitle, [class*='label']");
    const label = labelEl?.textContent?.trim();
    let value = "";

    if (label) {
      value = raw.replace(label, "").replace(/Menu relatif.*$/i, "").trim();
    }
    if (!label || !value) {
      const known = ["Marque", "État", "Etat", "Matière", "Matiere", "Couleur", "Taille", "Catégorie", "Categorie"];
      for (const key of known) {
        if (raw.toLowerCase().startsWith(key.toLowerCase())) {
          details[key.toLowerCase()] = raw.slice(key.length).replace(/Menu relatif.*$/i, "").trim();
        }
      }
      continue;
    }
    details[label.toLowerCase()] = value;
  }

  return details;
}

function extractDetailsFromPageText(doc) {
  const details = {};

  // Primary: extract from structured detail elements
  const candidates = [
    ...Array.from(doc.querySelectorAll(".details-list__item, [class*='detail-item'], [class*='attribute-item']")),
    ...Array.from(doc.querySelectorAll("dt, [role='term']")),
  ];

  const labelMap = {
    marque: ["marque", "brand"],
    état: ["état", "etat", "condition"],
    "matière": ["matière", "matiere", "material", "matériau"],
    couleur: ["couleur", "color", "colour"],
    taille: ["taille", "size"],
    "catégorie": ["catégorie", "categorie", "category"],
  };

  for (const item of candidates) {
    const raw = item.textContent?.replace(/\s+/g, " ").trim() || "";
    if (raw.length > 120 || raw.length < 2) continue;

    for (const [key, synonyms] of Object.entries(labelMap)) {
      if (details[key]) continue;
      for (const syn of synonyms) {
        const re = new RegExp(`^${syn}\\s+(.{1,60})$`, "i");
        const match = raw.match(re);
        if (match) {
          const value = match[1]
            .replace(/Certaines marques.*/i, "")
            .replace(/Menu relatif.*/i, "")
            .trim();
          if (value && !/^(sélectionne|select)/i.test(value)) {
            details[key] = value;
          }
          break;
        }
      }
    }
  }

  return details;
}

function getVintedPhotoKey(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    const match = parsed.pathname.match(/\/t\/([^/]+)\//);
    return match?.[1] || parsed.pathname;
  } catch (_) {
    const match = String(url).match(/\/t\/([^/]+)\//);
    return match?.[1] || String(url);
  }
}

function collectItemImageUrls(doc) {
  const candidates = [];
  const nodes = Array.from(
    doc.querySelectorAll(
      [
        'img[data-testid*="item-photo"]',
        '[data-testid*="item-photo"] img',
        '[data-testid*="photo-slider"] img',
        '[data-testid*="gallery"] img',
        ".item-photos img",
      ].join(",")
    )
  );

  for (const img of nodes) {
    const src = img.getAttribute("src") || img.src || "";
    if (src) candidates.push(src);
    const srcset = img.getAttribute("srcset") || "";
    for (const part of srcset.split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url) candidates.push(url);
    }
  }

  const byKey = new Map();
  for (const raw of candidates) {
    const absolute = raw.startsWith("//") ? `https:${raw}` : raw;
    const lower = absolute.toLowerCase();
    if (!lower.includes("vinted.net/t/")) continue;
    if (lower.includes("avatar") || lower.includes("profile") || lower.includes("user") || lower.includes("icon")) continue;

    const normalized = absolute.replace(/\/\d+x\d+\//, "/f800/").replace("/thumb/", "/f800/");
    const key = getVintedPhotoKey(normalized);
    const current = byKey.get(key);
    if (!current || normalized.includes("/original/") || normalized.includes("/f800/")) {
      byKey.set(key, normalized);
    }
  }

  return Array.from(byKey.values()).slice(0, 20);
}

function extractAttributesFromDetailsLinks(doc) {
  const detailsRoot =
    doc.querySelector(".details-list.details-list--details") ||
    doc.querySelector(".details-list") ||
    doc;

  const normalizeLabel = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const pickText = (selector) =>
    detailsRoot.querySelector(selector)?.textContent?.trim()?.replace(/Menu relatif.*$/i, "") || "";

  const brand = pickText('a[href*="brand_id"], a[href*="brand_ids"]');
  const condition = pickText('a[href*="status_id"]');
  const material = pickText('a[href*="material_id"], a[href*="material_ids"]');

  const colorLinks = Array.from(detailsRoot.querySelectorAll('a[href*="color_id"], a[href*="color_ids"]'));
  const colors = colorLinks
    .map((el) => (el.textContent || "").trim())
    .filter(Boolean);

  // Fallback: parse detail rows directly when link-based extraction is missing.
  const rowItems = Array.from(
    detailsRoot.querySelectorAll(
      ".details-list__item, [class*='details-list__item'], [data-testid*='item-details'] [class*='Cell']"
    )
  );
  const rowMap = {};
  for (const item of rowItems) {
    const rawText = (item.textContent || "").replace(/\s+/g, " ").trim();
    if (!rawText || rawText.length < 2) continue;

    const labelEl =
      item.querySelector(".details-list__item-title, .web_ui__Text__subtitle, dt, [role='term']") || null;
    let label = labelEl ? normalizeLabel(labelEl.textContent) : "";
    let value = "";

    const valueEl =
      item.querySelector(
        ".details-list__item-value a, .details-list__item-value .web_ui__Text__bold, dd, [role='definition']"
      ) || null;
    if (valueEl) {
      value = (valueEl.textContent || "").replace(/Menu relatif.*$/i, "").trim();
    }

    if (!label || !value) {
      const known = [
        "marque",
        "etat",
        "état",
        "couleur",
        "matiere",
        "matière",
        "materiau",
        "matériau",
        "categorie",
        "catégorie",
      ];
      for (const k of known) {
        const re = new RegExp(`^${k}\\s+(.+)$`, "i");
        const m = rawText.match(re);
        if (m) {
          label = normalizeLabel(k);
          value = (m[1] || "").replace(/Menu relatif.*$/i, "").trim();
          break;
        }
      }
    }

    if (!label || !value) continue;
    rowMap[label] = value;
  }

  const rowBrand = rowMap["marque"] || "";
  const rowCondition = rowMap["etat"] || "";
  const rowMaterial = rowMap["matiere"] || rowMap["materiau"] || "";
  const rowCategory = rowMap["categorie"] || "";
  const rowColors = (rowMap["couleur"] || "")
    .split(/[,/]| et /i)
    .map((x) => x.trim())
    .filter(Boolean);

  let category = "";
  const breadcrumbLinks = Array.from(
    doc.querySelectorAll(
      '[data-testid="item-breadcrumbs"] a, nav[aria-label="breadcrumb"] a, .breadcrumbs a, [data-testid="breadcrumbs"] a'
    )
  );
  if (breadcrumbLinks.length) {
    const nonHome = breadcrumbLinks.filter((a) => ((a.textContent || "").trim().toLowerCase() !== "accueil"));
    category = (nonHome[nonHome.length - 1] || breadcrumbLinks[breadcrumbLinks.length - 1])?.textContent?.trim() || "";
  }

  return {
    brand: brand || rowBrand,
    condition: condition || rowCondition,
    material: material || rowMaterial,
    colors: Array.from(new Set([...(colors || []), ...rowColors])),
    category: category || rowCategory,
  };
}

function extractFromJsonLd(doc) {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const isProduct =
          String(node["@type"] || "").toLowerCase() === "product" ||
          node?.offers ||
          node?.image ||
          node?.brand;
        if (!isProduct) continue;
        const brand =
          (typeof node.brand === "string" ? node.brand : node.brand?.name) || "";
        const condition = String(node.itemCondition || "").replace(/^https?:\/\/schema\.org\//i, "");
        const images = Array.isArray(node.image) ? node.image : node.image ? [node.image] : [];
        return {
          title: node.name || "",
          description: node.description || "",
          brand,
          condition,
          imageUrls: images.filter(Boolean),
          category: node.category || "",
        };
      }
    } catch (_) {
      // ignore invalid json-ld script
    }
  }
  return null;
}

function extractFromNextData(doc) {
  const script = doc.querySelector('script#__NEXT_DATA__');
  const raw = script?.textContent?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const valuesByKey = new Map();
    const walk = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === "string" && value.trim()) {
          const k = key.toLowerCase();
          if (!valuesByKey.has(k)) valuesByKey.set(k, []);
          valuesByKey.get(k).push(value.trim());
        } else if (Array.isArray(value) || (value && typeof value === "object")) {
          walk(value);
        }
      }
    };
    walk(parsed);

    const first = (...keys) => {
      for (const key of keys) {
        const vals = valuesByKey.get(key.toLowerCase()) || [];
        if (vals.length > 0) return vals[0];
      }
      return "";
    };
    const collect = (...keys) => {
      const out = [];
      for (const key of keys) {
        const vals = valuesByKey.get(key.toLowerCase()) || [];
        out.push(...vals);
      }
      return Array.from(new Set(out.filter(Boolean)));
    };

    return {
      brand: first("brand", "brand_title"),
      condition: first("status", "status_title", "condition"),
      material: first("material", "material_title", "composition"),
      colors: collect("color", "colour", "color_title", "colour_title"),
      category: first("catalog_title", "category", "catalog_branch_title"),
    };
  } catch (_) {
    return null;
  }
}

function buildItemFromHtmlDoc(itemId, doc) {
  const details = {
    ...extractDetailsFromPageText(doc),
    ...extractDetailPairs(doc),
  };
  const linkedAttributes = extractAttributesFromDetailsLinks(doc);
  const jsonLd = extractFromJsonLd(doc) || {};
  const nextData = extractFromNextData(doc) || {};
  const domImages = collectItemImageUrls(doc);
  const imageUrls = Array.from(new Set([...(jsonLd.imageUrls || []), ...domImages]))
    .filter(Boolean)
    .map((url) => (String(url).startsWith("//") ? `https:${url}` : String(url)))
    .filter((url) => {
      const lower = url.toLowerCase();
      if (!lower.includes("vinted.net/t/")) return false;
      if (lower.includes("avatar") || lower.includes("profile") || lower.includes("user") || lower.includes("icon")) return false;
      return true;
    });

  const title =
    doc.querySelector('[data-testid="item-title"], h1')?.textContent?.trim() ||
    jsonLd.title ||
    `Article #${itemId}`;
  const description =
    doc.querySelector('[data-testid="item-description"], .item-description')?.textContent?.trim() ||
    jsonLd.description ||
    "";
  const priceText =
    doc.querySelector('[data-testid="item-price"], .item-price')?.textContent?.trim() || "";

  const colors = [
    ...(linkedAttributes.colors || []),
    ...(nextData.colors || []),
    ...(details["couleur"] ? details["couleur"].split(",").map((x) => x.trim()) : []),
  ].filter(Boolean);

  const item = {
    itemId: String(itemId),
    originalUrl: `https://www.vinted.fr/items/${itemId}`,
    title,
    description,
    price: normalizePrice(priceText),
    brand: linkedAttributes.brand || details["marque"] || nextData.brand || jsonLd.brand || "",
    condition: linkedAttributes.condition || details["état"] || details["etat"] || nextData.condition || jsonLd.condition || "",
    colors: Array.from(new Set(colors)),
    material: linkedAttributes.material || details["matière"] || details["matiere"] || nextData.material || "",
    size: details["taille"] || "",
    category: linkedAttributes.category || details["catégorie"] || details["categorie"] || nextData.category || jsonLd.category || "",
    catalogId: null,
    brandId: null,
    statusId: null,
    sizeId: null,
    colorIds: [],
    packageSizeId: null,
    imageUrls,
  };

  item.backupIntegrity = {
    hasTitle: Boolean(item.title),
    hasDescription: Boolean(item.description),
    hasPrice: Boolean(item.price),
    imageCount: item.imageUrls.length,
    hasBrand: Boolean(item.brand),
    hasCondition: Boolean(item.condition),
    isSafeToProceed: Boolean(item.title && item.price && item.imageUrls.length > 0),
  };
  return item;
}

async function fetchVintedItemJson(itemId) {
  const endpoints = [
    `https://www.vinted.fr/api/v2/items/${itemId}`,
    `https://www.vinted.fr/api/v2/items/${itemId}/details`,
  ];
  const attempts = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      if (!response.ok) {
        attempts.push(`${endpoint.split("/").slice(-2).join("/")} => HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const item = data?.item || data;
      if (item && (item.id || item.title)) {
        appendOverlayLog("success", `Données API récupérées via ${endpoint.split("/").slice(-2).join("/")}`);
        return { item, attempts };
      }
      attempts.push(`${endpoint.split("/").slice(-2).join("/")} => JSON vide`);
    } catch (_) {
      attempts.push(`${endpoint.split("/").slice(-2).join("/")} => erreur réseau`);
    }
  }
  return { item: null, attempts };
}

async function extractItemForDomDraft(itemId) {
  appendOverlayLog("info", `Extraction article ${itemId} via API JSON Vinted`);

  const { item: apiItem, attempts } = await fetchVintedItemJson(itemId);
  if (!apiItem) {
    appendOverlayLog("warning", `API indisponible (${attempts.join(" | ") || "cause inconnue"})`);
    appendOverlayLog("info", "Fallback extraction HTML de l'annonce...");

    // 1) Try current DOM first if we are already on the targeted item page.
    const onItemPage = new RegExp(`/items/${itemId}(?:\\D|$)`).test(window.location.href);
    let item = onItemPage ? buildItemFromHtmlDoc(itemId, document) : null;

    // 2) If still incomplete, fetch HTML from the canonical item page.
    if (!item || (!item.brand && !item.condition && !item.material && (!item.colors || item.colors.length === 0))) {
      const itemPageResponse = await fetch(`https://www.vinted.fr/items/${itemId}`, {
        credentials: "include",
        headers: {
          Accept: "text/html",
        },
      });
      if (!itemPageResponse.ok) {
        throw new Error(`API Vinted indisponible et fallback HTML en échec (HTTP ${itemPageResponse.status})`);
      }
      const html = await itemPageResponse.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      item = buildItemFromHtmlDoc(itemId, doc);
    }

    appendOverlayLog(
      "info",
      `HTML: ${item.imageUrls.length} photo(s) · marque=${item.brand || "?"} · état=${item.condition || "?"} · couleur=${item.colors.join("/") || "?"} · matière=${item.material || "?"}`
    );
    return item;
  }

  // Parse photos: API returns photo objects with full_size_url / url
  const photos = Array.isArray(apiItem.photos) ? apiItem.photos : [];
  const imageUrls = photos
    .map((photo) => photo?.full_size_url || photo?.url || photo?.image?.url || "")
    .filter(Boolean)
    .filter((src, idx, all) => all.indexOf(src) === idx);

  // Parse price
  const priceRaw =
    apiItem.price?.amount ??
    apiItem.price_numeric ??
    apiItem.price ??
    "";
  const price = normalizePrice(String(priceRaw));

  // Brand
  const brand = apiItem.brand_dto?.title || apiItem.brand || apiItem.brand_title || "";

  // Status / condition
  const condition = apiItem.status || apiItem.status_dto?.title || "";

  // Size
  const size = apiItem.size_title || apiItem.size || apiItem.size_dto?.title || "";

  // Colors
  const colors = (() => {
    if (Array.isArray(apiItem.colors)) {
      return apiItem.colors.map((c) => c?.title || c).filter(Boolean);
    }
    if (apiItem.color1 || apiItem.color2) {
      return [apiItem.color1, apiItem.color2].filter(Boolean);
    }
    return [];
  })();

  // Material
  const material = apiItem.material || apiItem.composition || "";

  // Category breadcrumbs
  const category = (() => {
    if (Array.isArray(apiItem.catalog_branch_titles) && apiItem.catalog_branch_titles.length) {
      return apiItem.catalog_branch_titles[apiItem.catalog_branch_titles.length - 1];
    }
    return apiItem.catalog_title || "";
  })();

  const item = {
    itemId: String(apiItem.id || itemId),
    originalUrl: apiItem.url || `https://www.vinted.fr/items/${itemId}`,
    title: apiItem.title || `Article #${itemId}`,
    description: apiItem.description || "",
    price,
    brand,
    condition,
    colors,
    material,
    size,
    category,
    catalogId: apiItem.catalog_id || null,
    brandId: apiItem.brand_id || null,
    statusId: apiItem.status_id || null,
    sizeId: apiItem.size_id || null,
    colorIds: apiItem.color_ids || [],
    packageSizeId: apiItem.package_size_id || null,
    imageUrls,
  };

  item.backupIntegrity = {
    hasTitle: Boolean(item.title),
    hasDescription: Boolean(item.description),
    hasPrice: Boolean(item.price),
    imageCount: item.imageUrls.length,
    hasBrand: Boolean(item.brand),
    hasCondition: Boolean(item.condition),
    isSafeToProceed: Boolean(item.title && item.price && item.imageUrls.length > 0),
  };

  appendOverlayLog(
    "info",
    `API: ${item.imageUrls.length} photo(s) · marque=${item.brand || "?"} · état=${item.condition || "?"} · couleur=${colors.join("/") || "?"} · matière=${item.material || "?"}`
  );

  return item;
}

async function saveRepublishBackup(item, files) {
  const backup = {
    version: 1,
    backupId: `${item.itemId}_${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: "vinted-republisher",
    item,
    preparedFiles: files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
    safety: {
      originalUrl: item.originalUrl,
      originalItemId: item.itemId,
      requiredFieldsPresent: item.backupIntegrity,
      deleteOriginalAllowed: false,
      publishNewAllowed: false,
      reason: "Manual verification required before destructive actions",
    },
  };

  await chrome.storage.local.set({
    [`${REPUBLISH_BACKUP_PREFIX}${item.itemId}`]: backup,
  });
  window.__VINTED_REPUBLISHER_LAST_BACKUP__ = backup;
  appendOverlayLog("success", `Backup sauvegardé (${backup.backupId})`);
  appendOverlayLog(
    backup.safety.requiredFieldsPresent.isSafeToProceed ? "success" : "warning",
    `Intégrité backup: titre=${backup.safety.requiredFieldsPresent.hasTitle}, prix=${backup.safety.requiredFieldsPresent.hasPrice}, photos=${backup.safety.requiredFieldsPresent.imageCount}`
  );
  return backup;
}

async function downloadImageDataUrl(url) {
  const response = await chrome.runtime.sendMessage({
    action: "DOWNLOAD_IMAGE_DATAURL",
    url,
  });
  if (!response?.success || !response.dataUrl) {
    throw new Error(response?.error || "download image failed");
  }
  return response.dataUrl;
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function makeUploadFile(dataUrl, index) {
  const blob = dataUrlToBlob(dataUrl);
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image decode failed"));
    };
    image.src = objectUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = `rgba(255,255,255,${0.004 + Math.random() * 0.004})`;
  ctx.fillRect(Math.max(0, canvas.width - 6), Math.max(0, canvas.height - 6), 4, 4);

  const jpegBlob = await new Promise((resolve) =>
    canvas.toBlob((out) => resolve(out || blob), "image/jpeg", 0.9 + Math.random() * 0.05)
  );
  return new File([jpegBlob], `vinted_republish_${Date.now()}_${index}.jpg`, {
    type: "image/jpeg",
  });
}

async function startSafeDomDraft(itemId, scannedItem = null) {
  ensureOverlay();
  setOverlayStatus("Préparation brouillon safe");
  appendOverlayLog("info", "Mode safe DOM: Vinted gère l’upload via son formulaire.");

  const item = await extractItemForDomDraft(itemId);
  if (scannedItem?.title && (!item.title || item.title.startsWith("Article #"))) item.title = scannedItem.title;
  if (scannedItem?.price && !item.price) item.price = normalizePrice(scannedItem.price);
  const scannedText = `${scannedItem?.title || ""} ${scannedItem?.price || ""}`;
  const brandMatch = scannedText.match(/marque:\s*([^,]+)/i);
  const conditionMatch = scannedText.match(/état:\s*([^,]+)/i);
  if (brandMatch && !item.brand) item.brand = brandMatch[1].trim();
  if (conditionMatch && !item.condition) item.condition = conditionMatch[1].trim();
  appendOverlayLog("success", `${item.imageUrls.length} photo(s) détectée(s)`);
  if (!item.backupIntegrity.isSafeToProceed) {
    throw new Error("Backup incomplet: titre, prix ou photos manquants. Suppression/publication bloquées.");
  }

  const files = [];
  for (let i = 0; i < item.imageUrls.length; i++) {
    appendOverlayLog("info", `Préparation photo ${i + 1}/${item.imageUrls.length}`);
    try {
      const dataUrl = await downloadImageDataUrl(item.imageUrls[i]);
      files.push(await makeUploadFile(dataUrl, i));
    } catch (error) {
      appendOverlayLog("warning", `Photo ${i + 1} ignorée: ${error.message}`);
    }
  }

  const backup = await saveRepublishBackup(item, files);

  await chrome.storage.local.set({
    [PENDING_DOM_DRAFT_KEY]: {
      ...item,
      backupId: backup.backupId,
      preparedAt: Date.now(),
      files: await Promise.all(
        files.map(
          (file) =>
            new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  name: file.name,
                  type: file.type,
                  dataUrl: reader.result,
                });
              reader.readAsDataURL(file);
            })
        )
      ),
    },
  });

  appendOverlayLog("info", "Ouverture de la page de création Vinted...");
  window.location.href = "https://www.vinted.fr/items/new";
}

async function continuePendingDomDraftIfNeeded() {
  if (!window.location.href.includes("/items/new")) return;
  const result = await chrome.storage.local.get(PENDING_DOM_DRAFT_KEY);
  const draft = result[PENDING_DOM_DRAFT_KEY];
  if (!draft) return;

  ensureOverlay();
  setOverlayStatus("Remplissage brouillon");
  appendOverlayLog("info", `Remplissage: ${draft.title}`);

  const fileInput = await waitForElement('input[type="file"]', 20000);
  if (fileInput && Array.isArray(draft.files) && draft.files.length > 0) {
    const dt = new DataTransfer();
    for (const [index, fileData] of draft.files.entries()) {
      const blob = dataUrlToBlob(fileData.dataUrl);
      dt.items.add(new File([blob], fileData.name || `photo_${index}.jpg`, { type: fileData.type || "image/jpeg" }));
    }
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    appendOverlayLog("success", `${dt.files.length} photo(s) envoyée(s) au formulaire Vinted`);
    await sleep(6000);
  } else {
    appendOverlayLog("warning", "Input photo introuvable ou aucune photo préparée");
  }

  const titleInput = document.querySelector('input[name="title"], input[id*="title"], input[data-testid*="title"]');
  if (titleInput && draft.title) setNativeInputValue(titleInput, draft.title);

  const descInput = document.querySelector('textarea[name="description"], textarea[id*="description"], textarea[data-testid*="description"]');
  if (descInput && draft.description) setNativeInputValue(descInput, draft.description);

  const priceInput = document.querySelector('input[name="price"], input[id*="price"], input[data-testid*="price"]');
  if (priceInput && draft.price) setNativeInputValue(priceInput, draft.price);

  // Attendre que Vinted auto-remplisse ses suggestions depuis les photos
  appendOverlayLog("info", "Attente auto-fill Vinted...");
  await sleep(3000);

  appendOverlayLog(
    "info",
    `Champs backup: marque=${draft.brand || "?"}, état=${draft.condition || "?"}, couleur=${(draft.colors || []).join("/") || "?"}, matière=${draft.material || "?"}, prix=${draft.price || "?"}`
  );

  // Prix en priorité (pas auto-filled par Vinted)
  const priceInputRetry = document.querySelector(
    'input[name="price"], input[id*="price"], input[data-testid*="price"]'
  );
  if (priceInputRetry && draft.price) {
    setNativeInputValue(priceInputRetry, draft.price);
    appendOverlayLog("success", `Prix: ${draft.price} €`);
  }

  // Compléter les champs que Vinted n'a pas auto-remplis
  const checkAndFill = async (labelText, value, altLabels = []) => {
    if (!value) return false;
    const seen = new Set();
    const allLabels = [labelText, ...altLabels].filter((lbl) => {
      const key = normalizeLabelKey(lbl);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    for (const lbl of allLabels) {
      const filled = await fillTextAutocompleteField(lbl, value);
      if (filled) return true;
    }
    return false;
  };

  const categoryForForm = normalizeCategoryForForm(draft.category, draft.brand);
  const categoryFilled = await checkAndFill("Catégorie", categoryForForm, ["Categorie"]);
  if (categoryForForm && !categoryFilled) {
    const categoryFieldMissing =
      !findFieldContainerByLabel("Catégorie") &&
      !findFieldContainerByLabel("Categorie") &&
      !findGlobalFieldInput("Catégorie");
    if (categoryFieldMissing) {
      appendOverlayLog(
        "warning",
        "Catégorie non détectée dans ce flux (possible étape intermédiaire, ex: Unisexe). On continue les autres champs."
      );
    } else {
      appendOverlayLog("warning", "Catégorie non validée. Arrêt avant Marque pour éviter les dropdowns empilés.");
      await closeOpenDropdown();
      await waitForDropdownClose(1200);
      await chrome.storage.local.remove(PENDING_DOM_DRAFT_KEY);
      setOverlayStatus("À vérifier");
      appendOverlayLog("warning", "Valide la catégorie manuellement puis relance pour compléter les autres champs.");
      return;
    }
  }

  await checkAndFill("Marque", draft.brand);
  await fillStateSingleSelect(draft.condition);
  await fillMaterialSingleSelect(draft.material);
  await fillColorMultiSelect(draft.colors || []);

  await chrome.storage.local.remove(PENDING_DOM_DRAFT_KEY);
  setOverlayStatus("À vérifier");
  appendOverlayLog("success", "Brouillon rempli. Vérifie catégorie/état/livraison puis sauvegarde manuellement.");
  appendOverlayLog(
    "warning",
    "Mode sécurité: suppression originale et publication auto non activées tant que la validation complète du nouveau brouillon n’est pas codée."
  );
}

function findFieldContainerByLabel(labelText) {
  const fieldLabels = ["catégorie", "categorie", "marque", "état", "etat", "couleur", "matériau", "matière", "materiau", "matiere"];
  const normalize = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\(.*?\)/g, "")
      .replace(/\s*:\s*$/, "")
      .trim()
      .toLowerCase();
  const target = normalize(labelText);
  const labels = Array.from(document.querySelectorAll("label, span, p, div"));
  const label = labels.find((el) => {
    const text = normalize(el.textContent);
    return text === target || text.startsWith(`${target} `);
  });
  if (!label) return null;

  const containsMultipleFieldLabels = (el) => {
    const txt = normalize(getVisibleText(el));
    let count = 0;
    for (const fld of fieldLabels) {
      if (txt.includes(` ${fld} `) || txt.startsWith(`${fld} `) || txt.endsWith(` ${fld}`) || txt === fld) {
        count += 1;
      }
    }
    return count > 1;
  };

  // Prefer the closest ancestor that has controls and does not include multiple fields.
  let node = label;
  for (let i = 0; i < 7 && node; i++) {
    const candidate = node.closest("div, section, li, article");
    if (!candidate) break;
    const hasControl = candidate.querySelector(
      "input:not([type='file']):not([type='hidden']), textarea, [contenteditable='true'], [role='combobox'], button, [role='button']"
    );
    if (hasControl && !containsMultipleFieldLabels(candidate)) {
      return candidate;
    }
    node = candidate.parentElement;
  }
  // Fallback: nearest row-like container.
  return label.closest(".web_ui__Cell__cell, .c-input, [class*='Cell']") || label.parentElement;
}

function getFieldRowTextByLabel(labelText) {
  const normalize = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\(.*?\)/g, "")
      .trim()
      .toLowerCase();
  const target = normalize(labelText);
  const labels = Array.from(document.querySelectorAll("label, span, p, div"));
  const labelEl = labels.find((el) => {
    const txt = normalize(el.textContent);
    return txt === target || txt.startsWith(target);
  });
  if (!labelEl) return "";
  let row = labelEl;
  for (let i = 0; i < 6 && row; i++) {
    const candidate = row.closest("div, li, section, article");
    if (!candidate) break;
    const txt = getVisibleText(candidate).toLowerCase();
    if (txt.includes(target) && txt.length > 12) {
      row = candidate;
      break;
    }
    row = candidate.parentElement;
  }
  return getVisibleText(row || labelEl).toLowerCase();
}

function containerLooksFilled(container, expectedValue, labelText = "") {
  if (!container) return false;
  const text = getVisibleText(container).toLowerCase();
  const rowText = labelText ? getFieldRowTextByLabel(labelText) : "";
  const expected = String(expectedValue || "").trim().toLowerCase();
  if (!expected) return false;
  const allText = `${text} ${rowText}`;
  if (/sélectionne|select/i.test(allText)) return false;
  if (/rechercher une marque|trouver une catégorie|suggestions/i.test(allText)) return false;
  if (document.querySelector('[role="listbox"], [role="option"]')) return false;
  return allText.includes(expected);
}

function getVisibleText(root) {
  if (!root) return "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let out = "";
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (!parent) continue;
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      if (parent.closest('[role="listbox"], [role="option"], [aria-expanded="true"]')) continue;
      const txt = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (txt) out += ` ${txt}`;
      continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      if (el.matches("input, textarea, script, style")) continue;
    }
  }
  return out.trim();
}

function findVisibleOptionByValue(value) {
  const expected = String(value || "").trim().toLowerCase();
  if (!expected) return null;
  const candidates = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] li, [data-testid*="option"]'));
  return candidates.find((el) => {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const text = (el.textContent || "").trim().toLowerCase();
    return text === expected || text.includes(expected);
  });
}

function findFirstVisibleOption() {
  const candidates = Array.from(document.querySelectorAll('[role="option"], [role="listbox"] li, [data-testid*="option"]'));
  return (
    candidates.find((el) => {
      if (!el || !el.isConnected) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      const text = (el.textContent || "").trim().toLowerCase();
      if (!text) return false;
      if (text.includes("suggestions")) return false;
      return true;
    }) || null
  );
}

function findOpenListboxForInput(input, container) {
  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect?.();
    return !rect || (rect.width > 2 && rect.height > 2);
  };

  const controlsId = input?.getAttribute?.("aria-controls");
  if (controlsId) {
    const direct = document.getElementById(controlsId);
    if (direct && isVisible(direct)) return direct;
  }

  const expanded = container?.querySelector?.('[aria-expanded="true"][aria-controls]');
  const expandedId = expanded?.getAttribute?.("aria-controls");
  if (expandedId) {
    const expandedList = document.getElementById(expandedId);
    if (expandedList && isVisible(expandedList)) return expandedList;
  }

  const visibleListboxes = Array.from(document.querySelectorAll('[role="listbox"], ul[role="listbox"]')).filter(isVisible);
  return visibleListboxes[0] || null;
}

function findOptionInListbox(listbox, value, preferFirst = false) {
  if (!listbox) return null;
  const expected = String(value || "").trim().toLowerCase();
  const options = Array.from(listbox.querySelectorAll('[role="option"], li, button, [data-testid*="option"]')).filter((el) => {
    const rect = el.getBoundingClientRect?.();
    if (rect && (rect.width < 2 || rect.height < 2)) return false;
    const txt = (el.textContent || "").trim().toLowerCase();
    return Boolean(txt) && !txt.includes("suggestions");
  });
  if (options.length === 0) return null;
  if (!preferFirst) {
    const exact = options.find((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      return txt === expected || txt.includes(expected);
    });
    if (exact) return exact;
  }
  return options[0];
}

function compactText(text, maxLen = 140) {
  const out = String(text || "").replace(/\s+/g, " ").trim();
  if (!out) return "";
  return out.length > maxLen ? `${out.slice(0, maxLen)}...` : out;
}

function normalizeComparableText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function textMatchesExpected(text, expected) {
  const t = normalizeComparableText(text);
  const e = normalizeComparableText(expected);
  if (!t || !e) return false;
  // Keep matching strict enough to avoid "Bon état" matching "Très bon état".
  return t === e || t.startsWith(e);
}

function normalizeLabelKey(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function describeElement(el) {
  if (!el) return "null";
  const tag = (el.tagName || "").toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = (el.className && typeof el.className === "string")
    ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".")}`
    : "";
  const role = el.getAttribute?.("role");
  const type = el.getAttribute?.("type");
  const expanded = el.getAttribute?.("aria-expanded");
  const controls = el.getAttribute?.("aria-controls");
  const txt = compactText(el.textContent || "", 80);
  return `${tag}${id}${cls}${role ? ` role=${role}` : ""}${type ? ` type=${type}` : ""}${expanded ? ` expanded=${expanded}` : ""}${controls ? ` controls=${controls}` : ""}${txt ? ` text="${txt}"` : ""}`;
}

function logDomDebug(labelText, phase, payload = {}) {
  const data = Object.entries(payload)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" | ");
  appendOverlayLog("info", `[DOM][${labelText}] ${phase}${data ? ` | ${data}` : ""}`);
}

function clickElementHard(el) {
  if (!el) return;
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch (_) {
    // ignore
  }
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.click();
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}

function isOptionSelected(optionEl) {
  if (!optionEl) return false;
  const candidate = optionEl.closest("button, li, [role='option'], [role='button']") || optionEl;
  const ariaChecked = candidate.getAttribute("aria-checked");
  if (ariaChecked === "true") return true;
  const ariaSelected = candidate.getAttribute("aria-selected");
  if (ariaSelected === "true") return true;
  const input = candidate.querySelector("input[type='radio'], input[type='checkbox']");
  if (input && input.checked) return true;
  return false;
}

async function waitForDropdownClose(timeoutMs = 1200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const open = document.querySelector('[role="listbox"], [role="option"], [aria-expanded="true"]');
    if (!open) return true;
    await sleep(80);
  }
  return false;
}

function getFieldDisplayText(labelText) {
  const container = findFieldContainerByLabel(labelText);
  if (!container) return "";
  return getVisibleText(container)
    .replace(new RegExp(`^\\s*${labelText}\\s*`, "i"), "")
    .replace(/sélectionne.+$/i, "")
    .replace(/select.+$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeCategoryForForm(category, brand) {
  let out = String(category || "").trim();
  if (!out) return "";
  const b = String(brand || "").trim();
  if (b && out.toLowerCase().startsWith(`${b.toLowerCase()} `)) {
    out = out.slice(b.length).trim();
  }
  return out;
}

async function closeOpenDropdown() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(80);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function findEditableFieldInContainer(container) {
  if (!container) return null;
  const elements = Array.from(container.querySelectorAll("input, textarea, [contenteditable='true']"));
  return (
    elements.find((el) => {
      if (!el || !el.isConnected) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === "input") {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (type === "file" || type === "hidden" || type === "radio" || type === "checkbox") return false;
      }
      if (el.hasAttribute("readonly")) return false;
      const rect = el.getBoundingClientRect?.();
      return !rect || (rect.width > 0 && rect.height > 0);
    }) || null
  );
}

function findClickableControlInContainer(container) {
  if (!container) return null;
  const controls = Array.from(container.querySelectorAll("[role='combobox'], button, [role='button']"));
  return (
    controls.find((el) => {
      if (!el || !el.isConnected) return false;
      const rect = el.getBoundingClientRect?.();
      if (rect && (rect.width < 2 || rect.height < 2)) return false;
      const text = (el.textContent || "").toLowerCase();
      if ((el.className || "").toString().includes("c-input__icon")) return false;
      if (text.includes("copier logs") || text.includes("copier backup")) return false;
      return true;
    }) || null
  );
}

function findFieldLabelElement(labelText) {
  const normalize = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\(.*?\)/g, "")
      .replace(/\s*:\s*$/, "")
      .trim()
      .toLowerCase();
  const target = normalize(labelText);
  const labels = Array.from(document.querySelectorAll("label, span, p, div"));
  return labels.find((el) => {
    const text = normalize(el.textContent);
    return text === target || text.startsWith(`${target} `);
  }) || null;
}

function findFieldActivator(labelText, container) {
  const labelEl = findFieldLabelElement(labelText);
  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect?.();
    return !rect || (rect.width > 2 && rect.height > 2);
  };

  const probeRoots = [];
  if (container) probeRoots.push(container);
  if (labelEl) {
    let node = labelEl;
    for (let i = 0; i < 7 && node; i++) {
      const candidate = node.closest(".web_ui__Cell__cell, .c-input, div, li, section, article");
      if (!candidate) break;
      probeRoots.push(candidate);
      node = candidate.parentElement;
    }
  }

  const uniqRoots = Array.from(new Set(probeRoots.filter(Boolean)));
  for (const root of uniqRoots) {
    const controls = Array.from(
      root.querySelectorAll(
        ".c-input__icon, [aria-expanded], [aria-haspopup='listbox'], button, [role='button']"
      )
    ).filter((el) => {
      if (!isVisible(el)) return false;
      const txt = (el.textContent || "").toLowerCase();
      if (txt.includes("copier logs") || txt.includes("copier backup")) return false;
      const id = (el.id || "").toLowerCase();
      if (
        id.startsWith("suggested-") ||
        id.startsWith("catalog-") ||
        id.startsWith("condition-") ||
        id.startsWith("color-") ||
        id.startsWith("material-")
      ) {
        return false;
      }
      return true;
    });
    const icon = controls.find((el) => (el.className || "").toString().includes("c-input__icon"));
    if (icon) return icon;
    if (controls.length > 0) return controls[0];
  }

  if (labelEl && isVisible(labelEl)) return labelEl;
  return null;
}

function findGlobalFieldInput(labelText) {
  const key = String(labelText || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (key.includes("categorie")) {
    return document.querySelector("input#catalog-search-input, input[name*='catalog'], input[id*='catalog'][type='text']");
  }
  if (key.includes("marque")) {
    return document.querySelector("input#brand-search-input, input[name*='brand'], input[id*='brand'][type='text']");
  }
  if (key.includes("etat")) {
    return document.querySelector("input[name*='status'], input[id*='status'][type='text']");
  }
  if (key.includes("mater")) {
    return document.querySelector("input#material-search-input, input[name*='material'][type='text'], input[id*='material'][type='text']");
  }
  if (key.includes("couleur") || key.includes("color")) {
    return document.querySelector("input#color-search-input, input[name*='color'][type='text'], input[id*='color'][type='text']");
  }
  return null;
}

function findSuggestionButtonInContainer(container, value) {
  if (!container) return null;
  const expected = String(value || "").trim();
  const collectButtons = (root) =>
    Array.from(root.querySelectorAll("button, [role='button'], [id^='suggested-'], [id^='catalog-'], [id^='condition-'], [id^='color-'], [id^='material-']"))
      .filter((el) => {
        if (!el || !el.isConnected) return false;
        const rect = el.getBoundingClientRect?.();
        if (rect && (rect.width < 2 || rect.height < 2)) return false;
        const txt = (el.textContent || "").trim();
        if (!txt) return false;
        const low = txt.toLowerCase();
        if (low.includes("copier logs") || low.includes("copier backup")) return false;
        if ((el.className || "").toString().includes("c-input__icon")) return false;
        return true;
      });

  const buttons = [
    ...collectButtons(container),
    ...collectButtons(document),
  ]
    .filter((el, idx, arr) => arr.indexOf(el) === idx);

  const exact = buttons.find((el) => textMatchesExpected(el.textContent || "", expected));
  if (exact) return exact;

  // Never click a random fallback for value-based fields.
  return null;
}

function isButtonLikelyForValue(button, expected) {
  if (!button) return false;
  return textMatchesExpected(button.textContent || "", expected);
}

function isRadioChoiceInput(input) {
  if (!input) return false;
  const tag = (input.tagName || "").toLowerCase();
  if (tag !== "input") return false;
  const type = (input.getAttribute("type") || "").toLowerCase();
  return type === "radio" || type === "checkbox";
}

function getCommittedFieldValue(labelText) {
  const key = String(labelText || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const getValue = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return "";
    return String(el.value || el.getAttribute("value") || el.textContent || "").trim().toLowerCase();
  };

  if (key.includes("categorie")) return getValue("input#catalog, input[name*='catalog']");
  if (key.includes("marque")) return getValue("input#brand, input[name*='brand']");
  if (key.includes("etat")) return getValue("input#status, input[name*='status']");
  if (key.includes("mater")) return getValue("input#material, input[name*='material']");
  if (key.includes("couleur") || key.includes("color")) return getValue("input#color, input[name*='color']");
  return "";
}

function getPrimaryFieldValue(labelText) {
  const container = findFieldContainerByLabel(labelText);
  if (!container) return "";
  const candidates = Array.from(
    container.querySelectorAll("input, [contenteditable='true'], .c-input__value, .web_ui__InputBar__value")
  ).filter((el) => {
    if (!el || !el.isConnected) return false;
    const id = (el.id || "").toLowerCase();
    if (id.includes("search")) return false;
    const type = (el.getAttribute?.("type") || "").toLowerCase();
    if (type === "hidden" || type === "file") return false;
    return true;
  });

  for (const el of candidates) {
    const raw =
      ("value" in el && typeof el.value === "string" ? el.value : "") ||
      el.getAttribute?.("value") ||
      el.textContent ||
      "";
    const value = normalizeComparableText(raw);
    if (!value) continue;
    if (/^\d+$/.test(value)) continue;
    if (["on", "off", "true", "false", "yes", "no"].includes(value)) continue;
    if (/rechercher|trouver|suggestions|selectionne|sélectionne/.test(value)) continue;
    return value;
  }
  return "";
}

function isCommittedMatch(actual, expected) {
  const a = normalizeComparableText(actual);
  const e = normalizeComparableText(expected);
  if (!a || !e) return false;
  if (["on", "off", "true", "false", "yes", "no"].includes(a)) return false;
  if (a === e) return true;
  // Accept small decorated variants, reject giant suggestion blobs.
  if (a.startsWith(`${e} `) && a.length <= e.length + 24) return true;
  if (a.startsWith(`${e}.`) || a.startsWith(`${e},`) || a.startsWith(`${e}:`)) return true;
  return false;
}

function findVisibleChoiceByText(expectedValue) {
  const expected = normalizeComparableText(expectedValue);
  if (!expected) return null;
  const nodes = Array.from(
    document.querySelectorAll(".web_ui__Cell__cell, [role='button'], button, [role='option'], li")
  ).filter((el) => {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect?.();
    if (rect && (rect.width < 2 || rect.height < 2)) return false;
    const txt = normalizeComparableText(el.textContent || "");
    if (!txt) return false;
    if (txt.includes("copier logs") || txt.includes("copier backup")) return false;
    if (txt.includes("preuves d'authenticite")) return false;
    return textMatchesExpected(txt, expected);
  });
  if (nodes.length === 0) return null;
  // Prefer shortest text match to avoid long descriptive blocks.
  nodes.sort((a, b) => (a.textContent || "").trim().length - (b.textContent || "").trim().length);
  return nodes[0];
}

async function fillMaterialSingleSelect(materialValue) {
  const target = String(materialValue || "").trim();
  if (!target) return false;
  const label = "Matériau";
  const container = findFieldContainerByLabel(label) || findFieldContainerByLabel("Matière");
  if (!container) {
    appendOverlayLog("warning", "Champ Matériau introuvable");
    return false;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const activator = findFieldActivator(label, container);
    logDomDebug(label, `single-select attempt ${attempt}`, {
      target,
      activator: describeElement(activator),
      beforePrimary: getPrimaryFieldValue(label),
    });
    if (activator) {
      clickElementHard(activator);
      await sleep(220);
    }

    const choice = findVisibleChoiceByText(target);
    if (choice) {
      if (isOptionSelected(choice)) {
        logDomDebug(label, "material choice already selected", {
          choice: describeElement(choice),
        });
      } else {
        clickElementHard(choice);
        await sleep(120);
        const innerChooser = choice.querySelector(
          "input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox'], button"
        );
        if (innerChooser && innerChooser !== choice) {
          clickElementHard(innerChooser);
          await sleep(120);
        }
        // One extra click on the row can be required by some Vinted flows.
        if (!isOptionSelected(choice)) {
          clickElementHard(choice);
          await sleep(120);
        }
        logDomDebug(label, "material choice clicked", {
          choice: describeElement(choice),
          hasInnerChooser: Boolean(innerChooser),
          selectedAfterClick: isOptionSelected(choice),
        });
      }
    } else {
      logDomDebug(label, "material choice not found", { target });
    }

    await closeOpenDropdown();
    await waitForDropdownClose(1200);
    await sleep(120);

    const primary = normalizeComparableText(getPrimaryFieldValue(label));
    const committed = normalizeComparableText(getCommittedFieldValue(label));
    const selectedNow = choice ? isOptionSelected(choice) : false;
    const rowNow = normalizeComparableText(getFieldDisplayText(label));
    logDomDebug(label, "material post-check", {
      primary,
      committed,
      selectedNow,
      rowNow,
    });
    if (
      primary.includes(normalizeComparableText(target)) ||
      committed.includes(normalizeComparableText(target)) ||
      selectedNow ||
      (rowNow.includes(normalizeComparableText(target)) && !/selectionne|sélectionne/.test(rowNow))
    ) {
      appendOverlayLog("success", `${label}: ${target}`);
      return true;
    }
  }

  appendOverlayLog("warning", `${label}: valeur non appliquée automatiquement (${target})`);
  return false;
}

async function fillStateSingleSelect(stateValue) {
  const target = String(stateValue || "").trim();
  if (!target) return false;
  const label = "État";
  const container = findFieldContainerByLabel(label) || findFieldContainerByLabel("Etat");
  if (!container) {
    appendOverlayLog("warning", "Champ État introuvable");
    return false;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const activator = findFieldActivator(label, container);
    logDomDebug(label, `single-select attempt ${attempt}`, {
      target,
      activator: describeElement(activator),
      beforePrimary: getPrimaryFieldValue(label),
    });
    if (activator) {
      clickElementHard(activator);
      await sleep(220);
    }

    const choice = findVisibleChoiceByText(target);
    let selectedNow = false;
    if (choice) {
      clickElementHard(choice);
      await sleep(120);
      const innerChooser = choice.querySelector(
        "input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox'], button"
      );
      if (innerChooser && innerChooser !== choice) {
        clickElementHard(innerChooser);
        await sleep(120);
      }
      if (!isOptionSelected(choice)) {
        clickElementHard(choice);
        await sleep(120);
      }
      selectedNow = isOptionSelected(choice);
      logDomDebug(label, "state choice clicked", {
        choice: describeElement(choice),
        hasInnerChooser: Boolean(innerChooser),
        selectedAfterClick: selectedNow,
      });
    } else {
      logDomDebug(label, "state choice not found", { target });
    }

    await closeOpenDropdown();
    await waitForDropdownClose(1200);
    await sleep(120);

    const primary = normalizeComparableText(getPrimaryFieldValue(label));
    const committed = normalizeComparableText(getCommittedFieldValue(label));
    const rowNow = normalizeComparableText(getFieldDisplayText(label));
    logDomDebug(label, "state post-check", {
      primary,
      committed,
      rowNow,
      selectedNow,
    });
    if (
      isCommittedMatch(primary, target) ||
      isCommittedMatch(committed, target) ||
      selectedNow
    ) {
      appendOverlayLog("success", `${label}: ${target}`);
      return true;
    }
  }

  appendOverlayLog("warning", `${label}: valeur non appliquée automatiquement (${target})`);
  return false;
}

async function fillColorMultiSelect(colors) {
  const normalized = Array.from(
    new Set(
      (colors || [])
        .map((c) => String(c || "").trim())
        .filter(Boolean)
    )
  );
  if (normalized.length === 0) return true;

  const label = "Couleur";
  const container = findFieldContainerByLabel(label) || findFieldContainerByLabel("Color");
  if (!container) {
    appendOverlayLog("warning", "Champ Couleur introuvable");
    return false;
  }

  const activator = findFieldActivator(label, container);
  if (activator) {
    clickElementHard(activator);
    await sleep(260);
    logDomDebug(label, "opened multi-select", { activator: describeElement(activator) });
  }

  let successCount = 0;
  for (const color of normalized) {
    let option = findSuggestionButtonInContainer(container, color) || findSuggestionButtonInContainer(document.body, color);
    if (!option) {
      logDomDebug(label, "color option not found", { color });
      continue;
    }

    if (isOptionSelected(option)) {
      logDomDebug(label, "color already selected", { color, option: describeElement(option) });
      successCount += 1;
      continue;
    }

    clickElementHard(option);
    await sleep(140);
    let selected = isOptionSelected(option);
    if (!selected) {
      // One retry only if first click did not select.
      clickElementHard(option);
      await sleep(140);
      selected = isOptionSelected(option);
    }

    logDomDebug(label, "clicked color option", {
      color,
      option: describeElement(option),
      selected,
    });
    if (selected) successCount += 1;
  }

  await closeOpenDropdown();
  const closed = await waitForDropdownClose(1200);
  const rowAfter = getFieldDisplayText(label);
  logDomDebug(label, "multi-select post snapshot", {
    closed,
    rowAfter: compactText(rowAfter, 120),
    expectedColors: normalized,
    successCount,
  });

  const allSelected = successCount >= normalized.length;
  if (allSelected) {
    appendOverlayLog("success", `Couleur: ${normalized.join(" / ")}`);
    return true;
  }
  appendOverlayLog("warning", `Couleur: sélection partielle (${successCount}/${normalized.length})`);
  return false;
}

async function fillTextAutocompleteField(labelText, value) {
  if (!value) return false;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const container = findFieldContainerByLabel(labelText);
    if (!container) {
      if (attempt === 2) {
        appendOverlayLog("warning", `Champ ${labelText} introuvable`);
      }
      await sleep(350);
      continue;
    }

    let input = findEditableFieldInContainer(container) || findGlobalFieldInput(labelText);
    let button = findClickableControlInContainer(container);
    const activator = findFieldActivator(labelText, container);
    logDomDebug(labelText, `attempt ${attempt} start`, {
      targetValue: value,
      container: describeElement(container),
      input: describeElement(input),
      button: describeElement(button),
      activator: describeElement(activator),
      rowBefore: compactText(getFieldDisplayText(labelText), 120),
    });

    try {
      // Force-open the field selector when needed.
      if (!input && activator) {
        clickElementHard(activator);
        await sleep(260);
        input = findEditableFieldInContainer(container) || findGlobalFieldInput(labelText);
        button = findClickableControlInContainer(container);
        logDomDebug(labelText, "clicked activator", {
          activator: describeElement(activator),
          inputAfterActivator: describeElement(input),
          buttonAfterActivator: describeElement(button),
        });
      }

      // Secondary fallback control click.
      if (button && !input) {
        if (isButtonLikelyForValue(button, value)) {
          clickElementHard(button);
          await sleep(250);
          logDomDebug(labelText, "clicked fallback control", { control: describeElement(button) });
        } else {
          logDomDebug(labelText, "skipped fallback control (does not match target)", {
            control: describeElement(button),
            targetValue: value,
          });
        }
        input = findEditableFieldInContainer(container) || findGlobalFieldInput(labelText);
      }

      if (input && !isRadioChoiceInput(input)) {
        input.focus();
        setNativeInputValue(input, value);
        await sleep(450);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        logDomDebug(labelText, "typed in input", {
          inputValue: input.value || "",
          controls: input.getAttribute("aria-controls") || "",
          expanded: input.getAttribute("aria-expanded") || "",
        });
      }

      const listbox = findOpenListboxForInput(input, container);
      const optionsPreview = listbox
        ? Array.from(listbox.querySelectorAll('[role="option"], li, button, [data-testid*="option"]'))
            .slice(0, 4)
            .map((el) => compactText(el.textContent || "", 45))
        : [];
      logDomDebug(labelText, "listbox resolved", {
        listbox: describeElement(listbox),
        optionsCount: listbox ? listbox.querySelectorAll('[role="option"], li, button, [data-testid*="option"]').length : 0,
        optionsPreview,
      });

      let option = findOptionInListbox(listbox, value, false);
      if (!option) option = findVisibleOptionByValue(value);
      if (!option) option = findOptionInListbox(listbox, value, true);
      if (!option) option = findFirstVisibleOption();
      if (option && !textMatchesExpected(option.textContent || "", value)) {
        logDomDebug(labelText, "discarded generic option (no value match)", {
          option: describeElement(option),
          targetValue: value,
        });
        option = null;
      }
      let clickedSuggestionButton = false;
      let clickedMatchedOption = false;
      let matchedOptionSelected = false;
      if (option) {
        const clickable = option.closest("button, li, [role='option']") || option;
        clickElementHard(clickable);
        const radioOrCheckbox = clickable.querySelector(
          "input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox'], button"
        );
        if (radioOrCheckbox && radioOrCheckbox !== clickable) {
          clickElementHard(radioOrCheckbox);
        }
        await sleep(120);
        clickElementHard(clickable);
        clickedMatchedOption = textMatchesExpected(option.textContent || "", value);
        matchedOptionSelected = isOptionSelected(clickable) || isOptionSelected(option);
        logDomDebug(labelText, "clicked option", {
          option: describeElement(option),
          clickable: describeElement(clickable),
          hasInnerChooser: Boolean(radioOrCheckbox),
          clickedMatchedOption,
          matchedOptionSelected,
        });
      } else {
        const suggestionButton = findSuggestionButtonInContainer(container, value);
        if (suggestionButton) {
          clickElementHard(suggestionButton);
          await sleep(120);
          clickElementHard(suggestionButton);
          clickedSuggestionButton = true;
          clickedMatchedOption = textMatchesExpected(suggestionButton.textContent || "", value);
          matchedOptionSelected = isOptionSelected(suggestionButton);
          logDomDebug(labelText, "clicked suggestion button fallback", {
            suggestionButton: describeElement(suggestionButton),
            clickedMatchedOption,
            matchedOptionSelected,
          });
        }
      }
      if (!option && !clickedSuggestionButton && input) {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        logDomDebug(labelText, "no option found, pressed Enter fallback", {});
      }

      if (input && !isRadioChoiceInput(input)) {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      }
      await sleep(450);
      await closeOpenDropdown();
      const closed = await waitForDropdownClose(1200);
      await sleep(120);
      const refreshedContainer = findFieldContainerByLabel(labelText);
      const displayText = getFieldDisplayText(labelText);
      const committedValue = getCommittedFieldValue(labelText);
      const primaryValue = getPrimaryFieldValue(labelText);
      const labelKey = normalizeLabelKey(labelText);
      const requireStricterCommit =
        labelKey.includes("couleur") || labelKey.includes("mater") || labelKey.includes("categorie") || labelKey.includes("etat");
      logDomDebug(labelText, "post validation snapshot", {
        dropdownClosed: closed,
        rowAfter: compactText(displayText, 120),
        committedValue: compactText(committedValue, 80),
        primaryValue: compactText(primaryValue, 80),
        refreshedContainer: describeElement(refreshedContainer),
      });
      const displayLooksGood = displayText.includes(String(value).trim().toLowerCase());
      const expectedNorm = normalizeComparableText(value);
      const committedLooksGood = isCommittedMatch(committedValue, expectedNorm);
      const primaryLooksGood = isCommittedMatch(primaryValue, expectedNorm);
      const selectedByControl = clickedMatchedOption && matchedOptionSelected;
      if (
        containerLooksFilled(refreshedContainer, value, labelText) &&
        (displayLooksGood || selectedByControl) &&
        (
          requireStricterCommit
            ? (
                labelKey.includes("etat")
                  ? (primaryLooksGood || committedLooksGood || selectedByControl)
                  : (primaryLooksGood || (labelKey.includes("couleur") || labelKey.includes("mater") ? committedLooksGood : false))
              )
            : (committedLooksGood || primaryLooksGood || selectedByControl || displayLooksGood)
        )
      ) {
        appendOverlayLog("success", `${labelText}: ${value}`);
        return true;
      }
    } catch (error) {
      logDomDebug(labelText, "attempt exception", { message: error?.message || String(error) });
      if (attempt === 2) {
        appendOverlayLog("warning", `${labelText}: échec remplissage (${error.message})`);
      }
    }
  }

  appendOverlayLog("warning", `${labelText}: valeur non appliquée automatiquement (${value})`);
  return false;
}

// Inject page-context automation engine (listens to window.postMessage)
function injectAutomationEngine() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("automation-engine-fresh.js");
  script.onload = function () {
    console.log("[Content] ✅ automation-engine-fresh.js injected");
    this.remove();
  };
  script.onerror = function () {
    console.error("[Content] ❌ Failed to inject automation-engine-fresh.js");
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

injectAutomationEngine();
setTimeout(() => {
  continuePendingDomDraftIfNeeded().catch((error) => {
    ensureOverlay();
    setOverlayStatus("Erreur");
    appendOverlayLog("error", error.message || "Erreur remplissage brouillon");
  });
}, 1000);

// Relay results emitted by the page-context engine to background
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data && event.data.action === "VINTED_DOWNLOAD_IMAGE_REQUEST") {
    const requestId = event.data.requestId;
    const url = event.data.url;
    chrome.runtime
      .sendMessage({
        action: "DOWNLOAD_IMAGE_DATAURL",
        url,
      })
      .then((response) => {
        window.postMessage(
          {
            action: "VINTED_DOWNLOAD_IMAGE_RESPONSE",
            requestId,
            success: !!response?.success,
            dataUrl: response?.dataUrl || null,
            error: response?.error || null,
          },
          "*"
        );
      })
      .catch((error) => {
        window.postMessage(
          {
            action: "VINTED_DOWNLOAD_IMAGE_RESPONSE",
            requestId,
            success: false,
            dataUrl: null,
            error: error?.message || "download bridge failed",
          },
          "*"
        );
      });
    return;
  }

  if (event.data && event.data.action === "VINTED_AUTOMATION_PROGRESS") {
    const level = event.data.level || "info";
    const message = event.data.message || "Mise a jour du processus";
    appendOverlayLog(level, message);
    if (event.data.step) {
      setOverlayStatus(`Etape: ${event.data.step}`);
    }
    return;
  }

  if (!event.data || event.data.action !== "VINTED_AUTOMATION_RESULTS") return;

  const results = Array.isArray(event.data.results) ? event.data.results : [];
  const successCount = results.filter((r) => r && r.success).length;
  const failCount = results.length - successCount;
  appendOverlayLog(
    failCount > 0 ? "warning" : "success",
    `Fin du traitement: ${successCount} succes, ${failCount} echec(s).`
  );
  setOverlayStatus("Termine");
  closeOverlayLater();

  chrome.runtime
    .sendMessage({
      action: "VINTED_AUTOMATION_RESULTS",
      results: event.data.results,
      settings: event.data.settings,
    })
    .catch((error) =>
      console.error("[Content] ❌ Failed to relay automation results:", error)
    );
});

// --- UTILS: React Event Dispatcher ---
const triggerReactChange = (element, value) => {
  const lastValue = element.value;
  element.value = value;
  const event = new Event("input", { bubbles: true });
  // React 16+ hack to trigger value setter
  const tracker = element._valueTracker;
  if (tracker) {
    tracker.setValue(lastValue);
  }
  element.dispatchEvent(event);
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

// --- STEP 1: SCRAPING ---
async function scrapeProduct() {
  console.log("📦 Scraping product...");

  const getText = (sel) => document.querySelector(sel)?.innerText?.trim() || "";
  const getVal = (sel) => document.querySelector(sel)?.value || "";

  const product = {
    title: getText('h1[data-testid="item-title"], [class*="title"]'),
    description: getText('[data-testid="item-description"], .item-description'),
    price: getText('[data-testid="item-price"], .item-price'),
    brand: getText('[itemprop="brand"]'),
    condition: getText('[itemprop="itemCondition"]'),
    images: [],
  };

  // Download and Process Images
  const imgElements = document.querySelectorAll(
    '.item-photos img, [data-testid="item-photo"] img'
  );
  const processor = new ImageProcessor(); // Assumes image-processor.js is loaded

  for (let img of imgElements) {
    // Get High Res URL
    let src = img.src
      .replace("/thumb/", "/original/")
      .replace("/medium/", "/original/");

    try {
      // Download as Blob
      const response = await fetch(src);
      const blob = await response.blob();

      // Convert to Data URL for processing
      const reader = new FileReader();
      const dataUrl = await new Promise((r) => {
        reader.onload = () => r(reader.result);
        reader.readAsDataURL(blob);
      });

      // MODIFY IMAGE (Anti-Detection)
      const modifiedDataUrl = await processor.modifyImage(dataUrl, {
        cropPercentage: 3,
        rotationAngle: 0.5,
        qualityReduction: 5,
        addWatermark: true,
        watermarkText: " ", // Invisible noise
      });

      product.images.push(modifiedDataUrl);
      console.log("✅ Image processed");
    } catch (e) {
      console.error("Failed to process image", e);
    }
  }

  return product;
}

// --- STEP 2: DELETION ---
async function deleteProduct() {
  console.log("🗑️ Starting deletion...");
  // 1. Click Menu
  const menuBtn = document.querySelector(
    '[data-testid="item-actions-overflow-button"]'
  );
  if (menuBtn) menuBtn.click();
  await new Promise((r) => setTimeout(r, 500));

  // 2. Click Delete
  const deleteBtn = Array.from(document.querySelectorAll("button")).find(
    (b) =>
      b.textContent.includes("Supprimer") || b.textContent.includes("Delete")
  );
  if (deleteBtn) deleteBtn.click();
  await new Promise((r) => setTimeout(r, 1000));

  // 3. Confirm
  const confirmBtn = document.querySelector(
    '[data-testid="confirm-action-button"]'
  );
  if (confirmBtn) {
    confirmBtn.click();
    return true;
  }
  return false;
}

// --- STEP 3: PUBLISHING (Form Filling) ---
async function fillForm(data) {
  console.log("📝 Filling form...", data);

  // 1. Upload Images (Complex part)
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput && data.images.length > 0) {
    const dataTransfer = new DataTransfer();

    for (let i = 0; i < data.images.length; i++) {
      const res = await fetch(data.images[i]);
      const blob = await res.blob();
      const file = new File([blob], `img_${Date.now()}_${i}.jpg`, {
        type: "image/jpeg",
      });
      dataTransfer.items.add(file);
    }

    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 3000)); // Wait for upload
  }

  // 2. Fill Text Fields
  const titleInput = document.querySelector('#title, [name="title"]');
  if (titleInput) triggerReactChange(titleInput, data.title);

  const descInput = document.querySelector(
    '#description, [name="description"]'
  );
  if (descInput) triggerReactChange(descInput, data.description);

  const priceInput = document.querySelector('#price, [name="price"]');
  if (priceInput)
    triggerReactChange(priceInput, data.price.replace(/[^0-9.,]/g, ""));

  console.log("✅ Form filled");
}

// --- MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "SCAN_ITEMS") {
    const run = async () => {
      if (window.vinted && typeof window.vinted.scanPage === "function") {
        return window.vinted.scanPage();
      }
      // Fallback: attempt lightweight list extraction
      const links = Array.from(document.querySelectorAll('a[href*="/items/"]'));
      const unique = new Map();
      for (const link of links) {
        const match = link.href.match(/\/items\/(\d+)/);
        if (!match) continue;
        const itemId = match[1];
        if (unique.has(itemId)) continue;
        const card = link.closest("article, li, div");
        const title = (card?.querySelector("h3, h4, [data-testid*='title']")?.textContent || `Article #${itemId}`).trim();
        const price = (card?.querySelector("[data-testid*='price'], .price")?.textContent || "N/A").trim();
        const image = card?.querySelector("img")?.src || null;
        unique.set(itemId, {
          id: itemId,
          title,
          price,
          image,
          isDraft: false,
          url: `https://www.vinted.fr/items/${itemId}`,
        });
      }
      return Array.from(unique.values());
    };
    run()
      .then((items) => sendResponse(items))
      .catch((err) => {
        console.error("[Content] Scan error:", err);
        sendResponse([]);
      });
    return true;
  }

  if (req.action === "VINTED_AUTOMATION_START") {
    ensureOverlay();
    setOverlayStatus("Demarrage");
    appendOverlayLog("info", `Automation lancee pour item ${req.itemId}`);
    window.postMessage(
      {
        action: "VINTED_AUTOMATION_START",
        itemId: req.itemId,
        settings: req.settings || {},
      },
      "*"
    );
    sendResponse({ success: true });
    return true;
  }

  if (req.action === "START_SAFE_DOM_DRAFT") {
    startSafeDomDraft(req.itemId, req.item)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        appendOverlayLog("error", error.message || "Erreur mode safe DOM");
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (req.action === "SCRAPE") {
    scrapeProduct().then((data) => sendResponse(data));
    return true;
  }
  if (req.action === "DELETE") {
    deleteProduct().then((success) => sendResponse({ success }));
    return true;
  }
  if (req.action === "FILL") {
    fillForm(req.data).then(() => sendResponse({ success: true }));
    return true;
  }
});
