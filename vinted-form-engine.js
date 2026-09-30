/**
 * vinted-form-engine.js
 * Version: 1.0.0
 *
 * Moteur déterministe de remplissage du formulaire Vinted /items/new.
 * Pilote la matrice de champs (vinted-field-matrix.js) et délègue au bon
 * adapter DOM pour chaque widget. Chaque erreur est explicite et bloquante
 * selon le niveau de sévérité défini par le plan.
 *
 * Ce fichier est injecté comme content script via manifest.json.
 * Il dépend de content.js (fonctions DOM helpers) et vinted-field-matrix.js.
 */

// ---------------------------------------------------------------------------
// Résolution de profil + inspection du formulaire courant
// ---------------------------------------------------------------------------

/**
 * Inspecte les champs actuellement rendus dans le formulaire Vinted.
 * Retourne un Set des labels de champs détectés (normalisés).
 *
 * @returns {Set<string>}
 */
function inspectCurrentForm() {
  const found = new Set();
  const fieldLabels = [
    { key: "category",    labels: ["catégorie", "categorie"] },
    { key: "brand",       labels: ["marque"] },
    { key: "condition",   labels: ["état", "etat"] },
    { key: "material",    labels: ["matériau", "materiau", "matière", "matiere"] },
    { key: "colors",      labels: ["couleur", "color"] },
    { key: "size",        labels: ["taille", "size"] },
    { key: "price",       labels: ["prix"] },
    { key: "title",       labels: ["titre"] },
    { key: "description", labels: ["description"] },
    { key: "packageSize", labels: ["envoi", "format du colis", "colis", "choisis le format du colis"] },
    { key: "authenticityProof", labels: ["preuves d'authenticité", "preuve d'authenticite", "n'oublie pas d'ajouter ces photos"] },
  ];

  for (const { key, labels } of fieldLabels) {
    // 1) Détection structurelle: container de champ repéré par le helper DOM.
    const hasContainer = labels.some((lbl) => {
      try {
        return Boolean(findFieldContainerByLabel(lbl));
      } catch (_) {
        return false;
      }
    });
    if (hasContainer) {
      found.add(key);
      continue;
    }

    // 2) Détection par input engagé (champ déjà auto-rempli mais label non trivial).
    const spec = window.VINTED_FIELD_SPECS?.[key];
    if (spec?.committedSelector) {
      const committedEl = document.querySelector(spec.committedSelector);
      if (committedEl) {
        found.add(key);
        continue;
      }
    }

    // 3) Détection textuelle de secours (sans contrainte "single text node").
    const allText = Array.from(document.querySelectorAll("label, span, p, div, h1, h2, h3"))
      .map((el) => normalizeComparableText(el.textContent || ""))
      .filter(Boolean);
    for (const lbl of labels) {
      const n = normalizeComparableText(lbl);
      if (allText.some((t) => t === n || t.startsWith(`${n} `) || t.includes(` ${n} `) || t.endsWith(` ${n}`))) {
        found.add(key);
        break;
      }
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Adapters DOM par widget type
// ---------------------------------------------------------------------------

/**
 * Remplit un champ textInput (titre, description, prix).
 *
 * @param {FieldSpec} spec
 * @param {string} value
 * @returns {{ success: boolean, reason?: string }}
 */
async function adapterTextInput(spec, value) {
  const raw = String(value || "").trim();
  if (!raw) return { success: false, reason: "Valeur vide" };

  const isPrice = spec?.id === "price" || /prix|price/i.test(spec?.label || "");
  const formatted = isPrice && typeof window.formatPriceForVintedInput === "function"
    ? window.formatPriceForVintedInput(raw)
    : raw;
  const toSet = formatted || raw;

  let el = document.querySelector(spec.selector);
  if (!el && isPrice && typeof window.findVintedPriceInput === "function") {
    el = window.findVintedPriceInput();
  }
  if (!el && spec.label && typeof findFieldContainerByLabel === "function") {
    const container = findFieldContainerByLabel(spec.label);
    el = container
      ? container.querySelector("input, textarea")
      : null;
  }
  if (!el) {
    return { success: false, reason: `Sélecteur introuvable: ${spec.selector}` };
  }

  setNativeInputValue(el, toSet);
  await sleep(200);
  // Retape une 2e fois si React controlled input a avalé la première saisie.
  if (String(el.value || "").trim() !== String(toSet || "").trim()) {
    setNativeInputValue(el, toSet);
    await sleep(150);
  }

  if (isPrice && typeof window.ensureDraftPriceFilled === "function") {
    // Price needs clear+type path — delegate to the hardened helper.
    const priceResult = await window.ensureDraftPriceFilled({ price: toSet });
    if (!priceResult.success) {
      return { success: false, reason: priceResult.reason };
    }
    return { success: true, value: priceResult.value };
  }

  const committed = String(el.value || "").trim();
  const ok = Boolean(committed);

  if (!ok) {
    return {
      success: false,
      reason: `Valeur non prise par le champ (écrit="${toSet}" lu="${committed || "vide"}")`,
    };
  }
  return { success: true, value: committed };
}

/**
 * Remplit categorySearch (input texte avec suggestions puis sélection).
 * Validation via input#catalog value.
 *
 * @param {FieldSpec} spec
 * @param {string} value
 * @returns {{ success: boolean, reason?: string }}
 */
async function adapterCategorySearch(spec, value, draft) {
  const rawTarget = String(value || "").trim();
  if (!rawTarget) return { success: false, reason: "Valeur catégorie vide" };

  // Normalize: strip internal Vinted code prefix (e.g. "ATM T-shirts" → "T-shirts")
  const target = rawTarget.replace(/^[A-Z]{2,5}\s+/, "").trim();
  const normalizedTarget = normalizeComparableText(target);
  const expectedBranches = Array.isArray(draft?.catalogBranchTitles)
    ? draft.catalogBranchTitles.map((t) => normalizeComparableText(t)).filter(Boolean)
    : [];
  const expectedCatalogId = String(draft?.catalogId || "").trim();

  const label = spec.label;
  let clickedStrongCategoryOption = false;
  let selectedCatalogId = expectedCatalogId || "";
  const findCategoryInput = (container) => {
    const scopedInput = container ? findEditableFieldInContainer(container) : null;
    if (isExpectedSearchInput(scopedInput, "catalog")) return scopedInput;

    const globalInputs = Array.from(document.querySelectorAll(
      "input#catalog-search-input, input[name*='catalog'], input[id*='catalog'], input[role='combobox']"
    ));
    return globalInputs.find((el) => isExpectedSearchInput(el, "catalog")) || null;
  };

  // Helper: read the visible selected category text from the form row
  const readVisibleCategory = () => {
    const container = findFieldContainerByLabel(label);
    if (!container) return "";
    if (isCategorySuggestionSurfaceOpen()) return "";
    // Exclude the label itself and any placeholder-like text
    const spans = Array.from(container.querySelectorAll("span, p, div, button"));
    for (const el of spans) {
      if (isInsideDropdownOrModal(el)) continue;
      const txt = (el.textContent || "").trim();
      if (!txt || txt.toLowerCase().includes("sélectionne") || txt.toLowerCase() === label.toLowerCase()) continue;
      if (txt.length > 240) continue;
      const n = normalizeComparableText(txt);
      if ((n.match(new RegExp(escapeRegExp(normalizedTarget), "g")) || []).length > 1) continue;
      if (n && n.length > 1) return n;
    }
    return "";
  };

  const getCatalogCandidateIdScore = (el) => {
    if (!expectedCatalogId || !el) return 0;
    let node = el;
    while (node) {
      const attrs = [
        node.id,
        node.getAttribute?.("data-id"),
        node.getAttribute?.("data-testid"),
        node.getAttribute?.("data-catalog-id"),
        node.getAttribute?.("data-catalog"),
        node.getAttribute?.("href"),
        node.getAttribute?.("value"),
      ];
      if (attrs.some((attr) => String(attr || "").includes(expectedCatalogId))) return 1000;
      node = node.parentElement;
    }
    return 0;
  };

  const extractCatalogIdFromCandidate = (el) => {
    if (!el) return "";
    let node = el;
    while (node) {
      const values = [
        node.id,
        node.getAttribute?.("data-id"),
        node.getAttribute?.("data-catalog-id"),
        node.getAttribute?.("data-catalog"),
        node.getAttribute?.("value"),
        node.getAttribute?.("href"),
      ];
      for (const value of values) {
        const match = String(value || "").match(/catalog(?:-search)?-(\d+)-result|catalog[_-]?id[=/:"']+(\d+)|^(\d+)$/i);
        const id = match?.[1] || match?.[2] || match?.[3] || "";
        if (id) return id;
      }
      node = node.parentElement;
    }
    return "";
  };

  const getBranchScore = (text) => {
    const txt = normalizeComparableText(text);
    if (!txt || !txt.includes(normalizedTarget)) return -1;
    if (expectedBranches.length === 0) return 0;
    let score = 0;
    for (const branch of expectedBranches) {
      if (txt.includes(branch)) score += 1;
    }
    const leaf = expectedBranches[expectedBranches.length - 1];
    if (leaf && txt.includes(leaf)) score += 2;
    for (let i = 0; i < expectedBranches.length - 1; i++) {
      const current = expectedBranches[i];
      const next = expectedBranches[i + 1];
      const currentIdx = txt.indexOf(current);
      const nextIdx = txt.indexOf(next);
      if (currentIdx >= 0 && nextIdx > currentIdx) score += 1;
    }
    return score;
  };

  const getCategoryCandidateParts = (el) => {
    if (!el) return { heading: "", body: "", text: "" };
    const headingEl = el.querySelector?.(
      ".web_ui__Cell__heading, [class*='Cell__heading'], [data-testid*='title'], [data-testid*='heading']"
    );
    const bodyEl = el.querySelector?.(
      ".web_ui__Cell__body, [class*='Cell__body'], [data-testid*='subtitle'], [data-testid*='breadcrumb']"
    );
    const rawText = el.textContent || "";
    const heading = normalizeComparableText(headingEl?.textContent || "");
    const body = normalizeComparableText(bodyEl?.textContent || "");
    const text = normalizeComparableText(rawText);
    return { heading, body, text };
  };

  const isExactLeafMatch = (elOrText) => {
    const parts = typeof elOrText === "string"
      ? { heading: normalizeComparableText(elOrText), text: normalizeComparableText(elOrText) }
      : getCategoryCandidateParts(elOrText);
    if (parts.heading) return parts.heading === normalizedTarget;
    return parts.text === normalizedTarget || parts.text.startsWith(`${normalizedTarget} `);
  };

  const isStrongBranchMatch = (elOrText) => {
    if (expectedBranches.length === 0) return true;
    const parts = typeof elOrText === "string"
      ? { text: normalizeComparableText(elOrText), body: normalizeComparableText(elOrText), heading: "" }
      : getCategoryCandidateParts(elOrText);
    const txt = parts.text;
    if (!isExactLeafMatch(elOrText)) return false;
    if (expectedBranches.length === 1) return txt.includes(expectedBranches[0]);
    const parentBranches = expectedBranches.slice(0, -1);
    const firstParent = parentBranches[0];
    if (firstParent && !txt.includes(firstParent)) return false;
    const parentMatches = parentBranches.filter((branch) => txt.includes(branch)).length;
    return parentMatches >= Math.min(parentBranches.length, 2);
  };

  // Helper: find a clickable option inside the open category modal/panel
  const findCategoryOption = (searchTerm) => {
    const normalized = normalizeComparableText(searchTerm);
    // Look for elements in category suggestion panels (Vinted uses various containers)
    const candidates = Array.from(
      document.querySelectorAll(
        '[role="option"], [role="listbox"] li, [role="listbox"] button, ' +
        '.catalog_dropdown li, .catalog_dropdown button, ' +
        '[data-testid*="catalog"] button, [data-testid*="catalog"] li, ' +
        '[class*="InputBar"] ~ * li, [class*="InputBar"] ~ * button'
      )
    );

    // Also look broadly for any visible list item that contains the category text
    const allCandidates = [
      ...candidates,
      ...Array.from(document.querySelectorAll("li, [role='option']")).filter((el) => {
        const rect = el.getBoundingClientRect?.();
        return rect && rect.width > 2 && rect.height > 2;
      })
    ];

    // Deduplicate
    const seen = new Set();
    const unique = allCandidates.filter((el) => {
      if (seen.has(el)) return false;
      seen.add(el);
      return true;
    });

    const scored = unique
      .map((el) => {
        const parts = getCategoryCandidateParts(el);
        const txt = parts.text;
        if (!txt || !txt.includes(normalized)) return null;
        if (txt.length > 420) return null;
        if (!isExactLeafMatch(el) && getCatalogCandidateIdScore(el) === 0) return null;
        const catalogIdScore = getCatalogCandidateIdScore(el);
        const branchScore = getBranchScore(txt);
        const exactLeafScore = isExactLeafMatch(el) ? 50 : 0;
        return {
          el,
          txt,
          score: catalogIdScore + branchScore + exactLeafScore,
          branchScore,
          catalogIdScore,
          heading: parts.heading,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || (a.txt.length - b.txt.length));

    if (scored.length > 0) {
      const best = scored[0];
      if (best.catalogIdScore > 0 || expectedBranches.length === 0 || isStrongBranchMatch(best.el)) {
        logDomDebug(label, `Found best category option score=${best.score}`, {
          option: best.el.textContent || "",
          branchScore: best.branchScore,
          catalogIdScore: best.catalogIdScore,
          heading: best.heading,
        });
        return best.el;
      }
      logDomDebug(label, "discarded weak category option match", {
        option: best.el.textContent || "",
        branchScore: best.branchScore,
        expectedBranches,
      });
      return null;
    }

    // Find the best match: prefer exact, then partial
    if (expectedBranches.length > 0) return null;
    const exact = unique.find((el) => {
      const txt = normalizeComparableText(el.textContent || "");
      return txt && (txt === normalized || txt.startsWith(normalized));
    });
    if (exact) return exact;

    const partial = unique.find((el) => {
      const txt = normalizeComparableText(el.textContent || "");
      return txt && txt.includes(normalized);
    });
    return partial || null;
  };

  const findCategoryClickTargets = (option) => {
    if (!option) return [];
    const interactiveDescendants = Array.from(option.querySelectorAll("button, a, [role='button'], [tabindex]"))
      .filter((el) => {
        const txt = normalizeComparableText(el.textContent || "");
        return txt && (txt === normalizedTarget || isStrongBranchMatch(el));
      })
      .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
    const textDescendants = Array.from(option.querySelectorAll("span, div, p"))
      .filter((el) => {
        const txt = normalizeComparableText(el.textContent || "");
        return txt && txt === normalizedTarget;
      })
      .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
    const targets = [];
    for (const el of interactiveDescendants) {
      targets.push(el);
      const clickable = el.closest("button, a, [role='button'], [role='option'], li");
      if (clickable) targets.push(clickable);
    }
    const optionClickable = option.closest("button, a, [role='button'], [role='option'], li") || option;
    targets.push(optionClickable, option);
    for (const el of textDescendants) {
      targets.push(el);
      const clickable = el.closest("button, a, [role='button'], [role='option'], li");
      if (clickable) targets.push(clickable);
    }
    return Array.from(new Set(targets.filter(Boolean)));
  };

  const hasCommittedCatalogId = () => {
    const catalogId = selectedCatalogId || expectedCatalogId;
    if (!catalogId || !/^\d+$/.test(catalogId)) return false;
    const selectors = [
      "input[name='catalog_id']",
      "input[name*='catalog_id']",
      "input[id='catalog_id']",
      "input[id*='catalog_id']",
      "input[name='catalog']",
      "input#catalog",
    ];
    return selectors.some((selector) => {
      const el = document.querySelector(selector);
      const raw = String(el?.value || el?.getAttribute?.("value") || "");
      return raw === catalogId;
    });
  };

  const hasPostCategoryFieldsRendered = () => {
    try {
      const fields = inspectCurrentForm();
      return ["brand", "condition", "material", "colors", "size", "authenticityProof"]
        .some((fieldId) => fields.has(fieldId));
    } catch (_) {
      return false;
    }
  };

  const validateCategoryCommit = () => {
    const dropdownOpen = isCategorySuggestionSurfaceOpen();
    const visible = readVisibleCategory();
    const committed = readCommittedValue(spec);
    const primary = readPrimaryValue(spec);
    const selectedNumericCatalogId = selectedCatalogId && /^\d+$/.test(selectedCatalogId);
    const postCategoryFieldsRendered = hasPostCategoryFieldsRendered();
    const domConfirmed = Boolean(selectedNumericCatalogId && !dropdownOpen && postCategoryFieldsRendered);
    const visibleMatches = Boolean(visible && normalizeComparableText(visible).includes(normalizedTarget) && isStrongBranchMatch(visible));
    const branchConfirmed = expectedBranches.length === 0 || visibleMatches || hasCommittedCatalogId() || clickedStrongCategoryOption || domConfirmed;
    const primaryMatches = Boolean(primary && isCommittedMatch(primary, target) && !dropdownOpen && branchConfirmed);
    const committedMatches = Boolean(committed && isCommittedMatch(committed, target) && !dropdownOpen && branchConfirmed);
    return {
      success: hasCommittedCatalogId() || domConfirmed || visibleMatches || primaryMatches || committedMatches,
      dropdownOpen,
      visible,
      committed,
      primary,
      selectedCatalogId: selectedCatalogId || "",
      postCategoryFieldsRendered,
      domConfirmed,
    };
  };

  const waitForCategoryCommit = async (timeoutMs = 3200) => {
    const start = Date.now();
    let last = validateCategoryCommit();
    while (Date.now() - start < timeoutMs) {
      last = validateCategoryCommit();
      if (last.success) return last;
      await sleep(160);
    }
    return last;
  };

  for (let attempt = 1; attempt <= 4; attempt++) {
    const container = findFieldContainerByLabel(label);
    let input = findCategoryInput(container);

    const activator = container ? findFieldActivator(label, container) : null;
    logDomDebug(label, `categorySearch attempt ${attempt}`, {
      target,
      container: describeElement(container),
      input: describeElement(input),
      activator: describeElement(activator),
    });

    // Open the category selector if input not yet visible
    if (!input && activator) {
      clickElementHard(activator);
      await sleep(600);
      input = findCategoryInput(container);
      // Also check if a dialog/modal just opened with its own search input
      if (!input) {
        const dialogInput = document.querySelector(
          '[role="dialog"] input, [class*="modal"] input[type="text"], ' +
          '[class*="Dialog"] input, [class*="dropdown"] input[type="text"]'
        );
        if (isExpectedSearchInput(dialogInput, "catalog", { allowGenericDialogSearch: true })) input = dialogInput;
      }
      logDomDebug(label, "opened via activator", { inputAfter: describeElement(input) });
    }

    if (!input) {
      logDomDebug(label, "no input found on attempt", { attempt });
      await sleep(500);
      continue;
    }

    input.focus();
    setNativeInputValue(input, target);
    await sleep(800);

    // Try to find and click a matching option
    let option = findCategoryOption(target);

    // Also try the standard listbox approach as fallback
    if (!option) {
      const listbox = typeof findOpenListboxForInput === "function" ? findOpenListboxForInput(input, container) : null;
      if (listbox) {
        option = typeof findOptionInListbox === "function" ? findOptionInListbox(listbox, target, false) : null;
        if (!option) option = typeof findOptionInListbox === "function" ? findOptionInListbox(listbox, target, true) : null;
      }
    }

    if (option) {
      const optionCatalogId = extractCatalogIdFromCandidate(option);
      if (optionCatalogId) selectedCatalogId = optionCatalogId;
      clickedStrongCategoryOption = isStrongBranchMatch(option) || getCatalogCandidateIdScore(option) > 0;
      const clickTargets = findCategoryClickTargets(option);
      let clickedTarget = null;
      for (const targetClick of clickTargets.slice(0, 4)) {
        clickedTarget = targetClick;
        const targetCatalogId = extractCatalogIdFromCandidate(targetClick);
        if (targetCatalogId) selectedCatalogId = targetCatalogId;
        clickElementHard(targetClick);
        await sleep(420);
        const snapshot = await waitForCategoryCommit(1200);
        if (snapshot.success || !snapshot.dropdownOpen) break;
      }
      logDomDebug(label, "clicked category option", { option: describeElement(option), targetClick: describeElement(clickedTarget) });
    } else {
      // No option found — try pressing Enter then check
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await sleep(500);
      logDomDebug(label, "no option found, tried Enter", { attempt });
    }

    await waitForCategorySuggestionClose(2200);
    await sleep(500);

    // Validate: check visible text of the category field
    const validation = await waitForCategoryCommit(2600);
    logDomDebug(label, `categorySearch post attempt ${attempt}`, validation);

    if (validation.success) {
      return { success: true, catalogId: selectedCatalogId || expectedCatalogId || null };
    }
  }

  const { visible, committed, primary, dropdownOpen } = validateCategoryCommit();

  return {
    success: false,
    catalogId: selectedCatalogId || expectedCatalogId || null,
    reason: `Catégorie non validée (dropdownOpen=${dropdownOpen}, visible=${visible || "—"}, committed=${committed || "—"}, primary=${primary || "—"})`,
  };
}

/**
 * Remplit brandSearch.
 * Stratégie: taper dans l'input, cliquer la suggestion exacte si présente,
 * sinon valider au clavier. Vérification via input#brand value.
 *
 * @param {FieldSpec} spec
 * @param {string} value
 * @returns {{ success: boolean, reason?: string }}
 */
async function adapterBrandSearch(spec, value, draft) {
  const target = String(value || "").trim();
  if (!target) return { success: false, reason: "Valeur marque vide" };

  const label = spec.label;
  const brandId = String(draft?.brandId || "").trim();

  const isBrandDisplayInput = (el) => {
    if (!el) return false;
    const id = (el.id || "").toLowerCase();
    const cls = (el.className || "").toString().toLowerCase();
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    const readonly = el.hasAttribute?.("readonly");
    return (
      id === "brand" ||
      readonly ||
      cls.includes("c-input__value") ||
      cls.includes("u-cursor-pointer") ||
      (role && role !== "combobox" && role !== "searchbox")
    );
  };

  const findBrandSearchInput = (container) => {
    const selectors = [
      "input#brand-search-input",
      "[role='dialog'] input#brand-search-input",
      "[role='dialog'] input[type='text']",
      "[role='dialog'] input[type='search']",
      "[class*='Dialog'] input[type='text']",
      "[class*='Dialog'] input[type='search']",
      "[class*='Modal'] input[type='text']",
      "[class*='modal'] input[type='text']",
      "[class*='dropdown'] input[type='text']",
      "[class*='dropdown'] input[type='search']",
      "[class*='InputBar'] input[type='text']",
      "input[role='combobox'][id*='brand']",
      "input[role='combobox'][name*='brand']",
      "input[name*='brand'][id*='search']",
      "input[id*='brand'][id*='search']",
      "input[placeholder*='marque' i]",
      "input[placeholder*='brand' i]",
    ];
    const candidates = selectors
      .flatMap((selector) => {
        try {
          return Array.from(document.querySelectorAll(selector));
        } catch (_) {
          return [];
        }
      })
      .filter((el, idx, arr) => arr.indexOf(el) === idx)
      .filter((el) => isUsableTextEntry(el) && !isBrandDisplayInput(el));
    if (candidates.length > 0) return candidates[0];

    const scoped = container ? findEditableFieldInContainer(container) : null;
    if (isUsableTextEntry(scoped) && !isBrandDisplayInput(scoped)) return scoped;

    const global = document.querySelector(spec.globalInputSelector);
    if (isUsableTextEntry(global) && !isBrandDisplayInput(global)) return global;
    return null;
  };

  const waitForBrandSearchInput = async (container, timeoutMs = 2200) => {
    const start = Date.now();
    let input = findBrandSearchInput(container);
    while (!input && Date.now() - start < timeoutMs) {
      await sleep(120);
      input = findBrandSearchInput(container);
    }
    return input;
  };

  const openBrandField = async (container) => {
    const openers = [];
    const activator = container ? findFieldActivator(label, container) : null;
    if (activator) openers.push(activator);
    const displayInput =
      container?.querySelector?.("input#brand, input.c-input__value, [class*='c-input__value']") ||
      document.querySelector("input#brand.c-input__value, input#brand");
    if (displayInput) openers.push(displayInput);
    if (container) openers.push(container);

    for (const opener of Array.from(new Set(openers.filter(Boolean)))) {
      clickElementHard(opener);
      const input = await waitForBrandSearchInput(container, 900);
      if (input) {
        logDomDebug(label, "opened brand search", {
          opener: describeElement(opener),
          input: describeElement(input),
        });
        return input;
      }
    }
    return null;
  };

  const findBrandOptionById = () => {
    if (!brandId) return null;
    const escapedBrandId = window.CSS?.escape ? window.CSS.escape(brandId) : brandId.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    const selectors = [
      `#suggested-brand-${escapedBrandId}`,
      `#brand-${escapedBrandId}`,
      `[id="suggested-brand-${brandId}"]`,
      `[id="brand-${brandId}"]`,
      `[data-brand-id="${brandId}"]`,
      `[data-testid="suggested-brand-${brandId}"]`,
      `[data-id="${brandId}"]`,
      `[value="${brandId}"]`,
    ];
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el && isVisibleDomElement(el)) return el;
      } catch (_) {
        // Keep trying other selector forms.
      }
    }
    return null;
  };

  const findVisibleBrandOption = () => {
    const targetNorm = normalizeComparableText(target);
    const candidates = Array.from(document.querySelectorAll(
      "[role='option'], [role='listbox'] li, [role='listbox'] button, li, button, [id^='suggested-brand-'], [id^='brand-']"
    )).filter((el) => {
      if (!isVisibleDomElement(el)) return false;
      if (isInsideAutomationExcludedSurface(el)) return false;
      const txt = normalizeComparableText(el.textContent || "");
      if (!txt) return false;
      if (txt.includes("copier logs") || txt.includes("copier backup")) return false;
      return txt === targetNorm || txt.startsWith(`${targetNorm} `) || txt.includes(targetNorm);
    });

    const scored = candidates.map((el) => {
      const heading = normalizeComparableText(
        el.querySelector?.(".web_ui__Cell__heading, [class*='Cell__heading']")?.textContent || ""
      );
      const txt = normalizeComparableText(el.textContent || "");
      let score = 0;
      if (heading === targetNorm) score += 100;
      if (txt === targetNorm) score += 80;
      if (txt.startsWith(`${targetNorm} `)) score += 30;
      if (brandId && (el.id || "").includes(brandId)) score += 1000;
      return { el, score, txt };
    }).sort((a, b) => b.score - a.score || a.txt.length - b.txt.length);

    return scored[0]?.el || null;
  };

  const findBrandClickTargets = (option) => {
    if (!option) return [];
    const targetNorm = normalizeComparableText(target);
    const descendants = Array.from(option.querySelectorAll(
      ".web_ui__Cell__cell, [class*='Cell__cell'], button, [role='button'], [tabindex], span, div"
    )).filter((el) => {
      if (!isVisibleDomElement(el)) return false;
      const txt = normalizeComparableText(el.textContent || "");
      return txt && (txt === targetNorm || txt.startsWith(`${targetNorm} `) || txt.includes(targetNorm));
    }).sort((a, b) => {
      const aInteractive = a.matches?.("button, [role='button'], [tabindex], .web_ui__Cell__cell, [class*='Cell__cell']") ? -100 : 0;
      const bInteractive = b.matches?.("button, [role='button'], [tabindex], .web_ui__Cell__cell, [class*='Cell__cell']") ? -100 : 0;
      return aInteractive - bInteractive || (a.textContent || "").length - (b.textContent || "").length;
    });

    const targets = [];
    for (const el of descendants) {
      targets.push(el);
      const clickable = el.closest("button, [role='button'], [tabindex], .web_ui__Cell__cell, [class*='Cell__cell'], li, [role='option']");
      if (clickable) targets.push(clickable);
    }
    const fallback = option.querySelector?.(".web_ui__Cell__cell, [class*='Cell__cell'], button, [role='button']") || option;
    targets.push(fallback, option);
    return Array.from(new Set(targets.filter(Boolean)));
  };

  const waitForBrandCommit = async (timeoutMs = 1800) => {
    const start = Date.now();
    let last = { committed: "", primary: "" };
    while (Date.now() - start < timeoutMs) {
      const committed = readCommittedValue(spec);
      const primary = readPrimaryValue(spec);
      last = { committed, primary };
      if (isCommittedMatch(committed, target) || isCommittedMatch(primary, target)) return { success: true, ...last };
      await sleep(120);
    }
    return { success: false, ...last };
  };

  for (let attempt = 1; attempt <= 4; attempt++) {
    const container = findFieldContainerByLabel(label);
    let input = findBrandSearchInput(container);
    const activator = container ? findFieldActivator(label, container) : null;
    logDomDebug(label, `brandSearch attempt ${attempt}`, {
      target,
      brandId,
      input: describeElement(input),
      activator: describeElement(activator),
    });

    if (!input) {
      input = await openBrandField(container);
    }

    if (!input) {
      logDomDebug(label, "no brand search input found", { attempt });
      await sleep(350);
      continue;
    }

    input.focus();
    setNativeInputValue(input, target);
    await sleep(700);

    const listbox = typeof findOpenListboxForInput === "function" ? findOpenListboxForInput(input, container) : null;
    let option = findBrandOptionById();
    if (listbox) {
      option = option || (typeof findOptionInListbox === "function" ? findOptionInListbox(listbox, target, false) : null);
      if (!option && typeof findVisibleOptionByValue === "function") option = findVisibleOptionByValue(target);
      if (!option && typeof findOptionInListbox === "function") option = findOptionInListbox(listbox, target, true);
    }
    if (!option) option = findVisibleBrandOption();

    if (option) {
      // Capture brandId from DOM id like brand-506679 / suggested-brand-506679
      const idMatch = String(option.id || "").match(/(?:suggested-)?brand-(\d+)/i)
        || String(option.querySelector?.("[id*='brand-']")?.id || "").match(/(?:suggested-)?brand-(\d+)/i);
      if (idMatch?.[1]) {
        draft.brandId = parseInt(idMatch[1], 10);
        logDomDebug(label, "captured brandId from DOM", { brandId: draft.brandId });
      }
      let clickedTarget = null;
      for (const clickable of findBrandClickTargets(option).slice(0, 5)) {
        clickedTarget = clickable;
        const clickIdMatch = String(clickable.id || "").match(/(?:suggested-)?brand-(\d+)/i);
        if (clickIdMatch?.[1]) draft.brandId = parseInt(clickIdMatch[1], 10);
        clickElementHard(clickable);
        await sleep(260);
        const snapshot = await waitForBrandCommit(700);
        if (snapshot.success) break;
      }
      logDomDebug(label, "clicked brand listbox option", { option: describeElement(option), targetClick: describeElement(clickedTarget) });
    } else {
      // Cherche un bouton suggestion correspondant exactement.
      const suggBtn = findSuggestionButtonInContainer(container || document.body, target);
      if (suggBtn) {
        clickElementHard(suggBtn);
        await sleep(200);
        logDomDebug(label, "clicked suggestion button", { btn: describeElement(suggBtn) });
      } else {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur?.();
      }
    }

    // Prefer commit check before Escape — Escape can cancel an uncommitted selection.
    let commit = await waitForBrandCommit(900);
    if (!commit.success) {
      await closeOpenDropdown();
      await waitForDropdownClose(1200);
      await sleep(120);
      commit = await waitForBrandCommit(700);
    } else {
      await closeOpenDropdown();
      await waitForDropdownClose(800);
    }

    logDomDebug(label, `brandSearch post attempt ${attempt}`, {
      committed: commit.committed,
      primary: commit.primary,
    });

    if (commit.success) {
      return { success: true };
    }
  }

  const committed = readCommittedValue(spec);
  const primary   = readPrimaryValue(spec);
  return {
    success: false,
    reason: `Marque non validée (committed=${committed || "—"}, primary=${primary || "—"})`,
  };
}

/**
 * Remplit singleSelect (État / Condition).
 * Stratégie: ouvrir le sélecteur, trouver l'option cible exacte, cliquer,
 * vérifier isOptionSelected().
 *
 * @param {FieldSpec} spec
 * @param {string} value
 * @returns {{ success: boolean, reason?: string }}
 */
async function adapterSingleSelect(spec, value, draft) {
  const target = String(value || "").trim();
  if (!target) return { success: false, reason: "Valeur état vide" };

  const label = spec.label;
  const targetNorm = normalizeComparableText(target);

  // ---------------------------------------------------------------------------
  // Strategy 1: Use status_id from API to find the DOM element directly by ID.
  // Vinted condition options have DOM IDs matching status_id values.
  // ---------------------------------------------------------------------------
  const statusId = draft?.statusId || null;
  const conditionIdMap = spec.conditionIdMap || {};
  let knownId = statusId;
  if (!knownId) {
    for (const [key, id] of Object.entries(conditionIdMap)) {
      if (normalizeComparableText(key) === targetNorm) {
        knownId = id;
        break;
      }
    }
  }

  if (knownId) {
    logDomDebug(label, `singleSelect: trying ID-based selection (statusId=${knownId})`);
    // Try multiple ID patterns Vinted uses for condition elements
    const idSelectors = [
      `#condition-${knownId}`,
      `[id="${knownId}"]`,
      `[data-testid="condition-${knownId}"]`,
      `[data-value="${knownId}"]`,
    ];
    for (const sel of idSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.isConnected) {
          const rect = el.getBoundingClientRect?.();
          if (rect && rect.width > 2 && rect.height > 2) {
            clickElementHard(el);
            await sleep(200);
            logDomDebug(label, `singleSelect: clicked via ID selector ${sel}`, { el: describeElement(el) });
            // Check if it worked
            if (isOptionSelected(el)) return { success: true };
            const committed = readCommittedValue(spec);
            if (committed && isCommittedMatch(committed, target)) return { success: true };
          }
        }
      } catch (_) { /* selector might be invalid */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy 2: Container-based or page-wide text search with strict filtering.
  // ---------------------------------------------------------------------------

  const findContainer = () => {
    const allLabels = [label, ...(spec.labelAliases || [])];
    for (const lbl of allLabels) {
      const c = findFieldContainerByLabel(lbl);
      if (c) return c;
    }
    return null;
  };

  // Helper: is this element a form input field (title, description, price)?
  // These must be excluded to prevent false positive matches.
  const isFormInputElement = (el) => {
    // Element contains a textarea or text input → it's a form field label, not an option
    if (el.querySelector && el.querySelector("textarea, input[type='text']")) return true;
    // Element has form-input CSS classes
    const cls = (el.className || "").toString();
    if (cls.includes("Input__input") || cls.includes("Input__wide")) return true;
    // Element text is too long to be a simple option
    const rawLen = (el.textContent || "").trim().length;
    if (rawLen > 250) return true;
    return false;
  };

  const findConditionChoice = (container) => {
    // First try findVisibleChoiceByText (already has form-input exclusion)
    const broad = findVisibleChoiceByText(target);
    if (broad && !isFormInputElement(broad)) return broad;

    // Search within container first (more targeted)
    const searchRoots = container ? [container, document.body] : [document.body];
    for (const root of searchRoots) {
      const candidates = Array.from(root.querySelectorAll(
        ".web_ui__Cell__cell, [role='button'], button, [role='option'], [role='radio'], li"
      )).filter((el) => {
        if (!el.isConnected) return false;
        if (isFormInputElement(el)) return false;
        const rect = el.getBoundingClientRect?.();
        if (!rect || rect.width < 2 || rect.height < 2) return false;
        const txt = normalizeComparableText(el.textContent || "");
        if (!txt) return false;
        // Exclude extension UI elements
        if (txt.includes("copier logs") || txt.includes("copier backup")) return false;
        return txt === targetNorm || txt.startsWith(targetNorm);
      });

      candidates.sort((a, b) => (a.textContent?.length || 0) - (b.textContent?.length || 0));
      if (candidates.length > 0) return candidates[0];
    }
    return null;
  };

  for (let attempt = 1; attempt <= 4; attempt++) {
    let container = findContainer();

    if (container) {
      const activator = findFieldActivator(label, container) || findClickableControlInContainer(container);
      logDomDebug(label, `singleSelect attempt ${attempt} (with container)`, {
        target,
        activator: describeElement(activator),
      });
      if (activator) {
        clickElementHard(activator);
        await sleep(400);
      }
    } else {
      logDomDebug(label, `singleSelect attempt ${attempt} (no container — scanning page)`, { target });
      await sleep(500);
    }

    const choice = findConditionChoice(container);
    let selected = false;

    if (choice) {
      clickElementHard(choice);
      await sleep(200);
      const innerChooser = choice.querySelector("input[type='radio'], input[type='checkbox'], [role='radio']");
      if (innerChooser && innerChooser !== choice) {
        clickElementHard(innerChooser);
        await sleep(150);
      }
      if (!isOptionSelected(choice)) {
        clickElementHard(choice);
        await sleep(150);
      }
      selected = isOptionSelected(choice);
      logDomDebug(label, "singleSelect clicked choice", {
        choice: describeElement(choice),
        selected,
      });
    } else {
      logDomDebug(label, "singleSelect choice not found (filtered form inputs)", { target, attempt });
    }

    await closeOpenDropdown();
    await waitForDropdownClose(1000);
    await sleep(150);

    const primary   = readPrimaryValue(spec);
    const committed = readCommittedValue(spec);
    logDomDebug(label, "singleSelect post check", { primary, committed, selected });

    if (selected || isCommittedMatch(primary, target) || isCommittedMatch(committed, target)) {
      return { success: true };
    }
  }

  return { success: false, reason: `État non sélectionné pour: "${target}"` };
}

/**
 * Remplit multiSelect (Couleur).
 * Stratégie: ouvrir une seule fois, cliquer chaque couleur, ne pas recliquer
 * si déjà sélectionné. Fermer à la fin.
 *
 * @param {FieldSpec} spec
 * @param {string[]} values
 * @returns {{ success: boolean, reason?: string }}
 */
async function adapterMultiSelect(spec, values) {
  const normalized = Array.from(new Set((values || []).map((v) => String(v).trim()).filter(Boolean)));
  if (normalized.length === 0) return { success: true };

  const label = spec.label;
  const container = findFieldContainerByLabel(label);
  if (!container) {
    return { success: false, reason: "Champ Couleur introuvable dans le DOM" };
  }

  const activator = findFieldActivator(label, container);
  if (activator) {
    clickElementHard(activator);
    await sleep(260);
    logDomDebug(label, "multiSelect opened", { activator: describeElement(activator) });
  }

  let successCount = 0;
  for (const color of normalized) {
    const option = findSuggestionButtonInContainer(container, color)
      || findSuggestionButtonInContainer(document.body, color);

    if (!option) {
      logDomDebug(label, "multiSelect option not found", { color });
      continue;
    }

    if (isOptionSelected(option)) {
      logDomDebug(label, "multiSelect already selected", { color });
      successCount++;
      continue;
    }

    clickElementHard(option);
    await sleep(140);
    let sel = isOptionSelected(option);
    if (!sel) {
      clickElementHard(option);
      await sleep(140);
      sel = isOptionSelected(option);
    }
    logDomDebug(label, "multiSelect clicked option", { color, selected: sel });
    if (sel) successCount++;
  }

  await closeOpenDropdown();
  await waitForDropdownClose(1200);

  if (successCount < normalized.length) {
    return {
      success: false,
      reason: `Couleur: seulement ${successCount}/${normalized.length} couleurs sélectionnées`,
    };
  }
  return { success: true };
}

/**
 * Remplit itemSelect (Matériau) — liste déroulante sans checkbox/radio réel.
 * Validation via primaryFieldValue ou committedFieldValue.
 *
 * @param {FieldSpec} spec
 * @param {string} value
 * @returns {{ success: boolean, reason?: string }}
 */
async function adapterItemSelect(spec, value) {
  const target = String(value || "").trim();
  if (!target) return { success: false, reason: "Valeur matériau vide" };

  const label = spec.label;
  let container = null;
  for (const lbl of [spec.label, ...(spec.labelAliases || [])]) {
    container = findFieldContainerByLabel(lbl);
    if (container) break;
  }

  if (!container) {
    return { success: false, reason: `Champ ${label} introuvable dans le DOM` };
  }

  const targetNorm = normalizeComparableText(target);
  const findItemClickTargets = (choice) => {
    if (!choice) return [];
    const descendants = Array.from(choice.querySelectorAll(
      ".web_ui__Cell__cell, [class*='Cell__cell'], [role='button'], [role='radio'], button, [tabindex], input[type='radio'], input[type='checkbox'], span, div"
    )).filter((el) => {
      if (!isVisibleDomElement(el)) return false;
      const tag = (el.tagName || "").toLowerCase();
      const role = (el.getAttribute?.("role") || "").toLowerCase();
      const txt = normalizeComparableText(el.textContent || "");
      if (tag === "input" || role === "radio") return true;
      if (!txt) return false;
      return txt === targetNorm || txt.startsWith(`${targetNorm} `) || targetNorm.startsWith(txt);
    }).sort((a, b) => {
      const aInteractive = a.matches?.(".web_ui__Cell__cell, [class*='Cell__cell'], [role='button'], [role='radio'], button, [tabindex], input") ? -100 : 0;
      const bInteractive = b.matches?.(".web_ui__Cell__cell, [class*='Cell__cell'], [role='button'], [role='radio'], button, [tabindex], input") ? -100 : 0;
      return aInteractive - bInteractive || (a.textContent || "").length - (b.textContent || "").length;
    });

    const targets = [];
    for (const el of descendants) {
      targets.push(el);
      const clickable = el.closest("button, [role='button'], [role='radio'], [tabindex], .web_ui__Cell__cell, [class*='Cell__cell'], li, [role='option']");
      if (clickable) targets.push(clickable);
    }
    const preferred = choice.querySelector?.(".web_ui__Cell__cell, [class*='Cell__cell'], [role='button'], [role='radio'], button, [tabindex], input[type='radio'], input[type='checkbox']");
    if (preferred) targets.push(preferred);
    targets.push(choice);
    return Array.from(new Set(targets.filter(Boolean)));
  };

  const waitForItemCommit = async (choice, clickedTarget, timeoutMs = 1000) => {
    const start = Date.now();
    let last = { primary: "", committed: "", selected: false };
    while (Date.now() - start < timeoutMs) {
      const primary = readPrimaryValue(spec);
      const committed = readCommittedValue(spec);
      const selected = Boolean(
        (choice && isOptionSelected(choice)) ||
        (clickedTarget && isOptionSelected(clickedTarget))
      );
      last = { primary, committed, selected };
      if (primary.includes(targetNorm) || committed.includes(targetNorm) || selected) {
        return { success: true, ...last };
      }
      await sleep(120);
    }
    return { success: false, ...last };
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const activator = findFieldActivator(label, container);
    logDomDebug(label, `itemSelect attempt ${attempt}`, {
      target,
      activator: describeElement(activator),
      beforePrimary: readPrimaryValue(spec),
    });

    if (activator) {
      clickElementHard(activator);
      await sleep(220);
    }

    const choice = findVisibleChoiceByText(target);
    let clickedTarget = null;
    if (choice) {
      for (const targetClick of findItemClickTargets(choice).slice(0, 6)) {
        clickedTarget = targetClick;
        clickElementHard(targetClick);
        await sleep(160);
        const snapshot = await waitForItemCommit(choice, clickedTarget, 360);
        if (snapshot.success) break;
      }
      logDomDebug(label, "itemSelect clicked", {
        choice: describeElement(choice),
        targetClick: describeElement(clickedTarget),
        selected: Boolean(isOptionSelected(choice) || isOptionSelected(clickedTarget)),
      });
    } else {
      logDomDebug(label, "itemSelect choice not found", { target });
    }

    let commit = await waitForItemCommit(choice, clickedTarget, 800);
    if (!commit.success) {
      await closeOpenDropdown();
      await waitForDropdownClose(1200);
      await sleep(120);
      commit = await waitForItemCommit(choice, clickedTarget, 500);
    } else {
      await closeOpenDropdown();
      await waitForDropdownClose(800);
    }

    logDomDebug(label, "itemSelect post check", {
      primary: commit.primary,
      committed: commit.committed,
      selected: commit.selected,
    });

    if (commit.success) {
      return { success: true };
    }
  }

  return { success: false, reason: `${label} non validé pour: "${target}"` };
}

/**
 * Remplit sizeSelect (Taille).
 * Priorité: sizeId DOM (#size-{id}) → recherche texte → itemSelect fallback.
 *
 * @param {FieldSpec} spec
 * @param {string} value
 * @param {object} draft
 * @returns {{ success: boolean, reason?: string }}
 */
async function adapterSizeSelect(spec, value, draft = {}) {
  const target = String(value || "").trim();
  if (!target) return { success: false, reason: "Valeur taille vide" };

  const label = spec.label;
  const sizeId = String(draft?.sizeId || "").trim();
  const targetNorm = normalizeComparableText(target);
  const sizeTokens = targetNorm
    .split(/[\/|,·•\-]+/)
    .map((t) => t.trim())
    .filter((t) => t && t.length <= 12);

  const labels = [spec.label, ...(spec.labelAliases || [])];
  let container = null;
  for (const lbl of labels) {
    container = findFieldContainerByLabel(lbl);
    if (container) break;
  }
  if (!container) {
    return { success: false, reason: `Champ ${label} introuvable dans le DOM` };
  }

  const isSizeMatch = (text) => {
    const txt = normalizeComparableText(text);
    if (!txt) return false;
    if (txt === targetNorm) return true;
    if (txt.startsWith(`${targetNorm} `) || targetNorm.startsWith(`${txt} `)) return true;
    if (txt.includes(targetNorm) || targetNorm.includes(txt)) return true;
    // Compound Vinted sizes: "S / 36 / 8" vs "S" / "36"
    if (sizeTokens.length > 0) {
      const hit = sizeTokens.filter((token) => txt === token || txt.includes(` ${token} `) || txt.startsWith(`${token} `) || txt.endsWith(` ${token}`) || txt.includes(`/${token}`) || txt.includes(`${token}/`));
      if (hit.length >= Math.min(2, sizeTokens.length)) return true;
      if (sizeTokens.length === 1 && hit.length === 1) return true;
    }
    return false;
  };

  const findSizeOptionById = () => {
    if (!sizeId) return null;
    const escaped = window.CSS?.escape ? window.CSS.escape(sizeId) : sizeId.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    const selectors = [
      `#size-${escaped}`,
      `[id="size-${sizeId}"]`,
      `[data-testid="size-${sizeId}"]`,
      `[data-size-id="${sizeId}"]`,
      `[data-id="${sizeId}"]`,
      `input[type='radio'][value="${sizeId}"]`,
      `input[name*='size'][value="${sizeId}"]`,
    ];
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el && isVisibleDomElement(el)) return el;
      } catch (_) {
        // ignore invalid selector
      }
    }
    return null;
  };

  const findSizeSearchInput = () => {
    const selectors = [
      "input#size-search-input",
      "[role='dialog'] input#size-search-input",
      "[role='dialog'] input[type='text']",
      "[role='dialog'] input[type='search']",
      "[class*='Dialog'] input[type='text']",
      "[class*='InputBar'] input[type='text']",
      "input[id*='size'][id*='search']",
      "input[name*='size'][type='text']",
      "input[placeholder*='taille' i]",
      "input[placeholder*='size' i]",
    ];
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (isUsableTextEntry(el)) return el;
      } catch (_) {
        // ignore
      }
    }
    return null;
  };

  const findSizeChoiceByText = () => {
    const nodes = Array.from(
      document.querySelectorAll(
        "[id^='size-'], .web_ui__Cell__cell, [role='button'], [role='option'], [role='radio'], button, li"
      )
    ).filter((el) => {
      if (!el || !el.isConnected) return false;
      if (!isVisibleDomElement(el)) return false;
      if (isInsideAutomationExcludedSurface(el)) return false;
      const rawTxt = (el.textContent || "").trim();
      if (!rawTxt || rawTxt.length > 80) return false;
      if (el.querySelector?.("textarea, input[type='text']")) return false;
      return isSizeMatch(rawTxt);
    });
    if (nodes.length === 0) return null;
    nodes.sort((a, b) => {
      const aId = (a.id || "").startsWith("size-") ? -1000 : 0;
      const bId = (b.id || "").startsWith("size-") ? -1000 : 0;
      const aCell = a.matches?.(".web_ui__Cell__cell, [class*='Cell__cell'], [role='button'], [role='radio']") ? -100 : 0;
      const bCell = b.matches?.(".web_ui__Cell__cell, [class*='Cell__cell'], [role='button'], [role='radio']") ? -100 : 0;
      return aId - bId || aCell - bCell || (a.textContent || "").trim().length - (b.textContent || "").trim().length;
    });
    return nodes[0];
  };

  const findSizeClickTargets = (choice) => {
    if (!choice) return [];
    const descendants = Array.from(choice.querySelectorAll(
      "[id^='size-'], .filter-grid__option, .web_ui__Cell__cell, [class*='Cell__cell'], [role='button'], [role='radio'], [role='checkbox'], button, [tabindex], input[type='radio'], input[type='checkbox']"
    )).filter((el) => isVisibleDomElement(el));
    const targets = [...descendants];
    const preferred = choice.querySelector?.(
      "[id^='size-'], .filter-grid__option, .web_ui__Cell__cell, [class*='Cell__cell'], [role='button'], [role='radio'], [role='checkbox'], button, input[type='radio']"
    );
    if (preferred) targets.unshift(preferred);
    if ((choice.id || "").startsWith("size-")) targets.unshift(choice);
    targets.push(choice);
    return Array.from(new Set(targets.filter(Boolean)));
  };

  const isSizeCommitted = (choice, clickedTarget) => {
    const primary = readPrimaryValue(spec);
    const committed = readCommittedValue(spec);
    const selected = Boolean(
      (choice && isOptionSelected(choice)) ||
      (clickedTarget && isOptionSelected(clickedTarget))
    );
    const display = getFieldDisplayText?.(label) || "";
    const primaryOk = primary && isSizeMatch(primary);
    const committedOk = committed && isSizeMatch(committed);
    const displayOk = display && isSizeMatch(display);
    const idSelected = Boolean(sizeId && findSizeOptionById() && isOptionSelected(findSizeOptionById()));
    return {
      success: Boolean(primaryOk || committedOk || displayOk || selected || idSelected),
      primary,
      committed,
      selected,
      display,
    };
  };

  const waitForSizeCommit = async (choice, clickedTarget, timeoutMs = 1200) => {
    const start = Date.now();
    let last = isSizeCommitted(choice, clickedTarget);
    while (Date.now() - start < timeoutMs) {
      last = isSizeCommitted(choice, clickedTarget);
      if (last.success) return last;
      await sleep(120);
    }
    return last;
  };

  for (let attempt = 1; attempt <= 4; attempt++) {
    const activator = findFieldActivator(label, container);
    logDomDebug(label, `sizeSelect attempt ${attempt}`, {
      target,
      sizeId,
      activator: describeElement(activator),
      beforePrimary: readPrimaryValue(spec),
    });

    if (activator) {
      clickElementHard(activator);
      await sleep(320);
    } else {
      clickElementHard(container);
      await sleep(320);
    }

    // Optional search filter for long size lists.
    const searchInput = findSizeSearchInput();
    if (searchInput) {
      const searchValue = sizeTokens[0] || target;
      searchInput.focus();
      setNativeInputValue(searchInput, searchValue);
      await sleep(450);
      logDomDebug(label, "size search typed", { searchValue, input: describeElement(searchInput) });
    }

    let choice = findSizeOptionById() || findSizeChoiceByText();
    let clickedTarget = null;
    if (choice) {
      const idFromDom =
        String(choice.id || "").match(/size-(\d+)/i) ||
        String(choice.querySelector?.("[id^='size-']")?.id || "").match(/size-(\d+)/i) ||
        String(choice.getAttribute?.("data-size-id") || choice.getAttribute?.("data-id") || "").match(/^(\d+)$/);
      if (idFromDom?.[1]) {
        draft.sizeId = parseInt(idFromDom[1], 10);
        logDomDebug(label, "captured sizeId from DOM", { sizeId: draft.sizeId });
      }
      for (const targetClick of findSizeClickTargets(choice).slice(0, 6)) {
        clickedTarget = targetClick;
        const clickId =
          String(targetClick.id || "").match(/size-(\d+)/i) ||
          String(targetClick.getAttribute?.("data-size-id") || "").match(/^(\d+)$/);
        if (clickId?.[1]) draft.sizeId = parseInt(clickId[1], 10);
        clickElementHard(targetClick);
        await sleep(180);
        const snapshot = await waitForSizeCommit(choice, clickedTarget, 420);
        if (snapshot.success) break;
      }
      logDomDebug(label, "sizeSelect clicked", {
        choice: describeElement(choice),
        targetClick: describeElement(clickedTarget),
        selected: Boolean(isOptionSelected(choice) || isOptionSelected(clickedTarget)),
      });
    } else {
      logDomDebug(label, "sizeSelect choice not found", { target, sizeId });
    }

    let commit = await waitForSizeCommit(choice, clickedTarget, 900);
    if (!commit.success) {
      await closeOpenDropdown();
      await waitForDropdownClose(1000);
      await sleep(120);
      commit = await waitForSizeCommit(choice, clickedTarget, 600);
    } else {
      await closeOpenDropdown();
      await waitForDropdownClose(800);
    }

    logDomDebug(label, "sizeSelect post check", {
      primary: commit.primary,
      committed: commit.committed,
      selected: commit.selected,
      display: commit.display,
    });

    if (commit.success) return { success: true };
  }

  // Last resort: legacy itemSelect behavior (text-only).
  const fallback = await adapterItemSelect(spec, target);
  if (fallback.success) return fallback;

  return { success: false, reason: `${label} non validé pour: "${target}"${sizeId ? ` (sizeId=${sizeId})` : ""}` };
}

