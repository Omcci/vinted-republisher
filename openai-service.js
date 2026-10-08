/**
 * openai-service.js - Service d'intégration OpenAI (LLM) pour Vinted Republisher PRO.
 * Permet la reformulation intelligente des titres et descriptions sans aucune dépendance externe.
 * Modèle par défaut : gpt-4o-mini (ultra rapide, économique et précis).
 */

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_STORAGE_KEYS = {
  apiKey: "vinted_openai_api_key",
  model: "vinted_openai_model",
  enabled: "vinted_openai_enabled",
  autoGenerate: "vinted_openai_auto_generate",
};

/**
 * Récupère la configuration OpenAI stockée localement.
 * @returns {Promise<{ apiKey: string, model: string, enabled: boolean, autoGenerate: boolean }>}
 */
async function getOpenAiConfig() {
  try {
    const res = await chrome.storage.local.get([
      OPENAI_STORAGE_KEYS.apiKey,
      OPENAI_STORAGE_KEYS.model,
      OPENAI_STORAGE_KEYS.enabled,
      OPENAI_STORAGE_KEYS.autoGenerate,
    ]);
    return {
      apiKey: String(res[OPENAI_STORAGE_KEYS.apiKey] || "").trim(),
      model: String(res[OPENAI_STORAGE_KEYS.model] || OPENAI_DEFAULT_MODEL).trim(),
      enabled: Boolean(res[OPENAI_STORAGE_KEYS.enabled]),
      autoGenerate: res[OPENAI_STORAGE_KEYS.autoGenerate] !== false, // Actif par défaut si IA activée
    };
  } catch (err) {
    console.warn("[OpenAI Service] Impossible de lire la config:", err);
    return {
      apiKey: "",
      model: OPENAI_DEFAULT_MODEL,
      enabled: false,
      autoGenerate: true,
    };
  }
}

/**
 * Sauvegarde la configuration OpenAI dans le stockage local.
 * @param {object} patch
 */
async function saveOpenAiConfig(patch = {}) {
  const toSave = {};
  if (patch.apiKey !== undefined) toSave[OPENAI_STORAGE_KEYS.apiKey] = String(patch.apiKey).trim();
  if (patch.model !== undefined) toSave[OPENAI_STORAGE_KEYS.model] = String(patch.model).trim();
  if (patch.enabled !== undefined) toSave[OPENAI_STORAGE_KEYS.enabled] = Boolean(patch.enabled);
  if (patch.autoGenerate !== undefined) toSave[OPENAI_STORAGE_KEYS.autoGenerate] = Boolean(patch.autoGenerate);
  await chrome.storage.local.set(toSave);
}

/**
 * Teste la validité d'une clé API OpenAI sans consommer de tokens de génération (GET /v1/models).
 * @param {string} apiKey
 * @returns {Promise<{ ok: boolean, message?: string, error?: string }>}
 */
