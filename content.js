// content.js - Combined Scraper & Automator + page-bridge for automation engine

const OVERLAY_ID = "vinted-republisher-live-overlay";
const OVERLAY_LOGS_ID = "vinted-republisher-live-logs";
const OVERLAY_STATUS_ID = "vinted-republisher-live-status";
const OVERLAY_COPY_LOGS_ID = "vinted-republisher-copy-logs";
const OVERLAY_COPY_BACKUP_ID = "vinted-republisher-copy-backup";
const OVERLAY_COPY_DIAGNOSTIC_ID = "vinted-republisher-copy-diagnostic";
const OVERLAY_CLOSE_ID = "vinted-republisher-close-overlay";
const OVERLAY_ACTIONS_ID = "vinted-republisher-actions";
const OVERLAY_CONFIRM_ID = "vinted-republisher-confirm-finish";
const PENDING_DOM_DRAFT_KEY = "vinted_pending_dom_draft";
const PENDING_REPUBLISH_FINISH_KEY = "vinted_pending_republish_finish";
const PENDING_REPUBLISH_CONFIRM_KEY = "vinted_pending_republish_confirm";
const OVERLAY_PUBLISH_ONLY_ID = "vinted-republisher-publish-only";
const REPUBLISH_BACKUP_PREFIX = "vinted_republish_backup_";
const REPUBLISH_BACKUP_INDEX_KEY = "vinted_republish_backup_index_v1";
const LAST_DIAGNOSTIC_KEY = "vinted_republisher_last_diagnostic_v1";
const SESSION_LOGS_KEY = "vinted_republisher_session_logs_v1";
const LAST_REPUBLISH_STATUS_KEY = "vinted_republisher_last_status_v1";
const LAST_BACKUP_KEY = "vinted_republisher_last_backup_key_v1";

window.__VINTED_REPUBLISHER_LOGS__ = window.__VINTED_REPUBLISHER_LOGS__ || [];
window.__VINTED_REPUBLISHER_LAST_BACKUP__ = window.__VINTED_REPUBLISHER_LAST_BACKUP__ || null;
window.__VINTED_REPUBLISHER_LAST_DIAGNOSTIC__ = window.__VINTED_REPUBLISHER_LAST_DIAGNOSTIC__ || null;
window.__VINTED_REPUBLISHER_OVERLAY_DISMISSED__ =
  window.__VINTED_REPUBLISHER_OVERLAY_DISMISSED__ || false;

function dismissOverlay() {
  window.__VINTED_REPUBLISHER_OVERLAY_DISMISSED__ = true;
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.remove();
}

function resetOverlayDismissState() {
  window.__VINTED_REPUBLISHER_OVERLAY_DISMISSED__ = false;
}

function ensureOverlay() {
  if (window.__VINTED_REPUBLISHER_OVERLAY_DISMISSED__) return null;
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
      <div style="font-weight:700;font-size:14px;">Vinted Republisher - Suivi en direct</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
        <button id="${OVERLAY_COPY_LOGS_ID}" style="font-size:11px;border:1px solid rgba(148,163,184,.5);background:#1e293b;color:#fff;border-radius:6px;padding:4px 7px;cursor:pointer;">Copier logs</button>
        <button id="${OVERLAY_COPY_BACKUP_ID}" style="font-size:11px;border:1px solid rgba(148,163,184,.5);background:#1e293b;color:#fff;border-radius:6px;padding:4px 7px;cursor:pointer;">Télécharger backup</button>
        <button id="vinted-republisher-import-backup" style="font-size:11px;border:1px solid rgba(148,163,184,.5);background:#1e293b;color:#fff;border-radius:6px;padding:4px 7px;cursor:pointer;">Importer backup</button>
        <button id="${OVERLAY_COPY_DIAGNOSTIC_ID}" style="font-size:11px;border:1px solid rgba(148,163,184,.5);background:#1e293b;color:#fff;border-radius:6px;padding:4px 7px;cursor:pointer;">Copier diag</button>
        <button id="${OVERLAY_CLOSE_ID}" title="Fermer le panneau" aria-label="Fermer le panneau" style="font-size:11px;border:1px solid rgba(148,163,184,.5);background:#1e293b;color:#fff;border-radius:6px;padding:4px 7px;cursor:pointer;">Fermer</button>
      </div>
    </div>
    <div id="${OVERLAY_STATUS_ID}" style="font-size:12px;color:#a5f3fc;margin-bottom:8px;">Initialisation...</div>
    <div id="${OVERLAY_ACTIONS_ID}" style="display:none;margin-bottom:8px;"></div>
    <div id="${OVERLAY_LOGS_ID}" style="max-height:220px;overflow:auto;font-size:12px;line-height:1.4;background:rgba(0,0,0,.18);padding:8px;border-radius:8px;"></div>
    <div style="margin-top:8px;font-size:11px;opacity:.75;">Backup local = infos + photos. En cas d’échec: Télécharger backup / restaurer.</div>
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
    const text = (window.__VINTED_REPUBLISHER_LOGS__ || []).join("\n");
    await navigator.clipboard.writeText(text);
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "latest.log";
      a.click();
      URL.revokeObjectURL(url);
      appendOverlayLog("success", "Logs copiés + téléchargés (dépose dans agent-inbox/latest.log)");
    } catch (_) {
      appendOverlayLog("success", "Logs copiés dans le presse-papiers");
    }
  });
  document.getElementById(OVERLAY_COPY_BACKUP_ID)?.addEventListener("click", async () => {
    const backup = await loadLatestFullBackup();
    if (!backup) {
      appendOverlayLog("warning", "Aucun backup disponible à télécharger");
      return;
    }
    await downloadBackupArchive(backup);
  });
  document.getElementById("vinted-republisher-import-backup")?.addEventListener("click", () => {
    openBackupImportPicker();
  });
  document.getElementById(OVERLAY_COPY_DIAGNOSTIC_ID)?.addEventListener("click", async () => {
    const diagnostic = window.__VINTED_REPUBLISHER_LAST_DIAGNOSTIC__;
    if (!diagnostic) {
      appendOverlayLog("warning", "Aucun diagnostic disponible à copier");
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
    appendOverlayLog("success", "Diagnostic complet copié dans le presse-papiers");
  });
  document.getElementById(OVERLAY_CLOSE_ID)?.addEventListener("click", () => {
    dismissOverlay();
  });
  return overlay;
}

function setOverlayStatus(text) {
  if (!ensureOverlay()) return;
  const status = document.getElementById(OVERLAY_STATUS_ID);
  if (status) status.textContent = text;
}

async function persistSessionLogs() {
  try {
    await chrome.storage.local.set({
      [SESSION_LOGS_KEY]: [...(window.__VINTED_REPUBLISHER_LOGS__ || [])],
    });
  } catch (_) {
    // ignore storage issues
  }
}

async function restoreSessionLogs() {
  try {
    const result = await chrome.storage.local.get(SESSION_LOGS_KEY);
    const saved = result[SESSION_LOGS_KEY];
    if (!Array.isArray(saved) || saved.length === 0) return;
    const current = window.__VINTED_REPUBLISHER_LOGS__ || [];
    const merged = [...saved];
    for (const line of current) {
      if (!merged.includes(line)) merged.push(line);
    }
    window.__VINTED_REPUBLISHER_LOGS__ = merged;
  } catch (_) {
    // ignore
  }
}

function appendOverlayLog(level, message) {
  const logLine = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  window.__VINTED_REPUBLISHER_LOGS__.push(logLine);
  // Keep photo-prep logs across navigation to /items/new.
  persistSessionLogs();
  if (!ensureOverlay()) return;
  const logs = document.getElementById(OVERLAY_LOGS_ID);
  if (!logs) return;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectFieldDiagnostic(labelText, selectors = []) {
  const container = typeof findFieldContainerByLabel === "function" ? findFieldContainerByLabel(labelText) : null;
  const values = {};
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (!el) continue;
      values[selector] = {
        value: String(el.value || ""),
        attrValue: String(el.getAttribute?.("value") || ""),
        text: String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
        checked: Boolean(el.checked),
        ariaSelected: el.getAttribute?.("aria-selected") || "",
        ariaChecked: el.getAttribute?.("aria-checked") || "",
      };
    } catch (_) {
      // Keep collecting other selectors.
    }
  }
  return {
    label: labelText,
    present: Boolean(container),
    rowText: container && typeof getVisibleText === "function"
      ? getVisibleText(container).replace(/\s+/g, " ").trim().slice(0, 600)
      : "",
    values,
  };
}

async function saveRepublisherDiagnostic(draft, engineResult, failed = [], validation = null) {
  const diagnostic = {
    version: 1,
    createdAt: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    status: failed.length > 0 || (validation && validation.ok === false) ? "failed" : "success",
    failedFields: failed.map((field) => ({
      fieldId: field.fieldId,
      reason: field.reason || null,
    })),
    validation: validation || null,
    draft: {
      itemId: draft?.itemId || null,
      backupId: draft?.backupId || null,
      title: draft?.title || "",
      price: draft?.price || "",
      category: draft?.category || "",
      catalogId: draft?.catalogId || null,
      catalogBranchTitles: draft?.catalogBranchTitles || [],
      brand: draft?.brand || "",
      brandId: draft?.brandId || null,
      size: draft?.size || "",
      sizeId: draft?.sizeId || null,
      condition: draft?.condition || "",
      statusId: draft?.statusId || null,
      colors: draft?.colors || [],
      colorIds: draft?.colorIds || [],
      material: draft?.material || "",
      packageSizeId: draft?.packageSizeId || null,
      imageCount: Array.isArray(draft?.files) ? draft.files.length : 0,
    },
    engineResult,
    detectedFields: typeof window.vintedInspectCurrentForm === "function"
      ? Array.from(window.vintedInspectCurrentForm())
      : [],
    fieldDiagnostics: {
      category: collectFieldDiagnostic("Catégorie", ["input#catalog", "input[name*='catalog']"]),
      brand: collectFieldDiagnostic("Marque", ["input#brand", "input[name*='brand']"]),
      size: collectFieldDiagnostic("Taille", ["input#size", "input[name*='size']"]),
      condition: collectFieldDiagnostic("État", ["input#status", "input[name*='status']"]),
      color: collectFieldDiagnostic("Couleur", ["input#color", "input[name*='color']"]),
      material: collectFieldDiagnostic("Matériau", ["input#material", "input[name*='material']"]),
      packageSize: collectFieldDiagnostic("Envoi", ["input[name*='package_size']", "input[id*='package_size']", "input[name*='packageSize']"]),
    },
    logs: [...(window.__VINTED_REPUBLISHER_LOGS__ || [])],
  };

  window.__VINTED_REPUBLISHER_LAST_DIAGNOSTIC__ = diagnostic;
  try {
    await chrome.storage.local.set({ [LAST_DIAGNOSTIC_KEY]: diagnostic });
  } catch (error) {
    appendOverlayLog("warning", `Diagnostic non sauvegardé: ${error.message || error}`);
  }
  return diagnostic;
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
  if (!element) return;
  const str = value == null ? "" : String(value);
  const lastValue = element.value;

  // Always prefer the REAL native setter — React overrides the instance setter.
  const inputProto = typeof window !== "undefined" && window.HTMLInputElement?.prototype;
  const textAreaProto = typeof window !== "undefined" && window.HTMLTextAreaElement?.prototype;
  const nativeSetter = inputProto
    ? Object.getOwnPropertyDescriptor(inputProto, "value")?.set
    : null;
  const textAreaSetter = textAreaProto
    ? Object.getOwnPropertyDescriptor(textAreaProto, "value")?.set
    : null;
  const setter =
    element.tagName === "TEXTAREA"
      ? textAreaSetter || nativeSetter
      : nativeSetter ||
        (element && Object.getPrototypeOf(element)
          ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set
          : null);

  if (setter) {
    setter.call(element, str);
  } else {
    element.value = str;
  }

  const tracker = element._valueTracker;
  if (tracker) {
    tracker.setValue(lastValue);
  }

  // React 17+ listens for InputEvent, not plain Event.
  try {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: str,
      })
    );
  } catch (_) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

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

function isZeroOrEmptyPrice(text) {
  const n = Number.parseFloat(normalizePrice(text));
  return !Number.isFinite(n) || n <= 0;
}

/** Format expected by Vinted FR price input (comma decimals). */
function formatPriceForVintedInput(price) {
  const normalized = normalizePrice(price);
  if (!normalized) return "";
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num) || num <= 0) return "";
  if (Math.abs(num - Math.round(num)) < 0.001) return String(Math.round(num));
  return num.toFixed(2).replace(".", ",");
}

function findVintedPriceInput() {
  const selectors = [
    'input[name="price"]',
    'input[id="price"]',
    'input[id*="price" i]',
    'input[data-testid*="price" i]',
    'input[name*="price" i]',
    'input[aria-label*="prix" i]',
    'input[aria-label*="price" i]',
    'input[placeholder*="prix" i]',
    'input[placeholder*="0,00"]',
    'input[inputmode="decimal"]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.isConnected && el.offsetParent !== null) return el;
      if (el && el.isConnected) return el;
    } catch (_) {
      // invalid selector in older engines — skip
    }
  }

  // Label-based: find short "Prix" label then nearest input.
  const nodes = Array.from(document.querySelectorAll("label, span, p, div, h2, h3, legend"));
  for (const label of nodes) {
    const text = normalizeComparableText(label.textContent || "");
    if (text !== "prix" && text !== "price" && text !== "prix €" && text !== "price €") continue;
    const container =
      label.closest("[class*='Cell'], [class*='cell'], [class*='Input'], section, div, li, fieldset") ||
      label.parentElement;
    if (!container) continue;
    const input = container.querySelector(
      'input[name*="price" i], input[id*="price" i], input[inputmode="decimal"], input[type="text"], input[type="number"], input'
    );
    if (input && input.isConnected) return input;
  }
  return null;
}

async function typeIntoInput(element, text) {
  const str = String(text ?? "");
  element.focus();
  element.click?.();
  await sleep(80);

  // Clear existing value (often "0") via native setter + InputEvent.
  setNativeInputValue(element, "");
  await sleep(60);

  // Character-by-character — closest to real typing for controlled React inputs.
  let acc = "";
  for (const ch of str) {
    acc += ch;
    setNativeInputValue(element, acc);
    try {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: ch, bubbles: true, cancelable: true })
      );
      element.dispatchEvent(
        new KeyboardEvent("keypress", { key: ch, bubbles: true, cancelable: true })
      );
      element.dispatchEvent(
        new KeyboardEvent("keyup", { key: ch, bubbles: true, cancelable: true })
      );
    } catch (_) {
      // ignore
    }
    await sleep(40);
  }

  try {
    const blurEvt = typeof FocusEvent !== "undefined"
      ? new FocusEvent("blur", { bubbles: true })
      : new Event("blur", { bubbles: true });
    element.dispatchEvent(blurEvt);
  } catch (_) {
    try {
      element.dispatchEvent(new Event("blur", { bubbles: true }));
    } catch (e) {
      // ignore
    }
  }
  element.blur?.();
  await sleep(120);
}

async function ensureDraftPriceFilled(draft) {
  const expected = normalizePrice(draft?.price);
  if (!expected || isZeroOrEmptyPrice(expected)) {
    return { success: false, reason: `Prix backup invalide: "${draft?.price || ""}"` };
  }
  const formatted = formatPriceForVintedInput(expected);
  if (!formatted) {
    return { success: false, reason: `Prix backup non formatable: "${draft?.price}"` };
  }

  const input = findVintedPriceInput();
  if (!input) {
    return { success: false, reason: "Champ Prix introuvable dans le formulaire" };
  }

  appendOverlayLog(
    "info",
    `Saisie prix: backup=${expected} → champ "${describeElement?.(input) || input.name || input.id || "input"}"`
  );

  // Pass 1: clear then type digits (fixes stuck "0").
  await typeIntoInput(input, formatted);
  let actualRaw = String(input.value || "").trim();
  if (pricesEqual(actualRaw, expected) && !isZeroOrEmptyPrice(actualRaw)) {
    return { success: true, value: actualRaw };
  }

  // Pass 2: hard overwrite + blur.
  input.focus();
  setNativeInputValue(input, formatted);
  await sleep(100);
  setNativeInputValue(input, formatted);
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  input.blur?.();
  await sleep(200);
  actualRaw = String(input.value || "").trim();
  if (pricesEqual(actualRaw, expected) && !isZeroOrEmptyPrice(actualRaw)) {
    return { success: true, value: actualRaw };
  }

  return {
    success: false,
    reason: `Prix toujours faux après saisie (attendu=${formatted}, lu=${actualRaw || "vide/0"})`,
  };
}

function readCurrentDraftPrice() {
  const input = findVintedPriceInput();
  return input ? String(input.value || "").trim() : "";
}

if (typeof window !== "undefined") {
  window.normalizePrice = normalizePrice;
  window.pricesEqual = pricesEqual;
  window.isZeroOrEmptyPrice = isZeroOrEmptyPrice;
  window.formatPriceForVintedInput = formatPriceForVintedInput;
  window.findVintedPriceInput = findVintedPriceInput;
  window.ensureDraftPriceFilled = ensureDraftPriceFilled;
  window.readCurrentDraftPrice = readCurrentDraftPrice;
  window.setNativeInputValue = setNativeInputValue;
}

function extractSizeFromText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const patterns = [
    /\b(?:taille|size)\s*[:\-]?\s*(XXS|XS|S|M|L|XL|XXL|XXXL)\b/i,
    /\b(?:taille|size)\s*[:\-]?\s*(\d{1,2}(?:[.,]5)?)\b/i,
    /\b(?:taille|size)\s*[:\-]?\s*([A-Z0-9][A-Z0-9 /.-]{0,12})\b/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const value = match?.[1]?.trim();
    if (value && !/^(cm|mm|kg|ans?|mois)$/i.test(value)) return value;
  }
  return "";
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