async function adapterPackageSizeSelect(spec, value, draft = {}) {
  const label = spec.label;
  const packageSizeId = String(draft?.packageSizeId || "").trim();
  const idLabelMap = {
    "1": "Petit",
    "2": "Moyen",
    "3": "Grand",
    "4": "Très grand",
  };
  const target = String(value || idLabelMap[packageSizeId] || "").trim();
  const targetNorm = normalizeComparableText(target);

  const labels = [spec.label, ...(spec.labelAliases || [])];
  let container = null;
  for (const lbl of labels) {
    container = findFieldContainerByLabel(lbl);
    if (container) break;
  }
  if (!container) {
    return { success: true, skipped: true, reason: "Bloc Envoi absent du DOM" };
  }

  const visible = (el) => {
    if (!el || !el.isConnected || isInsideAutomationExcludedSurface(el)) return false;
    const rect = el.getBoundingClientRect?.();
    return !rect || (rect.width > 2 && rect.height > 2);
  };

  const choiceFromId = () => {
    if (!packageSizeId) return null;
    const escaped = window.CSS?.escape ? window.CSS.escape(packageSizeId) : packageSizeId.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    const selectors = [
      `#package-size-${escaped}`,
      `#package_size_${escaped}`,
      `[id*='package'][id*='${escaped}']`,
      `[name*='package'][value='${packageSizeId}']`,
      `[data-id='${packageSizeId}']`,
      `[data-package-size-id='${packageSizeId}']`,
    ];
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        const row = el?.closest?.("label, li, [role='radio'], [role='button'], .web_ui__Cell__cell, div") || el;
        if (row && visible(row)) return row;
      } catch (_) {
        // Continue with the next selector.
      }
    }
    return null;
  };

  const choiceFromText = () => {
    const rowForPackageElement = (el) => {
      let node = el;
      for (let i = 0; i < 6 && node; i++) {
        const txt = normalizeComparableText(node.textContent || "");
        const cls = (node.className || "").toString().toLowerCase();
        const role = (node.getAttribute?.("role") || "").toLowerCase();
        if (
          role === "radio" ||
          role === "button" ||
          node.tagName?.toLowerCase() === "label" ||
          node.tagName?.toLowerCase() === "li" ||
          (txt.length > 12 && /petit|moyen|grand|colis|convient|recommande|recommended/.test(txt) && !cls.includes("badge"))
        ) {
          return node;
        }
        node = node.parentElement;
      }
      return el;
    };

    const candidates = Array.from(container.querySelectorAll(
      "label, li, button, [role='radio'], [role='button'], .web_ui__Cell__cell, [class*='Cell__cell'], div"
    )).filter((el) => {
      if (!visible(el)) return false;
      const txt = normalizeComparableText(el.textContent || "");
      if (!txt || txt.includes("copier logs") || txt.includes("copier backup")) return false;
      if (txt.length > 260) return false;
      if (targetNorm && (txt === targetNorm || txt.startsWith(`${targetNorm} `))) return true;
      return !targetNorm && (txt.includes("recommande") || txt.includes("recommended"));
    }).map(rowForPackageElement)
      .filter((el, idx, arr) => arr.indexOf(el) === idx)
      .filter(visible);
    candidates.sort((a, b) => {
      const aTxt = normalizeComparableText(a.textContent || "");
      const bTxt = normalizeComparableText(b.textContent || "");
      const aRecommended = aTxt.includes("recommande") || aTxt.includes("recommended") ? -100 : 0;
      const bRecommended = bTxt.includes("recommande") || bTxt.includes("recommended") ? -100 : 0;
      return aRecommended - bRecommended || aTxt.length - bTxt.length;
    });
    return candidates[0] || null;
  };

  const choice = choiceFromId() || choiceFromText();
  if (!choice) {
    return { success: false, canContinue: true, reason: `Format du colis introuvable (${target || packageSizeId || "recommandé"})` };
  }

  const clickable = choice.closest?.("label, button, [role='button'], [role='radio'], li, .web_ui__Cell__cell, [class*='Cell__cell']") || choice;
  clickElementHard(clickable);
  await sleep(140);
  const input = choice.querySelector?.("input[type='radio'], input[type='checkbox']");
  if (input && !input.checked) {
    clickElementHard(input);
    await sleep(120);
  }
  if (!isOptionSelected(choice) && !isOptionSelected(clickable)) {
    clickElementHard(clickable);
    await sleep(120);
  }

  await closeOpenDropdown();
  await waitForDropdownClose(800);

  const selected = isOptionSelected(choice) || isOptionSelected(clickable) || Boolean(input?.checked);
  logDomDebug(label, "packageSizeSelect post check", {
    target: target || "(recommended)",
    packageSizeId,
    choice: describeElement(choice),
    selected,
  });

  return selected || target || packageSizeId
    ? { success: true }
    : { success: false, canContinue: true, reason: "Format du colis non validé" };
}

