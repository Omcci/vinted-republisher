/**
 * test-openai-service.js - Tests unitaires pour openai-service.js
 */

const assert = require("assert");
const {
  OPENAI_DEFAULT_MODEL,
  testOpenAiApiKey,
  callOpenAiListingReformulation,
  encryptSecretString,
  decryptSecretString,
  getOpenAiConfig,
  saveOpenAiConfig,
} = require("../openai-service.js");

async function runTests() {
  console.log("=== Test 1: Configuration par défaut ===");
  assert.strictEqual(OPENAI_DEFAULT_MODEL, "gpt-4o-mini");
  console.log("✓ Modèle par défaut = gpt-4o-mini");

  console.log("\n=== Test 2: Validation locale des clés API ===");
  const emptyRes = await testOpenAiApiKey("");
  assert.strictEqual(emptyRes.ok, false);
  assert(emptyRes.error.includes("renseigner"));

  const invalidFormatRes = await testOpenAiApiKey("invalid-key-format");
  assert.strictEqual(invalidFormatRes.ok, false);
  assert(invalidFormatRes.error.includes("sk-"));
  console.log("✓ Validation format de clé OK (rejet des clés invalides avant requête HTTP)");

  console.log("\n=== Test 3: Simulation de reformulation OpenAI (Mock) ===");
  const originalFetch = global.fetch;

  // Mock fetch réussie
  global.fetch = async (url, options) => {
    assert(url.includes("api.openai.com/v1/chat/completions"));
    assert(options.headers.Authorization === "Bearer sk-test-key-mock");

    const parsedBody = JSON.parse(options.body);
    assert.strictEqual(parsedBody.model, "gpt-4o-mini");
    assert.strictEqual(parsedBody.response_format?.type, "json_object");

    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: "gpt-4o-mini",
        usage: { prompt_tokens: 120, completion_tokens: 85, total_tokens: 205 },
        choices: [
          {
            message: {
              content: JSON.stringify({
                titles: [
                  "✨ **Peluche Chien Shiba Inu** Mameshiba Japon Amuse",
                  "Mameshiba Sankyodai Chien Peluche Import Japon"
                ],
                descriptions: [
                  "✨ Superbe peluche Mameshiba importée du Japon.\n\n- **État** : Neuf sans étiquette\n- **Marque** : Amuse\n\n📦 Expédition soignée sous 24h.",
                  "Je vends ces baskets Gucci GG low en taille 38. - Marque : Gucci - Taille : 38 - État : Bon état - Couleur : Rose - Matière : Cuir, Coton - Détails : Décoloration sous la semelle visible sur les photos, vendu avec dust bag. Envoi rapide sous 24h à 48h dans un emballage soigné. N'hésitez pas si vous avez des questions."
                ]
              }),
            },
          },
        ],
      }),
    };
  };


  try {
    const outcome = await callOpenAiListingReformulation({
      apiKey: "sk-test-key-mock",
      model: "gpt-4o-mini",
      title: "Peluche Chien Shiba Inu Endormi Mameshiba Sankyodai Amuse - Import Japon",
      description: "Peluche en parfait état, très douce, import direct Japon.",
      item: {
        brand: "Amuse japan",
        condition: "Neuf sans étiquette",
        price: "12.00",
      },
    });

    assert(Array.isArray(outcome.titles));
    assert.strictEqual(outcome.titles.length, 2);
    // Vérification : aucun markdown ** ni émoji dans le titre
    assert(!outcome.titles[0].includes("**"), "Le titre ne doit pas contenir de markdown **");
    assert(!outcome.titles[0].includes("✨"), "Le titre ne doit pas contenir d'émoji ✨");
    assert(outcome.titles[0].includes("Peluche Chien Shiba Inu"));

    assert(Array.isArray(outcome.descriptions));
    assert.strictEqual(outcome.descriptions.length, 2);
    // Vérification : aucun markdown ** ni émoji dans la description
    assert(!outcome.descriptions[0].includes("**"), "La description ne doit pas contenir de markdown **");
    assert(!outcome.descriptions[0].includes("📦"), "La description ne doit pas contenir d'émoji 📦");
    assert(!outcome.descriptions[0].includes("✨"), "La description ne doit pas contenir d'émoji ✨");
    assert(outcome.descriptions[0].includes("- État : Neuf sans étiquette"));
    console.log("✓ Nettoyage anti-markdown et anti-émoji validé avec succès (aucun astérisque, aucun émoji).");
    console.log("  - Titres nettoyés :", outcome.titles);
    console.log("  - Description 1 nettoyée :\n", outcome.descriptions[0]);
    console.log("  - Description 2 nettoyée (Gucci collapsed string) :\n" + outcome.descriptions[1]);
    assert(outcome.descriptions[1].includes("\n- Marque : Gucci"));
    assert(outcome.descriptions[1].includes("\n- Taille : 38"));
    assert(outcome.descriptions[1].includes("\n\nEnvoi rapide"));
  } finally {

    global.fetch = originalFetch;
  }


  console.log("\n=== Test 4: Gestion d'erreur OpenAI (Mock HTTP 401) ===");
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      error: { message: "Incorrect API key provided" }
    }),
  });

  try {
    let threw = false;
    try {
      await callOpenAiListingReformulation({
        apiKey: "sk-bad-key",
        title: "Test",
        description: "Test",
      });
    } catch (e) {
      threw = true;
      assert(e.message.includes("Incorrect API key"));
      console.log("✓ Exception levée correctement :", e.message);
    }
    assert(threw, "L'erreur aurait dû être levée");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("\n=== Test 5: Chiffrement et Déchiffrement AES-GCM 256 bits ===");
  const testSecret = "sk-proj-superSecretTestKey1234567890abcdef";
  const encrypted = await encryptSecretString(testSecret);
  assert(encrypted.startsWith("enc:v1:"), "Le payload chiffré doit débuter par 'enc:v1:'");
  assert(!encrypted.includes("sk-"), "Le payload chiffré ne doit JAMAIS contenir la clé en clair ou 'sk-'");
  console.log("✓ Format chiffré sécurisé opaque :", encrypted.slice(0, 36) + "...");

  const decrypted = await decryptSecretString(encrypted);
  assert.strictEqual(decrypted, testSecret, "Le déchiffrement doit restituer la clé d'origine exacte");
  console.log("✓ Déchiffrement réussi et intègre :", decrypted);

  console.log("\n=== Test 6: Migration transparente et persistance chiffrée ===");
  // Simule l'environnement chrome.storage.local
  const mockStorage = {
    vinted_openai_api_key: "sk-proj-legacyUnencryptedKey999",
    vinted_openai_model: "gpt-4o-mini",
    vinted_openai_enabled: true,
  };
  global.chrome = {
    runtime: { id: "test-extension-id" },
    storage: {
      local: {
        get: async (keys) => {
          const res = {};
          for (const k of (Array.isArray(keys) ? keys : [keys])) {
            if (k in mockStorage) res[k] = mockStorage[k];
          }
          return res;
        },
        set: async (items) => {
          Object.assign(mockStorage, items);
        },
      },
    },
  };

  // Lecture de la config : doit détecter la clé legacy, la migrer et la renvoyer en mémoire
  const cfg = await getOpenAiConfig();
  assert.strictEqual(cfg.apiKey, "sk-proj-legacyUnencryptedKey999", "La clé déchiffrée en mémoire doit être fidèle");
  assert(mockStorage.vinted_openai_api_key.startsWith("enc:v1:"), "Le stockage local DOIT avoir été migré vers le format chiffré enc:v1:");
  assert(!mockStorage.vinted_openai_api_key.includes("sk-"), "Le stockage local ne doit PLUS JAMAIS contenir sk- en clair");
  console.log("✓ Migration automatique de la clé legacy vers AES-GCM réussie !");

  // Nouvelle sauvegarde via saveOpenAiConfig
  await saveOpenAiConfig({ apiKey: "sk-proj-newKey888" });
  assert(mockStorage.vinted_openai_api_key.startsWith("enc:v1:"), "saveOpenAiConfig doit chiffrer la nouvelle clé");
  assert(!mockStorage.vinted_openai_api_key.includes("sk-"), "La nouvelle clé ne doit pas être stockée en clair");

  const cfgAfterSave = await getOpenAiConfig();
  assert.strictEqual(cfgAfterSave.apiKey, "sk-proj-newKey888", "Relecture immédiate de la nouvelle clé chiffrée réussie");
  console.log("✓ Enregistrement et lecture chiffrée AES-GCM validés sans faille.");

  console.log("\n🎉 TOUS LES TESTS DU SERVICE OPENAI SONT VALIDES !");
}

runTests().catch((err) => {
  console.error("❌ Échec test:", err);
  process.exit(1);
});