function parseIdFromHref(href, keys) {
  if (!href) return null;
  try {
    const url = new URL(href, "https://www.vinted.fr");
    for (const key of keys) {
      const multi = url.searchParams.getAll(`${key}[]`);
      const single = url.searchParams.get(key) || url.searchParams.get(`${key}s`);
      const candidate = multi[0] || single;
      if (candidate && /^\d+$/.test(String(candidate))) return parseInt(candidate, 10);
    }
    const pathMatch = String(href).match(new RegExp(`(?:${keys.join("|")})[=/](\\d+)`, "i"));
    if (pathMatch?.[1]) return parseInt(pathMatch[1], 10);
  } catch (_) {
    // ignore malformed href
  }
  return null;
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

  const brandLink = detailsRoot.querySelector('a[href*="brand_id"], a[href*="brand_ids"]');
  const sizeLink = detailsRoot.querySelector('a[href*="size_id"], a[href*="size_ids"]');
  const statusLink = detailsRoot.querySelector('a[href*="status_id"], a[href*="status_ids"]');
  const materialLink = detailsRoot.querySelector('a[href*="material_id"], a[href*="material_ids"]');

  const brand = (brandLink?.textContent || "").trim().replace(/Menu relatif.*$/i, "") || pickText('a[href*="brand_id"], a[href*="brand_ids"]');
  const size = (sizeLink?.textContent || "").trim().replace(/Menu relatif.*$/i, "");
  const condition = (statusLink?.textContent || "").trim().replace(/Menu relatif.*$/i, "") || pickText('a[href*="status_id"]');
  const material = (materialLink?.textContent || "").trim().replace(/Menu relatif.*$/i, "") || pickText('a[href*="material_id"], a[href*="material_ids"]');

  const brandId = parseIdFromHref(brandLink?.getAttribute("href") || brandLink?.href, ["brand_id", "brand_ids"]);
  const sizeId = parseIdFromHref(sizeLink?.getAttribute("href") || sizeLink?.href, ["size_id", "size_ids"]);
  const statusId = parseIdFromHref(statusLink?.getAttribute("href") || statusLink?.href, ["status_id", "status_ids"]);
  const materialId = parseIdFromHref(materialLink?.getAttribute("href") || materialLink?.href, ["material_id", "material_ids"]);

  // Fallback: scrape IDs from raw HTML when SPA markup hides detail links.
  const rawHtml = String(doc.documentElement?.innerHTML || doc.body?.innerHTML || "");
  const pickRawId = (key) => {
    const patterns = [
      new RegExp(`${key}(?:s)?(?:%5B%5D|\\\\?\\[\\]|\\[\\]|)=([0-9]+)`, "i"),
      new RegExp(`"${key}(?:s)?"\\s*:\\s*([0-9]+)`, "i"),
      new RegExp(`"${key}(?:s)?"\\s*:\\s*\\[\\s*([0-9]+)`, "i"),
    ];
    for (const re of patterns) {
      const m = rawHtml.match(re);
      if (m?.[1]) return parseInt(m[1], 10);
    }
    return null;
  };

  const colorLinks = Array.from(detailsRoot.querySelectorAll('a[href*="color_id"], a[href*="color_ids"]'));
  const colors = colorLinks
    .map((el) => (el.textContent || "").trim())
    .filter(Boolean);
  const colorIds = colorLinks
    .map((el) => parseIdFromHref(el.getAttribute("href") || el.href, ["color_id", "color_ids"]))
    .filter((id) => Number.isFinite(id));

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
        "taille",
        "size",
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
  const rowSize = rowMap["taille"] || rowMap["size"] || "";
  const rowColors = (rowMap["couleur"] || "")
    .split(/[,/]| et /i)
    .map((x) => x.trim())
    .filter(Boolean);

  let category = "";
  let catalogBranchTitles = [];
  const breadcrumbLinks = Array.from(
    doc.querySelectorAll(
      '[data-testid="item-breadcrumbs"] a, nav[aria-label="breadcrumb"] a, .breadcrumbs a, [data-testid="breadcrumbs"] a'
    )
  );
  if (breadcrumbLinks.length) {
    const nonHome = breadcrumbLinks.filter((a) => ((a.textContent || "").trim().toLowerCase() !== "accueil"));
    category = (nonHome[nonHome.length - 1] || breadcrumbLinks[breadcrumbLinks.length - 1])?.textContent?.trim() || "";
    catalogBranchTitles = nonHome.map((a) => (a.textContent || "").trim()).filter(Boolean);
  }

  return {
    brand: brand || rowBrand,
    condition: condition || rowCondition,
    material: material || rowMaterial,
    size: size || rowSize,
    colors: Array.from(new Set([...(colors || []), ...rowColors])),
    category: category || rowCategory,
    catalogBranchTitles,
    brandId: brandId || pickRawId("brand_id"),
    sizeId: sizeId || pickRawId("size_id"),
    statusId: statusId || pickRawId("status_id"),
    materialId: materialId || pickRawId("material_id"),
    colorIds: colorIds.length ? colorIds : [],
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

    const firstNumber = (...keys) => {
      for (const key of keys) {
        const vals = valuesByKey.get(key.toLowerCase()) || [];
        for (const raw of vals) {
          if (/^\d+$/.test(String(raw))) return parseInt(raw, 10);
        }
      }
      return null;
    };

    return {
      brand: first("brand", "brand_title"),
      condition: first("status", "status_title", "condition"),
      material: first("material", "material_title", "composition"),
      size: first("size", "size_title"),
      colors: collect("color", "colour", "color_title", "colour_title"),
      category: first("catalog_title", "category", "catalog_branch_title"),
      brandId: firstNumber("brand_id"),
      sizeId: firstNumber("size_id"),
      statusId: firstNumber("status_id"),
      catalogId: firstNumber("catalog_id"),
      packageSizeId: firstNumber("package_size_id"),
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
    doc.querySelector('[data-testid="item-price"]')?.textContent?.trim() ||
    doc.querySelector(".item-price")?.textContent?.trim() ||
    "";
  // Never use buyer-protection total (aria-label "26,95 € Protection…") as seller price.

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
    size: linkedAttributes.size || details["taille"] || nextData.size || extractSizeFromText(description) || "",
    category: linkedAttributes.category || details["catégorie"] || details["categorie"] || nextData.category || jsonLd.category || "",
    catalogBranchTitles: linkedAttributes.catalogBranchTitles || [],
    catalogId: nextData.catalogId || null,
    brandId: linkedAttributes.brandId || nextData.brandId || null,
    statusId: linkedAttributes.statusId || nextData.statusId || null,
    sizeId: linkedAttributes.sizeId || nextData.sizeId || null,
    colorIds: Array.isArray(linkedAttributes.colorIds) ? linkedAttributes.colorIds : [],
    packageSizeId: nextData.packageSizeId || null,
    imageUrls,
  };

  // Strip Vinted internal prefixes like "ATM T-shirts" → "T-shirts"
  item.category = normalizeCategoryForForm(item.category, item.brand) || item.category;

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
      `HTML: ${item.imageUrls.length} photo(s) · marque=${item.brand || "?"} (id=${item.brandId || "—"}) · taille=${item.size || "?"} (id=${item.sizeId || "—"}) · état=${item.condition || "?"} (id=${item.statusId || "—"}) · couleur=${(item.colors || []).join("/") || "?"} · matière=${item.material || "?"}`
    );
    return item;
  }

  // Parse photos: API returns photo objects with full_size_url / url
  const photos = Array.isArray(apiItem.photos) ? apiItem.photos : [];
  const imageUrls = photos
    .map((photo) => photo?.full_size_url || photo?.url || photo?.image?.url || "")
    .filter(Boolean)
    .filter((src, idx, all) => all.indexOf(src) === idx);

  // Parse price — prefer seller amount, never buyer-protection total.
  const priceRaw =
    apiItem.price?.amount ??
    apiItem.original_price_numeric ??
    apiItem.price_numeric ??
    (typeof apiItem.price === "string" || typeof apiItem.price === "number"
      ? apiItem.price
      : "") ??
    "";
  const price = normalizePrice(priceRaw);

  // Brand
  const brand = apiItem.brand_dto?.title || apiItem.brand || apiItem.brand_title || "";
  const brandId =
    apiItem.brand_id ||
    apiItem.brand_dto?.id ||
    apiItem.brandId ||
    null;

  // Status / condition
  const condition = apiItem.status || apiItem.status_dto?.title || "";
  const statusId =
    apiItem.status_id ||
    apiItem.status_dto?.id ||
    apiItem.statusId ||
    null;

  // Size
  const size = apiItem.size_title || apiItem.size || apiItem.size_dto?.title || extractSizeFromText(apiItem.description || "");
  const sizeId =
    apiItem.size_id ||
    apiItem.size_dto?.id ||
    apiItem.sizeId ||
    null;

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
    catalogBranchTitles: Array.isArray(apiItem.catalog_branch_titles) ? apiItem.catalog_branch_titles : [],
    brandId,
    statusId,
    sizeId,
    colorIds: apiItem.color_ids || (Array.isArray(apiItem.colors) ? apiItem.colors.map((c) => c?.id).filter(Boolean) : []),
    packageSizeId: apiItem.package_size_id || null,
    imageUrls,
  };

  item.category = normalizeCategoryForForm(item.category, item.brand) || item.category;

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
    `API: ${item.imageUrls.length} photo(s) · marque=${item.brand || "?"} (id=${item.brandId || "—"}) · taille=${item.size || "?"} (id=${item.sizeId || "—"}) · état=${item.condition || "?"} (id=${item.statusId || "—"}) · couleur=${colors.join("/") || "?"} · matière=${item.material || "?"}`
  );

  return item;
}