/**
 * Gère proofPhotoPrompt — signale uniquement, ne remplit jamais.
 *
 * @param {FieldSpec} spec
 * @returns {{ success: boolean, reason?: string }}
 */
async function adapterProofPhotoPrompt(spec) {
  return {
    success: false,
    reason: "Ce champ nécessite des photos d'authenticité uploadées manuellement par le vendeur.",
    isSensitive: true,
    canContinue: true,
  };
}

// ---------------------------------------------------------------------------
// Helpers: lecture de valeur engagée (ne pas mélanger avec textContent brut)
// ---------------------------------------------------------------------------

function isInsideDropdownOrModal(el) {
  if (!el) return false;
  const role = el.getAttribute?.("role");
  if (role === "listbox" || role === "option" || role === "dialog") return true;

  // Check data-testid attributes which Vinted uses on its menus
  const testId = (el.getAttribute?.("data-testid") || "").toString().toLowerCase();
  if (testId.includes("catalog") || testId.includes("dropdown") || testId.includes("suggest")) return true;

  let parent = el.parentElement;
  while (parent) {
    const pRole = parent.getAttribute?.("role");
    if (pRole === "listbox" || pRole === "option" || pRole === "dialog") return true;
    
    const pTestId = (parent.getAttribute?.("data-testid") || "").toString().toLowerCase();
    if (pTestId.includes("catalog") || pTestId.includes("dropdown") || pTestId.includes("suggest")) return true;

    const pClass = (parent.className || "").toString().toLowerCase();
    if (
      pClass.includes("dropdown") ||
      pClass.includes("modal") ||
      pClass.includes("listbox") ||
      pClass.includes("dialog") ||
      pClass.includes("catalog") ||
      pClass.includes("menu") ||
      pClass.includes("popup") ||
      pClass.includes("overlay") ||
      pClass.includes("portal")
    ) return true;
    parent = parent.parentElement;
  }
  return false;
}

