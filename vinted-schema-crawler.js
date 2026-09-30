(function () {
  "use strict";

  const CRAWL_STATE_KEY = "vinted_schema_crawl_state_v1";
  const CRAWL_RESULT_KEY = "vinted_schema_crawl_last_result_v1";

  const FALLBACK_PROBES = [
    { catalogId: "221", category: "T-shirts", catalogBranchTitles: ["Femmes", "Vêtements", "Hauts et t-shirts", "T-shirts"] },
    { catalogId: "574", category: "Robes", catalogBranchTitles: ["Femmes", "Vêtements", "Robes"] },
    { catalogId: "2632", category: "Baskets", catalogBranchTitles: ["Femmes", "Chaussures", "Baskets"] },
    { catalogId: "156", category: "Sacs à main", catalogBranchTitles: ["Femmes", "Sacs", "Sacs à main"] },
    { catalogId: "1940", category: "Vases", catalogBranchTitles: ["Maison", "Décoration", "Vases"] },
    { catalogId: "3661", category: "Téléphones portables", catalogBranchTitles: ["Électronique", "Téléphones portables et équipements de communication", "Téléphones portables"] },
    { catalogId: "3345", category: "Jouets de bain", catalogBranchTitles: ["Enfants", "Jeux et jouets", "Activités et jouets pour bébé", "Jouets de bain"] },
  ];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function log(level, message) {
    if (typeof window.appendOverlayLog === "function") {
      window.appendOverlayLog(level, `[SchemaCrawler] ${message}`);
    } else {
      console.log(`[SchemaCrawler][${level}] ${message}`);
    }
  }

  function status(message) {
    if (typeof window.setOverlayStatus === "function") {
      window.setOverlayStatus(message);
    }
  }

  function normalizeText(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function compactText(text, maxLen = 120) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
  }

  function isItemsNewPage() {
    return /\/items\/new(?:\?|#|$)/.test(window.location.pathname + window.location.search + window.location.hash);
  }

  function getNodeId(node) {
    return node?.id ?? node?.catalog_id ?? node?.catalogId ?? node?.value ?? null;
  }

  function getNodeTitle(node) {
    return node?.title ?? node?.name ?? node?.label ?? node?.localized_title ?? node?.catalog_title ?? "";
  }

  function getNodeChildren(node) {
    const keys = ["children", "catalogs", "categories", "catalog_children", "subcategories"];
    for (const key of keys) {
      if (Array.isArray(node?.[key])) return node[key];
    }
    return [];
  }

  function flattenCatalogTree(root) {
    const roots = Array.isArray(root)
      ? root
      : Array.isArray(root?.catalogs)
        ? root.catalogs
        : Array.isArray(root?.categories)
          ? root.categories
          : Array.isArray(root?.items)
            ? root.items
            : [];
    const out = [];

    const walk = (node, branch) => {
      if (!node || typeof node !== "object") return;
      const title = String(getNodeTitle(node) || "").trim();
      const id = getNodeId(node);
      const nextBranch = title ? [...branch, title] : branch;
      const children = getNodeChildren(node);
      if (children.length > 0) {
        children.forEach((child) => walk(child, nextBranch));
        return;
      }
      if (!title || !id) return;
      out.push({
        catalogId: String(id),
        category: title,
        catalogBranchTitles: nextBranch,
      });
    };

    roots.forEach((node) => walk(node, []));
    return dedupeProbes(out);
  }

  function dedupeProbes(probes) {
    const seen = new Set();
    return probes.filter((probe) => {
      const key = String(probe.catalogId || `${probe.catalogBranchTitles?.join(">")}:${probe.category}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(probe.category && Array.isArray(probe.catalogBranchTitles) && probe.catalogBranchTitles.length > 0);
    });
  }

  async function fetchJsonCandidate(path) {
    const response = await fetch(path, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
    return response.json();
  }

  async function fetchCatalogProbesFromApi() {
    const endpoints = [
      "/api/v2/catalogs",
      "/api/v2/catalogs?locale=fr",
      "/api/v2/catalogs/root",
      "/api/v2/catalogs/tree",
      "/api/v2/catalogs/list",
    ];

    const attempts = [];
    for (const endpoint of endpoints) {
      try {
        const data = await fetchJsonCandidate(endpoint);
        const probes = flattenCatalogTree(data);
        if (probes.length > 0) {
          log("success", `Catalogue récupéré via ${endpoint}: ${probes.length} catégorie(s) feuille`);
          return probes;
        }
        attempts.push(`${endpoint}: JSON sans arbre`);
      } catch (error) {
        attempts.push(error.message || String(error));
      }
    }

    log("warning", `Catalogue API indisponible, fallback probes (${attempts.slice(0, 2).join(" | ")})`);
    return [];
  }

  function rankProbe(probe) {
    const branch = normalizeText((probe.catalogBranchTitles || []).join(" > "));
    const leaf = normalizeText(probe.category);
    let score = 0;
    if (/femme|homme|vetement|chaussure|accessoire|maison|electronique|enfant|bebe|sport/.test(branch)) score += 20;
    if (/t-shirt|robe|basket|sac|decoration|smartphone|jouet|manteau|pantalon|livre/.test(leaf)) score += 15;
    score -= Math.max(0, (probe.catalogBranchTitles || []).length - 4);
    return score;
  }

  function selectProbeSet(probes, options = {}) {
    const maxCategories = Number(options.maxCategories ?? 80);
    const includeAll = maxCategories <= 0;
    const preferred = dedupeProbes([...FALLBACK_PROBES, ...probes]);
    preferred.sort((a, b) => rankProbe(b) - rankProbe(a));
    return includeAll ? preferred : preferred.slice(0, maxCategories);
  }

  async function getProbeSet(options = {}) {
    const apiProbes = options.useApi === false ? [] : await fetchCatalogProbesFromApi();
    return selectProbeSet(apiProbes, options);
  }

  async function runProbe(probe, index, total) {
    status(`Cartographie ${index + 1}/${total}`);
    log("info", `${index + 1}/${total}: ${compactText((probe.catalogBranchTitles || []).join(" > "))}`);

    const selectCategory = window.vintedSelectCategoryForSchemaCrawler;
    const discoverSchema = window.vintedDiscoverSchemaFromCurrentDom;
    const saveSchema = window.vintedSaveDiscoveredSchema;

    if (typeof selectCategory !== "function") {
      return { success: false, probe, reason: "vintedSelectCategoryForSchemaCrawler indisponible" };
    }
    if (typeof discoverSchema !== "function" || typeof saveSchema !== "function") {
      return { success: false, probe, reason: "schema discovery/store indisponible" };
    }

    const draft = {
      catalogId: probe.catalogId || null,
      category: probe.category,
      catalogBranchTitles: probe.catalogBranchTitles || [probe.category],
      title: "Schema probe",
      description: "Schema probe",
      price: "1",
    };

    const selected = await selectCategory(draft);
    if (selected?.catalogId && /^\d+$/.test(String(selected.catalogId))) {
      draft.catalogId = String(selected.catalogId);
    }
    if (!selected?.success) {
      await sleep(1600);
      const fallbackSchema = await discoverSchema(draft, { assumeCategorySelected: true });
      const discoveredFields = Object.keys(fallbackSchema?.fields || {});
      const hasPostCategoryFields = discoveredFields.some((fieldId) => !["title", "description", "price", "category"].includes(fieldId));
      if (!hasPostCategoryFields) {
        return { success: false, probe, catalogId: draft.catalogId, reason: selected?.reason || "Catégorie non sélectionnée" };
      }
      fallbackSchema.selectionWarning = selected?.reason || "Catégorie non validée mais schéma post-catégorie détecté";
      const savedFallback = await saveSchema(fallbackSchema);
      return {
        success: Boolean(savedFallback?.success),
        probe,
        warning: fallbackSchema.selectionWarning,
        reason: savedFallback?.success ? null : savedFallback?.reason || "Sauvegarde schéma impossible",
        schema: {
          catalogId: fallbackSchema.catalogId,
          categoryTitle: fallbackSchema.categoryTitle,
          fieldOrder: fallbackSchema.fieldOrder,
          fields: discoveredFields,
        },
      };
    }

    await sleep(1200);
    const schema = await discoverSchema(draft, { assumeCategorySelected: true });
    if (!schema?.fields || Object.keys(schema.fields).length === 0) {
      return { success: false, probe, reason: "Aucun champ découvert après sélection" };
    }

    const saved = await saveSchema(schema);
    if (!saved?.success) {
      return { success: false, probe, reason: saved?.reason || "Sauvegarde schéma impossible" };
    }

    return {
      success: true,
      probe,
      schema: {
        catalogId: schema.catalogId,
        categoryTitle: schema.categoryTitle,
        fieldOrder: schema.fieldOrder,
        fields: Object.keys(schema.fields),
      },
    };
  }

  async function exportLocalSchemas() {
    const out = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: "vinted-schema-crawler",
      schemas: {},
    };

    const storage = await chrome.storage.local.get("vinted_form_schema_cache_v1");
    const cache = storage.vinted_form_schema_cache_v1;
    if (cache?.schemas && typeof cache.schemas === "object") {
      out.schemas = cache.schemas;
    }
    return out;
  }

  async function runCrawlerNow(options = {}) {
    if (typeof window.resetOverlayDismissState === "function") window.resetOverlayDismissState();
    if (typeof window.ensureOverlay === "function") window.ensureOverlay();
    status("Cartographie schémas");

    const probes = await getProbeSet(options);
    const results = [];
    log("info", `Démarrage cartographie: ${probes.length} catégorie(s)`);

    for (let i = 0; i < probes.length; i++) {
      try {
        results.push(await runProbe(probes[i], i, probes.length));
      } catch (error) {
        results.push({ success: false, probe: probes[i], reason: error.message || String(error) });
      }
      await sleep(Number(options.delayMs ?? 900));
    }

    const exportedSchemas = await exportLocalSchemas();
    const summary = {
      success: true,
      startedAt: options.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
      exportedSchemas,
    };

    await chrome.storage.local.set({ [CRAWL_RESULT_KEY]: summary });
    await chrome.storage.local.remove(CRAWL_STATE_KEY);
    log("success", `Cartographie terminée: ${summary.succeeded}/${summary.total} schéma(s)`);
    status("Cartographie terminée");
    return summary;
  }

  async function startCrawler(options = {}) {
    const state = {
      active: true,
      options: {
        maxCategories: Number(options.maxCategories ?? 80),
        delayMs: Number(options.delayMs ?? 900),
        useApi: options.useApi !== false,
        startedAt: new Date().toISOString(),
      },
    };

    await chrome.storage.local.set({ [CRAWL_STATE_KEY]: state });

    if (!isItemsNewPage()) {
      window.location.href = `${window.location.origin}/items/new`;
      return { success: true, navigated: true, message: "Navigation vers /items/new, cartographie au chargement" };
    }

    return runCrawlerNow(state.options);
  }

  async function continuePendingCrawlerIfNeeded() {
    try {
      const stored = await chrome.storage.local.get(CRAWL_STATE_KEY);
      const state = stored?.[CRAWL_STATE_KEY];
      if (!state?.active || !isItemsNewPage()) return;
      await sleep(1800);
      await runCrawlerNow(state.options || {});
    } catch (error) {
      log("error", `Reprise cartographie impossible: ${error.message || error}`);
    }
  }

  window.vintedRunSchemaCrawler = startCrawler;
  window.vintedExportLocalSchemas = exportLocalSchemas;
  window.vintedContinuePendingSchemaCrawlerIfNeeded = continuePendingCrawlerIfNeeded;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", continuePendingCrawlerIfNeeded, { once: true });
  } else {
    continuePendingCrawlerIfNeeded();
  }
})();