async function saveRepublishBackup(item, photoBundle) {
  const originals = Array.isArray(photoBundle?.originals) ? photoBundle.originals : [];
  const prepared = Array.isArray(photoBundle?.prepared) ? photoBundle.prepared : [];
  const originalWithData = originals.filter((p) => p?.dataUrl);
  const preparedWithData = prepared.filter((p) => p?.dataUrl);

  if (!originalWithData.length && !preparedWithData.length) {
    throw new Error("Backup refusé: aucune photo binaire à conserver");
  }

  const storageKey = `${REPUBLISH_BACKUP_PREFIX}${item.itemId}`;
  const backup = {
    version: 2,
    backupId: `${item.itemId}_${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: "vinted-republisher",
    storageKey,
    item: { ...item },
    photos: {
      originalCount: originalWithData.length,
      preparedCount: preparedWithData.length,
      // Full binary payloads — kept until explicit success / manual clear.
      originals: originalWithData,
      prepared: preparedWithData,
    },
    // Backward-compatible summary (no binaries) for older tooling.
    preparedFiles: preparedWithData.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size || Math.round(String(file.dataUrl || "").length * 0.75),
      hasDataUrl: true,
    })),
    lifecycle: {
      status: "READY",
      updatedAt: new Date().toISOString(),
      draftUrl: null,
      publishedUrl: null,
      retainUntilDone: true,
      note: "Full listing + photos retained for recovery if delete/publish fails",
    },
    safety: {
      originalUrl: item.originalUrl,
      originalItemId: item.itemId,
      requiredFieldsPresent: item.backupIntegrity,
      deleteOriginalAllowed: false,
      publishNewAllowed: false,
      photosRecoverable: preparedWithData.length > 0 || originalWithData.length > 0,
      reason: "Manual verification required before destructive actions",
    },
  };

  await chrome.storage.local.set({
    [storageKey]: backup,
    [LAST_BACKUP_KEY]: storageKey,
  });

  const indexResult = await chrome.storage.local.get(REPUBLISH_BACKUP_INDEX_KEY);
  const index = Array.isArray(indexResult[REPUBLISH_BACKUP_INDEX_KEY])
    ? indexResult[REPUBLISH_BACKUP_INDEX_KEY]
    : [];
  const nextIndex = [
    {
      storageKey,
      backupId: backup.backupId,
      itemId: item.itemId,
      title: item.title,
      price: item.price || "",
      brand: item.brand || "",
      size: item.size || "",
      condition: item.condition || "",
      category: item.category || "",
      thumbnail: (preparedWithData[0]?.dataUrl || originalWithData[0]?.dataUrl || item.imageUrls?.[0] || ""),
      createdAt: backup.createdAt,
      photoCount: Math.max(originalWithData.length, preparedWithData.length),
      status: "SAVED",
    },
    ...index.filter((entry) => entry.storageKey !== storageKey),
  ].slice(0, 100);
  await chrome.storage.local.set({ [REPUBLISH_BACKUP_INDEX_KEY]: nextIndex });

  window.__VINTED_REPUBLISHER_LAST_BACKUP__ = backup;
  appendOverlayLog(
    "success",
    `Backup SAFE sauvegardé (${backup.backupId}) — infos + ${originalWithData.length} originale(s) + ${preparedWithData.length} photo(s) modifiée(s)`
  );
  appendOverlayLog(
    backup.safety.requiredFieldsPresent.isSafeToProceed ? "success" : "warning",
    `Intégrité backup: titre=${backup.safety.requiredFieldsPresent.hasTitle}, prix=${backup.safety.requiredFieldsPresent.hasPrice}, photos=${backup.safety.requiredFieldsPresent.imageCount}`
  );
  return backup;
}

async function loadLatestFullBackup(itemId = null) {
  if (window.__VINTED_REPUBLISHER_LAST_BACKUP__?.photos?.prepared?.length ||
      window.__VINTED_REPUBLISHER_LAST_BACKUP__?.photos?.originals?.length) {
    if (!itemId || String(window.__VINTED_REPUBLISHER_LAST_BACKUP__?.item?.itemId) === String(itemId)) {
      return window.__VINTED_REPUBLISHER_LAST_BACKUP__;
    }
  }
  try {
    if (itemId) {
      const key = `${REPUBLISH_BACKUP_PREFIX}${itemId}`;
      const result = await chrome.storage.local.get(key);
      if (result[key]) {
        window.__VINTED_REPUBLISHER_LAST_BACKUP__ = result[key];
        return result[key];
      }
    }
    const pointer = await chrome.storage.local.get(LAST_BACKUP_KEY);
    const key = pointer[LAST_BACKUP_KEY];
    if (key) {
      const result = await chrome.storage.local.get(key);
      if (result[key]) {
        window.__VINTED_REPUBLISHER_LAST_BACKUP__ = result[key];
        return result[key];
      }
    }
  } catch (_) {
    // ignore
  }
  return window.__VINTED_REPUBLISHER_LAST_BACKUP__ || null;
}

async function updateBackupLifecycle(itemId, patch = {}) {
  if (!itemId) return null;
  const key = `${REPUBLISH_BACKUP_PREFIX}${itemId}`;
  try {
    const result = await chrome.storage.local.get(key);
    const backup = result[key];
    if (!backup) return null;
    backup.lifecycle = {
      ...(backup.lifecycle || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
      retainUntilDone: patch.retainUntilDone !== false,
    };
    await chrome.storage.local.set({ [key]: backup, [LAST_BACKUP_KEY]: key });
    window.__VINTED_REPUBLISHER_LAST_BACKUP__ = backup;

    const indexResult = await chrome.storage.local.get(REPUBLISH_BACKUP_INDEX_KEY);
    const index = Array.isArray(indexResult[REPUBLISH_BACKUP_INDEX_KEY])
      ? indexResult[REPUBLISH_BACKUP_INDEX_KEY]
      : [];
    const nextIndex = index.map((entry) =>
      entry.storageKey === key
        ? { ...entry, status: backup.lifecycle.status || entry.status }
        : entry
    );
    await chrome.storage.local.set({ [REPUBLISH_BACKUP_INDEX_KEY]: nextIndex });
    return backup;
  } catch (_) {
    return null;
  }
}

function backupHasRecoverablePhotos(backup) {
  const prepared = backup?.photos?.prepared?.filter((p) => p?.dataUrl) || [];
  const originals = backup?.photos?.originals?.filter((p) => p?.dataUrl) || [];
  return prepared.length > 0 || originals.length > 0;
}

function backupRecoveryFiles(backup) {
  const prepared = (backup?.photos?.prepared || []).filter((p) => p?.dataUrl);
  if (prepared.length) return prepared;
  return (backup?.photos?.originals || []).filter((p) => p?.dataUrl);
}

async function downloadBackupArchive(backup) {
  const photoCount =
    (backup?.photos?.prepared?.length || 0) + (backup?.photos?.originals?.length || 0);
  const payload = {
    ...backup,
    exportedAt: new Date().toISOString(),
    exportNote:
      "Backup complet Vinted Republisher: métadonnées + dataUrls photos (originales et/ou modifiées). Conservez ce fichier hors navigateur.",
  };
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vinted-backup-${backup.backupId || backup.item?.itemId || "unknown"}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // Also dump each photo as a standalone JPEG for human recovery.
  const files = backupRecoveryFiles(backup);
  for (const [index, file] of files.entries()) {
    try {
      const imgBlob = dataUrlToBlob(file.dataUrl);
      const imgUrl = URL.createObjectURL(imgBlob);
      const imgA = document.createElement("a");
      imgA.href = imgUrl;
      imgA.download = file.name || `vinted-backup-photo-${index + 1}.jpg`;
      imgA.click();
      URL.revokeObjectURL(imgUrl);
      await sleep(120);
    } catch (_) {
      // continue other photos
    }
  }

  appendOverlayLog(
    "success",
    `Backup téléchargé (JSON + ${files.length}/${Math.max(photoCount, files.length)} photo(s)) — garde-le hors navigateur`
  );

  // Metadata-only clipboard (binaries too large for clipboard reliability).
  try {
    const metaOnly = {
      backupId: backup.backupId,
      createdAt: backup.createdAt,
      item: backup.item,
      lifecycle: backup.lifecycle,
      safety: backup.safety,
      photoCounts: {
        originals: backup.photos?.originalCount || 0,
        prepared: backup.photos?.preparedCount || 0,
      },
    };
    await navigator.clipboard.writeText(JSON.stringify(metaOnly, null, 2));
  } catch (_) {
    // ignore clipboard failures
  }
}

function openBackupImportPicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json,image/*";
  input.multiple = true;
  input.style.display = "none";
  input.addEventListener("change", async () => {
    try {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      appendOverlayLog("info", `Import backup: ${files.length} fichier(s)…`);
      const backup = await buildBackupFromBrowserFiles(files);
      await importBackupObjectAndRestore(backup);
    } catch (error) {
      appendOverlayLog("error", error.message || "Import backup échoué");
    } finally {
      input.remove();
    }
  });
  document.body.appendChild(input);
  input.click();
}

async function buildBackupFromBrowserFiles(files) {
  const jsonFile = files.find(
    (f) => f.type.includes("json") || /\.json$/i.test(f.name) || /^vinted-backup/i.test(f.name)
  );
  const imageFiles = files
    .filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (!jsonFile) {
    throw new Error("Sélectionne le JSON du backup (vinted-backup-….json)");
  }

  let backup;
  try {
    backup = JSON.parse(await jsonFile.text());
  } catch (_) {
    throw new Error("JSON backup illisible");
  }
  if (!backup?.item) {
    throw new Error("JSON invalide: champ item manquant");
  }

  const hasPrepared = Array.isArray(backup.photos?.prepared) && backup.photos.prepared.some((p) => p?.dataUrl);
  const hasOriginals = Array.isArray(backup.photos?.originals) && backup.photos.originals.some((p) => p?.dataUrl);

  if (!hasPrepared && !hasOriginals) {
    if (!imageFiles.length) {
      throw new Error("JSON sans photos — ajoute aussi les JPEG téléchargés");
    }
    const prepared = [];
    for (let i = 0; i < imageFiles.length; i++) {
      prepared.push({
        index: i,
        name: imageFiles[i].name,
        type: imageFiles[i].type || "image/jpeg",
        dataUrl: await fileToDataUrl(imageFiles[i]),
      });
    }
    backup.photos = {
      originalCount: 0,
      preparedCount: prepared.length,
      originals: [],
      prepared,
    };
  }

  return backup;
}

async function importBackupObjectAndRestore(backup) {
  if (!backupHasRecoverablePhotos(backup)) {
    throw new Error("Backup sans photos binaires");
  }
  const item = { ...(backup.item || {}) };
  if (!item.itemId) {
    item.itemId = String(backup.backupId || "").split("_")[0] || `import_${Date.now()}`;
  }
  item.category = normalizeCategoryForForm(item.category, item.brand) || item.category;

  const storageKey = `${REPUBLISH_BACKUP_PREFIX}${item.itemId}`;
  const photos = backupRecoveryFiles(backup);
  const nextBackup = {
    ...backup,
    version: backup.version || 2,
    backupId: backup.backupId || `${item.itemId}_${Date.now()}`,
    storageKey,
    item,
    lifecycle: {
      ...(backup.lifecycle || {}),
      status: "IMPORTED",
      updatedAt: new Date().toISOString(),
      retainUntilDone: true,
      note: "Imported from file via overlay",
    },
    safety: {
      ...(backup.safety || {}),
      deleteOriginalAllowed: false,
      publishNewAllowed: false,
      photosRecoverable: true,
      reason: "Imported backup — destructive actions require fresh confirm",
    },
  };

  await chrome.storage.local.set({
    [storageKey]: nextBackup,
    [LAST_BACKUP_KEY]: storageKey,
    [PENDING_DOM_DRAFT_KEY]: {
      ...item,
      backupId: nextBackup.backupId,
      preparedAt: Date.now(),
      restoredFromBackup: true,
      importedFromFile: true,
      settings: {
        allowDestructiveRepublish: false,
        autoSave: true,
        autoPublishAfterSave: true,
        imageSettings: null,
      },
      files: photos.map((file, index) => ({
        name: file.name || `vinted_restore_${index}.jpg`,
        type: file.type || "image/jpeg",
        dataUrl: file.dataUrl,
      })),
    },
  });
  window.__VINTED_REPUBLISHER_LAST_BACKUP__ = nextBackup;
  appendOverlayLog(
    "success",
    `Backup importé (${nextBackup.backupId}, ${photos.length} photo(s)) — auto-publish après save`
  );
  window.location.href = "https://www.vinted.fr/items/new";
}

async function restoreDraftFromBackup(itemId) {
  const backup = await loadLatestFullBackup(itemId);
  if (!backup?.item) {
    throw new Error("Backup introuvable pour restauration");
  }
  if (!backupHasRecoverablePhotos(backup)) {
    throw new Error("Backup sans photos binaires — restauration impossible");
  }
  const files = backupRecoveryFiles(backup).map((file, index) => ({
    name: file.name || `vinted_restore_${index}.jpg`,
    type: file.type || "image/jpeg",
    dataUrl: file.dataUrl,
  }));
  await chrome.storage.local.set({
    [PENDING_DOM_DRAFT_KEY]: {
      ...backup.item,
      backupId: backup.backupId,
      preparedAt: Date.now(),
      restoredFromBackup: true,
      settings: {
        allowDestructiveRepublish: false,
        autoSave: true,
        autoPublishAfterSave: true,
        imageSettings: null,
      },
      files,
    },
  });
  await updateBackupLifecycle(backup.item.itemId, {
    status: "RESTORING",
    note: "User restored draft from local full backup — will auto-publish after save",
  });
  appendOverlayLog(
    "warning",
    `Restauration depuis backup ${backup.backupId} (${files.length} photo(s)) — publication auto après sauvegarde`
  );
  window.location.href = "https://www.vinted.fr/items/new";
}

function showBackupRecoveryActions(itemId, { draftUrl = null, reason = "" } = {}) {
  ensureOverlay();
  const actions = document.getElementById(OVERLAY_ACTIONS_ID);
  if (!actions) return;
  actions.style.display = "block";
  actions.innerHTML = "";

  const publishBtn = document.createElement("button");
  publishBtn.id = OVERLAY_PUBLISH_ONLY_ID;
  publishBtn.type = "button";
  publishBtn.textContent = "Publier ce brouillon automatiquement";
  Object.assign(publishBtn.style, {
    width: "100%",
    marginBottom: "6px",
    fontSize: "13px",
    fontWeight: "700",
    border: "1px solid rgba(74,222,128,.8)",
    background: "#15803d",
    color: "#fff",
    borderRadius: "8px",
    padding: "10px 12px",
    cursor: "pointer",
  });
  publishBtn.addEventListener("click", () => {
    publishBtn.disabled = true;
    publishBtn.textContent = "Publication en cours…";
    beginPublishOnly({
      draftUrl: draftUrl || window.location.href,
      title: window.__VINTED_REPUBLISHER_LAST_BACKUP__?.item?.title || "",
      originalItemId: itemId,
      backupId: window.__VINTED_REPUBLISHER_LAST_BACKUP__?.backupId || null,
    }).catch((error) => {
      appendOverlayLog("error", error.message || "Publication auto échouée");
      publishBtn.disabled = false;
      publishBtn.textContent = "Réessayer publication automatique";
    });
  });
  actions.appendChild(publishBtn);

  if (draftUrl) {
    const draftBtn = document.createElement("button");
    draftBtn.type = "button";
    draftBtn.textContent = "Ouvrir brouillon Vinted";
    Object.assign(draftBtn.style, {
      width: "100%",
      marginBottom: "6px",
      fontSize: "12px",
      fontWeight: "600",
      border: "1px solid rgba(125,211,252,.7)",
      background: "#0369a1",
      color: "#fff",
      borderRadius: "8px",
      padding: "8px 10px",
      cursor: "pointer",
    });
    draftBtn.addEventListener("click", () => {
      window.location.href = draftUrl;
    });
    actions.appendChild(draftBtn);
  }

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.textContent = "Télécharger backup complet (infos + photos)";
  Object.assign(downloadBtn.style, {
    width: "100%",
    marginBottom: "6px",
    fontSize: "12px",
    fontWeight: "600",
    border: "1px solid rgba(148,163,184,.6)",
    background: "#1e293b",
    color: "#fff",
    borderRadius: "8px",
    padding: "8px 10px",
    cursor: "pointer",
  });
  downloadBtn.addEventListener("click", async () => {
    const backup = await loadLatestFullBackup(itemId);
    if (!backup) {
      appendOverlayLog("error", "Backup introuvable en storage");
      return;
    }
    await downloadBackupArchive(backup);
  });
  actions.appendChild(downloadBtn);

  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.textContent = "Recréer un brouillon depuis le backup local";
  Object.assign(restoreBtn.style, {
    width: "100%",
    fontSize: "12px",
    fontWeight: "600",
    border: "1px solid rgba(250,204,21,.7)",
    background: "#a16207",
    color: "#fff",
    borderRadius: "8px",
    padding: "8px 10px",
    cursor: "pointer",
  });
  restoreBtn.addEventListener("click", () => {
    restoreBtn.disabled = true;
    restoreDraftFromBackup(itemId).catch((error) => {
      appendOverlayLog("error", error.message || "Restauration échouée");
      restoreBtn.disabled = false;
    });
  });
  actions.appendChild(restoreBtn);

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.textContent = "Importer un backup téléchargé (JSON)";
  Object.assign(importBtn.style, {
    width: "100%",
    marginTop: "6px",
    fontSize: "12px",
    fontWeight: "600",
    border: "1px solid rgba(148,163,184,.6)",
    background: "#334155",
    color: "#fff",
    borderRadius: "8px",
    padding: "8px 10px",
    cursor: "pointer",
  });
  importBtn.addEventListener("click", () => openBackupImportPicker());
  actions.appendChild(importBtn);

  if (reason) {
    appendOverlayLog("error", `Récupération disponible: ${reason}`);
  }
  appendOverlayLog(
    "warning",
    "CRITIQUE: infos + photos restent en storage local — tu peux publier auto (vert) ou télécharger le backup"
  );
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

async function unlockBackupDestructiveFlags(itemId, allowed) {
  if (!itemId) return;
  const key = `${REPUBLISH_BACKUP_PREFIX}${itemId}`;
  try {
    const result = await chrome.storage.local.get(key);
    const backup = result[key];
    if (!backup) return;
    backup.safety = {
      ...(backup.safety || {}),
      deleteOriginalAllowed: Boolean(allowed),
      publishNewAllowed: Boolean(allowed),
      photosRecoverable: backupHasRecoverablePhotos(backup),
      reason: allowed
        ? "User confirmed destructive republish from overlay"
        : "Manual verification required before destructive actions",
    };
    await chrome.storage.local.set({ [key]: backup, [LAST_BACKUP_KEY]: key });
    window.__VINTED_REPUBLISHER_LAST_BACKUP__ = backup;
  } catch (_) {
    // ignore
  }
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

async function startSafeDomDraft(itemId, scannedItem = null, settings = {}) {
  resetOverlayDismissState();
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

  const originals = [];
  const prepared = [];
  const imageSettings = ImageProcessor?.defaultSettings
    ? ImageProcessor.defaultSettings(settings?.imageSettings || {})
    : {
        enabled: true,
        cropPercentage: 4,
        rotationAngle: 0.6,
        qualityReduction: 6,
        addNoise: true,
        ...(settings?.imageSettings || {}),
      };
  const useAdvancedProcessing =
    imageSettings.enabled !== false && typeof window.ImageProcessor === "function";

  if (useAdvancedProcessing) {
    appendOverlayLog(
      "info",
      `Anti-détection photos ON (crop=${imageSettings.cropPercentage}%, rot=${imageSettings.rotationAngle}°, q-${imageSettings.qualityReduction}%, noise=${imageSettings.addNoise !== false})`
    );
  } else {
    appendOverlayLog("warning", "Anti-détection photos OFF — les photos resteront identiques à l'originale");
  }

  let processedCount = 0;
  for (let i = 0; i < item.imageUrls.length; i++) {
    appendOverlayLog("info", `Préparation photo ${i + 1}/${item.imageUrls.length}`);
    try {
      const sourceUrl = item.imageUrls[i];
      const originalDataUrl = await downloadImageDataUrl(sourceUrl);
      originals.push({
        index: i,
        sourceUrl,
        name: `vinted_original_${item.itemId}_${i}.jpg`,
        type: "image/jpeg",
        dataUrl: originalDataUrl,
        size: Math.round(String(originalDataUrl || "").length * 0.75),
      });

      let modifiedDataUrl = originalDataUrl;
      if (useAdvancedProcessing) {
        try {
          const processor = new window.ImageProcessor();
          const beforeLen = String(originalDataUrl || "").length;
          modifiedDataUrl = await processor.modifyImage(originalDataUrl, imageSettings, { index: i });
          const afterLen = String(modifiedDataUrl || "").length;
          if (afterLen > 100 && afterLen !== beforeLen) {
            processedCount += 1;
          } else {
            appendOverlayLog("warning", `Photo ${i + 1}: modification douteuse (taille inchangée)`);
          }
        } catch (procError) {
          appendOverlayLog("warning", `Filtres ignorés pour la photo ${i + 1}: ${procError.message}`);
          modifiedDataUrl = originalDataUrl;
        }
      }

      const uploadFile = await makeUploadFile(modifiedDataUrl, i);
      const preparedDataUrl = await fileToDataUrl(uploadFile);
      prepared.push({
        index: i,
        sourceUrl,
        name: uploadFile.name,
        type: uploadFile.type || "image/jpeg",
        dataUrl: preparedDataUrl,
        size: uploadFile.size || Math.round(String(preparedDataUrl || "").length * 0.75),
      });
    } catch (error) {
      appendOverlayLog("warning", `Photo ${i + 1} ignorée: ${error.message}`);
    }
  }
  if (useAdvancedProcessing) {
    appendOverlayLog(
      processedCount > 0 ? "success" : "warning",
      `Photos modifiées: ${processedCount}/${prepared.length}`
    );
  }

  if (!prepared.length && !originals.length) {
    throw new Error("Aucune photo téléchargée — backup impossible, arrêt pour sécurité");
  }

  const backup = await saveRepublishBackup(item, { originals, prepared });
  const draftFiles = (prepared.length ? prepared : originals).map((file) => ({
    name: file.name,
    type: file.type,
    dataUrl: file.dataUrl,
  }));

  await chrome.storage.local.set({
    [PENDING_DOM_DRAFT_KEY]: {
      ...item,
      backupId: backup.backupId,
      preparedAt: Date.now(),
      settings: {
        allowDestructiveRepublish: Boolean(settings?.allowDestructiveRepublish),
        autoSave: settings?.autoSave !== false,
        imageSettings: settings?.imageSettings || null,
      },
      files: draftFiles,
    },
  });

  appendOverlayLog("info", "Ouverture de la page de création Vinted...");
  window.location.href = "https://www.vinted.fr/items/new";
}

/**
 * Sauvegarde complète d'une annonce dans le Coffre-fort local.
 * Télécharge toutes les photos haute résolution en local (base64 DataURL),
 * extrait l'ensemble des métadonnées et caractéristiques,
 * et sécurise l'annonce sans risque pour reprise ultérieure.
 */
async function saveItemToVault(targetItemId = null, scannedItem = null, options = {}) {
  const itemId = String(targetItemId || extractItemIdFromUrl(window.location.href) || "").trim();
  if (!itemId) {
    throw new Error("Identifiant de l'annonce introuvable.");
  }

  ensureOverlay();
  setOverlayStatus("Sauvegarde Coffre-fort");
  appendOverlayLog("info", `Extraction de l'annonce #${itemId} pour le Coffre-fort...`);

  const item = await extractItemForDomDraft(itemId);
  if (scannedItem?.title && (!item.title || item.title.startsWith("Article #"))) item.title = scannedItem.title;
  if (scannedItem?.price && !item.price) item.price = normalizePrice(scannedItem.price);

  appendOverlayLog("info", `Téléchargement des ${item.imageUrls.length} photos en haute résolution...`);

  const originals = [];
  const prepared = [];

  const imageSettings = ImageProcessor?.defaultSettings
    ? ImageProcessor.defaultSettings(options?.imageSettings || {})
    : { enabled: true, cropPercentage: 4, rotationAngle: 0.6, qualityReduction: 6, addNoise: true };

  const useMods = options.applyImageMods !== false && typeof window.ImageProcessor === "function";

  for (let i = 0; i < item.imageUrls.length; i++) {
    try {
      const sourceUrl = item.imageUrls[i];
      const originalDataUrl = await downloadImageDataUrl(sourceUrl);
      originals.push({
        index: i,
        sourceUrl,
        name: `vinted_vault_${item.itemId}_${i}.jpg`,
        type: "image/jpeg",
        dataUrl: originalDataUrl,
        size: Math.round(String(originalDataUrl || "").length * 0.75),
      });

      if (useMods) {
        try {
          const processor = new window.ImageProcessor();
          const modifiedDataUrl = await processor.modifyImage(originalDataUrl, imageSettings, { index: i });
          prepared.push({
            index: i,
            sourceUrl,
            name: `vinted_mod_${item.itemId}_${i}.jpg`,
            type: "image/jpeg",
            dataUrl: modifiedDataUrl,
            size: Math.round(String(modifiedDataUrl || "").length * 0.75),
          });
        } catch (_) {
          // fallback quietly
        }
      }
    } catch (err) {
      appendOverlayLog("warning", `Photo ${i + 1} erreur téléchargement: ${err.message}`);
    }
  }

  if (!originals.length && !prepared.length) {
    throw new Error("Impossible de télécharger les photos de l'annonce.");
  }

  const backup = await saveRepublishBackup(item, { originals, prepared: prepared.length ? prepared : originals });
  appendOverlayLog("success", `✅ Annonce #${itemId} "${item.title}" archivée dans le Coffre-fort !`);
  setOverlayStatus("Sauvegardée dans le Coffre-fort");

  return {
    success: true,
    itemId: item.itemId,
    title: item.title,
    price: item.price,
    brand: item.brand,
    size: item.size,
    backupId: backup.backupId,
    photoCount: Math.max(originals.length, prepared.length),
    item,
  };
}

async function resolveMissingDraftIds(draft) {
  if (!draft || typeof draft !== "object") return draft;
  const headers = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };

  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const matchByTitle = (entries, target, keys = ["title", "name", "code"], { strict = false } = {}) => {
    const targetNorm = normalize(target);
    if (!targetNorm || !Array.isArray(entries)) return null;
    const tokens = targetNorm
      .split(/[\/|,·•\-]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const scored = entries
      .map((entry) => {
        const labels = keys.map((k) => normalize(entry?.[k])).filter(Boolean);
        let score = 0;
        for (const label of labels) {
          if (label === targetNorm) {
            score = Math.max(score, 100);
            continue;
          }
          const labelTokens = label
            .split(/[\/|,·•\-]+/)
            .map((t) => t.trim())
            .filter(Boolean);

          // Compound sizes: require all tokens present in the candidate label.
          if (tokens.length > 1 && labelTokens.length > 0) {
            const hit = tokens.filter((tok) => labelTokens.includes(tok) || label.includes(tok)).length;
            if (hit === tokens.length && Math.abs(labelTokens.length - tokens.length) <= 1) {
              score = Math.max(score, 95);
              continue;
            }
          }

          // Avoid matching "S" against "S / 36 / 8" (prefix on short labels).
          if (label.length >= 3 && (label.startsWith(`${targetNorm} `) || targetNorm.startsWith(`${label} `))) {
            score = Math.max(score, 70);
          } else if (!strict && label.length >= 3 && (label.includes(targetNorm) || targetNorm.includes(label))) {
            score = Math.max(score, 40);
          }
        }
        return { entry, score };
      })
      .filter((x) => x.score >= (strict ? 90 : 40))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.entry || null;
  };

  // Brand ID via search endpoint (preferred) then full list fallback.
  if (!draft.brandId && draft.brand) {
    try {
      const searchUrl = `https://www.vinted.fr/api/v2/brands?search_text=${encodeURIComponent(draft.brand)}&page=1&per_page=20`;
      let brands = [];
      const searchResp = await fetch(searchUrl, { credentials: "include", headers });
      if (searchResp.ok) {
        const data = await searchResp.json();
        brands = data?.brands || data?.items || [];
      }
      if (!brands.length) {
        const listResp = await fetch("https://www.vinted.fr/api/v2/brands", { credentials: "include", headers });
        if (listResp.ok) {
          const data = await listResp.json();
          brands = data?.brands || [];
        }
      }
      const found = matchByTitle(brands, draft.brand);
      if (found?.id) {
        draft.brandId = found.id;
        appendOverlayLog("success", `Marque ID résolu via API: ${draft.brand} → ${draft.brandId}`);
      } else {
        appendOverlayLog("warning", `Marque ID introuvable via API pour "${draft.brand}"`);
      }
    } catch (error) {
      appendOverlayLog("warning", `Résolution marque ID échouée: ${error.message || error}`);
    }
  }

  // Size ID via catalog-aware endpoints when possible.
  if (!draft.sizeId && draft.size) {
    try {
      const endpoints = [];
      if (draft.catalogId) {
        endpoints.push(`https://www.vinted.fr/api/v2/catalogs/${draft.catalogId}/sizes`);
        endpoints.push(`https://www.vinted.fr/api/v2/size_groups?catalog_ids=${draft.catalogId}`);
      }
      endpoints.push("https://www.vinted.fr/api/v2/sizes");

      let sizes = [];
      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(endpoint, { credentials: "include", headers });
          if (!resp.ok) continue;
          const data = await resp.json();
          if (Array.isArray(data?.sizes)) {
            sizes = data.sizes;
            break;
          }
          if (Array.isArray(data?.size_groups)) {
            sizes = data.size_groups.flatMap((g) => g?.sizes || g?.options || []);
            if (sizes.length) break;
          }
          if (Array.isArray(data)) {
            sizes = data;
            break;
          }
        } catch (_) {
          // try next endpoint
        }
      }

      const found = matchByTitle(sizes, draft.size, ["title", "name", "label"], { strict: true });
      if (found?.id) {
        const foundTitle = found.title || found.name || found.label || "?";
        draft.sizeId = found.id;
        appendOverlayLog(
          "success",
          `Taille ID résolue via API: ${draft.size} → ${draft.sizeId} (match="${foundTitle}")`
        );
      } else {
        appendOverlayLog("warning", `Taille ID introuvable via API pour "${draft.size}"`);
      }
    } catch (error) {
      appendOverlayLog("warning", `Résolution taille ID échouée: ${error.message || error}`);
    }
  }

  return draft;
}