function isInsideAutomationExcludedSurface(el) {
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
      cls.includes("ot-") ||
      testId.includes("cookie") ||
      testId.includes("consent") ||
      testId.includes("privacy")
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isVisibleDomElement(el) {
  if (!el || !el.isConnected) return false;
  if (isInsideAutomationExcludedSurface(el)) return false;
  const rect = el.getBoundingClientRect?.();
  return !rect || (rect.width > 2 && rect.height > 2);
}

function isCategorySuggestionSurfaceOpen() {
  const controls = Array.from(
    document.querySelectorAll(
      "input#catalog-search-input[aria-expanded='true'], " +
      "input[name*='catalog'][aria-expanded='true'], " +
      "[role='listbox'], [role='option'], " +
      "[data-testid*='catalog'][aria-expanded='true'], " +
      "[class*='catalog'][aria-expanded='true']"
    )
  );
  return controls.some((el) => {
    if (!isVisibleDomElement(el)) return false;
    const txt = normalizeComparableText(el.textContent || "");
    const id = (el.id || "").toLowerCase();
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    const controlsId = (el.getAttribute?.("aria-controls") || "").toLowerCase();
    if (role === "listbox" || role === "option") return true;
    return id.includes("catalog") || controlsId.includes("catalog") || txt.includes("categorie") || txt.includes("category");
  });
}

async function waitForCategorySuggestionClose(timeoutMs = 2200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isCategorySuggestionSurfaceOpen()) return true;
    await sleep(120);
  }
  return false;
}

