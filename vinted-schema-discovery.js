(function () {
  "use strict";

  function normalizeText(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\(.*?\)/g, "")
      .replace(/\s*:\s*$/, "")
      .trim()
      .toLowerCase();
  }

  function compactText(text, maxLen = 180) {
    const out = String(text || "").replace(/\s+/g, " ").trim();
    return out.length > maxLen ? `${out.slice(0, maxLen)}...` : out;
  }

  function globalFn(name) {
    return globalThis?.[name] || window?.[name] || null;
  }

  function isExcludedSurface(el) {
    let node = el;
    while (node) {
      const id = (node.id || "").toLowerCase();
      const cls = (node.className || "").toString().toLowerCase();
      const testId = (node.getAttribute?.("data-testid") || "").toLowerCase();
      if (
        id.startsWith("onetrust") ||
        id.startsWith("ot-") ||
        cls.includes("onetrust") ||
        cls.includes("ot-sdk") ||
        testId.includes("cookie") ||
        testId.includes("consent")
      ) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function visible(el) {
    if (!el || !el.isConnected || isExcludedSurface(el)) return false;
    const rect = el.getBoundingClientRect?.();
    return !rect || (rect.width > 2 && rect.height > 2);
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function stableSelector(el) {
    if (!el || !el.tagName) return null;
    const tag = el.tagName.toLowerCase();
    const testId = el.getAttribute?.("data-testid");
    const name = el.getAttribute?.("name");
    const role = el.getAttribute?.("role");
    if (el.id) return `${tag}#${cssEscape(el.id)}`;
    if (testId) return `${tag}[data-testid="${testId}"]`;
    if (name) return `${tag}[name="${name}"]`;
    if (role) return `${tag}[role="${role}"]`;
    return tag;
  }

  function getDisplayText(container) {
    if (!container) return "";
    const getVisibleText = globalFn("getVisibleText");
    if (typeof getVisibleText === "function") {
      return compactText(getVisibleText(container));
    }
    return compactText(container.textContent || "");
  }

  function findContainerForSpec(spec) {
    const labels = [spec.label, ...(spec.labelAliases || [])].filter(Boolean);
    const findFieldContainerByLabel = globalFn("findFieldContainerByLabel");
    for (const label of labels) {
      try {
        const container = findFieldContainerByLabel?.(label);
        if (container && visible(container)) return { container, detectedLabel: label };
      } catch (_) {
        // Keep probing aliases.
      }
    }
    return { container: null, detectedLabel: null };
  }

  function hasFieldControl(container, spec) {
    if (!container) return false;
    if (spec.selector && document.querySelector(spec.selector)) return true;
    return Boolean(container.querySelector(
      "input, textarea, [contenteditable='true'], [role='combobox'], button, [role='button'], [aria-expanded]"
    ));
  }

  function inferWidget(fieldId, spec, container) {
    if (!container) return spec.widget;
    if (fieldId === "title" || fieldId === "description" || fieldId === "price") return "textInput";
    const hasCombobox = Boolean(container.querySelector("[role='combobox'], input[aria-controls]"));
    const checkboxCount = container.querySelectorAll("input[type='checkbox'], [role='checkbox']").length;
    const radioCount = container.querySelectorAll("input[type='radio'], [role='radio']").length;
    if (hasCombobox && fieldId === "category") return "categorySearch";
    if (hasCombobox && fieldId === "brand") return "brandSearch";
    if (checkboxCount > 1) return "multiSelect";
    if (radioCount > 0) return "singleSelect";
    return spec.widget;
  }

  function detectRequired(container, spec) {
    if (spec.required) return true;
    if (!container) return false;
    const requiredControl = container.querySelector("[required], [aria-required='true']");
    if (requiredControl) return true;
    const txt = normalizeText(container.textContent || "");
    return txt.includes("obligatoire") || txt.includes("required");
  }

  function collectOptionPreview(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll("[role='option'], li, button, [role='checkbox'], [role='radio']"))
      .filter(visible)
      .map((el) => compactText(el.textContent || "", 80))
      .filter(Boolean)
      .filter((txt, idx, arr) => arr.indexOf(txt) === idx)
      .slice(0, 12);
  }

  function getCatalogId(draft) {
    return window.vintedNormalizeCatalogId?.(draft?.catalogId) || String(draft?.catalogId || "").trim() || null;
  }

  function categoryLooksSelected(draft) {
    const expected = normalizeText(draft?.category || "");
    const categorySpec = window.VINTED_FIELD_SPECS?.category;
    if (!categorySpec) return false;
    const { container } = findContainerForSpec(categorySpec);
    const rowText = normalizeText(getDisplayText(container));
    if (expected && rowText.includes(expected) && !rowText.includes("selectionne")) return true;
    const committed = document.querySelector(categorySpec.committedSelector || "input#catalog");
    const value = normalizeText(committed?.value || committed?.getAttribute?.("value") || "");
    return Boolean(value && value !== "0" && value !== "false");
  }

  async function discoverSchemaFromCurrentDom(draft = {}, options = {}) {
    const fieldSpecs = window.VINTED_FIELD_SPECS;
    if (!fieldSpecs) return null;
    const catalogId = getCatalogId(draft);
    if (!catalogId && options.requireCatalogId !== false) return null;
    if (options.requireSelectedCategory && !categoryLooksSelected(draft)) return null;

    const fields = {};
    const fieldOrder = [];

    for (const [fieldId, spec] of Object.entries(fieldSpecs)) {
      const { container, detectedLabel } = findContainerForSpec(spec);
      const selectorControl = spec.selector ? document.querySelector(spec.selector) : null;
      const controlRoot = container || selectorControl?.parentElement || null;
      if (!selectorControl && !hasFieldControl(container, spec)) continue;

      const inputs = controlRoot
        ? Array.from(controlRoot.querySelectorAll("input, textarea, [contenteditable='true'], [role='combobox'], button, [role='button']"))
            .filter(visible)
            .slice(0, 8)
        : [];

      fields[fieldId] = {
        id: fieldId,
        label: spec.label,
        labelAliases: spec.labelAliases || [],
        detectedLabel: detectedLabel || spec.label,
        widget: inferWidget(fieldId, spec, controlRoot),
        required: detectRequired(controlRoot, spec),
        selectors: {
          container: stableSelector(controlRoot),
          primary: stableSelector(selectorControl || inputs[0]),
          committed: spec.committedSelector || null,
        },
        domIdPrefixes: spec.domIdPrefixes || [],
        displayText: getDisplayText(controlRoot),
        optionPreview: collectOptionPreview(controlRoot),
      };
      fieldOrder.push(fieldId);
    }

    const schema = {
      version: 1,
      source: "dom-discovery",
      schemaSource: "dom-discovery",
      catalogId,
      categoryTitle: draft?.category || "",
      catalogBranchTitles: Array.isArray(draft?.catalogBranchTitles) ? draft.catalogBranchTitles : [],
      discoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locale: document.documentElement?.getAttribute?.("lang") || window.navigator?.language || "",
      url: window.location?.href || "",
      isComplete: categoryLooksSelected(draft) || Boolean(options.assumeCategorySelected),
      fields,
      fieldOrder,
      fingerprint: {
        labels: fieldOrder.map((id) => fields[id]?.detectedLabel || fields[id]?.label).filter(Boolean),
        widgets: fieldOrder.reduce((acc, id) => {
          acc[id] = fields[id].widget;
          return acc;
        }, {}),
      },
    };

    const appendOverlayLog = globalFn("appendOverlayLog");
    if (typeof appendOverlayLog === "function") {
      appendOverlayLog(
        "info",
        `Schéma DOM découvert (${catalogId || "sans catalogId"}): ${fieldOrder.join(", ") || "aucun champ"}`
      );
    }
    return schema;
  }

  window.vintedDiscoverSchemaFromCurrentDom = discoverSchemaFromCurrentDom;
})();