window.vintedResolveMissingDraftIds = resolveMissingDraftIds;

function readInputBySelectors(selectors) {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (!el) continue;
      const raw = String(el.value || el.getAttribute?.("value") || el.textContent || "").trim();
      if (raw) return raw;
    } catch (_) {
      // keep trying
    }
  }
  return "";
}

function valueLooksMatching(expected, actual) {
  if (!expected) return true;
  if (!actual) return false;
  if (typeof isCommittedMatch === "function" && isCommittedMatch(actual, expected)) return true;
  const e = typeof normalizeComparableText === "function"
    ? normalizeComparableText(expected)
    : String(expected).toLowerCase().trim();
  const a = typeof normalizeComparableText === "function"
    ? normalizeComparableText(actual)
    : String(actual).toLowerCase().trim();
  if (!e || !a) return false;
  if (a === e) return true;
  if (a.includes(e) || e.includes(a)) return true;
  return false;
}

function countUploadedPhotoThumbnails() {
  const candidates = Array.from(
    document.querySelectorAll(
      '[class*="Media"] img, [class*="media"] img, [class*="Photo"] img, [class*="photo"] img, [class*="Image"] img, [data-testid*="photo"] img, [data-testid*="image"] img'
    )
  ).filter((img) => {
    if (!img || !img.isConnected) return false;
    const src = String(img.currentSrc || img.src || "");
    if (!src || src.startsWith("data:image/svg")) return false;
    const rect = img.getBoundingClientRect?.();
    if (rect && (rect.width < 24 || rect.height < 24)) return false;
    return true;
  });
  return candidates.length;
}

function readVerifyFieldActual(labels, selectors = []) {
  const fromSelectors = readInputBySelectors(selectors);
  if (fromSelectors) return fromSelectors;
  for (const label of labels) {
    if (typeof getPrimaryFieldValue === "function") {
      const primary = getPrimaryFieldValue(label);
      if (primary) return primary;
    }
    if (typeof getFieldDisplayText === "function") {
      const display = getFieldDisplayText(label);
      if (display) return display;
    }
  }
  return "";
}

function readSelectedChoiceText(idPrefixes = []) {
  for (const prefix of idPrefixes) {
    const nodes = Array.from(
      document.querySelectorAll(
        `[id^="${prefix}"][aria-checked="true"], [id^="${prefix}"][aria-selected="true"], input[id^="${prefix}"]:checked, [id^="${prefix}"].web_ui__Cell__selected`
      )
    );
    for (const node of nodes) {
      const host =
        node.closest?.("li, [role='option'], label, .web_ui__Cell__cell, [role='radio'], [role='checkbox']") ||
        node;
      const text = normalizeComparableText(host?.textContent || node.textContent || "");
      if (text && text.length < 120) return text;
    }
  }
  return "";
}

function readCategoryFromDom() {
  const committed = readInputBySelectors(['input#catalog', 'input[name="catalog"]', 'input[name*="catalog"]']);
  if (committed) return committed;
  const primary = readVerifyFieldActual(["Catégorie", "Category"], []);
  if (primary) return primary;
  // After category commit, Vinted often keeps catalog id in the DOM without a text input.
  const idHint = document.querySelector(
    '[id^="catalog-search-"][id$="-result"], [data-testid*="catalog"][aria-selected="true"], input[name="catalog_id"]'
  );
  if (idHint) {
    const idMatch = String(idHint.id || idHint.value || "").match(/(\d{2,})/);
    if (idMatch) return `catalog:${idMatch[1]}`;
  }
  return "";
}

function readConditionFromDom() {
  return (
    readVerifyFieldActual(["État", "Etat", "Condition"], [
      'input#status',
      'input[name*="status"]',
      'input[id*="status"]',
    ]) ||
    readSelectedChoiceText(["status-", "condition-"])
  );
}

function verifyDraftAgainstBackup(draft, engineResult = null) {
  const mismatches = [];
  const expectedPhotos = Array.isArray(draft?.files)
    ? draft.files.length
    : Array.isArray(draft?.imageUrls)
      ? draft.imageUrls.length
      : 0;

  const engineOk = new Map();
  for (const result of engineResult?.fieldResults || []) {
    if (result?.success && !result?.skipped) engineOk.set(result.fieldId, result);
  }

  const expectedCategory =
    normalizeCategoryForForm(draft?.category, draft?.brand) || draft?.category || "";

  const checks = [
    {
      id: "title",
      expected: draft?.title,
      actual: readInputBySelectors([
        'input[name="title"]',
        'input[id*="title"]',
        'input[data-testid*="title"]',
      ]),
    },
    {
      id: "description",
      expected: draft?.description,
      actual: readInputBySelectors([
        'textarea[name="description"]',
        'textarea[id*="description"]',
        'textarea[data-testid*="description"]',
      ]),
    },
    {
      id: "price",
      expected: draft?.price,
      actual: normalizePrice(
        readInputBySelectors([
          'input[name="price"]',
          'input[id*="price"]',
          'input[data-testid*="price"]',
          'input[inputmode="decimal"]',
        ]) || findVintedPriceInput()?.value || ""
      ),
    },
    {
      id: "brand",
      expected: draft?.brand,
      actual: readVerifyFieldActual(["Marque", "Brand"], ['input#brand', 'input[name*="brand"]']),
    },
    {
      id: "size",
      expected: draft?.size,
      actual:
        readVerifyFieldActual(["Taille", "Size"], ['input#size', 'input[name*="size"]']) ||
        readSelectedChoiceText(["size-"]),
    },
    {
      id: "condition",
      expected: draft?.condition,
      actual: readConditionFromDom(),
    },
    {
      id: "material",
      expected: draft?.material,
      actual:
        readVerifyFieldActual(["Matériau", "Matière", "Material"], [
          'input#material',
          'input[name*="material"]',
        ]) || readSelectedChoiceText(["material-"]),
    },
    {
      id: "category",
      expected: expectedCategory,
      actual: readCategoryFromDom(),
    },
  ];

  for (const check of checks) {
    if (!check.expected) continue;
    if (check.id === "price") {
      if (isZeroOrEmptyPrice(check.actual)) {
        // fall through to mismatch — 0€ is never OK when backup has a price
      } else if (pricesEqual(check.expected, check.actual)) {
        continue;
      }
    } else if (valueLooksMatching(check.expected, check.actual)) {
      continue;
    }

    // Secondary evidence: fill engine already committed this field, and DOM shows a related signal.
    const engineHit = engineOk.get(check.id);
    let secondaryOk = false;
    if (engineHit && check.id === "category") {
      const catalogId = String(draft?.catalogId || engineHit.catalogId || "").trim();
      const actualId = String(check.actual || "").replace(/^catalog:/, "");
      if (catalogId && (/^\d+$/.test(String(check.actual || "")) || actualId === catalogId)) {
        secondaryOk = true;
      } else if (catalogId && document.body?.innerHTML?.includes(`catalog-search-${catalogId}`)) {
        secondaryOk = true;
      } else if (engineHit.success && !check.actual) {
        // Engine validated category commit (selectedCatalogId / postCategoryFieldsRendered).
        secondaryOk = Boolean(engineHit.catalogId || draft?.catalogId);
      }
    }
    if (engineHit && check.id === "condition") {
      if (readSelectedChoiceText(["status-", "condition-"]) || engineHit.success) {
        // Prefer selected DOM; if empty UI but engine selected=true path succeeded, accept.
        secondaryOk = true;
      }
    }

    if (secondaryOk) continue;

    mismatches.push({
      fieldId: check.id,
      expected: String(check.expected).slice(0, 120),
      actual: String(check.actual || "").slice(0, 120),
    });
  }

  const colors = Array.isArray(draft?.colors) ? draft.colors.filter(Boolean) : [];
  if (colors.length) {
    const colorActual =
      readVerifyFieldActual(["Couleur", "Color"], ['input#color', 'input[name*="color"]']) ||
      readSelectedChoiceText(["color-"]);
    const missingColor = colors.find((color) => !valueLooksMatching(color, colorActual));
    if (missingColor && !engineOk.get("colors")) {
      mismatches.push({
        fieldId: "colors",
        expected: colors.join("/"),
        actual: String(colorActual || "").slice(0, 120),
      });
    }
  }

  const photoCount = countUploadedPhotoThumbnails();
  const minPhotos = Math.max(1, expectedPhotos);
  if (photoCount < Math.min(minPhotos, expectedPhotos || minPhotos)) {
    mismatches.push({
      fieldId: "photos",
      expected: String(expectedPhotos || minPhotos),
      actual: String(photoCount),
    });
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    photoCount,
    expectedPhotos,
  };
}

function findVisibleButtonByTexts(texts, { exclude = [] } = {}) {
  const wanted = texts.map((t) => normalizeComparableText(t));
  const blocked = exclude.map((t) => normalizeComparableText(t));
  const buttons = Array.from(
    document.querySelectorAll('button, [role="button"], a[href], input[type="submit"]')
  );
  const scored = [];
  for (const btn of buttons) {
    if (!btn || !btn.isConnected) continue;
    const rect = btn.getBoundingClientRect?.();
    if (rect && (rect.width < 2 || rect.height < 2)) continue;
    const raw = String(btn.textContent || btn.value || btn.getAttribute?.("aria-label") || "").trim();
    const text = normalizeComparableText(raw);
    if (!text) continue;
    if (blocked.some((b) => text.includes(b))) continue;
    const hit = wanted.find((w) => text === w || text.includes(w) || w.includes(text));
    if (!hit) continue;
    scored.push({
      btn,
      score: text === hit ? 100 : 60,
      len: raw.length,
    });
  }
  scored.sort((a, b) => b.score - a.score || a.len - b.len);
  return scored[0]?.btn || null;
}

async function saveVintedDraft(draft = null) {
  // HARD GATE: never persist a 0€ / mismatched price draft.
  if (draft?.price) {
    const priceCheck = await ensureDraftPriceFilled(draft);
    if (!priceCheck.success) {
      return {
        success: false,
        reason: `Sauvegarde bloquée — ${priceCheck.reason}`,
        draftUrl: null,
      };
    }
    const live = readCurrentDraftPrice();
    if (isZeroOrEmptyPrice(live) || !pricesEqual(live, draft.price)) {
      return {
        success: false,
        reason: `Sauvegarde bloquée — prix live="${live || "0"}" ≠ backup="${draft.price}"`,
        draftUrl: null,
      };
    }
    appendOverlayLog("success", `Prix OK avant sauvegarde: ${live} €`);
  }

  appendOverlayLog("info", "Recherche du bouton de sauvegarde brouillon…");
  const saveBtn = findVisibleButtonByTexts(
    [
      "sauvegarder le brouillon",
      "enregistrer le brouillon",
      "sauvegarder",
      "enregistrer",
      "save draft",
      "save",
    ],
    { exclude: ["publier", "ajouter", "publish", "upload", "supprimer", "delete"] }
  );

  if (!saveBtn) {
    return { success: false, reason: "Bouton sauvegarde brouillon introuvable", draftUrl: null };
  }

  const beforeUrl = window.location.href;
  clickElementHard(saveBtn);
  appendOverlayLog("info", `Clic sauvegarde: ${describeElement?.(saveBtn) || saveBtn.textContent?.trim()}`);

  const start = Date.now();
  let draftUrl = null;
  while (Date.now() - start < 20000) {
    await sleep(400);
    const href = window.location.href;
    if (/\/items\/\d+/.test(href) && !href.includes("/items/new")) {
      draftUrl = href;
      break;
    }
    if (href !== beforeUrl && (href.includes("draft") || href.includes("/wardrobe") || href.includes("/member/"))) {
      draftUrl = href;
      break;
    }
    // Toast / success text
    const bodyText = normalizeComparableText(document.body?.innerText || "");
    if (bodyText.includes("brouillon") && (bodyText.includes("sauvegard") || bodyText.includes("enregistre"))) {
      draftUrl = href;
      break;
    }
  }

  if (!draftUrl) {
    // Still on form but maybe soft-saved
    draftUrl = window.location.href;
    appendOverlayLog("warning", "Pas de redirection claire après sauvegarde — URL courante conservée");
  }

  // Re-check price after save click (Vinted may reset fields on error).
  if (draft?.price) {
    const liveAfter = readCurrentDraftPrice();
    if (liveAfter && (isZeroOrEmptyPrice(liveAfter) || !pricesEqual(liveAfter, draft.price))) {
      appendOverlayLog(
        "error",
        `Après clic sauvegarde, prix redevenu "${liveAfter || "0"}" (backup ${draft.price})`
      );
      return {
        success: false,
        reason: `Prix corrompu après sauvegarde (lu=${liveAfter || "0"}, attendu=${draft.price})`,
        draftUrl,
      };
    }
  }

  return { success: true, draftUrl, reason: null };
}

function clearOverlayActions() {
  const actions = document.getElementById(OVERLAY_ACTIONS_ID);
  if (actions) {
    actions.innerHTML = "";
    actions.style.display = "none";
  }
}