function isUsableTextEntry(el) {
  if (!el || !el.isConnected) return false;
  if (isInsideAutomationExcludedSurface(el)) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag !== "input" && tag !== "textarea" && el.getAttribute?.("contenteditable") !== "true") return false;
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (!["text", "search", "email", "url", "tel", ""].includes(type)) return false;
  }
  if (el.hasAttribute?.("readonly") || el.hasAttribute?.("disabled")) return false;
  const rect = el.getBoundingClientRect?.();
  return !rect || (rect.width > 2 && rect.height > 2);
}

function isExpectedSearchInput(el, fieldKey, options = {}) {
  if (!isUsableTextEntry(el)) return false;
  const key = String(fieldKey || "").toLowerCase();
  const id = (el.id || "").toLowerCase();
  const name = (el.getAttribute?.("name") || "").toLowerCase();
  const role = (el.getAttribute?.("role") || "").toLowerCase();
  const ariaLabel = (el.getAttribute?.("aria-label") || "").toLowerCase();
  if (id.includes(key) || name.includes(key) || ariaLabel.includes(key)) return true;
  if (role === "combobox" && (id.includes("search") || name.includes("search"))) return true;
  return Boolean(options.allowGenericDialogSearch);
}

function isExpectedCommittedInput(el, fieldKey) {
  if (!el || !el.isConnected) return false;
  if (isInsideAutomationExcludedSurface(el)) return false;
  const id = (el.id || "").toLowerCase();
  const name = (el.getAttribute?.("name") || "").toLowerCase();
  const type = (el.getAttribute?.("type") || "text").toLowerCase();
  if (["checkbox", "radio", "file", "button", "submit"].includes(type)) return false;
  const key = String(fieldKey || "").toLowerCase();
  if (key === "category") return id === "catalog" || name.includes("catalog");
  return id === key || id.includes(key) || name.includes(key);
}

