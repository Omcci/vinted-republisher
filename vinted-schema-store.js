(function () {
  "use strict";

  const STORAGE_KEY = "vinted_form_schema_cache_v1";
  const GENERATED_SCHEMA_FILE = "vinted-form-schemas.generated.json";
  const EMPTY_SCHEMA_DB = {
    version: 1,
    generatedAt: null,
    source: "empty",
    schemas: {},
  };

  let generatedDbPromise = null;
  let localDbPromise = null;

  function normalizeCatalogId(catalogId) {
    const value = String(catalogId || "").trim();
    return value || null;
  }

  function normalizeText(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function branchKey(titles) {
    return Array.isArray(titles)
      ? titles.map(normalizeText).filter(Boolean).join(">")
      : "";
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function cloneJson(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  async function readGeneratedSchemaDb() {
    if (generatedDbPromise) return generatedDbPromise;
    generatedDbPromise = (async () => {
      try {
        if (typeof fetch !== "function") return EMPTY_SCHEMA_DB;
        const url = chrome?.runtime?.getURL
          ? chrome.runtime.getURL(GENERATED_SCHEMA_FILE)
          : GENERATED_SCHEMA_FILE;
        const response = await fetch(url);
        if (!response.ok) return EMPTY_SCHEMA_DB;
        const parsed = await response.json();
        if (!parsed || typeof parsed !== "object") return EMPTY_SCHEMA_DB;
        return {
          ...EMPTY_SCHEMA_DB,
          ...parsed,
          schemas: parsed.schemas && typeof parsed.schemas === "object" ? parsed.schemas : {},
        };
      } catch (_) {
        return EMPTY_SCHEMA_DB;
      }
    })();
    return generatedDbPromise;
  }

  async function readLocalSchemaDb() {
    if (localDbPromise) return localDbPromise;
    localDbPromise = (async () => {
      try {
        if (!chrome?.storage?.local?.get) return EMPTY_SCHEMA_DB;
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const parsed = result?.[STORAGE_KEY];
        if (!parsed || typeof parsed !== "object") return EMPTY_SCHEMA_DB;
        return {
          ...EMPTY_SCHEMA_DB,
          ...parsed,
          schemas: parsed.schemas && typeof parsed.schemas === "object" ? parsed.schemas : {},
        };
      } catch (_) {
        return EMPTY_SCHEMA_DB;
      }
    })();
    return localDbPromise;
  }

  async function writeLocalSchemaDb(db) {
    localDbPromise = Promise.resolve(db);
    if (!chrome?.storage?.local?.set) return false;
    await chrome.storage.local.set({ [STORAGE_KEY]: db });
    return true;
  }

  function normalizeSchema(schema) {
    if (!schema || typeof schema !== "object") return null;
    const catalogId = normalizeCatalogId(schema.catalogId);
    if (!catalogId) return null;
    const fields = schema.fields && typeof schema.fields === "object" ? schema.fields : {};
    return {
      version: 1,
      ...cloneJson(schema),
      catalogId,
      fields,
      fieldOrder: Array.isArray(schema.fieldOrder)
        ? schema.fieldOrder.filter(Boolean)
        : Object.keys(fields),
    };
  }

  async function getSchemaForCatalogId(catalogId) {
    const key = normalizeCatalogId(catalogId);
    if (!key) return null;

    const localDb = await readLocalSchemaDb();
    const localSchema = normalizeSchema(localDb.schemas?.[key]);
    if (localSchema) return { ...localSchema, schemaSource: "local-cache" };

    const generatedDb = await readGeneratedSchemaDb();
    const generatedSchema = normalizeSchema(generatedDb.schemas?.[key]);
    if (generatedSchema) return { ...generatedSchema, schemaSource: "generated" };

    return null;
  }

  async function findSchemaForDraft(draft = {}) {
    const direct = await getSchemaForCatalogId(draft.catalogId);
    if (direct) return direct;

    const localDb = await readLocalSchemaDb();
    const generatedDb = await readGeneratedSchemaDb();
    const schemas = [
      ...Object.values(localDb.schemas || {}).map((schema) => ({ schema, source: "local-cache" })),
      ...Object.values(generatedDb.schemas || {}).map((schema) => ({ schema, source: "generated" })),
    ];

    const expectedBranch = branchKey(draft.catalogBranchTitles);
    const expectedCategory = normalizeText(draft.category);

    if (expectedBranch) {
      for (const entry of schemas) {
        const schema = normalizeSchema(entry.schema);
        if (!schema) continue;
        if (branchKey(schema.catalogBranchTitles) === expectedBranch) {
          return { ...schema, schemaSource: entry.source };
        }
      }
    }

    if (expectedCategory) {
      const categoryMatches = schemas
        .map((entry) => {
          const schema = normalizeSchema(entry.schema);
          return schema ? { schema, source: entry.source } : null;
        })
        .filter(Boolean)
        .filter(({ schema }) => {
          const title = normalizeText(schema.categoryTitle);
          const leaf = normalizeText(schema.catalogBranchTitles?.[schema.catalogBranchTitles.length - 1]);
          return title === expectedCategory || leaf === expectedCategory;
        });
      if (categoryMatches.length === 1) {
        return { ...categoryMatches[0].schema, schemaSource: categoryMatches[0].source };
      }
    }

    return null;
  }

  async function saveSchema(schema) {
    const normalized = normalizeSchema(schema);
    if (!normalized) return { success: false, reason: "Schéma sans catalogId" };

    const localDb = await readLocalSchemaDb();
    const existing = localDb.schemas?.[normalized.catalogId] || {};
    const nextSchema = {
      ...existing,
      ...normalized,
      schemaSource: "local-cache",
      discoveredAt: existing.discoveredAt || normalized.discoveredAt || nowIso(),
      updatedAt: nowIso(),
    };

    const nextDb = {
      version: 1,
      source: "local-cache",
      generatedAt: localDb.generatedAt || null,
      updatedAt: nowIso(),
      schemas: {
        ...(localDb.schemas || {}),
        [normalized.catalogId]: nextSchema,
      },
    };

    await writeLocalSchemaDb(nextDb);
    return { success: true, schema: nextSchema };
  }

  function getDraftValue(draft, fieldId) {
    if (typeof window.vintedGetDraftValue === "function") {
      return window.vintedGetDraftValue(draft, fieldId);
    }
    switch (fieldId) {
      case "category": return draft?.category || null;
      case "brand": return draft?.brand || null;
      case "condition": return draft?.condition || null;
      case "material": return draft?.material || null;
      case "colors": return draft?.colors?.length ? draft.colors : null;
      case "size": return draft?.size || null;
      case "title": return draft?.title || null;
      case "description": return draft?.description || null;
      case "price": return draft?.price || null;
      case "authenticityProof": return null;
      case "packageSize": {
        if (draft?.packageSizeTitle) return draft.packageSizeTitle;
        const id = String(draft?.packageSizeId || "").trim();
        const byId = {
          "1": "Petit",
          "2": "Moyen",
          "3": "Grand",
          "4": "Très grand",
        };
        return byId[id] || null;
      }
      default: return null;
    }
  }

  function buildFieldPlanFromSchema(schema, draft, fieldSpecs) {
    if (!schema || !fieldSpecs) return [];

    const fixedPrefix = ["title", "description", "price", "category"];
    const fixedSuffix = ["packageSize"];
    const schemaOrder = Array.isArray(schema.fieldOrder) ? schema.fieldOrder : Object.keys(schema.fields || {});
    const fieldIds = Array.from(new Set([...fixedPrefix, ...schemaOrder, ...fixedSuffix]));

    return fieldIds
      .map((fieldId) => {
        const baseSpec = fieldSpecs[fieldId];
        if (!baseSpec) return null;
        const schemaField = schema.fields?.[fieldId] || {};
        const spec = {
          ...baseSpec,
          ...schemaField.specOverrides,
          required: typeof schemaField.required === "boolean" ? schemaField.required : Boolean(baseSpec.required),
          widget: schemaField.widget || baseSpec.widget,
          label: schemaField.label || baseSpec.label,
          labelAliases: Array.from(new Set([...(baseSpec.labelAliases || []), ...(schemaField.labelAliases || [])])),
          schemaField,
        };
        return {
          spec,
          value: getDraftValue(draft, fieldId),
          required: Boolean(spec.required),
          schemaField,
        };
      })
      .filter(Boolean);
  }

  function schemaHasPostCategoryFields(schema) {
    const ids = Object.keys(schema?.fields || {});
    return ids.some((id) => !["title", "description", "price", "category"].includes(id));
  }

  window.vintedGetSchemaForCatalogId = getSchemaForCatalogId;
  window.vintedFindSchemaForDraft = findSchemaForDraft;
  window.vintedSaveDiscoveredSchema = saveSchema;
  window.vintedBuildFieldPlanFromSchema = buildFieldPlanFromSchema;
  window.vintedSchemaHasPostCategoryFields = schemaHasPostCategoryFields;
  window.vintedNormalizeCatalogId = normalizeCatalogId;
})();