function showDestructiveConfirmButton(payload) {
  ensureOverlay();
  const actions = document.getElementById(OVERLAY_ACTIONS_ID);
  if (!actions) return;
  actions.style.display = "block";
  actions.innerHTML = "";

  const summary = document.createElement("div");
  summary.style.cssText =
    "font-size:11px;line-height:1.35;color:#fde68a;margin-bottom:8px;padding:8px;border:1px solid rgba(250,204,21,.35);border-radius:8px;background:rgba(120,53,15,.35);";
  summary.innerHTML = [
    `<div><strong>Préflight finalisation</strong></div>`,
    `<div>Originale: ${escapeHtml(payload.originalItemId || "?")}</div>`,
    `<div>Brouillon: ${escapeHtml(shortUrl(payload.draftUrl))}</div>`,
    `<div>Titre: ${escapeHtml((payload.title || "").slice(0, 80))}</div>`,
    `<div>Backup: ${escapeHtml(payload.backupId || "—")} · photos OK</div>`,
    `<div style="margin-top:4px;">1 clic = supprimer l’originale puis publier le brouillon.</div>`,
  ].join("");
  actions.appendChild(summary);

  const btn = document.createElement("button");
  btn.id = OVERLAY_CONFIRM_ID;
  btn.type = "button";
  btn.textContent = "Confirmer : supprimer originale + publier";
  Object.assign(btn.style, {
    width: "100%",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid rgba(248,113,113,.8)",
    background: "#b91c1c",
    color: "#fff",
    borderRadius: "8px",
    padding: "10px 12px",
    cursor: "pointer",
  });
  btn.addEventListener("click", () => {
    const ok = window.confirm(
      [
        "DERNIÈRE CONFIRMATION",
        "",
        `Supprimer l’annonce originale #${payload.originalItemId} ?`,
        `Puis publier le brouillon:`,
        payload.draftUrl || "(URL brouillon)",
        "",
        "Le backup local (infos + photos) reste disponible si la publication échoue.",
        "",
        "Continuer ?",
      ].join("\n")
    );
    if (!ok) {
      appendOverlayLog("warning", "Finalisation annulée par l’utilisateur");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Republication en cours…";
    beginDestructiveRepublish(payload).catch((error) => {
      appendOverlayLog("error", error.message || "Échec republication destructive");
      setOverlayStatus("Échec republication");
      btn.disabled = false;
      btn.textContent = "Réessayer : supprimer originale + publier";
    });
  });
  actions.appendChild(btn);
  appendOverlayLog(
    "warning",
    "Bouton rouge prêt — lit le préflight, puis confirme (dialogue navigateur inclus)."
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortUrl(url) {
  const raw = String(url || "");
  if (raw.length <= 64) return raw || "—";
  return `${raw.slice(0, 40)}…${raw.slice(-18)}`;
}

function extractItemIdFromUrl(url = window.location.href) {
  const match = String(url || "").match(/\/items\/(\d+)/);
  return match ? match[1] : null;
}

async function buildFinalizePreflight({ draftUrl = null, originalItemId = null } = {}) {
  const errors = [];
  const warnings = [];
  const href = draftUrl || window.location.href;
  const backup = await loadLatestFullBackup(originalItemId);
  const backupItemId = String(backup?.item?.itemId || backup?.safety?.originalItemId || "");
  const originalId = String(originalItemId || backupItemId || "");
  const currentItemId = extractItemIdFromUrl(href);

  if (!backup) errors.push("Aucun backup local trouvé");
  if (!backupHasRecoverablePhotos(backup)) errors.push("Backup sans photos binaires");
  if (!originalId) errors.push("ID originale inconnu");
  if (!href || href.includes("/items/new")) {
    errors.push("Le brouillon n’est pas encore sauvegardé (URL /items/new)");
  }
  if (href.includes("/member/") && !/\/items\/\d+/.test(href)) {
    errors.push("Tu es sur une page profil/dressing — ouvre le brouillon (/items/…/edit)");
  }
  if (!currentItemId) errors.push("URL brouillon invalide (pas d’ID item)");
  if (originalId && currentItemId && originalId === currentItemId) {
    errors.push("Tu es sur l’annonce originale — ouvre le NOUVEAU brouillon d’abord");
  }
  if (originalId && href.includes(`/items/${originalId}`)) {
    errors.push("draftUrl pointe vers l’originale");
  }

  const title =
    backup?.item?.title ||
    document.querySelector('input[name="title"], input[id*="title"]')?.value ||
    "";

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    payload: {
      originalItemId: originalId,
      originalUrl: backup?.safety?.originalUrl || backup?.item?.originalUrl || `https://www.vinted.fr/items/${originalId}`,
      draftUrl: href,
      title,
      backupId: backup?.backupId || null,
      photoCount:
        backup?.photos?.preparedCount ||
        backupRecoveryFiles(backup).length ||
        0,
    },
  };
}

async function offerFinalizeFromCurrentDraft({ source = "manual" } = {}) {
  resetOverlayDismissState();
  ensureOverlay();
  setOverlayStatus("Préflight finalisation");
  appendOverlayLog("info", `Préflight finalisation (${source})…`);

  const preflight = await buildFinalizePreflight();
  if (!preflight.ok) {
    setOverlayStatus("Finalisation bloquée");
    for (const err of preflight.errors) {
      appendOverlayLog("error", `Préflight: ${err}`);
    }
    showBackupRecoveryActions(preflight.payload.originalItemId || null, {
      draftUrl: preflight.payload.draftUrl,
      reason: preflight.errors[0] || "préflight échoué",
    });
    return { success: false, errors: preflight.errors };
  }

  await chrome.storage.local.set({
    [PENDING_REPUBLISH_CONFIRM_KEY]: {
      ...preflight.payload,
      createdAt: new Date().toISOString(),
      source,
    },
  });
  await updateBackupLifecycle(preflight.payload.originalItemId, {
    status: "READY_TO_FINALIZE",
    draftUrl: preflight.payload.draftUrl,
    note: "Preflight OK — waiting user confirm to delete original + publish draft",
  });

  appendOverlayLog("success", `Préflight OK · originale #${preflight.payload.originalItemId}`);
  appendOverlayLog("success", `Brouillon: ${preflight.payload.draftUrl}`);
  appendOverlayLog(
    "success",
    `Backup ${preflight.payload.backupId} · ${preflight.payload.photoCount} photo(s) récupérables`
  );
  setOverlayStatus("Prêt à confirmer");
  showDestructiveConfirmButton(preflight.payload);
  return { success: true, payload: preflight.payload };
}

async function setRepublishStatus(status, extra = {}) {
  const entry = {
    status,
    timestamp: Date.now(),
    ...extra,
  };
  try {
    await chrome.storage.local.set({ [LAST_REPUBLISH_STATUS_KEY]: entry });
    if (extra.itemId) {
      await chrome.storage.local.set({ [`republish_status_${extra.itemId}`]: entry });
    }
  } catch (_) {
    // ignore
  }
  return entry;
}

async function beginPublishOnly(payload = {}) {
  const draftUrl = payload.draftUrl || window.location.href;
  if (!draftUrl || draftUrl.includes("/items/new")) {
    throw new Error("Ouvre d’abord un brouillon sauvegardé (/items/…/edit), pas /items/new");
  }
  if (isVintedErrorPage()) {
    appendOverlayLog("warning", "Page erreur Vinted — rechargement avant publication…");
    window.location.href = draftUrl;
    // Persist intent across reload
    await chrome.storage.local.set({
      [PENDING_REPUBLISH_FINISH_KEY]: {
        phase: "publish_new",
        publishOnly: true,
        allowDestructive: false,
        originalUrl: null,
        originalItemId: String(payload.originalItemId || ""),
        draftUrl,
        title: payload.title || "",
        backupId: payload.backupId || null,
        createdAt: new Date().toISOString(),
      },
    });
    return;
  }

  const originalItemId = String(payload.originalItemId || extractItemIdFromUrl(draftUrl) || "");
  await chrome.storage.local.set({
    [PENDING_REPUBLISH_FINISH_KEY]: {
      phase: "publish_new",
      publishOnly: true,
      allowDestructive: false,
      originalUrl: null,
      originalItemId,
      draftUrl,
      title: payload.title || "",
      backupId: payload.backupId || null,
      createdAt: new Date().toISOString(),
    },
  });
  if (originalItemId) {
    await updateBackupLifecycle(originalItemId, {
      status: "PUBLISH_ONLY_STARTED",
      draftUrl,
      note: "Publish-only automation (no delete)",
    });
  }
  await setRepublishStatus("PUBLISH_STARTED", {
    itemId: originalItemId || null,
    title: payload.title,
    draftUrl,
    backupId: payload.backupId || null,
    publishOnly: true,
  });
  appendOverlayLog("info", `Publication automatique du brouillon: ${draftUrl}`);
  setOverlayStatus("Publication auto…");

  // If already on the draft page, run immediately; else navigate.
  const draftPath = String(draftUrl).split("?")[0].replace(/\/edit\/?$/, "");
  if (!window.location.href.includes(draftPath)) {
    window.location.href = draftUrl;
    return;
  }

  const pub = await publishSavedDraft(draftUrl, payload.title || "");
  if (pub.navigated) return;
  if (!pub.success) {
    appendOverlayLog("error", `Publication auto échouée: ${pub.reason || "inconnu"}`);
    await setRepublishStatus("REPUBLISH_FAILED", {
      itemId: originalItemId || null,
      title: payload.title,
      error: pub.reason,
      draftUrl,
      stage: "publish_only",
    });
    setOverlayStatus("Échec publication");
    showBackupRecoveryActions(originalItemId || null, {
      draftUrl,
      reason: pub.reason || "publication auto échouée",
    });
    await chrome.storage.local.remove(PENDING_REPUBLISH_FINISH_KEY);
    return;
  }

  await chrome.storage.local.remove(PENDING_REPUBLISH_FINISH_KEY);
  if (originalItemId) {
    await updateBackupLifecycle(originalItemId, {
      status: "DONE",
      draftUrl,
      publishedUrl: pub.publishedUrl || null,
      note: "Published via publish-only automation",
    });
  }
  await setRepublishStatus("REPUBLISH_DONE", {
    itemId: originalItemId || null,
    title: payload.title,
    draftUrl,
    publishedUrl: pub.publishedUrl || null,
    publishOnly: true,
  });
  appendOverlayLog("success", `Annonce publiée automatiquement: ${pub.publishedUrl || draftUrl}`);
  setOverlayStatus("Publication terminée");
  clearOverlayActions();
}

async function beginDestructiveRepublish(payload) {
  const originalUrl =
    payload.originalUrl ||
    `https://www.vinted.fr/items/${payload.originalItemId}`;
  const draftUrl = payload.draftUrl || null;
  const originalItemId = String(payload.originalItemId || "");

  if (!originalItemId) {
    throw new Error("ID originale manquant — suppression bloquée");
  }
  if (!draftUrl || draftUrl.includes("/items/new")) {
    throw new Error("URL brouillon manquante/invalide — sauvegarde le brouillon d’abord");
  }
  const draftItemId = extractItemIdFromUrl(draftUrl);
  if (!draftItemId) {
    throw new Error("Impossible d’extraire l’ID du brouillon depuis l’URL");
  }
  if (draftItemId === originalItemId) {
    throw new Error("Le brouillon pointe vers l’originale — suppression bloquée");
  }

  const backup = await loadLatestFullBackup(originalItemId);
  if (!backupHasRecoverablePhotos(backup)) {
    throw new Error(
      "Backup photos manquant — suppression bloquée. Importe/télécharge d’abord un backup complet."
    );
  }

  // Re-run preflight immediately before navigating away.
  const preflight = await buildFinalizePreflight({
    draftUrl,
    originalItemId,
  });
  if (!preflight.ok) {
    throw new Error(`Préflight final: ${preflight.errors.join(" · ")}`);
  }

  await unlockBackupDestructiveFlags(originalItemId, true);
  await updateBackupLifecycle(originalItemId, {
    status: "DELETE_STARTED",
    draftUrl,
    note: "Destructive confirm clicked; full local backup retained",
  });
  await chrome.storage.local.remove(PENDING_REPUBLISH_CONFIRM_KEY);
  await chrome.storage.local.set({
    [PENDING_REPUBLISH_FINISH_KEY]: {
      phase: "delete_original",
      originalUrl,
      originalItemId,
      draftUrl,
      title: payload.title || backup?.item?.title || "",
      backupId: payload.backupId || backup.backupId || null,
      allowDestructive: true,
      createdAt: new Date().toISOString(),
    },
  });
  await setRepublishStatus("DELETE_ORIGINAL_STARTED", {
    itemId: originalItemId,
    title: payload.title,
    draftUrl,
    backupId: payload.backupId || backup.backupId,
  });
  appendOverlayLog("info", `Navigation vers l’originale pour suppression: ${originalUrl}`);
  appendOverlayLog("info", `Après delete → publication du brouillon: ${draftUrl}`);
  appendOverlayLog(
    "success",
    `Filet de sécurité actif: backup local ${backup.backupId} (${backup.photos?.preparedCount || 0} photos)`
  );
  window.location.href = originalUrl;
}

async function verifyOriginalDeleted(originalItemId, { timeoutMs = 25000, expectedTitle = "" } = {}) {
  const id = String(originalItemId || "").trim();
  if (!id) return { deleted: false, reason: "ID originale manquant" };

  const start = Date.now();
  let lastReason = "pas encore vérifié";
  while (Date.now() - start < timeoutMs) {
    const probe = await probeItemExistsStrict(id, expectedTitle);
    lastReason = probe.reason;
    if (probe.exists === false) {
      // Require two consecutive negatives to avoid transient glitches.
      await sleep(900);
      const probe2 = await probeItemExistsStrict(id, expectedTitle);
      if (probe2.exists === false) {
        return { deleted: true, reason: `${probe.reason} + recheck: ${probe2.reason}` };
      }
      lastReason = `recheck a contredit: ${probe2.reason}`;
    }
    if (probe.exists === true) {
      // Still online — keep waiting a bit in case delete is slow, but do not flip to deleted on soft signals.
      await sleep(900);
      continue;
    }
    await sleep(900);
  }

  // SAFETY DEFAULT: ambiguous/timeout = NOT deleted.
  return {
    deleted: false,
    reason: `Suppression non prouvée (${lastReason}). Annonce considérée TOUJOURS EN LIGNE.`,
  };
}

/**
 * Classify item HTML without network.
 * CRITICAL: never treat i18n strings like "n'est plus disponible" alone as deletion —
 * live Vinted pages embed those phrases in JS translation bundles (verified 2026-07-16 on #9226526096).
 */
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

  // Strong ALIVE signals observed on real live SSR HTML.
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

  // Strong DEAD signals only (structured / title-level — not i18n bundle noise).
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

/**
 * Strict existence probe.
 * CRITICAL RULE: ambiguous => exists=true (block publish).
 * Never treat a loose "indisponible" string in the full HTML as proof of deletion.
 */
async function probeItemExistsStrict(itemId, expectedTitle = "") {
  const id = String(itemId || "").trim();
  const url = `https://www.vinted.fr/items/${id}`;

  // 1) Strongest signal: successful item JSON with matching id.
  try {
    const apiResp = await fetch(`https://www.vinted.fr/api/v2/items/${id}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (apiResp.ok) {
      const data = await apiResp.json().catch(() => null);
      const apiId = data?.item?.id || data?.id;
      if (apiId && String(apiId) === id) {
        return { exists: true, reason: "API /items/{id} renvoie encore l’annonce" };
      }
      if (data?.item || data?.title) {
        return { exists: true, reason: "API item payload encore présent" };
      }
    }
    // NOTE: API 404/403 is NOT proof of deletion on Vinted (often blocked even for live items).
  } catch (_) {
    // ignore — fall through to HTML checks
  }

  // 2) HTML page structural signals (SSR).
  try {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
    });
    const html = await resp.text();
    const classified = classifyItemHtmlPresence(html, id, expectedTitle);
    if (classified.exists === true) return classified;
    if (classified.exists === false) {
      if (resp.status === 404 || resp.status === 410) {
        return { exists: false, reason: `HTTP ${resp.status} + ${classified.reason}` };
      }
      return classified;
    }
    if (resp.status === 404 || resp.status === 410) {
      return { exists: false, reason: `HTTP ${resp.status} + HTML sans marqueurs listing` };
    }
  } catch (error) {
    return {
      exists: true,
      reason: `probe HTML échouée (${error.message || "error"}) — prudence: considéré EN LIGNE`,
    };
  }

  // 3) Only accept network delete OK when a follow-up HTML probe also loses listing markers.
  const net = window.__VINTED_DELETE_NETWORK__;
  if (net?.itemId === id && net.ok && net.status >= 200 && net.status < 300) {
    await sleep(700);
    try {
      const again = await fetch(url, { credentials: "include", cache: "no-store" });
      const html2 = await again.text();
      const classified2 = classifyItemHtmlPresence(html2, id, expectedTitle);
      if (classified2.exists === true) {
        return { exists: true, reason: `API delete ${net.status} mais listing encore visible (${classified2.reason})` };
      }
      if (classified2.exists === false || again.status === 404 || again.status === 410) {
        return {
          exists: false,
          reason: `API delete ${net.method} ${net.status} + recheck HTML: ${classified2.reason || `HTTP ${again.status}`}`,
        };
      }
    } catch (_) {
      // fall through
    }
  }

  return {
    exists: true,
    reason: "état ambigu — considéré EN LIGNE (pas de preuve structurelle de suppression)",
  };
}

function extractVintedCsrfToken(html = "") {
  const sources = [String(html || ""), document.documentElement?.innerHTML || ""];
  const patterns = [
    /CSRF_TOKEN\\":\\"([^"\\]+)/,
    /"CSRF_TOKEN"\s*:\s*"([^"]+)"/,
    /csrf-token"\s+content="([^"]+)"/i,
    /name="csrf-token"[^>]*content="([^"]+)"/i,
    /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const src of sources) {
    for (const re of patterns) {
      const m = src.match(re);
      if (m?.[1]) return m[1];
    }
  }
  const meta = document.querySelector?.('meta[name="csrf-token"]')?.getAttribute("content");
  return meta || "";
}

function getCookieValue(name) {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : "";
  } catch (_) {
    return "";
  }
}

async function getVintedAuthTokens() {
  let csrf = extractVintedCsrfToken();
  let anonId = getCookieValue("anon_id");

  // Prefer tokens captured from real authenticated API traffic (background webRequest).
  try {
    const fromBg = await chrome.runtime.sendMessage({ action: "getVintedAuthTokens" });
    if (fromBg?.csrf) csrf = fromBg.csrf;
    if (fromBg?.anonId) anonId = fromBg.anonId;
  } catch (_) {
    // ignore
  }

  if (!csrf) {
    try {
      const stored = await chrome.storage.local.get(["vinted_csrf_token", "vinted_anon_id"]);
      if (stored.vinted_csrf_token) csrf = stored.vinted_csrf_token;
      if (!anonId && stored.vinted_anon_id) anonId = stored.vinted_anon_id;
    } catch (_) {
      // ignore
    }
  }

  // Last resort: /items/new embeds a session CSRF (same approach as vintedRelister).
  if (!csrf) {
    try {
      const res = await fetch("https://www.vinted.fr/items/new", {
        credentials: "include",
        cache: "no-store",
      });
      csrf = extractVintedCsrfToken(await res.text());
    } catch (_) {
      // ignore
    }
  }

  // Nudge Vinted to emit auth headers so background can harvest them next time.
  if (!csrf || !anonId) {
    try {
      await fetch("https://www.vinted.fr/api/v2/users/current", {
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
      });
      const again = await chrome.runtime.sendMessage({ action: "getVintedAuthTokens" });
      if (again?.csrf) csrf = again.csrf;
      if (again?.anonId) anonId = again.anonId;
    } catch (_) {
      // ignore
    }
  }

  return { csrf: csrf || "", anonId: anonId || "" };
}

/**
 * Proven web delete endpoint (Hpn4/VintedBot + lo-bi/vintedRelister):
 * POST /api/v2/items/{id}/delete with session cookies + x-csrf-token (+ x-anon-id).
 */
async function deleteItemViaVintedApi(itemId) {
  const id = String(itemId || "").trim();
  if (!id) return { success: false, reason: "ID manquant" };

  const { csrf, anonId } = await getVintedAuthTokens();
  if (!csrf) {
    return {
      success: false,
      reason: "CSRF token introuvable — recharge la page Vinted puis réessaie",
    };
  }
  appendOverlayLog(
    "info",
    `Tokens auth: CSRF=${csrf.slice(0, 8)}… anon=${anonId ? anonId.slice(0, 8) + "…" : "absent"}`
  );

  const endpoint = `https://www.vinted.fr/api/v2/items/${id}/delete`;
  appendOverlayLog("info", `Delete API: POST /api/v2/items/${id}/delete`);

  const headers = {
    accept: "application/json, text/plain, */*",
    "x-csrf-token": csrf,
    "x-requested-with": "XMLHttpRequest",
    origin: window.location.origin,
    referer: window.location.href,
  };
  if (anonId) headers["x-anon-id"] = anonId;

  // Match vintedRelister: POST without JSON body / content-type.
  const resp = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers,
  });

  let bodyText = "";
  try {
    bodyText = await resp.text();
  } catch (_) {
    bodyText = "";
  }
  let bodyJson = null;
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : null;
  } catch (_) {
    bodyJson = null;
  }

  window.__VINTED_DELETE_NETWORK__ = {
    itemId: id,
    url: endpoint,
    method: "POST",
    status: resp.status,
    ok: resp.ok,
    at: Date.now(),
    via: "api",
  };

  if (!resp.ok) {
    return {
      success: false,
      reason: `API delete HTTP ${resp.status}: ${String(bodyText || "").slice(0, 160)}`,
      status: resp.status,
      bodyJson,
    };
  }

  return {
    success: true,
    reason: `API delete HTTP ${resp.status}`,
    status: resp.status,
    bodyJson,
  };
}

function installDeleteNetworkSniffer(itemId) {
  const id = String(itemId || "");
  window.__VINTED_DELETE_TARGET_ID__ = id;
  window.__VINTED_DELETE_NETWORK__ = null;
  if (window.__VINTED_DELETE_SNIFFER_INSTALLED__) return;
  window.__VINTED_DELETE_SNIFFER_INSTALLED__ = true;

  const record = (url, method, status) => {
    const targetId = String(window.__VINTED_DELETE_TARGET_ID__ || "");
    const u = String(url || "");
    const m = String(method || "GET").toUpperCase();
    if (!u.includes("/api/") && !u.includes("/items/")) return;
    const mentionsItem =
      targetId &&
      (u.includes(`/items/${targetId}`) ||
        u.includes(`item_id=${targetId}`) ||
        u.includes(`itemId=${targetId}`));
    const looksDelete =
      m === "DELETE" ||
      /\/delete\b/i.test(u) ||
      /\/destroy\b/i.test(u) ||
      /action=delete/i.test(u) ||
      /status=deleted/i.test(u);
    if (!(mentionsItem && (looksDelete || m === "DELETE"))) return;
    window.__VINTED_DELETE_NETWORK__ = {
      itemId: targetId,
      url: u,
      method: m,
      status: Number(status) || 0,
      ok: Number(status) >= 200 && Number(status) < 300,
      at: Date.now(),
    };
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await originalFetch(...args);
    try {
      const req = args[0];
      const url = typeof req === "string" ? req : req?.url;
      const method = (args[1]?.method || req?.method || "GET").toUpperCase();
      record(url, method, res.status);
    } catch (_) {
      // ignore
    }
    return res;
  };

  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__vrMethod = method;
    this.__vrUrl = url;
    return XO.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("loadend", () => {
      try {
        record(this.__vrUrl, this.__vrMethod, this.status);
      } catch (_) {
        // ignore
      }
    });
    return XS.apply(this, args);
  };
}

