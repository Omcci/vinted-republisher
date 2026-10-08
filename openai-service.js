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

    // Vérification du quota / solde de crédits (1 token)
    try {
      const quotaCheck = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });

      if (!quotaCheck.ok) {
        let quotaMsg = `Erreur OpenAI (${quotaCheck.status})`;
        try {
          const qJson = await quotaCheck.json();
          if (qJson?.error?.message) quotaMsg = qJson.error.message;
        } catch (_) {}

        if (quotaMsg.toLowerCase().includes("credit") || quotaMsg.toLowerCase().includes("billing") || quotaCheck.status === 429) {
          return {
            ok: false,
            error: "Clé valide, mais votre compte OpenAI n'a aucun crédit disponible (solde à 0 $). Vous devez ajouter 5 $ sur platform.openai.com/settings/organization/billing pour activer l'API.",
          };
        }
        return { ok: false, error: quotaMsg };
      }
    } catch (_) {}

    return { ok: true, message: "Connexion réussie ! Clé API valide et solde de crédits opérationnel." };
  } catch (err) {
    return { ok: false, error: err.message || "Impossible de contacter l'API OpenAI (vérifiez votre connexion)." };
  }

}

/**
 * Nettoie le texte pour Vinted :
 * - Supprime TOUT markdown (gras, italique, code, titres) car Vinted affiche du texte brut sans mise en forme.
 * - Supprime TOUS les émojis (pour un rendu sobre, naturel et humain).
 * - Normalise les listes avec des tirets standards "- ".
 * @param {string} text
 * @returns {string}
 */
function sanitizeVintedText(text) {
  if (!text) return "";
  let clean = String(text)
    // Supprime gras et italique markdown (**texte** -> texte, *texte* -> texte, __texte__ -> texte, _texte_ -> texte)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    // Supprime tous les emojis (unicode symboles, pictogrammes, emoticons)
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu, "")
    // Nettoie les espaces en début et fin de chaque ligne (notamment après suppression des émojis)
    .replace(/^[ \t]+/gm, "")
    .replace(/[ \t]+$/gm, "")
    // Normalise les puces (•, ▪, *, ⁃, ►) en tiret standard "- "
    .replace(/^[ \t]*[•▪*⁃►▸][ \t]*/gm, "- ")
    // Si des puces sont collées sur la même ligne (ex: "intro - Marque : ... - Taille : ..."), force un saut de ligne
    .replace(/([^\n])\s+-\s+/g, "$1\n- ")
    // S'assure d'un saut de ligne double entre l'introduction et la première puce
    .replace(/^([^-]+?)\n-\s+/m, "$1\n\n- ")
    // S'assure d'un saut de ligne double entre la dernière puce et la conclusion
    .replace(/(\n-[^\n]+?\.)\s+([A-ZÀ-Ÿ][^\n-]*?(?:envoi|expédition|envoie|n'hésitez|n'hesitez|remise|disponible|colis)[^\n]*)/gi, "$1\n\n$2")
    // S'assure d'un saut de ligne avant les formules de politesse de fin
    .replace(/([^\n]+?\.)\s+(N'hésitez|N'hesitez|Si vous avez)/gi, "$1\n$2")
    // Nettoie les espaces en fin de ligne résiduels
    .replace(/[ \t]+$/gm, "")
    // Réduit les sauts de ligne multiples (> 2) à un double saut de ligne
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return clean;

}

/**
 * Reformule le titre et la description via OpenAI Chat Completions.
 * Génère des variations sobres, fidèles et naturelles sans markdown ni émojis.
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

  const systemPrompt = `Tu es un assistant spécialisé dans la reformulation sobre et directe d'annonces d'occasion sur Vinted.
Ta mission est de reformuler le titre et la description pour briser l'empreinte de doublon (anti-doublon Vinted) tout en restant 100% fidèle à l'annonce originale.

RÈGLES STRICTES ET NON NÉGOCIABLES :
1. AUCUN MARKDOWN : Vinted n'interprète PAS le Markdown. Il affiche les astérisques en clair, ce qui est laid et non professionnel.
   - INTERDICTION ABSOLUE d'utiliser du gras (**mot**), de l'italique (*mot* ou _mot_) ou des titres (#).
   - Rédige EXCLUSIVEMENT en texte brut. Pour les listes, utilise UNIQUEMENT le tiret standard : "- ".
2. AUCUN ÉMOJI :
   - INTERDICTION ABSOLUE d'inclure des émojis (aucun colis, aucune étoile, aucune étincelle, aucun cœur, etc.). Texte pur uniquement.
3. AUCUN SUPERLATIF NI TON PUBLICITAIRE :
   - INTERDICTION ABSOLUE d'employer des phrases de vente ("Offrez-vous...", "pièce d'exception", "look chic et décontracté", "pour un confort optimal", "superbe", "magnifique", "craquez pour").
   - Adopte un ton sobre, neutre, simple et factuel, exactement comme un particulier qui revend simplement un article de son dressing.
4. FIDÉLITÉ STRICTE AUX FAITS DE L'ANNONCE ORIGINALE :
   - Ne JAMAIS rien inventer.
   - Conserve scrupuleusement les défauts ou particularités signalés dans la description originale (par exemple : légère trace d'usure, décoloration sous semelle, vendu avec dustbag, etc.).
5. TITRE (2 ou 3 variantes) :
   - Court, naturel et optimisé pour la barre de recherche Vinted (maximum 85 caractères).
   - Mentionne la marque, le modèle/type d'article et la couleur ou taille si pertinent.
6. DESCRIPTION (2 variantes) :
   - SAUTS DE LIGNE OBLIGATOIRES DANS LE TEXTE :
     Chaque tiret "- " DOIT être sur sa propre ligne avec un saut de ligne réel (\\n).
     Sépare l'introduction, la liste de puces et la conclusion par un double saut de ligne (\\n\\n).
   - Structure type :
     1 courte phrase d'introduction sobre et factuelle (ex: "Je vends ces baskets Gucci en taille 38.").
     \\n\\n
     - Marque : ...\\n
     - Taille : ...\\n
     - État : ...\\n
     - Couleur : ...\\n
     - Matière : ...\\n
     - Détails : (mentionner les défauts réels ou accessoires inclus signalés dans l'annonce)\\n
     \\n\\n
     Envoi rapide sous 24h à 48h dans un emballage soigné.\\n
     N'hésitez pas si vous avez des questions.
7. FORMAT DE RÉPONSE STRICTEMENT JSON :
   {
     "titles": ["Variante 1", "Variante 2"],
     "descriptions": ["Variante 1\\n\\n- Marque : ...\\n- Taille : ...", "Variante 2"]
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
      temperature: 0.5,
      max_tokens: 800,
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
    .map((t) => sanitizeVintedText(t).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t) => (t.length > 95 ? t.slice(0, 92) + "..." : t));

  const descriptions = rawDescriptions
    .map((d) => sanitizeVintedText(d))
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
