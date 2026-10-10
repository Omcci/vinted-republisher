/**
 * vinted-field-matrix.js
 * Version: 1.0.0
 *
 * Matrice déterministe catégorie → champs → widget DOM → règle de validation.
 * Aucun fallback silencieux: chaque champ inconnu est explicitement signalé.
 *
 * Widget types:
 *   categorySearch  — champ texte avec suggestions, validation par input engagé (input#catalog)
 *   brandSearch     — champ texte avec suggestions, validation par input engagé (input#brand)
 *   singleSelect    — liste de choix exclusifs (condition/état), clic + vérif checked/selected
 *   multiSelect     — sélection multiple (couleurs), plusieurs clics + vérif checked/selected
 *   itemSelect      — liste de lignes cliquables sans vrai état "checked" (matériau)
 *   textInput       — input texte ou textarea libre (titre, description, prix)
 *   proofPhotoPrompt — prompt authenticité affiché par Vinted, non remplissable par script
 *   sizeSelect      — sélecteur de taille (taille unique)
 *
 * Règles de validation par widget:
 *   categorySearch  → input#catalog value == target (normalisé)
 *   brandSearch     → input#brand value == target (normalisé) OU primaryFieldValue == target
 *   singleSelect    → option.checked == true OU aria-checked="true" OU primaryFieldValue == target
 *   multiSelect     → option.checked == true pour chaque valeur demandée
 *   itemSelect      → primaryFieldValue contient target OU committedFieldValue contient target
 *   textInput       → element.value contient target
 *   proofPhotoPrompt → toujours warning explicite, jamais bloquant
 *   sizeSelect      → input#size value == target OU singleSelect style
 */

// ---------------------------------------------------------------------------
// Définitions des champs
// ---------------------------------------------------------------------------

/** @type {Record<string, FieldSpec>} */
const FIELD_SPECS = {
  category: {
    id: "category",
    label: "Catégorie",
    labelAliases: ["Categorie", "Category"],
    widget: "categorySearch",
    required: true,
    globalInputSelector: "input#catalog-search-input, input[name*='catalog'], input[id*='catalog'][type='text']",
    committedSelector: "#catalog, input#catalog, #catalog_id, input#catalog_id, input[name='catalog_id']",
    domIdPrefixes: ["catalog-"],
  },
  brand: {
    id: "brand",
    label: "Marque",
    labelAliases: ["Brand"],
    widget: "brandSearch",
    required: false,
    globalInputSelector: "input#brand-search-input, input[name*='brand'], input[id*='brand'][type='text']",
    committedSelector: "input#brand, input[name*='brand']",
    primarySelector: "input#brand.c-input__value",
    domIdPrefixes: ["suggested-brand-", "brand-"],
  },
  condition: {
    id: "condition",
    label: "État",
    labelAliases: ["Etat", "Condition", "État de l'article", "Etat de l'article", "État de l'objet"],
    widget: "singleSelect",
    required: false,
    globalInputSelector: null,
    committedSelector: "input#status, input[name*='status']",
    primarySelector: null,
    domIdPrefixes: ["condition-"],
    // The condition field shows the list expanded on click; options are divs with id like #2, #6...
    conditionIdMap: {
      "neuf avec étiquette": "6",
      "neuf sans étiquette": "1",
      "très bon état": "2",
      "bon état": "3",
      "satisfaisant": "4",
    },
  },
  material: {
    id: "material",
    label: "Matériau",
    labelAliases: ["Matière", "Matiere", "Materiau", "Material", "Composition"],
    widget: "itemSelect",
    required: false,
    globalInputSelector: "input#material-search-input, input[name*='material'][type='text']",
    committedSelector: "input#material, input[name*='material']",
    domIdPrefixes: ["material-"],
  },
  colors: {
    id: "colors",
    label: "Couleur",
    labelAliases: ["Color", "Colors", "Colour", "Colours"],
    widget: "multiSelect",
    required: false,
    globalInputSelector: "input#color-search-input, input[name*='color'][type='text']",
    committedSelector: "input#color, input[name*='color']",
    domIdPrefixes: ["suggested-color-", "color-"],
    maxSelections: 2,
  },
  size: {
    id: "size",
    label: "Taille",
    labelAliases: ["Size", "Pointure"],
    widget: "sizeSelect",
    required: false,
    globalInputSelector: "input#size-search-input, input[name*='size'][type='text']",
    committedSelector: "input#size, input[name*='size']",
    domIdPrefixes: ["size-"],
  },
  title: {
    id: "title",
    label: "Titre",
    labelAliases: ["Title"],
    widget: "textInput",
    required: true,
    selector: 'input[name="title"], input[id*="title"], input[data-testid*="title"]',
  },
  description: {
    id: "description",
    label: "Description",
    labelAliases: ["Description"],
    widget: "textInput",
    required: false,
    selector: 'textarea[name="description"], textarea[id*="description"], textarea[data-testid*="description"]',
  },
  price: {
    id: "price",
    label: "Prix",
    labelAliases: ["Price"],
    widget: "textInput",
    required: true,
    // IMPORTANT: price must be filled AFTER category (Vinted remounts the form).
    selector: 'input[name="price"], input[id*="price"], input[data-testid*="price"], input[inputmode="decimal"]',
  },
  authenticityProof: {
    id: "authenticityProof",
    label: "Preuves d'authenticité",
    labelAliases: ["Preuve d'authenticite", "Authenticity proof"],
    widget: "proofPhotoPrompt",
    required: false,
    // Ce champ n'est jamais rempli par le script, seulement signalé.
  },
  packageSize: {
    id: "packageSize",
    label: "Envoi",
    labelAliases: ["Format du colis", "Colis", "Choisis le format du colis", "Package size", "Parcel size", "Shipping"],
    widget: "packageSizeSelect",
    required: false,
    globalInputSelector: null,
    committedSelector: "input[name*='package_size'], input[id*='package_size'], input[name*='packageSize'], input[id*='packageSize']",
    domIdPrefixes: ["package-size-", "package_size-", "shipment-package-size-"],
  },
};