async function testOpenAiApiKey(apiKey) {
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) {
    return { ok: false, error: "Veuillez renseigner une clé API OpenAI (ex: sk-...)." };
  }
  if (!cleanKey.startsWith("sk-")) {
    return { ok: false, error: "Format invalide : une clé API OpenAI commence généralement par 'sk-'." };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
    });

    if (!response.ok) {
      let msg = `Erreur HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson?.error?.message) {
          msg = errJson.error.message;
        }
      } catch (_) {}
      return { ok: false, error: msg };
    }

    return { ok: true, message: "Connexion réussie ! Clé API valide et opérationnelle." };
  } catch (err) {
    return { ok: false, error: err.message || "Impossible de contacter l'API OpenAI (vérifiez votre connexion)." };
  }
}

/**
 * Reformule le titre et la description via OpenAI Chat Completions.
 * Génère des variations riches, humaines et percutantes tout en conservant les faits exacts.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} [params.model]
 * @param {string} params.title
 * @param {string} params.description
 * @param {object} [params.item]
 * @returns {Promise<{ titles: string[], descriptions: string[], model: string, usage: object }>}
 */
async function callOpenAiListingReformulation({
  apiKey,
  model = OPENAI_DEFAULT_MODEL,
  title,
  description,
  item = {},
}) {
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) {
    throw new Error("Clé API OpenAI absente.");
  }

  const brand = String(item.brand || "").trim();
  const condition = String(item.condition || "").trim();
  const colors = Array.isArray(item.colors) ? item.colors.join(", ") : String(item.colors || "").trim();
  const material = String(item.material || "").trim();
  const size = String(item.size || "").trim();
  const price = item.price ? `${item.price} €` : "";

  const systemPrompt = `Tu es un expert du commerce d'occasion sur la plateforme Vinted.
Ta mission est de reformuler le titre et la description d'une annonce pour briser l'empreinte algorithmique de doublon (anti-shadowban Vinted) tout en améliorant l'attrait et la conversion commerciale.

RÈGLES D'OR :
1. Titre :
   - Génère 2 ou 3 variantes de titres percutants, naturels et optimisés pour la barre de recherche Vinted.
   - Longueur maximale : 85 caractères par titre (Vinted limite à 100 max).
   - Inclus la marque, le modèle/type d'article et les mots-clés essentiels.
2. Description :
   - Génère 2 variantes de descriptions soignées, chaleureuses et faciles à parcourir.
   - Structure type :
     * Phrase d'accroche valorisant l'article.
     * Puces structurées reprenant fidèlement les détails : État, Marque, Matière, Couleur, Taille (si disponibles).
     * Formule de réassurance (envoi rapide sous 24/48h, emballage soigné).
     * Invitation polie aux questions ou aux réductions sur les lots du dressing.
3. VÉRACITÉ STRICTE :
   - Ne JAMAIS inventer d'informations : base-toi UNIQUEMENT sur les données fournies (marque, état, couleur, matière, taille).
4. FORMAT DE SORTIE :
   - Réponds STRICTEMENT sous format JSON valide avec la structure suivante :
   {
     "titles": ["Variante 1", "Variante 2"],
     "descriptions": ["Variante 1", "Variante 2"]
   }`;

  const userPayload = {
    titre_actuel: title || "",
    description_actuelle: description || "",
    marque: brand || "Non spécifiée",
    etat: condition || "Non spécifié",
    couleurs: colors || "Non spécifiées",
    matiere: material || "Non spécifiée",
    taille: size || "Non spécifiée",
    prix: price || "Non spécifié",
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cleanKey}`,
    },
    body: JSON.stringify({
      model: model || OPENAI_DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      temperature: 0.7,
      max_tokens: 900,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    let errorMsg = `Erreur OpenAI (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        errorMsg = errJson.error.message;
      }
    } catch (_) {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("Réponse OpenAI vide");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    throw new Error("Réponse OpenAI malformatée (impossible de parser le JSON).");
  }

  const rawTitles = Array.isArray(parsed.titles) ? parsed.titles : [];
  const rawDescriptions = Array.isArray(parsed.descriptions) ? parsed.descriptions : [];

  const titles = rawTitles
    .map((t) => String(t || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t) => (t.length > 95 ? t.slice(0, 92) + "..." : t));

  const descriptions = rawDescriptions
    .map((d) => String(d || "").trim())
    .filter(Boolean);

  if (!titles.length && !descriptions.length) {
    throw new Error("L'IA n'a retourné aucun titre ou description valide.");
  }

  return {
    titles,
    descriptions,
    model: data.model || model,
    usage: data.usage || null,
  };
}

// Exports pour navigateur et Node.js (tests)
if (typeof window !== "undefined") {
  window.openaiService = {
    OPENAI_DEFAULT_MODEL,
    getOpenAiConfig,
    saveOpenAiConfig,
    testOpenAiApiKey,
    callOpenAiListingReformulation,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    OPENAI_DEFAULT_MODEL,
    getOpenAiConfig,
    saveOpenAiConfig,
    testOpenAiApiKey,
    callOpenAiListingReformulation,
  };
}