function isElementVisibleForClick(el) {
  if (!el?.isConnected) return false;
  const style = window.getComputedStyle?.(el);
  if (style && (style.visibility === "hidden" || style.display === "none" || style.opacity === "0")) {
    return false;
  }
  const rect = el.getBoundingClientRect?.();
  if (!rect || rect.width < 2 || rect.height < 2) return false;
  return true;
}

function findItemOverflowMenuButton() {
  const selectors = [
    '[data-testid="item-actions-overflow-button"]',
    '[data-testid="item-actions-menu-button"]',
    '[data-testid*="item-actions"]',
    '[data-testid*="overflow"]',
    '[data-testid*="more-actions"]',
    '[data-testid*="item-menu"]',
    'button[aria-label*="ctions"]',
    'button[aria-label*="ptions"]',
    'button[aria-label*="More"]',
    'button[aria-label*="Plus d"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && isElementVisibleForClick(el)) return el;
  }

  const byText = findVisibleButtonByTexts(
    ["plus d'actions", "more actions", "options", "actions", "plus d’actions"],
    { exclude: ["supprimer", "delete", "acheter", "favori"] }
  );
  if (byText) return byText;

  // Owner chrome often exposes a bare icon button near share / report / title.
  const h1 = document.querySelector("h1");
  const candidates = Array.from(document.querySelectorAll("button")).filter((btn) => {
    if (!isElementVisibleForClick(btn)) return false;
    const label = normalizeComparableText(btn.getAttribute("aria-label") || btn.textContent || "");
    if (label.includes("favori") || label.includes("acheter") || label.includes("offre")) return false;
    if (label.includes("menu ouvert") || label.includes("recherche")) return false;
    const text = (btn.textContent || "").trim();
    // Icon-only-ish buttons
    if (text.length > 2 && !label.includes("action") && !label.includes("option")) return false;
    if (!h1) return Boolean(btn.querySelector("svg"));
    const br = btn.getBoundingClientRect();
    const hr = h1.getBoundingClientRect();
    // Same vertical band as title / sidebar actions
    return Math.abs(br.top - hr.top) < 220 && btn.querySelector("svg");
  });
  return candidates[0] || null;
}

async function waitForOwnerDeleteUi({ timeoutMs = 12000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const menu = findItemOverflowMenuButton();
    const directDelete = findVisibleButtonByTexts(
      ["supprimer l'annonce", "supprimer l’annonce", "supprimer", "delete"],
      { exclude: ["ne pas", "photo", "image", "annuler", "signaler"] }
    );
    const editBtn = findVisibleButtonByTexts(["modifier", "edit"], { exclude: ["photo"] });
    if (menu || directDelete || editBtn) {
      return { menu, directDelete, editBtn };
    }
    // Page may still be hydrating owner actions after navigation.
    await sleep(400);
  }
  return {
    menu: findItemOverflowMenuButton(),
    directDelete: null,
    editBtn: null,
  };
}

async function deleteOriginalListingViaDom(itemId, expectedTitle = "") {
  appendOverlayLog("info", "Attente UI propriétaire (menu ⋯ / Supprimer)…");
  const ui = await waitForOwnerDeleteUi({ timeoutMs: 12000 });

  // Direct delete control if already visible.
  if (ui.directDelete) {
    appendOverlayLog(
      "info",
      `Clic Supprimer direct: ${normalizeComparableText(ui.directDelete.textContent || "").slice(0, 40)}`
    );
    clickElementHard(ui.directDelete);
    await sleep(900);
  } else {
    const menuBtn = ui.menu;
    if (!menuBtn) {
      return {
        success: false,
        reason:
          "Menu actions (⋯) introuvable — ouvre l’annonce en étant connecté propriétaire, laisse charger, réessaie",
      };
    }
    appendOverlayLog("info", `Ouverture menu: ${describeElement(menuBtn)}`);
    clickElementHard(menuBtn);
    await sleep(800);

    let deleteBtn =
      Array.from(
        document.querySelectorAll('[role="menuitem"], [data-testid*="delete"], li, button, a')
      ).find((el) => {
        if (!isElementVisibleForClick(el)) return false;
        const text = normalizeComparableText(el.textContent || el.getAttribute("aria-label") || "");
        if (
          text !== "supprimer" &&
          text !== "delete" &&
          text !== "supprimer l'annonce" &&
          text !== "supprimer l’annonce"
        ) {
          if (!(text.includes("supprimer") || text.includes("delete"))) return false;
          if (text.includes("photo") || text.includes("image") || text.includes("favori")) return false;
          if (text.includes("signaler")) return false;
          if (text.length > 40) return false;
        }
        return true;
      }) || null;

    if (!deleteBtn) {
      deleteBtn = findVisibleButtonByTexts(
        ["supprimer l'annonce", "supprimer l’annonce", "supprimer", "delete"],
        { exclude: ["ne pas", "photo", "image", "annuler", "signaler"] }
      );
    }
    if (!deleteBtn) {
      return { success: false, reason: "Bouton Supprimer introuvable dans le menu" };
    }
    appendOverlayLog(
      "info",
      `Clic Supprimer: ${normalizeComparableText(deleteBtn.textContent || "").slice(0, 40)}`
    );
    clickElementHard(deleteBtn);
    await sleep(900);
  }

  const confirmBtn =
    document.querySelector('[data-testid="confirm-action-button"]') ||
    findVisibleButtonByTexts(
      ["confirmer et supprimer", "confirmer", "supprimer", "oui", "delete", "confirm"],
      { exclude: ["annuler", "cancel", "ne pas"] }
    );
  if (!confirmBtn) {
    return { success: false, reason: "Dialogue de confirmation introuvable" };
  }
  appendOverlayLog(
    "info",
    `Clic confirmation: ${normalizeComparableText(confirmBtn.textContent || "").slice(0, 40)}`
  );
  clickElementHard(confirmBtn);
  return { success: true, reason: "clics DOM envoyés (en attente de preuve)" };
}

async function deleteOriginalListing(originalItemId = null, expectedTitle = "") {
  const itemId =
    String(originalItemId || extractItemIdFromUrl(window.location.href) || "").trim();
  if (!itemId) {
    return { success: false, reason: "ID originale manquant pour suppression" };
  }

  appendOverlayLog("info", `Suppression de l’annonce originale #${itemId}…`);
  installDeleteNetworkSniffer(itemId);

  // Let SSR/hydration finish before probing / clicking.
  await sleep(1200);
  if (isVintedErrorPage()) {
    return { success: false, reason: "Page erreur Vinted sur l’originale — suppression annulée" };
  }

  const before = await probeItemExistsStrict(itemId, expectedTitle);
  appendOverlayLog("info", `État avant delete: ${before.reason}`);
  if (before.exists !== true) {
    appendOverlayLog(
      "warning",
      "Listing non confirmé vivant avant delete — la preuve post-delete devra être structurelle"
    );
  }

  // Warm auth tokens (also feeds background webRequest capture).
  try {
    await getVintedAuthTokens();
  } catch (_) {
    // ignore
  }

  // 1) Preferred path: private web API.
  let apiAttempt = null;
  try {
    apiAttempt = await deleteItemViaVintedApi(itemId);
    if (apiAttempt.success) {
      appendOverlayLog("success", `API delete acceptée: ${apiAttempt.reason}`);
    } else {
      appendOverlayLog("warning", `API delete échouée: ${apiAttempt.reason}`);
    }
  } catch (error) {
    apiAttempt = { success: false, reason: error.message || "API delete exception" };
    appendOverlayLog("warning", `API delete exception: ${apiAttempt.reason}`);
  }

  // 2) DOM fallback if API did not return OK.
  if (!apiAttempt?.success) {
    appendOverlayLog("info", "Fallback suppression via menu DOM…");
    const domAttempt = await deleteOriginalListingViaDom(itemId, expectedTitle);
    if (!domAttempt.success) {
      return {
        success: false,
        reason: `API: ${apiAttempt?.reason || "n/a"} | DOM: ${domAttempt.reason}`,
      };
    }
    appendOverlayLog("info", "Confirmation DOM envoyée — vérification STRICTE…");
  } else {
    appendOverlayLog("info", "Vérification STRICTE après API delete…");
  }

  const verified = await verifyOriginalDeleted(itemId, {
    timeoutMs: 28000,
    expectedTitle,
  });
  if (!verified.deleted) {
    appendOverlayLog("error", `Suppression NON prouvée: ${verified.reason}`);
    if (window.__VINTED_DELETE_NETWORK__) {
      appendOverlayLog(
        "warning",
        `Réseau: ${window.__VINTED_DELETE_NETWORK__.method} ${window.__VINTED_DELETE_NETWORK__.status} ${String(window.__VINTED_DELETE_NETWORK__.url).slice(0, 120)}`
      );
    }
    return { success: false, reason: verified.reason || "originale toujours en ligne" };
  }

  appendOverlayLog("success", `Suppression PROUVÉE: ${verified.reason}`);
  return { success: true };
}

function isVintedErrorPage() {
  const text = normalizeComparableText(document.body?.innerText || "");
  return (
    text.includes("desole, une erreur s'est produite") ||
    text.includes("une erreur s'est produite") ||
    text.includes("something went wrong") ||
    Boolean(document.querySelector('[data-testid*="error"], .error-page, [class*="ErrorPage"]'))
  );
}

function findPublishButton() {
  const isBadNode = (el) => {
    if (!el || !el.isConnected) return true;
    const tag = (el.tagName || "").toLowerCase();
    const cls = String(el.className || "");
    if (tag === "svg" || tag === "path" || tag === "img") return true;
    if (cls.includes("Icon__icon") || cls.includes("greyscale") || cls.includes("web_ui__Icon")) return true;
    const rect = el.getBoundingClientRect?.();
    if (rect && (rect.width < 8 || rect.height < 8)) return true;
    return false;
  };

  const labelOf = (el) =>
    normalizeComparableText(
      el.textContent || el.value || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || ""
    );

  const isPublishLabel = (label) => {
    if (!label || label.length < 2) return false;
    if (label.includes("brouillon") || label.includes("draft")) return false;
    if (label.includes("supprim") || label.includes("delete")) return false;
    if (label.includes("annuler") || label.includes("cancel")) return false;
    if (label.includes("photo") || label.includes("upload image") || label.includes("télécharger une photo")) return false;

    const onEditPage = window.location.href.includes("/edit");
    if (!onEditPage) {
      if (label.includes("sauvegard") || label.includes("enregistr") || label.includes("save")) return false;
    }

    return (
      label === "ajouter" ||
      label === "publier" ||
      label.includes("publier") ||
      label.includes("mettre en vente") ||
      label.includes("mettre en ligne") ||
      label.includes("publish") ||
      label.includes("ajouter l'annonce") ||
      label.includes("ajouter l’annonce") ||
      label.includes("post listing") ||
      (onEditPage && (
        label.includes("enregistrer") ||
        label.includes("sauvegarder") ||
        label.includes("save changes") ||
        label.includes("mettre a jour")
      ))
    );
  };

  const promoteToClickable = (el) => {
    if (!el) return null;
    const btn =
      el.closest?.("button, [role='button'], a[href], input[type='submit']") || el;
    if (isBadNode(btn) && btn !== el) return null;
    // Prefer the button host, never a nested icon.
    if (isBadNode(btn)) return null;
    return btn;
  };

  // 1) Explicit Vinted upload/publish test ids & submit buttons
  const testIdCandidates = Array.from(
    document.querySelectorAll(
      [
        '[data-testid="item-upload-button"]',
        '[data-testid="upload-form-submit"]',
        '[data-testid*="upload-submit"]',
        '[data-testid*="item-upload"]',
        '[data-testid*="publish"]',
        '.upload-form__footer button[type="submit"]',
        '.upload-form__footer button',
        '[class*="UploadFormFooter"] button',
        '[class*="upload-footer"] button',
        '[class*="UploadForm__footer"] button',
        'button[type="submit"]',
        'input[type="submit"]',
      ].join(", ")
    )
  );
  for (const el of testIdCandidates) {
    const btn = promoteToClickable(el);
    if (!btn) continue;
    const label = labelOf(btn);
    if (isPublishLabel(label)) return btn;
  }

  // 2) Visible buttons with strong publish labels (exact preferred).
  const onEditPage = window.location.href.includes("/edit");
  const publishTexts = [
    "publier l'annonce",
    "publier l’annonce",
    "mettre en vente",
    "mettre en ligne",
    "ajouter l'annonce",
    "ajouter l’annonce",
    "publier",
    "ajouter",
  ];
  if (onEditPage) {
    publishTexts.push("enregistrer les modifications", "sauvegarder les modifications", "enregistrer", "sauvegarder");
  }

  const exact = findVisibleButtonByTexts(
    publishTexts,
    { exclude: ["brouillon", "draft", "supprimer", "delete", "photo", "annuler", "cancel"] }
  );
  if (exact) {
    const btn = promoteToClickable(exact);
    if (btn && isPublishLabel(labelOf(btn))) return btn;
  }

  // 3) Broad scan of buttons only (never raw spans/icons).
  const buttons = Array.from(
    document.querySelectorAll("button, [role='button'], input[type='submit']")
  );
  const scored = [];
  for (const btn of buttons) {
    if (isBadNode(btn)) continue;
    const label = labelOf(btn);
    if (!isPublishLabel(label)) continue;
    const score =
      label === "ajouter" || label === "publier"
        ? 100
        : label.startsWith("ajouter") || label.startsWith("publier")
          ? 80
          : 50;
    scored.push({ btn, score, len: label.length });
  }
  scored.sort((a, b) => b.score - a.score || a.len - b.len);
  return scored[0]?.btn || null;
}

function collectVisibleFormErrors() {
  const selectors = [
    '[data-testid*="error"]',
    '[class*="Error"]',
    '[class*="error"]',
    '[role="alert"]',
    ".web_ui__Alert__content",
    ".web_ui__Input__error",
  ];
  const messages = [];
  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      if (!el?.isConnected) continue;
      const text = normalizeComparableText(el.textContent || "");
      if (!text || text.length < 4 || text.length > 180) continue;
      if (text.includes("cookie") || text.includes("protection de")) continue;
      if (!messages.includes(text)) messages.push(text);
      if (messages.length >= 6) break;
    }
    if (messages.length >= 6) break;
  }
  return messages;
}

async function probeDraftBecamePublic(itemId, expectedTitle = "") {
  const id = String(itemId || "").trim();
  if (!id) return { live: false, reason: "id manquant" };

  // Owner-facing editor endpoint often reveals status after publish.
  try {
    const { csrf, anonId } = await getVintedAuthTokens();
    const headers = {
      accept: "application/json, text/plain, */*",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(anonId ? { "x-anon-id": anonId } : {}),
    };
    const uploadRes = await fetch(`https://www.vinted.fr/api/v2/item_upload/items/${id}`, {
      credentials: "include",
      cache: "no-store",
      headers,
    });
    if (uploadRes.ok) {
      const data = await uploadRes.json().catch(() => null);
      const item = data?.item || data;
      const isDraft =
        item?.is_draft === true ||
        item?.draft === true ||
        String(item?.status || "").toLowerCase().includes("draft");
      if (item && !isDraft && (item.id || item.title)) {
        return { live: true, reason: "item_upload: plus un brouillon" };
      }
      if (isDraft) {
        return { live: false, reason: "item_upload: encore brouillon" };
      }
    }
  } catch (_) {
    // fall through
  }

  const probe = await probeItemExistsStrict(id, expectedTitle);
  if (probe.exists === true) {
    return { live: true, reason: probe.reason };
  }
  return { live: false, reason: probe.reason };
}