// ---------------------------------------------------------------------------
// Profils catégorie
// ---------------------------------------------------------------------------

/** @type {Record<string, CategoryProfile>} */
const CATEGORY_PROFILES = {
  default: {
    id: "default",
    label: "Défaut",
    fields: ["title", "description", "category", "brand", "condition", "material", "colors", "packageSize", "price"],
    sensitiveFields: [],
    notes: "Profil générique appliqué si aucun profil spécifique ne correspond.",
  },

  clothing: {
    id: "clothing",
    label: "Vêtements",
    fields: ["title", "description", "category", "brand", "condition", "size", "colors", "material", "packageSize", "price"],
    sensitiveFields: [],
    categoryKeywords: ["vêtement", "vetement", "robe", "pantalon", "chemise", "pull", "manteau", "veste", "jupe", "short", "t-shirt", "lingerie", "maillot", "pyjama", "sous-vêtement"],
    notes: "La taille est requise pour les vêtements.",
  },

  shoes: {
    id: "shoes",
    label: "Chaussures",
    fields: ["title", "description", "category", "brand", "condition", "size", "colors", "material", "packageSize", "price"],
    sensitiveFields: [],
    categoryKeywords: ["chaussure", "basket", "sneaker", "botte", "bottine", "sandale", "espadrille", "mocassin", "ballerine", "talon"],
    notes: "La taille est requise pour les chaussures.",
  },

  accessories: {
    id: "accessories",
    label: "Accessoires",
    fields: ["title", "description", "category", "brand", "condition", "colors", "material", "packageSize", "price"],
    sensitiveFields: [],
    categoryKeywords: ["accessoire", "sac", "ceinture", "chapeau", "bonnet", "écharpe", "gant", "bijou", "montre", "portefeuille"],
    notes: "Matériau souvent pertinent pour les accessoires.",
  },

  sunglasses: {
    id: "sunglasses",
    label: "Lunettes de soleil",
    fields: ["title", "description", "category", "brand", "condition", "colors", "material", "authenticityProof", "packageSize", "price"],
    sensitiveFields: ["authenticityProof"],
    categoryKeywords: ["lunette", "lunettes de soleil", "soleil", "optique"],
    authenticityBrands: [],
    notes: "Vinted exige des photos d'authenticité pour les marques connues (logos, numéro de série, vis, branches).",
  },

  luxuryBrand: {
    id: "luxuryBrand",
    label: "Marque luxe / authenticité",
    fields: ["title", "description", "category", "brand", "condition", "size", "colors", "material", "authenticityProof", "packageSize", "price"],
    sensitiveFields: ["authenticityProof"],
    categoryKeywords: [],
    authenticityBrands: [
      "gucci", "prada", "chanel", "louis vuitton", "hermes", "hermès", "dior", "balenciaga",
      "saint laurent", "ysl", "fendi", "versace", "burberry", "givenchy", "valentino",
      "bottega veneta", "off-white", "stella mccartney", "stella mc cartney",
    ],
    notes: "Certaines marques déclenchent une exigence de preuves d'authenticité.",
  },

  electronics: {
    id: "electronics",
    label: "Électronique",
    fields: ["title", "description", "category", "brand", "condition", "colors", "material", "packageSize", "price"],
    sensitiveFields: [],
    categoryKeywords: ["électronique", "electronique", "tablette", "smartphone", "téléphone", "telephone", "ordinateur", "console", "liseuse", "accessoire électronique", "stylet", "stylets", "clavier", "souris", "écouteur", "casque"],
    notes: "Les appareils doivent être réinitialisés et déconnectés avant la vente.",
  },

  sports: {
    id: "sports",
    label: "Sport",
    fields: ["title", "description", "category", "brand", "condition", "size", "colors", "material", "packageSize", "price"],
    sensitiveFields: [],
    categoryKeywords: ["sport", "fitness", "vélo", "velo", "raquette", "balle", "ballon", "ski", "surf", "natation", "running", "yoga"],
    notes: "La taille peut être pertinente pour les articles de sport.",
  },

  home: {
    id: "home",
    label: "Maison / Déco",
    fields: ["title", "description", "category", "brand", "condition", "colors", "material", "packageSize", "price"],
    sensitiveFields: [],
    categoryKeywords: ["maison", "décoration", "decoration", "vaisselle", "cuisine", "meuble", "linge", "luminaire", "cadre", "tableau", "plante"],
    notes: "Matériau et couleur sont souvent pertinents pour les articles de maison.",
  },

  baby: {
    id: "baby",
    label: "Bébé / Enfant",
    fields: ["title", "description", "category", "brand", "condition", "size", "colors", "material", "packageSize", "price"],
    sensitiveFields: [],
    categoryKeywords: ["bébé", "bebe", "enfant", "puériculture", "jouet", "poussette", "landau"],
    notes: "La taille est souvent pertinente pour les vêtements enfants.",
  },
};