/**
 * Lit la valeur engagée (committed) d'un champ via son sélecteur dédié.
 *
 * @param {FieldSpec} spec
 * @returns {string}
 */
function readCommittedValue(spec) {
  if (!spec.committedSelector) return "";
  const elements = Array.from(document.querySelectorAll(spec.committedSelector));
  const el = elements.find((candidate) => isExpectedCommittedInput(candidate, spec.id)) || elements[0];
  if (!el) return "";
  const raw = el.value || el.getAttribute("value") || el.textContent || "";
  return normalizeComparableText(raw);
}

/**
 * Lit la valeur principale affichée dans le champ (hors dropdown).
 *
 * @param {FieldSpec} spec
 * @returns {string}
 */
function readPrimaryValue(spec) {
  const container = findFieldContainerByLabel(spec.label);
  if (!container) return "";
  const candidates = Array.from(
    container.querySelectorAll("input, .c-input__value, .web_ui__InputBar__value")
  ).filter((el) => {
    if (!el || !el.isConnected) return false;
    if (isInsideDropdownOrModal(el)) return false;
    const id = (el.id || "").toLowerCase();
    if (id.includes("search")) return false;
    const type = (el.getAttribute?.("type") || "").toLowerCase();
    if (["hidden", "file", "radio", "checkbox"].includes(type)) return false;
    return true;
  });

  for (const el of candidates) {
    const raw = (el.value || el.getAttribute("value") || el.textContent || "").trim();
    const v   = normalizeComparableText(raw);
    if (!v) continue;
    if (/^\d+$/.test(v)) continue;
    if (["on", "off", "true", "false", "yes", "no"].includes(v)) continue;
    if (/rechercher|trouver|suggestions|selectionne|sélectionne/.test(v)) continue;
    return v;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Dispatch selon widget type
// ---------------------------------------------------------------------------

/**
 * Exécute l'adapter correspondant au widget type du champ.
 *
 * @param {FieldSpec} spec
 * @param {string|string[]|null} value
 * @returns {{ success: boolean, reason?: string, isSensitive?: boolean, canContinue?: boolean }}
 */
async function executeFieldAdapter(spec, value, draft) {
  switch (spec.widget) {
    case "textInput":
      if (!value) return { success: true }; // Pas de valeur = pas d'action
      return adapterTextInput(spec, String(value));

    case "categorySearch":
      if (!value) return { success: false, reason: "Catégorie non renseignée dans le backup" };
      {
        const catResult = await adapterCategorySearch(spec, String(value), draft);
        // Vinted re-renders the form after category selection — wait for DOM to settle.
        await sleep(1500);
        return catResult;
      }

    case "brandSearch":
      if (!value) return { success: true }; // Marque optionnelle
      return adapterBrandSearch(spec, String(value), draft);

    case "singleSelect":
      if (!value) return { success: true };
      return adapterSingleSelect(spec, String(value), draft);

    case "multiSelect":
      return adapterMultiSelect(spec, Array.isArray(value) ? value : []);

    case "itemSelect":
      if (!value) return { success: true };
      return adapterItemSelect(spec, String(value));

    case "sizeSelect":
      if (!value) return { success: true };
      return adapterSizeSelect(spec, String(value), draft);

    case "packageSizeSelect":
      return adapterPackageSizeSelect(spec, value, draft);

    case "proofPhotoPrompt":
      return adapterProofPhotoPrompt(spec);

    default:
      return { success: false, reason: `Widget inconnu: ${spec.widget}` };
  }
}

async function selectCategoryForSchemaCrawler(draft) {
  const spec = window.VINTED_FIELD_SPECS?.category;
  const value = draft?.category;
  if (!spec) return { success: false, reason: "Spec catégorie indisponible" };
  if (!value) return { success: false, reason: "Catégorie absente du probe" };
  return adapterCategorySearch(spec, value, draft);
}

// ---------------------------------------------------------------------------
// Moteur principal
// ---------------------------------------------------------------------------

async function resolveAutomationSchema(draft) {
  const catalogId = draft?.catalogId;
  const getSchemaForCatalogId = window.vintedGetSchemaForCatalogId;
  const findSchemaForDraft = window.vintedFindSchemaForDraft;
  const discoverSchemaFromCurrentDom = window.vintedDiscoverSchemaFromCurrentDom;

  if (typeof findSchemaForDraft === "function") {
    try {
      const matchedSchema = await findSchemaForDraft(draft);
      if (matchedSchema) {
        return {
          schema: matchedSchema,
          source: matchedSchema.schemaSource || "schema-match",
        };
      }
    } catch (error) {
      appendOverlayLog("warning", `Recherche schéma catalogue impossible: ${error?.message || error}`);
    }
  }

  if (typeof getSchemaForCatalogId === "function") {
    try {
      const cachedSchema = await getSchemaForCatalogId(catalogId);
      if (cachedSchema) {
        return {
          schema: cachedSchema,
          source: cachedSchema.schemaSource || "schema-cache",
        };
      }
    } catch (error) {
      appendOverlayLog("warning", `Lecture schéma catalogue impossible: ${error?.message || error}`);
    }
  }

  if (typeof discoverSchemaFromCurrentDom === "function") {
    try {
      const discoveredSchema = await discoverSchemaFromCurrentDom(draft, {
        requireSelectedCategory: true,
      });
      if (discoveredSchema?.isComplete) {
        return {
          schema: discoveredSchema,
          source: "dom-discovery",
        };
      }
    } catch (error) {
      appendOverlayLog("warning", `Discovery schéma pré-remplissage impossible: ${error?.message || error}`);
    }
  }

  return { schema: null, source: "legacy-profile" };
}

async function discoverAndPersistCurrentSchema(draft) {
  if (typeof window.vintedDiscoverSchemaFromCurrentDom !== "function") return null;
  try {
    const schema = await window.vintedDiscoverSchemaFromCurrentDom(draft, {
      assumeCategorySelected: true,
    });
    if (!schema?.catalogId) return schema || null;
    if (typeof window.vintedSaveDiscoveredSchema === "function") {
      const saved = await window.vintedSaveDiscoveredSchema(schema);
      if (saved?.success) {
        appendOverlayLog("success", `Schéma catalogue ${schema.catalogId} sauvegardé localement`);
      }
    }
    return schema;
  } catch (error) {
    appendOverlayLog("warning", `Discovery schéma post-catégorie impossible: ${error?.message || error}`);
    return null;
  }
}

function appendMissingSchemaFields(fieldPlan, schemaPlan, processedFields) {
  const known = new Set(fieldPlan.map((entry) => entry.spec.id));
  let appended = 0;
  for (const entry of schemaPlan) {
    const fieldId = entry.spec.id;
    if (known.has(fieldId) || processedFields.has(fieldId)) continue;
    fieldPlan.push(entry);
    known.add(fieldId);
    appended += 1;
  }
  return appended;
}

/**
 * Exécute le remplissage complet du formulaire à partir du draft.
 * Pilote la matrice, valide chaque champ, logue explicitement.
 *
 * @param {object} draft   Données de l'article (backup storage)
 * @param {{ strict?: boolean }} options
 * @returns {{ success: boolean, fieldResults: object[], profile: string }}
 */
async function runFormMatrixAutomation(draft, options = {}) {
  const profile = window.vintedResolveCategoryProfile
    ? window.vintedResolveCategoryProfile(draft)
    : { id: "default", label: "Défaut", fields: ["title", "description", "category", "brand", "condition", "material", "colors", "price"], sensitiveFields: [] };

  const buildFieldPlan = window.vintedBuildFieldPlan;
  const buildFieldPlanFromSchema = window.vintedBuildFieldPlanFromSchema;
  const fieldSpecs     = window.VINTED_FIELD_SPECS;

  if (!buildFieldPlan || !fieldSpecs) {
    appendOverlayLog("error", "Moteur: vinted-field-matrix.js non chargé");
    return { success: false, fieldResults: [], profile: "unknown" };
  }

  const resolvedSchema = await resolveAutomationSchema(draft);
  let activeSchema = resolvedSchema.schema;
  let schemaSource = resolvedSchema.source;

  appendOverlayLog("info", `Profil fallback: ${profile.label} (${profile.id})`);
  if (activeSchema && buildFieldPlanFromSchema) {
    appendOverlayLog(
      "success",
      `Schéma catalogue actif: ${activeSchema.catalogId} (${schemaSource})`
    );
  } else {
    appendOverlayLog("warning", `Aucun schéma catalogue exploitable, fallback matrice (${profile.id})`);
  }
  if (!activeSchema && profile.sensitiveFields && profile.sensitiveFields.length > 0) {
    appendOverlayLog("warning", `Champs sensibles: ${profile.sensitiveFields.join(", ")} — intervention manuelle possible`);
  }

  // Inspecter les champs réellement présents dans le formulaire.
  let presentFields = inspectCurrentForm();
  appendOverlayLog("info", `Champs détectés dans le formulaire: ${Array.from(presentFields).join(", ") || "aucun"}`);

  let fieldPlan = activeSchema && buildFieldPlanFromSchema
    ? buildFieldPlanFromSchema(activeSchema, draft, fieldSpecs)
    : buildFieldPlan(profile, draft);

  // CRITICAL: category remounts the form and wipes price — always fill price last.
  fieldPlan = [
    ...fieldPlan.filter((entry) => entry?.spec?.id !== "price"),
    ...fieldPlan.filter((entry) => entry?.spec?.id === "price"),
  ];
  const fieldResults = [];
  const processedFields = new Set();
  let criticalFailure = false;

  for (let planIndex = 0; planIndex < fieldPlan.length; planIndex++) {
    const { spec, value, required } = fieldPlan[planIndex];
    if (processedFields.has(spec.id)) continue;
    processedFields.add(spec.id);
    presentFields = inspectCurrentForm();

    // Champ requis mais absent du DOM: erreur explicite.
    if (required && !presentFields.has(spec.id) && spec.widget !== "textInput") {
      const msg = `Champ requis "${spec.label}" absent du formulaire (${activeSchema ? `schema:${activeSchema.catalogId}` : `profil:${profile.id}`})`;
      appendOverlayLog("error", msg);
      fieldResults.push({ fieldId: spec.id, success: false, reason: msg });
      if (options.strict) {
        criticalFailure = true;
        break;
      }
      continue;
    }

    // Champ non présent et non requis: on log et on passe.
    if (!presentFields.has(spec.id) && spec.widget !== "textInput") {
      appendOverlayLog("info", `Champ "${spec.label}" absent du formulaire, ignoré (optionnel)`);
      fieldResults.push({ fieldId: spec.id, success: true, skipped: true });
      continue;
    }

    if (!value && !spec.required && spec.widget !== "proofPhotoPrompt" && spec.widget !== "packageSizeSelect") {
      appendOverlayLog("info", `Champ "${spec.label}": pas de valeur dans le backup, ignoré`);
      fieldResults.push({ fieldId: spec.id, success: true, skipped: true, reason: "Valeur absente du backup" });
      continue;
    }

    appendOverlayLog("info", `Remplissage: ${spec.label} → ${Array.isArray(value) ? value.join("/") : value || "(vide)"}`);
    const result = await executeFieldAdapter(spec, value, draft);
    fieldResults.push({ fieldId: spec.id, ...result });

    if (spec.widget === "categorySearch" && result.success) {
      if (result.catalogId && !draft.catalogId) {
        draft.catalogId = result.catalogId;
      }
      // Size groups depend on catalog — resolve IDs again once category is known.
      if (typeof window.vintedResolveMissingDraftIds === "function" && (!draft.sizeId || !draft.brandId)) {
        try {
          await window.vintedResolveMissingDraftIds(draft);
        } catch (_) {
          // keep going with whatever IDs we already have
        }
      }
      presentFields = inspectCurrentForm();
      const discoveredSchema = await discoverAndPersistCurrentSchema(draft);
      if (discoveredSchema?.isComplete && buildFieldPlanFromSchema) {
        activeSchema = discoveredSchema;
        schemaSource = "dom-discovery";
        const discoveredPlan = buildFieldPlanFromSchema(discoveredSchema, draft, fieldSpecs);
        const appended = appendMissingSchemaFields(fieldPlan, discoveredPlan, processedFields);
        appendOverlayLog(
          "info",
          `Schéma post-catégorie actif: ${discoveredSchema.catalogId || "?"} (${schemaSource}, +${appended} champ(s))`
        );
      }
    }

    if (result.success) {
      appendOverlayLog("success", `${spec.label}: ${Array.isArray(value) ? value.join(" / ") : value}`);
    } else if (result.isSensitive && result.canContinue) {
      // Champ sensible (authenticity proof): warning mais on continue.
      appendOverlayLog("warning", `${spec.label}: ${result.reason}`);
    } else if (spec.id === "category") {
      appendOverlayLog("error", `Catégorie non validée, arrêt du remplissage dépendant: ${result.reason}`);
      criticalFailure = true;
      break;
    } else if (required && !result.success) {
      appendOverlayLog("error", `Champ requis "${spec.label}" non validé: ${result.reason}`);
      if (options.strict) {
        criticalFailure = true;
        break;
      }
    } else {
      appendOverlayLog("warning", `${spec.label}: ${result.reason}`);
    }
  }

  if (typeof closeOpenDropdown === "function") {
    await closeOpenDropdown();
    await waitForDropdownClose(600);
  }

  // Final price pass: category / package remounts often wipe the input.
  if (draft?.price && fieldSpecs?.price) {
    const latePrice = await adapterTextInput(
      fieldSpecs.price,
      typeof window.formatPriceForVintedInput === "function"
        ? window.formatPriceForVintedInput(draft.price)
        : draft.price
    );
    fieldResults.push({ fieldId: "price", ...latePrice, latePass: true });
    if (latePrice.success) {
      appendOverlayLog("success", `Prix (pass final): ${latePrice.value || draft.price} €`);
    } else {
      appendOverlayLog("error", `Prix (pass final) échoué: ${latePrice.reason || "inconnu"}`);
      criticalFailure = true;
    }
  } else if (!draft?.price) {
    appendOverlayLog("error", "Prix absent du backup — publication bloquée");
    fieldResults.push({ fieldId: "price", success: false, reason: "Prix absent du backup" });
    criticalFailure = true;
  }

  const overallSuccess = !criticalFailure && fieldResults.every(
    (r) => r.success || r.skipped || r.canContinue || (r.isSensitive && r.canContinue)
  );

  return {
    success: overallSuccess,
    fieldResults,
    profile: profile.id,
    schemaSource,
    catalogId: activeSchema?.catalogId || draft?.catalogId || null,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  window.vintedRunFormMatrixAutomation = runFormMatrixAutomation;
  window.vintedInspectCurrentForm      = inspectCurrentForm;
  window.vintedSelectCategoryForSchemaCrawler = selectCategoryForSchemaCrawler;
}