async function publishSavedDraft(draftUrl, title) {
  const target = draftUrl || "https://www.vinted.fr/member/items/drafts";
  const draftPath = String(draftUrl || "").split("?")[0];
  const draftItemId =
    extractItemIdFromUrl(draftUrl || "") ||
    extractItemIdFromUrl(window.location.href) ||
    "";

  // Transient Vinted error pages after delete are common — reload draft once.
  if (isVintedErrorPage() && draftUrl) {
    appendOverlayLog("warning", "Page erreur Vinted détectée — rechargement du brouillon…");
    window.location.href = draftUrl.includes("/edit") ? draftUrl : draftUrl.replace(/\/?$/, "/edit");
    return { success: false, navigated: true };
  }

  if (draftUrl && !window.location.href.includes(draftPath.replace(/\/edit\/?$/, ""))) {
    appendOverlayLog("info", `Ouverture du brouillon sauvegardé: ${draftUrl}`);
    window.location.href = draftUrl;
    return { success: false, navigated: true };
  }

  // Prefer /edit URL for drafts.
  if (
    draftUrl &&
    /\/items\/\d+/.test(window.location.href) &&
    !window.location.href.includes("/edit") &&
    !window.location.href.includes("/new")
  ) {
    const editUrl = draftUrl.includes("/edit")
      ? draftUrl
      : `${window.location.href.split("?")[0].replace(/\/$/, "")}/edit`;
    appendOverlayLog("info", `Passage en mode édition du brouillon: ${editUrl}`);
    window.location.href = editUrl;
    return { success: false, navigated: true };
  }

  // If on drafts list, open matching title
  if (window.location.href.includes("/draft") || window.location.href.includes("/items/drafts")) {
    const link = Array.from(document.querySelectorAll("a[href*='/items/']")).find((a) => {
      const text = normalizeComparableText(a.textContent || "");
      const wanted = normalizeComparableText(title || "");
      return wanted && text.includes(wanted.slice(0, Math.min(24, wanted.length)));
    });
    if (link?.href) {
      appendOverlayLog("info", `Ouverture brouillon listé: ${link.href}`);
      window.location.href = link.href;
      return { success: false, navigated: true };
    }
  }

  appendOverlayLog("info", "Publication du brouillon…");
  // Wait for edit form / sticky footer to render after navigation.
  let publishBtn = null;
  const waitStart = Date.now();
  while (Date.now() - waitStart < 25000) {
    if (isVintedErrorPage()) {
      appendOverlayLog("warning", "Erreur Vinted pendant l’attente Publier — reload brouillon");
      if (draftUrl) {
        window.location.href = draftUrl;
        return { success: false, navigated: true };
      }
      break;
    }
    publishBtn = findPublishButton();
    if (publishBtn) {
      const isDisabled = publishBtn.disabled || publishBtn.getAttribute("aria-disabled") === "true";
      if (!isDisabled) break;
      const spinners = document.querySelectorAll('[class*="spinner"], [class*="loading"], [role="progressbar"], [data-testid*="upload-progress"]');
      if (spinners.length > 0) {
        appendOverlayLog("info", "Upload photos en cours sur Vinted, attente de l'activation du bouton…");
      }
    }
    await sleep(600);
  }

  if (!publishBtn) {
    const visibleErrors = collectVisibleFormErrors();
    const errMsg = visibleErrors.length > 0
      ? `Bouton Publier introuvable (erreurs formulaire: ${visibleErrors.join(" | ")})`
      : "Bouton Publier/Ajouter introuvable — utilise le bouton vert ou publie manuellement sur cette page.";
    appendOverlayLog("error", errMsg);
    return { success: false, reason: errMsg, navigated: false };
  }

  const clickedLabel =
    normalizeComparableText(publishBtn.textContent || publishBtn.getAttribute("aria-label") || "") ||
    describeElement(publishBtn) ||
    "submit";
  if (
    clickedLabel.includes("icon") ||
    clickedLabel.includes("greyscale") ||
    clickedLabel.length < 3
  ) {
    appendOverlayLog("error", `Cible publication invalide refusée: ${clickedLabel}`);
    return { success: false, reason: "Cible Publier invalide (icône)", navigated: false };
  }

  // Prefer a stronger label if a better sibling exists (éviter un "Ajouter" ambigu).
  const stronger =
    findVisibleButtonByTexts(
      ["publier l'annonce", "publier l’annonce", "mettre en vente", "ajouter l'annonce", "ajouter l’annonce", "publier"],
      { exclude: ["brouillon", "draft", "supprimer", "photo", "annuler", "sauvegarder"] }
    ) || null;
  if (stronger && stronger !== publishBtn) {
    const strongLabel = normalizeComparableText(stronger.textContent || "");
    if (strongLabel && strongLabel.length >= clickedLabel.length) {
      publishBtn = stronger;
    }
  }

  const finalLabel =
    normalizeComparableText(publishBtn.textContent || publishBtn.getAttribute("aria-label") || "") ||
    clickedLabel;
  appendOverlayLog("info", `Clic publication: ${finalLabel}`);
  try {
    publishBtn.scrollIntoView({ block: "center", inline: "nearest" });
  } catch (_) {
    // ignore
  }
  clickElementHard(publishBtn);
  await sleep(1800);

  // If Vinted throws a soft error page, reload draft and retry ONCE.
  if (isVintedErrorPage() && draftUrl && !window.__VINTED_REPUBLISHER_PUBLISH_RETRIED__) {
    window.__VINTED_REPUBLISHER_PUBLISH_RETRIED__ = true;
    appendOverlayLog("warning", "Erreur Vinted après clic — 1 retry auto sur le brouillon");
    window.location.href = draftUrl;
    return { success: false, navigated: true };
  }

  const confirmBtn = findVisibleButtonByTexts(
    ["publier", "confirmer", "oui", "publish", "ajouter"],
    { exclude: ["annuler", "cancel", "brouillon", "photo"] }
  );
  if (confirmBtn && confirmBtn !== publishBtn) {
    const confirmLabel = normalizeComparableText(confirmBtn.textContent || "");
    if (confirmLabel && !confirmLabel.includes("icon")) {
      appendOverlayLog("info", `Clic confirmation publication: ${confirmLabel}`);
      clickElementHard(confirmBtn);
    }
  }

  const start = Date.now();
  let lastProbeReason = "";
  while (Date.now() - start < 35000) {
    await sleep(700);
    const href = window.location.href;
    if (isVintedErrorPage()) {
      return { success: false, reason: "Erreur Vinted après clic Publier", navigated: false };
    }
    if (/\/items\/\d+/.test(href) && !href.includes("/edit") && !href.includes("/new")) {
      appendOverlayLog("success", `Annonce publiée (URL): ${href}`);
      window.__VINTED_REPUBLISHER_PUBLISH_RETRIED__ = false;
      return { success: true, publishedUrl: href };
    }
    const body = normalizeComparableText(document.body?.innerText || "");
    if (
      (body.includes("annonce est en ligne") ||
        body.includes("article est en ligne") ||
        body.includes("publie avec succes") ||
        body.includes("publié avec succès") ||
        body.includes("successfully published")) &&
      !href.includes("/edit")
    ) {
      window.__VINTED_REPUBLISHER_PUBLISH_RETRIED__ = false;
      return { success: true, publishedUrl: href };
    }

    if (draftItemId) {
      const pub = await probeDraftBecamePublic(draftItemId, title || "");
      lastProbeReason = pub.reason;
      if (pub.live) {
        const publishedUrl = `https://www.vinted.fr/items/${draftItemId}`;
        appendOverlayLog("success", `Annonce publiée (probe): ${pub.reason}`);
        window.__VINTED_REPUBLISHER_PUBLISH_RETRIED__ = false;
        return { success: true, publishedUrl };
      }
    }

    const errors = collectVisibleFormErrors();
    if (errors.length && Date.now() - start > 4000) {
      appendOverlayLog("warning", `Erreurs formulaire visibles: ${errors.slice(0, 3).join(" | ")}`);
    }
  }

  const errors = collectVisibleFormErrors();
  const errSuffix = errors.length ? ` | erreurs: ${errors.slice(0, 3).join(" ; ")}` : "";
  const probeSuffix = lastProbeReason ? ` | probe: ${lastProbeReason}` : "";
  return {
    success: false,
    reason: `Publication non confirmée dans le délai${probeSuffix}${errSuffix}`,
    navigated: false,
  };
}

async function continuePendingRepublishFinishIfNeeded() {
  const result = await chrome.storage.local.get(PENDING_REPUBLISH_FINISH_KEY);
  const pending = result[PENDING_REPUBLISH_FINISH_KEY];
  if (!pending) return;
  if (!pending.allowDestructive && !pending.publishOnly) return;

  await restoreSessionLogs();
  resetOverlayDismissState();
  ensureOverlay();
  setOverlayStatus(`Republication: ${pending.phase}`);
  await loadLatestFullBackup(pending.originalItemId);

  if (pending.phase === "delete_original") {
    if (pending.publishOnly) {
      // Safety: never delete in publish-only mode.
      pending.phase = "publish_new";
      await chrome.storage.local.set({ [PENDING_REPUBLISH_FINISH_KEY]: pending });
    } else {
    const onOriginal =
      pending.originalItemId &&
      new RegExp(`/items/${pending.originalItemId}(?:\\D|$)`).test(window.location.href);
    if (!onOriginal) {
      // Not on original item page yet — wait for navigation.
      return;
    }

    const del = await deleteOriginalListing(pending.originalItemId, pending.title || "");
    if (!del.success) {
      appendOverlayLog("error", `Suppression originale échouée: ${del.reason || "inconnu"}`);
      await updateBackupLifecycle(pending.originalItemId, {
        status: "DELETE_FAILED",
        draftUrl: pending.draftUrl || null,
        note: del.reason || "Delete failed — original likely intact; backup retained",
      });
      await setRepublishStatus("REPUBLISH_FAILED", {
        itemId: pending.originalItemId,
        title: pending.title,
        error: del.reason,
        draftUrl: pending.draftUrl,
        backupId: pending.backupId,
        stage: "delete",
      });
      await chrome.storage.local.remove(PENDING_REPUBLISH_FINISH_KEY);
      setOverlayStatus("Échec suppression");
      showBackupRecoveryActions(pending.originalItemId, {
        draftUrl: pending.draftUrl,
        reason: del.reason || "suppression échouée",
      });
      return;
    }

    pending.phase = "publish_new";
    await chrome.storage.local.set({ [PENDING_REPUBLISH_FINISH_KEY]: pending });
    await updateBackupLifecycle(pending.originalItemId, {
      status: "DELETED_AWAITING_PUBLISH",
      draftUrl: pending.draftUrl || null,
      note: "Original deleted — local backup + Vinted draft are the recovery paths",
    });
    await setRepublishStatus("PUBLISH_STARTED", {
      itemId: pending.originalItemId,
      title: pending.title,
      draftUrl: pending.draftUrl,
      backupId: pending.backupId,
    });

    const target = pending.draftUrl || "https://www.vinted.fr/member/items/drafts";
    appendOverlayLog("info", `Suppression OK — ouverture brouillon pour publication: ${target}`);
    appendOverlayLog(
      "warning",
      "Backup local toujours intact (infos + photos) si la publication échoue"
    );
    window.location.href = target;
    return;
    }
  }

  if (pending.phase === "publish_new") {
    // Avoid running publish logic on the original item page or /items/new fill page.
    if (window.location.href.includes("/items/new")) return;
    if (
      !pending.publishOnly &&
      pending.originalItemId &&
      new RegExp(`/items/${pending.originalItemId}(?:\\D|$)`).test(window.location.href)
    ) {
      return;
    }

    const pub = await publishSavedDraft(pending.draftUrl, pending.title);
    if (pub.navigated) return;
    if (!pub.success) {
      appendOverlayLog(
        "error",
        `Publication échouée${pending.publishOnly ? "" : " après suppression"}: ${pub.reason || "inconnu"}. Brouillon: ${pending.draftUrl || "—"}`
      );
      await updateBackupLifecycle(pending.originalItemId, {
        status: pending.publishOnly ? "PUBLISH_ONLY_FAILED" : "PUBLISH_FAILED_AFTER_DELETE",
        draftUrl: pending.draftUrl || null,
        note: pending.publishOnly
          ? "Publish-only failed — retry green button or publish manually"
          : "CRITICAL: original deleted, publish failed — use Vinted draft URL or restore from local backup",
      });
      await setRepublishStatus("REPUBLISH_FAILED", {
        itemId: pending.originalItemId,
        title: pending.title,
        error: pub.reason,
        draftUrl: pending.draftUrl,
        backupId: pending.backupId,
        stage: pending.publishOnly ? "publish_only" : "publish",
      });
      await chrome.storage.local.remove(PENDING_REPUBLISH_FINISH_KEY);
      setOverlayStatus("Échec publication");
      showBackupRecoveryActions(pending.originalItemId, {
        draftUrl: pending.draftUrl,
        reason: pub.reason || "publication échouée",
      });
      return;
    }

    await updateBackupLifecycle(pending.originalItemId, {
      status: "DONE",
      draftUrl: pending.draftUrl || null,
      publishedUrl: pub.publishedUrl || null,
      note: pending.publishOnly
        ? "Published via publish-only automation"
        : "Republish completed — backup retained for audit (photos kept)",
      retainUntilDone: true,
    });
    await setRepublishStatus("REPUBLISH_DONE", {
      itemId: pending.originalItemId,
      title: pending.title,
      draftUrl: pending.draftUrl,
      publishedUrl: pub.publishedUrl || null,
      backupId: pending.backupId,
      publishOnly: Boolean(pending.publishOnly),
    });
    await chrome.storage.local.remove(PENDING_REPUBLISH_FINISH_KEY);
    appendOverlayLog(
      "success",
      pending.publishOnly
        ? "Publication terminée (brouillon publié automatiquement)"
        : "Republication terminée (originale supprimée + nouvelle publiée)"
    );
    appendOverlayLog("info", "Backup local conservé (infos + photos) pour audit — tu peux le télécharger");
    setOverlayStatus("Publication terminée");
    clearOverlayActions();
  }
}

async function continuePendingDomDraftIfNeeded() {
  if (!window.location.href.includes("/items/new")) return;
  const result = await chrome.storage.local.get(PENDING_DOM_DRAFT_KEY);
  const draft = result[PENDING_DOM_DRAFT_KEY];
  if (!draft) return;

  await restoreSessionLogs();
  ensureOverlay();
  // Replay restored lines into the visible overlay once.
  const logsEl = document.getElementById(OVERLAY_LOGS_ID);
  if (logsEl && logsEl.childElementCount === 0 && (window.__VINTED_REPUBLISHER_LOGS__ || []).length) {
    for (const raw of window.__VINTED_REPUBLISHER_LOGS__) {
      const line = document.createElement("div");
      const level = (raw.match(/\[(INFO|SUCCESS|WARNING|ERROR)\]/i) || [])[1]?.toLowerCase() || "info";
      const colorMap = { info: "#e2e8f0", success: "#86efac", warning: "#fcd34d", error: "#fca5a5" };
      line.style.color = colorMap[level] || colorMap.info;
      line.textContent = raw.replace(/^\[[^\]]+\]\s*/, "");
      logsEl.appendChild(line);
    }
    logsEl.scrollTop = logsEl.scrollHeight;
  }
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

  const priceInput = findVintedPriceInput();
  if (priceInput && draft.price) {
    setNativeInputValue(priceInput, formatPriceForVintedInput(draft.price));
  }

  // Attendre que Vinted auto-remplisse ses suggestions depuis les photos
  appendOverlayLog("info", "Attente auto-fill Vinted...");
  await sleep(3000);

  await resolveMissingDraftIds(draft);

  appendOverlayLog(
    "info",
    `Champs backup: marque=${draft.brand || "?"} (id=${draft.brandId || "—"}), taille=${draft.size || "?"} (id=${draft.sizeId || "—"}), état=${draft.condition || "?"} (id=${draft.statusId || "—"}), couleur=${(draft.colors || []).join("/") || "?"}, matière=${draft.material || "?"}, prix=${draft.price || "?"}`
  );

  if (!draft.price) {
    appendOverlayLog("error", "Backup sans prix — arrêt (ne pas sauvegarder ce brouillon)");
    await chrome.storage.local.remove(PENDING_DOM_DRAFT_KEY);
    setOverlayStatus("Prix manquant");
    return;
  }

  // Moteur de remplissage piloté par matrice catégorie → champs → widgets.
  if (typeof window.vintedRunFormMatrixAutomation !== "function") {
    appendOverlayLog("error", "Moteur vinted-form-engine.js non disponible. Rechargement de l'extension requis.");
    await chrome.storage.local.remove(PENDING_DOM_DRAFT_KEY);
    setOverlayStatus("Erreur moteur");
    return;
  }

  const engineResult = await window.vintedRunFormMatrixAutomation(draft, { strict: false });
  const failed = (engineResult.fieldResults || []).filter(
    (r) => !r.success && !r.skipped && !r.canContinue && !(r.isSensitive && r.canContinue) && r.required !== false && r.fieldId !== "colors"
  );

  // Price is critical: re-apply after engine (category remount) then hard-check.
  const priceEnsure = await ensureDraftPriceFilled(draft);
  if (!priceEnsure.success) {
    failed.push({ fieldId: "price", success: false, reason: priceEnsure.reason });
    appendOverlayLog("error", `Prix final non validé: ${priceEnsure.reason}`);
  } else {
    appendOverlayLog("success", `Prix final confirmé: ${priceEnsure.value} €`);
  }

  if (failed.length > 0) {
    const diagnostic = await saveRepublisherDiagnostic(draft, engineResult, failed);
    await chrome.storage.local.remove(PENDING_DOM_DRAFT_KEY);
    setOverlayStatus("Brouillon incomplet");
    appendOverlayLog(
      "error",
      failed.length + " champ(s) original(aux) non validé(s): " + failed.map((r) => r.fieldId).join(", ") + ". Brouillon incomplet: ne sauvegarde/publie pas cette annonce."
    );
    appendOverlayLog("info", `Diagnostic sauvegardé (${diagnostic.createdAt})`);
    return;
  }

  appendOverlayLog("success", "Brouillon rempli via moteur matriciel");
  appendOverlayLog("info", "Validation DOM contre backup…");
  if (typeof closeOpenDropdown === "function") {
    await closeOpenDropdown();
    await sleep(250);
  }
  // Keep draft.category aligned with the cleaned fill target.
  if (draft?.category) {
    draft.category = normalizeCategoryForForm(draft.category, draft.brand) || draft.category;
  }
  // One more price stamp right before validation.
  await ensureDraftPriceFilled(draft);
  const validation = verifyDraftAgainstBackup(draft, engineResult);
  const diagnostic = await saveRepublisherDiagnostic(draft, engineResult, failed, validation);

  if (!validation.ok) {
    await chrome.storage.local.remove(PENDING_DOM_DRAFT_KEY);
    setOverlayStatus("Validation échouée");
    appendOverlayLog(
      "error",
      `Validation brouillon échouée: ${validation.mismatches.map((m) => m.fieldId).join(", ")}`
    );
    for (const m of validation.mismatches.slice(0, 8)) {
      appendOverlayLog("warning", `Mismatch ${m.fieldId}: attendu="${m.expected}" obtenu="${m.actual}"`);
    }
    appendOverlayLog("info", `Diagnostic sauvegardé (${diagnostic.createdAt})`);
    return;
  }

  appendOverlayLog("success", `Validation brouillon OK (photos=${validation.photoCount}/${validation.expectedPhotos})`);

  const durableBackup = await loadLatestFullBackup(draft.itemId);
  if (!backupHasRecoverablePhotos(durableBackup)) {
    appendOverlayLog(
      "error",
      "CRITIQUE: backup local sans photos binaires — ne lance pas de suppression"
    );
  } else {
    appendOverlayLog(
      "success",
      `Backup durable OK: ${durableBackup.photos.originalCount} originale(s) + ${durableBackup.photos.preparedCount} modifiée(s) en storage`
    );
  }

  const allowDestructive = Boolean(draft?.settings?.allowDestructiveRepublish);
  const autoSave = draft?.settings?.autoSave !== false;
  let draftUrl = window.location.href;

  // Persist confirm payload before save in case Vinted navigates away.
  if (allowDestructive) {
    await chrome.storage.local.set({
      [PENDING_REPUBLISH_CONFIRM_KEY]: {
        originalItemId: draft.itemId,
        originalUrl: draft.originalUrl || `https://www.vinted.fr/items/${draft.itemId}`,
        draftUrl: null,
        title: draft.title,
        backupId: draft.backupId,
        createdAt: new Date().toISOString(),
      },
    });
  }

  if (autoSave) {
    const saved = await saveVintedDraft(draft);
    if (!saved.success) {
      await chrome.storage.local.remove(PENDING_DOM_DRAFT_KEY);
      await chrome.storage.local.remove(PENDING_REPUBLISH_CONFIRM_KEY);
      setOverlayStatus("Sauvegarde échouée");
      appendOverlayLog("error", `Sauvegarde brouillon échouée: ${saved.reason}`);
      showBackupRecoveryActions(draft.itemId, { reason: saved.reason || "save draft failed" });
      return;
    }
    draftUrl = saved.draftUrl || draftUrl;
    appendOverlayLog("success", `Brouillon sauvegardé (${draftUrl})`);
    await updateBackupLifecycle(draft.itemId, {
      status: "DRAFT_SAVED",
      draftUrl,
      note: "Vinted draft saved; full local backup still retained",
    });
    if (allowDestructive) {
      const confirmState = (await chrome.storage.local.get(PENDING_REPUBLISH_CONFIRM_KEY))[PENDING_REPUBLISH_CONFIRM_KEY] || {};
      await chrome.storage.local.set({
        [PENDING_REPUBLISH_CONFIRM_KEY]: {
          ...confirmState,
          draftUrl,
          title: draft.title,
          originalItemId: draft.itemId,
          originalUrl: draft.originalUrl || `https://www.vinted.fr/items/${draft.itemId}`,
          backupId: draft.backupId,
        },
      });
    }
  } else {
    appendOverlayLog("warning", "autoSave désactivé — sauvegarde manuelle requise");
  }

  await chrome.storage.local.remove(PENDING_DOM_DRAFT_KEY);

  const lifecycleStatus = String(durableBackup?.lifecycle?.status || "");
  const shouldAutoPublish =
    Boolean(draft?.settings?.autoPublishAfterSave) ||
    Boolean(draft?.restoredFromBackup) ||
    Boolean(draft?.importedFromFile) ||
    [
      "PUBLISH_FAILED_AFTER_DELETE",
      "DELETED_AWAITING_PUBLISH",
      "PUBLISH_ONLY_FAILED",
      "IMPORTED",
      "RESTORING",
    ].includes(lifecycleStatus);

  if (shouldAutoPublish) {
    appendOverlayLog(
      "info",
      "Auto-publish: originale déjà gérée / restore — publication automatique du brouillon (pas de delete)"
    );
    setOverlayStatus("Publication auto…");
    await beginPublishOnly({
      draftUrl,
      title: draft.title,
      originalItemId: draft.itemId,
      backupId: draft.backupId,
    });
    return;
  }

  if (!allowDestructive) {
    setOverlayStatus("Brouillon prêt (safe)");
    appendOverlayLog(
      "warning",
      "Mode safe: active « Autoriser suppression + publication » dans le popup pour afficher le bouton de confirmation."
    );
    // Still offer one-click publish-only if a draft URL exists.
    showBackupRecoveryActions(draft.itemId, {
      draftUrl,
      reason: "",
    });
    return;
  }

  if (!backupHasRecoverablePhotos(durableBackup)) {
    setOverlayStatus("Backup photos manquant");
    appendOverlayLog("error", "Toggle destructif ON mais backup photos incomplet — confirmation bloquée");
    showBackupRecoveryActions(draft.itemId, { draftUrl, reason: "photos absentes du backup local" });
    return;
  }

  setOverlayStatus("Prêt à confirmer");
  showDestructiveConfirmButton({
    originalItemId: draft.itemId,
    originalUrl: draft.originalUrl || `https://www.vinted.fr/items/${draft.itemId}`,
    draftUrl,
    title: draft.title,
    backupId: draft.backupId,
  });
}