// ---------------------------------------------------------------------------
// Résolution de profil
// ---------------------------------------------------------------------------

/**
 * Résout le profil catégorie à partir des données de l'article.
 * Priorité: marque luxe → catégorie texte → défaut.
 *
 * @param {{ brand?: string, category?: string, condition?: string }} item
 * @returns {CategoryProfile}
 */
function resolveCategoryProfile(item) {
  const brand = String(item.brand || "").toLowerCase().trim();
  const category = String(item.category || "").toLowerCase().trim();

  // Marque luxe: vérification prioritaire car peut s'appliquer à n'importe quelle catégorie.
  const luxuryProfile = CATEGORY_PROFILES.luxuryBrand;
  if (brand && luxuryProfile.authenticityBrands.some((b) => brand.includes(b) || b.includes(brand))) {
    return luxuryProfile;
  }

  // Correspondance texte catégorie par profils sensibles d'abord.
  const orderedProfiles = ["sunglasses", "electronics", "shoes", "clothing", "sports", "baby", "home", "accessories"];
  for (const profileId of orderedProfiles) {
    const profile = CATEGORY_PROFILES[profileId];
    if (!profile.categoryKeywords || profile.categoryKeywords.length === 0) continue;
    if (profile.categoryKeywords.some((kw) => category.includes(kw))) {
      return profile;
    }
  }

  return CATEGORY_PROFILES.default;
}

/**
 * Déduplique et réduit la liste de champs selon ce qui est réellement
 * disponible dans le draft (pas de champ si valeur vide).
 *
 * @param {CategoryProfile} profile
 * @param {object} draft
 * @returns {FieldSpec[]}
 */
function buildFieldPlan(profile, draft) {
  const plan = [];
  for (const fieldId of profile.fields) {
    const spec = FIELD_SPECS[fieldId];
    if (!spec) continue;

    let value = getDraftValue(draft, fieldId);

    // Si pas de valeur ET champ non requis → on inclut quand même pour signalisation.
    // Si valeur vide ET champ requis → on inclut pour erreur explicite.
    plan.push({ spec, value, required: spec.required || false });
  }
  return plan;
}

/**
 * Extrait la valeur du draft pour un fieldId donné.
 *
 * @param {object} draft
 * @param {string} fieldId
 * @returns {string|string[]|null}
 */
function getDraftValue(draft, fieldId) {
  switch (fieldId) {
    case "category": {
      const rawCat = draft.category || null;
      if (!rawCat) return null;
      // Strip internal Vinted catalog code prefixes like "ATM T-shirts" → "T-shirts"
      const cleanedCat = rawCat.replace(/^[A-Z]{2,5}\s+/, "").trim();
      return cleanedCat || rawCat;
    }
    case "brand":       return draft.brand || null;
    case "condition":   return draft.condition || null;
    case "material":    return draft.material || null;
    case "colors":      return (draft.colors && draft.colors.length > 0) ? draft.colors : null;
    case "size":        return draft.size || null;
    case "title":       return draft.title || null;
    case "description": return draft.description || null;
    case "price":       return draft.price || null;
    case "authenticityProof": return null;
    case "packageSize": {
      if (draft.packageSizeTitle) return draft.packageSizeTitle;
      const id = String(draft.packageSizeId || "").trim();
      const byId = {
        "1": "Petit",
        "2": "Moyen",
        "3": "Grand",
        "4": "Très grand",
      };
      return byId[id] || null;
    }
    default:            return null;
  }
}

// ---------------------------------------------------------------------------
// Exports (accessible depuis content.js et vinted-form-engine.js)
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  window.VINTED_FIELD_SPECS = FIELD_SPECS;
  window.VINTED_CATEGORY_PROFILES = CATEGORY_PROFILES;
  window.vintedResolveCategoryProfile = resolveCategoryProfile;
  window.vintedBuildFieldPlan = buildFieldPlan;
  window.vintedGetDraftValue = getDraftValue;
}