async function continuePendingRepublishConfirmIfNeeded() {
  const finish = (await chrome.storage.local.get(PENDING_REPUBLISH_FINISH_KEY))[PENDING_REPUBLISH_FINISH_KEY];
  if (finish?.allowDestructive) return; // destructive flow already running

  const result = await chrome.storage.local.get(PENDING_REPUBLISH_CONFIRM_KEY);
  const confirm = result[PENDING_REPUBLISH_CONFIRM_KEY];
  if (!confirm?.originalItemId) return;

  await restoreSessionLogs();
  resetOverlayDismissState();
  ensureOverlay();
  setOverlayStatus("Prêt à confirmer");
  if (window.location.href && (!confirm.draftUrl || confirm.draftUrl.includes("/items/new"))) {
    confirm.draftUrl = window.location.href;
    await chrome.storage.local.set({ [PENDING_REPUBLISH_CONFIRM_KEY]: confirm });
  }
  showDestructiveConfirmButton(confirm);
}

function findFieldContainerByLabel(labelText) {
  const fieldLabels = ["catégorie", "categorie", "marque", "état", "etat", "couleur", "matériau", "matière", "materiau", "matiere", "taille", "envoi", "format du colis", "colis", "prix", "titre", "description"];
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
  labels.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
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
  const eventInit = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new PointerEvent("pointerdown", eventInit));
  el.dispatchEvent(new MouseEvent("mousedown", eventInit));
  el.dispatchEvent(new PointerEvent("pointerup", eventInit));
  el.dispatchEvent(new MouseEvent("mouseup", eventInit));
  if (typeof el.click === "function") {
    el.click();
  } else {
    el.dispatchEvent(new MouseEvent("click", eventInit));
  }
}

function isOptionSelected(optionEl) {
  if (!optionEl) return false;
  const candidate = optionEl.closest("button, li, [role='option'], [role='button']") || optionEl;
  const ariaChecked = candidate.getAttribute("aria-checked");
  if (ariaChecked === "true") return true;
  const ariaSelected = candidate.getAttribute("aria-selected");
  if (ariaSelected === "true") return true;
  const checkedDescendant = candidate.querySelector?.("[aria-checked='true'], [aria-selected='true']");
  if (checkedDescendant) return true;
  const input = candidate.querySelector("input[type='radio'], input[type='checkbox']");
  if (input && input.checked) return true;
  return false;
}

async function waitForDropdownClose(timeoutMs = 1200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const open = Array.from(document.querySelectorAll('[role="listbox"], [role="option"], [aria-expanded="true"]'))
      .find((el) => {
        if (!el || !el.isConnected) return false;
        const rect = el.getBoundingClientRect?.();
        if (rect && (rect.width < 2 || rect.height < 2)) return false;
        const txt = (el.textContent || "").toLowerCase();
        if (txt.includes("copier logs") || txt.includes("copier backup")) return false;
        return true;
      });
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
  // Strip internal Vinted catalog code prefixes like "ATM T-shirts" → "T-shirts"
  // These are 2-5 uppercase letter codes that Vinted prepends internally.
  out = out.replace(/^[A-Z]{2,5}\s+/, "");
  return out;
}

async function closeOpenDropdown() {
  const eventInit = { key: "Escape", code: "Escape", bubbles: true, cancelable: true };
  const targets = Array.from(new Set([
    document.activeElement,
    document.body,
    document,
    window,
  ].filter(Boolean)));

  for (let i = 0; i < 2; i++) {
    for (const target of targets) {
      try {
        target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
        target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      } catch (_) {
        // Keep closing with other targets.
      }
    }
    await sleep(70);
  }

  try {
    document.activeElement?.blur?.();
  } catch (_) {
    // ignore
  }

  const expandedControls = Array.from(document.querySelectorAll("[aria-expanded='true']"))
    .filter((el) => {
      if (!el || !el.isConnected) return false;
      const rect = el.getBoundingClientRect?.();
      if (rect && (rect.width < 2 || rect.height < 2)) return false;
      const text = (el.textContent || "").toLowerCase();
      if (text.includes("copier logs") || text.includes("copier backup")) return false;
      return true;
    })
    .slice(0, 4);

  for (const control of expandedControls) {
    try {
      clickElementHard(control);
      await sleep(80);
    } catch (_) {
      // Keep trying other controls.
    }
  }

  if (!(await waitForDropdownClose(300))) {
    const neutralTarget = document.querySelector("h1, main, form") || document.body;
    try {
      neutralTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      neutralTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      neutralTarget.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } catch (_) {
      // ignore
    }
  }
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
  labels.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
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
        id.startsWith("material-") ||
        id.startsWith("size-") ||
        id.startsWith("brand-") ||
        id.startsWith("package-size-") ||
        id.startsWith("package_size-")
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
  if (key.includes("taille") || key.includes("size") || key.includes("pointure")) {
    return document.querySelector("input#size-search-input, input[name*='size'][type='text'], input[id*='size'][id*='search']");
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
  if (!container && typeof document === "undefined") return null;
  const expected = String(value || "").trim();
  const expectedNorm = normalizeComparableText(expected);
  if (!expectedNorm) return null;

  // Synonyms and variations for Vinted colors
  const synonyms = [expectedNorm];
  if (expectedNorm === "beige") synonyms.push("creme", "ecru", "sable", "beige / creme");
  if (expectedNorm === "rouge") synonyms.push("bordeaux", "corail", "pourpre", "framboise");
  if (expectedNorm === "bleu") synonyms.push("marine", "azur", "turquoise", "bleu marine", "bleu ciel");
  if (expectedNorm === "marron") synonyms.push("chocolat", "brun", "camel", "cognac", "noisette");
  if (expectedNorm === "gris") synonyms.push("anthracite", "argent", "gris clair", "gris chine");
  if (expectedNorm === "rose") synonyms.push("fuchsia", "saumon", "poudre", "rose pale");
  if (expectedNorm === "vert") synonyms.push("kaki", "olive", "menthe", "vert d'eau", "sapin");
  if (expectedNorm === "orange") synonyms.push("abricot", "peche", "rouille", "cuivre");
  if (expectedNorm === "jaune") synonyms.push("moutarde", "dore", "or");

  const collectCandidates = (root) => {
    if (!root) return [];
    return Array.from(
      root.querySelectorAll(
        "button, [role='button'], [role='checkbox'], [role='option'], [role='radio'], li, label, div[class*='option'], div[class*='FilterGrid'], div[class*='Cell'], div[class*='Item'], [id^='suggested-'], [id^='catalog-'], [id^='condition-'], [id^='color-'], [id^='material-'], [id^='size-'], [id^='brand-']"
      )
    ).filter((el) => {
      if (!el || !el.isConnected) return false;
      const rect = el.getBoundingClientRect?.();
      if (rect && (rect.width < 2 || rect.height < 2)) return false;
      const txt = (el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
      if (!txt) return false;
      const low = txt.toLowerCase();
      if (low.includes("copier logs") || low.includes("copier backup")) return false;
      if ((el.className || "").toString().includes("c-input__icon")) return false;
      return true;
    });
  };

  const candidates = [
    ...(container ? collectCandidates(container) : []),
    ...(typeof document !== "undefined" ? collectCandidates(document) : []),
  ].filter((el, idx, arr) => arr.indexOf(el) === idx);

  // 1. Exact match on direct text or aria-label
  for (const syn of synonyms) {
    const exact = candidates.find((el) => {
      const t = normalizeComparableText(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "");
      return t === syn;
    });
    if (exact) return exact;
  }

  // 2. StartsWith or includes match
  for (const syn of synonyms) {
    const partial = candidates.find((el) => {
      const t = normalizeComparableText(el.textContent || el.getAttribute("aria-label") || "");
      return t.startsWith(syn) || t.includes(syn);
    });
    if (partial) return partial;
  }

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
    const rawTxt = (el.textContent || "").trim();
    const txt = normalizeComparableText(rawTxt);
    if (!txt) return false;
    // Exclude overlay/extension buttons
    if (txt.includes("copier logs") || txt.includes("copier backup")) return false;
    if (txt.includes("preuves d'authenticite")) return false;
    // Exclude form input labels (title, description, price) — their text is long
    // and may contain condition keywords by coincidence.
    if (rawTxt.length > 250) return false;
    // Exclude elements that contain a textarea or text input (form fields, not options)
    if (el.querySelector && el.querySelector("textarea, input[type='text']")) return false;
    // Exclude label elements for form inputs (class web_ui__Input__input)
    const cls = (el.className || "").toString();
    if (cls.includes("Input__input") || cls.includes("Input__wide")) return false;
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

function initInPageVaultButtons() {
  const href = window.location.href;

  // 1) Sur une page d'annonce: /items/<id> (pas /new, pas /edit, pas /draft)
  const isItemPage = /\/items\/(\d+)/.test(href) && !href.includes("/new") && !href.includes("/edit") && !href.includes("/draft");
  if (isItemPage && !document.getElementById("vinted-vault-page-action")) {
    const match = href.match(/\/items\/(\d+)/);
    const currentItemId = match ? match[1] : null;

    const btn = document.createElement("button");
    btn.id = "vinted-vault-page-action";
    btn.innerHTML = `<span style="font-size:15px;">📦</span> Sauvegarder dans le Coffre-fort`;
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "22px",
      right: "22px",
      zIndex: "2147483640",
      background: "#0aa3ad",
      color: "#ffffff",
      border: "none",
      borderRadius: "30px",
      padding: "11px 18px",
      fontSize: "13px",
      fontWeight: "600",
      boxShadow: "0 6px 20px rgba(10, 163, 173, 0.4)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    });

    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "translateY(-2px) scale(1.02)";
      btn.style.boxShadow = "0 8px 24px rgba(10, 163, 173, 0.55)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translateY(0) scale(1)";
      btn.style.boxShadow = "0 6px 20px rgba(10, 163, 173, 0.4)";
    });

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<span>⏳</span> Sauvegarde en cours...`;
      btn.style.background = "#0284c7";
      try {
        const res = await saveItemToVault(currentItemId, null, { applyImageMods: true });
        btn.innerHTML = `✅ Sauvegardé (${res.photoCount} photos) !`;
        btn.style.background = "#16a34a";
        setTimeout(() => {
          btn.innerHTML = `<span style="font-size:15px;">📦</span> Sauvegardé (Coffre-fort)`;
          btn.style.background = "#0aa3ad";
          btn.disabled = false;
        }, 3500);
      } catch (err) {
        btn.innerHTML = `❌ Erreur (${err.message.slice(0, 24)})`;
        btn.style.background = "#dc2626";
        setTimeout(() => {
          btn.innerHTML = `<span style="font-size:15px;">📦</span> Sauvegarder dans le Coffre-fort`;
          btn.style.background = "#0aa3ad";
          btn.disabled = false;
        }, 4000);
      }
    });

    document.body.appendChild(btn);
  }

  // 2) Sur la page /items/new: afficher bandeau de pré-remplissage depuis le coffre-fort
  if (href.includes("/items/new") && !document.getElementById("vinted-vault-prefill-banner")) {
    chrome.storage.local.get(REPUBLISH_BACKUP_INDEX_KEY).then((data) => {
      const index = Array.isArray(data[REPUBLISH_BACKUP_INDEX_KEY]) ? data[REPUBLISH_BACKUP_INDEX_KEY] : [];
      if (!index.length) return;

      const banner = document.createElement("div");
      banner.id = "vinted-vault-prefill-banner";
      banner.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:8px;background:#0aa3ad;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;">📦</div>
            <div>
              <div style="font-size:13px;font-weight:700;color:#0f172a;">Vinted Republisher PRO · Coffre-fort</div>
              <div style="font-size:12px;color:#475569;">Pré-remplissez tous les champs et photos depuis vos annonces sauvegardées</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select id="vinted-vault-banner-select" style="font-size:12px;padding:7px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#1e293b;max-width:280px;font-weight:500;">
              ${index.map(it => `<option value="${it.itemId}">${(it.title || 'Article #' + it.itemId).slice(0, 32)} (${it.price ? it.price + '€' : 'sans prix'}${it.brand ? ' · ' + it.brand : ''})</option>`).join("")}
            </select>
            <button id="vinted-vault-banner-fill-btn" style="background:#0aa3ad;color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background 0.2s;">
              ⚡ Pré-remplir l'annonce
            </button>
          </div>
        </div>
      `;

      Object.assign(banner.style, {
        margin: "14px auto 18px",
        maxWidth: "960px",
        padding: "12px 18px",
        background: "linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)",
        border: "1px solid #99f6e4",
        borderRadius: "12px",
        boxShadow: "0 4px 14px rgba(10, 163, 173, 0.12)",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      });

      const container = document.querySelector('form, [data-testid*="upload-form"], main') || document.body;
      container.prepend(banner);

      document.getElementById("vinted-vault-banner-fill-btn")?.addEventListener("click", async () => {
        const select = document.getElementById("vinted-vault-banner-select");
        const chosenId = select?.value;
        if (!chosenId) return;
        const fillBtn = document.getElementById("vinted-vault-banner-fill-btn");
        fillBtn.disabled = true;
        fillBtn.textContent = "⏳ Préparation des photos & données...";
        try {
          const key = `${REPUBLISH_BACKUP_PREFIX}${chosenId}`;
          const stored = await chrome.storage.local.get(key);
          const backup = stored[key];
          if (!backup) throw new Error("Annonce introuvable dans le coffre-fort local");

          const files = backupRecoveryFiles(backup).map((file, idx) => ({
            name: file.name || `photo_${idx}.jpg`,
            type: file.type || "image/jpeg",
            dataUrl: file.dataUrl,
          }));

          await chrome.storage.local.set({
            [PENDING_DOM_DRAFT_KEY]: {
              ...backup.item,
              backupId: backup.backupId,
              preparedAt: Date.now(),
              settings: { autoSave: false, allowDestructiveRepublish: false },
              files,
            }
          });

          fillBtn.textContent = "⚙️ Remplissage des champs...";
          await continuePendingDomDraftIfNeeded();
          fillBtn.textContent = "✅ Formulaire rempli avec succès !";
          fillBtn.style.background = "#16a34a";
        } catch (err) {
          fillBtn.textContent = "❌ " + err.message;
          fillBtn.style.background = "#dc2626";
          fillBtn.disabled = false;
        }
      });
    });
  }
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
  continuePendingRepublishFinishIfNeeded().catch((error) => {
    ensureOverlay();
    setOverlayStatus("Erreur");
    appendOverlayLog("error", error.message || "Erreur fin de republication");
  });
  continuePendingRepublishConfirmIfNeeded().catch(() => {});
  continuePendingDomDraftIfNeeded().catch((error) => {
    ensureOverlay();
    setOverlayStatus("Erreur");
    appendOverlayLog("error", error.message || "Erreur remplissage brouillon");
  });
  initInPageVaultButtons();
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
// Legacy helper — MUST NOT return true on confirm click alone (caused false "deleted" logs).
async function deleteProduct() {
  console.log("🗑️ Starting deletion via deleteOriginalListing (strict verify)...");
  const itemId = extractItemIdFromUrl(window.location.href);
  const result = await deleteOriginalListing(itemId, "");
  return Boolean(result?.success);
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
    resetOverlayDismissState();
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
    startSafeDomDraft(req.itemId, req.item, req.settings)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        appendOverlayLog("error", error.message || "Erreur mode safe DOM");
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (req.action === "FINISH_FROM_CURRENT_DRAFT") {
    offerFinalizeFromCurrentDraft({ source: "popup" })
      .then((result) => sendResponse(result))
      .catch((error) => {
        appendOverlayLog("error", error.message || "Finalisation impossible");
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (req.action === "PUBLISH_CURRENT_DRAFT") {
    beginPublishOnly({
      draftUrl: req.draftUrl || window.location.href,
      title: req.title || "",
      originalItemId: req.itemId || null,
      backupId: req.backupId || null,
    })
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        appendOverlayLog("error", error.message || "Publication impossible");
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (req.action === "START_SCHEMA_CRAWL") {
    if (typeof window.vintedRunSchemaCrawler !== "function") {
      sendResponse({ success: false, error: "vinted-schema-crawler.js non chargé" });
      return true;
    }
    window.vintedRunSchemaCrawler(req.options || {})
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => {
        appendOverlayLog("error", error.message || "Erreur cartographie schémas");
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

  if (req.action === "SAVE_CURRENT_PAGE_TO_VAULT") {
    saveItemToVault(req.itemId || null, req.item || null, req.options || {})
      .then((res) => sendResponse(res))
      .catch((err) => {
        appendOverlayLog("error", err.message || "Erreur sauvegarde coffre-fort");
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (req.action === "SAVE_LISTING_BY_ID_TO_VAULT") {
    saveItemToVault(req.itemId, req.item, req.options || {})
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
